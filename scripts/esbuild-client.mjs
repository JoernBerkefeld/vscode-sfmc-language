/**
 * Bundles the extension client (client/src/extension.ts) into client/out/extension.js.
 *
 * Prettier and prettier-plugin-sfmc are inlined so the extension can format
 * without a separate install. Prettier (via its dependencies) references
 * `import.meta.url` + `createRequire()`, which is `undefined` in a CJS bundle and
 * throws at load time. We `define` it to a runtime expression that resolves the
 * URL of the actual bundle on the machine that runs it, so the interop shim
 * compiles and `createRequire()` receives a valid, OS-correct file URL. The
 * affected code path (loading plugins from disk by URL) is never taken because
 * we pass the plugin as an imported object.
 *
 * The value MUST be computed at runtime, not baked in at build time: baking in
 * the build machine's absolute path produced `file:///home/runner/...` in the
 * published bundle, which `createRequire()` rejects on Windows/macOS (Linux CI
 * path is not a valid path on the user's OS) — the extension then failed to
 * activate. `require('url').pathToFileURL(__filename)` is evaluated in the CJS
 * output at load time, where `__filename` is the real path of extension.js on
 * the user's machine.
 *
 * Flags mirror the previous inline `esbuild-client` npm script
 * (--bundle --external:vscode --format=cjs --platform=node); pass --minify or
 * --sourcemap through as CLI arguments.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(scriptDirectory);
const entry = path.join(projectRoot, 'client', 'src', 'extension.ts');
const outfile = path.join(projectRoot, 'client', 'out', 'extension.js');

const passthrough = new Set(process.argv.slice(2));
const shouldMinify = passthrough.has('--minify');
const shouldSourcemap = passthrough.has('--sourcemap');

await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    outfile,
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    minify: shouldMinify,
    sourcemap: shouldSourcemap,
    define: {
        // Map every `import.meta.url` to a runtime-computed identifier. esbuild's
        // `define` only accepts an entity name or a JS literal (not a call
        // expression), so the actual computation lives in the banner below.
        'import.meta.url': '__sfmcImportMetaUrl',
    },
    banner: {
        // Declare the identifier once at the top of the CJS bundle. `__filename`
        // is the real path of extension.js on the machine that loads it, so
        // `pathToFileURL(__filename)` yields a valid, OS-correct file URL for
        // prettier's `createRequire()` interop (see header comment).
        js: "const __sfmcImportMetaUrl = require('url').pathToFileURL(__filename).href;",
    },
});

// eslint-disable-next-line no-console -- build script reports its output path to the terminal
console.log(`client bundled -> ${outfile}`);
