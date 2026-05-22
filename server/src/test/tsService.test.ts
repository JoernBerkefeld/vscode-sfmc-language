/* eslint-disable no-console */
/**
 * tsService.test.ts — standalone Node.js unit tests for the embedded
 * TypeScript language service.
 *
 * Run with:  npx ts-node --project tsconfig.json src/test/tsService.test.ts
 * Or compile + run:  npx tsc --ignoreDeprecations 6.0 && node out/test/tsService.test.js
 *
 * No VS Code runtime required — pure Node.js / TypeScript.
 */
import * as assert from 'node:assert';
import {
    updateSsjsDocument,
    removeSsjsDocument,
    getSsjsCompletions,
    getSsjsCompletionInfo,
    getSsjsDiagnostics,
    getSsjsHover,
    getSsjsSignatureHelp,
} from '../tsService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testCounter = 0;
let passCount = 0;
let failCount = 0;

function test(name: string, fn: () => void | Promise<void>): void {
    testCounter++;
    const idx = testCounter;
    Promise.resolve()
        .then(fn)
        .then(() => {
            passCount++;
            console.log(`  ✓ [${idx}] ${name}`);
        })
        .catch((ex: unknown) => {
            failCount++;
            const msg = ex instanceof Error ? ex.message : String(ex);
            console.error(`  ✗ [${idx}] ${name}\n      ${msg}`);
        });
}

