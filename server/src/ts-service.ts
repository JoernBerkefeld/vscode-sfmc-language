/**
 * ts-service.ts
 *
 * Embedded TypeScript language service for SSJS files.
 *
 * Loads sfmc-globals.d.ts as the sole built-in library (noLib:true) so the
 * compiler only knows about the SFMC-supported API surface.  Each open SSJS
 * document is tracked in a virtual JS file, and the service exposes helpers
 * that return LSP-typed results ready to merge into the server handlers.
 */
import * as ts from 'typescript';
import * as fs from 'node:fs';
// eslint-disable-next-line unicorn/import-style
import * as path from 'node:path';

import {
    CompletionItem,
    CompletionItemKind,
    Diagnostic,
    DiagnosticSeverity,
    Hover,
    Location,
    MarkupContent,
    Position,
    Range,
    SignatureHelp,
    SignatureInformation,
    ParameterInformation,
} from 'vscode-languageserver/node';

// ---------------------------------------------------------------------------
// Globals d.ts loading
// ---------------------------------------------------------------------------

const GLOBALS_FILENAME = '__sfmc_globals.d.ts';

/**
 * Load the bundled SSJS globals `.d.ts` content used to type the virtual files.
 * @returns the globals declaration file content as a string
 */
function loadGlobalsContent(): string {
    // Resolve the path to ssjs-data via require if possible (handles hoisted installs)
    let resolvedPackagePath: string | undefined;
    try {
        resolvedPackagePath = require.resolve('ssjs-data/package.json');
    } catch {
        // ssjs-data not resolvable via require
    }

    const candidates: string[] = [
        // 1. Installed extension — file copied here by vscode:prepublish (__dirname = server/out/)
        path.resolve(__dirname, 'sfmc-globals.d.ts'),
        // 2. Dev mode — direct sibling install in server/node_modules
        path.resolve(__dirname, '..', 'node_modules', 'ssjs-data', 'dist', 'sfmc-globals.d.ts'),
        // 3. Module-resolution lookup (handles hoisted or alternate install locations)
        ...(resolvedPackagePath
            ? [path.join(path.dirname(resolvedPackagePath), 'dist', 'sfmc-globals.d.ts')]
            : []),
        // 4. Workspace sibling — __dirname is server/out at runtime
        path.resolve(__dirname, '..', '..', '..', 'ssjs-data', 'dist', 'sfmc-globals.d.ts'),
    ];

    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) {
                return fs.readFileSync(p, 'utf8');
            }
        } catch {
            // try next
        }
    }

    return '// sfmc-globals.d.ts not found — SFMC type checking disabled';
}

const GLOBALS_CONTENT = loadGlobalsContent();

// ---------------------------------------------------------------------------
// Virtual file system
// ---------------------------------------------------------------------------

interface VirtualFile {
    content: string;
    version: number;
    snapshot: ts.IScriptSnapshot;
}

const virtualFiles = new Map<string, VirtualFile>([
    [
        GLOBALS_FILENAME,
        {
            content: GLOBALS_CONTENT,
            version: 1,
            snapshot: ts.ScriptSnapshot.fromString(GLOBALS_CONTENT),
        },
    ],
]);

/**
 * Create or update a virtual in-memory file, bumping its version and snapshot.
 * @param name - the virtual filename
 * @param content - the file content
 */
function setVirtualFile(name: string, content: string): void {
    const existing = virtualFiles.get(name);
    virtualFiles.set(name, {
        content,
        version: (existing?.version ?? 0) + 1,
        snapshot: ts.ScriptSnapshot.fromString(content),
    });
}

// ---------------------------------------------------------------------------
// URI → virtual filename mapping
// Each SSJS document gets a stable synthetic .js filename so the TS service
// can process it (TS only handles .js/.ts/.d.ts extensions).
// Each document may also have a companion .globals.d.ts file that holds
// ambient declarations derived from ESLint-style /* global NAME */ comments.
// ---------------------------------------------------------------------------

// Holder so the counter can be bumped without reassigning a top-level variable
// inside a function (unicorn/no-top-level-assignment-in-function).
const counters = { document: 0 };
// The document the language service is currently answering for. Only this
// document's virtual files (plus the shared globals) are exposed to TypeScript
// via getScriptFileNames, so top-level `var` declarations in *other* open SSJS
// documents cannot collide with this one (which otherwise raises ts2403
// "Subsequent variable declarations must have the same type").
const activeDocument: { js: string | undefined } = { js: undefined };
const uriToVirtualName = new Map<string, string>();
const uriToGlobalsName = new Map<string, string>();
const uriToPolyfillsName = new Map<string, string>();

/**
 * Get (or lazily assign) the stable synthetic `.js` filename for a document URI.
 * @param uri - the LSP document URI
 * @returns the virtual `.js` filename for that document
 */
function virtualNameForUri(uri: string): string {
    let name = uriToVirtualName.get(uri);
    if (!name) {
        name = `__doc_${counters.document}.js`;
        counters.document += 1;
        uriToVirtualName.set(uri, name);
    }
    return name;
}

/**
 * Mark a document's virtual `.js` file as the one the language service should
 * answer for. Only this document (plus the shared globals) is exposed via
 * `getScriptFileNames`, isolating its top-level declarations from other open
 * SSJS documents (prevents ts2403 cross-file `var` collisions).
 * @param name - the active document's virtual `.js` filename, or undefined
 */
function setActiveDocument(name: string | undefined): void {
    activeDocument.js = name;
}

/**
 * Reverse lookup: map a virtual filename produced by `virtualNameForUri` (or its
 * `.polyfills.d.ts` / `.globals.d.ts` companions) back to the originating LSP
 * document URI. Returns undefined for the shared globals file or unknown names.
 * @param fileName - virtual filename from the TS language service
 * @returns the originating document URI, or undefined
 */
function uriForVirtualName(fileName: string): string | undefined {
    // Companion files share the document's counter; normalize to the base .js name.
    const base = fileName.replace(/\.polyfills\.d\.ts$/, '.js').replace(/\.globals\.d\.ts$/, '.js');
    for (const [uri, name] of uriToVirtualName) {
        if (name === base) return uri;
    }
    return undefined;
}

/**
 * Get (or lazily assign) the companion `.globals.d.ts` filename for a document.
 * @param uri - the LSP document URI
 * @returns the virtual globals declaration filename for that document
 */
function globalsNameForUri(uri: string): string {
    let name = uriToGlobalsName.get(uri);
    if (!name) {
        // Derived from the JS virtual name so the two always share the same counter.
        const documentName = virtualNameForUri(uri);
        name = documentName.replace(/\.js$/, '.globals.d.ts');
        uriToGlobalsName.set(uri, name);
    }
    return name;
}

/**
 * Get (or lazily assign) the companion `.polyfills.d.ts` filename for a document.
 * @param uri - the LSP document URI
 * @returns the virtual polyfills declaration filename for that document
 */
function polyfillsNameForUri(uri: string): string {
    let name = uriToPolyfillsName.get(uri);
    if (!name) {
        // Derived from the JS virtual name so the two always share the same counter.
        const documentName = virtualNameForUri(uri);
        name = documentName.replace(/\.js$/, '.polyfills.d.ts');
        uriToPolyfillsName.set(uri, name);
    }
    return name;
}

// ---------------------------------------------------------------------------
// ESLint global comment parser
// ---------------------------------------------------------------------------

