/**
 * SFMC Language Server
 *
 * Thin LSP adapter — all language intelligence is delegated to sfmc-language-lsp.
 * This file owns only the connection lifecycle, document management, and settings.
 */
import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    DefinitionParams,
    Location,
    CodeAction,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { sfmcLanguageService, type SfmcSettings } from 'sfmc-language-lsp';
import {
    updateSsjsDocument,
    removeSsjsDocument,
    getSsjsCompletionInfo,
    getSsjsDiagnostics,
    getSsjsHover,
    getSsjsSignatureHelp,
} from './tsService';

// ---------------------------------------------------------------------------
// Connection & Document Manager
// ---------------------------------------------------------------------------
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
connection.onInitialize((parameters: InitializeParams) => {
    const capabilities = parameters.capabilities;

    hasConfigurationCapability = !!capabilities.workspace?.configuration;
    hasWorkspaceFolderCapability = !!capabilities.workspace?.workspaceFolders;

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['@', '%', '(', ',', '.'],
            },
            hoverProvider: true,
            signatureHelpProvider: {
                triggerCharacters: ['(', ','],
            },
            codeActionProvider: true,
            definitionProvider: true,
        },
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: { supported: true },
        };
    }
    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        connection.client.register(DidChangeConfigurationNotification.type);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(() => {
            connection.console.log('Workspace folder change event received.');
        });
    }
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const defaultSettings: SfmcSettings = { maxNumberOfProblems: 100 };
let globalSettings: SfmcSettings = defaultSettings;
const documentSettings = new Map<string, Thenable<SfmcSettings>>();

connection.onDidChangeConfiguration((change) => {
    if (hasConfigurationCapability) {
        documentSettings.clear();
    } else {
        globalSettings =
            (change.settings.sfmcLanguageServer as SfmcSettings | null) ?? defaultSettings;
    }
    for (const doc of documents.all()) {
        void sendDiagnosticsForDocument(doc.uri);
    }
});

function getDocumentSettings(resource: string): Thenable<SfmcSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace
            .getConfiguration({
                scopeUri: resource,
                section: 'sfmcLanguageServer',
            })
            .then((cfg: SfmcSettings | null) => cfg ?? defaultSettings);
        documentSettings.set(resource, result);
    }
    return result;
}

// ---------------------------------------------------------------------------
// Language Detection
// ---------------------------------------------------------------------------
function getDocumentLanguage(document: TextDocument): 'ampscript' | 'ssjs' {
    if (document.languageId === 'ssjs') return 'ssjs';
    if (document.languageId === 'ampscript' || document.languageId === 'sfmc') return 'ampscript';
    if (document.uri.toLowerCase().endsWith('.ssjs')) return 'ssjs';
    return 'ampscript';
}

// ---------------------------------------------------------------------------
// Diagnostics (push via textDocument/publishDiagnostics — not pull)
// Pull diagnostics are skipped by vscode-languageclient when the document is not
// in a visible tab, which breaks extension tests and some editor scenarios.
// ---------------------------------------------------------------------------
async function sendDiagnosticsForDocument(uri: string): Promise<void> {
    const document = documents.get(uri);
    if (!document) {
        connection.sendDiagnostics({ uri, diagnostics: [] });
        return;
    }
    const settings = await getDocumentSettings(document.uri);
    const doc = {
        text: document.getText(),
        languageId: getDocumentLanguage(document),
        uri: document.uri,
    };
    const sfmcDiags = sfmcLanguageService.validate(doc, settings);
    let ssjsDiags: import('vscode-languageserver').Diagnostic[] = [];
    let tsDiags: import('vscode-languageserver').Diagnostic[] = [];
    if (doc.languageId === 'ssjs') {
        tsDiags = getSsjsDiagnostics(uri);
    } else if (doc.languageId === 'ampscript') {
        const regions = getSsjsRegions(doc.text);
        if (regions.length > 0) {
            // Run SSJS-specific validators (requiresCoreLoad, deprecated, etc.) on the
            // extracted content — positions map 1:1 to the original HTML file.
            const ssjsDoc = {
                text: extractSsjsContent(doc.text, regions),
                languageId: 'ssjs' as const,
                uri: doc.uri,
            };
            ssjsDiags = sfmcLanguageService.validate(ssjsDoc, settings);
            tsDiags = getSsjsDiagnostics(uri).filter((d) =>
                isInSsjsRegion(regions, document.offsetAt(d.range.start))
            );
        }
    }
    connection.sendDiagnostics({ uri, diagnostics: [...sfmcDiags, ...ssjsDiags, ...tsDiags] });
}

function syncSsjsVirtualFile(document: TextDocument): void {
    const lang = getDocumentLanguage(document);
    const text = document.getText();
    if (lang === 'ssjs') {
        updateSsjsDocument(document.uri, text);
    } else if (lang === 'ampscript') {
        const regions = getSsjsRegions(text);
        if (regions.length > 0) {
            updateSsjsDocument(document.uri, extractSsjsContent(text, regions));
        } else {
            removeSsjsDocument(document.uri);
        }
    }
}

