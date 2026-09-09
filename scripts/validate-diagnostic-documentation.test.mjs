import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
    loadDocumentationHelper,
    validateDiagnosticDocumentation,
    verifyDocumentationTargets,
    verifyReleaseTag,
} from './validate-diagnostic-documentation.mjs';

const prefix = 'https://github.com/JoernBerkefeld/vscode-sfmc-language/blob/v9.8.7/';
const href = `${prefix}docs/diagnostics/typescript.md#ts2304`;

test('release gate accepts only the owning version and checked-out tag commit', () => {
    verifyReleaseTag('v9.8.7', '9.8.7', 'same', 'same');
    for (const tag of [undefined, '', '9.8.7', 'v0.0.1', 'main']) {
        assert.throws(() => verifyReleaseTag(tag, '9.8.7', 'same', 'same'), /root package version/);
    }
    assert.throws(
        () => verifyReleaseTag('v9.8.7', '9.8.7', 'wrong', 'right'),
        /release tag commit/
    );
});

test('documentation gate rejects missing files, missing anchors, and foreign targets', (context) => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'sfmc-diagnostic-docs-'));
    context.after(() => rmSync(root, { recursive: true, force: true }));
    const directory = path.join(root, 'docs/diagnostics');
    mkdirSync(directory, { recursive: true });
    assert.throws(() => verifyDocumentationTargets(root, '9.8.7', [href]), /ENOENT/);
    writeFileSync(path.join(directory, 'typescript.md'), '## TS2304\n\n## Other diagnostics\n');
    verifyDocumentationTargets(root, '9.8.7', [href, href.replace('ts2304', 'other-diagnostics')]);
    assert.throws(() => verifyDocumentationTargets(root, '9.8.7', []), /Expected/);
    assert.throws(
        () => verifyDocumentationTargets(root, '9.8.7', [href.replace('ts2304', 'ts2339')]),
        /Missing documentation anchor/
    );
    assert.throws(
        () => verifyDocumentationTargets(root, '9.8.7', [href.split('#', 1)[0]]),
        /must have an anchor/
    );
    assert.throws(
        () =>
            verifyDocumentationTargets(root, '9.8.7', [
                href.replace('typescript.md', 'missing.md'),
            ]),
        /Unexpected TypeScript documentation path/
    );
    for (const foreign of [
        href.replace('v9.8.7', 'v0.0.1'),
        href.replace('vscode-sfmc-language', 'sfmc-language-lsp'),
        href.replace('https:', 'http:'),
    ]) {
        assert.throws(
            () => verifyDocumentationTargets(root, '9.8.7', [foreign]),
            /Incorrect documentation owner or version/
        );
    }
});

test('actual helper and owning checkout docs validate offline', async () => {
    await validateDiagnosticDocumentation();
});

test('helper embeds the extension root version rather than server subpackage metadata', async (context) => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'sfmc-diagnostic-owner-'));
    context.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(path.join(root, 'server/src'), { recursive: true });
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '9.8.7' }));
    writeFileSync(path.join(root, 'server/package.json'), JSON.stringify({ version: '0.0.1' }));
    writeFileSync(
        path.join(root, 'server/src/diagnostic-documentation.ts'),
        readFileSync(new URL('../server/src/diagnostic-documentation.ts', import.meta.url))
    );
    const helper = await loadDocumentationHelper(root);
    assert.deepEqual(helper.DOCUMENTED_TYPESCRIPT_CODES, [2304, 2339]);
    assert.equal(helper.getTypescriptDiagnosticUrl(2304), href);
    assert.equal(helper.getTypescriptDiagnosticUrl(2339), href.replace('ts2304', 'ts2339'));
    assert.equal(
        helper.getTypescriptDiagnosticUrl(-1),
        href.replace('ts2304', 'other-diagnostics')
    );
});
