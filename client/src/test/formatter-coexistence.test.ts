import * as vscode from 'vscode';
import * as assert from 'node:assert';
import {
    EXTENSION_ID,
    ESBENP_ID,
    FORMATTER_PROMPT_DISMISSED_KEY,
    LANGUAGE_LABELS,
    formatLanguageList,
    partitionLanguages,
    isPromptDismissed,
    isAutoClaimSuppressed,
    buildCoexistenceStatusLine,
    staleAmpscriptFormatterScopes,
    maybeSetupFormatter,
    CoexistenceOutcome,
    CoexistenceTestOverrides,
} from '../formatter-coexistence';
import { FORMATTER_LANGUAGES } from '../formatter';

suite('Formatter coexistence — static data', () => {
    test('EXTENSION_ID matches this extension', () => {
        assert.strictEqual(EXTENSION_ID, 'joernberkefeld.sfmc-language');
        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(extension, 'EXTENSION_ID must resolve to the running extension');
    });

    test('ESBENP_ID targets the Prettier extension', () => {
        assert.strictEqual(ESBENP_ID, 'esbenp.prettier-vscode');
    });

    test('memento key is namespaced and non-empty', () => {
        assert.ok(FORMATTER_PROMPT_DISMISSED_KEY.length > 0);
        assert.ok(FORMATTER_PROMPT_DISMISSED_KEY.startsWith('sfmcLanguageServer.'));
    });
});

suite('Formatter coexistence — partitionLanguages', () => {
    test('all languages are free when none have a workspace formatter', () => {
        const { free, conflicting } = partitionLanguages(FORMATTER_LANGUAGES, () => {});
        assert.deepStrictEqual(free, [...FORMATTER_LANGUAGES]);
        assert.deepStrictEqual(conflicting, []);
    });

    test('our own value counts as free (re-claim is a no-op)', () => {
        const { free, conflicting } = partitionLanguages(FORMATTER_LANGUAGES, () => EXTENSION_ID);
        assert.deepStrictEqual(free, [...FORMATTER_LANGUAGES]);
        assert.deepStrictEqual(conflicting, []);
    });

    test('a different formatter counts as conflicting', () => {
        const { free, conflicting } = partitionLanguages(FORMATTER_LANGUAGES, () => ESBENP_ID);
        assert.deepStrictEqual(free, []);
        assert.deepStrictEqual(conflicting, [...FORMATTER_LANGUAGES]);
    });

    test('splits free vs conflicting per language', () => {
        const preset: Record<string, string> = { ssjs: ESBENP_ID, sql: EXTENSION_ID };
        const { free, conflicting } = partitionLanguages(FORMATTER_LANGUAGES, (id) => preset[id]);
        // ssjs conflicts (esbenp); sql is ours (free); the rest are unset (free).
        assert.deepStrictEqual(conflicting, ['ssjs']);
        assert.ok(free.includes('sql'));
        assert.ok(free.includes('ampscript'));
        assert.ok(free.includes('sfmc'));
        assert.ok(free.includes('handlebars'));
        assert.ok(!free.includes('ssjs'));
    });
});

suite('Formatter coexistence — isPromptDismissed', () => {
    test('not dismissed when nothing is set', () => {
        assert.strictEqual(isPromptDismissed(undefined, undefined, undefined, undefined), false);
    });

    test('dismissed when the memento is true', () => {
        assert.strictEqual(isPromptDismissed(true, undefined, undefined, undefined), true);
    });

    test('dismissed when only a workspace setting is true', () => {
        assert.strictEqual(isPromptDismissed(undefined, undefined, true, undefined), true);
    });

    test('explicit workspace false re-enables the prompt even if the memento is true', () => {
        assert.strictEqual(isPromptDismissed(true, undefined, false, undefined), false);
    });

    test('explicit folder false re-enables the prompt even if the memento is true', () => {
        assert.strictEqual(isPromptDismissed(true, false, undefined, undefined), false);
    });

    test('a global-only true does not block an explicit workspace false', () => {
        assert.strictEqual(isPromptDismissed(undefined, undefined, false, true), false);
    });

    test('global true dismisses when nothing else is set', () => {
        assert.strictEqual(isPromptDismissed(undefined, undefined, undefined, true), true);
    });
});

