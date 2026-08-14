/**
 * Built-in Prettier formatter for SFMC languages.
 *
 * Uses a bundled copy of `prettier` and `prettier-plugin-sfmc` (both inlined by
 * esbuild). The plugin is passed as an imported object so there is a single
 * Prettier instance and no on-disk plugin resolution.
 *
 * A workspace Prettier config (.prettierrc*, .editorconfig, package.json
 * "prettier") overrides the standard defaults, but the bundled plugin is always
 * injected and the bundled Prettier version is always used. A workspace
 * `.prettierignore` is honored. For full control over the Prettier or plugin
 * version, users should use the Prettier extension (esbenp.prettier-vscode).
 */

import path from 'node:path';
import fs from 'node:fs';
import * as prettier from 'prettier';
import * as sfmcPlugin from 'prettier-plugin-sfmc';
import {
    languages,
    workspace,
    window,
    Range,
    TextEdit,
    ExtensionContext,
    OutputChannel,
    TextDocument,
    DocumentFormattingEditProvider,
    Disposable,
} from 'vscode';

/**
 * Human-facing name of the formatter's dedicated Output channel. Mirrors the
 * Prettier extension's own "Prettier" channel so the diagnostics feel familiar.
 */
export const OUTPUT_CHANNEL_NAME = 'SFMC Prettier Formatter';

/**
Lazily-created Output channel, so nothing is shown until the first format.
 */
const channelHolder: { channel: OutputChannel | undefined } = { channel: undefined };

/**
 * Get (creating on first use) the formatter's Output channel.
 * @returns the shared Output channel
 */
function getChannel(): OutputChannel {
    channelHolder.channel ??= window.createOutputChannel(OUTPUT_CHANNEL_NAME);
    return channelHolder.channel;
}

/**
 * Build the `["LEVEL" - h:mm:ss AM] ` log prefix, matching the Prettier
 * extension's line format.
 * @param level - the log level label (e.g. INFO, ERROR)
 * @returns the formatted prefix string
 */
export function logPrefix(level: 'INFO' | 'ERROR'): string {
    const time = new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });
    return `["${level}" - ${time}] `;
}

/**
 * Append an INFO line to the Output channel.
 * @param message - the message to log
 */
function logInfo(message: string): void {
    getChannel().appendLine(`${logPrefix('INFO')}${message}`);
}

/**
 * Append an ERROR line to the Output channel.
 * @param message - the message to log
 */
function logError(message: string): void {
    getChannel().appendLine(`${logPrefix('ERROR')}${message}`);
}

/**
 * The standard Prettier config applied when no workspace config overrides it.
 * Mirrors prettier-plugin-sfmc's own defaults so behaviour matches the
 * documented `{ "plugins": ["prettier-plugin-sfmc"] }` setup.
 */
export const STD_CONFIG: prettier.Options = {
    useTabs: false,
    tabWidth: 4,
    printWidth: 100,
    singleQuote: true,
    trailingComma: 'none',
};

/**
 * VS Code language IDs this formatter handles, mapped to a synthetic file
 * extension so Prettier selects the matching plugin parser. Plain `html` is
 * intentionally absent so ordinary HTML files are left to other formatters.
 */
export const LANGUAGE_ID_TO_FILEPATH: Readonly<Record<string, string>> = {
    ampscript: 'x.ampscript',
    ssjs: 'x.ssjs',
    sfmc: 'x.html',
    handlebars: 'x.hbs',
    sql: 'x.sql',
};

/**
Language IDs the formatter registers for.
 */
export const FORMATTER_LANGUAGES = Object.keys(LANGUAGE_ID_TO_FILEPATH);

/**
 * Resolve the nearest `.prettierignore` for a document by walking up from the
 * file's directory (like the Prettier CLI). The search stops at the workspace
 * folder root when the file is inside one, otherwise at the filesystem root.
 * @param document - the document being formatted
 * @returns absolute path to `.prettierignore`, or undefined if none exists
 */
function resolveIgnorePath(document: TextDocument): string | undefined {
    const filePath = document.uri.fsPath;
    if (!filePath) return undefined;
    const stopAt = workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;

    let directory = path.dirname(filePath);
    for (;;) {
        const candidate = path.join(directory, '.prettierignore');
        if (fs.existsSync(candidate)) return candidate;
        if (stopAt && path.resolve(directory) === path.resolve(stopAt)) break;
        const parent = path.dirname(directory);
        if (parent === directory) break;
        directory = parent;
    }
    return undefined;
}

/**
 * Build the effective Prettier options for a file: start from STD_CONFIG, merge
 * any resolved workspace config on top, then force the bundled plugin (dropping
 * any user-specified `plugins` entry so a second Prettier is never loaded).
 * Also reports the discovered config file path (for logging), so callers do not
 * need a second config lookup.
 * @param filePath - real file path used to resolve workspace config
 * @returns merged options (with the bundled plugin) and the config path, if any
 */
