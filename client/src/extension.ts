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
import { TelemetryReporter, detectEcosystem } from './telemetry';

export { registerFormatter } from './formatter';
export { maybeSetupFormatter } from './formatter-coexistence';
export { detectEcosystem } from './telemetry';

interface ExtensionReporter {
    track: TelemetryReporter['track'];
    dispose: TelemetryReporter['dispose'];
    disposeAsync: TelemetryReporter['disposeAsync'];
}

interface ExtensionClient {
    start: () => unknown;
    stop: () => Promise<void>;
}

/**
 * Narrow production dependency seam used by activation integration tests.
 * Production `activate()` uses {@link DEFAULT_ACTIVATION_DEPENDENCIES}; tests
 * override individual factories without duplicating the activation body.
 */
export interface ActivationDependencies {
    createReporter: (context: ExtensionContext) => ExtensionReporter;
    createClient: (
        id: string,
        name: string,
        serverOptions: ServerOptions,
        clientOptions: LanguageClientOptions
    ) => ExtensionClient;
    createStatusBar: (context: ExtensionContext, client: ExtensionClient) => void;
    detectEcosystem: (selfId: string) => Record<string, boolean>;
    getExtension: typeof extensions.getExtension;
    registerFormatter: typeof registerFormatter;
    setupFormatter: typeof maybeSetupFormatter;
    checkWhatsNew: typeof checkAndShowWhatsNew;
}

/**
 * Production factories used when VS Code activates the extension normally.
 */
export const DEFAULT_ACTIVATION_DEPENDENCIES: ActivationDependencies = {
    createReporter: (context) =>
        new TelemetryReporter({
            extensionName: TELEMETRY_EXTENSION_NAME,
            extensionVersion: context.extension.packageJSON.version as string,
        }),
    createClient: (id, name, serverOptions, clientOptions) =>
        new LanguageClient(id, name, serverOptions, clientOptions),
    createStatusBar: (context, client) => {
        new SfmcStatusBar(context, client as LanguageClient);
    },
    detectEcosystem,
    getExtension: (id) => extensions.getExtension(id),
    registerFormatter,
    setupFormatter: maybeSetupFormatter,
    checkWhatsNew: checkAndShowWhatsNew,
};

// Holder object so the running client + telemetry reporter can be shared between
// activate/deactivate without a reassigned top-level variable
// (unicorn/no-top-level-assignment-in-function).
const state: { client: ExtensionClient | undefined; reporter: ExtensionReporter | undefined } = {
    client: undefined,
    reporter: undefined,
};

/**
 * Capture the live client/reporter so isolated activation tests can restore
 * the host extension after exercising the production `activate()` path.
 * @returns the current activation client and reporter
 */
export function snapshotActivationState(): {
    client: ExtensionClient | undefined;
    reporter: ExtensionReporter | undefined;
} {
    return { client: state.client, reporter: state.reporter };
}

/**
 * Restore a previously captured activation client/reporter pair.
 * @param snapshot - value returned by {@link snapshotActivationState}
 * @param snapshot.client - language client captured by the snapshot
 * @param snapshot.reporter - telemetry reporter captured by the snapshot
 */
export function restoreActivationState(snapshot: {
    client: ExtensionClient | undefined;
    reporter: ExtensionReporter | undefined;
}): void {
    state.client = snapshot.client;
    state.reporter = snapshot.reporter;
}

const EXTENSION_DISPLAY_NAME = 'SFMC Language Service';

/**
Short extension name reported as the telemetry `extension` common property.
 */
const TELEMETRY_EXTENSION_NAME = 'sfmc-language';

// Resolved language ids already reported via `language.detected` this session.
const reportedLanguages = new Set<string>();

/**
 * Build the consent-aware session-deduplicated language reporting callback used
 * by both native-language and content-auto-detection call sites.
 * @param seen - the session set of accepted language ids
 * @param isAccepted - callback that returns true only when telemetry accepted the event
 * @returns a callback that reports each accepted language id once
 */
export function createLanguageDetectedReporter(
    seen: Set<string>,
    isAccepted: (languageId: string) => boolean
): (languageId: string) => void {
    return (languageId: string): void => {
        if (seen.has(languageId)) return;
        if (isAccepted(languageId)) seen.add(languageId);
    };
}

/**
 * Clear language telemetry deduplication at an activation-session boundary.
 */
export function resetReportedLanguages(): void {
    reportedLanguages.clear();
}

const reportLanguageDetected = createLanguageDetectedReporter(
    reportedLanguages,
    (languageId) => state.reporter?.track('language.detected', { languageId }) ?? false
);

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
 * @param getExtension - extension lookup used so tests can inject active conflicts
 * @returns a promise that resolves once any warning has been handled
 */
