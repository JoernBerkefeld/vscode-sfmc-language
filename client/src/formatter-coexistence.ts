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
 * - **Admin lever:** an explicit `sfmcLanguageServer.formatterPromptDismissed:
 *   true` in committed workspace/folder settings (or user-global) fully opts out
 *   — the extension neither writes `editor.defaultFormatter` nor prompts, so a
 *   team can pin their own formatter choice for everyone. The extension never
 *   removes an explicit `true`; it only clears the transient reset value it
 *   itself may have written when a user answers the modal.
 *
 * On every activation a single status line is written to the "SFMC Prettier
 * Formatter" Output channel describing the current takeover state (prompt
 * answered / suppressed, conflicts, and what was claimed).
 */

import { workspace, window, ConfigurationTarget, ExtensionContext } from 'vscode';
import { FailureTelemetryProperties, sanitizeFailureTelemetry } from './error-telemetry';
import { FORMATTER_LANGUAGES, logInfo } from './formatter';

/**
 * The mutually-exclusive outcomes of the formatter-coexistence resolution,
 * reported once per activation as the `formatter.coexistence.resolved` event's
 * `outcome` property.
 * - `disabled` — the built-in formatter is disabled.
 * - `suppressed` — admin lever (`formatterPromptDismissed: true`) left config untouched.
 * - `no-conflict` — free languages claimed; nothing conflicted, so no prompt.
 * - `already-answered` — a conflict existed but the prompt was already dismissed.
 * - `switched` — the user switched the conflicting languages to the SFMC formatter.
 * - `kept` — the user kept their existing formatter for the conflicting languages.
 * - `cancelled` — the user dismissed the modal without choosing.
 * - `failed` — an exception during setup. Extra sanitized properties
 *   (`errorCategory`, optional `errorName` / `errorCode`) distinguish the
 *   stage; never a raw message, stack, or path.
 */
export type CoexistenceOutcome =
    | 'disabled'
    | 'suppressed'
    | 'no-conflict'
    | 'already-answered'
    | 'switched'
    | 'kept'
    | 'cancelled'
    | 'failed';

/**
 * Closed-enum stage recorded as `errorCategory` on a `failed` outcome.
 */
export type FormatterFailureStage =
    | 'clearStaleFormatter'
    | 'claimLanguages'
    | 'showModal'
    | 'settingsWrite'
    | 'persistDecision'
    | 'noWritableFolder'
    | 'unknown';

const WRITE_FAILURE_STAGES = new Set<FormatterFailureStage>([
    'clearStaleFormatter',
    'claimLanguages',
    'settingsWrite',
    'persistDecision',
]);

/**
 * Maps a thrown-stage to the category we send. Write stages without a
 * workspace folder collapse to `noWritableFolder` so we do not need the
 * (often path-bearing) exception message.
 * @param stage - last coexistence step that ran
 * @param hasWritableWorkspace - whether `workspace.workspaceFolders` is non-empty
 * @returns a closed `errorCategory` value
 */
export function resolveFailureCategory(
    stage: FormatterFailureStage,
    hasWritableWorkspace: boolean
): FormatterFailureStage {
    if (!hasWritableWorkspace && WRITE_FAILURE_STAGES.has(stage)) {
        return 'noWritableFolder';
    }
    return stage;
}

/**
 * Narrow dependency overrides used to exercise the real coexistence flow without
 * mutating a developer's editor settings in integration tests.
 */
export interface CoexistenceTestOverrides {
    formatterEnabled?: boolean;
    free?: string[];
    conflicting?: string[];
    newlyClaimed?: string[];
    isMementoDismissed?: boolean;
    isSuppressed?: boolean;
    isDismissed?: boolean;
    choice?: 'Use SFMC formatter' | 'Keep current' | undefined;
    showModal?: () => Promise<'Use SFMC formatter' | 'Keep current' | undefined>;
    clearStaleFormatter?: () => Promise<void>;
    setFormatter?: (languageIds: readonly string[]) => Promise<void>;
    markDismissed?: () => Promise<void>;
}

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
 * Decide whether the extension should **suppress all takeover actions** (both
 * the silent auto-claim of unset languages and the conflict prompt). Pure
 * function for testability.
 *
 * This is the admin lever: an explicit `formatterPromptDismissed: true` in
 * committed workspace/folder settings (or a user-global `true`) means "leave my
 * formatter configuration alone" — the extension neither writes
 * `editor.defaultFormatter` nor asks. It is deliberately distinct from the
 * per-workspace memento (which records that a user *answered* the modal, but
 * still allows newly added languages to be claimed on later loads).
 * @param settingWorkspaceFolderValue - `formatterPromptDismissed` in folder scope
 * @param settingWorkspaceValue - `formatterPromptDismissed` in workspace scope
 * @param settingGlobalValue - `formatterPromptDismissed` in user/global scope
 * @returns true if all takeover actions should be skipped
 */
