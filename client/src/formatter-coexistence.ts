/**
 * Coexistence with the Prettier extension (esbenp.prettier-vscode).
 *
 * The built-in formatter is always registered (see formatter.ts). Which
 * formatter is *active* is decided by VS Code via `editor.defaultFormatter`.
 *
 * Behaviour (workspace-scoped):
 * - For every SFMC language that has **no** `editor.defaultFormatter` in the
 *   **workspace / folder** settings, we silently claim it (write ours). A
 *   user-level *global* default (e.g. esbenp set in User settings) does not
 *   block this — the point is that formatting "just works" out of the box with
 *   no manual Prettier/plugin setup.
 * - We only *prompt* when there is a genuine conflict: at least one SFMC
 *   language already has a workspace/folder `defaultFormatter` pointing at
 *   something other than us (any other formatter — the Prettier extension or
 *   anything else). Then we still claim the unset languages silently and ask
 *   (via a prominent modal dialog) only about the conflicting ones. If nothing
 *   conflicts, we never ask.
 */

import { workspace, window, ConfigurationTarget, ExtensionContext } from 'vscode';
import { FORMATTER_LANGUAGES } from './formatter';

export const EXTENSION_ID = 'joernberkefeld.sfmc-language';
export const ESBENP_ID = 'esbenp.prettier-vscode';

/**
 * Human-readable labels for the SFMC language IDs, used in notifications.
 */
export const LANGUAGE_LABELS: Readonly<Record<string, string>> = {
    ampscript: 'AMPscript',
    ssjs: 'SSJS',
    sfmc: 'SFMC HTML',
    handlebars: 'MCN Handlebars',
    sql: 'SQL',
};

/**
 * Render a list of language IDs as a comma-separated list of friendly labels.
 * @param languageIds - language IDs to label
 * @returns e.g. "AMPscript, SSJS, SQL"
 */
export function formatLanguageList(languageIds: readonly string[]): string {
    return languageIds.map((id) => LANGUAGE_LABELS[id] ?? id).join(', ');
}

/**
Per-workspace memento key recording that the coexistence prompt was answered.
 */
export const FORMATTER_PROMPT_DISMISSED_KEY = 'sfmcLanguageServer.formatterPromptDismissed';

/**
 * Given, per language, the current workspace/folder `editor.defaultFormatter`
 * value (or undefined), partition the languages into the ones we can claim
 * silently and the ones that conflict with another formatter. Pure function for
 * testability.
 *
 * - **free**: no workspace default at all, or it already points at us — safe to
 *   (re-)claim silently.
 * - **conflicting**: a workspace default set to a *different* extension — must
 *   not be overwritten without asking.
 * @param languageIds - candidate language IDs
 * @param currentFormatter - returns the workspace/folder default formatter id, or undefined
 * @returns object with `free` and `conflicting` language-id arrays
 */
export function partitionLanguages(
    languageIds: readonly string[],
    currentFormatter: (languageId: string) => string | undefined
): { free: string[]; conflicting: string[] } {
    const free: string[] = [];
    const conflicting: string[] = [];
    for (const languageId of languageIds) {
        const current = currentFormatter(languageId);
        if (current === undefined || current === EXTENSION_ID) {
            free.push(languageId);
        } else {
            conflicting.push(languageId);
        }
    }
    return { free, conflicting };
}

/**
 * Decide whether the coexistence prompt should be suppressed. Pure function for
 * testability.
 *
 * The prompt is suppressed once answered (tracked via the per-workspace memento
 * or the mirrored `formatterPromptDismissed` setting), **unless** the user has
 * explicitly set `formatterPromptDismissed: false` in workspace/folder settings
 * — an explicit `false` re-enables the prompt and overrides the memento.
 * @param mementoValue - the per-workspace memento value, or undefined if unset
 * @param settingWorkspaceFolderValue - `formatterPromptDismissed` in folder scope
 * @param settingWorkspaceValue - `formatterPromptDismissed` in workspace scope
 * @param settingGlobalValue - `formatterPromptDismissed` in user/global scope
 * @returns true if the prompt should be suppressed
 */
export function isPromptDismissed(
    mementoValue: boolean | undefined,
    settingWorkspaceFolderValue: boolean | undefined,
    settingWorkspaceValue: boolean | undefined,
    settingGlobalValue: boolean | undefined
): boolean {
    const isExplicitlyReEnabled =
        settingWorkspaceFolderValue === false || settingWorkspaceValue === false;
    if (isExplicitlyReEnabled) return false;
    return (
        mementoValue ??
        settingWorkspaceFolderValue ??
        settingWorkspaceValue ??
        settingGlobalValue ??
        false
    );
}

/**
 * The `editor.defaultFormatter` configured for a language in the **workspace or
 * folder** scope only. User-global values are intentionally ignored so that a
 * global esbenp default does not stop us from claiming the language for this
 * workspace.
 * @param languageId - the language to check
 * @returns the workspace/folder default formatter id, or undefined if none
 */
function workspaceDefaultFormatter(languageId: string): string | undefined {
    const inspected = workspace
        .getConfiguration('editor', { languageId })
        .inspect<string>('defaultFormatter');
    return (
        inspected?.workspaceFolderLanguageValue ??
        inspected?.workspaceLanguageValue ??
        inspected?.workspaceFolderValue ??
        inspected?.workspaceValue ??
        undefined
    );
}

/**
 * Set `editor.defaultFormatter` to this extension for the given languages, in
 * workspace settings, using the per-language override section.
 * @param languageIds - languages to claim
 * @returns a promise resolving once all writes complete
 */
