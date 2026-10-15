import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { BrowserJsService, BROWSER_LIBRARY_FILES } from '../browser-js-service';

const libraries = path.dirname(require.resolve('typescript'));
const uri = 'file:///browser.amp';

/**
 * Run a request against a disposable document-local browser program.
 * @param text - Mixed source text.
 * @param callback - Assertions with original-position lookup.
 */
function fixture(
    text: string,
    callback: (
        service: BrowserJsService,
        position: (needle: string, shift?: number) => { line: number; character: number }
    ) => void
): void {
    const service = new BrowserJsService(libraries);
    const document = TextDocument.create(uri, 'sfmc', 1, text);
    service.updateDocument(uri, text);
    try {
        for (const diagnostic of service.getDiagnostics(uri)) {
            assert.equal(diagnostic.source, 'javascript');
            assert.equal(Object.hasOwn(diagnostic, 'code'), false);
            assert.equal(Object.hasOwn(diagnostic, 'codeDescription'), false);
        }
        callback(service, (needle, shift = 0) => {
            const offset = text.indexOf(needle);
            assert.notEqual(offset, -1);
            return document.positionAt(offset + shift);
        });
    } finally {
        service.dispose();
    }
}

test('standard DOM and modern ES intelligence without SFMC globals', () => {
    fixture(
        '<script>const result = [1]?.map(n => n + 1); document.</script>',
        (service, position) => {
            const items = service.getCompletions(uri, position('document.', 9));
            assert.ok(items.some((item) => item.label === 'querySelector'));
            assert.ok(service.getHover(uri, position('document')));
            assert.ok(items.every((item) => item.label !== 'Platform'));
        }
    );
    fixture(
        '<script>// @ts-check\nPromise.resolve(1); document.title; Platform.Load("Core");</script>',
        (service) => {
            const diagnostics = service.getDiagnostics(uri);
            assert.equal(diagnostics.length, 1);
            assert.match(String(diagnostics[0].message), /Platform/);
        }
    );
    assert.ok(BROWSER_LIBRARY_FILES.includes('lib.dom.d.ts'));
});

test('syntax diagnostics enabled, type checking opt-in and directives respected', () => {
    fixture('<script>function unfinished() {</script>', (service) =>
        assert.ok(service.getDiagnostics(uri).length > 0)
    );
    fixture('<script>const bad = ;</script>', (service, position) => {
        const diagnostics = service.getDiagnostics(uri);
        assert.equal(diagnostics.length, 1);
        assert.equal(diagnostics[0].message, 'Expression expected.');
        assert.deepEqual(diagnostics[0].range, {
            start: position(';'),
            end: position(';', 1),
        });
        assert.equal(diagnostics[0].severity, 1);
    });
    fixture('<script>document.missingBrowserMember();</script>', (service) =>
        assert.equal(service.getDiagnostics(uri).length, 0)
    );
    fixture(
        '<script>// @ts-check\ndocument.missingBrowserMember();</script>',
        (service, position) => {
            const diagnostics = service.getDiagnostics(uri);
            assert.equal(diagnostics.length, 1);
            assert.equal(
                diagnostics[0].message,
                "Property 'missingBrowserMember' does not exist on type 'Document'."
            );
            assert.deepEqual(diagnostics[0].range, {
                start: position('missingBrowserMember'),
                end: position('missingBrowserMember', 'missingBrowserMember'.length),
            });
            assert.equal(diagnostics[0].severity, 1);
        }
    );
    fixture('<script>// @ts-nocheck\ndocument.missingBrowserMember();</script>', (service) =>
        assert.equal(service.getDiagnostics(uri).length, 0)
    );
});

test('classic scripts share symbols, signatures and document-local navigation', () => {
    const text =
        '<p>😀</p>\r\n<script>function greet(name) { return name; }</script>\r\n<script>greet("x");</script>';
    fixture(text, (service, position) => {
        const definition = service.getDefinition(uri, position('greet("x")'));
        assert.equal(definition.length, 1);
        assert.deepEqual(definition[0].range.start, position('greet(name)'));
        assert.equal(definition[0].uri, uri);
        assert.equal(service.getReferences(uri, position('greet(name)')).length, 2);
        assert.ok(
            service
                .getSignatureHelp(uri, position('greet("x")', 6))
                ?.signatures[0].label.includes('name')
        );
        assert.equal(service.getDefinition(uri, position('<p>')).length, 0);
    });
});