export function isAutoClaimSuppressed(
    settingWorkspaceFolderValue: boolean | undefined,
    settingWorkspaceValue: boolean | undefined,
    settingGlobalValue: boolean | undefined
): boolean {
    // An explicit false anywhere means "please do ask" — never suppress.
    if (
        settingWorkspaceFolderValue === false ||
        settingWorkspaceValue === false ||
        settingGlobalValue === false
    ) {
        return false;
    }
    return (
        settingWorkspaceFolderValue === true ||
        settingWorkspaceValue === true ||
        settingGlobalValue === true
    );
}

/**
 * Describe the prompt state for the status line.
 * @param isMementoDismissed - whether the per-workspace memento marks the prompt answered
 * @param isAutoClaimSuppressed - whether the admin lever suppresses all takeover
 * @returns a short human-readable phrase
 */
function describePromptState(isMementoDismissed: boolean, isAutoClaimSuppressed: boolean): string {
    if (isAutoClaimSuppressed) return 'suppressed (formatterPromptDismissed=true)';
    if (isMementoDismissed) return 'already answered for this workspace (memento)';
    return 'not yet answered';
}

/**
 * Describe what the extension claimed (or why it did not) for the status line.
 * @param isAutoClaimSuppressed - whether the admin lever suppresses all takeover
 * @param free - languages with no conflicting workspace formatter
 * @param newlyClaimed - subset of free that had no workspace default yet
 * @returns a short human-readable phrase
 */
function describeClaimState(
    isAutoClaimSuppressed: boolean,
    free: readonly string[],
    newlyClaimed: readonly string[]
): string {
    if (isAutoClaimSuppressed) return 'no languages claimed (admin lever active)';
    if (newlyClaimed.length > 0) return `newly claiming: ${formatLanguageList(newlyClaimed)}`;
    if (free.length > 0) return 'all free languages already set to SFMC formatter';
    return 'no free languages to claim';
}

/**
 * Build the single status line logged to the formatter Output channel at
 * startup, so the takeover state is auditable without a debugger. Pure function
 * for testability.
 * @param isMementoDismissed - whether the per-workspace memento marks the prompt answered
 * @param isAutoClaimSuppressed - whether the admin lever suppresses all takeover
 * @param free - languages with no conflicting workspace formatter
 * @param conflicting - languages already pointing at another formatter
 * @param newlyClaimed - subset of free that had no workspace default yet
 * @returns a one-line human-readable status string
 */