async function checkConflictingExtensions(
    context: ExtensionContext,
    getExtension: typeof extensions.getExtension
): Promise<void> {
    const activeConflicts = CONFLICTING_EXTENSIONS.filter(
        (extension) => getExtension(extension.id)?.isActive
    );
    for (const extension of activeConflicts) {
        state.reporter?.track('conflict.detected', { extensionId: extension.id });
    }

    const settingSuppressed = workspace
        .getConfiguration('sfmcLanguageServer')
        .get<boolean>('suppressConflictWarning', false);
    if (settingSuppressed || context.globalState.get<boolean>(SUPPRESS_KEY)) {
        return;
    }

    const active = activeConflicts.map((extension) => extension.name);
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
 * @param reportDetected - callback receiving the resolved language id
 */
export function detectAndSwitchLanguage(
    document: TextDocument,
    reportDetected: (languageId: string) => void = reportLanguageDetected
): void {
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
        reportDetected(targetId);
        if (document.languageId !== targetId) {
            languages.setTextDocumentLanguage(document, targetId);
        }
        return;
    }

    if (document.languageId !== 'html') {
        if (['ampscript', 'ssjs', 'sfmc', 'handlebars'].includes(document.languageId)) {
            reportDetected(document.languageId);
        }
        return;
    }
    const text = document.getText();

    // Switch to sfmc for any HTML containing SFMC content (AMPscript markers or SSJS blocks).
    if (hasAnyMarker(text, AMPSCRIPT_MARKERS)) {
        reportDetected('sfmc');
        languages.setTextDocumentLanguage(document, 'sfmc');
        return;
    }

    // MCN Handlebars: `{!$...}` bindings always, `{{...}}` mustaches only under
    // the Marketing Cloud Next target (see marker comments above).
    if (
        HANDLEBARS_BINDING_MARKER.test(text) ||
        (isMcnNextTarget() && HANDLEBARS_MUSTACHE_MARKER.test(text))
    ) {
        reportDetected('sfmc');
        languages.setTextDocumentLanguage(document, 'sfmc');
        return;
    }
}

/**
 * Register a command, ignoring the duplicate-id error that isolated
 * activation tests hit because the host extension already registered it.
 * @param command - command identifier
 * @param callback - command handler
 * @returns a disposable for the registration, or a no-op disposable
 */
function registerCommandOnce(command: string, callback: () => void): { dispose: () => void } {
    try {
        return commands.registerCommand(command, callback);
    } catch {
        return { dispose: () => {} };
    }
}

/**
 * Activate the extension: start the language client, wire up language detection,
 * and register the What's New and conflict-detection features.
 * @param context - the VS Code extension context
 * @param [dependencies] - optional factory overrides for isolated activation tests
 */
export function activate(
    context: ExtensionContext,
    dependencies: ActivationDependencies = DEFAULT_ACTIVATION_DEPENDENCIES
) {
    resetReportedLanguages();
    // Create the anonymous telemetry reporter first so later activation steps
    // (conflict check, formatter coexistence, language detection) can report
    // through it. It is gated by VS Code's global telemetry setting and pushed
    // to subscriptions so deactivate flushes/disposes it.
    const reporter = dependencies.createReporter(context);
    state.reporter = reporter;
    context.subscriptions.push(reporter);

    // One-shot activation event: target platform, .ssjs interpretation mode, and
    // passive ecosystem / co-installation booleans.
    reporter.track('extension.activated', {
        targetPlatform: isMcnNextTarget() ? 'next' : 'engagement',
        ssjsFileMode: workspace
            .getConfiguration('sfmcLanguageServer')
            .get<string>('ssjsFileMode', 'javascript'),
        ...dependencies.detectEcosystem(context.extension.id),
    });

    const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
        },
    };

    const fileEvents = workspace.createFileSystemWatcher(
        '**/*.{ampscript,amp,ssjs,hbs,handlebars}'
    );
    context.subscriptions.push(fileEvents);

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
            fileEvents,
        },
    };

    const client = dependencies.createClient(
        'sfmcLanguageServer',
        'SFMC Language Server',
        serverOptions,
        clientOptions
    );
    state.client = client;

    client.start();

    dependencies.createStatusBar(context, client);

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

    void checkConflictingExtensions(context, dependencies.getExtension);

    // Register the built-in Prettier formatter and negotiate coexistence with
    // the Prettier extension (esbenp.prettier-vscode).
    dependencies.registerFormatter(context);
    void Promise.resolve(
        dependencies.setupFormatter(context, (outcome) => {
            reporter.track('formatter.coexistence.resolved', { outcome });
        })
    ).catch(() => {
        // The resolver reports its `failed` outcome before rethrowing.
    });

    context.subscriptions.push(
        registerCommandOnce('sfmc-language.showWhatsNew', () =>
            showWhatsNewPanel(context, EXTENSION_DISPLAY_NAME)
        )
    );

    void dependencies.checkWhatsNew(context, EXTENSION_DISPLAY_NAME);

    // lm.registerMcpServerDefinitionProvider and McpStdioServerDefinition require VS Code ≥1.99.
    // Guard the call so the core language service activates on older hosts (e.g. older Cursor).
    if (typeof lm?.registerMcpServerDefinitionProvider === 'function') {
        try {
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
        } catch {
            // Already registered when isolated activation tests re-enter activate().
        }
    }
}

/**
 * Deactivate the extension by stopping the language client, if running.
 * @returns a promise that resolves when the client has stopped, or undefined
 */
export async function deactivate(): Promise<void> {
    for (const timer of pendingDetect.values()) clearTimeout(timer);
    pendingDetect.clear();
    resetReportedLanguages();

    const reporter = state.reporter;
    const client = state.client;
    state.reporter = undefined;
    state.client = undefined;

    await stopExtensionServices(reporter, client);
}

/**
 * Await the telemetry final drain and language-client stop together.
 * @param reporter - the active telemetry reporter, if activation created one
 * @param client - the active language client, if activation started one
 * @returns a promise settled once both shutdown operations finish
 */
export async function stopExtensionServices(
    reporter: Pick<TelemetryReporter, 'disposeAsync'> | undefined,
    client: Pick<ExtensionClient, 'stop'> | undefined
): Promise<void> {
    await Promise.allSettled([
        reporter?.disposeAsync() ?? Promise.resolve(),
        client?.stop() ?? Promise.resolve(),
    ]);
}