/**
 * Parses ESLint-style global comments from SSJS source text and returns a
 * TypeScript ambient declaration string for all declared names.
 *
 * Supported forms:
 *   /* global DEBUG, deKey * /
 *   /* globals DEBUG, deKey * /
 *   /* global DEBUG:readonly, deKey:writable * /
 *
 * Qualifiers (`:readonly`, `:writable`) are accepted for ESLint compatibility
 * but ignored — all names are declared as `any` for the TS checker.
 *
 * Returns an empty string when no global comments are present.
 * @param text - SSJS source text to scan
 * @returns TypeScript `declare var` statements, or an empty string
 */
function parseGlobalCommentDeclarations(text: string): string {
    // Matches: /* global[s] <body> */  — non-greedy, allows multiline bodies.
    const GLOBAL_COMMENT = /\/\*\s*globals?\s+([\s\S]*?)\*\//g;
    // Conservative ASCII JS identifier — rejects anything that looks like a
    // qualifier fragment or punctuation that slipped through the split.
    const IDENT = /^[$A-Z_a-z][\w$]*$/;

    const names = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = GLOBAL_COMMENT.exec(text)) !== null) {
        // Body may use commas and/or whitespace as separators.
        const parts = match[1].split(/[\s,]+/);
        for (const part of parts) {
            // Strip optional :readonly / :writable qualifier.
            const name = part ? part.split(':', 1)[0].trim() : '';
            if (name && IDENT.test(name)) {
                names.add(name);
            }
        }
    }

    if (names.size === 0) return '';
    return [...names].map((n) => `declare var ${n}: any;`).join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Prototype polyfill parser
// ---------------------------------------------------------------------------

/**
 * Built-in constructors whose `.prototype` can be polyfilled in SSJS, mapped to
 * the TypeScript interface that `sfmc-globals.d.ts` declares for instances of
 * that type. `Array` is generic (`interface Array<T>`) so it carries its type
 * parameter; the rest are non-generic.
 */
const POLYFILL_INTERFACE_BY_CTOR: Record<string, { iface: string; typeParams: string }> = {
    Array: { iface: 'Array', typeParams: '<T>' },
    String: { iface: 'String', typeParams: '' },
    Number: { iface: 'Number', typeParams: '' },
    Boolean: { iface: 'Boolean', typeParams: '' },
    Object: { iface: 'Object', typeParams: '' },
    Date: { iface: 'Date', typeParams: '' },
    Function: { iface: 'Function', typeParams: '' },
    RegExp: { iface: 'RegExp', typeParams: '' },
};

/**
 * Scans SSJS source for prototype polyfills of the form
 * `Ctor.prototype.method = ...` and returns TypeScript interface-merge
 * declarations that add each polyfilled method to the matching built-in
 * interface from `sfmc-globals.d.ts`.
 *
 * Because the bundled `sfmc-globals.d.ts` intentionally declares only the
 * SSJS-supported subset of built-in methods (no `Array.prototype.forEach`,
 * `String.prototype.startsWith`, …), polyfilling an unsupported method would
 * otherwise raise `Property 'X' does not exist` on both the assignment and
 * every later call. Merging the polyfilled members back into the interface
 * teaches the checker that those methods now exist for this document.
 *
 * Each polyfilled member is emitted as a *method signature* (not a bare
 * `: any` property) so hover reports `(method) String.startsWith(...)` rather
 * than `(property) … : any`.  When the polyfill is assigned a function
 * expression, the function's own parameter names are reused — typed from the
 * polyfill's `@param {Type}` / `@returns {Type}` JSDoc when present, otherwise
 * `any` — and any JSDoc block immediately preceding the assignment is forwarded
 * so the checker surfaces the documented `@param` / `@returns` text on hover.
 * The polyfill's body is still type-checked normally and unrelated diagnostics
 * are preserved.
 *
 * Returns an empty string when no prototype polyfills are present.
 * @param text - SSJS source text to scan
 * @returns TypeScript interface-merge statements, or an empty string
 */
function parsePolyfillDeclarations(text: string): string {
    // Match `Ctor.prototype.method = function (params) {` where Ctor is a known
    // built-in. Captures the constructor, the method name, and — when the value
    // is a function expression — its parameter list. The trailing function part
    // is optional so non-function polyfills still register the member.
    // The canonical polyfill form ssjs-data ships uses a self-guard —
    // `String.prototype.trim = String.prototype.trim || function (…)` — so
    // tolerate an optional `<expr> ||` prefix between `=` and `function`.
    const POLYFILL =
        /\b(Array|String|Number|Boolean|Object|Date|Function|RegExp)\s*\.\s*prototype\s*\.\s*([$A-Z_a-z][\w$]*)\s*(?:=\s*(?:[$A-Z_a-z][\w$.]*\s*\|\|\s*)?function\s*\*?\s*[$A-Z_a-z]*\s*\(([^)]*)\))?/g;

    // Group method declarations per interface so each interface is merged once.
    interface PolyMethod {
        params: string[];
        jsdoc: string;
        paramTypes: Map<string, string>;
        optionalParams: Set<string>;
        returnType: string;
    }
    const membersByIface = new Map<
        string,
        { typeParams: string; methods: Map<string, PolyMethod> }
    >();
    let match: RegExpExecArray | null;
    while ((match = POLYFILL.exec(text)) !== null) {
        const ctor = match[1];
        const method = match[2];
        const rawParameters = match[3];
        const target = POLYFILL_INTERFACE_BY_CTOR[ctor];
        if (!target) continue;

        const parameters =
            rawParameters === undefined
                ? []
                : rawParameters
                      .split(',')
                      .map((p) => p.trim())
                      // Strip default values / rest syntax — only the name matters.
                      .map((p) =>
                          p
                              .replace(/^\.\.\./, '')
                              .split('=', 1)[0]
                              .trim()
                      )
                      .filter((p) => /^[$A-Z_a-z][\w$]*$/.test(p));

        const rawJsdoc = extractPrecedingJsdoc(text, match.index);
        const { paramTypes, optionalParams, returnType } = parseJsdocTypes(rawJsdoc);
        // Strip JSDoc type annotations before forwarding: in a `.d.ts` TypeScript
        // type-checks `@param {Type}` / `@property {Type}` / `@typedef` tags, so an
        // undeclared or duplicate type name (e.g. a user `@typedef Client`) would
        // raise spurious diagnostics and break the interface merge. The synthesized
        // signature already carries the (sanitized) types.
        const jsdoc = stripJsdocTypeAnnotations(rawJsdoc);

        let bucket = membersByIface.get(target.iface);
        if (!bucket) {
            bucket = { typeParams: target.typeParams, methods: new Map<string, PolyMethod>() };
            membersByIface.set(target.iface, bucket);
        }
        // First declaration with a function signature wins; a later bare
        // reference must not overwrite captured params/jsdoc.
        const existing = bucket.methods.get(method);
        if (!existing || (existing.params.length === 0 && parameters.length > 0)) {
            bucket.methods.set(method, {
                params: parameters,
                jsdoc,
                paramTypes,
                optionalParams,
                returnType,
            });
        }
    }

    const staticBlocks = parseStaticPolyfillDeclarations(text);

    if (membersByIface.size === 0) return staticBlocks;

    const blocks: string[] = [];
    for (const [iface, { typeParams, methods }] of membersByIface) {
        const memberLines: string[] = [];
        // The instance type of the interface being merged (e.g. `Array<T>`,
        // `String`). Emitted as an explicit `this` parameter on each method so
        // that under `noLib:true` a polyfill body reading `this.length` or doing
        // `return this` (e.g. `Array.prototype.copyWithin` / `fill`) type-checks
        // against the array/string instance rather than the function object.
        const thisType = `${iface}${typeParams}`;
        for (const [name, { params, jsdoc, paramTypes, optionalParams, returnType }] of methods) {
            if (jsdoc) memberLines.push(indentLines(jsdoc, ' '.repeat(4)));
            // Use the JSDoc `@param {Type}` / `@returns {Type}` annotations when
            // present so hover reports the documented types instead of `any`.
            // A parameter marked optional in JSDoc (`[name]`) emits `name?: type`;
            // every parameter after an optional one must also be optional in TS.
            let isSawOptional = false;
            const parameterString = params
                .map((p) => {
                    const optional = isSawOptional || optionalParams.has(p);
                    if (optional) isSawOptional = true;
                    return `${p}${optional ? '?' : ''}: ${paramTypes.get(p) ?? 'any'}`;
                })
                .join(', ');
            const signatureParameters = parameterString
                ? `this: ${thisType}, ${parameterString}`
                : `this: ${thisType}`;
            memberLines.push(`    ${name}(${signatureParameters}): ${returnType};`);
        }
        blocks.push(`interface ${iface}${typeParams} {\n${memberLines.join('\n')}\n}`);
    }
    return blocks.join('\n') + '\n' + staticBlocks;
}