export function buildCoexistenceStatusLine(
    isMementoDismissed: boolean,
    isAutoClaimSuppressed: boolean,
    free: readonly string[],
    conflicting: readonly string[],
    newlyClaimed: readonly string[]
): string {
    const promptState = describePromptState(isMementoDismissed, isAutoClaimSuppressed);
    const conflictState =
        conflicting.length > 0
            ? `conflicts with other formatter for: ${formatLanguageList(conflicting)}`
            : 'no conflicts';
    const claimState = describeClaimState(isAutoClaimSuppressed, free, newlyClaimed);
    return `Formatter coexistence: prompt ${promptState}; ${conflictState}; ${claimState}.`;
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
 * The VS Code config scopes that may hold a stale capital `[AMPscript]`
 * `editor.defaultFormatter` block.
 */
export type StaleFormatterScope = 'workspace' | 'workspaceFolder';

/**
 * Decide which scopes hold a stale capital `[AMPscript]` `editor.defaultFormatter`
 * value that should be cleared. SSJS Manager's capital `AMPscript` language id is
 * dead once it hands language intelligence to us, so any per-language formatter
 * override under it is stale config. Pure function for testability.
 * @param workspaceValue - the `[AMPscript]` `editor.defaultFormatter` in workspace scope, or undefined
 * @param workspaceFolderValue - the same in folder scope, or undefined
 * @returns the scopes that actually hold a value and should be cleared
 */
export function staleAmpscriptFormatterScopes(
    workspaceValue: string | undefined,
    workspaceFolderValue: string | undefined
): StaleFormatterScope[] {
    const scopes: StaleFormatterScope[] = [];
    if (workspaceValue !== undefined) scopes.push('workspace');
    if (workspaceFolderValue !== undefined) scopes.push('workspaceFolder');
    return scopes;
}

/**
 * Remove a stale capital `[AMPscript]` `editor.defaultFormatter` block from
 * workspace/folder settings. Only the scope(s) that actually hold a value are
 * cleared, mirroring the scope-guard in `markPromptDismissed` so it never throws
 * in a single-folder window and only writes when there is something to remove.
 * @returns a promise resolving once any stale value is cleared
 */
async function clearStaleAmpscriptFormatter(): Promise<void> {
    const config = workspace.getConfiguration('editor', { languageId: 'AMPscript' });
    const inspected = config.inspect<string>('defaultFormatter');
    const scopes = staleAmpscriptFormatterScopes(
        inspected?.workspaceValue,
        inspected?.workspaceFolderValue
    );
    if (scopes.includes('workspace')) {
        await config.update('defaultFormatter', undefined, ConfigurationTarget.Workspace);
    }
    if (scopes.includes('workspaceFolder')) {
        try {
            await config.update('defaultFormatter', undefined, ConfigurationTarget.WorkspaceFolder);
        } catch {
            // No resource-scoped folder in a single-folder window — ignore.
        }
    }
}

/**
 * Resolve the coexistence modal choice from a test override or the real prompt.
 * @param conflictList - friendly language list shown in the modal detail
 * @param useBuiltIn - primary action label
 * @param keepCurrent - secondary action label
 * @param testOverrides - optional test seams
 * @returns the chosen action, or undefined when the modal is dismissed
 */
async function resolveFormatterChoice(
    conflictList: string,
    useBuiltIn: string,
    keepCurrent: string,
    testOverrides?: CoexistenceTestOverrides
): Promise<string | undefined> {
    if (testOverrides && 'choice' in testOverrides) {
        return testOverrides.choice;
    }
    if (testOverrides?.showModal) {
        return testOverrides.showModal();
    }
    return window.showInformationMessage(
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
 * 3. When `formatterPromptDismissed: true` is set (admin lever), skip both the
 *    silent claim and the prompt entirely.
 *
 * A single status line is always logged to the formatter Output channel first,
 * so the resulting decision is auditable.
 * @param context - the extension context
 * @param [reportOutcome] - optional callback receiving the one resolved coexistence outcome
 *   and, on `failed`, sanitized extra properties
 * @param [testOverrides] - narrow deterministic seams used by integration tests
 * @returns a promise resolving once setup completes
 */
export async function maybeSetupFormatter(
    context: ExtensionContext,
    reportOutcome?: (outcome: CoexistenceOutcome, extras?: FailureTelemetryProperties) => void,
    testOverrides?: CoexistenceTestOverrides
): Promise<void> {
    let isReported = false;
    let stage: FormatterFailureStage = 'unknown';
    const report = (outcome: CoexistenceOutcome, extras?: FailureTelemetryProperties): void => {
        if (isReported) return;
        isReported = true;
        reportOutcome?.(outcome, extras);
    };

    try {
        const formatterEnabled =
            testOverrides?.formatterEnabled ??
            workspace.getConfiguration('sfmcLanguageServer').get<boolean>('enableFormatter', true);
        if (!formatterEnabled) {
            report('disabled');
            return;
        }

        const partition =
            testOverrides?.free && testOverrides.conflicting
                ? { free: testOverrides.free, conflicting: testOverrides.conflicting }
                : partitionLanguages(FORMATTER_LANGUAGES, workspaceDefaultFormatter);
        const { free, conflicting } = partition;

        // "free" includes languages already set to us; only the ones with no
        // workspace default yet are actually being newly claimed — toast just those.
        const newlyClaimed =
            testOverrides?.newlyClaimed ??
            free.filter((languageId) => workspaceDefaultFormatter(languageId) === undefined);

        const inspectedDismissed = workspace
            .getConfiguration('sfmcLanguageServer')
            .inspect<boolean>('formatterPromptDismissed');
        const isMementoDismissed =
            testOverrides?.isMementoDismissed ??
            context.workspaceState.get<boolean>(FORMATTER_PROMPT_DISMISSED_KEY, false);
        // Admin lever: an explicit `formatterPromptDismissed: true` in committed
        // settings tells the extension to leave the formatter config untouched — no
        // silent claiming, no prompt.
        const isSuppressed =
            testOverrides?.isSuppressed ??
            isAutoClaimSuppressed(
                inspectedDismissed?.workspaceFolderValue,
                inspectedDismissed?.workspaceValue,
                inspectedDismissed?.globalValue
            );

        // Log a single, auditable status line so the takeover state is visible in
        // the "SFMC Prettier Formatter" Output channel without a debugger.
        logInfo(
            buildCoexistenceStatusLine(
                isMementoDismissed,
                isSuppressed,
                free,
                conflicting,
                newlyClaimed
            )
        );

        // Admin lever active → do not touch settings and do not prompt.
        if (isSuppressed) {
            report('suppressed');
            return;
        }

        // A settings write with no opened folder makes VS Code itself toast
        // "Unable to write into Workspace Settings…". Bail before any update().
        if (!testOverrides && (workspace.workspaceFolders?.length ?? 0) === 0) {
            report('failed', { errorCategory: 'noWritableFolder' });
            return;
        }

        // Defensive cleanup: strip a stale capital `[AMPscript]` editor.defaultFormatter
        // block (dead once SSJS Manager's capital AMPscript id is gone). Idempotent and
        // a no-op for the vast majority of users who never had such a block.
        stage = 'clearStaleFormatter';
        await (testOverrides?.clearStaleFormatter ?? clearStaleAmpscriptFormatter)();

        // Always claim the languages that are free (unset, or already ours).
        const setFormatter = testOverrides?.setFormatter ?? setDefaultFormatter;
        if (free.length > 0) {
            stage = 'claimLanguages';
            await setFormatter(free);
        }
        if (newlyClaimed.length > 0) {
            void window.showInformationMessage(
                `SFMC formatter is now formatting ${formatLanguageList(newlyClaimed)}. ` +
                    'Change this per language via "editor.defaultFormatter" in .vscode/settings.json.'
            );
        }

        // No genuine conflicts → nothing to ask.
        if (conflicting.length === 0) {
            report('no-conflict');
            return;
        }

        // Ask at most once per workspace, unless the user has explicitly re-enabled
        // the prompt by setting `formatterPromptDismissed: false` in their
        // workspace/folder settings. An explicit `false` overrides the memento so
        // that resetting the setting reliably brings the prompt back.
        const isDismissed =
            testOverrides?.isDismissed ??
            isPromptDismissed(
                isMementoDismissed,
                inspectedDismissed?.workspaceFolderValue,
                inspectedDismissed?.workspaceValue,
                inspectedDismissed?.globalValue
            );
        if (isDismissed) {
            report('already-answered');
            return;
        }

        const useBuiltIn = 'Use SFMC formatter';
        const keepCurrent = 'Keep current';
        const conflictList = formatLanguageList(conflicting);
        stage = 'showModal';
        const choice = await resolveFormatterChoice(
            conflictList,
            useBuiltIn,
            keepCurrent,
            testOverrides
        );

        const markDismissed = testOverrides?.markDismissed ?? (() => markPromptDismissed(context));
        if (choice === useBuiltIn) {
            stage = 'settingsWrite';
            await setFormatter(conflicting);
            stage = 'persistDecision';
            await markDismissed();
            report('switched');
            void window.showInformationMessage(
                `${formatLanguageList(conflicting)} ` +
                    `${conflicting.length === 1 ? 'has' : 'have'} been switched to the SFMC formatter.`
            );
        } else if (choice === keepCurrent) {
            // Leave the conflicting languages untouched; just remember the decision.
            stage = 'persistDecision';
            await markDismissed();
            report('kept');
            void window.showInformationMessage(
                `${formatLanguageList(conflicting)} will continue to be formatted by your existing formatter.`
            );
        } else {
            // Dismissed without choosing (Esc / Cancel): do not persist, so we can
            // ask again later.
            report('cancelled');
        }
    } catch (error) {
        const hasWritableWorkspace = (workspace.workspaceFolders?.length ?? 0) > 0;
        // Test seams inject the throw; keep the raw stage so tests can assert it.
        // Production remaps write stages without a folder to `noWritableFolder`.
        const errorCategory = testOverrides
            ? stage
            : resolveFailureCategory(stage, hasWritableWorkspace);
        report('failed', sanitizeFailureTelemetry(error, errorCategory));
        throw error;
    }
}
