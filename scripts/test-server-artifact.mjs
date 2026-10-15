import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const fixtureVersion = '91.82.73-artifact-test';
const ampText = '%%[ SET @result = ArtifactUnknownFunction() ]%%';

/**
 * Identify the installed package from the entry actually included by esbuild.
 * @param metafile - the server bundler's dependency graph
 * @returns installed entry, owning manifest, and package directory
 */
export async function resolveBundledLsp(metafile) {
    const entries = Object.keys(metafile.inputs).filter((input) =>
        /[/\\]sfmc-language-lsp[/\\]dist[/\\](?:esm[/\\]index\.js|cjs[/\\]index\.cjs)$/.test(input)
    );
    assert.equal(entries.length, 1, 'Expected exactly one actual bundled LSP entry');
    const entry = path.resolve(root, entries[0]);
    const directory = path.resolve(path.dirname(entry), '../..');
    const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    assert.equal(manifest.name, 'sfmc-language-lsp');
    assert.match(manifest.version, /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/);
    return { entry, directory, manifest };
}

/**
 * Build the complete production server without writing to live output directories.
 * The optional manifest override exists only in esbuild memory, never on disk.
 * @param extensionVersion - isolated extension identity, or undefined for production
 * @returns esbuild output and graph
 */
export function buildServerArtifact(extensionVersion) {
    return build({
        absWorkingDir: root,
        entryPoints: ['server/src/server.ts'],
        bundle: true,
        write: false,
        metafile: true,
        external: ['vscode'],
        format: 'cjs',
        platform: 'node',
        plugins: extensionVersion
            ? [
                  {
                      name: 'isolated-extension-identity',
                      setup(builder) {
                          builder.onLoad({ filter: /package\.json$/ }, async (arguments_) => {
                              if (path.resolve(arguments_.path) !== path.join(root, 'package.json'))
                                  return;
                              const manifest = JSON.parse(await readFile(arguments_.path, 'utf8'));
                              return {
                                  contents: JSON.stringify({
                                      ...manifest,
                                      version: extensionVersion,
                                  }),
                                  loader: 'json',
                              };
                          });
                      },
                  },
              ]
            : [],
    });
}

/**
 * Reject build-machine path leakage in executable output, not sourcemap metadata.
 * @param source - emitted JavaScript
 * @param directories - build-time directories that must not be baked into output
 */
export function assertPortable(source, directories) {
    for (const directory of directories) {
        for (const spelling of [
            directory,
            directory.replaceAll('\\', '/'),
            JSON.stringify(directory).slice(1, -1),
        ]) {
            assert.ok(
                !source.toLowerCase().includes(spelling.toLowerCase()),
                `Build-machine path leaked: ${directory}`
            );
        }
    }
}

/**
 * Exercise a relocated production server using its real JSON-RPC IPC transport.
 * @param filename - standalone server artifact
 * @param directory - empty runtime working directory
 * @returns published diagnostics from AMPscript, known TS, and fallback TS fixtures
 */
