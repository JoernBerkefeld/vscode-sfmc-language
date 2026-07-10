import * as vscode from 'vscode';
import * as assert from 'node:assert';
import { getDocumentUri, activate } from './helper';

suite('Handlebars (.hbs) — MCN intelligence', () => {
    const documentUri = getDocumentUri('test-handlebars.hbs');

    test('.hbs keeps the built-in handlebars language id', async () => {
        await activate(documentUri);
        const document = vscode.workspace.textDocuments.find(
            (d) => d.uri.toString() === documentUri.toString()
        );
        assert.strictEqual(
            document?.languageId,
            'handlebars',
            'Expected .hbs to use VS Code built-in handlebars language, not a custom one'
        );
    });

    test('Provides MCN helper completions inside a {{ }} mustache', async () => {
        await activate(documentUri);

        // Line 1 (0-indexed): `<p>{{  }}</p>` — cursor between the two spaces, inside the mustache.
        const position = new vscode.Position(1, 6);
        const actualCompletionList = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            documentUri,
            position
        )) as vscode.CompletionList;

        assert.ok(actualCompletionList.items.length > 0, 'Should return completions');

        const labels = new Set(
            actualCompletionList.items.map((item) => {
                const { label } = item;
                return typeof label === 'string' ? label : label.label;
            })
        );
        assert.ok(labels.has('uppercase'), 'Should include the uppercase Handlebars helper');
        assert.ok(
            labels.has('formatCurrency'),
            'Should include the formatCurrency Handlebars helper'
        );
    });

    test('Provides hover for a Handlebars helper', async () => {
        await activate(documentUri);

        // Line 0: `<p>{{uppercase contact.firstName}}</p>` — hover over `uppercase`.
        const position = new vscode.Position(0, 8);
        const hovers = (await vscode.commands.executeCommand(
            'vscode.executeHoverProvider',
            documentUri,
            position
        )) as vscode.Hover[];

        assert.ok(hovers.length > 0, 'Should return a hover for a Handlebars helper');
    });
});
