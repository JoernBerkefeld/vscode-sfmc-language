import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { findOutdated, LOCKFILES, OWNED_PACKAGES } from './verify-bundled-latest.mjs';

const lock = (versions) => ({
    packages: Object.fromEntries(
        Object.entries(versions).map(([name, version]) => [`node_modules/${name}`, { version }])
    ),
});

test('reports nothing when every bundled SFMC package matches npm', () => {
    const locks = {
        'package-lock.json': lock({ 'sfmc-language-lsp': '4.4.0', 'ssjs-data': '2.1.2' }),
        'client/package-lock.json': lock({ 'prettier-plugin-sfmc': '2.2.0', eslint: '10.0.0' }),
    };
    const latest = {
        'sfmc-language-lsp': '4.4.0',
        'ssjs-data': '2.1.2',
        'prettier-plugin-sfmc': '2.2.0',
    };
    assert.deepEqual(findOutdated(locks, latest), []);
});

test('reports a stale formatter in the client lockfile and a stale transitive package', () => {
    const locks = {
        'package-lock.json': lock({ 'sfmc-language-lsp': '4.4.0', 'ssjs-data': '2.1.1' }),
        'client/package-lock.json': lock({ 'prettier-plugin-sfmc': '2.1.1' }),
    };
    const latest = {
        'sfmc-language-lsp': '4.4.0',
        'ssjs-data': '2.1.2',
        'prettier-plugin-sfmc': '2.2.0',
    };
    assert.deepEqual(findOutdated(locks, latest), [
        'package-lock.json: ssjs-data is locked at 2.1.1, npm has 2.1.2',
        'client/package-lock.json: prettier-plugin-sfmc is locked at 2.1.1, npm has 2.2.0',
    ]);
});

test('fails closed when a bundled package has no known published version', () => {
    const locks = { 'package-lock.json': lock({ 'sfmc-language-lsp': '4.4.0' }) };
    assert.throws(() => findOutdated(locks, {}), /No published version known/);
});

test('covers all three lockfiles and both directly bundled SFMC packages', () => {
    assert.deepEqual(LOCKFILES, [
        'package-lock.json',
        'client/package-lock.json',
        'server/package-lock.json',
    ]);
    for (const name of ['sfmc-language-lsp', 'prettier-plugin-sfmc']) {
        assert.ok(OWNED_PACKAGES.includes(name), name);
    }
});

test('the client pins the bundled formatter and its parser to the released versions', () => {
    const manifest = JSON.parse(
        readFileSync(new URL('../client/package.json', import.meta.url), 'utf8')
    );
    const clientLock = JSON.parse(
        readFileSync(new URL('../client/package-lock.json', import.meta.url), 'utf8')
    );
    assert.equal(manifest.devDependencies['prettier-plugin-sfmc'], '^2.2.0');
    assert.equal(clientLock.packages['node_modules/prettier-plugin-sfmc'].version, '2.2.0');
    assert.equal(clientLock.packages['node_modules/prettier-plugin-sfmc'].link, undefined);
    assert.equal(clientLock.packages['node_modules/ampscript-parser'].version, '0.4.0');
});
