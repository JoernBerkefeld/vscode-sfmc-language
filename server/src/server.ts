/**
 * SFMC Language Server
 * Provides completions, hover documentation, and diagnostics for AMPscript, SSJS, and GTL.
 */
import {
    createConnection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    DocumentDiagnosticReportKind,
    type DocumentDiagnosticReport,
    Hover,
    MarkupKind,
    InsertTextFormat,
    SignatureHelp,
    SignatureInformation,
    ParameterInformation,
    CodeAction,
    CodeActionKind,
    TextEdit,
    Location,
    DefinitionParams,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

import {
    ampscriptFunctions,
    ampscriptKeywords,
    personalizationStrings,
    functionLookup,
    AmpscriptFunction,
} from './ampscriptData';

import {
    platformFunctions,
    platformMethods,
    platformFunctionLookup,
    ssjsGlobals,
    platformVariableMethods,
    platformResponseMethods,
    platformRequestMethods,
    platformClientBrowserMethods,
    platformRecipientMethods,
    coreLibraryObjects,
    wsproxyMethods,
    httpMethods,
    scriptUtilConstructors,
    scriptUtilRequestMethods,
    ecmascriptBuiltins,
    EcmascriptBuiltin,
    SsjsFunction,
} from './ssjsData';

// ---------------------------------------------------------------------------
// Connection & Document Manager
// ---------------------------------------------------------------------------
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let _hasDiagnosticRelatedInformationCapability = false;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
connection.onInitialize((parameters: InitializeParams) => {
    const capabilities = parameters.capabilities;

    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    _hasDiagnosticRelatedInformationCapability = !!(
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation
    );

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
            diagnosticProvider: {
                interFileDependencies: false,
                workspaceDiagnostics: false,
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
        connection.workspace.onDidChangeWorkspaceFolders((_event) => {
            connection.console.log('Workspace folder change event received.');
        });
    }
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
interface AmpscriptSettings {
    maxNumberOfProblems: number;
}

const defaultSettings: AmpscriptSettings = { maxNumberOfProblems: 100 };
let globalSettings: AmpscriptSettings = defaultSettings;
const documentSettings = new Map<string, Thenable<AmpscriptSettings>>();

connection.onDidChangeConfiguration((change) => {
    if (hasConfigurationCapability) {
        documentSettings.clear();
    } else {
        globalSettings = change.settings.sfmcLanguageServer || defaultSettings;
    }
    connection.languages.diagnostics.refresh();
});

function getDocumentSettings(resource: string): Thenable<AmpscriptSettings> {
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
            .then((cfg: AmpscriptSettings | null) => cfg ?? defaultSettings);
        documentSettings.set(resource, result);
    }
    return result;
}

documents.onDidClose((e) => {
    documentSettings.delete(e.document.uri);
});

// ---------------------------------------------------------------------------
// Language Detection
// ---------------------------------------------------------------------------
function getDocumentLanguage(uri: string): 'ampscript' | 'ssjs' {
    const lower = uri.toLowerCase();
    if (lower.endsWith('.ssjs')) return 'ssjs';
    return 'ampscript';
}

// ---------------------------------------------------------------------------
// SSJS Completion Items (built once at startup)
// ---------------------------------------------------------------------------
const ssjsCompletionItems: CompletionItem[] = [];

for (const function_ of ssjsGlobals) {
    ssjsCompletionItems.push({
        label: function_.name,
        kind: CompletionItemKind.Function,
        detail: `(global) ${function_.name}`,
        documentation: { kind: MarkupKind.Markdown, value: buildSsjsFunctionMarkdown(function_) },
        insertText: buildSsjsFunctionSnippet(function_),
        insertTextFormat: InsertTextFormat.Snippet,
        data: { type: 'ssjs-global', name: function_.name },
    });
}

for (const function_ of platformFunctions) {
    const doc = { kind: MarkupKind.Markdown, value: buildSsjsFunctionMarkdown(function_) };
    ssjsCompletionItems.push({
        label: `Platform.Function.${function_.name}`,
        kind: CompletionItemKind.Method,
        detail: `Platform.Function.${function_.name}`,
        documentation: doc,
        insertText: buildSsjsFunctionSnippet(function_),
        insertTextFormat: InsertTextFormat.Snippet,
        filterText: `Platform.Function.${function_.name} ${function_.name}`,
        data: { type: 'ssjs-platform-function', name: function_.name },
    });
    ssjsCompletionItems.push({
        label: `Function.${function_.name}`,
        kind: CompletionItemKind.Method,
        detail: `(shorthand) Platform.Function.${function_.name}`,
        documentation: doc,
        insertText: buildSsjsFunctionSnippet({ ...function_, prefix: 'Function' }),
        insertTextFormat: InsertTextFormat.Snippet,
        filterText: `Function.${function_.name} ${function_.name}`,
        data: { type: 'ssjs-platform-function', name: function_.name },
    });
    ssjsCompletionItems.push({
        label: `Platform.DateTime.${function_.name}`,
        kind: CompletionItemKind.Method,
        detail: `Platform.DateTime.${function_.name}`,
        documentation: doc,
        insertText: buildSsjsFunctionSnippet(function_),
        insertTextFormat: InsertTextFormat.Snippet,
        filterText: `Platform.DateTime.${function_.name} ${function_.name}`,
        data: { type: 'ssjs-platform-function', name: function_.name },
    });
    ssjsCompletionItems.push({
        label: `DateTime.${function_.name}`,
        kind: CompletionItemKind.Method,
        detail: `(shorthand) Platform.DateTime.${function_.name}`,
        documentation: doc,
        insertText: buildSsjsFunctionSnippet({ ...function_, prefix: 'DateTime' }),
        insertTextFormat: InsertTextFormat.Snippet,
        filterText: `DateTime.${function_.name} ${function_.name}`,
        data: { type: 'ssjs-platform-function', name: function_.name },
    });
}

for (const function_ of platformVariableMethods) {
    const doc = { kind: MarkupKind.Markdown, value: buildSsjsFunctionMarkdown(function_) };
    ssjsCompletionItems.push({
        label: `Platform.Variable.${function_.name}`,
        kind: CompletionItemKind.Method,
        detail: `Platform.Variable.${function_.name}`,
        documentation: doc,
        insertText: buildSsjsFunctionSnippet(function_),
        insertTextFormat: InsertTextFormat.Snippet,
        filterText: `Platform.Variable.${function_.name} ${function_.name}`,
        data: { type: 'ssjs-platform-variable', name: function_.name },
    });
    ssjsCompletionItems.push({
        label: `Variable.${function_.name}`,
        kind: CompletionItemKind.Method,
        detail: `(shorthand) Platform.Variable.${function_.name}`,
        documentation: doc,
        insertText: buildSsjsFunctionSnippet({ ...function_, prefix: 'Variable' }),
        insertTextFormat: InsertTextFormat.Snippet,
        filterText: `Variable.${function_.name} ${function_.name}`,
        data: { type: 'ssjs-platform-variable', name: function_.name },
    });
}

for (const function_ of platformResponseMethods) {
    const doc = { kind: MarkupKind.Markdown, value: buildSsjsFunctionMarkdown(function_) };
    ssjsCompletionItems.push({
        label: `Platform.Response.${function_.name}`,
        kind: CompletionItemKind.Method,
        detail: `Platform.Response.${function_.name}`,
        documentation: doc,
        insertText: buildSsjsFunctionSnippet(function_),
        insertTextFormat: InsertTextFormat.Snippet,
        filterText: `Platform.Response.${function_.name} ${function_.name}`,
        data: { type: 'ssjs-platform-response', name: function_.name },
    });
    ssjsCompletionItems.push({
        label: `Response.${function_.name}`,
        kind: CompletionItemKind.Method,
        detail: `(shorthand) Platform.Response.${function_.name}`,
        documentation: doc,
        insertText: buildSsjsFunctionSnippet({ ...function_, prefix: 'Response' }),
        insertTextFormat: InsertTextFormat.Snippet,
        filterText: `Response.${function_.name} ${function_.name}`,
        data: { type: 'ssjs-platform-response', name: function_.name },
    });
}

for (const function_ of platformRequestMethods) {
    const doc = { kind: MarkupKind.Markdown, value: buildSsjsFunctionMarkdown(function_) };
    ssjsCompletionItems.push({
        label: `Platform.Request.${function_.name}`,
        kind: CompletionItemKind.Method,
        detail: `Platform.Request.${function_.name}`,
        documentation: doc,
        insertText: buildSsjsFunctionSnippet(function_),
        insertTextFormat: InsertTextFormat.Snippet,
        filterText: `Platform.Request.${function_.name} ${function_.name}`,
        data: { type: 'ssjs-platform-request', name: function_.name },
    });
    ssjsCompletionItems.push({
        label: `Request.${function_.name}`,
        kind: CompletionItemKind.Method,
        detail: `(shorthand) Platform.Request.${function_.name}`,
        documentation: doc,
        insertText: buildSsjsFunctionSnippet({ ...function_, prefix: 'Request' }),
        insertTextFormat: InsertTextFormat.Snippet,
        filterText: `Request.${function_.name} ${function_.name}`,
        data: { type: 'ssjs-platform-request', name: function_.name },
    });
}

for (const object of coreLibraryObjects) {
    ssjsCompletionItems.push({
        label: object.name,
        kind: CompletionItemKind.Class,
        detail: `(Core library) ${object.name}`,
        documentation: {
            kind: MarkupKind.Markdown,
            value: `${object.description}\n\n**Methods:** ${object.methods.join(', ')}\n\n*Requires* \`Platform.Load("core", "1.1.5")\``,
        },
        data: { type: 'ssjs-core-object', name: object.name },
    });
}

for (const function_ of wsproxyMethods) {
    ssjsCompletionItems.push({
        label: `WSProxy.${function_.name}`,
        kind: CompletionItemKind.Method,
        detail: `WSProxy.${function_.name}`,
        documentation: { kind: MarkupKind.Markdown, value: buildSsjsFunctionMarkdown(function_) },
        insertText: buildSsjsFunctionSnippet(function_),
        insertTextFormat: InsertTextFormat.Snippet,
        data: { type: 'ssjs-wsproxy', name: function_.name },
    });
}

for (const function_ of httpMethods) {
    ssjsCompletionItems.push({
        label: `HTTP.${function_.name}`,
        kind: CompletionItemKind.Method,
        detail: `HTTP.${function_.name}`,
        documentation: { kind: MarkupKind.Markdown, value: buildSsjsFunctionMarkdown(function_) },
        insertText: buildSsjsFunctionSnippet(function_),
        insertTextFormat: InsertTextFormat.Snippet,
        data: { type: 'ssjs-http', name: function_.name },
    });
}

for (const function_ of platformClientBrowserMethods) {
    const doc = { kind: MarkupKind.Markdown, value: buildSsjsFunctionMarkdown(function_) };
    ssjsCompletionItems.push({
        label: `Platform.ClientBrowser.${function_.name}`,
        kind: CompletionItemKind.Method,
        detail: `Platform.ClientBrowser.${function_.name}`,
        documentation: doc,
        insertText: buildSsjsFunctionSnippet(function_),
        insertTextFormat: InsertTextFormat.Snippet,
        filterText: `Platform.ClientBrowser.${function_.name} ${function_.name}`,
        data: { type: 'ssjs-platform-client-browser', name: function_.name },
    });
    ssjsCompletionItems.push({
        label: `ClientBrowser.${function_.name}`,
        kind: CompletionItemKind.Method,
        detail: `(shorthand) Platform.ClientBrowser.${function_.name}`,
        documentation: doc,
        insertText: buildSsjsFunctionSnippet({ ...function_, prefix: 'ClientBrowser' }),
        insertTextFormat: InsertTextFormat.Snippet,
        filterText: `ClientBrowser.${function_.name} ${function_.name}`,
        data: { type: 'ssjs-platform-client-browser', name: function_.name },
    });
}

for (const function_ of platformRecipientMethods) {
    const doc = { kind: MarkupKind.Markdown, value: buildSsjsFunctionMarkdown(function_) };
    ssjsCompletionItems.push({
        label: `Platform.Recipient.${function_.name}`,
        kind: CompletionItemKind.Method,
        detail: `Platform.Recipient.${function_.name}`,
        documentation: doc,
        insertText: buildSsjsFunctionSnippet(function_),
        insertTextFormat: InsertTextFormat.Snippet,
        filterText: `Platform.Recipient.${function_.name} ${function_.name}`,
        data: { type: 'ssjs-platform-recipient', name: function_.name },
    });
    ssjsCompletionItems.push({
        label: `Recipient.${function_.name}`,
        kind: CompletionItemKind.Method,
        detail: `(shorthand) Platform.Recipient.${function_.name}`,
        documentation: doc,
        insertText: buildSsjsFunctionSnippet({ ...function_, prefix: 'Recipient' }),
        insertTextFormat: InsertTextFormat.Snippet,
        filterText: `Recipient.${function_.name} ${function_.name}`,
        data: { type: 'ssjs-platform-recipient', name: function_.name },
    });
}

for (const function_ of platformMethods) {
    ssjsCompletionItems.push({
        label: `Platform.${function_.name}`,
        kind: CompletionItemKind.Function,
        detail: `Platform.${function_.name}`,
        documentation: { kind: MarkupKind.Markdown, value: buildSsjsFunctionMarkdown(function_) },
        insertText: buildSsjsFunctionSnippet(function_),
        insertTextFormat: InsertTextFormat.Snippet,
        filterText: `Platform.${function_.name} ${function_.name}`,
        data: { type: 'ssjs-platform', name: function_.name },
    });
}

ssjsCompletionItems.push({
    label: 'WSProxy',
    kind: CompletionItemKind.Class,
    detail: '(SOAP API wrapper)',
    documentation: {
        kind: MarkupKind.Markdown,
        value: 'Lightweight wrapper for the Marketing Cloud SOAP API. Faster than AMPscript API functions for bulk operations.\n\n**Example:** `var prox = new WSProxy();`',
    },
    data: { type: 'ssjs-wsproxy-class' },
});

for (const constructor of scriptUtilConstructors) {
    ssjsCompletionItems.push({
        label: `Script.Util.${constructor.name}`,
        kind: CompletionItemKind.Constructor,
        detail: `new Script.Util.${constructor.name}`,
        documentation: { kind: MarkupKind.Markdown, value: buildSsjsFunctionMarkdown(constructor) },
        insertText: buildSsjsFunctionSnippet(constructor),
        insertTextFormat: InsertTextFormat.Snippet,
        filterText: `Script.Util.${constructor.name} ${constructor.name}`,
        data: { type: 'ssjs-script-util-constructor', name: constructor.name },
    });
}

for (const method of scriptUtilRequestMethods) {
    ssjsCompletionItems.push({
        label: `req.${method.name}`,
        kind: CompletionItemKind.Method,
        detail: `req.${method.name}`,
        documentation: { kind: MarkupKind.Markdown, value: buildSsjsFunctionMarkdown(method) },
        insertText: buildSsjsFunctionSnippet(method),
        insertTextFormat: InsertTextFormat.Snippet,
        filterText: `req.${method.name} ${method.name}`,
        data: { type: 'ssjs-script-util-request', name: method.name },
    });
}

for (const builtin of ecmascriptBuiltins) {
    const label = `${builtin.owner.replace('.prototype', '')}.${builtin.name}`;
    ssjsCompletionItems.push({
        label,
        kind: CompletionItemKind.Method,
        detail: builtin.syntax ?? label,
        documentation: { kind: MarkupKind.Markdown, value: buildEcmascriptBuiltinMarkdown(builtin) },
        filterText: `${label} ${builtin.name}`,
        data: { type: 'ssjs-ecma-builtin', owner: builtin.owner, name: builtin.name },
    });
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

// Diagnostic codes used to identify specific issues in code actions.
const DIAG_CODE_HTML_WRAPPED_COMMENT = 'ampscript/html-wrapped-comment';
const DIAG_CODE_HTML_COMMENT = 'ampscript/html-comment';
const DIAG_CODE_JS_LINE_COMMENT = 'ampscript/js-line-comment';
const DIAG_CODE_NESTED_SCRIPT_TAG = 'ampscript/nested-script-tag';
const DIAG_CODE_NESTED_DELIMITER_IN_SCRIPT = 'ampscript/nested-delimiter-in-script';
const DIAG_CODE_NESTED_DELIMITER = 'ampscript/nested-delimiter';

connection.languages.diagnostics.on(async (parameters) => {
    const document = documents.get(parameters.textDocument.uri);
    if (document === undefined) {
        return {
            kind: DocumentDiagnosticReportKind.Full,
            items: [],
        } satisfies DocumentDiagnosticReport;
    } else {
        const lang = getDocumentLanguage(document.uri);
        if (lang === 'ssjs') {
            return {
                kind: DocumentDiagnosticReportKind.Full,
                items: await validateSsjsDocument(document),
            } satisfies DocumentDiagnosticReport;
        }
        return {
            kind: DocumentDiagnosticReportKind.Full,
            items: await validateAmpscriptDocument(document),
        } satisfies DocumentDiagnosticReport;
    }
});

documents.onDidChangeContent(() => {
    connection.languages.diagnostics.refresh();
});

// Code Actions (Quick Fixes)
// ---------------------------------------------------------------------------
connection.onCodeAction((parameters) => {
    const document = documents.get(parameters.textDocument.uri);
    if (!document) return [];

    const actions: CodeAction[] = [];

    for (const diagnostic of parameters.context.diagnostics) {
        if (diagnostic.source !== 'ampscript') continue;

        const range = diagnostic.range;
        const originalText = document.getText(range);

        switch (diagnostic.code) {
            case DIAG_CODE_HTML_WRAPPED_COMMENT: {
                // <!--/* ... */--> → /* ... */
                const inner = typeof diagnostic.data === 'string'
                    ? diagnostic.data
                    : originalText.replace(/^<!--/, '').replace(/-->$/, '').trim();
                actions.push({
                    title: 'Remove HTML comment wrapper',
                    kind: CodeActionKind.QuickFix,
                    isPreferred: true,
                    diagnostics: [diagnostic],
                    edit: {
                        changes: {
                            [parameters.textDocument.uri]: [
                                TextEdit.replace(range, inner),
                            ],
                        },
                    },
                });
                break;
            }
            case DIAG_CODE_HTML_COMMENT: {
                // <!-- ... --> → /* ... */
                const inner = originalText.replace(/^<!--/, '').replace(/-->$/, '').trim();
                actions.push({
                    title: 'Convert to AMPscript block comment',
                    kind: CodeActionKind.QuickFix,
                    isPreferred: true,
                    diagnostics: [diagnostic],
                    edit: {
                        changes: {
                            [parameters.textDocument.uri]: [
                                TextEdit.replace(range, `/* ${inner} */`),
                            ],
                        },
                    },
                });
                break;
            }
            case DIAG_CODE_JS_LINE_COMMENT: {
                // // comment text → /* comment text */
                const commentText = typeof diagnostic.data === 'string'
                    ? diagnostic.data
                    : originalText.replace(/^\/\/\s*/, '').trim();
                actions.push({
                    title: 'Convert to AMPscript block comment',
                    kind: CodeActionKind.QuickFix,
                    isPreferred: true,
                    diagnostics: [diagnostic],
                    edit: {
                        changes: {
                            [parameters.textDocument.uri]: [
                                TextEdit.replace(range, `/* ${commentText} */`),
                            ],
                        },
                    },
                });
                break;
            }
            case DIAG_CODE_NESTED_SCRIPT_TAG: {
                // Insert </script>\n before the nested opening tag
                actions.push({
                    title: 'Insert missing </script> closing tag before this block',
                    kind: CodeActionKind.QuickFix,
                    isPreferred: true,
                    diagnostics: [diagnostic],
                    edit: {
                        changes: {
                            [parameters.textDocument.uri]: [
                                TextEdit.insert(range.start, '</script>\n'),
                            ],
                        },
                    },
                });
                break;
            }
            case DIAG_CODE_NESTED_DELIMITER_IN_SCRIPT:
            case DIAG_CODE_NESTED_DELIMITER: {
                const delimiter = typeof diagnostic.data === 'string' ? diagnostic.data : originalText;
                const isBlock = delimiter === '%%[';
                const closeToken = isBlock ? ']%%' : '=%%';
                const closeLen = closeToken.length;

                // Offer to remove just the opening delimiter
                actions.push({
                    title: `Remove redundant ${delimiter} delimiter`,
                    kind: CodeActionKind.QuickFix,
                    isPreferred: false,
                    diagnostics: [diagnostic],
                    edit: {
                        changes: {
                            [parameters.textDocument.uri]: [
                                TextEdit.del(range),
                            ],
                        },
                    },
                });

                // Also offer to remove both the opening delimiter and its matching close
                const docText = document.getText();
                const delimStart = document.offsetAt(range.start);
                const closeIndex = docText.indexOf(closeToken, delimStart + delimiter.length);
                if (closeIndex !== -1) {
                    actions.push({
                        title: `Remove ${delimiter}...${closeToken} delimiter pair`,
                        kind: CodeActionKind.QuickFix,
                        isPreferred: true,
                        diagnostics: [diagnostic],
                        edit: {
                            changes: {
                                [parameters.textDocument.uri]: [
                                    TextEdit.del({
                                        start: document.positionAt(closeIndex),
                                        end: document.positionAt(closeIndex + closeLen),
                                    }),
                                    TextEdit.del(range),
                                ],
                            },
                        },
                    });
                }
                break;
            }
        }
    }

    return actions;
});

async function validateAmpscriptDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
    const settings = await getDocumentSettings(textDocument.uri);
    const text = textDocument.getText();
    const sanitizedAmpscriptText = getSanitizedAmpscriptText(text);
    const diagnostics: Diagnostic[] = [];
    let problems = 0;

    // 1. Check for unmatched AMPscript block delimiters %%[ ... ]%%
    const blockOpens = findAllOccurrences(text, '%%[');
    const blockCloses = findAllOccurrences(text, ']%%');
    if (blockOpens.length > blockCloses.length) {
        for (
            let index = blockCloses.length;
            index < blockOpens.length && problems < settings.maxNumberOfProblems;
            index++
        ) {
            problems++;
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: textDocument.positionAt(blockOpens[index]),
                    end: textDocument.positionAt(blockOpens[index] + 3),
                },
                message: 'Unclosed AMPscript block. Expected a matching ]%%.',
                source: 'ampscript',
            });
        }
    } else if (blockCloses.length > blockOpens.length) {
        for (
            let index = blockOpens.length;
            index < blockCloses.length && problems < settings.maxNumberOfProblems;
            index++
        ) {
            problems++;
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: textDocument.positionAt(blockCloses[index]),
                    end: textDocument.positionAt(blockCloses[index] + 3),
                },
                message: 'Unexpected ]%% without a matching %%[ opener.',
                source: 'ampscript',
            });
        }
    }

    // 2. Check for unmatched inline output delimiters %%= ... =%%
    const inlineOpens = findAllOccurrences(text, '%%=');
    const inlineCloses = findAllOccurrences(text, '=%%');
    if (inlineOpens.length > inlineCloses.length) {
        for (
            let index = inlineCloses.length;
            index < inlineOpens.length && problems < settings.maxNumberOfProblems;
            index++
        ) {
            problems++;
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: textDocument.positionAt(inlineOpens[index]),
                    end: textDocument.positionAt(inlineOpens[index] + 3),
                },
                message: 'Unclosed inline AMPscript expression. Expected a matching =%%.',
                source: 'ampscript',
            });
        }
    } else if (inlineCloses.length > inlineOpens.length) {
        for (
            let index = inlineOpens.length;
            index < inlineCloses.length && problems < settings.maxNumberOfProblems;
            index++
        ) {
            problems++;
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: textDocument.positionAt(inlineCloses[index]),
                    end: textDocument.positionAt(inlineCloses[index] + 3),
                },
                message: 'Unexpected =%% without a matching %%= opener.',
                source: 'ampscript',
            });
        }
    }

    // 3. Check for unmatched IF/ENDIF and FOR/NEXT using stack-based nesting
    const lines = sanitizedAmpscriptText.split('\n');
    const ifStack: number[] = [];
    const forStack: number[] = [];

    for (const [lineIndex, line] of lines.entries()) {
        const lineLower = line.toLowerCase();

        const ifMatches = lineLower.matchAll(/\bif\b/g);
        for (const _ of ifMatches) {
            ifStack.push(lineIndex);
        }
        const endifMatches = lineLower.matchAll(/\bendif\b/g);
        for (const _ of endifMatches) {
            if (ifStack.length > 0) {
                ifStack.pop();
            } else if (problems < settings.maxNumberOfProblems) {
                problems++;
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: lineIndex, character: 0 },
                        end: { line: lineIndex, character: line.length },
                    },
                    message: 'ENDIF without a matching IF.',
                    source: 'ampscript',
                });
            }
        }

        const forMatches = lineLower.matchAll(/\bfor\b/g);
        for (const _ of forMatches) {
            forStack.push(lineIndex);
        }
        const nextMatches = lineLower.matchAll(/\bnext\b/g);
        for (const _ of nextMatches) {
            if (forStack.length > 0) {
                forStack.pop();
            } else if (problems < settings.maxNumberOfProblems) {
                problems++;
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: lineIndex, character: 0 },
                        end: { line: lineIndex, character: line.length },
                    },
                    message: 'NEXT without a matching FOR.',
                    source: 'ampscript',
                });
            }
        }
    }

    for (const lineIndex of ifStack) {
        if (problems < settings.maxNumberOfProblems) {
            problems++;
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: { line: lineIndex, character: 0 },
                    end: { line: lineIndex, character: lines[lineIndex].length },
                },
                message: 'IF without a matching ENDIF.',
                source: 'ampscript',
            });
        }
    }

    for (const lineIndex of forStack) {
        if (problems < settings.maxNumberOfProblems) {
            problems++;
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: { line: lineIndex, character: 0 },
                    end: { line: lineIndex, character: lines[lineIndex].length },
                },
                message: 'FOR without a matching NEXT.',
                source: 'ampscript',
            });
        }
    }

    // 4. Unknown functions + function arity validation
    const functionCallPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
    let functionMatch: RegExpExecArray | null;
    while (
        (functionMatch = functionCallPattern.exec(sanitizedAmpscriptText)) &&
        problems < settings.maxNumberOfProblems
    ) {
        const functionName = functionMatch[1];
        const normalizedFunctionName = functionName.toLowerCase();

        if (!isKnownAmpscriptConstruct(normalizedFunctionName)) {
            problems++;
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: textDocument.positionAt(functionMatch.index),
                    end: textDocument.positionAt(functionMatch.index + functionName.length),
                },
                message: `Unknown AMPscript function '${functionName}'. AMPscript does not support custom functions.`,
                source: 'ampscript',
            });
            continue;
        }

        const arity = functionArityLookup.get(normalizedFunctionName);
        if (arity) {
            const openParenPos = functionMatch.index + functionMatch[0].length - 1;
            const argumentCount = countFunctionArguments(sanitizedAmpscriptText, openParenPos);
            if (argumentCount >= 0) {
                if (argumentCount < arity.minArgs) {
                    problems++;
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range: {
                            start: textDocument.positionAt(functionMatch.index),
                            end: textDocument.positionAt(functionMatch.index + functionName.length),
                        },
                        message: `'${functionName}' requires at least ${arity.minArgs} argument(s) but was called with ${argumentCount}.`,
                        source: 'ampscript',
                    });
                } else if (argumentCount > arity.maxArgs) {
                    problems++;
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range: {
                            start: textDocument.positionAt(functionMatch.index),
                            end: textDocument.positionAt(functionMatch.index + functionName.length),
                        },
                        message: `'${functionName}' accepts at most ${arity.maxArgs} argument(s) but was called with ${argumentCount}.`,
                        source: 'ampscript',
                    });
                } else if (problems < settings.maxNumberOfProblems) {
                    // Type-check literal arguments against expected param types
                    const functionDef = functionLookup.get(normalizedFunctionName);
                    if (functionDef?.params && functionDef.params.length > 0) {
                        const argSpans = extractFunctionArguments(sanitizedAmpscriptText, openParenPos);
                        if (argSpans) {
                            for (let argIndex = 0; argIndex < argSpans.length && problems < settings.maxNumberOfProblems; argIndex++) {
                                const param = functionDef.params[argIndex];
                                if (!param?.type) continue;
                                const inferredType = inferLiteralType(argSpans[argIndex].value);
                                if (inferredType && inferredType !== param.type) {
                                    problems++;
                                    diagnostics.push({
                                        severity: DiagnosticSeverity.Warning,
                                        range: {
                                            start: textDocument.positionAt(argSpans[argIndex].start),
                                            end: textDocument.positionAt(argSpans[argIndex].end),
                                        },
                                        message: `Argument '${param.name}' of '${functionName}' expects a ${param.type} but received a ${inferredType}.`,
                                        source: 'ampscript',
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 5. Check for `set` without a target variable (e.g. `set = expr`)
    const setWithoutTargetPattern = /\bset\s*=/gi;
    let setMatch: RegExpExecArray | null;
    while (
        (setMatch = setWithoutTargetPattern.exec(sanitizedAmpscriptText)) &&
        problems < settings.maxNumberOfProblems
    ) {
        problems++;
        diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
                start: textDocument.positionAt(setMatch.index),
                end: textDocument.positionAt(setMatch.index + setMatch[0].length),
            },
            message:
                '`set` statement is missing a target variable. Expected: `set @variable = expression`.',
            source: 'ampscript',
        });
    }

    // 6. Detect smart/curly quotes inside AMPscript regions (runtime error)
    const smartQuotePattern = /[\u2018\u2019\u201C\u201D\u201A\u201E\u2039\u203A]/g;
    let sqMatch: RegExpExecArray | null;
    while (
        (sqMatch = smartQuotePattern.exec(text)) !== null &&
        problems < settings.maxNumberOfProblems
    ) {
        if (isInsideAmpscript(text, sqMatch.index)) {
            problems++;
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: textDocument.positionAt(sqMatch.index),
                    end: textDocument.positionAt(sqMatch.index + 1),
                },
                message:
                    'Smart/curly quote character detected. AMPscript only supports straight ASCII quotes (\' or ").',
                source: 'ampscript',
            });
        }
    }

    // 7. Best-practice: warn about bare subscriber attribute access without AttributeValue() for null safety
    const directAttributeAccess = /\bset\s+@\w+\s*=\s*(\w+)\b/gi;
    let attributeMatch: RegExpExecArray | null;
    const commonAttributes = new Set([
        'firstname',
        'lastname',
        'emailaddress',
        'email_address',
        'fullname',
    ]);
    while (
        (attributeMatch = directAttributeAccess.exec(sanitizedAmpscriptText)) &&
        problems < settings.maxNumberOfProblems
    ) {
        const attributeName = attributeMatch[1].toLowerCase();
        if (commonAttributes.has(attributeName)) {
            problems++;
            diagnostics.push({
                severity: DiagnosticSeverity.Information,
                range: {
                    start: textDocument.positionAt(attributeMatch.index),
                    end: textDocument.positionAt(attributeMatch.index + attributeMatch[0].length),
                },
                message: `Consider using AttributeValue("${attributeMatch[1]}") instead of the bare attribute name for null safety.`,
                source: 'ampscript',
            });
        }
    }

    // 8. HTML comments inside AMPscript regions (e.g. <!--/* comment */-->)
    const htmlCommentPattern = /<!--[\s\S]*?-->/g;
    let htmlCommentMatch: RegExpExecArray | null;
    while (
        (htmlCommentMatch = htmlCommentPattern.exec(sanitizedAmpscriptText)) !== null &&
        problems < settings.maxNumberOfProblems
    ) {
        problems++;
        const fullMatch = htmlCommentMatch[0];
        // Check if it wraps a valid AMPscript block comment: <!--/* ... */-->
        const isWrappedBlockComment = /^<!--\/\*[\s\S]*?\*\/-->$/.test(fullMatch);
        const innerContent = isWrappedBlockComment
            ? fullMatch.slice(4, -3).trim() // strip <!-- and -->
            : undefined;
        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
                start: textDocument.positionAt(htmlCommentMatch.index),
                end: textDocument.positionAt(htmlCommentMatch.index + fullMatch.length),
            },
            message: isWrappedBlockComment
                ? 'HTML comment wrapper around an AMPscript comment is not valid. Use /* ... */ directly.'
                : 'HTML comment syntax is not valid inside AMPscript. Use /* ... */ instead.',
            source: 'ampscript',
            code: isWrappedBlockComment ? DIAG_CODE_HTML_WRAPPED_COMMENT : DIAG_CODE_HTML_COMMENT,
            data: isWrappedBlockComment ? innerContent : undefined,
        });
    }

    // 9. JavaScript // line comments inside AMPscript regions
    const jsLineCommentPattern = /(?<!:)\/\/.*/g;
    let jsCommentMatch: RegExpExecArray | null;
    while (
        (jsCommentMatch = jsLineCommentPattern.exec(sanitizedAmpscriptText)) !== null &&
        problems < settings.maxNumberOfProblems
    ) {
        problems++;
        const commentText = jsCommentMatch[0].slice(2).trim();
        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
                start: textDocument.positionAt(jsCommentMatch.index),
                end: textDocument.positionAt(jsCommentMatch.index + jsCommentMatch[0].length),
            },
            message: 'Single-line // comments are not valid AMPscript syntax. Use /* ... */ instead.',
            source: 'ampscript',
            code: DIAG_CODE_JS_LINE_COMMENT,
            data: commentText,
        });
    }

    // 10. Nested <script language="ampscript"> inside an already-open script block
    const scriptOpenPattern =
        /<script\s[^>]*language\s*=\s*["']ampscript["'][^>]*>/gi;
    const scriptClosePattern = /<\/script>/gi;
    const scriptOpens: number[] = [];
    const scriptCloses: number[] = [];
    {
        let sm: RegExpExecArray | null;
        while ((sm = scriptOpenPattern.exec(text)) !== null) {
            scriptOpens.push(sm.index);
        }
        while ((sm = scriptClosePattern.exec(text)) !== null) {
            scriptCloses.push(sm.index);
        }
    }
    // Match each open to the next close; look for another open in between
    for (let si = 0; si < scriptOpens.length && problems < settings.maxNumberOfProblems; si++) {
        const openStart = scriptOpens[si];
        const openTagEnd = text.indexOf('>', openStart) + 1;
        // Find the paired close: first close after this open's tag end
        const pairedClose = scriptCloses.find((c) => c > openTagEnd);
        const searchEnd = pairedClose === undefined ? text.length : pairedClose;
        // Look for another script open between openTagEnd and searchEnd
        const innerOpenPattern =
            /<script\s[^>]*language\s*=\s*["']ampscript["'][^>]*>/gi;
        innerOpenPattern.lastIndex = openTagEnd;
        let innerMatch: RegExpExecArray | null;
        while (
            (innerMatch = innerOpenPattern.exec(text)) !== null &&
            innerMatch.index < searchEnd &&
            problems < settings.maxNumberOfProblems
        ) {
            problems++;
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: textDocument.positionAt(innerMatch.index),
                    end: textDocument.positionAt(innerMatch.index + innerMatch[0].length),
                },
                message:
                    'Nested <script language="ampscript"> inside an already-open AMPscript block. Did you forget a </script> closing tag?',
                source: 'ampscript',
                code: DIAG_CODE_NESTED_SCRIPT_TAG,
            });
        }
    }

    // 11. %%[ or %%= delimiters inside an already-open AMPscript region
    const delimiterPattern = /%%\[|%%=/g;
    // Check inside each script tag body
    {
        const scriptBodyPattern =
            /<script\s[^>]*language\s*=\s*["']ampscript["'][^>]*>([\s\S]*?)<\/script>/gi;
        let sbMatch: RegExpExecArray | null;
        while (
            (sbMatch = scriptBodyPattern.exec(text)) !== null &&
            problems < settings.maxNumberOfProblems
        ) {
            const bodyStart = sbMatch.index + sbMatch[0].indexOf('>') + 1;
            const bodyEnd = bodyStart + sbMatch[1].length;
            const body = text.slice(bodyStart, bodyEnd);
            delimiterPattern.lastIndex = 0;
            let dm: RegExpExecArray | null;
            while (
                (dm = delimiterPattern.exec(body)) !== null &&
                problems < settings.maxNumberOfProblems
            ) {
                problems++;
                const delimStart = bodyStart + dm.index;
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: textDocument.positionAt(delimStart),
                        end: textDocument.positionAt(delimStart + dm[0].length),
                    },
                    message: `AMPscript delimiter ${dm[0]} is not needed inside a <script language="ampscript"> block.`,
                    source: 'ampscript',
                    code: DIAG_CODE_NESTED_DELIMITER_IN_SCRIPT,
                    data: dm[0],
                });
            }
        }
    }
    // Check for %%[ nested inside %%[ ... ]%% blocks
    {
        const blockPattern = /%%\[([\s\S]*?)\]%%/g;
        let bMatch: RegExpExecArray | null;
        while (
            (bMatch = blockPattern.exec(text)) !== null &&
            problems < settings.maxNumberOfProblems
        ) {
            const innerStart = bMatch.index + 3;
            const inner = bMatch[1];
            delimiterPattern.lastIndex = 0;
            let dm: RegExpExecArray | null;
            while (
                (dm = delimiterPattern.exec(inner)) !== null &&
                problems < settings.maxNumberOfProblems
            ) {
                problems++;
                const delimStart = innerStart + dm.index;
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: textDocument.positionAt(delimStart),
                        end: textDocument.positionAt(delimStart + dm[0].length),
                    },
                    message: `Nested ${dm[0]} inside an already-open AMPscript block.`,
                    source: 'ampscript',
                    code: DIAG_CODE_NESTED_DELIMITER,
                    data: dm[0],
                });
            }
        }
    }
    // Check for %%= nested inside %%= ... =%%  inline blocks
    {
        const inlinePattern = /%%=([\s\S]*?)=%%/g;
        let iMatch: RegExpExecArray | null;
        while (
            (iMatch = inlinePattern.exec(text)) !== null &&
            problems < settings.maxNumberOfProblems
        ) {
            const innerStart = iMatch.index + 3;
            const inner = iMatch[1];
            delimiterPattern.lastIndex = 0;
            let dm: RegExpExecArray | null;
            while (
                (dm = delimiterPattern.exec(inner)) !== null &&
                problems < settings.maxNumberOfProblems
            ) {
                problems++;
                const delimStart = innerStart + dm.index;
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: textDocument.positionAt(delimStart),
                        end: textDocument.positionAt(delimStart + dm[0].length),
                    },
                    message: `Nested ${dm[0]} inside an already-open AMPscript inline expression.`,
                    source: 'ampscript',
                    code: DIAG_CODE_NESTED_DELIMITER,
                    data: dm[0],
                });
            }
        }
    }

    // 12. GTL block-balance diagnostics
    validateGtlBlocks(text, textDocument, diagnostics, settings.maxNumberOfProblems - problems);

    return diagnostics;
}

