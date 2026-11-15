/**
 * Release-only check: every SFMC package that ends up inside the VSIX must be the newest
 * version published on npm. The extension inlines its dependencies with esbuild, so a
 * package that is fixed upstream but stale in one of the three lockfiles ships stale.
 * (Release 3.8.0 updated the language service but still shipped the previous formatter.)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Lockfiles whose packages are bundled into the extension.
 */
export const LOCKFILES = [
    'package-lock.json',
    'client/package-lock.json',
    'server/package-lock.json',
];

/**
 * Packages maintained alongside this extension; direct and transitive ones alike.
 */
export const OWNED_PACKAGES = [
    'sfmc-language-lsp',
    'prettier-plugin-sfmc',
    'ampscript-parser',
    'ampscript-data',
    'ssjs-data',
    'handlebars-data',
    'sfmc-handlebars-parser',
];

/**
 * Compare the locked versions of the owned packages with the newest published ones.
 * @param locks - parsed lockfiles by path
 * @param latestByName - newest published version by package name
 * @returns one message per stale package and lockfile
 */
export function findOutdated(locks, latestByName) {
    const outdated = [];
    for (const [lockPath, lock] of Object.entries(locks)) {
        for (const name of OWNED_PACKAGES) {
            const locked = lock.packages?.[`node_modules/${name}`]?.version;
            if (locked === undefined) continue;
            const latest = latestByName[name];
            assert.ok(latest, `No published version known for ${name}`);
            if (locked !== latest) {
                outdated.push(`${lockPath}: ${name} is locked at ${locked}, npm has ${latest}`);
            }
        }
    }
    return outdated;
}

/**
 * Ask the public registry for the newest version of a package.
 * @param name - package name
 * @returns version string
 */
async function latestVersion(name) {
    const response = await fetch(`https://registry.npmjs.org/${name}/latest`);
    assert.ok(response.ok, `npm registry answered ${response.status} for ${name}`);
    const { version } = await response.json();
    assert.equal(typeof version, 'string', `npm registry returned no version for ${name}`);
    return version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const locks = Object.fromEntries(
        LOCKFILES.map((lockPath) => [
            lockPath,
            JSON.parse(readFileSync(path.join(root, lockPath), 'utf8')),
        ])
    );
    const present = OWNED_PACKAGES.filter((name) =>
        Object.values(locks).some((lock) => lock.packages?.[`node_modules/${name}`])
    );
    const latestByName = Object.fromEntries(
        await Promise.all(present.map(async (name) => [name, await latestVersion(name)]))
    );
    const outdated = findOutdated(locks, latestByName);
    assert.deepEqual(
        outdated,
        [],
        'Bundled SFMC packages are behind npm. Update them (and the lockfiles) before releasing.'
    );
    process.stdout.write(`Bundled SFMC packages are current: ${JSON.stringify(latestByName)}\n`);
}
