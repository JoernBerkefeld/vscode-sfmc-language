import * as vscode from 'vscode';
import * as assert from 'node:assert';
import { getDocUri as getDocumentUri, activate } from './helper';

/**
 * Helper that waits until `doc.languageId` transitions to the expected value,
 * polling every 200 ms up to `timeoutMs`.  Returns the final language id.
 * @param documentUri
 * @param expectedLanguage
 * @param timeoutMs
 */
async function waitForLanguage(
    documentUri: vscode.Uri,
    expectedLanguage: string,
    timeoutMs = 5000
): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const doc = vscode.workspace.textDocuments.find(
            (d) => d.uri.toString() === documentUri.toString()
        );
        if (doc?.languageId === expectedLanguage) return expectedLanguage;
        await sleep(200);
    }
    const doc = vscode.workspace.textDocuments.find(
        (d) => d.uri.toString() === documentUri.toString()
    );
    return doc?.languageId ?? 'unknown';
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

suite('AMPscript HTML auto-detection — individual marker variants', () => {
    test('%%[ ... ]%% block marker → ampscript', async () => {
        const documentUri = getDocumentUri('marker-block.html');
        await activate(documentUri);
        const lang = await waitForLanguage(documentUri, 'ampscript');
        assert.strictEqual(lang, 'ampscript', 'marker-block.html should be detected as ampscript');
    });

    test('%%= ... =%% inline marker → ampscript', async () => {
        const documentUri = getDocumentUri('marker-inline.html');
        await activate(documentUri);
        const lang = await waitForLanguage(documentUri, 'ampscript');
        assert.strictEqual(lang, 'ampscript', 'marker-inline.html should be detected as ampscript');
    });

    test('<script language="ampscript"> → ampscript', async () => {
        const documentUri = getDocumentUri('marker-script-language.html');
        await activate(documentUri);
        const lang = await waitForLanguage(documentUri, 'ampscript');
        assert.strictEqual(
            lang,
            'ampscript',
            'marker-script-language.html should be detected as ampscript'
        );
    });

    test('<script language="ampscript" runat="server"> → ampscript', async () => {
        const documentUri = getDocumentUri('marker-script-language-runat.html');
        await activate(documentUri);
        const lang = await waitForLanguage(documentUri, 'ampscript');
        assert.strictEqual(
            lang,
            'ampscript',
            'marker-script-language-runat.html should be detected as ampscript'
        );
    });

    test('<script runat="server"> → ssjs', async () => {
        const documentUri = getDocumentUri('marker-script-runat.html');
        await activate(documentUri);
        const lang = await waitForLanguage(documentUri, 'ssjs');
        assert.strictEqual(lang, 'ssjs', 'marker-script-runat.html should be detected as ssjs');
    });
});

suite('AMPscript HTML auto-detection', () => {
    test('HTML file with %%[ block marker is switched to ampscript', async () => {
        const documentUri = getDocumentUri('ampscript-block.html');
        await activate(documentUri);
        const lang = await waitForLanguage(documentUri, 'ampscript');
        assert.strictEqual(
            lang,
            'ampscript',
            'Expected language to be switched to ampscript for a file containing %%[ ... ]%%'
        );
    });

    test('HTML file with <script language="ampscript"> tag is switched to ampscript', async () => {
        const documentUri = getDocumentUri('ampscript-script-tag.html');
        await activate(documentUri);
        const lang = await waitForLanguage(documentUri, 'ampscript');
        assert.strictEqual(
            lang,
            'ampscript',
            'Expected language to be switched to ampscript for a file containing a <script language="ampscript"> tag'
        );
    });

    test('HTML file with only a <script runat="server"> block is switched to ssjs', async () => {
        const documentUri = getDocumentUri('ssjs-only.html');
        await activate(documentUri);
        const lang = await waitForLanguage(documentUri, 'ssjs');
        assert.strictEqual(
            lang,
            'ssjs',
            'Expected language to be switched to ssjs for a file containing only <script runat="server">'
        );
    });

    test('HTML file with both AMPscript and SSJS is switched to ampscript (AMPscript wins)', async () => {
        const documentUri = getDocumentUri('ampscript-and-ssjs.html');
        await activate(documentUri);
        const lang = await waitForLanguage(documentUri, 'ampscript');
        assert.strictEqual(
            lang,
            'ampscript',
            'Expected language to be ampscript when both AMPscript and SSJS markers are present'
        );
    });

    test('Plain HTML file without AMPscript or SSJS markers stays as html', async () => {
        const documentUri = getDocumentUri('plain.html');
        await activate(documentUri);
        // Give the extension time to process the document; language must NOT change.
        await sleep(3000);
        const doc = vscode.workspace.textDocuments.find(
            (d) => d.uri.toString() === documentUri.toString()
        );
        assert.ok(
            doc?.languageId !== 'ampscript' && doc?.languageId !== 'ssjs',
            `Expected plain HTML file to stay as html, got '${doc?.languageId}'`
        );
    });
});
