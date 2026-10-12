import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { LanguageClient, type Range } from 'vscode-languageclient/node';
import {
    createDiagnostic,
    LSP_PACKAGE_VERSION,
    sfmcLanguageService,
    type DiagnosticVariant,
} from '../../../server/node_modules/sfmc-language-lsp';

// Constructing a client creates its production converters; no server is started
// and no substitute transport or patched converter is involved in these tests.
const client = new LanguageClient(
    'diagnostic-roundtrip',
    'Diagnostic roundtrip',
    { command: process.execPath },
    { documentSelector: [] }
);
const protocolConverter = client.protocol2CodeConverter;
const codeConverter = client.code2ProtocolConverter;

/**
 * Read a published envelope without using a foreign ProtocolDiagnostic class.
 * The bundle owns a separate languageclient copy: its instanceof check cannot
 * match this test's imported converter. Real action requests still go through
 * executeCodeActionProvider and the bundle's own production converters.
 * @param diagnostic - Actual diagnostic retained by the extension host.
 * @returns Protocol fields and the actual published data, for assertions only.
 */
function publishedProtocol(diagnostic: vscode.Diagnostic) {
    const data = (
        diagnostic as vscode.Diagnostic & {
            data?: ReturnType<typeof codeConverter.asDiagnostic>['data'];
        }
    ).data;
    return { ...codeConverter.asDiagnostic(diagnostic), data };
}

/**
 * Exercise the installed languageclient converters in the real extension host.
 * Synthetic emissions isolate the contract from validators being migrated separately.
 * @param content - Initial editor text.
 * @param language - Shared service language.
 * @param variant - Unambiguous internal fix identity.
 * @param range - Exact range of the offending token.
 * @param payload - Original primitive or object payload.
 * @param title - Expected action title.
 * @param edits - Exact expected protocol edits.
 * @param expected - Complete editor text after applying the workspace edit.
 */
async function roundtrip(
    content: string,
    language: 'ampscript' | 'ssjs',
    variant: DiagnosticVariant,
    range: Range,
    payload: unknown,
    title: string,
    edits: { range: Range; newText: string }[],
    expected: string
): Promise<void> {
    const document = await vscode.workspace.openTextDocument({ content, language: 'plaintext' });
    const uri = document.uri.toString();
    const diagnostic = createDiagnostic(variant, {
        range,
        message: 'Converter contract fixture',
        source: language,
        severity: 2,
        data: payload,
    });
    const editorDiagnostic = protocolConverter.asDiagnostic(diagnostic);
    const linkedCode = editorDiagnostic.code;
    assert.ok(linkedCode && typeof linkedCode === 'object', 'Editor code must be clickable');
    assert.strictEqual(linkedCode.value, diagnostic.code);
    assert.strictEqual(linkedCode.target.toString(), diagnostic.codeDescription?.href);
    assert.ok(
        linkedCode.target
            .toString()
            .startsWith(
                `https://github.com/JoernBerkefeld/sfmc-language-lsp/blob/v${LSP_PACKAGE_VERSION}/`
            ),
        'Shared links must retain the LSP owner and version, not the extension version'
    );

    // Use the converter called by languageclient's code-action feature, not a
    // hand-built diagnostic copy (which would lose ProtocolDiagnostic.data).
    const context = await codeConverter.asCodeActionContext({
        diagnostics: [editorDiagnostic],
        triggerKind: vscode.CodeActionTriggerKind.Invoke,
        only: vscode.CodeActionKind.QuickFix,
    });
    const returned = context.diagnostics[0];
    assert.strictEqual(returned.code, diagnostic.code);
    assert.deepStrictEqual(returned.codeDescription, diagnostic.codeDescription);
    assert.deepStrictEqual(returned.range, range);
    assert.deepStrictEqual(returned.data, { sfmc: { variant, payload } });

    const actions = sfmcLanguageService.getCodeActions(
        { text: content, languageId: language, uri },
        context.diagnostics
    );
    const action = actions.find((candidate) => candidate.title === title);
    assert.ok(action, `Missing exact quick fix: ${title}`);
    assert.deepStrictEqual(action.edit?.changes, { [uri]: edits });
    assert.deepStrictEqual(action.diagnostics?.[0].data, returned.data);
    const editorAction = await protocolConverter.asCodeAction(action);
    assert.ok(editorAction.edit);
    assert.strictEqual(await vscode.workspace.applyEdit(editorAction.edit), true);
    assert.strictEqual(document.getText(), expected, 'The real editor must receive the exact edit');
}