/**
 * Built-in constructors whose STATIC members can be polyfilled in SSJS, mapped to
 * the declaration target that the merge must re-open. `Math` is a namespace
 * (`declare namespace Math`), the others are `*Constructor` interfaces declared by
 * `sfmc-globals.d.ts` (e.g. `interface ArrayConstructor`).
 */
const STATIC_POLYFILL_TARGET_BY_CTOR: Record<
    string,
    { target: string; kind: 'interface' | 'namespace' }
> = {
    Array: { target: 'ArrayConstructor', kind: 'interface' },
    Object: { target: 'ObjectConstructor', kind: 'interface' },
    Number: { target: 'NumberConstructor', kind: 'interface' },
    String: { target: 'StringConstructor', kind: 'interface' },
    Date: { target: 'DateConstructor', kind: 'interface' },
    Math: { target: 'Math', kind: 'namespace' },
    JSON: { target: 'JSON', kind: 'namespace' },
};

/**
 * Scans SSJS source for STATIC polyfills of the form `Ctor.method = function (…)`
 * (e.g. `Array.isArray = …`, `Object.getPrototypeOf = …`, `Math.max = …`) and
 * returns TypeScript declarations that add each member to the matching
 * `*Constructor` interface (via declaration merging) or `Math`/`JSON` namespace.
 *
 * Like `parsePolyfillDeclarations` for prototype members, this is required because
 * `sfmc-globals.d.ts` intentionally omits unsupported statics. Once the
 * "Insert polyfill" quick-fix adds `Array.isArray = function () { … }`, the
 * assignment target must exist or TypeScript raises ts2339
 * ("Property 'isArray' does not exist on type 'ArrayConstructor'").
 *
 * Returns an empty string when no static polyfills are present.
 * @param text - SSJS source text to scan
 * @returns TypeScript merge statements, or an empty string
 */
function parseStaticPolyfillDeclarations(text: string): string {
    // Match `Ctor.method = function (params)` where Ctor is a known built-in and
    // `method` is NOT `prototype` (those are handled by parsePolyfillDeclarations).
    // The canonical polyfill form ssjs-data ships uses a self-guard —
    // `Array.isArray = Array.isArray || function (…)` — so tolerate an optional
    // `<expr> ||` prefix between `=` and `function` (e.g. `Array.isArray ||`).
    const STATIC_POLYFILL =
        /\b(Array|Object|Number|String|Date|Math|JSON)\s*\.\s*([$A-Z_a-z][\w$]*)\s*=\s*(?:[$A-Z_a-z][\w$.]*\s*\|\|\s*)?function\s*\*?\s*[$A-Z_a-z]*\s*\(([^)]*)\)/g;

    interface StaticMethod {
        params: string[];
        jsdoc: string;
        paramTypes: Map<string, string>;
        optionalParams: Set<string>;
        returnType: string;
    }
    // target name → { kind, methods }
    const byTarget = new Map<
        string,
        { kind: 'interface' | 'namespace'; methods: Map<string, StaticMethod> }
    >();

    let match: RegExpExecArray | null;
    while ((match = STATIC_POLYFILL.exec(text)) !== null) {
        const ctor = match[1];
        const method = match[2];
        if (method === 'prototype') continue;
        const target = STATIC_POLYFILL_TARGET_BY_CTOR[ctor];
        if (!target) continue;

        const rawParameters = match[3];
        const parameters = rawParameters
            .split(',')
            .map((p) => p.trim())
            .map((p) =>
                p
                    .replace(/^\.\.\./, '')
                    .split('=', 1)[0]
                    .trim()
            )
            .filter((p) => /^[$A-Z_a-z][\w$]*$/.test(p));

        const rawJsdoc = extractPrecedingJsdoc(text, match.index);
        const { paramTypes, optionalParams, returnType } = parseJsdocTypes(rawJsdoc);
        const jsdoc = stripJsdocTypeAnnotations(rawJsdoc);

        let bucket = byTarget.get(target.target);
        if (!bucket) {
            bucket = { kind: target.kind, methods: new Map<string, StaticMethod>() };
            byTarget.set(target.target, bucket);
        }
        if (!bucket.methods.has(method)) {
            bucket.methods.set(method, {
                params: parameters,
                jsdoc,
                paramTypes,
                optionalParams,
                returnType,
            });
        }
    }

    if (byTarget.size === 0) return '';

    const blocks: string[] = [];
    for (const [target, { kind, methods }] of byTarget) {
        const memberLines: string[] = [];
        for (const [name, { params, jsdoc, paramTypes, optionalParams, returnType }] of methods) {
            if (jsdoc) memberLines.push(indentLines(jsdoc, ' '.repeat(4)));
            let isSawOptional = false;
            const parameterString = params
                .map((p) => {
                    const optional = isSawOptional || optionalParams.has(p);
                    if (optional) isSawOptional = true;
                    return `${p}${optional ? '?' : ''}: ${paramTypes.get(p) ?? 'any'}`;
                })
                .join(', ');
            // Namespace members use `function name(...)`; interface members `name(...)`.
            memberLines.push(
                kind === 'namespace'
                    ? `    function ${name}(${parameterString}): ${returnType};`
                    : `    ${name}(${parameterString}): ${returnType};`
            );
        }
        const header = kind === 'namespace' ? `declare namespace ${target}` : `interface ${target}`;
        blocks.push(`${header} {\n${memberLines.join('\n')}\n}`);
    }
    return blocks.join('\n') + '\n';
}

/**
 * Map a single JSDoc type token to a TypeScript-safe type. Primitives and the
 * known built-in interfaces pass through (with canonical casing); `Array`
 * becomes `any[]`; anything not recognised (e.g. user types like `Client` that
 * are not declared in the virtual program) falls back to `any` so the generated
 * `.polyfills.d.ts` never references an undeclared name.
 * @param raw - a single JSDoc type token (no `{}`)
 * @returns a TypeScript-safe type string
 */
