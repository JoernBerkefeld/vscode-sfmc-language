import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    assertPortable,
    resolveBundledLsp,
    validateServerArtifact,
    verifyPublishedIdentity,
} from './test-server-artifact.mjs';

/**
 * Provide independent diagnostic fixtures for negative identity assertions.
 * @returns publication fixtures
 */
function publications() {
    return [
        [
            {
                code: 'sfmc/amp-no-unknown-function',
                codeDescription: {
                    href: 'https://github.com/JoernBerkefeld/sfmc-language-lsp/blob/v1.2.3/docs/rules/amp/no-unknown-function.md',
                },
            },
        ],
        [
            {
                source: 'sfmc-ts',
                code: 2304,
                codeDescription: {
                    href: 'https://github.com/JoernBerkefeld/vscode-sfmc-language/blob/v9.8.7/docs/diagnostics/typescript.md#ts2304',
                },
            },
        ],
        [
            {
                source: 'sfmc-ts',
                code: 1109,
                codeDescription: {
                    href: 'https://github.com/JoernBerkefeld/vscode-sfmc-language/blob/v9.8.7/docs/diagnostics/typescript.md#other-diagnostics',
                },
            },
        ],
    ];
}

test(
    'complete relocated server and both installed browser LSP graphs execute offline',
    { timeout: 120_000 },
    async () => {
        const identity = await validateServerArtifact();
        assert.notEqual(identity.lspVersion, identity.fixtureVersion);
    }
);

test('owner swaps, ranges, nonnumeric TS codes and fabricated fallback anchors fail', () => {
    verifyPublishedIdentity(publications(), '1.2.3', '9.8.7');
    assert.throws(() => verifyPublishedIdentity(publications(), '9.8.7', '1.2.3'));
    assert.throws(() => verifyPublishedIdentity(publications(), '^1.2.3', '9.8.7'));
    const stringCode = publications();
    stringCode[1][0].code = '2304';
    assert.throws(() => verifyPublishedIdentity(stringCode, '1.2.3', '9.8.7'));
    const falseAnchor = publications();
    falseAnchor[2][0].codeDescription.href = falseAnchor[2][0].codeDescription.href.replace(
        'other-diagnostics',
        'ts1109'
    );
    assert.throws(() => verifyPublishedIdentity(falseAnchor, '1.2.3', '9.8.7'));
});

test('resolver rejects absent or ambiguous LSP graphs instead of guessing a sibling', async () => {
    await assert.rejects(resolveBundledLsp({ inputs: {} }), /exactly one/);
    await assert.rejects(
        resolveBundledLsp({
            inputs: {
                'server/node_modules/sfmc-language-lsp/dist/esm/index.js': {},
                'node_modules/sfmc-language-lsp/dist/esm/index.js': {},
            },
        }),
        /exactly one/
    );
});

test('portability rejects Windows escaped, slash-normalized and POSIX paths', () => {
    for (const source of [
        String.raw`C:\build\extension`,
        'C:/build/extension',
        String.raw`C:\\build\\extension`,
    ]) {
        assert.throws(() => assertPortable(source, [String.raw`C:\build\extension`]));
    }
    assert.throws(() => assertPortable('/home/build/extension', ['/home/build/extension']));
    assertPortable('require("node:fs"); __dirname;', ['/home/build/extension']);
});
