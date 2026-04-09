import * as vscode from 'vscode';
import * as assert from 'node:assert';
import { getDocUri as getDocumentUri, activate } from './helper';

suite('AMPscript Diagnostics', () => {
    const documentUri = getDocumentUri('diagnostics.amp');

    test('Detects unmatched block delimiters', async () => {
        await activate(documentUri);

        await sleep(2000);
        const actualDiagnostics = vscode.languages.getDiagnostics(documentUri);

        assert.ok(actualDiagnostics.length > 0, 'Should produce at least one diagnostic');

        const ampscriptDiags = actualDiagnostics.filter((d) => d.source === 'ampscript');
        assert.ok(ampscriptDiags.length > 0, 'Should produce diagnostics from ampscript source');
    });
});

suite('AMPscript Invalid Syntax Diagnostics', () => {
    const documentUri = getDocumentUri('bad-syntax.amp');

    let diags: vscode.Diagnostic[];

    suiteSetup(async () => {
        await activate(documentUri);
        await sleep(2000);
        diags = vscode.languages
            .getDiagnostics(documentUri)
            .filter((d) => d.source === 'ampscript');
    });

    test('Detects HTML comment inside %%[ block', () => {
        const match = diags.find(
            (d) =>
                d.message.includes('HTML comment') &&
                d.severity === vscode.DiagnosticSeverity.Warning
        );
        assert.ok(match, 'Should warn about HTML comment inside AMPscript block');
    });

    test('Detects HTML comment inside <script> block', () => {
        const matches = diags.filter(
            (d) =>
                d.message.includes('HTML comment') &&
                d.severity === vscode.DiagnosticSeverity.Warning
        );
        assert.ok(
            matches.length >= 2,
            'Should warn about HTML comments in both block and script tag contexts'
        );
    });

    test('Detects JavaScript // comment inside %%[ block', () => {
        const match = diags.find(
            (d) => d.message.includes('//') && d.severity === vscode.DiagnosticSeverity.Warning
        );
        assert.ok(match, 'Should warn about // comment inside AMPscript block');
    });

    test('Detects JavaScript // comment inside <script> block', () => {
        const matches = diags.filter(
            (d) => d.message.includes('//') && d.severity === vscode.DiagnosticSeverity.Warning
        );
        assert.ok(
            matches.length >= 2,
            'Should warn about // comments in both block and script tag contexts'
        );
    });

    test('Detects nested <script language="ampscript"> inside open script block', () => {
        const match = diags.find(
            (d) =>
                d.message.includes('Nested <script') &&
                d.severity === vscode.DiagnosticSeverity.Error
        );
        assert.ok(match, 'Should error on nested script tag inside open AMPscript script block');
    });

    test('Detects %%[ delimiter inside <script language="ampscript"> block', () => {
        const match = diags.find(
            (d) =>
                d.message.includes('not needed inside a <script') &&
                d.severity === vscode.DiagnosticSeverity.Error
        );
        assert.ok(match, 'Should error on %%[ delimiter inside a script tag body');
    });

    test('Detects nested %%[ delimiter inside %%[ block', () => {
        const match = diags.find(
            (d) =>
                d.message.includes('Nested %%[') && d.severity === vscode.DiagnosticSeverity.Error
        );
        assert.ok(match, 'Should error on %%[ nested inside an already-open %%[ block');
    });
});

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