test('modules stay isolated from classic scripts and other modules', () => {
    const text =
        '<script>const sharedClassic = 1;</script><script type="module">// @ts-check\nconst privateModule = sharedClassic; privateModule;</script><script type="module">// @ts-check\nprivateModule;</script><script>// @ts-check\nprivateModule; sharedClassic;</script>';
    fixture(text, (service, position) => {
        const diagnostics = service.getDiagnostics(uri);
        assert.equal(
            diagnostics.filter((diagnostic) => /privateModule/.test(String(diagnostic.message)))
                .length,
            2
        );
        assert.ok(
            diagnostics.every((diagnostic) => !/sharedClassic/.test(String(diagnostic.message)))
        );
        assert.equal(service.getDefinition(uri, position('privateModule =')).length, 1);
    });
});

test('open documents never share browser declarations; removal and updates clear programs', () => {
    fixture('<script>const secret = 1;</script>', (service) => {
        const other = 'file:///other.html';
        service.updateDocument(other, '<script>// @ts-check\nsecret;</script>');
        assert.ok(
            service
                .getDiagnostics(other)
                .some((diagnostic) => /secret/.test(String(diagnostic.message)))
        );
        service.updateDocument(uri, '<script>// @ts-check\nsecret;</script>');
        assert.ok(
            service
                .getDiagnostics(uri)
                .some((diagnostic) => /secret/.test(String(diagnostic.message)))
        );
        service.removeDocument(uri);
        assert.equal(service.getDiagnostics(uri).length, 0);
        assert.deepEqual(service.getCompletions(uri, { line: 0, character: 8 }), []);
        service.updateDocument(other, '<script runat="server">Platform.Load("Core");</script>');
        assert.deepEqual(service.getDiagnostics(other), []);
    });
});

test('server scripts, AMPscript tags and JSON never enter the browser environment', () => {
    fixture(
        '<script runat="server">var leakedServer = 1;</script><script language="ampscript">SET @x = 1</script><script type="application/json">{"data":1}</script><script>// @ts-check\nleakedServer;</script>',
        (service, position) => {
            assert.equal(service.getHover(uri, position('leakedServer =')), undefined);
            assert.equal(service.getDiagnostics(uri).length, 1);
            assert.match(String(service.getDiagnostics(uri)[0].message), /leakedServer/);
        }
    );
});

test('quoted template interpolations preserve UTF-16 offsets and template ownership', () => {
    const text =
        '<p>😀</p>\r\n<script>// @ts-check\r\nconst amp = "%%=Concat("a","b")=%%"; const hbs = "{{{value}}}";\r\ndocument.missingMember();</script>';
    fixture(text, (service, position) => {
        const diagnostics = service.getDiagnostics(uri);
        assert.equal(diagnostics.length, 1);
        assert.deepEqual(diagnostics[0].range.start, position('missingMember'));
        assert.equal(service.getHover(uri, position('Concat')), undefined);
        assert.deepEqual(service.getCompletions(uri, position('value')), []);
        assert.deepEqual(service.getDefinition(uri, position('value')), []);
    });
});

test('unquoted dynamic template output is excluded without invented replacement semantics', () => {
    fixture(
        '<script>const generated = %%=v(@x)=%%; document.</script><script>document.</script>',
        (service, position) => {
            assert.deepEqual(service.getCompletions(uri, position('document.', 9)), []);
            assert.equal(
                service
                    .getDiagnostics(uri)
                    .filter((diagnostic) => diagnostic.range.start.character < 60).length,
                0
            );
        }
    );
});

test('quoted and commented MCN bindings are masked without losing browser intelligence', () => {
    fixture(
        '<p>😀</p>\r\n<script>// @ts-check\r\nconst value = "{!$Content.Value}"; /* {!$Content.Other} */\r\n// {!$Content.Comment}\r\ndocument.missingMember(); document.title;</script>',
        (service, position) => {
            const diagnostics = service.getDiagnostics(uri);
            assert.equal(diagnostics.length, 1);
            assert.deepEqual(diagnostics[0].range.start, position('missingMember'));
            assert.ok(service.getHover(uri, position('document.title')));
            for (const binding of ['Content.Value', 'Content.Other', 'Content.Comment']) {
                assert.equal(service.getHover(uri, position(binding)), undefined);
                assert.deepEqual(service.getCompletions(uri, position(binding)), []);
                assert.equal(service.getSignatureHelp(uri, position(binding)), undefined);
                assert.deepEqual(service.getDefinition(uri, position(binding)), []);
                assert.deepEqual(service.getReferences(uri, position(binding)), []);
            }
        }
    );
});

