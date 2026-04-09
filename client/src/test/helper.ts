import * as vscode from 'vscode';
import path from 'node:path';

export let doc: vscode.TextDocument;
export let editor: vscode.TextEditor;
export let documentEol: string;
export let platformEol: string;

export async function activate(documentUri: vscode.Uri) {
    const extension = vscode.extensions.getExtension('joernberkefeld.sfmc-language')!;
    await extension.activate();
    try {
        doc = await vscode.workspace.openTextDocument(documentUri);
        editor = await vscode.window.showTextDocument(doc);
        await sleep(4000);
    } catch (ex) {
        console.error(ex);
    }
}

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export const getDocPath = (p: string) => {
    return path.resolve(__dirname, '../../testFixture', p);
};
export const getDocUri = (p: string) => {
    return vscode.Uri.file(getDocPath(p));
};

export async function setTestContent(content: string): Promise<boolean> {
    const all = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
    return editor.edit((eb) => eb.replace(all, content));
}
