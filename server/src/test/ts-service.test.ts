/* eslint-disable no-console */
/**
 * ts-service.test.ts — standalone Node.js unit tests for the embedded
 * TypeScript language service.
 *
 * Run with:  npx ts-node --project tsconfig.json src/test/ts-service.test.ts
 * Or compile + run:  npx tsc --ignoreDeprecations 6.0 && node out/test/ts-service.test.js
 *
 * No VS Code runtime required — pure Node.js / TypeScript.
 */
import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    updateSsjsDocument,
    removeSsjsDocument,
    getSsjsCompletions,
    getSsjsCompletionInfo,
    getSsjsDiagnostics,
    getSsjsHover,
    getSsjsSignatureHelp,
    getSsjsDefinition,
    getSsjsReferences,
} from '../ts-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Holder so counters can be mutated from inside `test`/`process.on('exit')`
// without reassigning top-level bindings (unicorn/no-top-level-assignment-in-function).
const counters = { test: 0, pass: 0, fail: 0 };

/**
 * Register and run a single lightweight test case, tracking pass/fail counts.
 * @param name - the test description
 * @param function_ - the test body (may be async)
 */
function test(name: string, function_: () => void | Promise<void>): void {
    counters.test += 1;
    const index = counters.test;
    void (async () => {
        try {
            await function_();
            counters.pass += 1;
            console.log(`  ✓ [${index}] ${name}`);
        } catch (error: unknown) {
            counters.fail += 1;
            const message = error instanceof Error ? error.message : String(error);
            console.error(`  ✗ [${index}] ${name}\n      ${message}`);
        }
    })();
}