function jsdocTokenToTsType(raw: string): string {
    const t = raw.trim();
    if (!t) return 'any';
    // String literal unions like 'a'|'b' — keep as-is (valid TS literal types).
    if (/^(['"]).*\1$/.test(t)) return t;
    const lower = t.toLowerCase();
    switch (lower) {
        case 'array': {
            return 'any[]';
        }
        case 'void':
        case 'undefined':
        case 'null':
        case 'any': {
            return lower;
        }
        case 'string':
        case 'number':
        case 'boolean': {
            return lower;
        }
        case 'object': {
            return 'Object';
        }
        case 'date': {
            return 'Date';
        }
        case 'function': {
            return 'Function';
        }
        case 'regexp': {
            return 'RegExp';
        }
        default: {
            return 'any';
        }
    }
}

/**
 * Convert a JSDoc type expression (the text inside `{...}`) into a TypeScript
 * type, supporting `|` unions and `Type[]` array suffixes. Unknown tokens
 * degrade to `any`.
 * @param expression - JSDoc type expression without surrounding braces
 * @returns a TypeScript-safe type string
 */
function jsdocTypeToTs(expression: string): string {
    const trimmed = expression.trim();
    if (!trimmed) return 'any';
    if (trimmed.includes('|')) {
        return trimmed
            .split('|')
            .map((p) => jsdocTypeToTs(p))
            .join(' | ');
    }
    // `Type[]` suffix.
    const arrayMatch = trimmed.match(/^(.+?)\s*\[\s*\]$/);
    if (arrayMatch) {
        const inner = jsdocTokenToTsType(arrayMatch[1]);
        return inner === 'any' ? 'any[]' : `${inner}[]`;
    }
    return jsdocTokenToTsType(trimmed);
}

/**
 * Parse `@param {Type} name` and `@returns {Type}` annotations out of a JSDoc
 * comment block, returning a map of parameter name to TS type, the set of
 * parameters marked optional (JSDoc `[name]` / `[name=default]` syntax), and the
 * return type (defaulting to `any` when no `@returns` type is documented).
 * @param jsdoc - the raw JSDoc comment block
 * @returns parsed parameter types, optional-parameter names, and the return type
 */
function parseJsdocTypes(jsdoc: string): {
    paramTypes: Map<string, string>;
    optionalParams: Set<string>;
    returnType: string;
} {
    const parameterTypes = new Map<string, string>();
    const optionalParameters = new Set<string>();
    let returnType = 'any';
    if (!jsdoc)
        return { paramTypes: parameterTypes, optionalParams: optionalParameters, returnType };

    // Match `@param {Type} name` and the optional form `@param {Type} [name]`
    // (or `[name=default]`). The bracket and default value only mark optionality
    // — the bare identifier is captured as the parameter name.
    const parameterRe = /@param\s*\{([^}]*)\}\s*(\[)?\s*([$A-Z_a-z][\w$]*)(?:\s*=\s*[^\]]*)?(\])?/g;
    let m: RegExpExecArray | null;
    while ((m = parameterRe.exec(jsdoc)) !== null) {
        const name = m[3];
        parameterTypes.set(name, jsdocTypeToTs(m[1]));
        if (m[2] === '[' && m[4] === ']') optionalParameters.add(name);
    }

    const returnRe = /@returns?\s*\{([^}]*)\}/;
    const rm = returnRe.exec(jsdoc);
    if (rm) returnType = jsdocTypeToTs(rm[1]);

    return { paramTypes: parameterTypes, optionalParams: optionalParameters, returnType };
}

/**
 * Remove JSDoc *type* annotations from a comment block so it is safe to forward
 * into a generated `.d.ts`. TypeScript type-checks type expressions inside JSDoc
 * tags (`@param {Type}`, `@returns {Type}`, `@property {Type}`, `@typedef
 * {Type}`, …); an undeclared or duplicate type name in a forwarded comment
 * would raise spurious diagnostics and can break the surrounding interface merge.
 * Stripping the `{...}` (and dropping whole `@typedef`/`@property` lines, which
 * only exist to declare types) leaves human-readable descriptions intact while
 * removing anything TypeScript would try to resolve.
 * @param jsdoc - the raw JSDoc comment block
 * @returns the JSDoc block with type annotations removed
 */
function stripJsdocTypeAnnotations(jsdoc: string): string {
    if (!jsdoc) return '';
    const cleaned = jsdoc
        .split('\n')
        .filter((line) => !/^\s*\*?\s*@(?:typedef|property|prop)\b/.test(line))
        // Remove the `{Type}` token from any remaining tag (e.g. @param, @returns).
        .map((line) => line.replaceAll(/(@\w+)\s*\{[^}]*\}/g, '$1'))
        .join('\n');
    return cleaned;
}

/**
 * Extract the JSDoc block (`/** … *\/`) immediately preceding `index` in
 * `text`, ignoring intervening whitespace. Returns the raw comment (without
 * surrounding indentation) or an empty string when none is directly adjacent.
 * @param text - full source text
 * @param index - offset of the polyfill assignment
 * @returns the adjacent JSDoc comment, or an empty string
 */
function extractPrecedingJsdoc(text: string, index: number): string {
    const before = text.slice(0, index);
    // Only a JSDoc block separated from the assignment by whitespace counts.
    // The body must not contain a `*/`, so the match is the *closest* comment to
    // the assignment — otherwise a lazy `[\s\S]*?` would span from an earlier
    // comment across intervening source code into this one.
    const match = before.match(/\/\*\*(?:(?!\*\/)[\s\S])*\*\/\s*$/);
    if (!match) return '';
    // Normalize leading indentation so re-indentation is predictable.
    return match[0]
        .split('\n')
        .map((l) => l.replace(/^\s+/, () => (l.trimStart().startsWith('*') ? ' ' : '')))
        .join('\n');
}

/**
 * Re-indent a multi-line block so every line is prefixed with `indent`.
 * @param block - text block to indent
 * @param indent - indentation string to prepend to each line
 * @returns the indented block
 */
function indentLines(block: string, indent: string): string {
    return block
        .split('\n')
        .map((l) => indent + l)
        .join('\n');
}

// ---------------------------------------------------------------------------
// Language service host
// ---------------------------------------------------------------------------

