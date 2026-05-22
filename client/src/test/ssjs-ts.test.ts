/**
 * ssjs-ts.test.ts — VS Code integration tests for the embedded TypeScript
 * language service (tsService) as seen through the extension's LSP client.
 *
 * All tests use the test-ssjs-ts.ssjs fixture file and the real extension.
 */
import * as vscode from 'vscode';
import * as assert from 'node:assert';
import { getDocUri as getDocumentUri, activate } from './helper';

// Settle time so the TS service has time to produce diagnostics
const SETTLE_MS = 3000;
// Extra settle for CI: the LSP completion-provider registration takes longer than
// diagnostics (which are pushed) — give it 12 s total (activate=4 s + this).
const COMPLETIONS_SETTLE_MS = 8000;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function labelOf(item: vscode.CompletionItem): string {
    return typeof item.label === 'string' ? item.label : item.label.label;
}

suite('SSJS TypeScript Service — Completions', () => {
    const documentUri = getDocumentUri('test-ssjs-ts.ssjs');

    suiteSetup(async () => {
        await activate(documentUri);
        await sleep(COMPLETIONS_SETTLE_MS);
    });

    test('Platform. → includes Function, Variable, Response, Request namespaces', async () => {
        // File line 18 (0-indexed): `var guid = Platform.Function.GUID();`
        // Col 25 is inside "Function" — triggers Platform.* member completions
        const list = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            documentUri,
            new vscode.Position(18, 25), // inside "Platform.Function"
        )) as vscode.CompletionList;

        const labels = new Set(list.items.map(labelOf));
        assert.ok(labels.has('Function'), 'Should include Function');
        assert.ok(labels.has('Variable'), 'Should include Variable');
        assert.ok(labels.has('Response'), 'Should include Response');
        assert.ok(labels.has('Request'), 'Should include Request');
    });

    test('Platform.Function. → includes GUID, ParseJSON, Lookup', async () => {
        // File line 18 (0-indexed): `var guid = Platform.Function.GUID();`
        // Col 29 is at 'G' of 'GUID', right after the second '.' — triggers Platform.Function.* completions
        const list = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            documentUri,
            new vscode.Position(18, 29), // after "Platform.Function."
        )) as vscode.CompletionList;

        const labels = new Set(list.items.map(labelOf));
        assert.ok(labels.has('GUID'), 'Should include GUID');
        assert.ok(labels.has('ParseJSON'), 'Should include ParseJSON');
        assert.ok(labels.has('Lookup'), 'Should include Lookup');
    });

    test('de. → includes Rows and Fields (DataExtensionInstance type flow)', async () => {
        // Line 9: `var rows = de.Rows.Lookup(...)` — trigger after "de."
        const list = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            documentUri,
            new vscode.Position(9, 15), // after "de."
        )) as vscode.CompletionList;

        const labels = new Set(list.items.map(labelOf));
        assert.ok(labels.has('Rows'), 'Should include Rows');
        assert.ok(labels.has('Fields'), 'Should include Fields');
    });

    test('api. → includes WSProxy instance methods (retrieve, createItem)', async () => {
        // File line 15 (0-indexed): `var result = api.retrieve(...)` — trigger after "api."
        const list = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            documentUri,
            new vscode.Position(15, 19), // after "api."
        )) as vscode.CompletionList;

        const labels = new Set(list.items.map(labelOf));
        assert.ok(labels.has('retrieve'), 'Should include retrieve');
        assert.ok(labels.has('createItem'), 'Should include createItem');
        assert.ok(labels.has('setBatchSize'), 'Should include setBatchSize');
    });

    test('Math. → includes abs, floor, PI', async () => {
        // File line 24 (0-indexed): `var rounded = Math.round(3.7);`
        const list = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            documentUri,
            new vscode.Position(24, 19), // inside "round", after "Math."
        )) as vscode.CompletionList;

        const labels = new Set(list.items.map(labelOf));
        assert.ok(labels.has('abs'), 'Should include abs');
        assert.ok(labels.has('floor'), 'Should include floor');
        assert.ok(labels.has('PI'), 'Should include PI');
    });

    test('guid. → includes String built-in methods (toUpperCase, indexOf)', async () => {
        // File line 27 (0-indexed): `var upper = guid.toUpperCase();`
        const list = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            documentUri,
            new vscode.Position(27, 20), // after "guid."
        )) as vscode.CompletionList;

        const labels = new Set(list.items.map(labelOf));
        assert.ok(labels.has('toUpperCase'), 'Should include toUpperCase');
        assert.ok(labels.has('indexOf'), 'Should include indexOf');
        assert.ok(labels.has('split'), 'Should include split');
    });
});

