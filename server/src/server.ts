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
    ReferenceParams,
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
    getSsjsDefinition as getSsjsTsDefinition,
    getSsjsReferences as getSsjsTsReferences,
} from './ts-service';

// ---------------------------------------------------------------------------
// Connection & Document Manager
// ---------------------------------------------------------------------------
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// Mutable server capabilities, kept on a holder object so handlers can update
// them without reassigning a top-level variable (unicorn/no-top-level-assignment-in-function).
const capabilityState = {
    hasConfigCapability: false,
    hasWorkspaceFolderCapability: false,
};

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
connection.onInitialize((parameters: InitializeParams) => {
    const capabilities = parameters.capabilities;

    capabilityState.hasConfigCapability = !!capabilities.workspace?.configuration;
    capabilityState.hasWorkspaceFolderCapability = !!capabilities.workspace?.workspaceFolders;

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['@', '%', '(', ',', '.'],
            },
            hoverProvider: true,
            signatureHelpProvider: {
                // '(' and ',' drive AMPscript/SSJS paren calls; ' ' is required
                // for MCN Handlebars helpers, whose arguments are whitespace-
                // separated inside `{{ }}` (e.g. `{{substring value 0 3}}`) and
                // therefore never hit a paren/comma trigger.
                triggerCharacters: ['(', ',', ' '],
            },
            codeActionProvider: true,
            definitionProvider: true,
            referencesProvider: true,
        },
    };
    if (capabilityState.hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: { supported: true },
        };
    }
    return result;
});

