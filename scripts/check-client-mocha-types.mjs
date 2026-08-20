/* eslint-disable no-console -- standalone check reports the result to the developer */
/**
 * Guards the F5 / `tsc -b` mocha-types resolution for the VS Code client.
 *
 * `client/tsconfig.json` lists `"mocha"` in `compilerOptions.types` and only
 * searches `client/node_modules/@types` then the extension-root `@types`.
 * When this package is installed as a monorepo workspace, npm hoists
 * `@types/mocha` to the workspace root — outside those `typeRoots` — unless
 * the type package is declared on the client and installed with
 * `--no-workspaces`.
 *
 * Run from the package root: `node scripts/check-client-mocha-types.mjs`
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.dirname(scriptDirectory);
const clientPackagePath = path.join(packageRoot, 'client', 'package.json');
const clientTsconfigPath = path.join(packageRoot, 'client', 'tsconfig.json');
const extensionPackagePath = path.join(packageRoot, 'package.json');

const clientPackage = JSON.parse(fs.readFileSync(clientPackagePath, 'utf8'));
const clientTsconfig = JSON.parse(fs.readFileSync(clientTsconfigPath, 'utf8'));
const extensionPackage = JSON.parse(fs.readFileSync(extensionPackagePath, 'utf8'));

assert.ok(
    clientPackage.devDependencies?.['@types/mocha'],
    'client/package.json must declare @types/mocha so tsc can resolve it via ./node_modules/@types regardless of workspace hoisting'
);

assert.ok(
    Array.isArray(clientTsconfig.compilerOptions?.types) &&
        clientTsconfig.compilerOptions.types.includes('mocha'),
    'client/tsconfig.json must list mocha in compilerOptions.types'
);

assert.ok(
    Array.isArray(clientTsconfig.compilerOptions?.typeRoots) &&
        clientTsconfig.compilerOptions.typeRoots.includes('./node_modules/@types'),
    'client/tsconfig.json typeRoots must include ./node_modules/@types'
);

assert.ok(
    typeof extensionPackage.scripts?.postinstall === 'string' &&
        extensionPackage.scripts.postinstall.includes('npm install --no-workspaces'),
    'extension postinstall must run nested npm install with --no-workspaces so @types/mocha is not hoisted out of client/node_modules'
);

const mochaTypesDirectory = path.join(packageRoot, 'client', 'node_modules', '@types', 'mocha');
assert.ok(
    fs.existsSync(mochaTypesDirectory),
    `client/node_modules/@types/mocha is missing (expected at ${mochaTypesDirectory}). Re-run: cd client && npm install --no-workspaces`
);

console.log(
    'ok - client mocha types are declared, isolated from workspace hoisting, and installed'
);
