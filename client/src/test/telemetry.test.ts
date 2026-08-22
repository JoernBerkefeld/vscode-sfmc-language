import * as vscode from 'vscode';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import path from 'node:path';
import {
    TELEMETRY_COMMON_PROPERTIES,
    TELEMETRY_EVENT_PROPERTIES,
    TelemetryReporter,
} from '../telemetry';
import {
    CONFLICTING_EXTENSIONS,
    DEFAULT_ACTIVATION_DEPENDENCIES,
    SUPPRESS_KEY,
    activate,
    createLanguageDetectedReporter,
    deactivate,
    detectAndSwitchLanguage,
    detectEcosystem,
    maybeSetupFormatter,
    registerFormatter,
    resetReportedLanguages,
    restoreActivationState,
    snapshotActivationState,
    stopExtensionServices,
} from '../extension';
import type { TelemetryRuntime } from '../telemetry';

/**
 * Read the telemetry.json event catalogue from the extension root.
 * @returns the parsed catalogue object keyed by event name (plus commonProperties)
 */
function readCatalog(): Record<string, unknown> {
    // Compiled test file lives in client/out/test; the catalogue is at the repo root.
    const catalogPath = path.resolve(__dirname, '../../../telemetry.json');
    return JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as Record<string, unknown>;
}

/**
 * Set VS Code's global telemetry level and wait until `isTelemetryEnabled`
 * reflects the requested state (the change is applied asynchronously).
 * @param level - the telemetry.telemetryLevel value to write ('all' or 'off')
 * @param shouldBeEnabled - the isTelemetryEnabled value to wait for
 * @returns a promise that resolves once the state is applied (or the timeout elapses)
 */
