/**
 * tsService.ts
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

function loadGlobalsContent(): string {
    // 1. Direct sibling install — server/node_modules/ssjs-data (most reliable in CI)
    const candidates: string[] = [
        path.resolve(__dirname, '..', 'node_modules', 'ssjs-data', 'dist', 'sfmc-globals.d.ts'),
    ];

    // 2. Module-resolution lookup (handles hoisted or alternate install locations)
    try {
        const pkgJson = require.resolve('ssjs-data/package.json');
        candidates.push(path.join(path.dirname(pkgJson), 'dist', 'sfmc-globals.d.ts'));
    } catch {
        // ssjs-data not resolvable via require
    }

    // 3. Workspace sibling — __dirname is server/out at runtime
    candidates.push(
        path.resolve(__dirname, '..', '..', '..', 'ssjs-data', 'dist', 'sfmc-globals.d.ts')
    );

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

const GLOBALS_CONTENT =
    loadGlobalsContent() +
    '\n// SFMC global shorthands\ndeclare var WSProxy: typeof Script.Util.WSProxy;\n';

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
// ---------------------------------------------------------------------------

let docCounter = 0;
const uriToVirtualName = new Map<string, string>();

function virtualNameForUri(uri: string): string {
    let name = uriToVirtualName.get(uri);
    if (!name) {
        name = `__doc_${docCounter++}.js`;
        uriToVirtualName.set(uri, name);
    }
    return name;
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
        return [...virtualFiles.keys()];
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

function positionToOffset(text: string, position: Position): number {
    const lines = text.split('\n');
    let offset = 0;
    for (let i = 0; i < position.line && i < lines.length; i++) {
        offset += lines[i].length + 1; // +1 for the '\n'
    }
    return offset + position.character;
}

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

function tsKindToLsp(kind: string): CompletionItemKind {
    return TS_KIND_MAP[kind] ?? CompletionItemKind.Text;
}

// ---------------------------------------------------------------------------
// TS diagnostic category → LSP severity
// ---------------------------------------------------------------------------

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
 * @param uri - LSP document URI
 * @param text - full document text
 */
export function updateSsjsDocument(uri: string, text: string): void {
    setVirtualFile(virtualNameForUri(uri), text);
}

/**
 * Remove a SSJS document from the virtual FS (e.g. on close).
 * @param uri - LSP document URI
 */
export function removeSsjsDocument(uri: string): void {
    const name = uriToVirtualName.get(uri);
    if (name) {
        virtualFiles.delete(name);
        uriToVirtualName.delete(uri);
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

    const results: Diagnostic[] = [];
    for (const d of tsDiags) {
        if (d.start === undefined || d.length === undefined) continue;
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
 * Return an LSP Hover from the embedded TypeScript language service at the
 * given cursor position.  Returns null when there is nothing to show.
 * @param uri - LSP document URI
 * @param position - cursor position in the document
 * @returns LSP Hover with markdown content, or null if nothing to show
 */
export function getSsjsHover(uri: string, position: Position): Hover | null {
    const name = uriToVirtualName.get(uri);
    if (!name) return null;
    const file = virtualFiles.get(name);
    if (!file) return null;

    const offset = positionToOffset(file.content, position);
    let info: ts.QuickInfo | undefined;
    try {
        info = languageService.getQuickInfoAtPosition(name, offset);
    } catch {
        return null;
    }
    if (!info) return null;

    const sig = info.displayParts?.map((p) => p.text).join('') ?? '';
    const docs = info.documentation?.map((p) => p.text).join('') ?? '';

    const parts: string[] = [];
    if (sig) parts.push('```typescript\n' + sig + '\n```');
    if (docs) parts.push(docs);

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
            const spaceIdx = tagText.indexOf(' ');
            const pName = spaceIdx === -1 ? tagText : tagText.slice(0, spaceIdx);
            const pDesc =
                spaceIdx === -1 ? '' : tagText.slice(spaceIdx + 1).replace(/^[-–]\s*/, '');
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

    if (parts.length === 0) return null;

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
 * Return an LSP SignatureHelp from the embedded TypeScript language service at
 * the given cursor position.  Returns null when the cursor is not inside a
 * function call or TypeScript has no type information for it.
 *
 * Uses TypeScript's native display-part machinery to build the label and
 * numeric `[startOffset, endOffset]` parameter spans so VS Code highlights
 * the active parameter correctly.
 * @param uri - LSP document URI
 * @param position - cursor position in the document
 * @returns LSP SignatureHelp, or null if the cursor is not inside a function call
 */
export function getSsjsSignatureHelp(uri: string, position: Position): SignatureHelp | null {
    const name = uriToVirtualName.get(uri);
    const file = name ? virtualFiles.get(name) : undefined;
    if (!name || !file) return null;

    const offset = positionToOffset(file.content, position);
    let info: ts.SignatureHelpItems | undefined;
    try {
        info = languageService.getSignatureHelpItems(name, offset, {});
    } catch {
        return null;
    }
    if (!info || info.items.length === 0) return null;

    const signatures: SignatureInformation[] = info.items.map((item) => {
        const prefixText = item.prefixDisplayParts.map((p) => p.text).join('');
        const suffixText = item.suffixDisplayParts.map((p) => p.text).join('');
        const sepText = item.separatorDisplayParts.map((p) => p.text).join('');

        // Build label and compute exact [start, end] byte-offsets for each parameter.
        // Note: span is computed independently from docText — changing documentation
        // to MarkupContent does not affect active-parameter highlighting.
        let cursor = prefixText.length;
        const parameters: ParameterInformation[] = item.parameters.map((p, i) => {
            if (i > 0) cursor += sepText.length;
            const paramText = p.displayParts.map((d) => d.text).join('');
            const span: [number, number] = [cursor, cursor + paramText.length];
            cursor += paramText.length;
            const rawDoc = p.documentation?.map((d) => d.text).join('');
            const documentation: MarkupContent | undefined = rawDoc
                ? { kind: 'markdown', value: rawDoc }
                : undefined;
            return { label: span, documentation };
        });

        const paramParts = item.parameters
            .map((p) => p.displayParts.map((d) => d.text).join(''))
            .join(sepText);
        const label = prefixText + paramParts + suffixText;

        const rawDoc = item.documentation?.map((d) => d.text).join('');
        const documentation: MarkupContent | undefined = rawDoc
            ? { kind: 'markdown', value: rawDoc }
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

function flattenDiagnosticMessageText(msg: ts.DiagnosticMessageChain): string {
    let text = msg.messageText;
    if (msg.next) {
        for (const next of msg.next) {
            text += '\n' + flattenDiagnosticMessageText(next);
        }
    }
    return text;
}
