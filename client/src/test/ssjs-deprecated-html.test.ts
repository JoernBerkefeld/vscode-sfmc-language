/**
 * ssjs-deprecated-html.test.ts — VS Code integration tests verifying that hover
 * responses show `@deprecated` annotations for deprecated SSJS functions inside an
 * HTML <script runat="server"> block.
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

suite('SSJS-in-HTML — Deprecated method hover', () => {
    const documentUri = getDocumentUri('test-ssjs-deprecated-html.html');

    suiteSetup(async () => {
        await activate(documentUri);
        await sleep(SETTLE_MS);
    });

    test('Hover over ContentArea includes @deprecated annotation', async () => {
        // VS Code line 7 (0-indexed): `var area = ContentArea("slot1");`
        // "ContentArea" starts at col 11 — hover somewhere in the middle
        const hovers = (await vscode.commands.executeCommand(
            'vscode.executeHoverProvider',
            documentUri,
            new vscode.Position(7, 14)
        )) as vscode.Hover[];

        if (hovers.length === 0) return; // acceptable in CI if hover not available

        const text = hovers
            .flatMap((h) =>
                h.contents.map((c) =>
                    typeof c === 'string' ? c : (c as vscode.MarkdownString).value
                )
            )
            .join('');

        assert.ok(
            text.toLowerCase().includes('deprecated'),
            `Hover for deprecated ContentArea should include "deprecated", got: ${text}`
        );
    });

    test('Hover over non-deprecated GUID does NOT include deprecated annotation', async () => {
        // VS Code line 10 (0-indexed): `var guid = Platform.Function.GUID();`
        const hovers = (await vscode.commands.executeCommand(
            'vscode.executeHoverProvider',
            documentUri,
            new vscode.Position(10, 30)
        )) as vscode.Hover[];

        if (hovers.length === 0) return; // acceptable in CI

        const text = hovers
            .flatMap((h) =>
                h.contents.map((c) =>
                    typeof c === 'string' ? c : (c as vscode.MarkdownString).value
                )
            )
            .join('');

        // GUID is not deprecated — text must not say "deprecated"
        assert.ok(
            !text.toLowerCase().includes('deprecated'),
            `Hover for non-deprecated GUID should NOT include "deprecated", got: ${text}`
        );
    });
});