function validateGtlBlocks(
    text: string,
    textDocument: TextDocument,
    diagnostics: Diagnostic[],
    remainingBudget: number,
): void {
    let problems = 0;

    interface GtlFrame {
        tag: string;
        offset: number;
    }
    const stack: GtlFrame[] = [];

    const GTL_OPEN = /\{\{([#.])(each|if|switch|datasource)\b/g;
    const GTL_CLOSE = /\{\{\/(each|if|switch|\.datasource)\s*\}\}/g;

    const opens: { tag: string; offset: number }[] = [];
    const closes: { tag: string; offset: number }[] = [];

    let m: RegExpExecArray | null;
    while ((m = GTL_OPEN.exec(text)) !== null) {
        const prefix = m[1];
        const tag = prefix === '.' ? `.${m[2]}` : m[2];
        opens.push({ tag, offset: m.index });
    }
    while ((m = GTL_CLOSE.exec(text)) !== null) {
        closes.push({ tag: m[1], offset: m.index });
    }

    const events = [
        ...opens.map((o) => ({ ...o, kind: 'open' as const })),
        ...closes.map((c) => ({ ...c, kind: 'close' as const })),
    ].toSorted((a, b) => a.offset - b.offset);

    for (const event of events) {
        if (problems >= remainingBudget) break;

        if (event.kind === 'open') {
            stack.push({ tag: event.tag, offset: event.offset });
        } else {
            const normalizedClose = event.tag.startsWith('.') ? event.tag : event.tag;
            const matchIndex = findLastMatchingOpen(stack, normalizedClose);
            if (matchIndex === -1) {
                problems++;
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: textDocument.positionAt(event.offset),
                        end: textDocument.positionAt(event.offset + event.tag.length + 5),
                    },
                    message: `Closing {{/${event.tag}}} without a matching opening tag.`,
                    source: 'gtl',
                });
            } else {
                stack.splice(matchIndex, 1);
            }
        }
    }

    for (const frame of stack) {
        if (problems >= remainingBudget) break;
        problems++;
        const tagDisplay = frame.tag.startsWith('.') ? `{{${frame.tag}}}` : `{{#${frame.tag}}}`;
        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
                start: textDocument.positionAt(frame.offset),
                end: textDocument.positionAt(frame.offset + frame.tag.length + 3),
            },
            message: `Unclosed ${tagDisplay} block. Expected a matching closing tag.`,
            source: 'gtl',
        });
    }
}