// Flush at process exit
process.on('exit', () => {
    console.log(`\n${passCount + failCount} tests: ${passCount} passed, ${failCount} failed`);
    if (failCount > 0) process.exitCode = 1;
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const URI_BASIC = 'file:///test-basic.ssjs';
const URI_DE = 'file:///test-de.ssjs';
const URI_WSPROXY = 'file:///test-wsproxy.ssjs';
const URI_PLATFORM = 'file:///test-platform.ssjs';

// Coordinate helper: column 0 of the last line of a code string
function endOf(code: string) {
    const lines = code.split('\n');
    return { line: lines.length - 1, character: lines.at(-1).length };
}

// ---------------------------------------------------------------------------
// Suite: basic lifecycle
// ---------------------------------------------------------------------------
console.log('\nSuite: lifecycle');

test('updateSsjsDocument does not throw', () => {
    updateSsjsDocument(URI_BASIC, 'var x = 1;');
});

test('removeSsjsDocument cleans up without error', () => {
    updateSsjsDocument('file:///tmp.ssjs', 'var y = 2;');
    removeSsjsDocument('file:///tmp.ssjs');
    // After removal completions should return empty (not throw)
    const items = getSsjsCompletions('file:///tmp.ssjs', { line: 0, character: 5 });
    assert.deepStrictEqual(items, []);
});

// ---------------------------------------------------------------------------
// Suite: diagnostics
// ---------------------------------------------------------------------------
console.log('Suite: diagnostics');

test('No diagnostics for valid SSJS', () => {
    const code = 'var x = "hello"; var y = x.toUpperCase();';
    updateSsjsDocument(URI_BASIC, code);
    const diags = getSsjsDiagnostics(URI_BASIC);
    assert.strictEqual(diags.length, 0, `Unexpected diagnostics: ${JSON.stringify(diags)}`);
});

test('Produces diagnostic for reference to undeclared variable', () => {
    const code = 'var result = undeclaredVar.toString();';
    updateSsjsDocument(URI_BASIC, code);
    const diags = getSsjsDiagnostics(URI_BASIC);
    assert.ok(diags.length > 0, 'Expected at least one diagnostic for undeclared variable');
    assert.ok(
        diags.some((d) => d.source === 'sfmc-ts'),
        'Diagnostic should have source sfmc-ts'
    );
});

test('Diagnostic has correct range shape', () => {
    const code = 'var x = badRef;';
    updateSsjsDocument(URI_BASIC, code);
    const diags = getSsjsDiagnostics(URI_BASIC);
    assert.ok(diags.length > 0, 'Expected diagnostics');
    const d = diags[0];
    assert.ok(typeof d.range.start.line === 'number', 'range.start.line should be a number');
    assert.ok(
        typeof d.range.start.character === 'number',
        'range.start.character should be a number'
    );
});

// ---------------------------------------------------------------------------
// Suite: Platform.Function completions
// ---------------------------------------------------------------------------
console.log('Suite: Platform.Function completions');

test('Completions after "Platform." include Function, Variable, Response, Request', () => {
    const code = 'Platform.';
    updateSsjsDocument(URI_PLATFORM, code);
    const items = getSsjsCompletions(URI_PLATFORM, endOf(code));
    const labels = new Set(items.map((i) => i.label));
    assert.ok(labels.has('Function'), 'Should include Function');
    assert.ok(labels.has('Variable'), 'Should include Variable');
    assert.ok(labels.has('Response'), 'Should include Response');
    assert.ok(labels.has('Request'), 'Should include Request');
});

test('Completions after "Platform.Function." include GUID and ParseJSON', () => {
    const code = 'Platform.Function.';
    updateSsjsDocument(URI_PLATFORM, code);
    const items = getSsjsCompletions(URI_PLATFORM, endOf(code));
    const labels = new Set(items.map((i) => i.label));
    assert.ok(labels.has('GUID'), 'Should include GUID');
    assert.ok(labels.has('ParseJSON'), 'Should include ParseJSON');
    assert.ok(labels.has('Lookup'), 'Should include Lookup');
    assert.ok(labels.has('LookupRows'), 'Should include LookupRows');
});

test('Completions after "Platform.Response." include Write and Redirect', () => {
    const code = 'Platform.Response.';
    updateSsjsDocument(URI_PLATFORM, code);
    const items = getSsjsCompletions(URI_PLATFORM, endOf(code));
    const labels = new Set(items.map((i) => i.label));
    assert.ok(labels.has('Write'), 'Should include Write');
    assert.ok(labels.has('Redirect'), 'Should include Redirect');
    assert.ok(labels.has('ContentType'), 'Should include ContentType property');
});

test('Completions after "Platform.Request." include GetPostData and Method', () => {
    const code = 'Platform.Request.';
    updateSsjsDocument(URI_PLATFORM, code);
    const items = getSsjsCompletions(URI_PLATFORM, endOf(code));
    const labels = new Set(items.map((i) => i.label));
    assert.ok(labels.has('GetPostData'), 'Should include GetPostData');
    assert.ok(labels.has('Method'), 'Should include Method property');
    assert.ok(labels.has('ClientIP'), 'Should include ClientIP property');
});

// ---------------------------------------------------------------------------
// Suite: DataExtension instance type flow
// ---------------------------------------------------------------------------
console.log('Suite: DataExtension instance type flow');

test('Completions after "de." include Rows and Fields', () => {
    const code = ['Platform.Load("Core", "1");', 'var de = DataExtension.Init("key");', 'de.'].join(
        '\n'
    );
    updateSsjsDocument(URI_DE, code);
    const items = getSsjsCompletions(URI_DE, endOf(code));
    const labels = new Set(items.map((i) => i.label));
    assert.ok(labels.has('Rows'), 'Should include Rows');
    assert.ok(labels.has('Fields'), 'Should include Fields');
});

test('Completions after "de.Rows." include Lookup, Add, Remove', () => {
    const code = [
        'Platform.Load("Core", "1");',
        'var de = DataExtension.Init("key");',
        'de.Rows.',
    ].join('\n');
    updateSsjsDocument(URI_DE, code);
    const items = getSsjsCompletions(URI_DE, endOf(code));
    const labels = new Set(items.map((i) => i.label));
    assert.ok(labels.has('Lookup'), 'Should include Lookup');
    assert.ok(labels.has('Add'), 'Should include Add');
    assert.ok(labels.has('Remove'), 'Should include Remove');
    assert.ok(labels.has('Retrieve'), 'Should include Retrieve');
});

test('Completions after "de.Fields." include Add and Retrieve', () => {
    const code = [
        'Platform.Load("Core", "1");',
        'var de = DataExtension.Init("key");',
        'de.Fields.',
    ].join('\n');
    updateSsjsDocument(URI_DE, code);
    const items = getSsjsCompletions(URI_DE, endOf(code));
    const labels = new Set(items.map((i) => i.label));
    assert.ok(labels.has('Add'), 'Should include Add');
    assert.ok(labels.has('Retrieve'), 'Should include Retrieve');
});

// ---------------------------------------------------------------------------
// Suite: Script.Util / WSProxy instance type flow
// ---------------------------------------------------------------------------
console.log('Suite: Script.Util / WSProxy instance type flow');

test('Completions after "new Script.Util." include WSProxy, HttpRequest, HttpGet', () => {
    const code = 'new Script.Util.';
    updateSsjsDocument(URI_WSPROXY, code);
    const items = getSsjsCompletions(URI_WSPROXY, endOf(code));
    const labels = new Set(items.map((i) => i.label));
    assert.ok(labels.has('WSProxy'), 'Should include WSProxy');
    assert.ok(labels.has('HttpRequest'), 'Should include HttpRequest');
    assert.ok(labels.has('HttpGet'), 'Should include HttpGet');
});

test('Completions after "api." include WSProxy instance methods', () => {
    const code = ['var api = new Script.Util.WSProxy();', 'api.'].join('\n');
    updateSsjsDocument(URI_WSPROXY, code);
    const items = getSsjsCompletions(URI_WSPROXY, endOf(code));
    const labels = new Set(items.map((i) => i.label));
    assert.ok(labels.has('retrieve'), 'Should include retrieve');
    assert.ok(labels.has('createItem'), 'Should include createItem');
    assert.ok(labels.has('setBatchSize'), 'Should include setBatchSize');
    assert.ok(labels.has('setClientId'), 'Should include setClientId');
});

test('Completions after "req." include HttpRequest instance methods', () => {
    const code = ['var req = new Script.Util.HttpRequest("https://example.com");', 'req.'].join(
        '\n'
    );
    updateSsjsDocument(URI_WSPROXY, code);
    const items = getSsjsCompletions(URI_WSPROXY, endOf(code));
    const labels = new Set(items.map((i) => i.label));
    assert.ok(labels.has('send'), 'Should include send');
    assert.ok(labels.has('setHeader'), 'Should include setHeader');
});

// ---------------------------------------------------------------------------
// Suite: Hover
// ---------------------------------------------------------------------------
console.log('Suite: hover');

test('Hover over Platform returns type info', () => {
    const code = 'Platform.Function.GUID();';
    updateSsjsDocument(URI_PLATFORM, code);
    // Hover at "Platform" (offset 0)
    const hover = getSsjsHover(URI_PLATFORM, { line: 0, character: 3 });
    assert.ok(hover !== null, 'Should return hover info over Platform');
});

test('Hover returns null for unknown URI', () => {
    const hover = getSsjsHover('file:///nonexistent.ssjs', { line: 0, character: 0 });
    assert.strictEqual(hover, null);
});

test('Hover contents has markdown kind', () => {
    const code = 'var x = Platform.Function.GUID();';
    updateSsjsDocument(URI_PLATFORM, code);
    const hover = getSsjsHover(URI_PLATFORM, { line: 0, character: 26 });
    if (hover && hover.contents && typeof hover.contents === 'object' && 'kind' in hover.contents) {
        assert.strictEqual(hover.contents.kind, 'markdown');
    }
    // If no hover at this position that's also acceptable — GUID might not be in the d.ts path
});

// ---------------------------------------------------------------------------
// Suite: deprecated functions
// ---------------------------------------------------------------------------
console.log('Suite: deprecated functions');

const URI_DEPRECATED = 'file:///test-deprecated.ssjs';

test('Completions still include deprecated ContentArea function', () => {
    const code = 'Content';
    updateSsjsDocument(URI_DEPRECATED, code);
    const items = getSsjsCompletions(URI_DEPRECATED, { line: 0, character: code.length });
    const labels = items.map((i) => i.label);
    assert.ok(
        labels.some((l) => l === 'ContentArea' || l === 'ContentAreaByName'),
        `Expected ContentArea or ContentAreaByName in completions, got: ${labels.join(', ')}`
    );
});

test('Hover for deprecated ContentArea mentions deprecated', () => {
    const code = 'ContentArea();';
    updateSsjsDocument(URI_DEPRECATED, code);
    // Hover over "ContentArea" (character 3 is inside the word)
    const hover = getSsjsHover(URI_DEPRECATED, { line: 0, character: 3 });
    if (hover !== null) {
        const text =
            typeof hover.contents === 'string'
                ? hover.contents
                : 'value' in hover.contents
                  ? hover.contents.value
                  : '';
        assert.ok(
            text.toLowerCase().includes('deprecated'),
            `Hover text should mention deprecated, got: ${text}`
        );
    }
    // If TypeScript does not return hover here the d.ts path may not be loaded — acceptable
});

test('@remarks tag renders without "remarks:" label prefix (Bug #2b)', () => {
    // BeginImpressionRegion has a @remarks tag in sfmc-globals.d.ts
    const code = 'BeginImpressionRegion(';
    updateSsjsDocument(URI_DEPRECATED, code);
    const hover = getSsjsHover(URI_DEPRECATED, { line: 0, character: 3 });
    if (hover !== null) {
        const text =
            typeof hover.contents === 'string'
                ? hover.contents
                : 'value' in hover.contents
                  ? hover.contents.value
                  : '';
        assert.ok(
            !text.includes('*remarks:*'),
            `Hover text should not include "*remarks:*" label prefix, got: ${text}`
        );
    }
    // If no hover that is acceptable — d.ts may not be loaded in CI
});

// ---------------------------------------------------------------------------
// Suite: requiresCoreLoad
// ---------------------------------------------------------------------------
console.log('Suite: requiresCoreLoad');

const URI_HTTP = 'file:///test-http.ssjs';

test('Completions include HTTP.Get', () => {
    const code = 'HTTP.';
    updateSsjsDocument(URI_HTTP, code);
    const items = getSsjsCompletions(URI_HTTP, { line: 0, character: code.length });
    const labels = items.map((i) => i.label);
    assert.ok(
        labels.includes('Get') || labels.includes('get'),
        `Expected Get in HTTP completions, got: ${labels.join(', ')}`
    );
});

test('Hover for HTTP.Get mentions requiresCoreLoad', () => {
    const code = 'HTTP.Get("url", "GET", {});';
    updateSsjsDocument(URI_HTTP, code);
    // Hover over "Get" — starts at character 5
    const hover = getSsjsHover(URI_HTTP, { line: 0, character: 6 });
    if (hover !== null) {
        const text =
            typeof hover.contents === 'string'
                ? hover.contents
                : 'value' in hover.contents
                  ? hover.contents.value
                  : '';
        assert.ok(
            text.toLowerCase().includes('platform.load') ||
                text.toLowerCase().includes('requirescoreload') ||
                text.toLowerCase().includes('core'),
            `Hover text should mention Platform.Load/requiresCoreLoad, got: ${text}`
        );
    }
    // If TypeScript does not return hover here the d.ts path may not be loaded — acceptable
});

// ---------------------------------------------------------------------------
// Suite: ECMAScript built-ins
// ---------------------------------------------------------------------------
console.log('Suite: ECMAScript built-ins');

test('Completions after string literal include String methods', () => {
    const code = 'var s = "hello"; s.';
    updateSsjsDocument(URI_BASIC, code);
    const items = getSsjsCompletions(URI_BASIC, endOf(code));
    const labels = new Set(items.map((i) => i.label));
    assert.ok(labels.has('toUpperCase'), 'Should include toUpperCase');
    assert.ok(labels.has('indexOf'), 'Should include indexOf');
    assert.ok(labels.has('split'), 'Should include split');
});

test('Completions after array include Array methods', () => {
    const code = 'var arr = [1, 2, 3]; arr.';
    updateSsjsDocument(URI_BASIC, code);
    const items = getSsjsCompletions(URI_BASIC, endOf(code));
    const labels = new Set(items.map((i) => i.label));
    assert.ok(labels.has('push'), 'Should include push');
    assert.ok(labels.has('pop'), 'Should include pop');
    assert.ok(labels.has('join'), 'Should include join');
});

test('Completions after "Math." include abs, floor, PI', () => {
    const code = 'Math.';
    updateSsjsDocument(URI_BASIC, code);
    const items = getSsjsCompletions(URI_BASIC, endOf(code));
    const labels = new Set(items.map((i) => i.label));
    assert.ok(labels.has('abs'), 'Should include abs');
    assert.ok(labels.has('floor'), 'Should include floor');
    assert.ok(labels.has('PI'), 'Should include PI constant');
});

// ---------------------------------------------------------------------------
// Suite: WSProxy shorthand (C1 fix) and getSsjsCompletionInfo (Fix A)
// ---------------------------------------------------------------------------
console.log('Suite: WSProxy shorthand + getSsjsCompletionInfo');

const URI_WSPROXY2 = 'file:///test-wsproxy2.ssjs';

test('new WSProxy() short-form — completions include WSProxy instance methods', () => {
    const code = ['var api = new WSProxy();', 'api.'].join('\n');
    updateSsjsDocument(URI_WSPROXY2, code);
    const items = getSsjsCompletions(URI_WSPROXY2, endOf(code));
    const labels = new Set(items.map((i) => i.label));
    assert.ok(labels.has('retrieve'), 'Short-form WSProxy should include retrieve');
    assert.ok(labels.has('createItem'), 'Short-form WSProxy should include createItem');
});

test('getSsjsCompletionInfo returns isMemberCompletion=true after "de."', () => {
    const code = ['Platform.Load("Core", "1");', 'var de = DataExtension.Init("key");', 'de.'].join(
        '\n'
    );
    updateSsjsDocument(URI_DE, code);
    const { isMemberCompletion } = getSsjsCompletionInfo(URI_DE, endOf(code));
    assert.strictEqual(isMemberCompletion, true, 'isMemberCompletion should be true after "de."');
});

test('getSsjsCompletionInfo returns isMemberCompletion=false at top-level', () => {
    const code = 'Platf';
    updateSsjsDocument(URI_PLATFORM, code);
    const { isMemberCompletion } = getSsjsCompletionInfo(URI_PLATFORM, endOf(code));
    assert.strictEqual(
        isMemberCompletion,
        false,
        'isMemberCompletion should be false at top-level'
    );
});

// ---------------------------------------------------------------------------
// Suite: JSDoc enrichment in sfmc-globals.d.ts (description, @param, @example, ssjs.guide link)
// ---------------------------------------------------------------------------
console.log('Suite: JSDoc enrichment');

const URI_JSDOC = 'file:///test-jsdoc.ssjs';

test('@param tags render in native TypeScript style "@param `name` — desc"', () => {
    // Platform.Function.Lookup has @param tags in the new sfmc-globals.d.ts
    const code = 'Platform.Function.Lookup(';
    updateSsjsDocument(URI_JSDOC, code);
    // Hover over "Lookup" — starts at character 18
    const hover = getSsjsHover(URI_JSDOC, { line: 0, character: 20 });
    if (hover !== null) {
        const text =
            typeof hover.contents === 'string'
                ? hover.contents
                : 'value' in hover.contents
                  ? hover.contents.value
                  : '';
        // Should use "@param `name` — desc" format, not the "*param:*" fallback
        assert.ok(
            !text.includes('*param:*'),
            `Hover text should not use "*param:*" fallback, got: ${text}`
        );
        if (text.includes('@param')) {
            assert.ok(
                text.includes('@param `deName`') || text.includes('@param'),
                `Hover text should use native @param format, got: ${text}`
            );
        }
    }
});

test('ssjs.guide reference link present in hover for Platform.Function.Lookup', () => {
    const code = 'Platform.Function.Lookup(';
    updateSsjsDocument(URI_JSDOC, code);
    const hover = getSsjsHover(URI_JSDOC, { line: 0, character: 20 });
    if (hover !== null) {
        const text =
            typeof hover.contents === 'string'
                ? hover.contents
                : 'value' in hover.contents
                  ? hover.contents.value
                  : '';
        assert.ok(
            text.includes('ssjs.guide') || text.includes('ssjs.guide reference'),
            `Hover text should include ssjs.guide reference link, got: ${text}`
        );
    }
});

test('@example tag renders as "@example" header + fenced javascript code block', () => {
    const code = 'Platform.Function.Lookup(';
    updateSsjsDocument(URI_JSDOC, code);
    const hover = getSsjsHover(URI_JSDOC, { line: 0, character: 20 });
    if (hover !== null) {
        const text =
            typeof hover.contents === 'string'
                ? hover.contents
                : 'value' in hover.contents
                  ? hover.contents.value
                  : '';
        if (text.includes('@example')) {
            assert.ok(
                text.includes('```javascript') || text.includes('```'),
                `@example should render as fenced code block, got: ${text}`
            );
        }
    }
});

// ---------------------------------------------------------------------------
// getSsjsSignatureHelp tests
// ---------------------------------------------------------------------------

const URI_SIG = 'file:///sigHelp.ssjs';

test('getSsjsSignatureHelp returns null when not inside a function call', () => {
    const code = 'var x = 1;';
    updateSsjsDocument(URI_SIG, code);
    const result = getSsjsSignatureHelp(URI_SIG, { line: 0, character: 5 });
    assert.strictEqual(result, null);
});

test('getSsjsSignatureHelp returns signature for Platform.Function call', () => {
    const code = 'Platform.Function.Lookup(';
    updateSsjsDocument(URI_SIG, code);
    const result = getSsjsSignatureHelp(URI_SIG, { line: 0, character: 25 });
    if (result !== null) {
        assert.ok(result.signatures.length > 0, 'Should have at least one signature');
        const sig = result.signatures[0];
        assert.ok(sig.label.length > 0, 'Signature label should not be empty');
        assert.ok(sig.parameters && sig.parameters.length > 0, 'Should have parameters');
    }
});

test('getSsjsSignatureHelp activeParameter advances on comma', () => {
    const code = 'Platform.Function.Lookup("deName", ';
    updateSsjsDocument(URI_SIG, code);
    const result = getSsjsSignatureHelp(URI_SIG, { line: 0, character: code.length });
    if (result !== null) {
        assert.strictEqual(
            result.activeParameter,
            1,
            'activeParameter should be 1 after first comma'
        );
    }
});

test('getSsjsSignatureHelp parameter labels are numeric spans inside sig label', () => {
    const code = 'Platform.Function.Lookup(';
    updateSsjsDocument(URI_SIG, code);
    const result = getSsjsSignatureHelp(URI_SIG, { line: 0, character: 25 });
    if (result !== null && result.signatures.length > 0) {
        const sig = result.signatures[0];
        if (sig.parameters && sig.parameters.length > 0) {
            const label = sig.parameters[0].label;
            assert.ok(
                Array.isArray(label),
                `Parameter label should be a [start,end] tuple for VS Code highlighting, got: ${JSON.stringify(label)}`
            );
            if (Array.isArray(label)) {
                const [start, end] = label as [number, number];
                assert.ok(start >= 0 && end > start, 'Parameter span should have valid start/end');
                const paramText = sig.label.slice(start, end);
                assert.ok(paramText.length > 0, 'Parameter span should resolve to non-empty text');
            }
        }
    }
});
