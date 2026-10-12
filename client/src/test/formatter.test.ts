import * as vscode from 'vscode';
import * as assert from 'node:assert';
import {
    STD_CONFIG,
    LANGUAGE_ID_TO_FILEPATH,
    FORMATTER_LANGUAGES,
    OUTPUT_CHANNEL_NAME,
    formatSfmcDocument,
    logPrefix,
    stringifyOptions,
} from '../formatter';
import { getDocumentUri } from './helper';

/**
 * Locale-aware string comparator for deterministic array sorting in assertions.
 * @param a - first string
 * @param b - second string
 * @returns negative, zero, or positive per `String#localeCompare`
 */
const byLocale = (a: string, b: string): number => a.localeCompare(b);

/**
 * Open a fixture document and force it to the given language ID so the
 * formatter's language-based dispatch is exercised regardless of VS Code's own
 * file-association guess.
 * @param fixture - fixture-relative path
 * @param languageId - language ID to apply
 * @returns the opened text document
 */
async function openAs(fixture: string, languageId: string): Promise<vscode.TextDocument> {
    const document = await vscode.workspace.openTextDocument(getDocumentUri(fixture));
    return vscode.languages.setTextDocumentLanguage(document, languageId);
}

suite('Formatter — static config', () => {
    test('STD_CONFIG mirrors the plugin defaults', () => {
        assert.strictEqual(STD_CONFIG.useTabs, false);
        assert.strictEqual(STD_CONFIG.tabWidth, 4);
        assert.strictEqual(STD_CONFIG.printWidth, 100);
        assert.strictEqual(STD_CONFIG.singleQuote, true);
        assert.strictEqual(STD_CONFIG.trailingComma, 'none');
    });

    test('language map covers exactly the 5 SFMC languages', () => {
        assert.deepStrictEqual(
            [...FORMATTER_LANGUAGES].toSorted(byLocale),
            ['ampscript', 'handlebars', 'sfmc', 'sql', 'ssjs'].toSorted(byLocale)
        );
    });

    test('plain html is NOT a registered formatter language', () => {
        assert.ok(!FORMATTER_LANGUAGES.includes('html'));
        assert.strictEqual(LANGUAGE_ID_TO_FILEPATH.html, undefined);
    });

    test('each language maps to the expected synthetic extension', () => {
        assert.strictEqual(LANGUAGE_ID_TO_FILEPATH.ampscript, 'x.ampscript');
        assert.strictEqual(LANGUAGE_ID_TO_FILEPATH.ssjs, 'x.ssjs');
        assert.strictEqual(LANGUAGE_ID_TO_FILEPATH.sfmc, 'x.html');
        assert.strictEqual(LANGUAGE_ID_TO_FILEPATH.handlebars, 'x.hbs');
        assert.strictEqual(LANGUAGE_ID_TO_FILEPATH.sql, 'x.sql');
    });
});

suite('Formatter — output channel logging', () => {
    test('channel name matches the documented name', () => {
        assert.strictEqual(OUTPUT_CHANNEL_NAME, 'SFMC Prettier Formatter');
    });

    test('logPrefix formats the Prettier-style level + timestamp prefix', () => {
        const prefix = logPrefix('INFO');
        assert.ok(
            /^\["INFO" - \d{1,2}:\d{2}:\d{2}\s?[AP]M\] $/.test(prefix),
            `unexpected prefix: ${JSON.stringify(prefix)}`
        );
        assert.ok(logPrefix('ERROR').startsWith('["ERROR" - '));
    });

    test('stringifyOptions replaces the plugin object with a stable label', () => {
        const line = stringifyOptions({
            ...STD_CONFIG,
            plugins: [{ some: 'object' } as unknown as import('prettier').Plugin],
        });
        assert.ok(line.includes('"prettier-plugin-sfmc"'), 'plugin label expected');
        assert.ok(!line.includes('some'), 'raw plugin object must not leak into the log');
        // Must be a single line (no newlines) so it reads like the Prettier extension.
        assert.ok(!line.includes('\n'));
    });
});

suite('Formatter — formatting behaviour', () => {
    test('formats AMPscript into the documented block layout', async () => {
        const document = await openAs('fmt/unformatted.amp', 'ampscript');
        const formatted = await formatSfmcDocument(document);
        assert.ok(formatted, 'expected formatted output');
        assert.notStrictEqual(formatted, document.getText());
        assert.ok(formatted.includes('var @x'), 'expected AMPscript var declaration');
        assert.ok(formatted.includes("'a'"), 'expected single-quoted string literal');
    });

    test('formats SSJS', async () => {
        const document = await openAs('fmt/unformatted.ssjs', 'ssjs');
        const formatted = await formatSfmcDocument(document);
        assert.ok(formatted);
        assert.notStrictEqual(formatted, document.getText());
        assert.ok(formatted.includes('var a = 1;'));
    });

    test('formats SQL', async () => {
        const document = await openAs('fmt/unformatted.sql', 'sql');
        const formatted = await formatSfmcDocument(document);
        assert.ok(formatted);
        assert.notStrictEqual(formatted, document.getText());
        assert.ok(/SELECT/.test(formatted), 'expected uppercased SELECT keyword');
    });

    test('formats mixed-content sfmc HTML (AMPscript + embedded SSJS)', async () => {
        const document = await openAs('fmt/mixed.html', 'sfmc');
        const formatted = await formatSfmcDocument(document);
        assert.ok(formatted);
        assert.notStrictEqual(formatted, document.getText());
        assert.ok(formatted.includes('%%['), 'expected AMPscript block preserved');
        assert.ok(
            formatted.includes('runat="server"'),
            'expected embedded SSJS script tag preserved'
        );
        assert.ok(formatted.includes('var a = 1;'), 'expected SSJS body formatted');
    });

    test('is idempotent (formatting formatted output is a no-op)', async () => {
        const document = await openAs('fmt/unformatted.ssjs', 'ssjs');
        const once = await formatSfmcDocument(document);
        assert.ok(once);
        const edit = new vscode.WorkspaceEdit();
        const full = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );
        edit.replace(document.uri, full, once);
        await vscode.workspace.applyEdit(edit);
        const twice = await formatSfmcDocument(document);
        assert.strictEqual(twice, once);
    });

    test('invalid SSJS yields no output (syntax error is caught, does not throw)', async () => {
        const document = await openAs('fmt/invalid.ssjs', 'ssjs');
        const formatted = await formatSfmcDocument(document);
        assert.strictEqual(formatted, undefined);
    });

    test('unsupported language yields no output', async () => {
        const document = await openAs('fmt/unformatted.ssjs', 'plaintext');
        const formatted = await formatSfmcDocument(document);
        assert.strictEqual(formatted, undefined);
    });
});

suite('Formatter — workspace config override + ignore', () => {
    test('.prettierrc overrides tabWidth and neutralizes user plugins entry', async () => {
        const document = await openAs('fmt/override/indented.ssjs', 'ssjs');
        const formatted = await formatSfmcDocument(document);
        assert.ok(formatted, 'expected formatted output (plugin still applied)');
        // tabWidth: 2 from the fixture .prettierrc -> nested block indented by 2 spaces.
        assert.ok(
            formatted.includes('\n  if'),
            `expected 2-space indent from .prettierrc override, got:\n${formatted}`
        );
    });

    test('.prettierignore causes the file to be skipped', async () => {
        const document = await openAs('fmt/override/ignored.ssjs', 'ssjs');
        const formatted = await formatSfmcDocument(document);
        assert.strictEqual(formatted, undefined, 'ignored file must not be formatted');
    });
});
