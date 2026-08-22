/* eslint-disable no-console -- CLI check reports catalog validation results to the developer */
/**
 * Authoritative telemetry.json validation for vscode-sfmc-language.
 *
 * Provenance (local only — no network):
 * 1. GDPR field vocabulary is taken from the bundled VS Code telemetry docs
 *    (`docs/vscode/docs/configure/telemetry.md`, sections "Event classification"
 *    and "Event purpose"). Those enums are what the product documents for
 *    telemetry.json property metadata.
 * 2. The installed editor CLI parser lives in Cursor's
 *    `resources/app/out/vs/code/node/cliProcessMain.js`. It discovers each
 *    extension folder that contains a `telemetry.json`, `JSON.parse`s the file,
 *    and dumps the result from `cursor --telemetry` / `code --telemetry`.
 *    This script re-reads that installed parser (to fail if discovery/parse
 *    changes) and then invokes the live CLI against an isolated extensions
 *    directory that contains this catalog.
 *
 * The CLI also reads `telemetry-core.json` and `telemetry-extensions.json`
 * from the editor app root. Cursor does not ship those files, so the script
 * writes empty JSON stubs only for the duration of the CLI call and removes
 * only the stubs it created.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(scriptDirectory);
const catalogPath = path.join(root, 'telemetry.json');
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));

// From docs/vscode/docs/configure/telemetry.md — Event classification.
const classifications = new Set([
    'CallstackOrException',
    'EndUserPseudonymizedInformation',
    'PublicNonPersonalData',
    'SystemMetaData',
]);
// From docs/vscode/docs/configure/telemetry.md — Event purpose.
const purposes = new Set(['BusinessInsight', 'FeatureInsight', 'PerformanceAndHealth']);

/**
 * Assert one telemetry.json property/measure metadata object.
 * @param field - parsed field metadata
 * @param location - dotted path used in assertion messages
 */
function validateField(field, location) {
    assert.equal(typeof field, 'object', `${location} must be an object`);
    assert.ok(field, `${location} must not be null`);
    assert.ok(
        classifications.has(field.classification),
        `${location} has an unsupported classification: ${field.classification}`
    );
    assert.ok(
        purposes.has(field.purpose),
        `${location} has an unsupported purpose: ${field.purpose}`
    );
    assert.equal(typeof field.comment, 'string', `${location}.comment is required`);
    assert.ok(field.comment.trim().length > 0, `${location}.comment must not be empty`);
}

assert.deepEqual(
    Object.keys(catalog).toSorted((a, b) => a.localeCompare(b)),
    ['commonProperties', 'events']
);
assert.equal(typeof catalog.commonProperties, 'object');
assert.equal(typeof catalog.events, 'object');

for (const [name, field] of Object.entries(catalog.commonProperties)) {
    validateField(field, `commonProperties.${name}`);
}
assert.ok(Object.hasOwn(catalog.commonProperties, 'distinct_id'));
assert.ok(Object.hasOwn(catalog.commonProperties, '$process_person_profile'));
assert.equal(
    catalog.commonProperties.distinct_id.classification,
    'EndUserPseudonymizedInformation'
);
assert.equal(catalog.commonProperties['$process_person_profile'].classification, 'SystemMetaData');

for (const [eventName, event] of Object.entries(catalog.events)) {
    assert.equal(typeof event.owner, 'string', `${eventName}.owner is required`);
    assert.ok(event.owner.trim().length > 0, `${eventName}.owner must not be empty`);
    assert.equal(typeof event.comment, 'string', `${eventName}.comment is required`);
    assert.ok(event.comment.trim().length > 0, `${eventName}.comment must not be empty`);
    const properties = event.properties ?? {};
    const measures = event.measures ?? {};
    assert.equal(typeof properties, 'object');
    assert.equal(typeof measures, 'object');
    for (const [name, field] of Object.entries(properties)) {
        validateField(field, `${eventName}.properties.${name}`);
    }
    for (const [name, field] of Object.entries(measures)) {
        validateField(field, `${eventName}.measures.${name}`);
    }
}

