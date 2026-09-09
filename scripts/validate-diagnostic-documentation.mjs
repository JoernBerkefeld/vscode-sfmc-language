import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const projectRoot = path.resolve(import.meta.dirname, '..');

/**
 * Require the release tag to match both the owning version and checked-out commit.
 * @param tag - release event tag
 * @param version - extension root version
 * @param head - checked-out commit
 * @param taggedCommit - commit resolved from the release tag
 */
export function verifyReleaseTag(tag, version, head, taggedCommit) {
    assert.equal(tag, `v${version}`, 'Release tag must match the extension root package version');
    assert.equal(head, taggedCommit, 'Checkout must point at the release tag commit');
}

/**
 * Verify only extension-owned targets in this checkout, never sibling LSP docs.
 * @param root - extension checkout
 * @param version - extension root version
 * @param urls - URLs emitted by the TypeScript documentation helper
 */
export function verifyDocumentationTargets(root, version, urls) {
    assert.ok(urls.length > 0, 'Expected TypeScript documentation URLs');
    const prefix = `https://github.com/JoernBerkefeld/vscode-sfmc-language/blob/v${version}/`;
    for (const href of urls) {
        assert.ok(href.startsWith(prefix), `Incorrect documentation owner or version: ${href}`);
        const [relativePath, anchor] = href.slice(prefix.length).split('#', 2);
        assert.equal(
            relativePath,
            'docs/diagnostics/typescript.md',
            'Unexpected TypeScript documentation path'
        );
        assert.ok(anchor, 'Documentation URL must have an anchor');
        const markdown = readFileSync(path.join(root, relativePath), 'utf8');
        // This page deliberately uses simple, unformatted ASCII section headings.
        const headings = Array.from(markdown.matchAll(/^#{1,6} ([A-Za-z0-9 -]+)\r?$/gm), (match) =>
            match[1].toLowerCase().replaceAll(' ', '-')
        );
        assert.ok(headings.includes(anchor), `Missing documentation anchor: ${anchor}`);
    }
}

/**
 * Bundle the actual helper offline so its static owning-package metadata is evaluated.
 * @param root - extension checkout
 * @returns exported TypeScript documentation helper and documented code set
 */
export async function loadDocumentationHelper(root = projectRoot) {
    const result = await build({
        entryPoints: [path.join(root, 'server/src/diagnostic-documentation.ts')],
        bundle: true,
        write: false,
        platform: 'node',
        format: 'esm',
    });
    return import(
        `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
    );
}

/**
 * Check extension docs, optionally enforcing the release event checkout identity.
 * @param isRelease - whether a release tag is required
 */
export async function validateDiagnosticDocumentation(isRelease = false) {
    const { version } = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    if (isRelease) {
        const tag = process.env.RELEASE_TAG;
        assert.equal(
            tag,
            `v${version}`,
            'RELEASE_TAG must match the extension root package version'
        );
        const resolveCommit = (reference) =>
            execFileSync('git', ['rev-parse', '--verify', reference + '^{commit}'], {
                cwd: projectRoot,
                encoding: 'utf8',
            }).trim();
        verifyReleaseTag(tag, version, resolveCommit('HEAD'), resolveCommit(`refs/tags/${tag}`));
    }
    const { DOCUMENTED_TYPESCRIPT_CODES, getTypescriptDiagnosticUrl } =
        await loadDocumentationHelper();
    assert.ok(DOCUMENTED_TYPESCRIPT_CODES.length > 0, 'Expected documented compiler codes');
    const codes = [...DOCUMENTED_TYPESCRIPT_CODES, -1];
    verifyDocumentationTargets(
        projectRoot,
        version,
        codes.map((code) => getTypescriptDiagnosticUrl(code))
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const arguments_ = process.argv.slice(2);
    assert.ok(
        arguments_.length === 0 || (arguments_.length === 1 && arguments_[0] === '--release'),
        'Expected only --release'
    );
    await validateDiagnosticDocumentation(arguments_[0] === '--release');
    // eslint-disable-next-line no-console -- release gate reports its explicitly limited scope
    console.log(
        'Extension-owned TypeScript documentation verified (LSP-owned docs are not checked here).'
    );
}
