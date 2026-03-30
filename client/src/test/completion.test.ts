import * as vscode from 'vscode';
import * as assert from 'node:assert';
import { getDocUri as getDocumentUri, activate } from './helper';

suite('AMPscript Completions', () => {
    const documentUri = getDocumentUri('completion.amp');

    test('Provides function completions inside a block', async () => {
        await activate(documentUri);

        const position = new vscode.Position(1, 6);
        const actualCompletionList = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            documentUri,
            position,
        )) as vscode.CompletionList;

        assert.ok(actualCompletionList.items.length > 0, 'Should return completions');

        const functionNames = new Set(
            actualCompletionList.items.map((index) =>
                typeof index.label === 'string' ? index.label : index.label.label,
            ),
        );
        assert.ok(functionNames.has('Lookup'), 'Should include Lookup function');
        assert.ok(functionNames.has('LookupRows'), 'Should include LookupRows function');
        assert.ok(functionNames.has('Now'), 'Should include Now function');
    });

    test('Provides keyword completions inside a block', async () => {
        await activate(documentUri);

        const position = new vscode.Position(1, 6);
        const actualCompletionList = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            documentUri,
            position,
        )) as vscode.CompletionList;

        const labels = new Set(
            actualCompletionList.items.map((index) =>
                typeof index.label === 'string' ? index.label : index.label.label,
            ),
        );
        assert.ok(labels.has('var'), 'Should include var keyword');
        assert.ok(labels.has('set'), 'Should include set keyword');
        assert.ok(labels.has('if'), 'Should include if keyword');
    });

    test('Does not provide completions outside AMPscript context', async () => {
        await activate(documentUri);

        const position = new vscode.Position(4, 5);
        const actualCompletionList = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            documentUri,
            position,
        )) as vscode.CompletionList;

        const ampFunctions = actualCompletionList.items.filter(
            (index) =>
                (typeof index.label === 'string' ? index.label : index.label.label) === 'Lookup',
        );
        assert.strictEqual(
            ampFunctions.length,
            0,
            'Should not offer AMPscript completions outside blocks',
        );
    });
});