async function setDefaultFormatter(languageIds: readonly string[]): Promise<void> {
    for (const languageId of languageIds) {
        await workspace
            .getConfiguration('editor', { languageId })
            .update('defaultFormatter', EXTENSION_ID, ConfigurationTarget.Workspace, true);
    }
}

/**
 * Persist that the coexistence prompt has been answered for this workspace.
 *
 * Persistence lives in the per-workspace **memento**. The
 * `formatterPromptDismissed` **setting** is only a temporary reset lever, so we
 * actively **remove** it from workspace/folder settings here — it must not stay
 * in a git-tracked `.vscode/settings.json`.
 * @param context - the extension context (for the per-workspace memento)
 * @returns a promise resolving once state and config are updated
 */
async function markPromptDismissed(context: ExtensionContext): Promise<void> {
    await context.workspaceState.update(FORMATTER_PROMPT_DISMISSED_KEY, true);
    // Clear the temporary reset setting so it does not linger in a tracked
    // settings file. Passing undefined removes the key. Only touch a scope that
    // actually holds a value — updating the WorkspaceFolder scope throws in a
    // single-folder window, which would otherwise abort the flow.
    const config = workspace.getConfiguration('sfmcLanguageServer');
    const inspected = config.inspect<boolean>('formatterPromptDismissed');
    if (inspected?.workspaceValue !== undefined) {
        await config.update('formatterPromptDismissed', undefined, ConfigurationTarget.Workspace);
    }
    if (inspected?.workspaceFolderValue !== undefined) {
        try {
            await config.update(
                'formatterPromptDismissed',
                undefined,
                ConfigurationTarget.WorkspaceFolder
            );
        } catch {
            // No resource-scoped folder in a single-folder window — ignore.
        }
    }
}

/**
 * Set up the built-in formatter for this workspace:
 *
 * 1. Silently claim every SFMC language that has no conflicting workspace/folder
 *    formatter (so it "just works" with no manual Prettier setup).
 * 2. When one or more languages already point at a different formatter, show a
 *    prominent modal dialog once per workspace asking whether to switch those to
 *    the SFMC formatter too. An explicit `formatterPromptDismissed: false` in
 *    workspace/folder settings re-enables the prompt even after a prior answer.
 * @param context - the extension context
 * @returns a promise resolving once setup completes
 */
export async function maybeSetupFormatter(context: ExtensionContext): Promise<void> {
    const formatterEnabled = workspace
        .getConfiguration('sfmcLanguageServer')
        .get<boolean>('enableFormatter', true);
    if (!formatterEnabled) return;

    const { free, conflicting } = partitionLanguages(
        FORMATTER_LANGUAGES,
        workspaceDefaultFormatter
    );

    // "free" includes languages already set to us; only the ones with no
    // workspace default yet are actually being newly claimed — toast just those.
    const newlyClaimed = free.filter(
        (languageId) => workspaceDefaultFormatter(languageId) === undefined
    );

    // Always claim the languages that are free (unset, or already ours).
    if (free.length > 0) {
        await setDefaultFormatter(free);
    }
    if (newlyClaimed.length > 0) {
        void window.showInformationMessage(
            `SFMC formatter is now formatting ${formatLanguageList(newlyClaimed)}. ` +
                'Change this per language via "editor.defaultFormatter" in .vscode/settings.json.'
        );
    }

    // No genuine conflicts → nothing to ask.
    if (conflicting.length === 0) return;

    // Ask at most once per workspace, unless the user has explicitly re-enabled
    // the prompt by setting `formatterPromptDismissed: false` in their
    // workspace/folder settings. An explicit `false` overrides the memento so
    // that resetting the setting reliably brings the prompt back.
    const inspectedDismissed = workspace
        .getConfiguration('sfmcLanguageServer')
        .inspect<boolean>('formatterPromptDismissed');
    const isDismissed = isPromptDismissed(
        context.workspaceState.get<boolean>(FORMATTER_PROMPT_DISMISSED_KEY),
        inspectedDismissed?.workspaceFolderValue,
        inspectedDismissed?.workspaceValue,
        inspectedDismissed?.globalValue
    );
    if (isDismissed) return;

    const useBuiltIn = 'Use SFMC formatter';
    const keepCurrent = 'Keep current';
    const conflictList = formatLanguageList(conflicting);
    const choice = await window.showInformationMessage(
        'Format SFMC files out of the box?',
        {
            modal: true,
            detail:
                'The SFMC Language Service can format AMPscript, SSJS, SFMC HTML, MCN Handlebars, and SQL ' +
                'with a bundled Prettier + prettier-plugin-sfmc — no manual Prettier or plugin setup needed.\n\n' +
                `You already have another formatter set for: ${conflictList}.\n\n` +
                `"${useBuiltIn}" switches those to the SFMC formatter for this workspace. ` +
                `"${keepCurrent}" leaves them as they are. You can change this any time per language ` +
                'via "editor.defaultFormatter" in .vscode/settings.json.',
        },
        useBuiltIn,
        keepCurrent
    );

    if (choice === useBuiltIn) {
        await setDefaultFormatter(conflicting);
        await markPromptDismissed(context);
        void window.showInformationMessage(
            `${formatLanguageList(conflicting)} ` +
                `${conflicting.length === 1 ? 'has' : 'have'} been switched to the SFMC formatter.`
        );
    } else if (choice === keepCurrent) {
        // Leave the conflicting languages untouched; just remember the decision.
        await markPromptDismissed(context);
        void window.showInformationMessage(
            `${formatLanguageList(conflicting)} will continue to be formatted by your existing formatter.`
        );
    }
    // Dismissed without choosing (Esc / Cancel): do not persist, so we can ask
    // again later.
}