function findLastMatchingOpen(stack: { tag: string; offset: number }[], closeTag: string): number {
    for (let index = stack.length - 1; index >= 0; index--) {
        const openTag = stack[index].tag;
        if (openTag === closeTag || (openTag === '.datasource' && closeTag === '.datasource')) {
            return index;
        }
    }
    return -1;
}

/**
 * Scans JS/SSJS source text and returns the [start, end) character ranges of
 * every comment (both line comments and block comments).
 * String literals (single- and double-quoted) are skipped so their content
 * is never misidentified as a comment opener.
 */
function buildCommentRanges(source: string): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    let i = 0;
    const len = source.length;

    while (i < len) {
        const ch = source[i];
        if (ch === '"' || ch === "'") {
            const quote = ch;
            i++;
            while (i < len) {
                if (source[i] === '\\') {
                    i += 2;
                } else if (source[i] === quote) {
                    i++;
                    break;
                } else {
                    i++;
                }
            }
        } else if (ch === '/' && i + 1 < len) {
            if (source[i + 1] === '/') {
                const start = i;
                while (i < len && source[i] !== '\n') {
                    i++;
                }
                ranges.push([start, i]);
            } else if (source[i + 1] === '*') {
                const start = i;
                i += 2;
                while (i < len) {
                    if (source[i] === '*' && i + 1 < len && source[i + 1] === '/') {
                        i += 2;
                        break;
                    }
                    i++;
                }
                ranges.push([start, i]);
            } else {
                i++;
            }
        } else {
            i++;
        }
    }

    return ranges;
}

