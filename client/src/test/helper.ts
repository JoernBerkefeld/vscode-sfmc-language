import * as vscode from 'vscode';
import path from 'node:path';

// Holder so the active document/editor can be reassigned from inside `activate`
// without assigning to a top-level binding (unicorn/no-top-level-assignment-in-function).
export const testState: {
    document: vscode.TextDocument | undefined;
    editor: vscode.TextEditor | undefined;
} = { document: undefined, editor: undefined };

/**
 * Activate the extension and open the given document in an editor.
 * @param documentUri - URI of the fixture document to open
 */
export async function activate(documentUri: vscode.Uri) {
    const extension = vscode.extensions.getExtension('joernberkefeld.sfmc-language')!;
    await extension.activate();
    try {
        testState.document = await vscode.workspace.openTextDocument(documentUri);
        testState.editor = await vscode.window.showTextDocument(testState.document);
        await sleep(4000);
    } catch (error) {
        console.error(error);
    }
}

/**
 * Resolve to a promise after the given delay.
 * @param ms - delay in milliseconds
 * @returns a promise that resolves after the delay
 */
async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve an absolute path to a file inside the test fixture folder.
 * @param p - fixture-relative file path
 * @returns absolute path to the fixture file
 */
export const getDocumentPath = (p: string) => {
    return path.resolve(__dirname, '../../testFixture', p);
};
/**
 * Resolve a file URI to a file inside the test fixture folder.
 * @param p - fixture-relative file path
 * @returns file URI for the fixture file
 */
export const getDocumentUri = (p: string) => {
    return vscode.Uri.file(getDocumentPath(p));
};

/**
 * Replace the entire content of the active test document.
 * @param content - the new document content
 * @returns true when the edit was applied
 */
export async function setTestContent(content: string): Promise<boolean> {
    const document = testState.document!;
    const all = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
    );
    // Use delete + insert rather than TextEditorEdit.replace so the unicorn
    // string-replacement heuristic does not misfire on the VS Code edit API.
    return testState.editor!.edit((eb) => {
        eb.delete(all);
        eb.insert(document.positionAt(0), content);
    });
}