/**
 * Wait for a real server publication carrying the requested internal variant.
 * @param document - Editor document synchronized with the server.
 * @param variant - Expected diagnostic variant.
 * @returns The published editor diagnostic.
 */
async function publishedDiagnostic(
    document: vscode.TextDocument,
    variant: DiagnosticVariant | number
): Promise<vscode.Diagnostic> {
    for (let attempt = 0; attempt < 100; attempt++) {
        for (const diagnostic of vscode.languages.getDiagnostics(document.uri)) {
            const converted = publishedProtocol(diagnostic);
            if (
                typeof variant === 'number'
                    ? converted.source === 'sfmc-ts' && converted.code === variant
                    : converted.data?.sfmc?.variant === variant
            )
                return diagnostic;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    assert.fail(
        `No published ${variant}: ${JSON.stringify(vscode.languages.getDiagnostics(document.uri))}`
    );
}

suite('Linked diagnostic publication and server actions', () => {
    suiteSetup(async () => {
        await vscode.extensions.getExtension('joernberkefeld.sfmc-language')!.activate();
    });

    for (const embedded of [false, true]) {
        for (const polyfill of [false, true]) {
            test(`${embedded ? 'Embedded' : 'Standalone'} SSJS ${polyfill ? 'polyfill' : 'replacement'} survives publication and exact editor edit`, async () => {
                const prefix = embedded
                    ? '<p>Before</p>\n<script runat="server">var first = 1;</script>\n<script runat="server">'
                    : '';
                const suffix = embedded ? '</script>\n<p>After</p>' : '';
                const body = polyfill
                    ? '\n/* global Platform */\nvar x = [].filter(callback);\n'
                    : '\nvar x = JSON.parse(input);\n';
                const content = prefix + body + suffix;
                const document = await vscode.workspace.openTextDocument({
                    content,
                    language: embedded ? 'sfmc' : 'ssjs',
                });
                await vscode.window.showTextDocument(document);
                const variant = polyfill
                    ? 'ssjs/polyfill-required'
                    : 'ssjs/replace-with-platform-function';
                const diagnostic = await publishedDiagnostic(document, variant);
                const protocol = publishedProtocol(diagnostic);
                assert.ok(diagnostic.code && typeof diagnostic.code === 'object');
                assert.strictEqual(diagnostic.code.value, 'sfmc/ssjs-no-unavailable-method');
                assert.strictEqual(
                    diagnostic.code.target.toString(),
                    protocol.codeDescription?.href
                );
                assert.ok(
                    protocol.codeDescription?.href.includes(`/blob/v${LSP_PACKAGE_VERSION}/`)
                );
                const payload = protocol.data.sfmc.payload;
                assert.strictEqual(typeof payload, 'object');
                const title = polyfill
                    ? 'Insert polyfill for Array.prototype.filter'
                    : 'Replace JSON.parse with Platform.Function.ParseJSON';
                const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
                    'vscode.executeCodeActionProvider',
                    document.uri,
                    diagnostic.range,
                    vscode.CodeActionKind.QuickFix.value
                );
                const action = actions?.find((candidate) => candidate.title === title);
                assert.ok(action?.edit, `Missing published quick fix: ${title}`);
                // executeCodeActionProvider omits action diagnostics; the synthetic
                // converter tests above separately assert their lossless conversion.
                const edits = action.edit.get(document.uri);
                const start = polyfill
                    ? document.positionAt(prefix.length + body.indexOf('var x'))
                    : diagnostic.range.start;
                const end = polyfill ? start : diagnostic.range.end;
                const newText = polyfill
                    ? `${payload.polyfill.trimEnd()}\n\n`
                    : 'Platform.Function.ParseJSON';
                assert.deepStrictEqual(
                    edits.map((edit) => ({ range: edit.range, newText: edit.newText })),
                    [{ range: new vscode.Range(start, end), newText }]
                );
                const expected =
                    content.slice(0, document.offsetAt(start)) +
                    newText +
                    content.slice(document.offsetAt(end));
                assert.strictEqual(await vscode.workspace.applyEdit(action.edit), true);
                assert.strictEqual(document.getText(), expected);
            });
        }
    }

    test('AMPscript published delimiter payload removes the exact paired delimiters', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: '%%[\n%%[ x ]%%\n]%%',
            language: 'ampscript',
        });
        await vscode.window.showTextDocument(document);
        const diagnostic = await publishedDiagnostic(document, 'ampscript/nested-delimiter');
        assert.strictEqual(publishedProtocol(diagnostic).data.sfmc.payload, '%%[');
        const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
            'vscode.executeCodeActionProvider',
            document.uri,
            diagnostic.range,
            vscode.CodeActionKind.QuickFix.value
        );
        const action = actions?.find(
            (candidate) => candidate.title === 'Remove %%[...]%% delimiter pair'
        );
        assert.ok(action?.edit);
        assert.deepStrictEqual(
            action.edit
                .get(document.uri)
                .map((edit) => ({ range: edit.range, newText: edit.newText })),
            [
                { range: new vscode.Range(1, 6, 1, 9), newText: '' },
                { range: new vscode.Range(1, 0, 1, 3), newText: '' },
            ]
        );
        assert.strictEqual(await vscode.workspace.applyEdit(action.edit), true);
        assert.strictEqual(document.getText(), '%%[\n x \n]%%');
    });

    for (const [language, content, variant] of [
        ['sfmc', '<p>Before</p>%%[\n// source\n]%%', 'ampscript/js-line-comment'],
        ['handlebars', '{{unknownDocumentationHelper customer}}', 'handlebars/unknown-helper'],
    ] as const) {
        test(`${language} publication retains the exact shared documentation link`, async () => {
            const document = await vscode.workspace.openTextDocument({ content, language });
            await vscode.window.showTextDocument(document);
            const diagnostic = await publishedDiagnostic(document, variant);
            const expected = sfmcLanguageService
                .validate(
                    { text: content, languageId: 'ampscript', uri: document.uri.toString() },
                    {
                        maxNumberOfProblems: 100,
                        targetPlatform: language === 'handlebars' ? 'next' : 'engagement',
                    }
                )
                .find(
                    (candidate) =>
                        codeConverter.asDiagnostic(protocolConverter.asDiagnostic(candidate)).data
                            ?.sfmc?.variant === variant
                );
            assert.ok(expected?.codeDescription);
            assert.ok(diagnostic.code && typeof diagnostic.code === 'object');
            assert.strictEqual(diagnostic.code.value, expected.code);
            assert.strictEqual(diagnostic.code.target.toString(), expected.codeDescription.href);
            assert.ok(
                expected.codeDescription.href.startsWith(
                    `https://github.com/JoernBerkefeld/sfmc-language-lsp/blob/v${LSP_PACKAGE_VERSION}/`
                )
            );
        });
    }

    for (const [code, content, anchor] of [
        [2304, 'var result = missingDocumentationVariable;', 'ts2304'],
        [1005, 'var result = (1;', 'other-diagnostics'],
    ] as const) {
        test(`Published TS${code} keeps numeric linked code and extension-owned route`, async () => {
            const document = await vscode.workspace.openTextDocument({ content, language: 'ssjs' });
            await vscode.window.showTextDocument(document);
            const diagnostic = await publishedDiagnostic(document, code);
            const version = vscode.extensions.getExtension('joernberkefeld.sfmc-language')!
                .packageJSON.version as string;
            assert.ok(diagnostic.code && typeof diagnostic.code === 'object');
            assert.strictEqual(diagnostic.code.value, code);
            assert.strictEqual(
                diagnostic.code.target.toString(),
                `https://github.com/JoernBerkefeld/vscode-sfmc-language/blob/v${version}/docs/diagnostics/typescript.md#${anchor}`
            );
            const converted = publishedProtocol(diagnostic);
            assert.strictEqual(converted.code, code);
            assert.strictEqual(converted.codeDescription?.href, diagnostic.code.target.toString());
        });
    }

    for (const helper of [false, true]) {
        test(`Same-line second script ${helper ? 'helper' : 'polyfill'} insertion stays inside its region`, async () => {
            const prefix =
                '<p>Before</p><script runat="server">var first = 1;</script><script runat="server">';
            const body = helper
                ? 'var req = new Script.Util.HttpRequest("https://example.com"); var resp = req.send(); var value = resp.headers["Content-Type"];'
                : 'var x = [].filter(callback);';
            const suffix = '</script><p>After</p>';
            const content = prefix + body + suffix;
            const document = await vscode.workspace.openTextDocument({ content, language: 'sfmc' });
            const editor = await vscode.window.showTextDocument(document);
            // A single-line untitled Windows buffer otherwise defaults to CRLF.
            // Set its EOL explicitly rather than normalizing the resulting edit.
            assert.strictEqual(
                await editor.edit((builder) => builder.setEndOfLine(vscode.EndOfLine.LF)),
                true
            );
            const variant = helper ? 'ssjs/clr-header-access' : 'ssjs/polyfill-required';
            const diagnostic = await publishedDiagnostic(document, variant);
            const protocol = publishedProtocol(diagnostic);
            const localDiagnostic = {
                ...protocol,
                range: {
                    start: { line: 0, character: protocol.range.start.character - prefix.length },
                    end: { line: 0, character: protocol.range.end.character - prefix.length },
                },
            };
            const localAction = sfmcLanguageService.getCodeActions(
                { text: body, languageId: 'ssjs', uri: document.uri.toString() },
                [localDiagnostic]
            )[0];
            assert.ok(localAction?.edit?.changes);
            const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
                'vscode.executeCodeActionProvider',
                document.uri,
                diagnostic.range,
                vscode.CodeActionKind.QuickFix.value
            );
            const action = actions?.find((candidate) => candidate.title === localAction.title);
            assert.ok(action?.edit);
            const expectedEdits = localAction.edit.changes[document.uri.toString()].map((edit) => ({
                range: new vscode.Range(
                    0,
                    prefix.length + edit.range.start.character,
                    0,
                    prefix.length + edit.range.end.character
                ),
                newText: edit.newText,
            }));
            assert.deepStrictEqual(
                action.edit
                    .get(document.uri)
                    .map((edit) => ({ range: edit.range, newText: edit.newText })),
                expectedEdits
            );
            assert.ok(
                expectedEdits.some(
                    (edit) => edit.range.isEmpty && edit.range.start.character === prefix.length
                )
            );
            let expected = content;
            const descendingEdits = expectedEdits.toSorted(
                (a, b) => b.range.start.character - a.range.start.character
            );
            for (const edit of descendingEdits) {
                expected =
                    expected.slice(0, edit.range.start.character) +
                    edit.newText +
                    expected.slice(edit.range.end.character);
            }
            assert.strictEqual(await vscode.workspace.applyEdit(action.edit), true);
            assert.strictEqual(document.getText(), expected);
            assert.ok(document.getText().startsWith(prefix));
            assert.ok(document.getText().endsWith(suffix));
        });
    }

    test('AMPscript published primitive comment payload produces exact edit', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: '%%[\n// source\n]%%',
            language: 'ampscript',
        });
        await vscode.window.showTextDocument(document);
        const diagnostic = await publishedDiagnostic(document, 'ampscript/js-line-comment');
        const protocol = publishedProtocol(diagnostic);
        assert.strictEqual(protocol.data.sfmc.payload, 'source');
        assert.ok(diagnostic.code && typeof diagnostic.code === 'object');
        assert.strictEqual(diagnostic.code.target.toString(), protocol.codeDescription?.href);
        const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
            'vscode.executeCodeActionProvider',
            document.uri,
            diagnostic.range,
            vscode.CodeActionKind.QuickFix.value
        );
        const action = actions?.find(
            (candidate) => candidate.title === 'Convert to AMPscript block comment'
        );
        assert.ok(action?.edit);
        assert.deepStrictEqual(
            action.edit.get(document.uri).map((edit) => edit.newText),
            ['/* source */']
        );
        assert.strictEqual(await vscode.workspace.applyEdit(action.edit), true);
        assert.strictEqual(document.getText(), '%%[\n/* source */\n]%%');
    });
});