async function setTelemetryLevel(level: 'all' | 'off', shouldBeEnabled: boolean): Promise<void> {
    await vscode.workspace
        .getConfiguration('telemetry')
        .update('telemetryLevel', level, vscode.ConfigurationTarget.Global);
    const deadline = Date.now() + 3000;
    while (vscode.env.isTelemetryEnabled !== shouldBeEnabled && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}

/**
 * Build a deterministic telemetry runtime with controllable consent.
 * @param fetchImplementation - transport implementation used by the reporter
 * @returns the runtime and a consent-change dispatcher
 */
function createTelemetryRuntime(fetchImplementation: typeof fetch): {
    runtime: TelemetryRuntime;
    setEnabled: (isEnabled: boolean) => void;
} {
    let isEnabled = true;
    const listeners = new Set<(isEnabled: boolean) => void>();
    return {
        runtime: {
            fetch: fetchImplementation,
            isEnabled: () => isEnabled,
            onDidChangeEnabled: (listener) => {
                listeners.add(listener);
                return { dispose: () => listeners.delete(listener) };
            },
            machineId: 'test-machine-id',
            vscodeVersion: 'test-vscode-version',
            os: 'test-os',
        },
        setEnabled: (nextEnabled) => {
            isEnabled = nextEnabled;
            for (const listener of listeners) listener(nextEnabled);
        },
    };
}

/**
 * Install a fetch stub that records every POST body.
 * @returns captured events and a function that restores global fetch
 */
function captureFetch(): {
    events: { event: string; properties: Record<string, unknown> }[];
    restore: () => void;
} {
    const globalObject = globalThis as { fetch: typeof fetch };
    const original = globalObject.fetch;
    const events: { event: string; properties: Record<string, unknown> }[] = [];
    globalObject.fetch = ((_url: string, init?: { body?: string }) => {
        if (init?.body) {
            const parsed = JSON.parse(init.body) as {
                batch: { event: string; properties: Record<string, unknown> }[];
            };
            events.push(...parsed.batch);
        }
        return Promise.resolve({ ok: true } as Response);
    }) as typeof fetch;
    return {
        events,
        restore: () => {
            globalObject.fetch = original;
        },
    };
}

suite('Telemetry — language detection session dedup', () => {
    test('disabled detection does not poison dedup after re-enable', () => {
        const seen = new Set<string>();
        let isEnabled = false;
        const accepted: string[] = [];
        const report = createLanguageDetectedReporter(seen, (languageId) => {
            if (!isEnabled) return false;
            accepted.push(languageId);
            return true;
        });
        const native = {
            uri: vscode.Uri.parse('untitled:native.amp'),
            languageId: 'ampscript',
            getText: () => '',
        } as vscode.TextDocument;

        detectAndSwitchLanguage(native, report);
        assert.deepStrictEqual(accepted, []);
        isEnabled = true;
        detectAndSwitchLanguage(native, report);
        detectAndSwitchLanguage(native, report);
        assert.deepStrictEqual(accepted, ['ampscript']);
    });

    test('reactivation starts with a fresh session set', () => {
        const firstSession: string[] = [];
        const first = createLanguageDetectedReporter(new Set<string>(), (languageId) => {
            firstSession.push(languageId);
            return true;
        });
        first('ssjs');
        first('ssjs');

        resetReportedLanguages();
        const secondSession: string[] = [];
        const second = createLanguageDetectedReporter(new Set<string>(), (languageId) => {
            secondSession.push(languageId);
            return true;
        });
        second('ssjs');
        assert.deepStrictEqual(firstSession, ['ssjs']);
        assert.deepStrictEqual(secondSession, ['ssjs']);
    });
});

suite('Telemetry — reporter emission emits only catalogued events', () => {
    let capture: ReturnType<typeof captureFetch>;

    suiteSetup(async () => {
        await setTelemetryLevel('all', true);
    });

    suiteTeardown(async () => {
        // Restore the default so later suites are unaffected.
        await setTelemetryLevel('all', true);
    });

    setup(() => {
        capture = captureFetch();
    });

    teardown(() => {
        capture.restore();
    });

    test('language.detected emits with a session-deduped id, matching the catalog', () => {
        const catalog = readCatalog();
        const reporter = new TelemetryReporter({
            extensionName: 'sfmc-language',
            extensionVersion: '0.0.0-test',
        });
        // Emit the same id twice at the reporter level; the dedup guard lives in
        // reportLanguageDetected, verified separately — here we assert only that
        // the event name is catalogued and carries the common + custom props.
        reporter.track('language.detected', { languageId: 'ssjs' });
        reporter.flush();
        reporter.dispose();

        assert.ok(capture.events.length > 0, 'a batch should have been POSTed');
        const events = catalog.events as Record<string, unknown>;
        for (const entry of capture.events) {
            assert.ok(
                Object.hasOwn(events, entry.event),
                `emitted event "${entry.event}" must be listed in telemetry.json`
            );
        }
        const detected = capture.events.find((event) => event.event === 'language.detected');
        assert.ok(detected, 'language.detected must be emitted');
        assert.strictEqual(detected.properties.languageId, 'ssjs');
        assert.strictEqual(detected.properties.extension, 'sfmc-language');
        assert.strictEqual(detected.properties.$process_person_profile, false);
    });

    test('catalog and runtime event/property keys match bidirectionally', () => {
        const catalog = readCatalog() as {
            commonProperties: Record<string, unknown>;
            events: Record<string, { properties: Record<string, unknown> }>;
        };
        assert.deepStrictEqual(
            Object.keys(catalog.commonProperties).toSorted((a, b) => a.localeCompare(b)),
            [...TELEMETRY_COMMON_PROPERTIES].toSorted((a, b) => a.localeCompare(b))
        );
        assert.deepStrictEqual(
            Object.keys(catalog.events).toSorted((a, b) => a.localeCompare(b)),
            Object.keys(TELEMETRY_EVENT_PROPERTIES).toSorted((a, b) => a.localeCompare(b))
        );
        for (const [event, properties] of Object.entries(TELEMETRY_EVENT_PROPERTIES)) {
            assert.deepStrictEqual(
                Object.keys(catalog.events[event].properties).toSorted((a, b) =>
                    a.localeCompare(b)
                ),
                [...properties].toSorted((a, b) => a.localeCompare(b)),
                `${event} properties must match runtime in both directions`
            );
        }
        assert.ok(Object.hasOwn(catalog.commonProperties, '$process_person_profile'));
    });

    test('conflict telemetry is sourced from the existing conflict list', () => {
        assert.deepStrictEqual(
            CONFLICTING_EXTENSIONS.map((entry) => entry.id),
            ['xnerd.ampscript-language', 'FiB.beautyAmp']
        );
    });

    test('actual native and auto-detection paths report resolved ids', () => {
        const reported: string[] = [];
        const native = {
            uri: vscode.Uri.parse('untitled:native.amp'),
            languageId: 'ampscript',
            getText: () => '',
        } as vscode.TextDocument;
        detectAndSwitchLanguage(native, (id) => {
            reported.push(id);
        });

        const automatic = {
            uri: vscode.Uri.parse('untitled:auto.html'),
            languageId: 'html',
            getText: () => '%%[ SET @x = 1 ]%%',
        } as vscode.TextDocument;
        detectAndSwitchLanguage(automatic, (id) => {
            reported.push(id);
        });
        assert.deepStrictEqual(reported, ['ampscript', 'sfmc']);
    });
});

suite('Telemetry — no-op when telemetry disabled', () => {
    suiteTeardown(async () => {
        // Leave telemetry enabled for any later suites.
        await setTelemetryLevel('all', true);
    });

    test('reporter sends nothing while disabled, and re-checks on change', async () => {
        await setTelemetryLevel('off', false);
        const capture = captureFetch();
        try {
            const reporter = new TelemetryReporter({
                extensionName: 'sfmc-language',
                extensionVersion: '0.0.0-test',
            });
            // track() is a no-op while disabled (enabled=false at construction);
            // flush() also re-checks isTelemetryEnabled and drops the queue.
            reporter.track('extension.activated', { targetPlatform: 'engagement' });
            reporter.flush();
            assert.strictEqual(
                capture.events.length,
                0,
                'no events should be sent while telemetry is disabled'
            );

            // Re-enable: the same reporter observes onDidChangeTelemetryEnabled
            // and resumes accepting events without being recreated.
            await setTelemetryLevel('all', true);
            reporter.track('extension.activated', { targetPlatform: 'engagement' });
            reporter.flush();
            assert.ok(
                capture.events.length > 0,
                'the existing reporter sends again once telemetry is re-enabled'
            );
            reporter.dispose();
        } finally {
            capture.restore();
        }
    });

    test('deactivation awaits the final fetch and language-client stop', async () => {
        const fetchResolution = Promise.withResolvers<Response>();
        const clientResolution = Promise.withResolvers<void>();
        const { runtime } = createTelemetryRuntime((() => fetchResolution.promise) as typeof fetch);
        const reporter = new TelemetryReporter(
            { extensionName: 'sfmc-language', extensionVersion: '0.0.0-test' },
            runtime
        );
        reporter.track('language.detected', { languageId: 'sfmc' });
        const client = { stop: () => clientResolution.promise };
        const shutdown = stopExtensionServices(reporter, client);
        const observeShutdown = async (): Promise<'stopped'> => {
            await shutdown;
            return 'stopped';
        };
        assert.strictEqual(
            await Promise.race([
                observeShutdown(),
                new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 25)),
            ]),
            'pending'
        );
        fetchResolution.resolve({ ok: true } as Response);
        clientResolution.resolve();
        await shutdown;
    });

    test('disabling telemetry aborts a held request', async () => {
        let signal: AbortSignal | undefined;
        const { runtime, setEnabled } = createTelemetryRuntime(((
            _url: string,
            init?: RequestInit
        ) => {
            signal = init?.signal ?? undefined;
            return new Promise<Response>((_resolve, reject) => {
                signal?.addEventListener('abort', () => reject(new Error('aborted')), {
                    once: true,
                });
            });
        }) as typeof fetch);
        const reporter = new TelemetryReporter(
            { extensionName: 'sfmc-language', extensionVersion: '0.0.0-test' },
            runtime
        );
        reporter.track('language.detected', { languageId: 'ssjs' });
        reporter.flush();
        assert.ok(signal, 'fetch should receive an AbortSignal');
        setEnabled(false);
        assert.strictEqual(signal?.aborted, true);
        reporter.dispose();
    });

    test('synchronous disposal aborts a held request and is idempotent', () => {
        let signal: AbortSignal | undefined;
        const { runtime } = createTelemetryRuntime(((_url: string, init?: RequestInit) => {
            signal = init?.signal ?? undefined;
            return new Promise<Response>(() => {});
        }) as typeof fetch);
        const reporter = new TelemetryReporter(
            { extensionName: 'sfmc-language', extensionVersion: '0.0.0-test' },
            runtime
        );
        reporter.track('language.detected', { languageId: 'ssjs' });
        reporter.flush();
        reporter.dispose();
        reporter.dispose();
        assert.strictEqual(signal?.aborted, true);
    });
});