export async function resolveOptions(
    filePath: string
): Promise<{ options: prettier.Options; configPath: string | undefined }> {
    let resolved: prettier.Options | undefined;
    let configPath: string | undefined;
    try {
        configPath = (await prettier.resolveConfigFile(filePath)) ?? undefined;
        resolved = (await prettier.resolveConfig(filePath, { editorconfig: true })) ?? undefined;
    } catch {
        // Malformed config: fall back to the standard defaults.
        resolved = undefined;
    }
    return {
        options: {
            ...STD_CONFIG,
            ...resolved,
            // Always use our bundled plugin object; never resolve a workspace plugin.
            plugins: [sfmcPlugin],
        },
        configPath,
    };
}

/**
 * Serialize the effective Prettier options for logging, replacing the bundled
 * plugin object (non-serializable, noisy) with a stable label.
 * @param options - the effective Prettier options
 * @returns a single-line JSON-ish string
 */
export function stringifyOptions(options: prettier.Options): string {
    const printable = { ...options, plugins: ['prettier-plugin-sfmc'] };
    return JSON.stringify(printable);
}

/**
 * Whether Prettier's ignore rules mark this file as ignored.
 * @param document - the document being formatted
 * @returns true if the file is covered by a workspace `.prettierignore`
 */
export async function isIgnored(document: TextDocument): Promise<boolean> {
    const ignorePath = resolveIgnorePath(document);
    if (!ignorePath) return false;
    try {
        const info = await prettier.getFileInfo(document.uri.fsPath, {
            ignorePath,
            plugins: [sfmcPlugin as unknown as string],
            resolveConfig: false,
        });
        return info.ignored;
    } catch {
        return false;
    }
}

/**
 * Format a document's text with the bundled Prettier + plugin. Returns the
 * formatted string, or undefined when the file is ignored, the language is
 * unsupported, or Prettier throws (e.g. a syntax error).
 * @param document - the document to format
 * @returns the formatted text, or undefined if no formatting was produced
 */
export async function formatSfmcDocument(document: TextDocument): Promise<string | undefined> {
    const syntheticName = LANGUAGE_ID_TO_FILEPATH[document.languageId];
    if (!syntheticName) {
        logInfo(
            `Skipping ${document.uri.toString()}: unsupported language '${document.languageId}'`
        );
        return undefined;
    }

    const start = Date.now();
    logInfo(`Formatting ${document.uri.toString()}`);

    const ignorePath = resolveIgnorePath(document);
    if (ignorePath) {
        logInfo(`Using ignore file at '${ignorePath}'`);
    }

    if (await isIgnored(document)) {
        logInfo('File is ignored via .prettierignore; skipping');
        return undefined;
    }

    const { options, configPath } = await resolveOptions(document.uri.fsPath);
    logInfo(
        configPath
            ? `Using config file at '${configPath}'`
            : 'No local config found; using bundled standard config'
    );

    // Use a synthetic filepath (right extension) so the correct plugin parser is
    // chosen regardless of the real file name / language mapping.
    const filepath = path.join(path.dirname(document.uri.fsPath || syntheticName), syntheticName);

    logInfo(`Prettier Options: ${stringifyOptions({ ...options, filepath })}`);

    try {
        const result = await prettier.format(document.getText(), { ...options, filepath });
        logInfo(`Formatting completed in ${Date.now() - start}ms.`);
        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError(message);
        void window.showErrorMessage(`SFMC formatter: ${message}`);
        return undefined;
    }
}

/**
Clear Prettier's cached config/ignore state after a relevant file changes.
 */
function clearCache(): void {
    prettier.clearConfigCache();
}

/**
 * DocumentFormattingEditProvider that formats the whole document.
 */
const sfmcFormattingProvider: DocumentFormattingEditProvider = {
    async provideDocumentFormattingEdits(document: TextDocument): Promise<TextEdit[]> {
        if (
            !workspace.getConfiguration('sfmcLanguageServer').get<boolean>('enableFormatter', true)
        ) {
            return [];
        }
        const formatted = await formatSfmcDocument(document);
        if (formatted === undefined || formatted === document.getText()) return [];
        const fullRange = new Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );
        // eslint-disable-next-line unicorn/no-unsafe-string-replacement -- this is vscode TextEdit.replace, not String#replace
        return [TextEdit.replace(fullRange, formatted)];
    },
};

/**
 * Register the formatter for all SFMC languages and clear Prettier's config
 * cache whenever a `.prettierrc*` / `.prettierignore` / `.editorconfig` changes.
 * @param context - the extension context whose subscriptions receive the disposables
 */
export function registerFormatter(context: ExtensionContext): void {
    const disposables: Disposable[] = FORMATTER_LANGUAGES.map((languageId) =>
        languages.registerDocumentFormattingEditProvider(
            [
                { scheme: 'file', language: languageId },
                { scheme: 'untitled', language: languageId },
            ],
            sfmcFormattingProvider
        )
    );

    // Editor integrations must clear Prettier's cached config when files change.
    const watcher = workspace.createFileSystemWatcher(
        '**/{.prettierrc,.prettierrc.*,prettier.config.*,.prettierignore,.editorconfig}'
    );
    disposables.push(
        watcher,
        watcher.onDidChange(clearCache),
        watcher.onDidCreate(clearCache),
        watcher.onDidDelete(clearCache),
        { dispose: () => channelHolder.channel?.dispose() }
    );

    context.subscriptions.push(...disposables);
}