const host: ts.LanguageServiceHost = {
    getCompilationSettings(): ts.CompilerOptions {
        return {
            allowJs: true,
            checkJs: true,
            noLib: true,
            target: ts.ScriptTarget.ES5,
            strict: false,
            noEmit: true,
            noResolve: true,
            skipLibCheck: false,
        };
    },

    getScriptFileNames(): string[] {
        // Expose only the shared globals plus the *active* document's own virtual
        // files. Including every open SSJS document in one program makes their
        // top-level `var` declarations collide in the shared global scope
        // (ts2403). Scoping to the active document keeps each file isolated.
        const active = activeDocument.js;
        if (!active) {
            // Spread the Map (not `.keys()`) so neither unicorn/prefer-spread nor
            // unicorn/prefer-iterator-to-array fires, then take each entry's key.
            return [...virtualFiles].map(([fileName]) => fileName);
        }
        const activeFiles = new Set([
            GLOBALS_FILENAME,
            active,
            active.replace(/\.js$/, '.globals.d.ts'),
            active.replace(/\.js$/, '.polyfills.d.ts'),
        ]);
        return [...virtualFiles]
            .map(([fileName]) => fileName)
            .filter((fileName) => activeFiles.has(fileName));
    },

    getScriptVersion(fileName: string): string {
        return String(virtualFiles.get(fileName)?.version ?? 0);
    },

    getScriptSnapshot(fileName: string): ts.IScriptSnapshot | undefined {
        return virtualFiles.get(fileName)?.snapshot;
    },

    getCurrentDirectory(): string {
        return '/';
    },

    getDefaultLibFileName(): string {
        return GLOBALS_FILENAME;
    },

    fileExists(fileName: string): boolean {
        return virtualFiles.has(fileName);
    },

    readFile(fileName: string): string | undefined {
        return virtualFiles.get(fileName)?.content;
    },

    readDirectory(): string[] {
        return [];
    },

    directoryExists(): boolean {
        return false;
    },

    getDirectories(): string[] {
        return [];
    },
};

const languageService = ts.createLanguageService(host, ts.createDocumentRegistry());

// ---------------------------------------------------------------------------
// Offset / position utilities
// ---------------------------------------------------------------------------

/**
 * Convert an LSP position to a zero-based character offset in the text.
 * @param text - the source text
 * @param position - the LSP line/character position
 * @returns the character offset within the text
 */
function positionToOffset(text: string, position: Position): number {
    const lines = text.split('\n');
    let offset = 0;
    for (let index = 0; index < position.line && index < lines.length; index++) {
        offset += lines[index].length + 1; // +1 for the '\n'
    }
    return offset + position.character;
}

/**
 * Convert a zero-based character offset to an LSP position.
 * @param text - the source text
 * @param offset - the character offset within the text
 * @returns the LSP line/character position
 */
function offsetToPosition(text: string, offset: number): Position {
    const slice = text.slice(0, Math.max(0, offset));
    const lines = slice.split('\n');
    return {
        line: lines.length - 1,
        character: lines.at(-1)!.length,
    };
}

// ---------------------------------------------------------------------------
// TS kind → LSP CompletionItemKind
// ---------------------------------------------------------------------------

const TS_KIND_MAP: Partial<Record<string, CompletionItemKind>> = {
    [ts.ScriptElementKind.functionElement]: CompletionItemKind.Function,
    [ts.ScriptElementKind.memberFunctionElement]: CompletionItemKind.Method,
    [ts.ScriptElementKind.memberGetAccessorElement]: CompletionItemKind.Property,
    [ts.ScriptElementKind.memberSetAccessorElement]: CompletionItemKind.Property,
    [ts.ScriptElementKind.memberVariableElement]: CompletionItemKind.Field,
    [ts.ScriptElementKind.constructorImplementationElement]: CompletionItemKind.Constructor,
    [ts.ScriptElementKind.classElement]: CompletionItemKind.Class,
    [ts.ScriptElementKind.interfaceElement]: CompletionItemKind.Interface,
    [ts.ScriptElementKind.enumElement]: CompletionItemKind.Enum,
    [ts.ScriptElementKind.enumMemberElement]: CompletionItemKind.EnumMember,
    [ts.ScriptElementKind.moduleElement]: CompletionItemKind.Module,
    [ts.ScriptElementKind.alias]: CompletionItemKind.Reference,
    [ts.ScriptElementKind.letElement]: CompletionItemKind.Variable,
    [ts.ScriptElementKind.constElement]: CompletionItemKind.Constant,
    [ts.ScriptElementKind.variableElement]: CompletionItemKind.Variable,
    [ts.ScriptElementKind.localVariableElement]: CompletionItemKind.Variable,
    [ts.ScriptElementKind.parameterElement]: CompletionItemKind.Variable,
    [ts.ScriptElementKind.typeElement]: CompletionItemKind.TypeParameter,
    [ts.ScriptElementKind.keyword]: CompletionItemKind.Keyword,
};

/**
 * Map a TypeScript script-element kind to an LSP completion item kind.
 * @param kind - the TypeScript `ScriptElementKind` value
 * @returns the corresponding LSP `CompletionItemKind`
 */
function tsKindToLsp(kind: string): CompletionItemKind {
    return TS_KIND_MAP[kind] ?? CompletionItemKind.Text;
}

// ---------------------------------------------------------------------------
// TS diagnostic category → LSP severity
// ---------------------------------------------------------------------------

/**
 * Map a TypeScript diagnostic category to an LSP diagnostic severity.
 * @param category - the TypeScript `DiagnosticCategory` value
 * @returns the corresponding LSP `DiagnosticSeverity`
 */
function tsCategoryToSeverity(category: ts.DiagnosticCategory): DiagnosticSeverity {
    switch (category) {
        case ts.DiagnosticCategory.Error: {
            return DiagnosticSeverity.Error;
        }
        case ts.DiagnosticCategory.Warning: {
            return DiagnosticSeverity.Warning;
        }
        case ts.DiagnosticCategory.Suggestion: {
            return DiagnosticSeverity.Hint;
        }
        default: {
            return DiagnosticSeverity.Information;
        }
    }
}

// ---------------------------------------------------------------------------
// Exported API
// ---------------------------------------------------------------------------

/**
 * Notify the service that a SSJS document's content has changed.
 * Must be called before any completions / diagnostics / hover for that URI.
 *
 * Also scans the text for ESLint-style global-comment annotations
 * (the `global` and `globals` block-comment forms) and maintains a
 * per-document companion `.globals.d.ts` virtual file containing
 * the corresponding `declare var` statements so the TypeScript checker
 * does not emit "Cannot find name" errors for those identifiers.
 * @param uri - LSP document URI
 * @param text - full document text
 */
export function updateSsjsDocument(uri: string, text: string): void {
    setVirtualFile(virtualNameForUri(uri), text);

    const declarations = parseGlobalCommentDeclarations(text);
    const globalsName = globalsNameForUri(uri);
    if (declarations) {
        setVirtualFile(globalsName, declarations);
    } else {
        // No global comments — remove any stale companion file from a previous
        // document version so old names don't linger in the TS service.
        virtualFiles.delete(globalsName);
    }

    const polyfills = parsePolyfillDeclarations(text);
    const polyfillsName = polyfillsNameForUri(uri);
    if (polyfills) {
        setVirtualFile(polyfillsName, polyfills);
    } else {
        // No prototype polyfills — drop any stale companion file so members
        // from a previous document version don't linger in the TS service.
        virtualFiles.delete(polyfillsName);
    }
}

/**
 * Remove a SSJS document from the virtual FS (e.g. on close).
 * Also removes the companion globals declaration file if one exists.
 * @param uri - LSP document URI
 */
export function removeSsjsDocument(uri: string): void {
    const name = uriToVirtualName.get(uri);
    if (name) {
        virtualFiles.delete(name);
        uriToVirtualName.delete(uri);
        if (activeDocument.js === name) setActiveDocument(undefined);
    }
    const globalsName = uriToGlobalsName.get(uri);
    if (globalsName) {
        virtualFiles.delete(globalsName);
        uriToGlobalsName.delete(uri);
    }
    const polyfillsName = uriToPolyfillsName.get(uri);
    if (polyfillsName) {
        virtualFiles.delete(polyfillsName);
        uriToPolyfillsName.delete(uri);
    }
}

