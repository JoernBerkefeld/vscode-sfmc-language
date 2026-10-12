/**
 * ssjs-diagnostics.test.ts — VS Code integration tests for SSJS LSP diagnostics.
 *
 * Covers Bug K: bare requiresCoreLoad globals (Stringify, Now, GUID, …) must
 * produce a diagnostic when called without a preceding Platform.Load("core", …).
 */
import * as vscode from 'vscode';
import * as assert from 'node:assert';
import { getDocumentUri, activate } from './helper';

const SETTLE_MS = 3000;

/**
 * Resolve to a promise after the given delay.
 * @param ms - delay in milliseconds
 * @returns a promise that resolves after the delay
 */
function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

suite('SSJS Diagnostics — requiresCoreLoad globals (Bug K)', () => {
    const documentUri = getDocumentUri('test-ssjs-requires-load.ssjs');

    let diags: vscode.Diagnostic[];

    suiteSetup(async () => {
        await activate(documentUri);
        await sleep(SETTLE_MS);
        diags = vscode.languages.getDiagnostics(documentUri);
    });

    test('Produces at least one ssjs diagnostic', () => {
        const ssjsDiags = diags.filter((d) => d.source === 'ssjs');
        assert.ok(ssjsDiags.length > 0, 'Should produce at least one ssjs diagnostic');
    });

    test('Stringify() without Platform.Load is flagged', () => {
        const match = diags.find((d) => d.source === 'ssjs' && d.message.includes('Stringify'));
        assert.ok(match, 'Should flag Stringify() when Platform.Load is absent');
    });

    test('Stringify() diagnostic is Error severity', () => {
        const match = diags.find((d) => d.source === 'ssjs' && d.message.includes('Stringify'));
        if (match) {
            assert.strictEqual(
                match.severity,
                vscode.DiagnosticSeverity.Error,
                'Stringify() without Platform.Load should be DiagnosticSeverity.Error'
            );
        }
    });

    test('Now() without Platform.Load is flagged', () => {
        const match = diags.find((d) => d.source === 'ssjs' && d.message.includes('Now'));
        assert.ok(match, 'Should flag Now() when Platform.Load is absent');
    });

    test('GUID() without Platform.Load is flagged', () => {
        const match = diags.find((d) => d.source === 'ssjs' && d.message.includes('GUID'));
        assert.ok(match, 'Should flag GUID() when Platform.Load is absent');
    });

    test('Stringify() before Platform.Load is still flagged (order-aware check)', () => {
        // Section B of the fixture has a bare Stringify() BEFORE Platform.Load.
        // The load appearing later must not suppress the earlier error.
        const stringify2Diags = diags.filter(
            (d) => d.source === 'ssjs' && d.message.includes('Stringify')
        );
        assert.ok(
            stringify2Diags.length >= 2,
            'Should flag both Stringify() calls (before the load and in section A)'
        );
    });
});