suite('Formatter coexistence — isAutoClaimSuppressed', () => {
    test('not suppressed when nothing is set', () => {
        assert.strictEqual(isAutoClaimSuppressed(undefined, undefined, undefined), false);
    });

    test('suppressed when a workspace true is set', () => {
        assert.strictEqual(isAutoClaimSuppressed(undefined, true, undefined), true);
    });

    test('suppressed when a folder true is set', () => {
        assert.strictEqual(isAutoClaimSuppressed(true, undefined, undefined), true);
    });

    test('suppressed when a user-global true is set', () => {
        assert.strictEqual(isAutoClaimSuppressed(undefined, undefined, true), true);
    });

    test('an explicit false anywhere wins over a true elsewhere', () => {
        assert.strictEqual(isAutoClaimSuppressed(false, true, true), false);
        assert.strictEqual(isAutoClaimSuppressed(undefined, false, true), false);
        assert.strictEqual(isAutoClaimSuppressed(undefined, undefined, false), false);
    });
});

suite('Formatter coexistence — buildCoexistenceStatusLine', () => {
    test('reports newly-claimed languages when not answered and no conflict', () => {
        const line = buildCoexistenceStatusLine(
            false,
            false,
            ['ampscript', 'ssjs'],
            [],
            ['ampscript', 'ssjs']
        );
        assert.ok(line.includes('prompt not yet answered'));
        assert.ok(line.includes('no conflicts'));
        assert.ok(line.includes('newly claiming: AMPscript, SSJS'));
    });

    test('reports memento-answered state and conflicts', () => {
        const line = buildCoexistenceStatusLine(true, false, ['ampscript'], ['sql'], []);
        assert.ok(line.includes('already answered for this workspace (memento)'));
        assert.ok(line.includes('conflicts with other formatter for: SQL'));
        assert.ok(line.includes('all free languages already set to SFMC formatter'));
    });

    test('reports the admin lever as suppressed and claims nothing', () => {
        const line = buildCoexistenceStatusLine(false, true, ['ampscript'], ['sql'], ['ampscript']);
        assert.ok(line.includes('suppressed (formatterPromptDismissed=true)'));
        assert.ok(line.includes('no languages claimed (admin lever active)'));
    });
});

suite('Formatter coexistence — staleAmpscriptFormatterScopes', () => {
    test('no scopes when neither holds a value', () => {
        assert.deepStrictEqual(staleAmpscriptFormatterScopes(undefined, undefined), []);
    });

    test('workspace scope when only the workspace value is present', () => {
        assert.deepStrictEqual(staleAmpscriptFormatterScopes('FiB.ssjs-vsc', undefined), [
            'workspace',
        ]);
    });

    test('folder scope when only the folder value is present', () => {
        assert.deepStrictEqual(staleAmpscriptFormatterScopes(undefined, 'FiB.ssjs-vsc'), [
            'workspaceFolder',
        ]);
    });

    test('both scopes when both hold a value', () => {
        assert.deepStrictEqual(staleAmpscriptFormatterScopes('a', 'b'), [
            'workspace',
            'workspaceFolder',
        ]);
    });
});

suite('Formatter coexistence — language labels', () => {
    test('every formatter language has a friendly label', () => {
        for (const languageId of FORMATTER_LANGUAGES) {
            assert.ok(
                typeof LANGUAGE_LABELS[languageId] === 'string' &&
                    LANGUAGE_LABELS[languageId].length > 0,
                `missing label for ${languageId}`
            );
        }
    });

    test('formatLanguageList renders friendly labels comma-separated', () => {
        assert.strictEqual(
            formatLanguageList(['ampscript', 'ssjs', 'sql']),
            'AMPscript, SSJS, SQL'
        );
    });

    test('formatLanguageList falls back to the raw id for unknown languages', () => {
        assert.strictEqual(formatLanguageList(['made-up']), 'made-up');
    });
});