/**
 * Return LSP CompletionItems from the embedded TypeScript language service
 * at the given cursor position.  Returns an empty array when the service has
 * no results or the document is not known.
 * @param uri - LSP document URI
 * @param position - cursor position in the document
 * @returns LSP completion items, or an empty array if none are available
 */
export function getSsjsCompletions(uri: string, position: Position): CompletionItem[] {
    const name = uriToVirtualName.get(uri);
    if (!name) return [];
    setActiveDocument(name);
    const file = virtualFiles.get(name);
    if (!file) return [];

    const offset = positionToOffset(file.content, position);
    let info: ts.CompletionInfo | undefined;
    try {
        info = languageService.getCompletionsAtPosition(name, offset, {
            includeCompletionsWithInsertText: true,
            includeCompletionsForModuleExports: false,
        });
    } catch {
        return [];
    }
    if (!info) return [];

    return info.entries.map((entry) => {
        const item: CompletionItem = {
            label: entry.name,
            kind: tsKindToLsp(entry.kind),
            sortText: entry.sortText,
        };
        // Mark deprecated entries (TS 4+ provides kindModifiers)
        if (entry.kindModifiers?.includes('deprecated')) {
            item.tags = [1 /* CompletionItemTag.Deprecated */];
        }
        return item;
    });
}

/**
 * Same as getSsjsCompletions, but also returns whether the completion was
 * triggered for member access (e.g. `de.` or `Platform.Function.`).
 * Use this in server.ts to decide whether to suppress SFMC global completions
 * that would pollute member-completion lists.
 * @param uri - LSP document URI
 * @param position - cursor position in the document
 * @returns completion items and a flag indicating whether this is a member-access completion
 */
export function getSsjsCompletionInfo(
    uri: string,
    position: Position
): { items: CompletionItem[]; isMemberCompletion: boolean } {
    const name = uriToVirtualName.get(uri);
    if (!name) return { items: [], isMemberCompletion: false };
    setActiveDocument(name);
    const file = virtualFiles.get(name);
    if (!file) return { items: [], isMemberCompletion: false };

    const offset = positionToOffset(file.content, position);
    let info: ts.CompletionInfo | undefined;
    try {
        info = languageService.getCompletionsAtPosition(name, offset, {
            includeCompletionsWithInsertText: true,
            includeCompletionsForModuleExports: false,
        });
    } catch {
        return { items: [], isMemberCompletion: false };
    }
    if (!info) return { items: [], isMemberCompletion: false };

    const items = info.entries.map((entry) => {
        const item: CompletionItem = {
            label: entry.name,
            kind: tsKindToLsp(entry.kind),
            sortText: entry.sortText,
        };
        if (entry.kindModifiers?.includes('deprecated')) {
            item.tags = [1 /* CompletionItemTag.Deprecated */];
        }
        return item;
    });

    return { items, isMemberCompletion: info.isMemberCompletion };
}

/**
 * Return LSP Diagnostics from the embedded TypeScript language service for the given SSJS document URI.
 * @param uri - LSP document URI
 * @returns LSP diagnostics, or an empty array if none are found
 */
export function getSsjsDiagnostics(uri: string): Diagnostic[] {
    const name = uriToVirtualName.get(uri);
    if (!name) return [];
    setActiveDocument(name);
    const file = virtualFiles.get(name);
    if (!file) return [];

    let tsDiags: ts.Diagnostic[];
    try {
        tsDiags = [
            ...languageService.getSyntacticDiagnostics(name),
            ...languageService.getSemanticDiagnostics(name),
        ];
    } catch {
        return [];
    }

    const jsdocRanges = jsdocCommentRanges(file.content);
    const polyfillBodyRanges = prototypePolyfillBodyRanges(file.content);

    const results: Diagnostic[] = [];
    for (const d of tsDiags) {
        if (d.start === undefined || d.length === undefined) continue;
        // Suppress "cannot find name" diagnostics that fall inside a JSDoc
        // comment. SSJS authors routinely reference SFMC types (e.g. WSProxy) or
        // user `@typedef`s in `@param`/`@property`/`@returns` tags; with
        // `checkJs` enabled TypeScript flags those undeclared names even though
        // they have no effect on the executed code.
        // 8029: "JSDoc '@param' tag has name 'X', but there is no parameter with
        // that name." Shipped polyfills document rest varargs collected via
        // `arguments` with `@param {...*} [items]` (e.g. splice/bind), which have
        // no matching named parameter — valid SSJS documentation, not an error.
        if ([2304, 2552, 2300, 8029].includes(d.code) && isInsideJsdoc(d.start, jsdocRanges)) {
            continue;
        }
        // Suppress `this`-context errors inside self-guarded prototype-polyfill
        // bodies. `X = X || function () { … this.length … return this }` loses the
        // declared `this: any[]` contextual type through the `||`, producing
        // ts2339 ("Property 'length' does not exist") and ts2322 ("Type 'this'
        // is not assignable"). The bodies are valid SSJS polyfills.
        if ((d.code === 2339 || d.code === 2322) && isInsideJsdoc(d.start, polyfillBodyRanges)) {
            const text =
                typeof d.messageText === 'string'
                    ? d.messageText
                    : flattenDiagnosticMessageText(d.messageText);
            if (text.includes('this') || text.includes("'length'")) continue;
        }
        const start = offsetToPosition(file.content, d.start);
        const end = offsetToPosition(file.content, d.start + d.length);
        const message =
            typeof d.messageText === 'string'
                ? d.messageText
                : flattenDiagnosticMessageText(d.messageText);
        results.push({
            range: Range.create(start, end),
            severity: tsCategoryToSeverity(d.category),
            source: 'sfmc-ts',
            message,
            code: d.code,
        });
    }
    return results;
}

/**
 * Compute the `[start, end)` offset ranges of every JSDoc block comment
 * (`/** … *\/`) in the given source text.
 * @param text - full document text
 * @returns an array of `[start, end)` offset tuples
 */
function jsdocCommentRanges(text: string): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    const re = /\/\*\*[\s\S]*?\*\//g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        ranges.push([m.index, m.index + m[0].length]);
    }
    return ranges;
}

/**
 * Determine whether `offset` falls within any of the supplied comment ranges.
 * @param offset - character offset to test
 * @param ranges - JSDoc comment ranges from {@link jsdocCommentRanges}
 * @returns true when the offset is inside a JSDoc comment
 */
function isInsideJsdoc(offset: number, ranges: Array<[number, number]>): boolean {
    return ranges.some(([start, end]) => offset >= start && offset < end);
}

/**
 * Compute the `[start, end)` offset ranges of every prototype-polyfill
 * assignment body — `Ctor.prototype.method = [Ctor.prototype.method ||] function (…) { … }`.
 *
 * The self-guarded form (`X = X || function () {}`) defeats TypeScript's
 * contextual `this` typing under `noLib:true`: the declared `this: any[]`
 * parameter on the merged interface member does not flow into the function
 * operand of the `||`, so a body reading `this.length` or doing `return this`
 * raises spurious ts2339 / ts2322. These are known-good SSJS polyfills, so the
 * `this`-related diagnostics inside their bodies are suppressed.
 * @param text - full document text
 * @returns an array of `[start, end)` offset tuples spanning each assignment body
 */