connection.onInitialized(() => {
    if (capabilityState.hasConfigCapability) {
        connection.client.register(DidChangeConfigurationNotification.type);
    }
    if (capabilityState.hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(() => {
            connection.console.log('Workspace folder change event received.');
        });
    }
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const defaultSettings: SfmcSettings = { maxNumberOfProblems: 100 };
// Holder so the global fallback settings can be replaced without reassigning a
// top-level variable inside a handler (unicorn/no-top-level-assignment-in-function).
const settingsState: { globalSettings: SfmcSettings } = { globalSettings: defaultSettings };
const documentSettings = new Map<string, Thenable<SfmcSettings>>();

connection.onDidChangeConfiguration((change) => {
    if (capabilityState.hasConfigCapability) {
        documentSettings.clear();
    } else {
        settingsState.globalSettings =
            (change.settings.sfmcLanguageServer as SfmcSettings | null) ?? defaultSettings;
    }
    for (const document of documents.all()) {
        void sendDiagnosticsForDocument(document.uri);
    }
});

/**
 * Resolve the effective settings for a document, caching per-resource results.
 * @param resource - the document URI to resolve settings for
 * @returns a promise resolving to the settings for that document
 */
async function getDocumentSettings(resource: string): Promise<SfmcSettings> {
    if (!capabilityState.hasConfigCapability) {
        return settingsState.globalSettings;
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = (async (): Promise<SfmcSettings> => {
            const config = (await connection.workspace.getConfiguration({
                scopeUri: resource,
                section: 'sfmcLanguageServer',
            })) as SfmcSettings | null;
            return config ?? defaultSettings;
        })();
        documentSettings.set(resource, result);
    }
    return result;
}

// ---------------------------------------------------------------------------
// Language Detection
// ---------------------------------------------------------------------------

/**
 * True when the document is a Handlebars file. `.hbs` uses VS Code's built-in
 * `handlebars` language id (HTML + Handlebars). Handlebars is Marketing Cloud
 * Next-only, so these documents always run in MCN mode (see effectiveSettings).
 * @param document - the text document to test
 * @returns true if the document is Handlebars (by language id or .hbs extension)
 */
function isHandlebarsDocument(document: TextDocument): boolean {
    return document.languageId === 'handlebars' || document.uri.toLowerCase().endsWith('.hbs');
}

/**
 * Map a document to the language the SFMC language service should treat it as.
 * @param document - the text document to classify
 * @returns 'ssjs' for SSJS documents, otherwise 'ampscript' (also used for Handlebars)
 */
function getDocumentLanguage(document: TextDocument): 'ampscript' | 'ssjs' {
    if (document.languageId === 'ssjs') return 'ssjs';
    if (document.languageId === 'ampscript' || document.languageId === 'sfmc') return 'ampscript';
    if (document.uri.toLowerCase().endsWith('.ssjs')) return 'ssjs';
    // Handlebars intelligence lives on the ampscript path in sfmc-language-lsp.
    return 'ampscript';
}

/**
 * Return settings adjusted for the given document. Handlebars documents always
 * target Marketing Cloud Next so their MCN Handlebars intelligence (validation,
 * completions, hover, signature help, code actions) is available regardless of
 * the user's `sfmcLanguageServer.targetPlatform` setting.
 * @param document - the text document being processed
 * @param settings - the resolved settings for the document
 * @returns settings with `targetPlatform: 'next'` forced for Handlebars docs
 */
function effectiveSettings(document: TextDocument, settings: SfmcSettings): SfmcSettings {
    if (isHandlebarsDocument(document)) {
        return { ...settings, targetPlatform: 'next' };
    }
    return settings;
}

// ---------------------------------------------------------------------------
// Diagnostics (push via textDocument/publishDiagnostics — not pull)
// Pull diagnostics are skipped by vscode-languageclient when the document is not
// in a visible tab, which breaks extension tests and some editor scenarios.
// ---------------------------------------------------------------------------
/**
 * Compute and publish diagnostics for a document (SFMC LSP + embedded SSJS TS).
 * @param uri - the document URI to validate and publish diagnostics for
 * @returns a promise that resolves once diagnostics have been sent
 */
async function sendDiagnosticsForDocument(uri: string): Promise<void> {
    const document = documents.get(uri);
    if (!document) {
        connection.sendDiagnostics({ uri, diagnostics: [] });
        return;
    }
    const settings = await getDocumentSettings(document.uri);
    const effective = effectiveSettings(document, settings);
    const document_ = {
        text: document.getText(),
        languageId: getDocumentLanguage(document),
        uri: document.uri,
    };
    const sfmcDiags = sfmcLanguageService.validate(document_, effective);
    let ssjsDiags: import('vscode-languageserver').Diagnostic[] = [];
    let tsDiags: import('vscode-languageserver').Diagnostic[] = [];
    if (document_.languageId === 'ssjs') {
        tsDiags = getSsjsDiagnostics(uri);
    } else if (document_.languageId === 'ampscript') {
        const regions = getSsjsRegions(document_.text);
        if (regions.length > 0) {
            // Run SSJS-specific validators (requiresCoreLoad, deprecated, etc.) on the
            // extracted content — positions map 1:1 to the original HTML file.
            const ssjsDocument = {
                text: extractSsjsContent(document_.text, regions),
                languageId: 'ssjs' as const,
                uri: document_.uri,
            };
            ssjsDiags = sfmcLanguageService.validate(ssjsDocument, effective);
            tsDiags = getSsjsDiagnostics(uri).filter((d) =>
                isInSsjsRegion(regions, document.offsetAt(d.range.start))
            );
        }
    }
    connection.sendDiagnostics({ uri, diagnostics: [...sfmcDiags, ...ssjsDiags, ...tsDiags] });
}

/**
 * Keep the embedded TypeScript virtual file in sync with the document's SSJS.
 * @param document - the text document whose SSJS content should be synced
 */
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

documents.onDidOpen((event) => {
    syncSsjsVirtualFile(event.document);
    void sendDiagnosticsForDocument(event.document.uri);
});

documents.onDidChangeContent((event) => {
    syncSsjsVirtualFile(event.document);
    void sendDiagnosticsForDocument(event.document.uri);
});

documents.onDidClose((event) => {
    documentSettings.delete(event.document.uri);
    const lang = getDocumentLanguage(event.document);
    if (lang === 'ssjs' || lang === 'ampscript') {
        removeSsjsDocument(event.document.uri);
    }
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

// ---------------------------------------------------------------------------
// Code Actions
// ---------------------------------------------------------------------------
connection.onCodeAction(async (parameters): Promise<CodeAction[]> => {
    const document = documents.get(parameters.textDocument.uri);
    if (!document) return [];
    const settings = await getDocumentSettings(document.uri);
    const document_ = {
        text: document.getText(),
        languageId: getDocumentLanguage(document),
        uri: document.uri,
    };
    return sfmcLanguageService.getCodeActions(
        document_,
        parameters.context.diagnostics,
        effectiveSettings(document, settings)
    ) as CodeAction[];
});

// ---------------------------------------------------------------------------
// Completions
// ---------------------------------------------------------------------------
connection.onCompletion(async (parameters: TextDocumentPositionParams) => {
    const document = documents.get(parameters.textDocument.uri);
    if (!document) return [];
    const settings = await getDocumentSettings(document.uri);
    const document_ = {
        text: document.getText(),
        languageId: getDocumentLanguage(document),
        uri: document.uri,
    };
    const sfmcItems = sfmcLanguageService.getCompletions(
        document_,
        parameters.position,
        effectiveSettings(document, settings)
    ) as import('vscode-languageserver').CompletionItem[];

    // For ampscript docs: delegate to TS service if cursor is inside a SSJS region
    const isInSsjsContext =
        document_.languageId === 'ssjs' ||
        (document_.languageId === 'ampscript' &&
            isInSsjsRegion(getSsjsRegions(document_.text), document.offsetAt(parameters.position)));
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
    const sfmcLabels = new Set(sfmcItems.map((index) => index.label));
    const merged = [...sfmcItems, ...tsItems.filter((index) => !sfmcLabels.has(index.label))];
    return merged;
});

connection.onCompletionResolve((item) => {
    return sfmcLanguageService.resolveCompletion(item);
});

// ---------------------------------------------------------------------------
// Hover
// ---------------------------------------------------------------------------
connection.onHover(async (parameters) => {
    const document = documents.get(parameters.textDocument.uri);
    if (!document) return;
    const settings = await getDocumentSettings(document.uri);
    const document_ = {
        text: document.getText(),
        languageId: getDocumentLanguage(document),
        uri: document.uri,
    };
    const line = document.getText({
        start: { line: parameters.position.line, character: 0 },
        end: { line: parameters.position.line + 1, character: 0 },
    });
    const sfmcHover = sfmcLanguageService.getHover(
        document_,
        line,
        parameters.position,
        effectiveSettings(document, settings)
    );
    const isInSsjsForHover =
        document_.languageId === 'ssjs' ||
        (document_.languageId === 'ampscript' &&
            isInSsjsRegion(getSsjsRegions(document_.text), document.offsetAt(parameters.position)));
    if (!isInSsjsForHover) return sfmcHover;
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
connection.onSignatureHelp(async (parameters) => {
    const document = documents.get(parameters.textDocument.uri);
    if (!document) return;
    const settings = await getDocumentSettings(document.uri);
    const document_ = {
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
    const isInSsjsContext =
        document_.languageId === 'ssjs' ||
        (document_.languageId === 'ampscript' &&
            isInSsjsRegion(getSsjsRegions(document_.text), document.offsetAt(parameters.position)));
    if (isInSsjsContext) {
        return getSsjsSignatureHelp(document.uri, parameters.position);
    }
    return sfmcLanguageService.getSignatureHelp(
        document_,
        textUpToCursor,
        effectiveSettings(document, settings)
    );
});

// ---------------------------------------------------------------------------
// Go to Definition
// ---------------------------------------------------------------------------
connection.onDefinition((parameters: DefinitionParams): Location | Location[] | undefined => {
    const document = documents.get(parameters.textDocument.uri);
    if (!document) return undefined;
    const definitionLang = getDocumentLanguage(document);
    const definitionText = document.getText();
    const isInSsjsForDefinition =
        definitionLang === 'ssjs' ||
        (definitionLang === 'ampscript' &&
            isInSsjsRegion(getSsjsRegions(definitionText), document.offsetAt(parameters.position)));
    if (!isInSsjsForDefinition) return undefined;

    // Prefer the embedded TypeScript language service: it resolves top-level
    // functions, locals, object members, and prototype-polyfilled methods —
    // matching the go-to-definition behavior users get in plain .js files.
    const tsLocations = getSsjsTsDefinition(document.uri, parameters.position);
    if (tsLocations.length > 0) {
        return tsLocations.length === 1 ? tsLocations[0] : tsLocations;
    }

    // Fallback: regex-based resolution of file-local `function name()` declarations
    // (covers cases where TS has no symbol, e.g. inside AMPscript-embedded SSJS).
    const line = document.getText({
        start: { line: parameters.position.line, character: 0 },
        end: { line: parameters.position.line + 1, character: 0 },
    });

    // Extract the identifier at the cursor
    const beforeCursor = line.slice(0, parameters.position.character + 1);
    const wordMatch = beforeCursor.match(/[\w$]+$/);
    if (!wordMatch) return undefined;
    const word = wordMatch[0];

    const document_ = {
        text: document.getText(),
        languageId: 'ssjs' as const,
        uri: document.uri,
    };
    const location = sfmcLanguageService.getDefinition(document_, word);
    if (!location) return undefined;
    return { uri: document.uri, range: location.range };
});

// ---------------------------------------------------------------------------
// Find All References
// ---------------------------------------------------------------------------
connection.onReferences((parameters: ReferenceParams): Location[] | undefined => {
    const document = documents.get(parameters.textDocument.uri);
    if (!document) return undefined;
    const referenceLang = getDocumentLanguage(document);
    const referenceText = document.getText();
    const isInSsjsForReference =
        referenceLang === 'ssjs' ||
        (referenceLang === 'ampscript' &&
            isInSsjsRegion(getSsjsRegions(referenceText), document.offsetAt(parameters.position)));
    if (!isInSsjsForReference) return undefined;

    // The embedded TypeScript language service resolves references for top-level
    // functions, locals, object members, and prototype-polyfilled methods.
    const tsLocations = getSsjsTsReferences(document.uri, parameters.position);
    return tsLocations.length > 0 ? tsLocations : undefined;
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
        for (let index = pos; index < region.start; index++) {
            out.push(text[index] === '\n' ? '\n' : ' ');
        }
        out.push(text.slice(region.start, region.end));
        pos = region.end;
    }
    for (let index = pos; index < text.length; index++) {
        out.push(text[index] === '\n' ? '\n' : ' ');
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
