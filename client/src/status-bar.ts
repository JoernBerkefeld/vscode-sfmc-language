import {
    commands,
    ExtensionContext,
    MarkdownString,
    StatusBarAlignment,
    StatusBarItem,
    window,
    workspace,
} from 'vscode';
import { LanguageClient, State } from 'vscode-languageclient/node';

const EXT_ID = 'sfmc-language';
const PUBLISHER = 'joernberkefeld';
const CMD_SHOW_OUTPUT = `${EXT_ID}.showOutput`;

/**
 * Settings search query used to reveal the targetPlatform setting.
 */
const TARGET_PLATFORM_QUERY = `@ext:${PUBLISHER}.${EXT_ID} targetPlatform`;

/**
 * Read the configured target platform (workspace/user scope).
 * @returns 'next' when Marketing Cloud Next is selected, otherwise 'engagement'.
 */
function getTargetPlatform(): 'engagement' | 'next' {
    return workspace.getConfiguration('sfmcLanguageServer').get<string>('targetPlatform') === 'next'
        ? 'next'
        : 'engagement';
}

/**
 * VS Code codicons used for each lifecycle state.
 */
const ICONS = {
    loading: '$(loading~spin)',
    ready: '$(check)',
    error: '$(error)',
} as const;

export class SfmcStatusBar {
    private readonly item: StatusBarItem;
    private state: 'loading' | 'ready' | 'error' = 'loading';

    constructor(
        context: ExtensionContext,
        private readonly client: LanguageClient
    ) {
        this.item = window.createStatusBarItem(StatusBarAlignment.Right, 109);
        this.item.name = 'SFMC Language Service';
        this.item.command = CMD_SHOW_OUTPUT;

        this.refresh();
        this.item.show();

        context.subscriptions.push(
            this.item,
            commands.registerCommand(CMD_SHOW_OUTPUT, () => {
                client.outputChannel.show(true);
            }),
            client.onDidChangeState(({ newState }) => {
                if (newState === State.Running) {
                    this.setState('ready');
                } else if (newState === State.Stopped) {
                    this.setState('error');
                } else {
                    this.setState('loading');
                }
            }),
            // Reflect targetPlatform changes (label + tooltip mode line) live.
            workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('sfmcLanguageServer.targetPlatform')) {
                    this.refresh();
                }
            })
        );
    }

    private refresh(): void {
        const icon = ICONS[this.state];
        const label = getTargetPlatform() === 'next' ? 'sfmc-next' : 'sfmc-e';
        this.item.text = `${icon} ${label}`;
        this.item.tooltip = this.buildTooltip();
    }

    private buildTooltip(): MarkdownString {
        const md = new MarkdownString('', true);
        md.isTrusted = true;
        md.supportThemeIcons = true;

        md.appendMarkdown(
            `[$(terminal) Show Output](command:${CMD_SHOW_OUTPUT} "Show SFMC language server output")\n\n`
        );

        md.appendMarkdown('---\n\n');
        md.appendMarkdown('**Status**\n\n');

        if (this.state === 'loading') {
            md.appendMarkdown('$(loading~spin) Language server starting…\n\n');
        } else if (this.state === 'ready') {
            md.appendMarkdown('$(check) Language server ready\n\n');

            const modeLabel = getTargetPlatform() === 'next' ? 'MCNext Mode' : 'MCE Mode';
            const targetPlatformUri =
                `command:workbench.action.openSettings?` +
                encodeURIComponent(JSON.stringify(TARGET_PLATFORM_QUERY));
            md.appendMarkdown(
                `[$(target) ${modeLabel}](${targetPlatformUri} "Change target platform in settings")\n\n`
            );

            const trace = workspace
                .getConfiguration('sfmcLanguageServer')
                .get<string>('trace.server', 'off');
            if (trace !== 'off') {
                md.appendMarkdown(`$(debug-alt) Trace: \`${trace}\`\n\n`);
            }
        } else {
            md.appendMarkdown('$(error) Language server stopped or failed\n\n');
        }

        md.appendMarkdown('---\n\n');

        const settingsUri =
            `command:workbench.action.openSettings?` +
            encodeURIComponent(JSON.stringify(`@ext:${PUBLISHER}.${EXT_ID}`));
        md.appendMarkdown(
            `[**Settings**](${settingsUri} "Open SFMC Language Service settings") ` +
                `&nbsp;[$(gear)](${settingsUri} "Open SFMC Language Service settings")\n\n`
        );

        return md;
    }

    setState(next: 'loading' | 'ready' | 'error'): void {
        this.state = next;
        this.refresh();
    }
}
