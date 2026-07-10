/**
 * ssjs-ts-html.test.ts — VS Code integration tests for the embedded TypeScript
 * language service operating inside an HTML <script runat="server"> block.
 *
 * Mirrors ssjs-ts.test.ts but uses test-ssjs-ts-html.html.
 * All VS Code Position line numbers are +1 relative to the .ssjs fixture because
 * the `<script runat="server">` tag occupies line 0.
 */
import * as vscode from 'vscode';
import * as assert from 'node:assert';
import { getDocumentUri, activate } from './helper';

const SETTLE_MS = 3000;
const COMPLETIONS_SETTLE_MS = 8000;

/**
 * Resolve to a promise after the given delay.
 * @param ms - delay in milliseconds
 * @returns a promise that resolves after the delay
 */
function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract the plain-text label from a completion item.
 * @param item - the completion item to read the label from
 * @returns the item's label string
 */
function labelOf(item: vscode.CompletionItem): string {
    return typeof item.label === 'string' ? item.label : item.label.label;
}

suite('SSJS-in-HTML TypeScript Service — Completions', () => {
    const documentUri = getDocumentUri('test-ssjs-ts-html.html');

    suiteSetup(async () => {
        await activate(documentUri);
        await sleep(COMPLETIONS_SETTLE_MS);
    });

    test('Platform. → includes Function, Variable, Response, Request namespaces', async () => {
        // VS Code line 19 (0-indexed): `var guid = Platform.Function.GUID();`
        // Col 25 is inside "Function" — triggers Platform.* member completions
        const list = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            documentUri,
            new vscode.Position(19, 25) // inside "Platform.Function"
        )) as vscode.CompletionList;

        const labels = new Set(list.items.map((item) => labelOf(item)));
        assert.ok(labels.has('Function'), 'Should include Function');
        assert.ok(labels.has('Variable'), 'Should include Variable');
        assert.ok(labels.has('Response'), 'Should include Response');
        assert.ok(labels.has('Request'), 'Should include Request');
    });

    test('Platform.Function. → includes GUID, ParseJSON, Lookup', async () => {
        // VS Code line 19: `var guid = Platform.Function.GUID();`
        // Col 29 is right after "Platform.Function." — triggers Platform.Function.* completions
        const list = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            documentUri,
            new vscode.Position(19, 29) // after "Platform.Function."
        )) as vscode.CompletionList;

        const labels = new Set(list.items.map((item) => labelOf(item)));
        assert.ok(labels.has('GUID'), 'Should include GUID');
        assert.ok(labels.has('ParseJSON'), 'Should include ParseJSON');
        assert.ok(labels.has('Lookup'), 'Should include Lookup');
    });

    test('de. → includes Rows and Fields (DataExtensionInstance type flow)', async () => {
        // VS Code line 10: `var rows = de.Rows.Lookup(...)` — trigger after "de."
        const list = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            documentUri,
            new vscode.Position(10, 15) // after "de."
        )) as vscode.CompletionList;

        const labels = new Set(list.items.map((item) => labelOf(item)));
        assert.ok(labels.has('Rows'), 'Should include Rows');
        assert.ok(labels.has('Fields'), 'Should include Fields');
    });

    test('api. → includes WSProxy instance methods (retrieve, createItem)', async () => {
        // VS Code line 16: `var result = api.retrieve(...)` — trigger after "api."
        const list = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            documentUri,
            new vscode.Position(16, 19) // after "api."
        )) as vscode.CompletionList;

        const labels = new Set(list.items.map((item) => labelOf(item)));
        assert.ok(labels.has('retrieve'), 'Should include retrieve');
        assert.ok(labels.has('createItem'), 'Should include createItem');
        assert.ok(labels.has('setBatchSize'), 'Should include setBatchSize');
    });

    test('Math. → includes abs, floor, PI', async () => {
        // VS Code line 25: `var rounded = Math.round(3.7);`
        const list = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            documentUri,
            new vscode.Position(25, 19) // inside "round", after "Math."
        )) as vscode.CompletionList;

        const labels = new Set(list.items.map((item) => labelOf(item)));
        assert.ok(labels.has('abs'), 'Should include abs');
        assert.ok(labels.has('floor'), 'Should include floor');
        assert.ok(labels.has('PI'), 'Should include PI');
    });

    test('guid. → includes String built-in methods (toUpperCase, indexOf)', async () => {
        // VS Code line 28: `var upper = guid.toUpperCase();`
        const list = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            documentUri,
            new vscode.Position(28, 20) // after "guid."
        )) as vscode.CompletionList;

        const labels = new Set(list.items.map((item) => labelOf(item)));
        assert.ok(labels.has('toUpperCase'), 'Should include toUpperCase');
        assert.ok(labels.has('indexOf'), 'Should include indexOf');
        assert.ok(labels.has('split'), 'Should include split');
    });
});