export async function executeServerArtifact(filename, directory) {
    const child = fork(filename, ['--node-ipc'], {
        cwd: directory,
        execArgv: [],
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: { ...process.env, NODE_PATH: '' },
    });
    const pending = new Map();
    let stderr = '';
    child.stderr.on('data', (chunk) => {
        stderr += chunk;
    });
    child.stdout.resume();
    child.on('message', (message) => {
        const key =
            message.method === 'textDocument/publishDiagnostics' ? message.params.uri : message.id;
        const waiter = pending.get(key);
        if (!waiter) {
            return;
        }

        pending.delete(key);
        if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
        else waiter.resolve(message.params?.diagnostics ?? message.result);
    });
    const fail = (error) => {
        for (const waiter of pending.values()) waiter.reject(error);
        pending.clear();
    };
    child.on('error', fail);
    child.on('exit', (code) => {
        fail(new Error(`Artifact server exited ${code}: ${stderr}`));
    });
    const send = (message) => child.send({ jsonrpc: '2.0', ...message });
    const waitFor = (key) =>
        new Promise((resolve, reject) => {
            pending.set(key, { resolve, reject });
        });
    const timeout = setTimeout(() => {
        fail(new Error(`Artifact IPC timed out: ${stderr}`));
        child.kill();
    }, 30_000);
    try {
        const initialized = waitFor(1);
        send({
            id: 1,
            method: 'initialize',
            params: {
                processId: process.pid,
                rootUri: pathToFileURL(directory).href,
                capabilities: {},
            },
        });
        await initialized;
        send({ method: 'initialized', params: {} });
        const results = [];
        for (const [name, languageId, text] of [
            ['shared.amp', 'ampscript', ampText],
            ['known.ssjs', 'ssjs', 'artifactMissingName;'],
            ['fallback.ssjs', 'ssjs', 'var artifactBroken = ;'],
        ]) {
            const uri = pathToFileURL(path.join(directory, name)).href;
            const published = waitFor(uri);
            send({
                method: 'textDocument/didOpen',
                params: { textDocument: { uri, languageId, version: 1, text } },
            });
            results.push(await published);
        }
        // Verify the full relocated routing adapter, not just the browser service.
        const browserUri = pathToFileURL(path.join(directory, 'browser.amp')).href;
        const browserText = '<script>document.querySelector("body"); const broken = ;</script>';
        const browserPublished = waitFor(browserUri);
        send({
            method: 'textDocument/didOpen',
            params: {
                textDocument: {
                    uri: browserUri,
                    languageId: 'ampscript',
                    version: 1,
                    text: browserText,
                },
            },
        });
        const browserDiagnostics = await browserPublished;
        assert.equal(browserDiagnostics.length, 1);
        const browserDiagnostic = browserDiagnostics[0];
        assert.equal(browserDiagnostic.source, 'javascript');
        assert.equal(browserDiagnostic.message, 'Expression expected.');
        const errorOffset = browserText.indexOf(';', browserText.indexOf('const broken'));
        assert.deepEqual(browserDiagnostic.range, {
            start: { line: 0, character: errorOffset },
            end: { line: 0, character: errorOffset + 1 },
        });
        assert.equal(browserDiagnostic.severity, 1);
        assert.equal(Object.hasOwn(browserDiagnostic, 'code'), false);
        assert.equal(Object.hasOwn(browserDiagnostic, 'codeDescription'), false);
        assert.ok(
            browserDiagnostics.every(
                (diagnostic) => !['ssjs', 'sfmc-ts'].includes(diagnostic.source)
            )
        );
        const completion = waitFor(3);
        send({
            id: 3,
            method: 'textDocument/completion',
            params: { textDocument: { uri: browserUri }, position: { line: 0, character: 17 } },
        });
        const browserItems = await completion;
        assert.ok(browserItems.some((item) => item.label === 'querySelector'));
        const dynamicText = '<script>const generated = %%=Concat(1,2)=%%; document.</script>';
        const changed = waitFor(browserUri);
        send({
            method: 'textDocument/didChange',
            params: {
                textDocument: { uri: browserUri, version: 2 },
                contentChanges: [{ text: dynamicText }],
            },
        });
        const changedDiagnostics = await changed;
        assert.ok(changedDiagnostics.every((diagnostic) => diagnostic.source !== 'javascript'));
        const skipped = waitFor(4);
        send({
            id: 4,
            method: 'textDocument/completion',
            params: {
                textDocument: { uri: browserUri },
                position: { line: 0, character: dynamicText.indexOf('document.') + 9 },
            },
        });
        assert.deepEqual(
            await skipped,
            [],
            'Unsafe browser code must not fall through to SFMC items'
        );
        const closed = waitFor(browserUri);
        send({ method: 'textDocument/didClose', params: { textDocument: { uri: browserUri } } });
        assert.deepEqual(await closed, []);
        const shutdown = waitFor(2);
        send({ id: 2, method: 'shutdown' });
        await shutdown;
        send({ method: 'exit' });
        return results;
    } finally {
        clearTimeout(timeout);
        const exited =
            child.exitCode !== null || child.signalCode !== null
                ? Promise.resolve()
                : once(child, 'exit');
        child.kill();
        await exited;
    }
}

/**
 * Assert exact owning release URLs on diagnostics emitted by the full artifact.
 * @param results - shared, known TS and fallback TS publications
 * @param lspVersion - actual installed package identity
 * @param extensionVersion - extension root identity
 */
export function verifyPublishedIdentity(results, lspVersion, extensionVersion) {
    const shared = results[0].find(
        (diagnostic) => diagnostic.code === 'sfmc/amp-no-unknown-function'
    );
    assert.ok(shared, 'Built server must emit the canonical shared diagnostic');
    assert.equal(
        shared.codeDescription?.href,
        `https://github.com/JoernBerkefeld/sfmc-language-lsp/blob/v${lspVersion}/docs/rules/amp/no-unknown-function.md`
    );
    const prefix = `https://github.com/JoernBerkefeld/vscode-sfmc-language/blob/v${extensionVersion}/docs/diagnostics/typescript.md#`;
    const known = results[1].find(
        (diagnostic) => diagnostic.source === 'sfmc-ts' && diagnostic.code === 2304
    );
    assert.ok(known, 'Built server must retain numeric TS2304');
    assert.equal(known.codeDescription?.href, `${prefix}ts2304`);
    const fallback = results[2].find(
        (diagnostic) => diagnostic.source === 'sfmc-ts' && ![2304, 2339].includes(diagnostic.code)
    );
    assert.ok(fallback, 'Built server must emit an undocumented numeric compiler code');
    assert.equal(typeof fallback.code, 'number');
    assert.equal(fallback.codeDescription?.href, `${prefix}other-diagnostics`);
    for (const diagnostics of results) {
        for (const diagnostic of diagnostics) {
            assert.equal(new URL(diagnostic.codeDescription?.href).protocol, 'https:');
        }
    }
}

