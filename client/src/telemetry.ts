import * as vscode from 'vscode';

const PROJECT_API_KEY = 'phc_AY9WHA5c6M9QqkaapgPqSTZ2NNZK3L3FxwkbdASsS7Ex';
const POSTHOG_HOST = 'https://eu.i.posthog.com';
const FLUSH_DEBOUNCE_MS = 2000;
const SHUTDOWN_TIMEOUT_MS = 2000;

type TelemetryValue = string | number | boolean;

export const TELEMETRY_EVENT_PROPERTIES = {
    'extension.activated': [
        'targetPlatform',
        'ssjsFileMode',
        'coInstalledAsDependency',
        'coInstalledInPack',
        'neighbor.sergey-agadzhanov.ampscript',
        'neighbor.FiB.ssjs-vsc',
        'neighbor.FiB.beautyAmp',
        'neighbor.sfmc-devtools',
        'neighbor.sfmc-data',
        'neighbor.mso-conditionals',
        'neighbor.sfmc-extension-pack',
        'neighbor.sfmc-extension-pack-plus',
        'neighbor.markdown-preview-bitbucket-innersource',
    ],
    'language.detected': ['languageId'],
    'formatter.coexistence.resolved': ['outcome', 'errorCategory', 'errorName', 'errorCode'],
    'conflict.detected': ['extensionId'],
} as const;

export const TELEMETRY_COMMON_PROPERTIES = [
    'extension',
    'extensionVersion',
    'os',
    'vscodeVersion',
    'distinct_id',
    '$process_person_profile',
] as const;

export type TelemetryEventName = keyof typeof TELEMETRY_EVENT_PROPERTIES;

/**
 * Runtime dependencies that are injectable only for deterministic lifecycle tests.
 */
export interface TelemetryRuntime {
    fetch: typeof fetch | undefined;
    isEnabled: () => boolean;
    onDidChangeEnabled: (listener: (isEnabled: boolean) => void) => vscode.Disposable;
    machineId: string;
    vscodeVersion: string;
    os: string;
}

interface TelemetryReporterOptions {
    extensionName: string;
    extensionVersion: string;
}

interface QueuedEvent {
    event: string;
    properties: Record<string, TelemetryValue>;
    timestamp: string;
}

interface ActiveRequest {
    controller: AbortController;
    promise: Promise<void>;
}

/**
 * Small anonymous PostHog reporter gated by VS Code's global telemetry setting.
 * Normal debounced sends are fire-and-forget; extension shutdown can await a
 * bounded final drain through `disposeAsync()`.
 */
export class TelemetryReporter implements vscode.Disposable {
    private readonly commonProps: Record<string, TelemetryValue>;
    private readonly distinctId: string;
    private readonly runtime: TelemetryRuntime;
    private queue: QueuedEvent[] = [];
    private flushTimer: ReturnType<typeof setTimeout> | undefined;
    private enabled: boolean;
    private disposed = false;
    private asyncDisposal: Promise<void> | undefined;
    private readonly activeRequests = new Set<ActiveRequest>();
    private readonly changeSubscription: vscode.Disposable;

    /**
     * @param options - the emitting extension's short name and own version
     * @param runtime - optional deterministic runtime seam for lifecycle tests
     */
    constructor(options: TelemetryReporterOptions, runtime?: TelemetryRuntime) {
        this.runtime =
            runtime ??
            ({
                fetch: typeof fetch === 'function' ? fetch : undefined,
                isEnabled: () => vscode.env.isTelemetryEnabled,
                onDidChangeEnabled: (listener) => vscode.env.onDidChangeTelemetryEnabled(listener),
                machineId: vscode.env.machineId,
                vscodeVersion: vscode.version,
                os: process.platform,
            } satisfies TelemetryRuntime);
        this.distinctId = this.runtime.machineId;
        this.enabled = this.runtime.isEnabled();
        this.commonProps = {
            extension: options.extensionName,
            extensionVersion: options.extensionVersion,
            os: this.runtime.os,
            vscodeVersion: this.runtime.vscodeVersion,
        };
        this.changeSubscription = this.runtime.onDidChangeEnabled((isEnabled) => {
            this.enabled = isEnabled;
            if (!isEnabled) {
                this.clearPending();
                this.abortActiveRequests();
            }
        });
    }

    /**
     * Whether the reporter currently accepts events.
     * @returns true while consent is enabled and the reporter is active
     */
    get isEnabled(): boolean {
        return !this.disposed && this.enabled && this.runtime.isEnabled();
    }