suite('SSJS TypeScript Service — Diagnostics', () => {
    const documentUri = getDocumentUri('test-ssjs-ts.ssjs');

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

    test('sfmc-ts diagnostic points at the undefined variable on line 30', () => {
        const tsDiags = diags.filter((d) => d.source === 'sfmc-ts');
        // File line 30 (0-indexed): `var broken = totallyUndefinedVariable.toString();`
        const onLine30 = tsDiags.find((d) => d.range.start.line === 30);
        assert.ok(onLine30, 'Should have a diagnostic on line 30 (totallyUndefinedVariable)');
    });

    test('Valid lines produce no sfmc-ts errors', () => {
        // File lines 6 (DataExtension.Init), 9 (de.Rows.Lookup), 15 (api.retrieve) — all 0-indexed
        // should not produce TS errors
        const tsDiagErrors = diags.filter(
            (d) =>
                d.source === 'sfmc-ts' &&
                d.severity === vscode.DiagnosticSeverity.Error &&
                (d.range.start.line === 6 ||
                    d.range.start.line === 9 ||
                    d.range.start.line === 15),
        );
        assert.strictEqual(
            tsDiagErrors.length,
            0,
            `Unexpected TS errors on valid lines: ${JSON.stringify(tsDiagErrors)}`,
        );
    });
});

suite('SSJS TypeScript Service — Hover', () => {
    const documentUri = getDocumentUri('test-ssjs-ts.ssjs');

    suiteSetup(async () => {
        await activate(documentUri);
        await sleep(SETTLE_MS);
    });

    test('Hover over Platform.Function.GUID shows type info', async () => {
        // File line 18 (0-indexed): `var guid = Platform.Function.GUID();`
        // Hover at "GUID" (col ~30)
        const hovers = (await vscode.commands.executeCommand(
            'vscode.executeHoverProvider',
            documentUri,
            new vscode.Position(18, 30),
        )) as vscode.Hover[];

        assert.ok(hovers.length > 0, 'Should return at least one hover');
        const text = hovers
            .flatMap((h) =>
                h.contents.map((c) =>
                    typeof c === 'string' ? c : (c as vscode.MarkdownString).value,
                ),
            )
            .join('');
        assert.ok(text.length > 0, 'Hover content should not be empty');
    });
});

suite('SSJS TypeScript Service — Signature Help (Bug J)', () => {
    const documentUri = getDocumentUri('test-ssjs-ts.ssjs');

    suiteSetup(async () => {
        await activate(documentUri);
        await sleep(SETTLE_MS);
    });

    test('Signature help documentation includes ssjs.guide reference link', async () => {
        // File line 22 (0-indexed): `Platform.Response.Write(Stringify(result));`
        // Position (22, 34) is inside `Stringify(result` — triggers Stringify signature
        const sigHelp = (await vscode.commands.executeCommand(
            'vscode.executeSignatureHelpProvider',
            documentUri,
            new vscode.Position(22, 34),
            '(',
        )) as vscode.SignatureHelp | undefined;

        if (!sigHelp || sigHelp.signatures.length === 0) {
            return; // No signature help available — acceptable in CI
        }

        const doc = sigHelp.signatures[0].documentation;
        if (!doc) return; // No documentation — acceptable

        const text = typeof doc === 'string' ? doc : (doc as vscode.MarkdownString).value;
        assert.ok(
            text.includes('ssjs.guide'),
            `Signature documentation should include ssjs.guide reference, got: ${text}`,
        );
    });

    test('Signature help documentation is a MarkdownString (not plain text)', async () => {
        // File line 22 (0-indexed): `Platform.Response.Write(Stringify(result));`
        const sigHelp = (await vscode.commands.executeCommand(
            'vscode.executeSignatureHelpProvider',
            documentUri,
            new vscode.Position(22, 34),
            '(',
        )) as vscode.SignatureHelp | undefined;

        if (!sigHelp || sigHelp.signatures.length === 0) {
            return; // No signature help available — acceptable in CI
        }

        const doc = sigHelp.signatures[0].documentation;
        if (!doc) return; // No documentation — acceptable

        // If the fix is working, the LSP server sends MarkupContent { kind: 'markdown' }
        // which the VS Code client converts to a MarkdownString instance.
        assert.ok(
            doc instanceof vscode.MarkdownString,
            `Signature documentation should be a MarkdownString (rendered markdown), got: ${typeof doc}`,
        );
    });
});