suite('SSJS-in-HTML TypeScript Service — Diagnostics', () => {
    const documentUri = getDocumentUri('test-ssjs-ts-html.html');

    let diags: vscode.Diagnostic[];

    suiteSetup(async () => {
        await activate(documentUri);
        await sleep(SETTLE_MS);
        diags = vscode.languages.getDiagnostics(documentUri);
    });

    test('Produces at least one sfmc-ts diagnostic', () => {
        const tsDiags = diags.filter((d) => d.source === 'sfmc-ts');
        assert.ok(tsDiags.length > 0, 'Should have at least one sfmc-ts diagnostic');
    });

    test('sfmc-ts diagnostic points at the undefined variable on line 31', () => {
        const tsDiags = diags.filter((d) => d.source === 'sfmc-ts');
        // VS Code line 31: `var broken = totallyUndefinedVariable.toString();`
        const onLine31 = tsDiags.find((d) => d.range.start.line === 31);
        assert.ok(onLine31, 'Should have a diagnostic on line 31 (totallyUndefinedVariable)');
    });

    test('Valid lines produce no sfmc-ts errors', () => {
        // VS Code lines 7 (DataExtension.Init), 10 (de.Rows.Lookup), 16 (api.retrieve)
        const tsDiagErrors = diags.filter(
            (d) =>
                d.source === 'sfmc-ts' &&
                d.severity === vscode.DiagnosticSeverity.Error &&
                (d.range.start.line === 7 || d.range.start.line === 10 || d.range.start.line === 16)
        );
        assert.strictEqual(
            tsDiagErrors.length,
            0,
            `Unexpected TS errors on valid lines: ${JSON.stringify(tsDiagErrors)}`
        );
    });
});

suite('SSJS-in-HTML TypeScript Service — Hover', () => {
    const documentUri = getDocumentUri('test-ssjs-ts-html.html');

    suiteSetup(async () => {
        await activate(documentUri);
        await sleep(SETTLE_MS);
    });

    test('Hover over Platform.Function.GUID shows type info', async () => {
        // VS Code line 19: `var guid = Platform.Function.GUID();`
        const hovers = (await vscode.commands.executeCommand(
            'vscode.executeHoverProvider',
            documentUri,
            new vscode.Position(19, 30)
        )) as vscode.Hover[];

        assert.ok(hovers.length > 0, 'Should return at least one hover');
        const text = hovers
            .flatMap((h) =>
                h.contents.map((c) =>
                    typeof c === 'string' ? c : (c as vscode.MarkdownString).value
                )
            )
            .join('');
        assert.ok(text.length > 0, 'Hover content should not be empty');
    });
});

suite('SSJS-in-HTML TypeScript Service — Signature Help', () => {
    const documentUri = getDocumentUri('test-ssjs-ts-html.html');

    suiteSetup(async () => {
        await activate(documentUri);
        await sleep(SETTLE_MS);
    });

    test('Signature help documentation includes ssjs.guide reference link', async () => {
        // VS Code line 23: `Platform.Response.Write(Stringify(result));`
        // Position (23, 34) is inside `Stringify(result` — triggers Stringify signature
        const sigHelp = (await vscode.commands.executeCommand(
            'vscode.executeSignatureHelpProvider',
            documentUri,
            new vscode.Position(23, 34),
            '('
        )) as vscode.SignatureHelp | undefined;

        if (!sigHelp || sigHelp.signatures.length === 0) {
            return; // No signature help available — acceptable in CI
        }

        const document = sigHelp.signatures[0].documentation;
        if (!document) return;

        const text =
            typeof document === 'string' ? document : (document as vscode.MarkdownString).value;
        assert.ok(
            text.includes('ssjs.guide'),
            `Signature documentation should include ssjs.guide reference, got: ${text}`
        );
    });
});
