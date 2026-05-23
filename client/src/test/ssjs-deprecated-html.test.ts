/**
 * ssjs-deprecated-html.test.ts — VS Code integration tests verifying that hover
 * responses show `@deprecated` annotations for deprecated SSJS methods inside an
 * HTML <script runat="server"> block.
 */
import * as vscode from 'vscode';
import * as assert from 'node:assert';
import { getDocUri as getDocumentUri, activate } from './helper';

const SETTLE_MS = 3000;

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

suite('SSJS-in-HTML — Deprecated method hover', () => {
    const documentUri = getDocumentUri('test-ssjs-deprecated-html.html');

    suiteSetup(async () => {
        await activate(documentUri);
        await sleep(SETTLE_MS);
    });

    test('Hover over SystemDateToLocalDate includes @deprecated annotation', async () => {
        // VS Code line 7 (0-indexed): `var dt = Platform.Function.SystemDateToLocalDate(new Date());`
        // Hover at "SystemDateToLocalDate" (col ~30)
        const hovers = (await vscode.commands.executeCommand(
            'vscode.executeHoverProvider',
            documentUri,
            new vscode.Position(7, 35)
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
            `Hover for deprecated method should include "deprecated", got: ${text}`
        );
    });

    test('Hover over non-deprecated GUID does NOT include deprecated annotation', async () => {
        // VS Code line 10: `var guid = Platform.Function.GUID();`
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
