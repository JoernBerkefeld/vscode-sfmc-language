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
import { SfmcStatusBar } from './status-bar';
import { checkAndShowWhatsNew, showWhatsNewPanel } from './whats-new';
import { registerFormatter } from './formatter';
import { maybeSetupFormatter } from './formatter-coexistence';

// Holder object so the running client can be shared between activate/deactivate
// without a reassigned top-level variable (unicorn/no-top-level-assignment-in-function).
const state: { client: LanguageClient | undefined } = { client: undefined };

const EXTENSION_DISPLAY_NAME = 'SFMC Language Service';

// Per-document trailing debounce for change-driven language detection, keyed by
// document URI string. Only the `onDidChangeTextDocument` path is debounced so
// rapid typing in a large `.ssjs` file does not re-scan on every keystroke.
const pendingDetect = new Map<string, NodeJS.Timeout>();
const DETECT_DEBOUNCE_MS = 250;

/**
 * Schedule a trailing-debounced `detectAndSwitchLanguage` for a document. A
 * newer change resets the timer so detection runs once typing settles.
 * @param document - the changed document to (re-)classify
 */
function scheduleDetect(document: TextDocument): void {
    const key = document.uri.toString();
    const existing = pendingDetect.get(key);
    if (existing) clearTimeout(existing);
    pendingDetect.set(
        key,
        setTimeout(() => {
            pendingDetect.delete(key);
            detectAndSwitchLanguage(document);
        }, DETECT_DEBOUNCE_MS)
    );
}

export const CONFLICTING_EXTENSIONS = [
    { id: 'xnerd.ampscript-language', name: 'AMPscript (xnerd)' },
    { id: 'FiB.beautyAmp', name: 'beautyAmp' },
];

export const SUPPRESS_KEY = 'suppressConflictWarning';

/**
 * Warn the user when a known conflicting extension is installed alongside this one.
 * @param context - the extension context used to persist the suppression flag
 * @returns a promise that resolves once any warning has been handled
 */
async function checkConflictingExtensions(context: ExtensionContext): Promise<void> {
    const settingSuppressed = workspace
        .getConfiguration('sfmcLanguageServer')
        .get<boolean>('suppressConflictWarning', false);
    if (settingSuppressed || context.globalState.get<boolean>(SUPPRESS_KEY)) {
        return;
    }

    const active = CONFLICTING_EXTENSIONS.filter(
        (extension) => extensions.getExtension(extension.id)?.isActive
    ).map((extension) => extension.name);

    if (active.length === 0) return;

    const message =
        `SFMC Language Service: conflicting extension(s) detected — ${active.join(', ')}. ` +
        'These can cause unpredictable formatting, syntax highlighting, and IntelliSense in AMPscript/HTML files. ' +
        'Consider disabling them.';

    const selection = await window.showWarningMessage(
        message,
        'Open Extensions',
        "Don't Show Again"
    );
    if (selection === 'Open Extensions') {
        void commands.executeCommand('workbench.extensions.action.showInstalledExtensions');
    } else if (selection === "Don't Show Again") {
        void context.globalState.update(SUPPRESS_KEY, true);
    }
}

