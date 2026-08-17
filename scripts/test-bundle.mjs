/**
 * Regression test for the esbuild-produced client bundle.
 *
 * Guards against the v3.0.0/v3.0.1 activation crash where the build baked the
 * build machine's absolute path into `import.meta.url` (via `define`), producing
 * `createRequire('file:///home/runner/...')` in the shipped bundle. That URL is
 * a valid path only on the CI (Linux) machine, so `createRequire` threw a
 * TypeError on the user's Windows/macOS machine and the extension failed to
 * activate.
 *
 * This test rebuilds the minified bundle exactly as `vscode:prepublish` does and
 * asserts:
 *   1. No absolute build path is baked into the bundle (no `file:///…` literal
 *      pointing at a source tree, and no CI runner path).
 *   2. The bundle declares the runtime `import.meta.url` shim
 *      (`pathToFileURL(__filename)`).
 *   3. The bundle loads under CJS `require` (with a stubbed `vscode`) and exports
 *      `activate` / `deactivate` — i.e. module evaluation does not throw.
 *
 * Run standalone: `node scripts/test-bundle.mjs`.
 */
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(scriptDirectory);
const bundlePath = path.join(projectRoot, 'client', 'out', 'extension.js');

const counter = { passed: 0 };
/**
 * Minimal test harness — run a named check and track pass/fail.
 * @param {string} name - description of the assertion
 * @param {() => void} check - assertion body (throws on failure)
 */
function test(name, check) {
    check();
    counter.passed += 1;
    // eslint-disable-next-line no-console -- standalone test reports progress
    console.log(`  ok - ${name}`);
}

// Rebuild the minified bundle the same way vscode:prepublish does.
execFileSync(process.execPath, [path.join(scriptDirectory, 'esbuild-client.mjs'), '--minify'], {
    cwd: projectRoot,
    stdio: 'inherit',
});

const require = createRequire(import.meta.url);
const source = require('node:fs').readFileSync(bundlePath, 'utf8');

test('bundle does not bake in a source-tree file:// URL for import.meta.url', () => {
    // A baked import.meta.url looked like file:///…/client/src/extension.ts —
    // the raw entry path frozen at build time. It must never appear.
    assert.ok(
        !/file:\/\/[^"']*\/client\/src\/extension\.ts/.test(source),
        'bundle contains a baked file:// URL pointing at client/src/extension.ts'
    );
});

test('bundle does not contain the CI runner absolute path', () => {
    assert.ok(!source.includes('/home/runner/'), 'bundle contains a /home/runner/ path');
});

test('bundle declares the runtime import.meta.url shim', () => {
    assert.ok(
        source.includes('pathToFileURL(__filename)'),
        'bundle is missing the pathToFileURL(__filename) runtime shim'
    );
});

test('bundle loads under CJS with a stubbed vscode and exports activate/deactivate', () => {
    const Module = require('node:module');
    const originalResolve = Module._resolveFilename;
    const originalLoad = Module._load;
    const handler = {
        get(target, property) {
            if (property === 'default') return target;
            if (target[property] === undefined) {
                const stub = function () {
                    return new Proxy({}, handler);
                };
                stub.file = (p) => ({ fsPath: p });
                target[property] = new Proxy(stub, handler);
            }
            return target[property];
        },
        construct() {
            return new Proxy({}, handler);
        },
        apply() {
            return new Proxy({}, handler);
        },
    };
    Module._resolveFilename = (request, ...rest) =>
        request === 'vscode'
            ? 'vscode'
            : Reflect.apply(originalResolve, Module, [request, ...rest]);
    Module._load = (request, ...rest) =>
        request === 'vscode'
            ? new Proxy(function () {}, handler)
            : Reflect.apply(originalLoad, Module, [request, ...rest]);
    try {
        delete require.cache[bundlePath];
        const module_ = require(bundlePath);
        assert.strictEqual(typeof module_.activate, 'function', 'activate export missing');
        assert.strictEqual(typeof module_.deactivate, 'function', 'deactivate export missing');
    } finally {
        Module._resolveFilename = originalResolve;
        Module._load = originalLoad;
    }
});

// eslint-disable-next-line no-console -- standalone test reports summary
console.log(`\n${counter.passed} bundle checks passed.`);
