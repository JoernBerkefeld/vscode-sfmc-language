// Regenerates client/testFixture/polyfills-all-quickfix.ssjs from ssjs-data.
// Emits every POLYFILLABLE_METHODS entry exactly as the LSP quickfix inserts it
// (verbatim `polyfill` source, trimmed, separated by a blank line).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const data = require('ssjs-data');

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(here, '..', 'client', 'testFixture', 'polyfills-all-quickfix.ssjs');

const header = [
    '// =============================================================================',
    '// F5 test fixture - ALL SSJS polyfills as inserted by the quickfix',
    '// -----------------------------------------------------------------------------',
    '// One block per POLYFILLABLE_METHODS entry in ssjs-data, emitted exactly as the',
    '// LSP quickfix inserts it (verbatim polyfill source + blank line).',
    '// Regenerate: node scripts/gen-polyfill-fixture.mjs',
    '// =============================================================================',
    '',
    'Platform.Load("Core", "1.1.5");',
    '',
].join('\n');

const body = data.POLYFILLABLE_METHODS.map((m) => m.polyfill.trimEnd()).join('\n\n');

writeFileSync(outPath, `${header}\n${body}\n`);
// eslint-disable-next-line no-console
console.log(`wrote ${data.POLYFILLABLE_METHODS.length} polyfills to ${outPath}`);