const AMPSCRIPT_MARKERS: (string | RegExp)[] = [
    '%%[',
    '%%=',
    /<script\s[^>]*language\s*=\s*["']ampscript["']/i,
    /<script\b[^>]*\brunat\s*=\s*["']server["']/i,
];

// MCN Handlebars markers. `{!$...}` data bindings are unambiguously SFMC, so
// they switch the document regardless of platform. A bare `{{...}}` mustache is
// shared by many template engines (Vue, Angular, Mustache, Jekyll), so it only
// claims the document when the user targets Marketing Cloud Next — Handlebars is
// MCN-only and there is no benefit to hijacking `{{...}}` HTML under Engagement.
const HANDLEBARS_BINDING_MARKER = /\{!\$[A-Za-z0-9_.]/;
const HANDLEBARS_MUSTACHE_MARKER = /\{\{[#/!{>]?\s*[A-Za-z@]/;

/**
 * Test whether the text contains any of the given string or RegExp markers.
 * @param text - the text to search
 * @param markers - string or RegExp markers to look for
 * @returns true if any marker matches
 */
function hasAnyMarker(text: string, markers: (string | RegExp)[]): boolean {
    return markers.some((marker) =>
        typeof marker === 'string' ? text.includes(marker) : marker.test(text)
    );
}

/**
 * Whether the configured target platform is Marketing Cloud Next.
 * @returns true when `sfmcLanguageServer.targetPlatform` is `next`
 */
function isMcnNextTarget(): boolean {
    return (
        workspace
            .getConfiguration('sfmcLanguageServer')
            .get<string>('targetPlatform', 'engagement') === 'next'
    );
}

/**
 * How a `.ssjs` file should be interpreted, read resource-scoped so a workspace
 * can override it per folder.
 * @param document - the document whose URI scopes the config read
 * @returns the configured `sfmcLanguageServer.ssjsFileMode` (default `javascript`)
 */
function getSsjsFileMode(document: TextDocument): 'javascript' | 'auto' | 'sfmc' {
    return workspace
        .getConfiguration('sfmcLanguageServer', document.uri)
        .get<'javascript' | 'auto' | 'sfmc'>('ssjsFileMode', 'javascript');
}

/**
 * Switch a document's language ID to the appropriate SFMC dialect based on its
 * path and content (SSJS files, AMPscript/SSJS HTML, and MCN Handlebars).
 * @param document - the text document to inspect and possibly re-language
 */
function detectAndSwitchLanguage(document: TextDocument): void {
    // Route .ssjs files by the ssjsFileMode setting. `javascript` (default) and
    // `sfmc` map the extension to a fixed id with no content scan; only `auto`
    // reads the text to detect a <script runat="server">/AMPscript wrapper (SSJS
    // Manager style) and route those to the region-extracting `sfmc` id.
    if (document.uri.path.toLowerCase().endsWith('.ssjs')) {
        const mode = getSsjsFileMode(document); // cached config read, no getText()
        let targetId: 'ssjs' | 'sfmc';
        if (mode === 'javascript') {
            targetId = 'ssjs';
        } else if (mode === 'sfmc') {
            targetId = 'sfmc';
        } else {
            targetId = hasAnyMarker(document.getText(), AMPSCRIPT_MARKERS) ? 'sfmc' : 'ssjs';
        }
        if (document.languageId !== targetId) {
            languages.setTextDocumentLanguage(document, targetId);
        }
        return;
    }

    if (document.languageId !== 'html') return;
    const text = document.getText();

    // Switch to sfmc for any HTML containing SFMC content (AMPscript markers or SSJS blocks).
    if (hasAnyMarker(text, AMPSCRIPT_MARKERS)) {
        languages.setTextDocumentLanguage(document, 'sfmc');
        return;
    }

    // MCN Handlebars: `{!$...}` bindings always, `{{...}}` mustaches only under
    // the Marketing Cloud Next target (see marker comments above).
    if (
        HANDLEBARS_BINDING_MARKER.test(text) ||
        (isMcnNextTarget() && HANDLEBARS_MUSTACHE_MARKER.test(text))
    ) {
        languages.setTextDocumentLanguage(document, 'sfmc');
        return;
    }
}

/**
 * Activate the extension: start the language client, wire up language detection,
 * and register the What's New and conflict-detection features.
 * @param context - the VS Code extension context
 */
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
            // .hbs files use VS Code's built-in `handlebars` language (HTML +
            // Handlebars). We attach the LSP so MCN Handlebars intelligence works
            // there without hijacking the native language id.
            { scheme: 'file', language: 'handlebars' },
            { scheme: 'untitled', language: 'handlebars' },
        ],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher(
                '**/*.{ampscript,amp,ssjs,hbs,handlebars}'
            ),
        },
    };

    const client = new LanguageClient(
        'sfmcLanguageServer',
        'SFMC Language Server',
        serverOptions,
        clientOptions
    );
    state.client = client;

    client.start();

    new SfmcStatusBar(context, client);

    // Detect AMPscript in already-open HTML documents
    for (const document of workspace.textDocuments) {
        detectAndSwitchLanguage(document);
    }

    // Detect SFMC content in HTML documents: on open (immediate) and on content
    // change (debounced, e.g. while typing/pasting). Closing a document clears
    // any pending debounce timer so it never fires against a gone document.
    context.subscriptions.push(
        workspace.onDidOpenTextDocument(detectAndSwitchLanguage),
        workspace.onDidChangeTextDocument((event) => {
            scheduleDetect(event.document);
        }),
        workspace.onDidCloseTextDocument((document) => {
            const key = document.uri.toString();
            const pending = pendingDetect.get(key);
            if (pending) {
                clearTimeout(pending);
                pendingDetect.delete(key);
            }
        }),
        // Re-classify open .ssjs documents immediately when ssjsFileMode changes,
        // so switching the mode takes effect without reopening files.
        workspace.onDidChangeConfiguration((event) => {
            if (!event.affectsConfiguration('sfmcLanguageServer.ssjsFileMode')) return;
            for (const document of workspace.textDocuments) {
                if (document.uri.path.toLowerCase().endsWith('.ssjs')) {
                    detectAndSwitchLanguage(document);
                }
            }
        })
    );

    void checkConflictingExtensions(context);

    // Register the built-in Prettier formatter and negotiate coexistence with
    // the Prettier extension (esbenp.prettier-vscode).
    registerFormatter(context);
    void maybeSetupFormatter(context);

    context.subscriptions.push(
        commands.registerCommand('sfmc-language.showWhatsNew', () =>
            showWhatsNewPanel(context, EXTENSION_DISPLAY_NAME)
        )
    );

    void checkAndShowWhatsNew(context, EXTENSION_DISPLAY_NAME);

    // lm.registerMcpServerDefinitionProvider and McpStdioServerDefinition require VS Code ≥1.99.
    // Guard the call so the core language service activates on older hosts (e.g. older Cursor).
    if (typeof lm?.registerMcpServerDefinitionProvider === 'function') {
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
}

/**
 * Deactivate the extension by stopping the language client, if running.
 * @returns a promise that resolves when the client has stopped, or undefined
 */
export function deactivate(): Thenable<void> | undefined {
    for (const timer of pendingDetect.values()) {
        clearTimeout(timer);
    }
    pendingDetect.clear();
    if (!state.client) {
        return undefined;
    }
    return state.client.stop();
}
