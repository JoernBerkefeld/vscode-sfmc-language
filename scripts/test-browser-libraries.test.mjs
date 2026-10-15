import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmdirSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { build } from 'esbuild';
import {
    browserLibraryClosure,
    copyBrowserLibraries,
    notices,
    typescriptDirectory,
} from './copy-browser-libraries.mjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'server/out/browser-libs');

/**
 * Compare shipped declarations and notices byte-for-byte with the installed compiler.
 * @param files - Shipped basenames and file buffers.
 */
function verifyFiles(files) {
    const closure = browserLibraryClosure();
    assert.deepEqual(
        files
            .keys()
            .toArray()
            .toSorted((a, b) => a.localeCompare(b)),
        [...closure.keys(), ...notices].toSorted((a, b) => a.localeCompare(b))
    );
    for (const [name, text] of closure) assert.equal(files.get(name).toString('utf8'), text, name);
    for (const name of notices)
        assert.deepEqual(files.get(name), readFileSync(path.join(typescriptDirectory, name)), name);
}

test('build ships the complete same-version declaration closure and license notices', () => {
    verifyFiles(
        new Map(readdirSync(output).map((name) => [name, readFileSync(path.join(output, name))]))
    );
    assert.equal(browserLibraryClosure(output).size, browserLibraryClosure().size);
});

test('relocated minified browser service loads default libraries and never falls back', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'sfmc-browser-libraries-'));
    const libraries = path.join(directory, 'browser-libs');
    const filename = path.join(directory, 'service.cjs');
    try {
        copyBrowserLibraries(libraries);
        const artifact = await build({
            absWorkingDir: root,
            entryPoints: ['server/src/browser-js-service.ts'],
            bundle: true,
            minify: true,
            platform: 'node',
            format: 'cjs',
            write: false,
        });
        const source = artifact.outputFiles[0].text;
        assert.ok(!source.includes(root.replaceAll('\\', '/')));
        writeFileSync(filename, source);
        const probe = String.raw`
            const assert = require('node:assert/strict');
            const { BrowserJsService } = require(${JSON.stringify(filename)});
            const service = new BrowserJsService();
            const uri = 'file:///relocated.amp';
            service.updateDocument(uri, '<script>document.</script>');
            assert.ok(service.getCompletions(uri, {line: 0, character: 17}).some(item => item.label === 'querySelector'));
            service.updateDocument(uri, '<script>// @ts-check\nPromise.resolve(1); document.title; Platform.Load("Core");</script>');
            const diagnostics = service.getDiagnostics(uri);
            assert.equal(diagnostics.length, 1);
            assert.match(String(diagnostics[0].message), /Platform/);
            service.dispose();
        `;
        execFileSync(process.execPath, ['-e', probe], {
            cwd: directory,
            env: { ...process.env, NODE_PATH: '' },
        });
        // Remove one shipped entry only; an installed developer compiler must not rescue it.
        unlinkSync(path.join(libraries, 'lib.dom.d.ts'));
        execFileSync(
            process.execPath,
            [
                '-e',
                `
            const assert = require('node:assert/strict');
            const { BrowserJsService } = require(${JSON.stringify(filename)});
            assert.throws(() => new BrowserJsService(), /ENOENT/);
        `,
            ],
            { cwd: directory, env: { ...process.env, NODE_PATH: '' } }
        );
    } finally {
        // Non-recursive cleanup of this test's known flat files only.
        for (const name of [...browserLibraryClosure().keys(), ...notices]) {
            if (name !== 'lib.dom.d.ts') unlinkSync(path.join(libraries, name));
        }
        unlinkSync(filename);
        rmdirSync(libraries);
        rmdirSync(directory);
    }
});

if (process.env.SFMC_TEST_VSIX) {
    test('VSIX includes every browser declaration and upstream notice', async () => {
        const require = createRequire(import.meta.url);
        const vsceRequire = createRequire(require.resolve('@vscode/vsce'));
        const yauzl = vsceRequire('yauzl');
        const files = await new Promise((resolve, reject) => {
            yauzl.open(process.env.SFMC_TEST_VSIX, { lazyEntries: true }, (error, zip) => {
                if (error) return reject(error);
                const shipped = new Map();
                zip.on('error', reject);
                zip.on('end', () => resolve(shipped));
                zip.on('entry', (entry) => {
                    const prefix = 'extension/server/out/browser-libs/';
                    if (!entry.fileName.startsWith(prefix)) return zip.readEntry();
                    zip.openReadStream(entry, (streamError, stream) => {
                        if (streamError) return reject(streamError);
                        const chunks = [];
                        stream.on('error', reject);
                        stream.on('data', (chunk) => {
                            chunks.push(chunk);
                        });
                        stream.on('end', () => {
                            shipped.set(entry.fileName.slice(prefix.length), Buffer.concat(chunks));
                            zip.readEntry();
                        });
                    });
                });
                zip.readEntry();
            });
        });
        verifyFiles(files);
    });
}
