import * as assert from 'node:assert';
import * as vscode from 'vscode';

/**
 * Wait for asynchronous language-server updates to reach the extension host.
 * @returns A settled request queue.
 */
function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 4000));
}

/**
 * Replace an unsaved document without modifying fixture files.
 * @param document - Open document.
 * @param text - Full mixed content.
 */
async function replace(document: vscode.TextDocument, text: string): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    const end = document.positionAt(document.getText().length);
    edit.replace(document.uri, new vscode.Range(document.positionAt(0), end), text);
    assert.ok(await vscode.workspace.applyEdit(edit));
    await settle();
}

suite('Browser JavaScript routing', () => {
    for (const language of ['ampscript', 'sfmc']) {
        test(`${language}: browser features stay isolated from SSJS and templates`, async () => {
            await vscode.extensions.getExtension('joernberkefeld.sfmc-language')!.activate();
            const text = [
                '<!-- 😀 UTF-16 prefix -->',
                '<script>',
                'function browserLocal(value) { return value; }',
                'document.querySelector("body");',
                'browserLocal("hello");',
                "const message = \"%%=Concat('a','b')=%%\";",
                '</script>',
                '<script>browserLocal("shared");</script>',
                '<script type="module">const moduleOnly = 1;</script>',
                '<SCRIPT RUNAT=server>',
                'var serverOnly = Platform.Function.GUID();',
                'var parsed = JSON.parse(input);',
                '</SCRIPT >',
                '<p>%%=Concat("a", "b")=%%</p>',
            ].join('\n');
            const document = await vscode.workspace.openTextDocument({ language, content: text });
            await vscode.window.showTextDocument(document);
            await settle();
            const at = (needle: string, delta = 0): vscode.Position =>
                document.positionAt(text.indexOf(needle) + delta);
            const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
                'vscode.executeCompletionItemProvider',
                document.uri,
                at('document.', 'document.'.length)
            );
            const labels = new Set(
                completions!.items.map((item) =>
                    typeof item.label === 'string' ? item.label : item.label.label
                )
            );
            assert.ok(labels.has('querySelector'));
            assert.ok(!labels.has('Lookup'));
            const hover = await vscode.commands.executeCommand<vscode.Hover[]>(
                'vscode.executeHoverProvider',
                document.uri,
                at('querySelector', 2)
            );
            assert.ok(
                hover?.some((item) =>
                    item.contents.some((content) =>
                        typeof content === 'string'
                            ? content.includes('querySelector')
                            : 'value' in content && content.value.includes('querySelector')
                    )
                )
            );
            const signature = await vscode.commands.executeCommand<vscode.SignatureHelp>(
                'vscode.executeSignatureHelpProvider',
                document.uri,
                at('browserLocal("hello', 14)
            );
            assert.ok(signature?.signatures.some((item) => item.label.includes('browserLocal')));
            const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeDefinitionProvider',
                document.uri,
                at('browserLocal("shared', 3)
            );
            assert.ok(
                definitions?.some(
                    (item) =>
                        item.uri.toString() === document.uri.toString() &&
                        item.range.start.line === 2
                )
            );
            const references = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeReferenceProvider',
                document.uri,
                at('browserLocal(value', 3)
            );
            assert.ok(references?.some((item) => item.range.start.line === 7));
            const serverCompletions = await vscode.commands.executeCommand<vscode.CompletionList>(
                'vscode.executeCompletionItemProvider',
                document.uri,
                at('Platform.Function.', 'Platform.Function.'.length)
            );
            assert.ok(serverCompletions?.items.some((item) => item.label === 'GUID'));
            const templateHover = await vscode.commands.executeCommand<vscode.Hover[]>(
                'vscode.executeHoverProvider',
                document.uri,
                at('Concat', 2)
            );
            assert.ok(templateHover?.length);
            const diagnostics = vscode.languages.getDiagnostics(document.uri);
            assert.ok(
                diagnostics.some((item) => item.source === 'ssjs' && item.range.start.line === 11),
                JSON.stringify(diagnostics)
            );
            assert.ok(
                diagnostics.every(
                    (item) =>
                        !(
                            item.range.start.line < 9 &&
                            (item.source === 'ssjs' || item.source === 'sfmc-ts')
                        )
                )
            );

            await replace(document, '<script>const broken = ;</script>');
            const browserDiagnostics = vscode.languages.getDiagnostics(document.uri);
            assert.strictEqual(browserDiagnostics.length, 1);
            const browserDiagnostic = browserDiagnostics[0];
            assert.strictEqual(browserDiagnostic.source, 'javascript');
            assert.strictEqual(browserDiagnostic.message, 'Expression expected.');
            assert.ok(browserDiagnostic.range.isEqual(new vscode.Range(0, 23, 0, 24)));
            assert.strictEqual(browserDiagnostic.severity, vscode.DiagnosticSeverity.Error);
            assert.strictEqual(browserDiagnostic.code, undefined);
            assert.strictEqual('codeDescription' in browserDiagnostic, false);
            await replace(document, '<script>document.querySelector("body");</script>');
            assert.ok(
                vscode.languages
                    .getDiagnostics(document.uri)
                    .every((item) => item.source !== 'javascript')
            );
            await replace(document, '<p>%%=Concat("a", "b")=%%</p>');
            assert.ok(
                vscode.languages
                    .getDiagnostics(document.uri)
                    .every((item) => item.source !== 'javascript')
            );
            await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
            await settle();
            assert.strictEqual(vscode.languages.getDiagnostics(document.uri).length, 0);
        });
    }

    for (const [kind, body] of [
        ['quoted', 'const generated = "{!$organization.Address}"; document.title;'],
        ['unquoted', 'const generated = {!$organization.Address}; document.title;'],
        ['incomplete', 'const generated = {!$organization.Address; document.title;'],
    ]) {
        test(`MCN ${kind} binding retains template routing inside browser scripts`, async () => {
            const config = vscode.workspace.getConfiguration('sfmcLanguageServer');
            const previousTarget = config.inspect<string>('targetPlatform')?.workspaceValue;
            await config.update('targetPlatform', 'next', vscode.ConfigurationTarget.Workspace);
            try {
                const text = `<script>${body}</script>`;
                const document = await vscode.workspace.openTextDocument({
                    language: 'sfmc',
                    content: text,
                });
                await vscode.window.showTextDocument(document);
                await settle();
                const at = (needle: string, delta = 0): vscode.Position =>
                    document.positionAt(text.indexOf(needle) + delta);
                const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
                    'vscode.executeCompletionItemProvider',
                    document.uri,
                    at('{!$organization.', '{!$organization.'.length)
                );
                assert.ok(
                    completions?.items.some((item) => item.label === '{!$organization.Address}')
                );
                assert.ok(!completions?.items.some((item) => item.label === 'querySelector'));
                const bindingHover = await vscode.commands.executeCommand<vscode.Hover[]>(
                    'vscode.executeHoverProvider',
                    document.uri,
                    at('organization.Address', 3)
                );
                if (kind !== 'incomplete') assert.ok(bindingHover?.length);
                const browserHover = await vscode.commands.executeCommand<vscode.Hover[]>(
                    'vscode.executeHoverProvider',
                    document.uri,
                    at('document.title', 2)
                );
                if (kind === 'quoted') assert.ok(browserHover?.length);
                else assert.ok(!browserHover?.length);
                assert.ok(
                    vscode.languages
                        .getDiagnostics(document.uri)
                        .every((item) => item.source !== 'javascript')
                );
                await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
            } finally {
                await config.update(
                    'targetPlatform',
                    previousTarget,
                    vscode.ConfigurationTarget.Workspace
                );
            }
        });
    }

    test('dynamic browser code never falls through to AMPscript completion', async () => {
        const document = await vscode.workspace.openTextDocument({
            language: 'ampscript',
            content: '<script>const generated = %%=Concat(1, 2)=%%; document.</script>',
        });
        await vscode.window.showTextDocument(document);
        await settle();
        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            document.uri,
            document.positionAt(document.getText().indexOf('document.') + 'document.'.length)
        );
        // VS Code also contributes static AMPscript snippets independently of LSP.
        assert.ok(!completions?.items.some((item) => item.label === 'querySelector'));
        assert.ok(
            vscode.languages
                .getDiagnostics(document.uri)
                .every((item) => item.source !== 'javascript')
        );
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    });
});
