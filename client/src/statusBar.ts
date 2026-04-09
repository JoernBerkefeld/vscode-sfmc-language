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

/** Label shown in the status bar in all states. */
const LABEL = 'sfmc';

/** VS Code codicons used for each lifecycle state. */
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
            })
        );
    }

    setState(next: 'loading' | 'ready' | 'error'): void {
        this.state = next;
        this.refresh();
    }

    private refresh(): void {
        const icon = ICONS[this.state];
        this.item.text = `${icon} ${LABEL}`;
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
}