/** Returns true if `index` falls within any of the given comment ranges. */
function isInCommentRange(index: number, ranges: Array<[number, number]>): boolean {
    for (const [start, end] of ranges) {
        if (start > index) break;
        if (index < end) return true;
    }
    return false;
}

async function validateSsjsDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
    const settings = await getDocumentSettings(textDocument.uri);
    const text = textDocument.getText();
    const diagnostics: Diagnostic[] = [];
    let problems = 0;

    const platformLoadPattern = /Platform\s*\.\s*Load\s*\(\s*["']core["']/i;
    const hasPlatformLoad = platformLoadPattern.test(text);

    const coreObjectPattern =
        /\b(DataExtension|Subscriber|Email|TriggeredSend|List|ContentArea|Folder|QueryDefinition|Send|Template|DeliveryProfile|SenderProfile|SendClassification|FilterDefinition|Account|AccountUser|Portfolio|BounceEvent|ClickEvent|ForwardedEmailEvent|ForwardedEmailOptInEvent|NotSentEvent|OpenEvent|SentEvent|SurveyEvent|UnsubEvent)\s*\.\s*(Init|Retrieve)\s*\(/g;
    let coreMatch: RegExpExecArray | null;
    while (
        (coreMatch = coreObjectPattern.exec(text)) !== null &&
        problems < settings.maxNumberOfProblems
    ) {
        if (!hasPlatformLoad) {
            problems++;
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: textDocument.positionAt(coreMatch.index),
                    end: textDocument.positionAt(coreMatch.index + coreMatch[0].length - 1),
                },
                message: `Platform.Load("core", "1.1.5") must be called before using ${coreMatch[1]}.Init(). Without it, this call will fail at runtime.`,
                source: 'ssjs',
            });
        }
    }

    const platformLoadVersionPattern =
        /Platform\s*\.\s*Load\s*\(\s*["']core["']\s*,\s*["']([^"']*)["']\s*\)/gi;
    let versionMatch: RegExpExecArray | null;
    while (
        (versionMatch = platformLoadVersionPattern.exec(text)) !== null &&
        problems < settings.maxNumberOfProblems
    ) {
        const actualVersion = versionMatch[1];
        if (actualVersion !== '1.1.5') {
            problems++;
            const versionStart = versionMatch.index + versionMatch[0].lastIndexOf(actualVersion);
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: textDocument.positionAt(versionStart - 1),
                    end: textDocument.positionAt(versionStart + actualVersion.length + 1),
                },
                message: `Platform.Load("Core", "${actualVersion}") should use version "1.1.5" to get the latest bug-fixes.`,
                source: 'ssjs',
            });
        }
    }

    const es6Patterns: { pattern: RegExp; message: string }[] = [
        {
            pattern: /\b(let|const)\s+/g,
            message:
                "'let'/'const' declarations are not supported in SFMC SSJS. Use 'var' instead.",
        },
        {
            pattern: /=>\s*[{(]/g,
            message:
                'Arrow functions are not supported in SFMC SSJS. Use a regular function expression.',
        },
        {
            pattern: /`[^`]*`/g,
            message: 'Template literals are not supported in SFMC SSJS. Use string concatenation.',
        },
        {
            pattern: /\bclass\s+\w+/g,
            message:
                'Class declarations are not supported in SFMC SSJS. Use constructor functions.',
        },
        {
            pattern: /\basync\s+function/g,
            message: 'Async functions are not supported in SFMC SSJS.',
        },
        { pattern: /\bawait\s+/g, message: 'Await expressions are not supported in SFMC SSJS.' },
    ];

    const commentRanges = buildCommentRanges(text);

    for (const { pattern, message } of es6Patterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null && problems < settings.maxNumberOfProblems) {
            if (isInCommentRange(match.index, commentRanges)) continue;
            problems++;
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: textDocument.positionAt(match.index),
                    end: textDocument.positionAt(match.index + match[0].length),
                },
                message,
                source: 'ssjs',
            });
        }
    }

    // Type-check literal arguments for known SSJS function calls
    const ssjsFunctionLookup = new Map<string, SsjsFunction>();
    for (const fn of [
        ...platformMethods,
        ...platformFunctions,
        ...ssjsGlobals,
        ...platformVariableMethods,
        ...platformResponseMethods,
        ...platformRequestMethods,
        ...platformClientBrowserMethods,
        ...platformRecipientMethods,
        ...wsproxyMethods,
        ...httpMethods,
    ]) {
        ssjsFunctionLookup.set(fn.name.toLowerCase(), fn);
    }

    // Match any call of the form: Word( or Word.Word( or Word.Word.Word(
    // We extract the final identifier (the method name) for the lookup.
    const ssjsCallPattern = /(?:\w+\.)*(\w+)\s*\(/g;
    let ssjsCallMatch: RegExpExecArray | null;
    while (
        (ssjsCallMatch = ssjsCallPattern.exec(text)) !== null &&
        problems < settings.maxNumberOfProblems
    ) {
        const methodName = ssjsCallMatch[1];
        const fn = ssjsFunctionLookup.get(methodName.toLowerCase());
        if (!fn?.params || fn.params.length === 0) continue;

        const openParenPos = ssjsCallMatch.index + ssjsCallMatch[0].length - 1;
        const argSpans = extractFunctionArguments(text, openParenPos);
        if (!argSpans) continue;

        for (
            let argIndex = 0;
            argIndex < argSpans.length && problems < settings.maxNumberOfProblems;
            argIndex++
        ) {
            const param = fn.params[argIndex];
            if (!param?.type) continue;
            const inferredType = inferLiteralType(argSpans[argIndex].value);
            if (inferredType && inferredType !== param.type) {
                problems++;
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: textDocument.positionAt(argSpans[argIndex].start),
                        end: textDocument.positionAt(argSpans[argIndex].end),
                    },
                    message: `Argument '${param.name}' of '${methodName}' expects a ${param.type} but received a ${inferredType}.`,
                    source: 'ssjs',
                });
            }
        }
    }

    return diagnostics;
}

function isKnownAmpscriptConstruct(name: string): boolean {
    return (
        functionLookup.has(name) ||
        ampscriptKeywordSet.has(name) ||
        controlFlowConstructSet.has(name)
    );
}

function findAllOccurrences(text: string, search: string): number[] {
    const indices: number[] = [];
    let index = text.indexOf(search);
    while (index !== -1) {
        indices.push(index);
        index = text.indexOf(search, index + search.length);
    }
    return indices;
}

function buildVariableCompletionItems(text: string): CompletionItem[] {
    const variables = extractVariables(text);

    return variables.map((variable) => ({
        label: variable,
        kind: CompletionItemKind.Variable,
        detail: 'AMPscript variable in this file',
        insertText: variable,
        insertTextFormat: InsertTextFormat.PlainText,
        data: { type: 'variable', name: variable },
    }));
}

function extractVariables(text: string): string[] {
    const sanitizedAmpscriptText = getSanitizedAmpscriptText(text);
    const variablePattern = /@[a-zA-Z_][a-zA-Z0-9_]*/g;
    const seen = new Set<string>();
    const variables: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = variablePattern.exec(sanitizedAmpscriptText)) !== null) {
        if (match.index > 0 && sanitizedAmpscriptText[match.index - 1] === '@') {
            continue;
        }

        const variableName = match[0];
        const normalizedName = variableName.toLowerCase();
        if (!seen.has(normalizedName)) {
            seen.add(normalizedName);
            variables.push(variableName);
        }
    }

    return variables;
}

// ---------------------------------------------------------------------------
// Completions
// ---------------------------------------------------------------------------

// Build completion items once at startup
const functionCompletionItems: CompletionItem[] = ampscriptFunctions.map((function_, index) => ({
    label: function_.name,
    kind: CompletionItemKind.Function,
    detail: `(${function_.category}) ${function_.name}`,
    insertText: buildFunctionSnippet(function_),
    insertTextFormat: InsertTextFormat.Snippet,
    data: { type: 'function', index },
}));

const ampscriptKeywordSet = new Set(ampscriptKeywords.map((keyword) => keyword.name.toLowerCase()));
const controlFlowConstructSet = new Set([
    'if',
    'elseif',
    'else',
    'endif',
    'for',
    'next',
    'then',
    'do',
    'to',
    'downto',
    'var',
    'set',
    'and',
    'or',
    'not',
    'true',
    'false',
]);

// Pre-compute function arity bounds for diagnostic checks.
// Variadic functions accept additional argument pairs beyond their listed params.
const variadicFunctionNames = new Set([
    'lookup',
    'lookuprows',
    'lookuprowscs',
    'lookuporderedrows',
    'lookuporderedrowscs',
    'insertdata',
    'insertde',
    'updatedata',
    'updatede',
    'upsertdata',
    'upsertde',
    'deletedata',
    'deletede',
    'claimrow',
    'claimrowvalue',
    'cloudpagesurl',
    'micrositeurl',
    'concat',
    'replacelist',
    'regexmatch',
    'createsalesforceobject',
    'updatesinglesalesforceobject',
    'retrievesalesforceobjects',
    'httppost',
    'httppost2',
    'httppostwithretry',
    'createmscrm',
    'buildoptionlist',
    'wat',
    'getsocialpublishurl',
    'getsocialpublishurlbyname',
    'upsertcontact',
]);

interface FunctionArity {
    minArgs: number;
    maxArgs: number;
}
const functionArityLookup = new Map<string, FunctionArity>();
for (const function_ of ampscriptFunctions) {
    const minArguments = function_.params.filter((p) => !p.optional).length;
    const maxArguments = variadicFunctionNames.has(function_.name.toLowerCase())
        ? Infinity
        : function_.params.length;
    functionArityLookup.set(function_.name.toLowerCase(), {
        minArgs: minArguments,
        maxArgs: maxArguments,
    });
}

const keywordCompletionItems: CompletionItem[] = ampscriptKeywords.map((kw, index) => ({
    label: kw.name,
    kind: CompletionItemKind.Keyword,
    detail: kw.description,
    insertText: kw.snippet || kw.name,
    insertTextFormat: kw.snippet ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
    data: { type: 'keyword', index },
}));

const personalizationCompletionItems: CompletionItem[] = personalizationStrings.map(
    (ps, index) => ({
        label: ps.name,
        kind: CompletionItemKind.Variable,
        detail: ps.description,
        data: { type: 'personalization', index },
    }),
);

function buildFunctionSnippet(function_: AmpscriptFunction): string {
    if (!function_.params || function_.params.length === 0) {
        return `${function_.name}()`;
    }
    const parameterSnippets = function_.params.map((p, index) => `\${${index + 1}:${p.name}}`);
    return `${function_.name}(${parameterSnippets.join(', ')})`;
}

connection.onCompletion((textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) {
        return [];
    }

    const lang = getDocumentLanguage(document.uri);

    if (lang === 'ssjs') {
        const text = document.getText();
        const localFunctions = buildLocalFunctionCompletionItems(text);
        return [...ssjsCompletionItems, ...localFunctions];
    }

    const text = document.getText();
    const offset = document.offsetAt(textDocumentPosition.position);
    const variableCompletionItems = buildVariableCompletionItems(text);

    // Check if we are inside a GTL {{ }} context
    if (isInsideGtl(text, offset)) {
        return [
            ...functionCompletionItems,
            ...variableCompletionItems,
            ...personalizationCompletionItems,
        ];
    }

    // Check if we are inside an AMPscript context
    if (!isInsideAmpscript(text, offset)) {
        return [];
    }

    return [
        ...functionCompletionItems,
        ...keywordCompletionItems,
        ...variableCompletionItems,
        ...personalizationCompletionItems,
    ];
});

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    const data = item.data;
    if (!data) return item;

    switch (data.type) {
        case 'function': {
            const function_ = ampscriptFunctions[data.index];
            if (function_) {
                item.documentation = {
                    kind: MarkupKind.Markdown,
                    value: buildFunctionMarkdown(function_),
                };
            }

            break;
        }
        case 'keyword': {
            const kw = ampscriptKeywords[data.index];
            if (kw) {
                item.documentation = {
                    kind: MarkupKind.Markdown,
                    value: kw.description,
                };
            }

            break;
        }
        case 'personalization': {
            const ps = personalizationStrings[data.index];
            if (ps) {
                item.documentation = {
                    kind: MarkupKind.Markdown,
                    value: ps.description,
                };
            }

            break;
        }
        // No default
    }

    return item;
});

// ---------------------------------------------------------------------------
// Hover
// ---------------------------------------------------------------------------
connection.onHover((parameters: TextDocumentPositionParams): Hover | null => {
    const document = documents.get(parameters.textDocument.uri);
    if (!document) return null;

    const lang = getDocumentLanguage(document.uri);
    const position = parameters.position;
    const line = document.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line + 1, character: 0 },
    });

    if (lang === 'ssjs') {
        const ssjsHover = handleSsjsHover(line, position);
        if (ssjsHover) return ssjsHover;

        // Fall back to file-local function definitions
        const wordRange = getWordRangeAtPosition(line, position.character);
        if (wordRange) {
            const word = line.slice(wordRange.start, wordRange.end);
            const localFunctions = extractLocalSsjsFunctions(document.getText());
            const localFn = localFunctions.find((f) => f.name === word);
            if (localFn) {
                return {
                    contents: {
                        kind: MarkupKind.Markdown,
                        value: buildLocalFunctionMarkdown(localFn),
                    },
                    range: {
                        start: { line: position.line, character: wordRange.start },
                        end: { line: position.line, character: wordRange.end },
                    },
                };
            }
        }
        return null;
    }

    const wordRange = getWordRangeAtPosition(line, position.character);
    if (!wordRange) return null;

    const word = line.slice(wordRange.start, wordRange.end);

    const function_ = functionLookup.get(word.toLowerCase());
    if (function_) {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: buildFunctionMarkdown(function_),
            },
            range: {
                start: { line: position.line, character: wordRange.start },
                end: { line: position.line, character: wordRange.end },
            },
        };
    }

    const kw = ampscriptKeywords.find((k) => k.name.toLowerCase() === word.toLowerCase());
    if (kw) {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `**${kw.name}** *(keyword)*\n\n${kw.description}`,
            },
            range: {
                start: { line: position.line, character: wordRange.start },
                end: { line: position.line, character: wordRange.end },
            },
        };
    }

    const ps = personalizationStrings.find((p) => p.name.toLowerCase() === word.toLowerCase());
    if (ps) {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `**${ps.name}** *(personalization string)*\n\n${ps.description}`,
            },
            range: {
                start: { line: position.line, character: wordRange.start },
                end: { line: position.line, character: wordRange.end },
            },
        };
    }

    return null;
});

// ---------------------------------------------------------------------------
// Signature Help
// ---------------------------------------------------------------------------
connection.onSignatureHelp((parameters: TextDocumentPositionParams): SignatureHelp | null => {
    const document = documents.get(parameters.textDocument.uri);
    if (!document) return null;

    const lang = getDocumentLanguage(document.uri);
    const position = parameters.position;
    const textUpToCursor = document.getText({
        start: { line: 0, character: 0 },
        end: position,
    });

    // Walk backward to find the function name and count commas for active parameter
    const context = findFunctionContext(textUpToCursor);
    if (!context) return null;

    if (lang === 'ssjs') {
        const ssjsSig = buildSsjsSignatureHelp(context, textUpToCursor);
        if (ssjsSig) return ssjsSig;

        // Fall back to file-local function definitions
        const localFunctions = extractLocalSsjsFunctions(document.getText());
        const localFn = localFunctions.find(
            (f) => f.name.toLowerCase() === context.functionName.toLowerCase(),
        );
        if (localFn && localFn.params.length > 0) {
            const parameterInfos: ParameterInformation[] = localFn.params.map((p) => {
                const pd = localFn.paramDocs.get(p);
                const typeStr = pd?.type ? ` \`${pd.type}\`` : '';
                return {
                    label: p,
                    documentation: pd ? `${typeStr}${pd.description ? ` — ${pd.description}` : ''}`.trim() : undefined,
                };
            });
            const paramList = localFn.params
                .map((p) => {
                    const pd = localFn.paramDocs.get(p);
                    return pd?.type ? `${p}: ${pd.type}` : p;
                })
                .join(', ');
            const sig: SignatureInformation = {
                label: `${localFn.name}(${paramList})`,
                documentation: localFn.description || undefined,
                parameters: parameterInfos,
            };
            return {
                signatures: [sig],
                activeSignature: 0,
                activeParameter: Math.min(context.paramIndex, parameterInfos.length - 1),
            };
        }
        return null;
    }

    const function_ = functionLookup.get(context.functionName.toLowerCase());
    if (!function_ || !function_.params || function_.params.length === 0) return null;

    const parameterInfos: ParameterInformation[] = function_.params.map((p) => ({
        label: p.name,
        documentation: `${p.description}${p.optional ? ' *(optional)*' : ''}`,
    }));

    const sig: SignatureInformation = {
        label: function_.syntax,
        documentation: function_.description,
        parameters: parameterInfos,
    };

    return {
        signatures: [sig],
        activeSignature: 0,
        activeParameter: Math.min(context.paramIndex, function_.params.length - 1),
    };
});