const cursorRoot = path.join(
    process.env.LOCALAPPDATA ?? '',
    'Programs',
    'cursor',
    'resources',
    'app'
);
const cursorCli = path.join(cursorRoot, 'bin', 'cursor.cmd');
const cursorExe = path.join(cursorRoot, '..', '..', 'Cursor.exe');
const cliJs = path.join(cursorRoot, 'out', 'cli.js');
const parserPath = path.join(cursorRoot, 'out', 'vs', 'code', 'node', 'cliProcessMain.js');
assert.ok(existsSync(cursorCli), `Cursor CLI not found at ${cursorCli}`);
assert.ok(existsSync(cursorExe), `Cursor executable not found at ${cursorExe}`);
assert.ok(existsSync(cliJs), `Cursor CLI entry not found at ${cliJs}`);
assert.ok(existsSync(parserPath), `Cursor telemetry parser not found at ${parserPath}`);

const parserSource = readFileSync(parserPath, 'utf8');
assert.ok(
    parserSource.includes('telemetry.json'),
    'Installed CLI parser no longer discovers extension telemetry.json files'
);
assert.ok(
    parserSource.includes('JSON.parse'),
    'Installed CLI parser no longer JSON.parse()s telemetry catalogs'
);
assert.ok(
    parserSource.includes('telemetry-core.json') &&
        parserSource.includes('telemetry-extensions.json'),
    'Installed CLI parser no longer loads core/extension product catalogs'
);

const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'sfmc-language-telemetry-'));
const extensionsDirectory = path.join(temporaryRoot, 'extensions');
const userDataDirectory = path.join(temporaryRoot, 'user-data');
const extensionFolder = path.join(
    extensionsDirectory,
    `${packageJson.publisher}.${packageJson.name}`
);
const temporaryCoreCatalogs = [
    path.join(cursorRoot, 'telemetry-core.json'),
    path.join(cursorRoot, 'telemetry-extensions.json'),
];
const createdCoreCatalogs = [];

try {
    mkdirSync(extensionFolder, { recursive: true });
    mkdirSync(userDataDirectory, { recursive: true });
    writeFileSync(path.join(extensionFolder, 'telemetry.json'), `${JSON.stringify(catalog)}\n`);

    for (const corePath of temporaryCoreCatalogs) {
        if (existsSync(corePath)) {
            continue;
        }

        writeFileSync(corePath, '{}\n', 'utf8');
        createdCoreCatalogs.push(corePath);
    }

    // Node 20+ refuses to spawn .cmd/.bat via execFile without a shell (EINVAL).
    // Invoke the same Electron-as-Node CLI that cursor.cmd launches.
    const output = execFileSync(
        cursorExe,
        [
            cliJs,
            '--extensions-dir',
            extensionsDirectory,
            '--user-data-dir',
            userDataDirectory,
            '--telemetry',
        ],
        {
            encoding: 'utf8',
            maxBuffer: 32 * 1024 * 1024,
            timeout: 60_000,
            windowsHide: true,
            env: {
                ...process.env,
                ELECTRON_RUN_AS_NODE: '1',
                VSCODE_DEV: '',
            },
        }
    );
    const discovered = JSON.parse(output);
    const extensionKey = Object.keys(discovered).find((key) =>
        key.toLowerCase().startsWith(`${packageJson.publisher}.${packageJson.name}`.toLowerCase())
    );
    assert.ok(
        extensionKey,
        `Installed extension telemetry catalog was not discovered by the editor CLI. Keys: ${Object.keys(discovered).join(', ')}`
    );
    assert.deepEqual(
        discovered[extensionKey],
        catalog,
        'Editor CLI did not return the packaged catalog unchanged'
    );
    console.log(
        `Validated telemetry.json through Cursor CLI --telemetry (${extensionKey}) using ${parserPath}.`
    );
} finally {
    for (const corePath of createdCoreCatalogs) rmSync(corePath, { force: true });
    rmSync(temporaryRoot, { recursive: true, force: true });
}
