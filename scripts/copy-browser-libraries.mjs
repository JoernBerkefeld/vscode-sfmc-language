import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'server/src/browser-js-service.ts'));
const ts = require('typescript');
export const typescriptDirectory = path.dirname(require.resolve('typescript/package.json'));
export const libraryDirectory = path.dirname(require.resolve('typescript'));
export const notices = ['LICENSE.txt', 'ThirdPartyNoticeText.txt'];

/**
 * Read the service's entry roots without maintaining another language catalog.
 * @returns Standard library filenames selected by the service.
 */
export function browserLibraryRoots() {
    const source = readFileSync(path.join(root, 'server/src/browser-js-service.ts'), 'utf8');
    const declaration = /export const BROWSER_LIBRARY_FILES = (\[[\s\S]*?\]);/.exec(source);
    assert.ok(declaration, 'Browser library entry roots must be declared');
    return declaration[1]
        .matchAll(/'([^']+)'/g)
        .map((match) => match[1])
        .toArray();
}

/**
 * Collect the exact reference closure using the same compiler as the server.
 * @param directory - Installed or shipped declaration directory.
 * @returns Declaration filenames and their unchanged source text.
 */
export function browserLibraryClosure(directory = libraryDirectory) {
    const files = new Map();
    const load = (name) => {
        if (files.has(name)) return;
        assert.match(name, /^lib\.[\w.]+\.d\.ts$/);
        const text = readFileSync(path.join(directory, name), 'utf8');
        files.set(name, text);
        const references = ts.preProcessFile(text);
        for (const reference of references.libReferenceDirectives)
            load(`lib.${reference.fileName}.d.ts`);
        for (const reference of references.referencedFiles) load(reference.fileName);
    };
    for (const name of browserLibraryRoots()) load(name);
    return files;
}

/**
 * Copy declarations and upstream redistribution notices into the existing output.
 * @param destination - Browser libraries beside the compiled server.
 * @returns Number of declarations copied.
 */
export function copyBrowserLibraries(destination = path.join(root, 'server/out/browser-libs')) {
    const files = browserLibraryClosure();
    mkdirSync(destination, { recursive: true });
    for (const name of files.keys())
        copyFileSync(path.join(libraryDirectory, name), path.join(destination, name));
    for (const name of notices)
        copyFileSync(path.join(typescriptDirectory, name), path.join(destination, name));
    return files.size;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    // eslint-disable-next-line no-console -- build reports shipped declaration count
    console.log(
        `${copyBrowserLibraries()} TypeScript browser declarations and upstream notices copied`
    );
}