suite('Telemetry — authoritative catalog schema', () => {
    test('telemetry.json fields match the local VS Code GDPR vocabulary', () => {
        const catalog = readCatalog() as {
            commonProperties: Record<
                string,
                { classification: string; purpose: string; comment: string }
            >;
            events: Record<
                string,
                {
                    owner: string;
                    comment: string;
                    properties?: Record<
                        string,
                        { classification: string; purpose: string; comment: string }
                    >;
                    measures?: Record<
                        string,
                        { classification: string; purpose: string; comment: string }
                    >;
                }
            >;
        };
        const classifications = new Set([
            'CallstackOrException',
            'EndUserPseudonymizedInformation',
            'PublicNonPersonalData',
            'SystemMetaData',
        ]);
        const purposes = new Set(['BusinessInsight', 'FeatureInsight', 'PerformanceAndHealth']);
        const validateField = (
            field: { classification: string; purpose: string; comment: string },
            location: string
        ): void => {
            assert.ok(
                classifications.has(field.classification),
                `${location} classification ${field.classification}`
            );
            assert.ok(purposes.has(field.purpose), `${location} purpose ${field.purpose}`);
            assert.ok(field.comment.trim().length > 0, `${location}.comment is required`);
        };

        assert.deepStrictEqual(
            Object.keys(catalog).toSorted((a, b) => a.localeCompare(b)),
            ['commonProperties', 'events']
        );
        for (const [name, field] of Object.entries(catalog.commonProperties)) {
            validateField(field, `commonProperties.${name}`);
        }
        assert.strictEqual(
            catalog.commonProperties.distinct_id.classification,
            'EndUserPseudonymizedInformation'
        );
        assert.strictEqual(
            catalog.commonProperties.$process_person_profile.classification,
            'SystemMetaData'
        );
        for (const [eventName, event] of Object.entries(catalog.events)) {
            assert.ok(event.owner.trim().length > 0, `${eventName}.owner is required`);
            assert.ok(event.comment.trim().length > 0, `${eventName}.comment is required`);
            const eventProperties = Object.entries(event.properties ?? {});
            for (const [name, field] of eventProperties) {
                validateField(field, `${eventName}.properties.${name}`);
            }
            const eventMeasures = Object.entries(event.measures ?? {});
            for (const [name, field] of eventMeasures) {
                validateField(field, `${eventName}.measures.${name}`);
            }
        }
    });
});