// ---------------------------------------------------------------------------
// Go to Definition
// ---------------------------------------------------------------------------
connection.onDefinition((parameters: DefinitionParams): Location | null => {
    const document = documents.get(parameters.textDocument.uri);
    if (!document) return null;
    if (getDocumentLanguage(document.uri) !== 'ssjs') return null;

    const line = document.getText({
        start: { line: parameters.position.line, character: 0 },
        end: { line: parameters.position.line + 1, character: 0 },
    });
    const wordRange = getWordRangeAtPosition(line, parameters.position.character);
    if (!wordRange) return null;
    const word = line.slice(wordRange.start, wordRange.end);

    const text = document.getText();
    const localFn = extractLocalSsjsFunctions(text).find((f) => f.name === word);
    if (!localFn) return null;

    // Point to the function name token inside the declaration
    const nameOffset = localFn.startOffset + 'function '.length;
    return {
        uri: parameters.textDocument.uri,
        range: {
            start: document.positionAt(nameOffset),
            end: document.positionAt(nameOffset + localFn.name.length),
        },
    };
});

// ---------------------------------------------------------------------------
// Watched files
// ---------------------------------------------------------------------------
connection.onDidChangeWatchedFiles((_change) => {
    connection.console.log('File change event received.');
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine if the given offset is inside an AMPscript block %%[ ]%% or inline %%= =%%.
 */
function isInsideAmpscript(text: string, offset: number): boolean {
    const before = text.slice(0, Math.max(0, offset));

    // Check block context: last %%[ before offset without a matching ]%%
    const lastBlockOpen = before.lastIndexOf('%%[');
    const lastBlockClose = before.lastIndexOf(']%%');
    if (lastBlockOpen !== -1 && lastBlockOpen > lastBlockClose) {
        return true;
    }

    // Check inline context: last %%= before offset without a matching =%%
    const lastInlineOpen = before.lastIndexOf('%%=');
    const lastInlineClose = before.lastIndexOf('=%%');
    if (lastInlineOpen !== -1 && lastInlineOpen > lastInlineClose) {
        return true;
    }

    // Check script tag context
    const scriptOpenPattern = /<script\s[^>]*language\s*=\s*["']ampscript["'][^>]*>/gi;
    const scriptClosePattern = /<\/script>/gi;
    let lastScriptOpen = -1;
    let lastScriptClose = -1;
    let match: RegExpExecArray | null;

    while ((match = scriptOpenPattern.exec(before)) !== null) {
        lastScriptOpen = match.index;
    }
    while ((match = scriptClosePattern.exec(before)) !== null) {
        lastScriptClose = match.index;
    }
    if (lastScriptOpen !== -1 && lastScriptOpen > lastScriptClose) {
        return true;
    }

    return false;
}

function getSanitizedAmpscriptText(text: string): string {
    const sanitizedChars = Array.from(text, () => ' ');
    const blockPattern = /%%\[[\s\S]*?\]%%/g;
    const inlinePattern = /%%=[\s\S]*?=%%/g;
    const scriptPattern =
        /<script\s[^>]*language\s*=\s*["']ampscript["'][^>]*>[\s\S]*?<\/script>/gi;

    copySanitizedRegions(text, sanitizedChars, blockPattern, 3, 3);
    copySanitizedRegions(text, sanitizedChars, inlinePattern, 3, 3);

    let scriptMatch: RegExpExecArray | null;
    while ((scriptMatch = scriptPattern.exec(text)) !== null) {
        const matchText = scriptMatch[0];
        const openTagEnd = matchText.indexOf('>');
        const closeTagStart = matchText.toLowerCase().lastIndexOf('</script>');
        if (openTagEnd === -1 || closeTagStart === -1) {
            continue;
        }

        const codeStart = scriptMatch.index + openTagEnd + 1;
        const codeEnd = scriptMatch.index + closeTagStart;
        sanitizeRegion(text, sanitizedChars, codeStart, codeEnd);
    }

    return sanitizedChars.join('');
}

function copySanitizedRegions(
    text: string,
    sanitizedChars: string[],
    pattern: RegExp,
    openDelimiterLength: number,
    closeDelimiterLength: number,
): void {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
        const codeStart = match.index + openDelimiterLength;
        const codeEnd = match.index + match[0].length - closeDelimiterLength;
        sanitizeRegion(text, sanitizedChars, codeStart, codeEnd);
    }
}

function sanitizeRegion(text: string, sanitizedChars: string[], start: number, end: number): void {
    let index = start;
    while (index < end) {
        if (text.startsWith('/*', index)) {
            const commentEnd = text.indexOf('*/', index + 2);
            const safeEnd = commentEnd === -1 || commentEnd > end ? end : commentEnd + 2;
            for (let index_ = index; index_ < safeEnd; index_++) {
                sanitizedChars[index_] = ' ';
            }
            index = safeEnd;
            continue;
        }

        const quote = text[index];
        if (quote === '"' || quote === "'") {
            const stringEnd = findStringEnd(text, index + 1, end, quote);
            sanitizedChars[index] = quote;
            for (let index_ = index + 1; index_ < stringEnd; index_++) {
                sanitizedChars[index_] = ' ';
            }
            if (stringEnd > index + 1 && text[stringEnd - 1] === quote) {
                sanitizedChars[stringEnd - 1] = quote;
            }
            index = stringEnd;
            continue;
        }

        sanitizedChars[index] = text[index];
        index++;
    }
}

function findStringEnd(text: string, start: number, limit: number, quote: string): number {
    let index = start;
    while (index < limit) {
        if (text[index] === quote) {
            return index + 1;
        }
        index++;
    }
    return limit;
}

/**
 * Count the number of arguments in a function call by scanning from the
 * opening paren, tracking depth and top-level commas. Runs on sanitized text
 * where string contents and comments are blanked, so commas inside strings
 * will not produce false positives.
 *
 * Returns 0 for empty parens `()`, otherwise `commas + 1`.
 * Returns -1 if no matching closing paren is found.
 */
function countFunctionArguments(text: string, openParenPos: number): number {
    let depth = 1;
    let commas = 0;
    let hasContent = false;

    for (let index = openParenPos + 1; index < text.length && depth > 0; index++) {
        const ch = text[index];
        if (ch === '(') {
            depth++;
            hasContent = true;
        } else if (ch === ')') {
            depth--;
        } else if (ch === ',' && depth === 1) {
            commas++;
            hasContent = true;
        } else if (ch !== ' ' && ch !== '\n' && ch !== '\r' && ch !== '\t') {
            hasContent = true;
        }
    }

    if (depth !== 0) return -1;
    return hasContent ? commas + 1 : 0;
}

interface ArgumentSpan {
    value: string;
    start: number;
    end: number;
}

/**
 * Extracts each top-level argument's text and absolute position from a function call.
 * Respects balanced parens so nested calls are treated as a single argument.
 * Returns null if the argument list is not properly closed.
 */
function extractFunctionArguments(text: string, openParenPos: number): ArgumentSpan[] | null {
    let depth = 1;
    let argStart = openParenPos + 1;
    const args: ArgumentSpan[] = [];
    let hasContent = false;

    for (let index = openParenPos + 1; index < text.length; index++) {
        const ch = text[index];
        if (ch === '(' || ch === '[' || ch === '{') {
            depth++;
            hasContent = true;
        } else if (ch === ')' || ch === ']' || ch === '}') {
            depth--;
            if (depth === 0) {
                const raw = text.slice(argStart, index);
                if (raw.trim().length > 0 || hasContent) {
                    args.push({ value: raw.trim(), start: argStart, end: index });
                }
                return args;
            }
        } else if (ch === ',' && depth === 1) {
            const raw = text.slice(argStart, index);
            args.push({ value: raw.trim(), start: argStart, end: index });
            argStart = index + 1;
            hasContent = false;
        } else if (ch !== ' ' && ch !== '\n' && ch !== '\r' && ch !== '\t') {
            hasContent = true;
        }
    }

    return null; // unmatched paren
}

/**
 * Infers the literal type of a trimmed argument string.
 * Returns null when the argument is a variable, expression, or nested call.
 */
function inferLiteralType(arg: string): 'string' | 'number' | 'boolean' | null {
    if (arg.startsWith('"') || arg.startsWith("'")) return 'string';
    if (/^-?\d+(\.\d+)?$/.test(arg)) return 'number';
    if (arg === 'true' || arg === 'false') return 'boolean';
    return null;
}

/**
 * Get word boundaries around a character position in a line.
 */
function getWordRangeAtPosition(
    line: string,
    character: number,
): { start: number; end: number } | null {
    // Match identifiers (including @-prefixed variables)
    const wordPattern = /[@]?[a-zA-Z_][a-zA-Z0-9_]*/g;
    let match: RegExpExecArray | null;
    while ((match = wordPattern.exec(line)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (character >= start && character <= end) {
            return { start, end };
        }
    }
    return null;
}

/**
 * Walk backward from cursor to find the enclosing function call and parameter index.
 */
function findFunctionContext(
    textUpToCursor: string,
): { functionName: string; paramIndex: number } | null {
    let depth = 0;
    let commaCount = 0;

    for (let index = textUpToCursor.length - 1; index >= 0; index--) {
        const ch = textUpToCursor[index];
        if (ch === ')') {
            depth++;
        } else if (ch === '(') {
            if (depth === 0) {
                // Found the opening paren — now extract the function name before it
                const before = textUpToCursor.slice(0, Math.max(0, index)).trimEnd();
                const functionMatch = before.match(/([a-zA-Z_][a-zA-Z0-9_]*)$/);
                if (functionMatch) {
                    return { functionName: functionMatch[1], paramIndex: commaCount };
                }
                return null;
            }
            depth--;
        } else if (ch === ',' && depth === 0) {
            commaCount++;
        }
    }
    return null;
}

/**
 * Build formatted markdown documentation for a function.
 */
function buildFunctionMarkdown(function_: AmpscriptFunction): string {
    const lines: string[] = [];

    // Build TypeScript-style typed signature
    const parameterParts = function_.params.map((p) => {
        const opt = p.optional ? '?' : '';
        const type = p.type || 'any';
        return `${p.name}${opt}: ${type}`;
    });
    const returnType = function_.returnType || 'void';
    const sig = `(function) ${function_.name}(${parameterParts.join(', ')}): ${returnType}`;

    lines.push('```typescript', sig, '```', '', function_.description);

    if (function_.params && function_.params.length > 0) {
        lines.push('');
        for (const p of function_.params) {
            const opt = p.optional ? ' *(optional)*' : '';
            lines.push(`*@param* \`${p.name}\`${opt} — ${p.description}\n`);
        }
    }

    if (function_.returnType && function_.returnType !== 'void') {
        lines.push(`*@return* \`${function_.returnType}\``);
    }

    if (function_.example) {
        lines.push('', '**Example:**', '```ampscript', function_.example, '```');
    }

    return lines.join('\n');
}

/**
 * Build formatted markdown documentation for an SSJS function (mirrors buildFunctionMarkdown).
 */
function buildSsjsFunctionMarkdown(function_: SsjsFunction): string {
    const prefix = function_.prefix ? `${function_.prefix}.` : '';
    const lines: string[] = [];

    if (function_.params && function_.params.length > 0) {
        const parameterParts = function_.params.map((p) => {
            const opt = p.optional ? '?' : '';
            const type = p.type || 'any';
            return `${p.name}${opt}: ${type}`;
        });
        const returnType = function_.returnType || 'void';
        const sig = `(function) ${prefix}${function_.name}(${parameterParts.join(', ')}): ${returnType}`;

        lines.push('```typescript', sig, '```', '', function_.description, '');

        for (const p of function_.params) {
            const opt = p.optional ? ' *(optional)*' : '';
            lines.push(`*@param* \`${p.name}\`${opt} — ${p.description}\n`);
        }

        if (function_.returnType && function_.returnType !== 'void') {
            lines.push(`*@return* \`${function_.returnType}\``);
        }
    } else {
        // Zero-param callable functions still get a proper TypeScript signature
        const returnType = function_.returnType || 'void';
        const sig = `(function) ${prefix}${function_.name}(): ${returnType}`;
        lines.push('```typescript', sig, '```', '', function_.description);
        if (function_.returnType && function_.returnType !== 'void') {
            lines.push('', `*@return* \`${function_.returnType}\``);
        }
    }

    if (function_.example) {
        lines.push('', '**Example:**', '```javascript', function_.example, '```');
    }

    return lines.join('\n');
}

/**
 * Build formatted markdown documentation for an ECMAScript built-in method.
 */
function buildEcmascriptBuiltinMarkdown(builtin: EcmascriptBuiltin): string {
    const lines: string[] = [];

    if (builtin.params && builtin.params.length > 0) {
        const parameterParts = builtin.params.map((p) => {
            const opt = p.optional ? '?' : '';
            const type = p.type || 'any';
            return `${p.name}${opt}: ${type}`;
        });
        const returnType = builtin.returnType || 'any';
        const sig = `(method) ${builtin.syntax ?? `${builtin.name}(${parameterParts.join(', ')}): ${returnType}`}`;
        lines.push('```typescript', sig, '```', '', builtin.description, '');
        for (const p of builtin.params) {
            const opt = p.optional ? ' *(optional)*' : '';
            lines.push(`*@param* \`${p.name}\`${opt} — ${p.description}\n`);
        }
        if (builtin.returnType && builtin.returnType !== 'void') {
            lines.push(`*@return* \`${builtin.returnType}\``);
        }
    } else {
        lines.push(`**${builtin.syntax ?? builtin.name}**\n\n${builtin.description}`);
        if (builtin.returnType && builtin.returnType !== 'void') {
            lines.push(`\n*@return* \`${builtin.returnType}\``);
        }
    }

    if (builtin.example) {
        lines.push('', '**Example:**', '```javascript', builtin.example, '```');
    }

    return lines.join('\n');
}

/**
 * Build a snippet string for an SSJS function with parameter placeholders.
 */
function buildSsjsFunctionSnippet(function_: SsjsFunction): string {
    const prefix = function_.prefix ? `${function_.prefix}.` : '';
    if (!function_.params || function_.params.length === 0) {
        return `${prefix}${function_.name}()`;
    }
    const snippets = function_.params.map((p, index) => `\${${index + 1}:${p.name}}`);
    return `${prefix}${function_.name}(${snippets.join(', ')})`;
}

// ---------------------------------------------------------------------------
// File-local SSJS function extraction
// ---------------------------------------------------------------------------

interface LocalSsjsFunction {
    name: string;
    params: string[];
    description: string;
    paramDocs: Map<string, { type: string; description: string }>;
    returnType: string;
    startOffset: number;
}

/**
 * Parse all `function name(...)` declarations from SSJS document text,
 * extracting preceding JSDoc blocks for documentation and parameter info.
 */
function extractLocalSsjsFunctions(text: string): LocalSsjsFunction[] {
    const results: LocalSsjsFunction[] = [];
    const fnPattern = /function\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
    let match: RegExpExecArray | null;

    while ((match = fnPattern.exec(text)) !== null) {
        const name = match[1];
        const rawParams = match[2]
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);

        // Look backwards from the function keyword for a JSDoc block /** ... */
        const before = text.slice(0, match.index);
        const jsdocMatch = before.match(/\/\*\*[\s\S]*?\*\/\s*$/);

        let description = '';
        const paramDocs = new Map<string, { type: string; description: string }>();
        let returnType = '';

        if (jsdocMatch) {
            const jsdoc = jsdocMatch[0];

            // Extract description (text before the first @tag)
            const descMatch = jsdoc.match(/\/\*\*\s*([\s\S]*?)(?=\s*@|\s*\*\/)/);
            if (descMatch) {
                description = descMatch[1]
                    .replace(/^\s*\*\s?/gm, '')
                    .trim();
            }

            // Extract @param tags: @param {type} name - description
            const paramPattern = /@param\s+(?:\{([^}]*)\}\s+)?(\w+)(?:\s+-\s*(.*?))?(?=\s*@|\s*\*\/)/gs;
            let pMatch: RegExpExecArray | null;
            while ((pMatch = paramPattern.exec(jsdoc)) !== null) {
                paramDocs.set(pMatch[2], {
                    type: pMatch[1] ?? '',
                    description: pMatch[3]?.trim() ?? '',
                });
            }

            // Extract @returns / @return
            const retMatch = jsdoc.match(/@returns?\s+(?:\{([^}]*)\})?/);
            if (retMatch) {
                returnType = retMatch[1] ?? 'any';
            }
        }

        results.push({ name, params: rawParams, description, paramDocs, returnType, startOffset: match.index });
    }

    return results;
}

/**
 * Build completion items for file-local SSJS function declarations.
 */
function buildLocalFunctionCompletionItems(text: string): CompletionItem[] {
    const functions = extractLocalSsjsFunctions(text);
    return functions.map((fn) => {
        const paramList = fn.params
            .map((p) => {
                const pd = fn.paramDocs.get(p);
                return pd?.type ? `${p}: ${pd.type}` : p;
            })
            .join(', ');

        const snippetParams = fn.params
            .map((p, i) => `\${${i + 1}:${p}}`)
            .join(', ');

        return {
            label: fn.name,
            kind: CompletionItemKind.Function,
            detail: `(local) ${fn.name}(${paramList})`,
            documentation: { kind: MarkupKind.Markdown, value: buildLocalFunctionMarkdown(fn) },
            insertText: `${fn.name}(${snippetParams})`,
            insertTextFormat: InsertTextFormat.Snippet,
            data: { type: 'ssjs-local-function', name: fn.name },
        } satisfies CompletionItem;
    });
}

/**
 * Build formatted markdown documentation for a file-local SSJS function,
 * following the same design pattern as buildSsjsFunctionMarkdown (no Example section).
 */
function buildLocalFunctionMarkdown(fn: LocalSsjsFunction): string {
    const lines: string[] = [];
    if (fn.params.length > 0) {
        const paramParts = fn.params.map((p) => {
            const pd = fn.paramDocs.get(p);
            return pd?.type ? `${p}: ${pd.type}` : p;
        });
        const returnType = fn.returnType || 'void';
        const sig = `(function) ${fn.name}(${paramParts.join(', ')}): ${returnType}`;
        lines.push('```typescript', sig, '```', '', fn.description, '');
        for (const p of fn.params) {
            const pd = fn.paramDocs.get(p);
            if (pd) {
                lines.push(`*@param* \`${p}\` — ${pd.description}\n`);
            }
        }
        if (fn.returnType && fn.returnType !== 'void') {
            lines.push(`*@return* \`${fn.returnType}\``);
        }
    } else {
        lines.push(`**${fn.name}**\n\n${fn.description}`);
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// SSJS Signature Help
// ---------------------------------------------------------------------------
function buildSsjsSignatureHelp(
    context: { functionName: string; paramIndex: number },
    _textUpToCursor: string,
): SignatureHelp | null {
    const allFunctions: SsjsFunction[] = [
        ...platformMethods,
        ...platformFunctions,
        ...ssjsGlobals,
        ...platformVariableMethods,
        ...platformResponseMethods,
        ...platformRequestMethods,
        ...platformClientBrowserMethods,
        ...platformRecipientMethods,
        ...wsproxyMethods,
        ...httpMethods,
    ];

    const function_ = allFunctions.find(
        (f) => f.name.toLowerCase() === context.functionName.toLowerCase(),
    );
    if (!function_) return null;

    const prefix = function_.prefix ? `${function_.prefix}.` : '';

    if (function_.params && function_.params.length > 0) {
        const parameterInfos: ParameterInformation[] = function_.params.map((p) => ({
            label: p.name,
            documentation: `${p.description}${p.optional ? ' *(optional)*' : ''}`,
        }));

        const sigLabel = function_.syntax
            ? `${prefix}${function_.syntax}`
            : `${prefix}${function_.name}(${function_.params.map((p) => p.name).join(', ')})`;

        const sig: SignatureInformation = {
            label: sigLabel,
            documentation: function_.description,
            parameters: parameterInfos,
        };

        return {
            signatures: [sig],
            activeSignature: 0,
            activeParameter: Math.min(context.paramIndex, parameterInfos.length - 1),
        };
    }

    const parameterCount =
        function_.maxArgs === Infinity
            ? Math.max(function_.minArgs, context.paramIndex + 1)
            : function_.maxArgs;
    const parameterLabels: string[] = [];
    for (let index = 0; index < parameterCount; index++) {
        parameterLabels.push(index < function_.minArgs ? `arg${index + 1}` : `arg${index + 1}?`);
    }

    const parameterInfos: ParameterInformation[] = parameterLabels.map((label) => ({
        label,
    }));

    const sig: SignatureInformation = {
        label: `${prefix}${function_.name}(${parameterLabels.join(', ')})`,
        documentation: function_.description,
        parameters: parameterInfos,
    };

    return {
        signatures: [sig],
        activeSignature: 0,
        activeParameter: Math.min(context.paramIndex, parameterInfos.length - 1),
    };
}

// ---------------------------------------------------------------------------
// SSJS Hover
// ---------------------------------------------------------------------------
function handleSsjsHover(
    line: string,
    position: { line: number; character: number },
): Hover | null {
    const ssjsWordRange = getWordRangeAtPosition(line, position.character);
    if (!ssjsWordRange) return null;

    const word = line.slice(ssjsWordRange.start, ssjsWordRange.end);

    // Check two-part Platform.XXX calls (e.g. Platform.Load) — must not be
    // followed by another '.\w' segment (those are handled by the 3-part block below).
    const twoPartPattern = /Platform\.(\w+)(?!\.\w)/g;
    let tpMatch: RegExpExecArray | null;
    while ((tpMatch = twoPartPattern.exec(line)) !== null) {
        if (
            position.character >= tpMatch.index &&
            position.character <= tpMatch.index + tpMatch[0].length
        ) {
            const fn = platformMethods.find(
                (m) => m.name.toLowerCase() === tpMatch![1].toLowerCase(),
            );
            if (fn) {
                return {
                    contents: {
                        kind: MarkupKind.Markdown,
                        value: buildSsjsFunctionMarkdown(fn),
                    },
                    range: {
                        start: { line: position.line, character: tpMatch.index },
                        end: {
                            line: position.line,
                            character: tpMatch.index + tpMatch[0].length,
                        },
                    },
                };
            }
        }
    }

    const qualifiedPattern = /(\w+)\.(\w+)\.(\w+)/g;
    let qMatch: RegExpExecArray | null;
    while ((qMatch = qualifiedPattern.exec(line)) !== null) {
        if (
            position.character >= qMatch.index &&
            position.character <= qMatch.index + qMatch[0].length
        ) {
            const fullName = qMatch[0];
            if (qMatch[1] === 'Platform' && qMatch[2] === 'Function') {
                const function_ = platformFunctionLookup.get(qMatch[3].toLowerCase());
                if (function_) {
                    return {
                        contents: {
                            kind: MarkupKind.Markdown,
                            value: buildSsjsFunctionMarkdown(function_),
                        },
                        range: {
                            start: { line: position.line, character: qMatch.index },
                            end: { line: position.line, character: qMatch.index + fullName.length },
                        },
                    };
                }
            }
            if (qMatch[1] === 'Platform' && qMatch[2] === 'Variable') {
                const function_ = platformVariableMethods.find(
                    (m) => m.name.toLowerCase() === qMatch![3].toLowerCase(),
                );
                if (function_) {
                    return {
                        contents: {
                            kind: MarkupKind.Markdown,
                            value: buildSsjsFunctionMarkdown(function_),
                        },
                        range: {
                            start: { line: position.line, character: qMatch.index },
                            end: { line: position.line, character: qMatch.index + fullName.length },
                        },
                    };
                }
            }
            if (qMatch[1] === 'Platform' && qMatch[2] === 'Response') {
                const function_ = platformResponseMethods.find(
                    (m) => m.name.toLowerCase() === qMatch![3].toLowerCase(),
                );
                if (function_) {
                    return {
                        contents: {
                            kind: MarkupKind.Markdown,
                            value: buildSsjsFunctionMarkdown(function_),
                        },
                        range: {
                            start: { line: position.line, character: qMatch.index },
                            end: { line: position.line, character: qMatch.index + fullName.length },
                        },
                    };
                }
            }
            if (qMatch[1] === 'Platform' && qMatch[2] === 'Request') {
                const function_ = platformRequestMethods.find(
                    (m) => m.name.toLowerCase() === qMatch![3].toLowerCase(),
                );
                if (function_) {
                    return {
                        contents: {
                            kind: MarkupKind.Markdown,
                            value: buildSsjsFunctionMarkdown(function_),
                        },
                        range: {
                            start: { line: position.line, character: qMatch.index },
                            end: { line: position.line, character: qMatch.index + fullName.length },
                        },
                    };
                }
            }
            if (qMatch[1] === 'Platform' && qMatch[2] === 'ClientBrowser') {
                const function_ = platformClientBrowserMethods.find(
                    (m) => m.name.toLowerCase() === qMatch![3].toLowerCase(),
                );
                if (function_) {
                    return {
                        contents: {
                            kind: MarkupKind.Markdown,
                            value: buildSsjsFunctionMarkdown(function_),
                        },
                        range: {
                            start: { line: position.line, character: qMatch.index },
                            end: { line: position.line, character: qMatch.index + fullName.length },
                        },
                    };
                }
            }
            if (qMatch[1] === 'Platform' && qMatch[2] === 'DateTime') {
                const function_ = platformFunctionLookup.get(qMatch[3].toLowerCase());
                if (function_) {
                    return {
                        contents: {
                            kind: MarkupKind.Markdown,
                            value: buildSsjsFunctionMarkdown(function_),
                        },
                        range: {
                            start: { line: position.line, character: qMatch.index },
                            end: { line: position.line, character: qMatch.index + fullName.length },
                        },
                    };
                }
            }
            if (qMatch[1] === 'Platform' && qMatch[2] === 'Recipient') {
                const function_ = platformRecipientMethods.find(
                    (m) => m.name.toLowerCase() === qMatch![3].toLowerCase(),
                );
                if (function_) {
                    return {
                        contents: {
                            kind: MarkupKind.Markdown,
                            value: buildSsjsFunctionMarkdown(function_),
                        },
                        range: {
                            start: { line: position.line, character: qMatch.index },
                            end: { line: position.line, character: qMatch.index + fullName.length },
                        },
                    };
                }
            }
            // Script.Util.HttpRequest / HttpGet / HttpPost constructors
            if (qMatch[1] === 'Script' && qMatch[2] === 'Util') {
                const constructor = scriptUtilConstructors.find(
                    (c) => c.name.toLowerCase() === qMatch![3].toLowerCase(),
                );
                if (constructor) {
                    return {
                        contents: {
                            kind: MarkupKind.Markdown,
                            value: buildSsjsFunctionMarkdown(constructor),
                        },
                        range: {
                            start: { line: position.line, character: qMatch.index },
                            end: { line: position.line, character: qMatch.index + fullName.length },
                        },
                    };
                }
            }
        }
    }

    // Two-part patterns: WSProxy.method, req.send, req.setHeader, HTTP.Get,
    // Variable.SetValue, Function.Lookup, Response.X, Request.X, ClientBrowser.X, etc.
    const twoPartGenericPattern = /(\w+)\.(\w+)/g;
    let tpgMatch: RegExpExecArray | null;
    while ((tpgMatch = twoPartGenericPattern.exec(line)) !== null) {
        if (
            position.character >= tpgMatch.index &&
            position.character <= tpgMatch.index + tpgMatch[0].length
        ) {
            const fullName = tpgMatch[0];
            // Platform sub-object shorthands: Variable.X, Function.X, Response.X, Request.X, ClientBrowser.X
            if (tpgMatch[1] === 'Variable') {
                const method = platformVariableMethods.find(
                    (m) => m.name.toLowerCase() === tpgMatch![2].toLowerCase(),
                );
                if (method) {
                    return {
                        contents: { kind: MarkupKind.Markdown, value: buildSsjsFunctionMarkdown(method) },
                        range: {
                            start: { line: position.line, character: tpgMatch.index },
                            end: { line: position.line, character: tpgMatch.index + fullName.length },
                        },
                    };
                }
            }
            if (tpgMatch[1] === 'Function' || tpgMatch[1] === 'DateTime') {
                const function_ = platformFunctionLookup.get(tpgMatch[2].toLowerCase());
                if (function_) {
                    return {
                        contents: { kind: MarkupKind.Markdown, value: buildSsjsFunctionMarkdown(function_) },
                        range: {
                            start: { line: position.line, character: tpgMatch.index },
                            end: { line: position.line, character: tpgMatch.index + fullName.length },
                        },
                    };
                }
            }
            if (tpgMatch[1] === 'Response') {
                const method = platformResponseMethods.find(
                    (m) => m.name.toLowerCase() === tpgMatch![2].toLowerCase(),
                );
                if (method) {
                    return {
                        contents: { kind: MarkupKind.Markdown, value: buildSsjsFunctionMarkdown(method) },
                        range: {
                            start: { line: position.line, character: tpgMatch.index },
                            end: { line: position.line, character: tpgMatch.index + fullName.length },
                        },
                    };
                }
            }
            if (tpgMatch[1] === 'Request') {
                const method = platformRequestMethods.find(
                    (m) => m.name.toLowerCase() === tpgMatch![2].toLowerCase(),
                );
                if (method) {
                    return {
                        contents: { kind: MarkupKind.Markdown, value: buildSsjsFunctionMarkdown(method) },
                        range: {
                            start: { line: position.line, character: tpgMatch.index },
                            end: { line: position.line, character: tpgMatch.index + fullName.length },
                        },
                    };
                }
            }
            if (tpgMatch[1] === 'ClientBrowser') {
                const method = platformClientBrowserMethods.find(
                    (m) => m.name.toLowerCase() === tpgMatch![2].toLowerCase(),
                );
                if (method) {
                    return {
                        contents: { kind: MarkupKind.Markdown, value: buildSsjsFunctionMarkdown(method) },
                        range: {
                            start: { line: position.line, character: tpgMatch.index },
                            end: { line: position.line, character: tpgMatch.index + fullName.length },
                        },
                    };
                }
            }
            if (tpgMatch[1] === 'Recipient') {
                const method = platformRecipientMethods.find(
                    (m) => m.name.toLowerCase() === tpgMatch![2].toLowerCase(),
                );
                if (method) {
                    return {
                        contents: { kind: MarkupKind.Markdown, value: buildSsjsFunctionMarkdown(method) },
                        range: {
                            start: { line: position.line, character: tpgMatch.index },
                            end: { line: position.line, character: tpgMatch.index + fullName.length },
                        },
                    };
                }
            }
            // WSProxy.method hover
            if (tpgMatch[1] === 'WSProxy' || tpgMatch[1] === 'api' || tpgMatch[1] === 'prox') {
                const method = wsproxyMethods.find(
                    (m) => m.name.toLowerCase() === tpgMatch![2].toLowerCase(),
                );
                if (method) {
                    return {
                        contents: {
                            kind: MarkupKind.Markdown,
                            value: buildSsjsFunctionMarkdown(method),
                        },
                        range: {
                            start: { line: position.line, character: tpgMatch.index },
                            end: { line: position.line, character: tpgMatch.index + fullName.length },
                        },
                    };
                }
            }
            // HTTP.Get, HTTP.Post, HTTP.GetRequest, HTTP.PostRequest
            if (tpgMatch[1] === 'HTTP') {
                const method = httpMethods.find(
                    (m) => m.name.toLowerCase() === tpgMatch![2].toLowerCase(),
                );
                if (method) {
                    return {
                        contents: {
                            kind: MarkupKind.Markdown,
                            value: buildSsjsFunctionMarkdown(method),
                        },
                        range: {
                            start: { line: position.line, character: tpgMatch.index },
                            end: { line: position.line, character: tpgMatch.index + fullName.length },
                        },
                    };
                }
            }
            // req.send, req.setHeader, req.clearHeaders, req.removeHeader
            // (match any variable name before the method)
            const reqMethod = scriptUtilRequestMethods.find(
                (m) => m.name.toLowerCase() === tpgMatch![2].toLowerCase(),
            );
            if (reqMethod) {
                return {
                    contents: {
                        kind: MarkupKind.Markdown,
                        value: buildSsjsFunctionMarkdown(reqMethod),
                    },
                    range: {
                        start: { line: position.line, character: tpgMatch.index },
                        end: { line: position.line, character: tpgMatch.index + fullName.length },
                    },
                };
            }
            // Math.abs, Math.ceil, etc.
            if (tpgMatch[1] === 'Math') {
                const mathBuiltin = ecmascriptBuiltins.find(
                    (b) => b.owner === 'Math' && b.name.toLowerCase() === tpgMatch![2].toLowerCase(),
                );
                if (mathBuiltin) {
                    return {
                        contents: {
                            kind: MarkupKind.Markdown,
                            value: buildEcmascriptBuiltinMarkdown(mathBuiltin),
                        },
                        range: {
                            start: { line: position.line, character: tpgMatch.index },
                            end: { line: position.line, character: tpgMatch.index + fullName.length },
                        },
                    };
                }
            }
            // Array.prototype and String.prototype method hover (e.g. arr.join, str.split)
            const protoBuiltin = ecmascriptBuiltins.find(
                (b) =>
                    (b.owner === 'Array.prototype' || b.owner === 'String.prototype') &&
                    b.name.toLowerCase() === tpgMatch![2].toLowerCase(),
            );
            if (protoBuiltin) {
                return {
                    contents: {
                        kind: MarkupKind.Markdown,
                        value: buildEcmascriptBuiltinMarkdown(protoBuiltin),
                    },
                    range: {
                        start: { line: position.line, character: tpgMatch.index },
                        end: { line: position.line, character: tpgMatch.index + fullName.length },
                    },
                };
            }
        }
    }

    const globalFunction = ssjsGlobals.find((g) => g.name.toLowerCase() === word.toLowerCase());
    if (globalFunction) {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: buildSsjsFunctionMarkdown(globalFunction),
            },
            range: {
                start: { line: position.line, character: ssjsWordRange.start },
                end: { line: position.line, character: ssjsWordRange.end },
            },
        };
    }

    // Plain unprefixed calls to Platform functions (e.g. Now(), SystemDateToLocalDate())
    const platformFnByWord = platformFunctionLookup.get(word.toLowerCase());
    if (platformFnByWord) {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: buildSsjsFunctionMarkdown(platformFnByWord),
            },
            range: {
                start: { line: position.line, character: ssjsWordRange.start },
                end: { line: position.line, character: ssjsWordRange.end },
            },
        };
    }

    const coreObject = coreLibraryObjects.find((o) => o.name.toLowerCase() === word.toLowerCase());
    if (coreObject) {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `**${coreObject.name}** *(Core library)*\n\n${coreObject.description}\n\n**Methods:** ${coreObject.methods.join(', ')}\n\n*Requires* \`Platform.Load("core", "1.1.5")\``,
            },
            range: {
                start: { line: position.line, character: ssjsWordRange.start },
                end: { line: position.line, character: ssjsWordRange.end },
            },
        };
    }

    if (word === 'WSProxy') {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: '**WSProxy** *(SOAP API wrapper)*\n\nLightweight wrapper for the Marketing Cloud SOAP API. Faster than AMPscript API functions for bulk operations.',
            },
            range: {
                start: { line: position.line, character: ssjsWordRange.start },
                end: { line: position.line, character: ssjsWordRange.end },
            },
        };
    }

    return null;
}

// ---------------------------------------------------------------------------
// GTL Context Detection
// ---------------------------------------------------------------------------
function isInsideGtl(text: string, offset: number): boolean {
    const before = text.slice(0, Math.max(0, offset));
    const lastGtlOpen = before.lastIndexOf('{{');
    const lastGtlClose = before.lastIndexOf('}}');
    return lastGtlOpen !== -1 && lastGtlOpen > lastGtlClose;
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
documents.listen(connection);
connection.listen();
