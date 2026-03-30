/**
 * SFMC Language Client
 * Activates the language server for AMPscript, SSJS, and GTL files.
 */

import * as path from 'node:path';
import { workspace, languages, ExtensionContext, TextDocument } from 'vscode';

import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient;

const AMPSCRIPT_MARKERS: (string | RegExp)[] = [
    '%%[',
    '%%=',
    /<script\s[^>]*language\s*=\s*["']ampscript["']/i,
];

/** Matches any <script runat="server"> tag, regardless of language attribute. */
const SSJS_MARKER = /<script\s[^>]*runat\s*=\s*["']server["']/i;

function matchesAny(text: string, markers: (string | RegExp)[]): boolean {
    return markers.some((marker) =>
        typeof marker === 'string' ? text.includes(marker) : marker.test(text),
    );
}

function detectAndSwitchLanguage(doc: TextDocument): void {
    if (doc.languageId !== 'html') return;
    const text = doc.getText();

    // AMPscript takes priority: its grammar embeds HTML (and thus handles SSJS script blocks too).
    if (matchesAny(text, AMPSCRIPT_MARKERS)) {
        languages.setTextDocumentLanguage(doc, 'ampscript');
        return;
    }

    // Fall back to SSJS when only server-side script blocks are present.
    if (SSJS_MARKER.test(text)) {
        languages.setTextDocumentLanguage(doc, 'ssjs');
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
        clientOptions,
    );

    client.start();

    // Detect AMPscript in already-open HTML documents
    for (const doc of workspace.textDocuments) {
        detectAndSwitchLanguage(doc);
    }

    // Detect AMPscript in HTML documents opened after activation
    context.subscriptions.push(workspace.onDidOpenTextDocument(detectAndSwitchLanguage));
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
