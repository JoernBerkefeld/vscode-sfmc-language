/**
 * SFMC Language Client
 * Activates the language server for AMPscript, SSJS, and GTL files.
 */

import path from 'node:path';
import {
    workspace,
    languages,
    commands,
    extensions,
    window,
    ExtensionContext,
    TextDocument,
    lm,
    McpStdioServerDefinition,
} from 'vscode';

import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';
import { SfmcStatusBar } from './statusBar';
import { checkAndShowWhatsNew, showWhatsNewPanel } from './whatsNew';

let client: LanguageClient;

const EXTENSION_DISPLAY_NAME = 'SFMC Language Service';

export const CONFLICTING_EXTENSIONS = [
    { id: 'xnerd.ampscript-language', name: 'AMPscript (xnerd)' },
    { id: 'FiB.beautyAmp', name: 'beautyAmp' },
];

export const SUPPRESS_KEY = 'suppressConflictWarning';

function checkConflictingExtensions(context: ExtensionContext): void {
    const settingSuppressed = workspace
        .getConfiguration('sfmcLanguageServer')
        .get<boolean>('suppressConflictWarning', false);
    if (settingSuppressed || context.globalState.get<boolean>(SUPPRESS_KEY)) {
        return;
    }

    const active = CONFLICTING_EXTENSIONS.filter(
        (ext) => extensions.getExtension(ext.id)?.isActive
    ).map((ext) => ext.name);

    if (active.length === 0) return;

    const message =
        `SFMC Language Service: conflicting extension(s) detected — ${active.join(', ')}. ` +
        'These can cause unpredictable formatting, syntax highlighting, and IntelliSense in AMPscript/HTML files. ' +
        'Consider disabling them.';

    window.showWarningMessage(message, 'Open Extensions', "Don't Show Again").then((selection) => {
        if (selection === 'Open Extensions') {
            commands.executeCommand('workbench.extensions.action.showInstalledExtensions');
        } else if (selection === "Don't Show Again") {
            context.globalState.update(SUPPRESS_KEY, true);
        }
    });
}

const AMPSCRIPT_MARKERS: (string | RegExp)[] = [
    '%%[',
    '%%=',
    /<script\s[^>]*language\s*=\s*["']ampscript["']/i,
    /<script\b[^>]*\brunat\s*=\s*["']server["']/i,
];

function matchesAny(text: string, markers: (string | RegExp)[]): boolean {
    return markers.some((marker) =>
        typeof marker === 'string' ? text.includes(marker) : marker.test(text)
    );
}

function detectAndSwitchLanguage(doc: TextDocument): void {
    // Force .ssjs files to use the ssjs language ID even when VS Code or user settings
    // have mapped *.ssjs to javascript (configurationDefaults can be overridden by user settings).
    if (doc.uri.path.endsWith('.ssjs') && doc.languageId !== 'ssjs') {
        languages.setTextDocumentLanguage(doc, 'ssjs');
        return;
    }

    if (doc.languageId !== 'html') return;
    const text = doc.getText();

    // Switch to sfmc for any HTML containing SFMC content (AMPscript markers or SSJS blocks).
    if (matchesAny(text, AMPSCRIPT_MARKERS)) {
        languages.setTextDocumentLanguage(doc, 'sfmc');
        return;
    }
}

export function activate(context: ExtensionContext) {
    const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
        },
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'ampscript' },
            { scheme: 'untitled', language: 'ampscript' },
            { scheme: 'file', language: 'sfmc' },
            { scheme: 'untitled', language: 'sfmc' },
            { scheme: 'file', language: 'ssjs' },
            { scheme: 'untitled', language: 'ssjs' },
        ],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/*.{ampscript,amp,ssjs}'),
        },
    };

    client = new LanguageClient(
        'sfmcLanguageServer',
        'SFMC Language Server',
        serverOptions,
        clientOptions
    );

    client.start();

    new SfmcStatusBar(context, client);

    // Detect AMPscript in already-open HTML documents
    for (const doc of workspace.textDocuments) {
        detectAndSwitchLanguage(doc);
    }

    // Detect SFMC content in HTML documents: on open and on content change (e.g. pasting)
    context.subscriptions.push(
        workspace.onDidOpenTextDocument(detectAndSwitchLanguage),
        workspace.onDidChangeTextDocument((event) => {
            detectAndSwitchLanguage(event.document);
        })
    );

    checkConflictingExtensions(context);

    context.subscriptions.push(
        commands.registerCommand('sfmc-language.showWhatsNew', () =>
            showWhatsNewPanel(context, EXTENSION_DISPLAY_NAME)
        )
    );

    void checkAndShowWhatsNew(context, EXTENSION_DISPLAY_NAME);

    context.subscriptions.push(
        lm.registerMcpServerDefinitionProvider('sfmcLanguageMcp', {
            provideMcpServerDefinitions: () => [
                new McpStdioServerDefinition(
                    'Salesforce Marketing Cloud (mcp-server-sfmc)',
                    'npx',
                    ['-y', 'mcp-server-sfmc@latest'],
                    {},
                    'mcp-server-sfmc@latest'
                ),
            ],
        })
    );
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