function prototypePolyfillBodyRanges(text: string): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    // Match up to the opening `{` of the function body; then balance braces to
    // find the matching close so the whole body is covered.
    const re =
        /\b(?:Array|String|Number|Boolean|Object|Date|Function|RegExp)\s*\.\s*prototype\s*\.\s*[$A-Z_a-z][\w$]*\s*=\s*(?:[$A-Z_a-z][\w$.]*\s*\|\|\s*)?function\s*\*?\s*[$A-Z_a-z]*\s*\([^)]*\)\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const bodyOpen = m.index + m[0].length - 1;
        let depth = 1;
        let index = bodyOpen + 1;
        for (; index < text.length && depth > 0; index++) {
            const ch = text[index];
            if (ch === '{') depth += 1;
            else if (ch === '}') depth -= 1;
        }
        ranges.push([m.index, index]);
    }
    return ranges;
}

/**
 * Return an LSP Hover from the embedded TypeScript language service at the
 * given cursor position.  Returns null when there is nothing to show.
 * @param uri - LSP document URI
 * @param position - cursor position in the document
 * @returns LSP Hover with markdown content, or undefined if nothing to show
 */
export function getSsjsHover(uri: string, position: Position): Hover | undefined {
    const name = uriToVirtualName.get(uri);
    if (!name) return undefined;
    setActiveDocument(name);
    const file = virtualFiles.get(name);
    if (!file) return undefined;

    const offset = positionToOffset(file.content, position);
    let info: ts.QuickInfo | undefined;
    try {
        info = languageService.getQuickInfoAtPosition(name, offset);
    } catch {
        return undefined;
    }
    if (!info) return undefined;

    const sig = info.displayParts?.map((p) => p.text).join('') ?? '';
    const documentation = info.documentation?.map((p) => p.text).join('') ?? '';

    const parts: string[] = [];
    if (sig) parts.push('```typescript\n' + sig + '\n```');
    if (documentation) parts.push(documentation);

    // Render JSDoc tags to match native TypeScript hover style.
    const tags = info.tags ?? [];
    const tagLines: string[] = [];
    for (const tag of tags) {
        const tagText = tag.text?.map((p) => p.text).join('') ?? '';
        if (tag.name === 'deprecated') {
            tagLines.push(tagText ? `*Deprecated:* ${tagText}` : '*Deprecated*');
        } else if (tag.name === 'remarks') {
            if (tagText) tagLines.push(tagText);
        } else if (tag.name === 'param' && tagText) {
            // TS returns tag text as "paramName - description"; match native TS format:
            // @param `name` — description
            const spaceIndex = tagText.indexOf(' ');
            const pName = spaceIndex === -1 ? tagText : tagText.slice(0, spaceIndex);
            const pDesc =
                spaceIndex === -1 ? '' : tagText.slice(spaceIndex + 1).replace(/^[-–]\s*/, '');
            tagLines.push(pDesc ? `@param \`${pName}\` — ${pDesc}` : `@param \`${pName}\``);
        } else if ((tag.name === 'returns' || tag.name === 'return') && tagText) {
            tagLines.push(`@returns ${tagText}`);
        } else if (tag.name === 'example' && tagText) {
            tagLines.push(`@example\n\`\`\`javascript\n${tagText.trim()}\n\`\`\``);
        } else if (tagText) {
            tagLines.push(`*${tag.name}:* ${tagText}`);
        }
    }
    if (tagLines.length > 0) parts.push(tagLines.join('\n\n'));

    if (parts.length === 0) return undefined;

    const content: MarkupContent = { kind: 'markdown', value: parts.join('\n\n') };

    let range: Range | undefined;
    if (info.textSpan) {
        const start = offsetToPosition(file.content, info.textSpan.start);
        const end = offsetToPosition(file.content, info.textSpan.start + info.textSpan.length);
        range = Range.create(start, end);
    }

    return range ? { contents: content, range } : { contents: content };
}

/**
 * Return LSP definition Location(s) from the embedded TypeScript language
 * service at the given cursor position. This gives `.ssjs` files the same
 * go-to-definition quality as `.js` (top-level functions, locals, object
 * members, and prototype-polyfilled methods).
 *
 * Definitions that resolve into a synthetic companion file (the per-document
 * `.polyfills.d.ts` interface-merge) are remapped to the real
 * `Ctor.prototype.method = …` assignment in the originating document, so the
 * user navigates to their own polyfill rather than a generated declaration.
 * @param uri - LSP document URI
 * @param position - cursor position in the document
 * @returns an array of LSP Locations (possibly empty)
 */
export function getSsjsDefinition(uri: string, position: Position): Location[] {
    const name = uriToVirtualName.get(uri);
    const file = name ? virtualFiles.get(name) : undefined;
    if (!name || !file) return [];
    setActiveDocument(name);

    const offset = positionToOffset(file.content, position);
    let defs: readonly ts.DefinitionInfo[] | undefined;
    try {
        defs = languageService.getDefinitionAtPosition(name, offset);
    } catch {
        return [];
    }
    if (!defs || defs.length === 0) return [];

    const locations: Location[] = [];
    for (const definition of defs) {
        const targetUri = uriForVirtualName(definition.fileName);
        // Skip definitions in the shared globals file — those are ambient API
        // declarations with no navigable source for the user.
        if (!targetUri) continue;
        const targetFile = virtualFiles.get(virtualNameForUri(targetUri));
        if (!targetFile) continue;

        // A hit inside the synthetic polyfills file points at the generated
        // interface member; redirect to the real prototype assignment.
        const isPolyfillFile = definition.fileName.endsWith('.polyfills.d.ts');
        let span = isPolyfillFile
            ? findPrototypeAssignmentSpan(targetFile.content, definition.name)
            : { start: definition.textSpan.start, length: definition.textSpan.length };
        if (!span) continue;

        // For a `Ctor.prototype.method = function …` polyfill that carries a
        // leading JSDoc block, TypeScript resolves the method's definition into
        // the JSDoc comment (the first textual occurrence of the name inside the
        // `/** … */`) rather than the assignment identifier. Redirect any
        // same-document definition whose span lands inside a comment to the real
        // prototype assignment so go-to-definition lands on the code line.
        if (!isPolyfillFile && isOffsetInsideComment(targetFile.content, span.start)) {
            const assignmentSpan = findPrototypeAssignmentSpan(targetFile.content, definition.name);
            if (assignmentSpan) span = assignmentSpan;
        }

        locations.push({
            uri: targetUri,
            range: Range.create(
                offsetToPosition(targetFile.content, span.start),
                offsetToPosition(targetFile.content, span.start + span.length)
            ),
        });
    }
    return locations;
}

/**
 * Return LSP reference Location(s) from the embedded TypeScript language
 * service at the given cursor position — powering Find All References for
 * `.ssjs` files (top-level functions, locals, object members, and
 * prototype-polyfilled methods).
 *
 * References that resolve into the synthetic per-document `.polyfills.d.ts`
 * companion are remapped to the real `Ctor.prototype.method = …` assignment in
 * the originating document, matching the go-to-definition remap, so the user
 * never sees a generated declaration in the results.
 * @param uri - LSP document URI
 * @param position - cursor position in the document
 * @returns an array of LSP Locations (possibly empty)
 */