test('unquoted and incomplete MCN bindings skip only their browser script', () => {
    for (const body of [
        'const generated = {!$Content.Value}; document.title;',
        'const generated = {!$Content.Value; document.title;',
        'const generated = "{!$Content.Value"; document.title;',
        '// {!$Content.Value\ndocument.title;',
    ]) {
        fixture(
            `<script>${body}</script><script>document.querySelector("body");</script>`,
            (service, position) => {
                assert.deepEqual(service.getDiagnostics(uri), []);
                assert.equal(service.getHover(uri, position('document.title')), undefined);
                assert.deepEqual(service.getCompletions(uri, position('Content.Value')), []);
                assert.ok(service.getHover(uri, position('querySelector')));
            }
        );
    }
});

test('external module imports do not crawl filesystem or create navigation targets', () => {
    fixture(
        '<script type="module">// @ts-check\nimport { x } from "./outside.js"; x; document.title;</script>',
        (service, position) => {
            const definitions = service.getDefinition(uri, position('x; document'));
            assert.ok(definitions.every((definition) => definition.uri === uri));
            assert.deepEqual(definitions[0]?.range.start, position('x } from'));
            const diagnostic = service
                .getDiagnostics(uri)
                .find((item) => /Cannot find module/.test(String(item.message)));
            assert.ok(diagnostic);
            assert.match(String(diagnostic.message), /Cannot find module '\.\/outside\.js'/);
            assert.deepEqual(diagnostic.range, {
                start: position('"./outside.js"'),
                end: position('"./outside.js"', '"./outside.js"'.length),
            });
            assert.equal(diagnostic.severity, 1);
            assert.deepEqual(service.getDefinition(uri, position('document.title')), []);
        }
    );
});

test('manual release fixtures exercise DOM, module isolation and generated-output boundaries', () => {
    const directory = path.resolve(__dirname, '../../../client/testFixture/release-3.7.0');
    for (const filename of ['browser.amp', 'browser.html']) {
        const text = readFileSync(path.join(directory, filename), 'utf8');
        fixture(text, (service, position) => {
            const firstDom = position('document.querySelector', 'document.'.length);
            assert.ok(
                service.getCompletions(uri, firstDom).some((item) => item.label === 'querySelector')
            );
            assert.ok(service.getHover(uri, position('querySelector')));
            assert.ok(
                service.getSignatureHelp(uri, position('querySelector(', 'querySelector('.length))
            );
            const diagnostics = service.getDiagnostics(uri);
            assert.ok(
                diagnostics.some((item) => /releaseMissingMember/.test(String(item.message)))
            );
            const generatedOffset = text.indexOf('const generated');
            const skippedDom = text.indexOf('document.querySelector', generatedOffset);
            const document = TextDocument.create(uri, 'sfmc', 1, text);
            assert.deepEqual(service.getCompletions(uri, document.positionAt(skippedDom + 9)), []);
            if (filename.endsWith('.amp')) {
                assert.ok(diagnostics.some((item) => /releasePrivate/.test(String(item.message))));
                assert.equal(
                    service.getDefinition(uri, position('releaseGreet(releaseClassic)')).length,
                    1
                );
                const lastDom = text.lastIndexOf('document.querySelector');
                assert.ok(service.getHover(uri, document.positionAt(lastDom)));
            } else {
                assert.ok(diagnostics.some((item) => /releaseClassic/.test(String(item.message))));
                const diagnostic = diagnostics.find(
                    (item) => item.message === 'Expression expected.'
                );
                assert.ok(diagnostic);
                assert.deepEqual(diagnostic.range, {
                    start: position('const syntaxError = ;', 'const syntaxError = '.length),
                    end: position('const syntaxError = ;', 'const syntaxError = ;'.length),
                });
            }
        });
    }
});

test('missing packaged libraries fail visibly', () => {
    assert.throws(
        () => new BrowserJsService(path.join(__dirname, 'missing-browser-libs')),
        /ENOENT/
    );
});
