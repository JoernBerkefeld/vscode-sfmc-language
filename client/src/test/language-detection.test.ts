import * as vscode from 'vscode';
import * as assert from 'node:assert';
import { getDocumentUri, activate } from './helper';

/**
 * Helper that waits until `doc.languageId` transitions to the expected value,
 * polling every 200 ms up to `timeoutMs`.  Returns the final language id.
 * @param documentUri - VS Code URI of the document to watch
 * @param expectedLanguage - language identifier to wait for
 * @param timeoutMs - maximum wait time in milliseconds
 * @returns the final language id of the document
 */
async function waitForLanguage(
    documentUri: vscode.Uri,
    expectedLanguage: string,
    timeoutMs = 5000
): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const document = vscode.workspace.textDocuments.find(
            (d) => d.uri.toString() === documentUri.toString()
        );
        if (document?.languageId === expectedLanguage) return expectedLanguage;
        await sleep(200);
    }
    const document = vscode.workspace.textDocuments.find(
        (d) => d.uri.toString() === documentUri.toString()
    );
    return document?.languageId ?? 'unknown';
}

/**
 * Resolve to a promise after the given delay.
 * @param ms - delay in milliseconds
 * @returns a promise that resolves after the delay
 */
function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

suite('SFMC HTML auto-detection — individual marker variants', () => {
    test('%%[ ... ]%% block marker → sfmc', async () => {
        const documentUri = getDocumentUri('marker-block.html');
        await activate(documentUri);
        const lang = await waitForLanguage(documentUri, 'sfmc');
        assert.strictEqual(lang, 'sfmc', 'marker-block.html should be detected as sfmc');
    });

    test('%%= ... =%% inline marker → sfmc', async () => {
        const documentUri = getDocumentUri('marker-inline.html');
        await activate(documentUri);
        const lang = await waitForLanguage(documentUri, 'sfmc');
        assert.strictEqual(lang, 'sfmc', 'marker-inline.html should be detected as sfmc');
    });

    test('<script language="ampscript"> → sfmc', async () => {
        const documentUri = getDocumentUri('marker-script-language.html');
        await activate(documentUri);
        const lang = await waitForLanguage(documentUri, 'sfmc');
        assert.strictEqual(lang, 'sfmc', 'marker-script-language.html should be detected as sfmc');
    });

    test('<script language="ampscript" runat="server"> → sfmc', async () => {
        const documentUri = getDocumentUri('marker-script-language-runat.html');
        await activate(documentUri);
        const lang = await waitForLanguage(documentUri, 'sfmc');
        assert.strictEqual(
            lang,
            'sfmc',
            'marker-script-language-runat.html should be detected as sfmc'
        );
    });

    test('<script runat="server"> (SSJS only, no language attr) → sfmc', async () => {
        const documentUri = getDocumentUri('marker-script-runat.html');
        await activate(documentUri);
        const lang = await waitForLanguage(documentUri, 'sfmc');
        assert.strictEqual(lang, 'sfmc', 'marker-script-runat.html should be detected as sfmc');
    });

    test('{!$...} MCN Handlebars binding → sfmc (platform-independent)', async () => {
        const documentUri = getDocumentUri('marker-hbs-binding.html');
        await activate(documentUri);
        const lang = await waitForLanguage(documentUri, 'sfmc');
        assert.strictEqual(
            lang,
            'sfmc',
            'marker-hbs-binding.html with a {!$...} binding should be detected as sfmc'
        );
    });

    test('bare {{...}} mustache stays html under default (engagement) target', async () => {
        const documentUri = getDocumentUri('marker-hbs-mustache.html');
        await activate(documentUri);
        // Default targetPlatform is "engagement"; a bare {{...}} mustache is shared
        // by many template engines and must NOT hijack the document.
        await sleep(3000);
        const document = vscode.workspace.textDocuments.find(
            (d) => d.uri.toString() === documentUri.toString()
        );
        assert.strictEqual(
            document?.languageId,
            'html',
            `Expected {{...}}-only HTML to stay html under engagement, got '${document?.languageId}'`
        );
    });
});

suite('SFMC HTML auto-detection', () => {
    test('HTML file with %%[ block marker is switched to sfmc', async () => {
        const documentUri = getDocumentUri('ampscript-block.html');
        await activate(documentUri);
        const lang = await waitForLanguage(documentUri, 'sfmc');
        assert.strictEqual(
            lang,
            'sfmc',
            'Expected language to be switched to sfmc for a file containing %%[ ... ]%%'
        );
    });

    test('HTML file with <script language="ampscript"> tag is switched to sfmc', async () => {
        const documentUri = getDocumentUri('ampscript-script-tag.html');
        await activate(documentUri);
        const lang = await waitForLanguage(documentUri, 'sfmc');
        assert.strictEqual(
            lang,
            'sfmc',
            'Expected language to be switched to sfmc for a file containing a <script language="ampscript"> tag'
        );
    });

    test('HTML file with only <script runat="server"> SSJS block is switched to sfmc', async () => {
        const documentUri = getDocumentUri('ssjs-only.html');
        await activate(documentUri);
        const lang = await waitForLanguage(documentUri, 'sfmc');
        assert.strictEqual(
            lang,
            'sfmc',
            'Expected language to be switched to sfmc for a file containing only a SSJS script block'
        );
    });

    test('HTML file with both AMPscript and SSJS is switched to sfmc', async () => {
        const documentUri = getDocumentUri('ampscript-and-ssjs.html');
        await activate(documentUri);
        const lang = await waitForLanguage(documentUri, 'sfmc');
        assert.strictEqual(
            lang,
            'sfmc',
            'Expected language to be sfmc when both AMPscript and SSJS markers are present'
        );
    });

    test('Plain HTML file without AMPscript or SSJS markers stays as html', async () => {
        const documentUri = getDocumentUri('plain.html');
        await activate(documentUri);
        // Give the extension time to process the document; language must NOT change.
        await sleep(3000);
        const document = vscode.workspace.textDocuments.find(
            (d) => d.uri.toString() === documentUri.toString()
        );
        assert.ok(
            document?.languageId !== 'ampscript' &&
                document?.languageId !== 'ssjs' &&
                document?.languageId !== 'sfmc',
            `Expected plain HTML file to stay as html, got '${document?.languageId}'`
        );
    });
});
