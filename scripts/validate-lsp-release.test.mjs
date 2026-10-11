import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { validateTaggedLsp } from './validate-lsp-release.mjs';
import { ESLint } from 'eslint';

const documentationRules = new Set([
    'unicorn/no-asterisk-prefix-in-documentation-comments',
    'jsdoc/check-alignment',
]);

test('documentation lint rules agree on starless nested comments and converge', async () => {
    const source = [
        'export class Example {',
        '    /**',
        '    Description.',
        '',
        '    More detail.',
        '    @returns {number} Result.',
        '    */',
        '    example() {',
        '        return 1;',
        '    }',
        '}',
        '',
    ].join('\n');
    const filePath = 'client/src/documentation-rule-probe.ts';
    const eslint = new ESLint();
    const [result] = await eslint.lintText(source, { filePath });
    assert.deepEqual(result.messages, []);

    const fixer = new ESLint({ fix: true });
    const [fixed] = await fixer.lintText(source, { filePath });
    assert.equal(fixed.output, undefined);
    assert.deepEqual(fixed.messages, []);
});

test('documentation lint rules still reject prefixes and misaligned delimiters', async () => {
    const eslint = new ESLint();
    for (const source of [
        '/**\n * Description.\n */\nexport const example = 1;\n',
        '/**\nDescription.\n */\nexport const example = 1;\n',
    ]) {
        const [result] = await eslint.lintText(source, {
            filePath: 'client/src/documentation-rule-probe.ts',
        });
        const rules = new Set(result.messages.map((message) => message.ruleId));
        for (const rule of documentationRules) {
            assert.ok(rules.has(rule), `Expected ${rule} to reject malformed documentation`);
        }
        const fixer = new ESLint({ fix: true });
        const [fixed] = await fixer.lintText(source, {
            filePath: 'client/src/documentation-rule-probe.ts',
        });
        assert.deepEqual(fixed.messages, []);
        const [secondPass] = await fixer.lintText(fixed.output, {
            filePath: 'client/src/documentation-rule-probe.ts',
        });
        assert.equal(secondPass.output, undefined);
    }
});

test('lint configuration remains free of top-level exported calls', async () => {
    const eslint = new ESLint();
    const [result] = await eslint.lintFiles(['eslint.config.mjs']);
    assert.deepEqual(result.messages, []);
});

test('both extension dependency sites declare the published diagnostic contract', () => {
    for (const prefix of ['../', '../server/']) {
        const manifest = JSON.parse(
            readFileSync(new URL(`${prefix}package.json`, import.meta.url), 'utf8')
        );
        const lock = JSON.parse(
            readFileSync(new URL(`${prefix}package-lock.json`, import.meta.url), 'utf8')
        );
        assert.equal(manifest.dependencies['sfmc-language-lsp'], '^4.2.1');
        assert.equal(lock.packages['node_modules/sfmc-language-lsp'].version, '4.2.1');
        assert.equal(lock.packages['node_modules/ampscript-data'].version, '4.2.0');
        assert.equal(lock.packages['node_modules/ssjs-data'].version, '2.1.1');
    }
});

const identity = { manifest: { name: 'sfmc-language-lsp', version: '4.2.1' } };
const rules = [
    {
        ruleId: 'sfmc/amp-no-unknown-function',
        documentationPath: 'docs/rules/amp/no-unknown-function.md',
    },
];

/**
Supply an offline immutable-tag fixture independent of installed dependencies.
@returns tagged fixture file map
*/
function files() {
    return new Map([
        ['package.json', JSON.stringify(identity.manifest)],
        ['docs/rules/README.md', '[rule](amp/no-unknown-function.md)'],
        [
            rules[0].documentationPath,
            '# sfmc/amp-no-unknown-function\n```text\nexample\n```\n' + 'Guidance. '.repeat(100),
        ],
    ]);
}

/**
Read a fixture as a remote tagged file; missing files fail closed.
@param documents - fixture file map
@returns fixture reader
*/
function reader(documents) {
    return (filename) => {
        assert.ok(documents.has(filename), `Missing tagged file: ${filename}`);
        return documents.get(filename);
    };
}

test('release-only validation checks actual tag documents offline', async () => {
    const read = reader(files());
    assert.equal(await validateTaggedLsp(identity, rules, read), 1);
});

test('release-only validation accepts CRLF tagged documentation', async () => {
    const documents = files();
    const path = rules[0].documentationPath;
    documents.set(path, documents.get(path).replaceAll('\n', '\r\n'));
    assert.equal(await validateTaggedLsp(identity, rules, reader(documents)), 1);
});

test('matching installed and tagged versions do not excuse missing tagged docs', async () => {
    const documents = files();
    documents.delete(rules[0].documentationPath);
    await assert.rejects(
        validateTaggedLsp(identity, rules, reader(documents)),
        /Missing tagged file/
    );
});

test('released 3.17.1 cannot carry the new contract even with matching versions', async () => {
    const old = { manifest: { ...identity.manifest, version: '3.17.1' } };
    const documents = files();
    documents.set('package.json', JSON.stringify(old.manifest));
    await assert.rejects(validateTaggedLsp(old, rules, reader(documents)), /new stable LSP major/);
});

test('mismatched tag version, wrong heading and missing registry fail closed', async () => {
    const documents = files();
    documents.set('package.json', JSON.stringify({ ...identity.manifest, version: '4.0.1' }));
    await assert.rejects(
        validateTaggedLsp(identity, rules, reader(documents)),
        /exact tag must agree/
    );
    documents.set('package.json', JSON.stringify(identity.manifest));
    documents.set(rules[0].documentationPath, 'wrong heading');
    await assert.rejects(
        validateTaggedLsp(identity, rules, reader(documents)),
        /Wrong tagged heading/
    );
    const read = reader(files());
    await assert.rejects(validateTaggedLsp(identity, [], read), /diagnostic registry/);
});
