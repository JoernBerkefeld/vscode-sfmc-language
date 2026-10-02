import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildServerArtifact, resolveBundledLsp } from './test-server-artifact.mjs';

const repo = 'JoernBerkefeld/sfmc-language-lsp';
const github = (endpoint) =>
    JSON.parse(execFileSync('gh', ['api', `repos/${repo}/${endpoint}`], { encoding: 'utf8' }));

/**
 * Verify documentation from one immutable producer commit, not the consumer checkout.
 * @param identity - actual bundled package identity
 * @param rules - installed diagnostic registry
 * @param readTaggedFile - reader pinned to the resolved tag commit
 * @returns number of distinct documentation pages checked
 */
export async function validateTaggedLsp(identity, rules, readTaggedFile) {
    const version = identity.manifest.version;
    assert.match(
        version,
        /^[4-9]\d*\.\d+\.\d+$|^[1-9]\d+\.\d+\.\d+$/,
        'Canonical diagnostics require a new stable LSP major (not v3.17.1)'
    );
    const tagged = JSON.parse(await readTaggedFile('package.json'));
    assert.equal(tagged.name, 'sfmc-language-lsp');
    assert.equal(tagged.version, version, 'Resolved LSP and exact tag must agree');
    assert.ok(rules?.length > 0, 'Installed LSP must expose its diagnostic registry');
    const index = await readTaggedFile('docs/rules/README.md');
    const pages = new Set();
    for (const rule of rules) {
        assert.match(rule.ruleId, /^sfmc\/(?:amp|ssjs|hbs|gtl)-[a-z0-9-]+$/);
        const expected = `docs/rules/${rule.ruleId.slice(5).replace('-', '/')}.md`;
        assert.equal(rule.documentationPath, expected);
        if (pages.has(expected)) continue;
        const content = await readTaggedFile(expected);
        const normalizedContent = content.replaceAll('\r\n', '\n');
        assert.ok(
            normalizedContent.startsWith(`# ${rule.ruleId}\n`),
            `Wrong tagged heading: ${expected}`
        );
        assert.ok(
            normalizedContent.length > 700 && normalizedContent.includes('```'),
            `Missing tagged guidance: ${expected}`
        );
        assert.ok(
            index.includes(`](${expected.slice('docs/rules/'.length)})`),
            `Missing tagged index entry: ${expected}`
        );
        pages.add(expected);
    }
    return pages.size;
}

/**
 * Resolve a release tag through GitHub, then read only immutable commit objects.
 * Ordinary artifact tests never call this network-only release command.
 * @returns verified tag, commit and page count
 */
export async function validateLspRelease() {
    const artifact = await buildServerArtifact();
    const identity = await resolveBundledLsp(artifact.metafile);
    const api = await import(pathToFileURL(identity.entry).href);
    const tag = `v${identity.manifest.version}`;
    let object = github(`git/ref/tags/${encodeURIComponent(tag)}`).object;
    for (let depth = 0; object.type === 'tag' && depth < 8; depth++) {
        assert.match(object.sha, /^[a-f0-9]{40}$/);
        object = github(`git/tags/${object.sha}`).object;
    }
    assert.equal(object.type, 'commit', 'Exact LSP tag must resolve to a commit');
    const commit = object.sha;
    assert.match(commit, /^[a-f0-9]{40}$/);
    const pages = await validateTaggedLsp(identity, api.DIAGNOSTIC_RULES, (filename) => {
        const file = github(`contents/${filename}?ref=${commit}`);
        assert.equal(file.type, 'file');
        assert.equal(file.encoding, 'base64');
        return Buffer.from(file.content, 'base64').toString('utf8');
    });
    return { tag, commit, pages };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    process.stdout.write(
        `Release-only GitHub LSP documentation verified: ${JSON.stringify(await validateLspRelease())}\n`
    );
}