/**
 * Bundle and execute both complete installed LSP graphs without Node built-ins.
 * This also detects stale copied dist version metadata after dev:sync-lsp.
 * @param identity - package resolved from the real server graph
 */
export async function verifyBrowserLsp(identity) {
    for (const condition of ['import', 'require']) {
        const entry = path.resolve(identity.directory, identity.manifest.exports['.'][condition]);
        const format = condition === 'import' ? 'esm' : 'cjs';
        const output = await build({
            absWorkingDir: root,
            entryPoints: [entry],
            bundle: true,
            write: false,
            metafile: true,
            platform: 'browser',
            format,
        });
        assert.ok(
            Object.keys(output.metafile.inputs).length > 20,
            'Check the full service graph, not only the registry'
        );
        const source = output.outputFiles[0].text;
        assertPortable(source, [root, identity.directory]);
        assert.equal(
            Object.values(output.metafile.outputs).flatMap((item) => item.imports).length,
            0,
            'Browser artifact cannot require external runtime modules'
        );
        const sandbox = { module: { exports: {} } };
        sandbox.exports = sandbox.module.exports;
        const service =
            format === 'esm'
                ? await import(
                      `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
                  )
                : (vm.runInNewContext(source, sandbox, { timeout: 15_000 }),
                  sandbox.module.exports);
        assert.equal(
            service.LSP_PACKAGE_VERSION,
            identity.manifest.version,
            'Installed manifest and copied dist identity must match'
        );
        const diagnostic = service.sfmcLanguageService
            .validate({ text: ampText, languageId: 'ampscript' })
            .find((item) => item.code === 'sfmc/amp-no-unknown-function');
        assert.ok(diagnostic, `${condition} graph must execute the shared validator`);
        assert.equal(
            diagnostic.codeDescription.href,
            `https://github.com/JoernBerkefeld/sfmc-language-lsp/blob/v${identity.manifest.version}/docs/rules/amp/no-unknown-function.md`
        );
    }
}

/**
 * Offline acceptance of production and distinct-version fixture server artifacts.
 * @returns actual installed identity and observed extension versions
 */
export async function validateServerArtifact() {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'sfmc-server-artifact-'));
    try {
        const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
        assert.equal(
            manifest.scripts['esbuild-server'],
            'esbuild ./server/src/server.ts --bundle --outfile=server/out/server.js --external:vscode --format=cjs --platform=node',
            'Production bundler changed: update artifact acceptance options to match'
        );
        const production = await buildServerArtifact();
        const identity = await resolveBundledLsp(production.metafile);
        await verifyBrowserLsp(identity);
        assert.notEqual(identity.manifest.version, fixtureVersion);
        await copyFile(
            path.join(root, 'server/node_modules/ssjs-data/dist/sfmc-globals.d.ts'),
            path.join(directory, 'sfmc-globals.d.ts')
        );
        // The routed server now initializes its browser service at startup.
        await cp(path.join(root, 'server/out/browser-libs'), path.join(directory, 'browser-libs'), {
            recursive: true,
        });
        for (const [version, artifact] of [
            [manifest.version, production],
            [fixtureVersion, await buildServerArtifact(fixtureVersion)],
        ]) {
            const bundled = await resolveBundledLsp(artifact.metafile);
            assert.equal(
                bundled.entry,
                identity.entry,
                'Fixture must retain actual installed LSP resolution'
            );
            const source = artifact.outputFiles[0].text;
            assertPortable(source, [root, identity.directory, directory]);
            const filename = path.join(directory, 'server.cjs');
            await writeFile(filename, source);
            verifyPublishedIdentity(
                await executeServerArtifact(filename, directory),
                identity.manifest.version,
                version
            );
        }
        return {
            lspVersion: identity.manifest.version,
            extensionVersion: manifest.version,
            fixtureVersion,
        };
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const identity = await validateServerArtifact();
    // eslint-disable-next-line no-console -- acceptance command reports identities actually exercised
    console.log('Full server and browser LSP artifacts verified offline:', identity);
}