    /**
     * Enqueue an event for the next debounced flush.
     * @param event - event name listed in telemetry.json
     * @param [properties] - flat custom event properties
     * @returns true only when the event was accepted
     */
    track(event: TelemetryEventName, properties?: Record<string, TelemetryValue>): boolean {
        if (!this.isEnabled) return false;
        this.queue.push({
            event,
            properties: {
                distinct_id: this.distinctId,
                $process_person_profile: false,
                ...this.commonProps,
                ...properties,
            },
            timestamp: new Date().toISOString(),
        });
        if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => this.flush(), FLUSH_DEBOUNCE_MS);
        }
        return true;
    }

    /**
    Send the current queue without blocking the caller.
     */
    flush(): void {
        void this.flushAsync();
    }

    /**
     * Synchronously dispose for VS Code's Disposable contract. Pending and
     * active telemetry is cancelled; repeated calls are harmless.
     */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.changeSubscription.dispose();
        this.clearPending();
        this.abortActiveRequests();
    }

    /**
     * Flush queued telemetry and await all active sends, bounded to two seconds.
     * This is separate from dispose() so the final request is not immediately
     * aborted by synchronous subscription disposal.
     * @returns a promise settled after delivery or the shutdown timeout
     */
    disposeAsync(): Promise<void> {
        if (this.asyncDisposal) return this.asyncDisposal;
        if (this.disposed) return Promise.resolve();
        this.disposed = true;
        this.changeSubscription.dispose();
        this.clearTimer();
        this.asyncDisposal = this.drainWithTimeout();
        return this.asyncDisposal;
    }

    // eslint-disable-next-line unicorn/consistent-class-member-order -- public disposal methods are grouped together
    private clearTimer(): void {
        if (!this.flushTimer) {
            return;
        }

        clearTimeout(this.flushTimer);
        this.flushTimer = undefined;
    }

    private clearPending(): void {
        this.clearTimer();
        this.queue = [];
    }

    private abortActiveRequests(): void {
        for (const request of this.activeRequests) request.controller.abort();
    }

    private async drainWithTimeout(): Promise<void> {
        const drain = (async (): Promise<void> => {
            await this.flushAsync(true);
            await Promise.allSettled([...this.activeRequests].map((request) => request.promise));
        })();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const bounded = new Promise<void>((resolve) => {
            timeout = setTimeout(() => {
                this.abortActiveRequests();
                resolve();
            }, SHUTDOWN_TIMEOUT_MS);
        });
        await Promise.race([drain, bounded]);
        if (timeout) clearTimeout(timeout);
        this.clearPending();
    }

    private async flushAsync(canRunWhenDisposed = false): Promise<void> {
        const request = this.startFlush(canRunWhenDisposed);
        if (request) await request.promise;
    }

    private startFlush(canRunWhenDisposed = false): ActiveRequest | undefined {
        this.clearTimer();
        if (!this.enabled || !this.runtime.isEnabled() || (!canRunWhenDisposed && this.disposed)) {
            this.queue = [];
            return undefined;
        }
        if (!this.runtime.fetch || this.queue.length === 0) {
            this.queue = [];
            return undefined;
        }
        const batch = this.queue;
        this.queue = [];
        const active: ActiveRequest = {
            controller: new AbortController(),
            promise: Promise.resolve(),
        };
        this.activeRequests.add(active);
        active.promise = this.sendBatch(active, batch);
        return active;
    }

    private async sendBatch(active: ActiveRequest, batch: QueuedEvent[]): Promise<void> {
        try {
            await this.runtime.fetch?.(`${POSTHOG_HOST}/batch/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: PROJECT_API_KEY, batch }),
                signal: active.controller.signal,
            });
        } catch {
            // Telemetry transport failures never surface to users.
        } finally {
            this.activeRequests.delete(active);
        }
    }
}

const NEIGHBOR_ALLOWLIST: Record<string, string> = {
    'neighbor.sergey-agadzhanov.ampscript': 'sergey-agadzhanov.ampscript',
    'neighbor.FiB.ssjs-vsc': 'FiB.ssjs-vsc',
    'neighbor.FiB.beautyAmp': 'FiB.beautyAmp',
    'neighbor.sfmc-language': 'joernberkefeld.sfmc-language',
    'neighbor.sfmc-devtools': 'Accenture-oss.sfmc-devtools-vscode',
    'neighbor.sfmc-data': 'joernberkefeld.sfmc-data',
    'neighbor.mso-conditionals': 'joernberkefeld.mso-conditionals',
    'neighbor.sfmc-extension-pack': 'joernberkefeld.sfmc-extension-pack',
    'neighbor.sfmc-extension-pack-plus': 'joernberkefeld.sfmc-extension-pack-expanded',
    'neighbor.markdown-preview-bitbucket-innersource':
        'joernberkefeld.markdown-preview-bitbucket-innersource',
};

/**
 * Compute passive extension co-installation properties.
 * @param selfId - caller's publisher-qualified extension id
 * @returns flat ecosystem booleans
 */
export function detectEcosystem(selfId: string): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    let isCoInstalledAsDependency = false;
    let isCoInstalledInPack = false;
    for (const extension of vscode.extensions.all) {
        if (extension.id === selfId) continue;
        const package_ = extension.packageJSON as {
            extensionDependencies?: string[];
            extensionPack?: string[];
        };
        if (package_.extensionDependencies?.includes(selfId)) isCoInstalledAsDependency = true;
        if (package_.extensionPack?.includes(selfId)) isCoInstalledInPack = true;
    }
    result.coInstalledAsDependency = isCoInstalledAsDependency;
    result.coInstalledInPack = isCoInstalledInPack;
    for (const [label, fullId] of Object.entries(NEIGHBOR_ALLOWLIST)) {
        if (fullId !== selfId) result[label] = vscode.extensions.getExtension(fullId) !== undefined;
    }
    return result;
}
