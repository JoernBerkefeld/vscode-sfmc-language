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
    if (document.languageId === 'ampscript') return 'ampscript';
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
    connection.sendDiagnostics({ uri, diagnostics: sfmcLanguageService.validate(doc, settings) });
}

documents.onDidOpen((e) => {
    void sendDiagnosticsForDocument(e.document.uri);
});

documents.onDidChangeContent((e) => {
    void sendDiagnosticsForDocument(e.document.uri);
});

documents.onDidClose((e) => {
    documentSettings.delete(e.document.uri);
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
    return sfmcLanguageService.getCompletions(doc, parameters.position);
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
    return sfmcLanguageService.getHover(doc, line, parameters.position);
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
    return sfmcLanguageService.getSignatureHelp(doc, textUpToCursor);
});

// ---------------------------------------------------------------------------
// Go to Definition
// ---------------------------------------------------------------------------
connection.onDefinition((parameters: DefinitionParams): Location | null => {
    const document = documents.get(parameters.textDocument.uri);
    if (!document) return null;
    if (getDocumentLanguage(document) !== 'ssjs') return null;

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
// Start
// ---------------------------------------------------------------------------
documents.listen(connection);
connection.listen();