export function getSsjsReferences(uri: string, position: Position): Location[] {
    const name = uriToVirtualName.get(uri);
    const file = name ? virtualFiles.get(name) : undefined;
    if (!name || !file) return [];
    setActiveDocument(name);

    const offset = positionToOffset(file.content, position);
    let references: ts.ReferenceEntry[] | undefined;
    try {
        references = languageService.getReferencesAtPosition(name, offset);
    } catch {
        return [];
    }
    if (!references || references.length === 0) return [];

    const locations: Location[] = [];
    const seen = new Set<string>();
    for (const reference of references) {
        const targetUri = uriForVirtualName(reference.fileName);
        // Skip references in the shared globals file — ambient API declarations
        // with no navigable source for the user.
        if (!targetUri) continue;
        const targetFile = virtualFiles.get(virtualNameForUri(targetUri));
        if (!targetFile) continue;

        // A hit inside the synthetic polyfills file points at the generated
        // interface member; redirect to the real prototype assignment.
        const isPolyfillFile = reference.fileName.endsWith('.polyfills.d.ts');
        const span = isPolyfillFile
            ? findPrototypeAssignmentSpan(
                  targetFile.content,
                  prototypeMethodNameFor(targetFile.content, reference.textSpan.start)
              )
            : { start: reference.textSpan.start, length: reference.textSpan.length };
        if (!span) continue;

        const start = offsetToPosition(targetFile.content, span.start);
        const end = offsetToPosition(targetFile.content, span.start + span.length);
        // De-duplicate (the polyfill remap can collapse several synthetic hits
        // onto the same assignment span).
        const key = `${targetUri}:${start.line}:${start.character}:${end.line}:${end.character}`;
        if (seen.has(key)) continue;
        seen.add(key);

        locations.push({ uri: targetUri, range: Range.create(start, end) });
    }
    return locations;
}

/**
 * Read the method identifier at `offset` inside a generated `.polyfills.d.ts`
 * interface member so the reference remap can locate the matching prototype
 * assignment in the source document.
 * @param text - the polyfills declaration file content
 * @param offset - the reference text-span start within that file
 * @returns the method name at the offset, or an empty string
 */
function prototypeMethodNameFor(text: string, offset: number): string {
    const match = /^[$A-Z_a-z][\w$]*/.exec(text.slice(offset));
    return match ? match[0] : '';
}

/**
 * Determine whether `offset` falls inside a line (`// …`) or block (`/* … *\/`)
 * comment in the given source text. Used to detect when TypeScript resolved a
 * prototype-polyfill definition into its leading JSDoc block instead of the
 * assignment identifier, so the definition can be redirected to the code line.
 * @param text - source text to scan
 * @param offset - character offset to test
 * @returns true when the offset lies within a comment
 */
function isOffsetInsideComment(text: string, offset: number): boolean {
    // Block comments: /* … */ (covers JSDoc /** … */).
    const block = /\/\*[\s\S]*?\*\//g;
    let m: RegExpExecArray | null;
    while ((m = block.exec(text)) !== null) {
        if (offset >= m.index && offset < m.index + m[0].length) return true;
    }
    // Line comments: // … to end of line.
    const line = /\/\/[^\n]*/g;
    while ((m = line.exec(text)) !== null) {
        if (offset >= m.index && offset < m.index + m[0].length) return true;
    }
    return false;
}

/**
 * Locate the `…prototype.<method>` assignment for a polyfilled method in the
 * document source and return the text span covering the method name, so
 * go-to-definition lands on the polyfill itself.
 * @param text - document source text
 * @param method - the polyfilled method name
 * @returns the method-name text span, or null if not found
 */
function findPrototypeAssignmentSpan(
    text: string,
    method: string
): { start: number; length: number } | undefined {
    const escaped = method.replaceAll('$', String.raw`\$`);
    const re = new RegExp(String.raw`\bprototype\s*\.\s*(` + escaped + String.raw`)\b`, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        // Offset of the captured method name (group 1) within the full match.
        const start = match.index + match[0].indexOf(match[1]);
        // The polyfill's own JSDoc references the method as
        // `Ctor.prototype.method` in prose (e.g. "Polyfill for
        // String.prototype.search"); skip any match inside a comment so the
        // span lands on the real assignment identifier, not the doc text.
        if (isOffsetInsideComment(text, start)) continue;
        return { start, length: match[1].length };
    }
    return undefined;
}

/**
 * Return an LSP SignatureHelp from the embedded TypeScript language service at
 * the given cursor position.  Returns undefined when the cursor is not inside a
 * function call or TypeScript has no type information for it.
 *
 * Uses TypeScript's native display-part machinery to build the label and
 * numeric `[startOffset, endOffset]` parameter spans so VS Code highlights
 * the active parameter correctly.
 * @param uri - LSP document URI
 * @param position - cursor position in the document
 * @returns LSP SignatureHelp, or undefined if the cursor is not inside a function call
 */
export function getSsjsSignatureHelp(uri: string, position: Position): SignatureHelp | undefined {
    const name = uriToVirtualName.get(uri);
    const file = name ? virtualFiles.get(name) : undefined;
    if (!name || !file) return undefined;
    setActiveDocument(name);

    const offset = positionToOffset(file.content, position);
    let info: ts.SignatureHelpItems | undefined;
    try {
        info = languageService.getSignatureHelpItems(name, offset, {});
    } catch {
        return undefined;
    }
    if (!info || info.items.length === 0) return undefined;

    const signatures: SignatureInformation[] = info.items.map((item) => {
        const prefixText = item.prefixDisplayParts.map((p) => p.text).join('');
        const suffixText = item.suffixDisplayParts.map((p) => p.text).join('');
        const separatorText = item.separatorDisplayParts.map((p) => p.text).join('');

        // Build label and compute exact [start, end] byte-offsets for each parameter.
        // Note: span is computed independently from docText — changing documentation
        // to MarkupContent does not affect active-parameter highlighting.
        let cursor = prefixText.length;
        const parameters: ParameterInformation[] = item.parameters.map((p, index) => {
            if (index > 0) cursor += separatorText.length;
            const parameterText = p.displayParts.map((d) => d.text).join('');
            const span: [number, number] = [cursor, cursor + parameterText.length];
            cursor += parameterText.length;
            const rawDocument_ = p.documentation?.map((d) => d.text).join('');
            const documentation: MarkupContent | undefined = rawDocument_
                ? { kind: 'markdown', value: rawDocument_ }
                : undefined;
            return { label: span, documentation };
        });

        const parameterParts = item.parameters
            .map((p) => p.displayParts.map((d) => d.text).join(''))
            .join(separatorText);
        const label = prefixText + parameterParts + suffixText;

        const rawDocument = item.documentation?.map((d) => d.text).join('');
        const documentation: MarkupContent | undefined = rawDocument
            ? { kind: 'markdown', value: rawDocument }
            : undefined;
        return { label, documentation, parameters };
    });

    return {
        signatures,
        activeSignature: info.selectedItemIndex,
        activeParameter: info.argumentIndex,
    };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Flatten a TypeScript diagnostic message chain into a single newline-joined string.
 * @param message - the TypeScript diagnostic message chain
 * @returns the flattened message text
 */
function flattenDiagnosticMessageText(message: ts.DiagnosticMessageChain): string {
    let text = message.messageText;
    if (message.next) {
        for (const next of message.next) {
            text += '\n' + flattenDiagnosticMessageText(next);
        }
    }
    return text;
}