/**
 * Resolve without performing a configuration write.
 * @returns an already-resolved promise
 */
async function noOperation(): Promise<void> {}

suite('Formatter coexistence — telemetry outcomes', () => {
    const context = {
        workspaceState: { get: () => false },
    } as unknown as vscode.ExtensionContext;

    /**
     * Run the real coexistence decision flow with deterministic dependencies.
     * @param overrides - scenario values and injected operations
     * @returns every telemetry outcome reported by the flow
     */
    async function resolveOutcome(
        overrides: CoexistenceTestOverrides
    ): Promise<CoexistenceOutcome[]> {
        const outcomes: CoexistenceOutcome[] = [];
        await maybeSetupFormatter(
            context,
            (outcome) => {
                outcomes.push(outcome);
            },
            {
                free: [],
                conflicting: [],
                newlyClaimed: [],
                isMementoDismissed: false,
                isSuppressed: false,
                isDismissed: false,
                clearStaleFormatter: noOperation,
                setFormatter: noOperation,
                markDismissed: noOperation,
                ...overrides,
            }
        );
        return outcomes;
    }

    test('reports disabled, suppressed, no-conflict, and already-answered exactly once', async () => {
        assert.deepStrictEqual(await resolveOutcome({ formatterEnabled: false }), ['disabled']);
        assert.deepStrictEqual(await resolveOutcome({ isSuppressed: true }), ['suppressed']);
        assert.deepStrictEqual(await resolveOutcome({}), ['no-conflict']);
        assert.deepStrictEqual(await resolveOutcome({ conflicting: ['ssjs'], isDismissed: true }), [
            'already-answered',
        ]);
    });

    test('reports switched, kept, and cancelled exactly once', async () => {
        assert.deepStrictEqual(
            await resolveOutcome({ conflicting: ['ssjs'], choice: 'Use SFMC formatter' }),
            ['switched']
        );
        assert.deepStrictEqual(
            await resolveOutcome({ conflicting: ['ssjs'], choice: 'Keep current' }),
            ['kept']
        );
        assert.deepStrictEqual(await resolveOutcome({ conflicting: ['ssjs'], choice: undefined }), [
            'cancelled',
        ]);
    });

    test('reports failed exactly once when a configuration write fails', async () => {
        const outcomes: CoexistenceOutcome[] = [];
        await assert.rejects(
            maybeSetupFormatter(
                context,
                (outcome) => {
                    outcomes.push(outcome);
                },
                {
                    free: ['ssjs'],
                    conflicting: [],
                    newlyClaimed: [],
                    isMementoDismissed: false,
                    isSuppressed: false,
                    clearStaleFormatter: noOperation,
                    setFormatter: async () => {
                        throw new Error('configuration write failed');
                    },
                    markDismissed: noOperation,
                }
            )
        );
        assert.deepStrictEqual(outcomes, ['failed']);
    });
});

suite('Formatter coexistence — manifest wiring', () => {
    test('formatterPromptDismissed + enableFormatter settings are contributed', () => {
        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(extension);
        const properties = extension.packageJSON?.contributes?.configuration?.properties ?? {};
        assert.ok(
            'sfmcLanguageServer.enableFormatter' in properties,
            'enableFormatter setting must be contributed'
        );
        assert.ok(
            'sfmcLanguageServer.formatterPromptDismissed' in properties,
            'formatterPromptDismissed setting must be contributed'
        );
        assert.ok(
            'sfmcLanguageServer.ssjsFileMode' in properties,
            'ssjsFileMode setting must be contributed'
        );
        assert.deepStrictEqual(
            properties['sfmcLanguageServer.ssjsFileMode']?.enum,
            ['javascript', 'auto', 'sfmc'],
            'ssjsFileMode must offer the javascript/auto/sfmc enum'
        );
        assert.strictEqual(
            properties['sfmcLanguageServer.ssjsFileMode']?.default,
            'javascript',
            'ssjsFileMode must default to javascript (no behaviour change)'
        );
    });
});