suite('Linked diagnostic converter roundtrip — synthetic contract', () => {
    test('AMPscript primitive comment payload survives linked code and editor edit', async () => {
        const range = { start: { line: 1, character: 0 }, end: { line: 1, character: 9 } };
        await roundtrip(
            '%%[\n// source\n]%%',
            'ampscript',
            'ampscript/js-line-comment',
            range,
            'preserved payload',
            'Convert to AMPscript block comment',
            [{ range, newText: '/* preserved payload */' }],
            '%%[\n/* preserved payload */\n]%%'
        );
    });

    test('AMPscript primitive delimiter payload preserves the paired deletion', async () => {
        const range = { start: { line: 1, character: 0 }, end: { line: 1, character: 3 } };
        await roundtrip(
            '%%[\n%%[ x ]%%\n]%%',
            'ampscript',
            'ampscript/nested-delimiter',
            range,
            '%%[',
            'Remove %%[...]%% delimiter pair',
            [
                {
                    range: { start: { line: 1, character: 6 }, end: { line: 1, character: 9 } },
                    newText: '',
                },
                { range, newText: '' },
            ],
            '%%[\n x \n]%%'
        );
    });

    test('SSJS replacement object retains the variant of a shared public rule', async () => {
        const range = { start: { line: 0, character: 8 }, end: { line: 0, character: 18 } };
        await roundtrip(
            'var x = JSON.parse("{}");',
            'ssjs',
            'ssjs/replace-with-platform-function',
            range,
            { owner: 'JSON', member: 'parse', replacement: 'Platform.Function.ParseJSON' },
            'Replace JSON.parse with Platform.Function.ParseJSON',
            [{ range, newText: 'Platform.Function.ParseJSON' }],
            'var x = Platform.Function.ParseJSON("{}");'
        );
    });

    test('SSJS polyfill object inserts after the directive instead of replacing a member', async () => {
        const range = { start: { line: 1, character: 8 }, end: { line: 1, character: 16 } };
        // Opaque fixture source tests transport, not SFMC runtime compatibility.
        const polyfill = '/* converter polyfill fixture */\n';
        const insertAt = { line: 1, character: 0 };
        await roundtrip(
            '/* global Platform */\nvar x = [].filter(callback);',
            'ssjs',
            'ssjs/polyfill-required',
            range,
            { owner: 'Array', method: 'filter', polyfill },
            'Insert polyfill for Array.filter',
            [{ range: { start: insertAt, end: insertAt }, newText: `${polyfill.trimEnd()}\n\n` }],
            '/* global Platform */\n/* converter polyfill fixture */\n\nvar x = [].filter(callback);'
        );
    });
});