documents.onDidOpen((e) => {
    syncSsjsVirtualFile(e.document);
    void sendDiagnosticsForDocument(e.document.uri);
});

documents.onDidChangeContent((e) => {
    syncSsjsVirtualFile(e.document);
    void sendDiagnosticsForDocument(e.document.uri);
});

documents.onDidClose((e) => {
    documentSettings.delete(e.document.uri);
    const lang = getDocumentLanguage(e.document);
    if (lang === 'ssjs' || lang === 'ampscript') {
        removeSsjsDocument(e.document.uri);
    }
    connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

// ---------------------------------------------------------------------------
// Code Actions
// ---------------------------------------------------------------------------
connection.onCodeAction((parameters): CodeAction[] => {
    const document = documents.get(parameters.textDocument.uri);
    if (!document) return [];
    const doc = {
        text: document.getText(),
        languageId: getDocumentLanguage(document),
        uri: document.uri,
    };
    return sfmcLanguageService.getCodeActions(doc, parameters.context.diagnostics) as CodeAction[];
});

// ---------------------------------------------------------------------------
// Completions
// ---------------------------------------------------------------------------
connection.onCompletion((parameters: TextDocumentPositionParams) => {
    const document = documents.get(parameters.textDocument.uri);
    if (!document) return [];
    const doc = {
        text: document.getText(),
        languageId: getDocumentLanguage(document),
        uri: document.uri,
    };
    const sfmcItems = sfmcLanguageService.getCompletions(
        doc,
        parameters.position
    ) as import('vscode-languageserver').CompletionItem[];

    // For ampscript docs: delegate to TS service if cursor is inside a SSJS region
    const isInSsjsContext =
        doc.languageId === 'ssjs' ||
        (doc.languageId === 'ampscript' &&
            isInSsjsRegion(getSsjsRegions(doc.text), document.offsetAt(parameters.position)));
    if (!isInSsjsContext) return sfmcItems;

    const { items: tsItems, isMemberCompletion } = getSsjsCompletionInfo(
        document.uri,
        parameters.position
    );
    // Text-based dot-access detection — catches edge cases where TypeScript's
    // isMemberCompletion is false despite a trailing dot.
    const textBefore = document.getText({
        start: { line: parameters.position.line, character: 0 },
        end: parameters.position,
    });
    const isDotAccess = /\.\s*$/.test(textBefore);
    if (isMemberCompletion || isDotAccess) {
        // Only show TS items that are "specific" (≤50 = typed namespace members).
        // If TS returns 100+ items it means the type is `any` (e.g. unknown variable
        // or a namespace TypeScript can't resolve) — return nothing to avoid noise.
        return tsItems.length <= 50 ? tsItems : [];
    }
    // Top-level: SFMC catalog first, TS fills in anything not already present.
    const sfmcLabels = new Set(sfmcItems.map((i) => i.label));
    const merged = [...sfmcItems, ...tsItems.filter((i) => !sfmcLabels.has(i.label))];
    return merged;
});

connection.onCompletionResolve((item) => {
    return sfmcLanguageService.resolveCompletion(item);
});

// ---------------------------------------------------------------------------
// Hover
// ---------------------------------------------------------------------------
connection.onHover((parameters) => {
    const document = documents.get(parameters.textDocument.uri);
    if (!document) return null;
    const doc = {
        text: document.getText(),
        languageId: getDocumentLanguage(document),
        uri: document.uri,
    };
    const line = document.getText({
        start: { line: parameters.position.line, character: 0 },
        end: { line: parameters.position.line + 1, character: 0 },
    });
    const sfmcHover = sfmcLanguageService.getHover(doc, line, parameters.position);
    const inSsjsRegion =
        doc.languageId === 'ssjs' ||
        (doc.languageId === 'ampscript' &&
            isInSsjsRegion(getSsjsRegions(doc.text), document.offsetAt(parameters.position)));
    if (!inSsjsRegion) return sfmcHover;
    const tsHover = getSsjsHover(document.uri, parameters.position);
    // TS hover now carries full docs (description, @param, @returns, @example, ssjs.guide link)
    // so it is self-sufficient.  The SFMC LSP hover is used only as a fallback for symbols
    // that have no TS declaration (ECMAScript builtins, local user functions, etc.).
    if (tsHover) return tsHover;
    return sfmcHover;
});

// ---------------------------------------------------------------------------
// Signature Help
// ---------------------------------------------------------------------------
connection.onSignatureHelp((parameters) => {
    const document = documents.get(parameters.textDocument.uri);
    if (!document) return null;
    const doc = {
        text: document.getText(),
        languageId: getDocumentLanguage(document),
        uri: document.uri,
    };
    const textUpToCursor = document.getText({
        start: { line: 0, character: 0 },
        end: parameters.position,
    });
    // TypeScript signature help provides correct parameter spans for highlighting
    // TypeScript covers both SFMC catalog functions and locally-defined user
    // functions (they are in the virtual file). No SFMC LSP fallback for SSJS.
    const inSsjsCtx =
        doc.languageId === 'ssjs' ||
        (doc.languageId === 'ampscript' &&
            isInSsjsRegion(getSsjsRegions(doc.text), document.offsetAt(parameters.position)));
    if (inSsjsCtx) {
        return getSsjsSignatureHelp(document.uri, parameters.position);
    }
    return sfmcLanguageService.getSignatureHelp(doc, textUpToCursor);
});

// ---------------------------------------------------------------------------
// Go to Definition
// ---------------------------------------------------------------------------
connection.onDefinition((parameters: DefinitionParams): Location | null => {
    const document = documents.get(parameters.textDocument.uri);
    if (!document) return null;
    const defLang = getDocumentLanguage(document);
    const defText = document.getText();
    const inSsjsForDef =
        defLang === 'ssjs' ||
        (defLang === 'ampscript' &&
            isInSsjsRegion(getSsjsRegions(defText), document.offsetAt(parameters.position)));
    if (!inSsjsForDef) return null;

    const line = document.getText({
        start: { line: parameters.position.line, character: 0 },
        end: { line: parameters.position.line + 1, character: 0 },
    });

    // Extract the identifier at the cursor
    const beforeCursor = line.slice(0, parameters.position.character + 1);
    const wordMatch = beforeCursor.match(/[\w$]+$/);
    if (!wordMatch) return null;
    const word = wordMatch[0];

    const doc = {
        text: document.getText(),
        languageId: 'ssjs' as const,
        uri: document.uri,
    };
    const location = sfmcLanguageService.getDefinition(doc, word);
    if (!location) return null;
    return { uri: document.uri, range: location.range };
});

// ---------------------------------------------------------------------------
// Watched files
// ---------------------------------------------------------------------------
connection.onDidChangeWatchedFiles(() => {
    connection.console.log('File change event received.');
});

// ---------------------------------------------------------------------------
// SSJS region helpers  (used when languageId === 'ampscript' to detect and
// extract embedded <script runat="server"> blocks for TypeScript features)
// ---------------------------------------------------------------------------

interface SsjsRegion {
    start: number; // char offset of first content character (after >)
    end: number; // char offset of last content character (before </)
}

/**
 * Return character-offset ranges of all SSJS script blocks in the document.
 * Matches `<script runat="server">` WITHOUT `language="ampscript"`.
 * @param text - full document text
 * @returns array of {start, end} character offsets for SSJS content
 */
function getSsjsRegions(text: string): SsjsRegion[] {
    const regions: SsjsRegion[] = [];
    const openTag =
        /<script(?=[^>]*\brunat\s*=\s*["']server["'])(?![^>]*\blanguage\s*=\s*["']ampscript["'])[^>]*>/gi;
    const closeTag = /<\/script>/gi;
    let openMatch: RegExpExecArray | null;
    while ((openMatch = openTag.exec(text)) !== null) {
        const contentStart = openMatch.index + openMatch[0].length;
        closeTag.lastIndex = contentStart;
        const closeMatch = closeTag.exec(text);
        if (!closeMatch) break;
        regions.push({ start: contentStart, end: closeMatch.index });
        openTag.lastIndex = closeMatch.index + closeMatch[0].length;
    }
    return regions;
}

/**
 * Return true if the character offset falls within any SSJS region.
 * @param regions - SSJS regions from getSsjsRegions()
 * @param offset - character offset to test
 * @returns true if inside a SSJS region
 */
function isInSsjsRegion(regions: SsjsRegion[], offset: number): boolean {
    return regions.some((r) => offset >= r.start && offset <= r.end);
}

/**
 * Return a document-length string containing only SSJS content with all other
 * characters replaced by spaces (newlines preserved to keep line numbers stable).
 * This lets the TypeScript service use the same character offsets as the HTML file.
 * @param text - full document text
 * @param regions - SSJS regions from getSsjsRegions()
 * @returns whitespace-padded string of same length as text
 */
function extractSsjsContent(text: string, regions: SsjsRegion[]): string {
    const out: string[] = [];
    let pos = 0;
    for (const region of regions) {
        for (let i = pos; i < region.start; i++) {
            out.push(text[i] === '\n' ? '\n' : ' ');
        }
        out.push(text.slice(region.start, region.end));
        pos = region.end;
    }
    for (let i = pos; i < text.length; i++) {
        out.push(text[i] === '\n' ? '\n' : ' ');
    }
    return out.join('');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
documents.listen(connection);
connection.listen();
