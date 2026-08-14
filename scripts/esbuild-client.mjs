/**
 * Bundles the extension client (client/src/extension.ts) into client/out/extension.js.
 *
 * Prettier and prettier-plugin-sfmc are inlined so the extension can format
 * without a separate install. Prettier (via its dependencies) references
 * `import.meta.url` + `createRequire()`, which is `undefined` in a CJS bundle and
 * throws at load time. We `define` it to a stable file URL so the interop shim
 * compiles; the affected code path (loading plugins from disk by URL) is never
 * taken because we pass the plugin as an imported object.
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

// Stable placeholder so prettier's `createRequire(import.meta.url)` interop
// receives a valid file URL instead of `undefined`.
const importMetaUrl = `file://${entry.replaceAll('\\', '/')}`;

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
        'import.meta.url': JSON.stringify(importMetaUrl),
    },
});

// eslint-disable-next-line no-console -- build script reports its output path to the terminal
console.log(`client bundled -> ${outfile}`);