interface TrackedEvent {
    event: string;
    properties: Record<string, unknown>;
}

/**
 * Build a fake extension context that suppresses the conflict UI.
 * @returns a disposable-backed context suitable for isolated activate() calls
 */
function createIsolatedContext(): vscode.ExtensionContext {
    const extension = vscode.extensions.getExtension('joernberkefeld.sfmc-language');
    assert.ok(extension, 'sfmc-language must be present in the test host');
    return {
        subscriptions: [],
        extension,
        asAbsolutePath: (relative: string) => path.join(extension.extensionPath, relative),
        globalState: {
            get: (key: string) => (key === SUPPRESS_KEY ? true : undefined),
            update: async () => {},
        },
        workspaceState: {
            get: () => false,
            update: async () => {},
        },
    } as unknown as vscode.ExtensionContext;
}

suite('Telemetry — production activation wiring', () => {
    test('production defaults are the real reporter/formatter/ecosystem factories', () => {
        assert.strictEqual(DEFAULT_ACTIVATION_DEPENDENCIES.setupFormatter, maybeSetupFormatter);
        assert.strictEqual(DEFAULT_ACTIVATION_DEPENDENCIES.detectEcosystem, detectEcosystem);
        assert.strictEqual(DEFAULT_ACTIVATION_DEPENDENCIES.registerFormatter, registerFormatter);
    });

    test('activate() reports activation, conflicts, formatter outcome, languages, consent, and deactivation drain', async () => {
        const previous = snapshotActivationState();
        const context = createIsolatedContext();
        const events: TrackedEvent[] = [];
        const { runtime, setEnabled } = createTelemetryRuntime((() =>
            Promise.resolve({ ok: true } as Response)) as typeof fetch);
        const innerReporter = new TelemetryReporter(
            { extensionName: 'sfmc-language', extensionVersion: '0.0.0-test' },
            runtime
        );
        let formatterSetup: Promise<void> | undefined;
        const clientHold = Promise.withResolvers<void>();
        const reporterHold = Promise.withResolvers<void>();
        let isClientStopStarted = false;
        let isReporterDrainStarted = false;
        const ecosystem = {
            coInstalledAsDependency: true,
            coInstalledInPack: false,
            'neighbor.sfmc-devtools': true,
        };

        try {
            activate(context, {
                ...DEFAULT_ACTIVATION_DEPENDENCIES,
                createReporter: () => ({
                    track: (event, properties) => {
                        const accepted = innerReporter.track(event, properties);
                        if (accepted) events.push({ event, properties: properties ?? {} });
                        return accepted;
                    },
                    dispose: () => innerReporter.dispose(),
                    disposeAsync: async () => {
                        isReporterDrainStarted = true;
                        await reporterHold.promise;
                        await innerReporter.disposeAsync();
                    },
                }),
                createClient: () => ({
                    start: () => {},
                    stop: async () => {
                        isClientStopStarted = true;
                        await clientHold.promise;
                    },
                }),
                createStatusBar: () => {},
                detectEcosystem: () => ecosystem,
                getExtension: ((id: string) => {
                    if (id === 'xnerd.ampscript-language' || id === 'FiB.beautyAmp') {
                        return { isActive: true };
                    }
                    return;
                }) as typeof vscode.extensions.getExtension,
                registerFormatter: () => {},
                setupFormatter: (extensionContext, reportOutcome) => {
                    formatterSetup = maybeSetupFormatter(extensionContext, reportOutcome, {
                        formatterEnabled: true,
                        free: [],
                        conflicting: [],
                        newlyClaimed: [],
                        isMementoDismissed: false,
                        isSuppressed: false,
                        isDismissed: false,
                        clearStaleFormatter: async () => {},
                        setFormatter: async () => {},
                        markDismissed: async () => {},
                    });
                    return formatterSetup;
                },
                checkWhatsNew: async () => {},
            });

            const activated = events.find((entry) => entry.event === 'extension.activated');
            assert.ok(activated, 'extension.activated must reach the live reporter');
            assert.ok(
                activated.properties.targetPlatform === 'engagement' ||
                    activated.properties.targetPlatform === 'next'
            );
            assert.ok(
                ['javascript', 'auto', 'sfmc'].includes(String(activated.properties.ssjsFileMode))
            );
            assert.strictEqual(activated.properties.coInstalledAsDependency, true);
            assert.strictEqual(activated.properties.coInstalledInPack, false);
            assert.strictEqual(activated.properties['neighbor.sfmc-devtools'], true);

            assert.deepStrictEqual(
                events
                    .filter((entry) => entry.event === 'conflict.detected')
                    .map((entry) => entry.properties.extensionId)
                    .toSorted((a, b) => String(a).localeCompare(String(b))),
                ['FiB.beautyAmp', 'xnerd.ampscript-language']
            );

            await formatterSetup;
            const formatter = events.find(
                (entry) => entry.event === 'formatter.coexistence.resolved'
            );
            assert.ok(formatter, 'formatter callback must be connected through activate()');
            assert.strictEqual(formatter.properties.outcome, 'no-conflict');

            resetReportedLanguages();
            const beforeLanguages = events.filter(
                (entry) => entry.event === 'language.detected'
            ).length;
            const native = await vscode.workspace.openTextDocument({
                language: 'ampscript',
                content: '%%[ SET @isolated = 1 ]%%',
            });
            detectAndSwitchLanguage(native);
            const automatic = await vscode.workspace.openTextDocument({
                language: 'html',
                content: '%%[ SET @isolatedAuto = 1 ]%%',
            });
            detectAndSwitchLanguage(automatic);
            const languageEvents = events
                .filter((entry) => entry.event === 'language.detected')
                .slice(beforeLanguages);
            assert.deepStrictEqual(
                languageEvents.map((entry) => entry.properties.languageId),
                ['ampscript', 'sfmc']
            );
            detectAndSwitchLanguage(native);
            assert.strictEqual(
                events.filter((entry) => entry.event === 'language.detected').length -
                    beforeLanguages,
                2,
                'session dedup must still apply after live reporter acceptance'
            );

            setEnabled(false);
            const disabledDocument = await vscode.workspace.openTextDocument({
                language: 'ssjs',
                content: 'Platform.Load("core", "1");',
            });
            detectAndSwitchLanguage(disabledDocument);
            assert.strictEqual(
                events.filter((entry) => entry.event === 'language.detected').length -
                    beforeLanguages,
                2,
                'disabled consent must not record language.detected'
            );
            setEnabled(true);
            detectAndSwitchLanguage(disabledDocument);
            assert.deepStrictEqual(
                events
                    .filter((entry) => entry.event === 'language.detected')
                    .slice(beforeLanguages)
                    .map((entry) => entry.properties.languageId),
                ['ampscript', 'sfmc', 'ssjs']
            );

            const shutdown = deactivate();
            const observeShutdown = async (): Promise<'stopped'> => {
                await shutdown;
                return 'stopped';
            };
            assert.strictEqual(
                await Promise.race([
                    observeShutdown(),
                    new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 25)),
                ]),
                'pending'
            );
            assert.strictEqual(isClientStopStarted, true);
            assert.strictEqual(isReporterDrainStarted, true);
            clientHold.resolve();
            reporterHold.resolve();
            await shutdown;
        } finally {
            clientHold.resolve();
            reporterHold.resolve();
            restoreActivationState(previous);
            for (const subscription of context.subscriptions) subscription.dispose();
            innerReporter.dispose();
        }
    });
});