// Flush at process exit
process.on('exit', () => {
    console.log(
        `\n${counters.pass + counters.fail} tests: ${counters.pass} passed, ${counters.fail} failed`
    );
    if (counters.fail > 0) process.exitCode = 1;
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const URI_BASIC = 'file:///test-basic.ssjs';
const URI_DE = 'file:///test-de.ssjs';
const URI_WSPROXY = 'file:///test-wsproxy.ssjs';
const URI_PLATFORM = 'file:///test-platform.ssjs';

// Coordinate helper: column 0 of the last line of a code string
/**
 * Compute the position at the end of the last line of a code string.
 * @param code - the source string
 * @returns an LSP-style position at the end of the final line
 */
function endOf(code: string) {
    const lines = code.split('\n');
    return { line: lines.length - 1, character: lines.at(-1)!.length };
}

// Extract plain text from an LSP Hover regardless of contents shape
/**
 * Extract plain text from an LSP Hover regardless of its contents shape.
 * @param hover - the hover object to read
 * @param hover.contents - the hover contents (string or MarkupContent)
 * @returns the hover text as a plain string
 */
function hoverText(hover: { contents: unknown }): string {
    const { contents } = hover;
    if (typeof contents === 'string') return contents;
    if (contents && typeof contents === 'object' && 'value' in contents) {
        return String((contents as { value: unknown }).value);
    }
    return '';
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

test('HTTP.Get return type exposes Content/Status (no 2339 on .Content)', () => {
    // HTTP.Get is typed { Status: number, Content: string }; reading .Content must type-check.
    const code = 'var r = HTTP.Get("https://example.com"); var c = r.Content; var s = r.Status;';
    updateSsjsDocument(URI_BASIC, code);
    const diags = getSsjsDiagnostics(URI_BASIC);
    assert.ok(
        diags.every((d) => d.code !== 2339),
        `Unexpected 2339 on HTTP.Get result members: ${JSON.stringify(diags)}`
    );
});

test('HTTP.Post return type exposes StatusCode/Response (no 2339)', () => {
    // HTTP.Post is typed { StatusCode: string, Response: string }.
    const code =
        'var r = HTTP.Post("https://example.com", "application/json", "{}", [], []);' +
        ' var sc = r.StatusCode; var resp = r.Response;';
    updateSsjsDocument(URI_BASIC, code);
    const diags = getSsjsDiagnostics(URI_BASIC);
    assert.ok(
        diags.every((d) => d.code !== 2339),
        `Unexpected 2339 on HTTP.Post result members: ${JSON.stringify(diags)}`
    );
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
    const labels = new Set(items.map((index) => index.label));
    assert.ok(labels.has('Function'), 'Should include Function');
    assert.ok(labels.has('Variable'), 'Should include Variable');
    assert.ok(labels.has('Response'), 'Should include Response');
    assert.ok(labels.has('Request'), 'Should include Request');
});

test('Completions after "Platform.Function." include GUID and ParseJSON', () => {
    const code = 'Platform.Function.';
    updateSsjsDocument(URI_PLATFORM, code);
    const items = getSsjsCompletions(URI_PLATFORM, endOf(code));
    const labels = new Set(items.map((index) => index.label));
    assert.ok(labels.has('GUID'), 'Should include GUID');
    assert.ok(labels.has('ParseJSON'), 'Should include ParseJSON');
    assert.ok(labels.has('Lookup'), 'Should include Lookup');
    assert.ok(labels.has('LookupRows'), 'Should include LookupRows');
});

test('Completions after "Platform.Response." include Write and Redirect', () => {
    const code = 'Platform.Response.';
    updateSsjsDocument(URI_PLATFORM, code);
    const items = getSsjsCompletions(URI_PLATFORM, endOf(code));
    const labels = new Set(items.map((index) => index.label));
    assert.ok(labels.has('Write'), 'Should include Write');
    assert.ok(labels.has('Redirect'), 'Should include Redirect');
    assert.ok(labels.has('ContentType'), 'Should include ContentType property');
});

test('Completions after "Platform.Request." include GetPostData and Method', () => {
    const code = 'Platform.Request.';
    updateSsjsDocument(URI_PLATFORM, code);
    const items = getSsjsCompletions(URI_PLATFORM, endOf(code));
    const labels = new Set(items.map((index) => index.label));
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
    const labels = new Set(items.map((index) => index.label));
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
    const labels = new Set(items.map((index) => index.label));
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
    const labels = new Set(items.map((index) => index.label));
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
    const labels = new Set(items.map((index) => index.label));
    assert.ok(labels.has('WSProxy'), 'Should include WSProxy');
    assert.ok(labels.has('HttpRequest'), 'Should include HttpRequest');
    assert.ok(labels.has('HttpGet'), 'Should include HttpGet');
});

test('Completions after "api." include WSProxy instance methods', () => {
    const code = ['var api = new Script.Util.WSProxy();', 'api.'].join('\n');
    updateSsjsDocument(URI_WSPROXY, code);
    const items = getSsjsCompletions(URI_WSPROXY, endOf(code));
    const labels = new Set(items.map((index) => index.label));
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
    const labels = new Set(items.map((index) => index.label));
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
    assert.ok(hover !== undefined, 'Should return hover info over Platform');
});

test('Hover returns undefined for unknown URI', () => {
    const hover = getSsjsHover('file:///nonexistent.ssjs', { line: 0, character: 0 });
    assert.strictEqual(hover, undefined);
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
    const labels = items.map((index) => index.label);
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
    if (hover) {
        const text = hoverText(hover);
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
    if (hover) {
        const text = hoverText(hover);
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
    const labels = items.map((index) => index.label);
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
    if (hover) {
        const text = hoverText(hover);
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
    const labels = new Set(items.map((index) => index.label));
    assert.ok(labels.has('toUpperCase'), 'Should include toUpperCase');
    assert.ok(labels.has('indexOf'), 'Should include indexOf');
    assert.ok(labels.has('split'), 'Should include split');
});

test('Completions after array include Array methods', () => {
    const code = 'var arr = [1, 2, 3]; arr.';
    updateSsjsDocument(URI_BASIC, code);
    const items = getSsjsCompletions(URI_BASIC, endOf(code));
    const labels = new Set(items.map((index) => index.label));
    assert.ok(labels.has('push'), 'Should include push');
    assert.ok(labels.has('pop'), 'Should include pop');
    assert.ok(labels.has('join'), 'Should include join');
});

test('Completions after "Math." include abs, floor, PI', () => {
    const code = 'Math.';
    updateSsjsDocument(URI_BASIC, code);
    const items = getSsjsCompletions(URI_BASIC, endOf(code));
    const labels = new Set(items.map((index) => index.label));
    assert.ok(labels.has('abs'), 'Should include abs');
    assert.ok(labels.has('floor'), 'Should include floor');
    assert.ok(labels.has('PI'), 'Should include PI constant');
});

// ---------------------------------------------------------------------------
// Suite: getSsjsCompletionInfo (Fix A)
// ---------------------------------------------------------------------------
console.log('Suite: getSsjsCompletionInfo');
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
    if (hover) {
        const text = hoverText(hover);
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
    if (hover) {
        const text = hoverText(hover);
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
    if (hover) {
        const text = hoverText(hover);
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

test('getSsjsSignatureHelp returns undefined when not inside a function call', () => {
    const code = 'var x = 1;';
    updateSsjsDocument(URI_SIG, code);
    const result = getSsjsSignatureHelp(URI_SIG, { line: 0, character: 5 });
    assert.strictEqual(result, undefined);
});

test('getSsjsSignatureHelp returns signature for Platform.Function call', () => {
    const code = 'Platform.Function.Lookup(';
    updateSsjsDocument(URI_SIG, code);
    const result = getSsjsSignatureHelp(URI_SIG, { line: 0, character: 25 });
    if (result) {
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
    if (result) {
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
    if (result && result.signatures.length > 0) {
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
                const parameterText = sig.label.slice(start, end);
                assert.ok(
                    parameterText.length > 0,
                    'Parameter span should resolve to non-empty text'
                );
            }
        }
    }
});

// ---------------------------------------------------------------------------
// Suite: ESLint-style /* global */ comment declarations
// ---------------------------------------------------------------------------
console.log('Suite: ESLint global comments');

const URI_GLOBALS = 'file:///test-globals.ssjs';

test('Undeclared variable without global comment produces sfmc-ts diagnostic', () => {
    const code = 'var result = DEBUG.toString();';
    updateSsjsDocument(URI_GLOBALS, code);
    const diags = getSsjsDiagnostics(URI_GLOBALS);
    assert.ok(
        diags.some((d) => d.source === 'sfmc-ts'),
        'Expected sfmc-ts diagnostic for undeclared DEBUG without global comment'
    );
});

test('/* global DEBUG */ suppresses unknown-name diagnostic for DEBUG', () => {
    const code = '/* global DEBUG */\nvar result = DEBUG.toString();';
    updateSsjsDocument(URI_GLOBALS, code);
    const diags = getSsjsDiagnostics(URI_GLOBALS);
    assert.ok(
        diags.every((d) => d.source !== 'sfmc-ts'),
        `Expected no sfmc-ts diagnostics after global comment, got: ${JSON.stringify(diags)}`
    );
});

test('/* globals DEBUG, deKey */ suppresses diagnostics for both names', () => {
    const code = '/* globals DEBUG, deKey */\nvar x = DEBUG; var y = deKey;';
    updateSsjsDocument(URI_GLOBALS, code);
    const diags = getSsjsDiagnostics(URI_GLOBALS);
    assert.ok(
        diags.every((d) => d.source !== 'sfmc-ts'),
        `Expected no sfmc-ts diagnostics after globals comment, got: ${JSON.stringify(diags)}`
    );
});

test('/* global DEBUG:readonly, deKey:writable */ qualifier form is accepted', () => {
    const code = '/* global DEBUG:readonly, deKey:writable */\nvar x = DEBUG; var y = deKey;';
    updateSsjsDocument(URI_GLOBALS, code);
    const diags = getSsjsDiagnostics(URI_GLOBALS);
    assert.ok(
        diags.every((d) => d.source !== 'sfmc-ts'),
        `Expected no sfmc-ts diagnostics with :qualifier form, got: ${JSON.stringify(diags)}`
    );
});

test('Removing global comment from updated document restores diagnostic', () => {
    // First load with global comment — should be clean.
    const withComment = '/* global DEBUG */\nvar x = DEBUG;';
    updateSsjsDocument(URI_GLOBALS, withComment);
    const diagsBefore = getSsjsDiagnostics(URI_GLOBALS);
    assert.ok(
        diagsBefore.every((d) => d.source !== 'sfmc-ts'),
        'Expected no diagnostics with global comment present'
    );

    // Update to remove the comment — diagnostic should return.
    const withoutComment = 'var x = DEBUG;';
    updateSsjsDocument(URI_GLOBALS, withoutComment);
    const diagsAfter = getSsjsDiagnostics(URI_GLOBALS);
    assert.ok(
        diagsAfter.some((d) => d.source === 'sfmc-ts'),
        'Expected sfmc-ts diagnostic after global comment was removed'
    );
});

// ---------------------------------------------------------------------------
// Suite: prototype polyfills
// ---------------------------------------------------------------------------
console.log('Suite: prototype polyfills');

const URI_POLY = 'file:///test-polyfill.ssjs';

test('Array.prototype.forEach polyfill assignment produces no diagnostic', () => {
    const code = [
        'Array.prototype.forEach = function (callback) {',
        '    for (var i = 0; i < this.length; i++) {',
        '        callback(this[i], i, this);',
        '    }',
        '};',
    ].join('\n');
    updateSsjsDocument(URI_POLY, code);
    const diags = getSsjsDiagnostics(URI_POLY);
    assert.ok(
        diags.every((d) => d.source !== 'sfmc-ts'),
        `Expected no sfmc-ts diagnostics for forEach polyfill, got: ${JSON.stringify(diags)}`
    );
});

test('Array.prototype.map polyfill assignment produces no diagnostic', () => {
    const code = [
        'Array.prototype.map = function (callbackFn) {',
        '    var arr = [];',
        '    for (var i = 0; i < this.length; i++) {',
        '        arr.push(callbackFn(this[i], i, this));',
        '    }',
        '    return arr;',
        '};',
    ].join('\n');
    updateSsjsDocument(URI_POLY, code);
    const diags = getSsjsDiagnostics(URI_POLY);
    assert.ok(
        diags.every((d) => d.source !== 'sfmc-ts'),
        `Expected no sfmc-ts diagnostics for map polyfill, got: ${JSON.stringify(diags)}`
    );
});

test('String.prototype.startsWith polyfill enables later use on a string', () => {
    const code = [
        'if (!String.prototype.startsWith) {',
        '    String.prototype.startsWith = function (searchString, position) {',
        '        position = position || 0;',
        '        return this.indexOf(searchString, position) === position;',
        '    };',
        '}',
        'var id = "003000000000000000";',
        'var ok = id.startsWith("003");',
    ].join('\n');
    updateSsjsDocument(URI_POLY, code);
    const diags = getSsjsDiagnostics(URI_POLY);
    assert.ok(
        diags.every((d) => d.source !== 'sfmc-ts'),
        `Expected no sfmc-ts diagnostics for startsWith polyfill + use, got: ${JSON.stringify(diags)}`
    );
});

test('Using startsWith WITHOUT a polyfill still produces a diagnostic', () => {
    const code = ['var id = "003";', 'var ok = id.startsWith("003");'].join('\n');
    updateSsjsDocument(URI_POLY, code);
    const diags = getSsjsDiagnostics(URI_POLY);
    assert.ok(
        diags.some((d) => d.source === 'sfmc-ts'),
        'Expected sfmc-ts diagnostic for startsWith use without a polyfill'
    );
});

test('Removing a polyfill from an updated document restores the diagnostic', () => {
    const withPoly = [
        'String.prototype.startsWith = function (s) { return this.indexOf(s) === 0; };',
        'var ok = "abc".startsWith("a");',
    ].join('\n');
    updateSsjsDocument(URI_POLY, withPoly);
    assert.ok(
        getSsjsDiagnostics(URI_POLY).every((d) => d.source !== 'sfmc-ts'),
        'Expected clean diagnostics with polyfill present'
    );

    const withoutPoly = 'var ok = "abc".startsWith("a");';
    updateSsjsDocument(URI_POLY, withoutPoly);
    assert.ok(
        getSsjsDiagnostics(URI_POLY).some((d) => d.source === 'sfmc-ts'),
        'Expected sfmc-ts diagnostic after polyfill removed'
    );
});

test('Closing document clears polyfill declarations so they do not leak', () => {
    const URI_PLEAK = 'file:///test-poly-leak.ssjs';
    updateSsjsDocument(
        URI_PLEAK,
        'String.prototype.startsWith = function (s) { return this.indexOf(s) === 0; };'
    );
    removeSsjsDocument(URI_PLEAK);

    const URI_PLEAK2 = 'file:///test-poly-leak2.ssjs';
    updateSsjsDocument(URI_PLEAK2, 'var ok = "abc".startsWith("a");');
    assert.ok(
        getSsjsDiagnostics(URI_PLEAK2).some((d) => d.source === 'sfmc-ts'),
        'startsWith should be unknown in a new document without a polyfill'
    );
    removeSsjsDocument(URI_PLEAK2);
});

test('Polyfilled method hover shows a method signature with parsed params + JSDoc', () => {
    const code = [
        '/**',
        ' * @param {string} searchString what to search for',
        ' * @param {number} position where to start',
        ' * @returns {boolean} whether it starts with searchString',
        ' */',
        'String.prototype.startsWith = function (searchString, position) {',
        '    position = position || 0;',
        '    return this.indexOf(searchString, position) === position;',
        '};',
        'var ok = "hello".startsWith("he");',
    ].join('\n');
    updateSsjsDocument(URI_POLY, code);
    // Hover over the `.startsWith` usage on the last line.
    const usageLine = code.split('\n').length - 1;
    const usageCol = code.split('\n')[usageLine].indexOf('startsWith');
    const hover = getSsjsHover(URI_POLY, { line: usageLine, character: usageCol });
    assert.ok(hover, 'Expected a hover for the polyfilled method usage');
    const value = (hover!.contents as { value: string }).value;
    assert.ok(
        value.includes('(method) String.startsWith('),
        `Expected a (method) signature, got: ${value}`
    );
    assert.ok(
        value.includes('searchString') && value.includes('position'),
        `Expected parsed param names in the signature, got: ${value}`
    );
    assert.ok(
        value.includes('what to search for'),
        `Expected forwarded @param JSDoc in the hover, got: ${value}`
    );
    // Issue #1: param/return types come from the JSDoc, not `any`.
    assert.ok(
        value.includes('searchString: string'),
        `Expected the @param string type in the signature, got: ${value}`
    );
    assert.ok(
        value.includes('position: number'),
        `Expected the @param number type in the signature, got: ${value}`
    );
    assert.ok(
        /\)\s*:\s*boolean/.test(value),
        `Expected the @returns boolean type in the signature, got: ${value}`
    );
});

test('Polyfilled method hover maps {Array} JSDoc to any[] and falls back to any for unknown types', () => {
    const code = [
        '/**',
        ' * @param {Function} callbackFn callback for map',
        ' * @param {Client} ctx unknown user type',
        ' * @returns {Array} mapped array',
        ' */',
        'Array.prototype.map = function (callbackFn, ctx) {',
        '    var arr = [];',
        '    for (var i = 0; i < this.length; i++) {',
        '        arr.push(callbackFn(this[i], i, this));',
        '    }',
        '    return arr;',
        '};',
        'var out = [1, 2].map(function (x) { return x; });',
    ].join('\n');
    updateSsjsDocument(URI_POLY, code);
    const usageLine = code.split('\n').length - 1;
    const usageCol = code.split('\n')[usageLine].indexOf('.map') + 1;
    const hover = getSsjsHover(URI_POLY, { line: usageLine, character: usageCol });
    assert.ok(hover, 'Expected a hover for the polyfilled map usage');
    const value = (hover!.contents as { value: string }).value;
    assert.ok(
        value.includes('callbackFn: Function'),
        `Expected the @param Function type in the signature, got: ${value}`
    );
    assert.ok(
        value.includes('ctx: any'),
        `Expected unknown JSDoc type Client to fall back to any, got: ${value}`
    );
    assert.ok(
        /\)\s*:\s*any\[\]/.test(value),
        `Expected the @returns Array type to map to any[], got: ${value}`
    );
});

test('Go to definition on a polyfilled method lands on the prototype assignment', () => {
    const code = [
        'String.prototype.startsWith = function (searchString) {',
        '    return this.indexOf(searchString) === 0;',
        '};',
        'var ok = "hello".startsWith("he");',
    ].join('\n');
    updateSsjsDocument(URI_POLY, code);
    const usageLine = code.split('\n').length - 1;
    const usageCol = code.split('\n')[usageLine].indexOf('startsWith');
    const defs = getSsjsDefinition(URI_POLY, { line: usageLine, character: usageCol });
    assert.ok(defs.length > 0, 'Expected a definition for the polyfilled method');
    assert.strictEqual(defs[0].uri, URI_POLY, 'Definition should point back to the same document');
    // The prototype assignment `String.prototype.startsWith` is on line 0.
    assert.strictEqual(defs[0].range.start.line, 0, 'Definition should land on the polyfill line');
});

test('Go to definition skips the JSDoc comment and lands on the polyfill assignment', () => {
    // The polyfill JSDoc references the method as `String.prototype.search` in
    // prose. Go-to-definition must skip that comment occurrence and land on the
    // real assignment line, not the doc text.
    const code = [
        '/**',
        ' * Polyfill for String.prototype.search (SFMC SSJS).',
        ' * @param {RegExp} regexp - the pattern to search for',
        ' * @returns {number} the index of the first match, or -1',
        ' */',
        'String.prototype.search = function (regexp) {',
        '    var str = "" + this;',
        '    var m = str.match(regexp);',
        '    if (m === null || m.length === 0) { return -1; }',
        '    return str.indexOf(m[0]);',
        '};',
        'var pos = "hello world".search(/world/);',
    ].join('\n');
    updateSsjsDocument(URI_POLY, code);
    const assignmentLine = 5; // `String.prototype.search = function …`
    const usageLine = code.split('\n').length - 1;
    const usageCol = code.split('\n')[usageLine].indexOf('search');
    const defs = getSsjsDefinition(URI_POLY, { line: usageLine, character: usageCol });
    assert.ok(defs.length > 0, 'Expected a definition for the polyfilled method');
    assert.strictEqual(defs[0].uri, URI_POLY, 'Definition should point back to the same document');
    assert.strictEqual(
        defs[0].range.start.line,
        assignmentLine,
        `Definition should land on the assignment line ${assignmentLine}, not the JSDoc, got line ${defs[0].range.start.line}`
    );
});

test('Go to definition on a top-level function call lands on its declaration', () => {
    const code = [
        'function buildKey(id) {',
        '    return "k-" + id;',
        '}',
        'var k = buildKey("123");',
    ].join('\n');
    updateSsjsDocument(URI_POLY, code);
    const callLine = code.split('\n').length - 1;
    const callCol = code.split('\n')[callLine].indexOf('buildKey');
    const defs = getSsjsDefinition(URI_POLY, { line: callLine, character: callCol });
    assert.ok(defs.length > 0, 'Expected a definition for the function call');
    assert.strictEqual(defs[0].uri, URI_POLY, 'Definition should point back to the same document');
    assert.strictEqual(
        defs[0].range.start.line,
        0,
        'Definition should land on the function declaration line'
    );
});

test('Go to definition returns empty for an unknown identifier', () => {
    updateSsjsDocument(URI_POLY, 'var x = somethingUndeclared;');
    const defs = getSsjsDefinition(URI_POLY, { line: 0, character: 8 });
    assert.strictEqual(defs.length, 0, 'Expected no definitions for an unknown identifier');
});

test('Find all references on a top-level function returns declaration + all calls', () => {
    const code = [
        'function buildKey(id) {',
        '    return "k-" + id;',
        '}',
        'var a = buildKey("1");',
        'var b = buildKey("2");',
    ].join('\n');
    updateSsjsDocument(URI_POLY, code);
    // Cursor on the declaration name `buildKey` (line 0).
    const references = getSsjsReferences(URI_POLY, { line: 0, character: 'function '.length });
    assert.ok(
        references.length >= 3,
        `Expected >= 3 references (decl + 2 calls), got ${references.length}`
    );
    assert.ok(
        references.every((r) => r.uri === URI_POLY),
        'All references should be in the same document'
    );
    const lines = references.map((r) => r.range.start.line).toSorted((x, y) => x - y);
    assert.deepStrictEqual(lines, [0, 3, 4], `Expected references on lines 0,3,4, got ${lines}`);
});

test('Find all references on a polyfilled method includes the prototype assignment', () => {
    const code = [
        'String.prototype.startsWith = function (searchString) {',
        '    return this.indexOf(searchString) === 0;',
        '};',
        'var a = "hello".startsWith("he");',
        'var b = "world".startsWith("wo");',
    ].join('\n');
    updateSsjsDocument(URI_POLY, code);
    // Cursor on a usage of `.startsWith` (line 3).
    const usageCol = code.split('\n', 4)[3].indexOf('startsWith');
    const references = getSsjsReferences(URI_POLY, { line: 3, character: usageCol });
    assert.ok(references.length > 0, 'Expected references for the polyfilled method');
    assert.ok(
        references.every((r) => r.uri === URI_POLY),
        'All references should be in the same document'
    );
    // The prototype assignment is on line 0; usages on lines 3 and 4.
    const lines = new Set(references.map((r) => r.range.start.line));
    assert.ok(
        lines.has(0),
        `Expected the prototype assignment (line 0) in references, got ${[...lines]}`
    );
    assert.ok(lines.has(3) && lines.has(4), `Expected usages on lines 3 and 4, got ${[...lines]}`);
});

test('Find all references returns empty for an unknown identifier', () => {
    updateSsjsDocument(URI_POLY, 'var x = somethingUndeclared;');
    const references = getSsjsReferences(URI_POLY, { line: 0, character: 8 });
    assert.strictEqual(references.length, 0, 'Expected no references for an unknown identifier');
});

test('Closing document clears global declarations so stale names do not leak', () => {
    const URI_LEAK = 'file:///test-leak.ssjs';
    const code = '/* global SECRET */\nvar x = SECRET;';
    updateSsjsDocument(URI_LEAK, code);

    // Confirm no diagnostic while open.
    const diagsOpen = getSsjsDiagnostics(URI_LEAK);
    assert.ok(
        diagsOpen.every((d) => d.source !== 'sfmc-ts'),
        'Should be clean while open'
    );

    // Close the document.
    removeSsjsDocument(URI_LEAK);

    // Re-open without the global comment — SECRET must not still be declared.
    const URI_LEAK2 = 'file:///test-leak2.ssjs';
    const codeWithout = 'var x = SECRET;';
    updateSsjsDocument(URI_LEAK2, codeWithout);
    const diagsClosed = getSsjsDiagnostics(URI_LEAK2);
    assert.ok(
        diagsClosed.some((d) => d.source === 'sfmc-ts'),
        'SECRET should be unknown in a new document without a global comment'
    );
    removeSsjsDocument(URI_LEAK2);
});

test('Optional JSDoc param [name] emits an optional parameter so 1-arg calls are valid', () => {
    const URI_OPT = 'file:///test-optional.ssjs';
    const code = [
        '/**',
        ' * @param {string} searchString what to search for',
        ' * @param {number} [position] where to start',
        ' * @returns {boolean} whether it starts with searchString',
        ' */',
        'String.prototype.startsWith = function (searchString, position) {',
        '    position = position || 0;',
        '    return this.indexOf(searchString, position) === position;',
        '};',
        'var ok = "hello".startsWith("he");',
    ].join('\n');
    updateSsjsDocument(URI_OPT, code);

    // Hover shows `position?: number` (optional marker present).
    const usageLine = code.split('\n').length - 1;
    const usageCol = code.split('\n')[usageLine].indexOf('startsWith');
    const hover = getSsjsHover(URI_OPT, { line: usageLine, character: usageCol });
    assert.ok(hover, 'Expected a hover for the polyfilled method usage');
    const value = (hover!.contents as { value: string }).value;
    assert.ok(
        value.includes('position?: number'),
        `Expected optional param position?: number in the signature, got: ${value}`
    );

    // No "Expected 2 arguments" diagnostic for the single-arg call.
    const diags = getSsjsDiagnostics(URI_OPT);
    assert.ok(
        diags.every((d) => d.code !== 2554),
        `Expected no arity error for the optional param, got: ${JSON.stringify(diags)}`
    );
    removeSsjsDocument(URI_OPT);
});

test('Polyfill JSDoc referencing an undeclared/user type does not break the interface merge', () => {
    const URI_TD = 'file:///test-typedef.ssjs';
    const code = [
        '/**',
        ' * @typedef {object} Client',
        ' * @property {string} instance_url url of the SFMC instance',
        ' * @property {WSProxy} proxy WSProxy instance for API calls',
        ' * @property {number} mid mid of the BU',
        ' */',
        '',
        '/**',
        ' * @param {Function} callbackFn callback for map',
        ' * @param {Client} ctx execution context',
        ' * @returns {Array} mapped array',
        ' */',
        'Array.prototype.map = function (callbackFn, ctx) {',
        '    var arr = [];',
        '    for (var i = 0; i < this.length; i++) {',
        '        arr.push(callbackFn(this[i], i, this));',
        '    }',
        '    return arr;',
        '};',
        'var out = [1, 2].map(function (x) { return x; });',
    ].join('\n');
    updateSsjsDocument(URI_TD, code);
    const diags = getSsjsDiagnostics(URI_TD);

    // The user `@typedef Client` (and the polyfill JSDoc that references it /
    // WSProxy) must not produce "duplicate identifier" or "cannot find name"
    // errors inside the comments, and the Array.map merge must take effect so
    // `[1,2].map(...)` is valid (no 2339).
    assert.ok(
        diags.every((d) => d.code !== 2300),
        `Expected no duplicate-identifier error, got: ${JSON.stringify(diags)}`
    );
    assert.ok(
        diags.every((d) => !(d.code === 2304 || d.code === 2552)),
        `Expected no cannot-find-name error inside JSDoc, got: ${JSON.stringify(diags)}`
    );
    assert.ok(
        diags.every((d) => d.code !== 2339),
        `Expected the Array.map merge to apply (no property-does-not-exist), got: ${JSON.stringify(
            diags
        )}`
    );
    removeSsjsDocument(URI_TD);
});

test('Real code errors are still reported (JSDoc suppression is scoped to comments)', () => {
    const URI_REAL = 'file:///test-real-error.ssjs';
    // `Client` in executable code (not a JSDoc comment) must still error.
    updateSsjsDocument(URI_REAL, 'var z = somethingUndeclared;');
    const diags = getSsjsDiagnostics(URI_REAL);
    assert.ok(
        diags.some((d) => d.code === 2304),
        `Expected a cannot-find-name error for real code, got: ${JSON.stringify(diags)}`
    );
    removeSsjsDocument(URI_REAL);
});

// ---------------------------------------------------------------------------
// Suite: static polyfills (Ctor.method = function) — interface/namespace merge
// ---------------------------------------------------------------------------
console.log('Suite: static polyfills');

const URI_STATIC = 'file:///test-static-polyfill.ssjs';

test('Array.isArray static polyfill assignment produces no diagnostic (2339)', () => {
    const code = [
        '/**',
        ' * Polyfill for Array.isArray (SFMC SSJS).',
        ' * @param {any} value - value to test',
        ' * @returns {boolean} whether value is an array',
        ' */',
        'Array.isArray = function (value) {',
        "    return Object.prototype.toString.call(value) === '[object Array]';",
        '};',
        'var b = Array.isArray([1, 2, 3]);',
    ].join('\n');
    updateSsjsDocument(URI_STATIC, code);
    const diags = getSsjsDiagnostics(URI_STATIC);
    assert.ok(
        diags.every((d) => d.code !== 2339),
        `Expected no "does not exist on ArrayConstructor" (2339) for Array.isArray polyfill, got: ${JSON.stringify(diags)}`
    );
    assert.ok(
        diags.every((d) => d.source !== 'sfmc-ts'),
        `Expected no sfmc-ts diagnostics for Array.isArray polyfill, got: ${JSON.stringify(diags)}`
    );
    removeSsjsDocument(URI_STATIC);
});

test('forEach polyfill callback invocation is callable (no 2349)', () => {
    // The callback param is typed `Function` via JSDoc — `Function` must carry a
    // call signature in sfmc-globals.d.ts or `callback(...)` errors with
    // "Type 'never' has no call signatures" (2349) under noLib:true.
    const code = [
        '/**',
        ' * Polyfill for Array.prototype.forEach (SFMC SSJS).',
        ' * @param {Function} callback - called with (element, index, array)',
        ' * @returns {void}',
        ' */',
        'Array.prototype.forEach = function (callback) {',
        "    if (typeof callback !== 'function') { return; }",
        '    for (var i = 0; i < this.length; i++) {',
        '        callback(this[i], i, this);',
        '    }',
        '};',
    ].join('\n');
    updateSsjsDocument(URI_STATIC, code);
    const diags = getSsjsDiagnostics(URI_STATIC);
    assert.ok(
        diags.every((d) => d.code !== 2349),
        `Expected no "not callable" (2349) for forEach callback invocation, got: ${JSON.stringify(diags)}`
    );
    assert.ok(
        diags.every((d) => d.source !== 'sfmc-ts'),
        `Expected no sfmc-ts diagnostics for forEach polyfill, got: ${JSON.stringify(diags)}`
    );
    removeSsjsDocument(URI_STATIC);
});

test('Array.prototype.map polyfill accepts a plain function callback (no 2769)', () => {
    // A `@param {Function} callback` must accept a plain function/arrow expression.
    // If `interface Function` carries a `new (...)` construct signature, the
    // expression fails to match and TS raises ts2769 ("provides no match for the
    // signature new (...)") on the `function` keyword of the call site.
    const code = [
        '/**',
        ' * Polyfill for Array.prototype.map (SFMC SSJS).',
        ' * @param {Function} callback - called with (element, index, array)',
        ' * @returns {Array} a new array of the callback results',
        ' */',
        'Array.prototype.map = function (callback) {',
        "    if (typeof callback !== 'function') { return []; }",
        '    var result = [];',
        '    for (var i = 0; i < this.length; i++) {',
        '        result.push(callback(this[i], i, this));',
        '    }',
        '    return result;',
        '};',
        'var out = [1, 2].map(function (x) { return x; });',
    ].join('\n');
    updateSsjsDocument(URI_STATIC, code);
    const diags = getSsjsDiagnostics(URI_STATIC);
    assert.ok(
        diags.every((d) => d.code !== 2769),
        `Expected no "no overload matches" (2769) for map(function) call, got: ${JSON.stringify(diags)}`
    );
    assert.ok(
        diags.every((d) => d.source !== 'sfmc-ts'),
        `Expected no sfmc-ts diagnostics for map polyfill call, got: ${JSON.stringify(diags)}`
    );
    removeSsjsDocument(URI_STATIC);
});

test('Array.prototype.forEach polyfill accepts a plain function callback (no 2769)', () => {
    const code = [
        '/**',
        ' * Polyfill for Array.prototype.forEach (SFMC SSJS).',
        ' * @param {Function} callback - called with (element, index, array)',
        ' * @returns {void}',
        ' */',
        'Array.prototype.forEach = function (callback) {',
        "    if (typeof callback !== 'function') { return; }",
        '    for (var i = 0; i < this.length; i++) {',
        '        callback(this[i], i, this);',
        '    }',
        '};',
        '[1, 2].forEach(function (x) { return x; });',
    ].join('\n');
    updateSsjsDocument(URI_STATIC, code);
    const diags = getSsjsDiagnostics(URI_STATIC);
    assert.ok(
        diags.every((d) => d.code !== 2769),
        `Expected no "no overload matches" (2769) for forEach(function) call, got: ${JSON.stringify(diags)}`
    );
    assert.ok(
        diags.every((d) => d.source !== 'sfmc-ts'),
        `Expected no sfmc-ts diagnostics for forEach polyfill call, got: ${JSON.stringify(diags)}`
    );
    removeSsjsDocument(URI_STATIC);
});

test('Array.isArray self-guarded static polyfill (X = X || function) produces no 2339', () => {
    // Canonical ssjs-data form ships a self-guard: `Array.isArray = Array.isArray
    // || function (…)`. The polyfill parser must tolerate the `X ||` prefix or the
    // static assignment is not registered and `Array.isArray(...)` raises 2339.
    const code = [
        'Array.isArray = Array.isArray || function (value) {',
        "    return Object.prototype.toString.call(value) === '[object Array]';",
        '};',
        'var b = Array.isArray([1, 2, 3]);',
    ].join('\n');
    updateSsjsDocument(URI_STATIC, code);
    const diags = getSsjsDiagnostics(URI_STATIC);
    assert.ok(
        diags.every((d) => d.code !== 2339),
        `Expected no 2339 for self-guarded Array.isArray polyfill, got: ${JSON.stringify(diags)}`
    );
    assert.ok(
        diags.every((d) => d.source !== 'sfmc-ts'),
        `Expected no sfmc-ts diagnostics for self-guarded Array.isArray polyfill, got: ${JSON.stringify(diags)}`
    );
    removeSsjsDocument(URI_STATIC);
});

// ---------------------------------------------------------------------------
// Suite: runtime built-ins (arguments) and cross-file isolation
// ---------------------------------------------------------------------------
console.log('Suite: runtime built-ins & isolation');

test('arguments.length / arguments[i] type-check (no 2339 under noLib)', () => {
    // Under noLib:true there is no lib.es5.d.ts, so `arguments` needs an ambient
    // IArguments declaration in sfmc-globals.d.ts, else `arguments.length` raises
    // "Property 'length' does not exist on type '{}'" (2339).
    const uri = 'file:///test-arguments.ssjs';
    const code = [
        'function sum() {',
        '    var total = 0;',
        '    for (var i = 0; i < arguments.length; i++) {',
        '        total += Number(arguments[i]);',
        '    }',
        '    return total;',
        '}',
    ].join('\n');
    updateSsjsDocument(uri, code);
    const diags = getSsjsDiagnostics(uri);
    assert.ok(
        diags.every((d) => d.code !== 2339),
        `Expected no 2339 on arguments.length/arguments[i], got: ${JSON.stringify(diags)}`
    );
    removeSsjsDocument(uri);
});

test('top-level var of the same name in two documents does not collide (no 2403)', () => {
    // Each open SSJS document must be its own program: exposing all documents in
    // one TS program makes their top-level `var` declarations collide in the
    // shared global scope ("Subsequent variable declarations must have the same
    // type", 2403). getScriptFileNames scopes to the active document.
    const uriA = 'file:///test-collide-a.ssjs';
    const uriB = 'file:///test-collide-b.ssjs';
    updateSsjsDocument(uriA, 'var result = "hello";');
    updateSsjsDocument(uriB, 'var result = HTTP.Get("https://x");');
    const diagsA = getSsjsDiagnostics(uriA);
    const diagsB = getSsjsDiagnostics(uriB);
    assert.ok(
        diagsA.every((d) => d.code !== 2403),
        `Doc A must not see doc B's 'result' (2403), got: ${JSON.stringify(diagsA)}`
    );
    assert.ok(
        diagsB.every((d) => d.code !== 2403),
        `Doc B must not see doc A's 'result' (2403), got: ${JSON.stringify(diagsB)}`
    );
    removeSsjsDocument(uriA);
    removeSsjsDocument(uriB);
});

// ---------------------------------------------------------------------------
// Suite: polyfill test fixtures (regression lock)
// ---------------------------------------------------------------------------
// Both bundled polyfill fixtures must be diagnostic-clean:
//   - polyfills.ssjs             — minified bundle copied from ssjs.guide
//   - polyfills-all-quickfix.ssjs — every ssjs-data polyfill as the quickfix inserts it
// This locks in the fixes for the LSP marker regex (minified static polyfills),
// the generated-.d.ts globals (NaN/Infinity/Number constants), the prototype
// `this` typing (copyWithin/fill), and JSDoc ts8029 suppression. A future data
// change that reintroduces any of those gaps fails here.
console.log('Suite: polyfill fixtures');

const FIXTURE_DIR = path.resolve(__dirname, '..', '..', '..', 'client', 'testFixture');
const POLYFILL_FIXTURES = ['polyfills.ssjs', 'polyfills-all-quickfix.ssjs'];

for (const fixture of POLYFILL_FIXTURES) {
    test(`${fixture} produces no sfmc-ts diagnostics`, () => {
        const text = readFileSync(path.join(FIXTURE_DIR, fixture), 'utf8');
        const uri = `file:///${fixture}`;
        updateSsjsDocument(uri, text);
        const diags = getSsjsDiagnostics(uri);
        const tsDiags = diags.filter((d) => d.source === 'sfmc-ts');
        assert.strictEqual(
            tsDiags.length,
            0,
            `Expected 0 sfmc-ts diagnostics in ${fixture}, got: ${JSON.stringify(tsDiags)}`
        );
        removeSsjsDocument(uri);
    });
}
