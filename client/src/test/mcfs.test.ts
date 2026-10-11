import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { LanguageClient, State } from 'vscode-languageclient/node';
import {
    activate,
    DEFAULT_ACTIVATION_DEPENDENCIES,
    restoreActivationState,
    snapshotActivationState,
} from '../extension';
import { formatSfmcDocument } from '../formatter';

/**
Small synthetic filesystem; no org, credentials, or remote writes.
*/
class MemoryFiles implements vscode.FileSystemProvider {
    private readonly changes = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile = this.changes.event;
    readonly files = new Map<string, Uint8Array>();
    watch(): vscode.Disposable {
        return new vscode.Disposable(() => {});
    }
    stat(uri: vscode.Uri): vscode.FileStat {
        const content = this.readFile(uri);
        return { type: vscode.FileType.File, ctime: 0, mtime: 0, size: content.length };
    }
    readDirectory(): [string, vscode.FileType][] {
        return [];
    }
    createDirectory(): void {}
    readFile(uri: vscode.Uri): Uint8Array {
        const content = this.files.get(uri.toString());
        if (!content) throw vscode.FileSystemError.FileNotFound(uri);
        return content;
    }
    writeFile(uri: vscode.Uri, content: Uint8Array): void {
        this.files.set(uri.toString(), content);
    }
    delete(uri: vscode.Uri): void {
        this.files.delete(uri.toString());
    }
    rename(): void {
        throw vscode.FileSystemError.NoPermissions();
    }
    dispose(): void {
        this.changes.dispose();
    }
}

/**
Wait for a diagnostic state, subscribing before checking to avoid lost events.
@param uri - Original virtual document URI.
@param isExpected - Required publication state.
@returns Promise resolved by the required state or rejected at the deadline.
*/
function diagnosticsWhen(
    uri: vscode.Uri,
    isExpected: (diagnostics: readonly vscode.Diagnostic[]) => boolean
): Promise<void> {
    return new Promise((resolve, reject) => {
        const check = (): void => {
            if (!isExpected(vscode.languages.getDiagnostics(uri))) return;
            subscription.dispose();
            clearTimeout(timer);
            resolve();
        };
        const subscription = vscode.languages.onDidChangeDiagnostics((event) => {
            if (event.uris.some((changed) => changed.toString() === uri.toString())) check();
        });
        const timer = setTimeout(() => {
            subscription.dispose();
            const diagnostics = JSON.stringify(vscode.languages.getDiagnostics(uri));
            reject(new Error(`No expected diagnostics for ${uri}: ${diagnostics}`));
        }, 10_000);
        check();
    });
}

/**
Assert providers through VS Code commands, not the shared language service.
@param document - Synchronized virtual document.
@param token - Function with meaningful hover.
@param completion - Expected catalog completion label.
*/
async function intelligence(
    document: vscode.TextDocument,
    token: string,
    completion: string
): Promise<void> {
    const position = document.positionAt(document.getText().indexOf(token) + 2);
    const hover = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        document.uri,
        position
    );
    assert.ok(
        hover?.some((item) =>
            item.contents.some((content) =>
                (typeof content === 'string' ? content : content.value).includes(token)
            )
        ),
        `Missing ${token} hover on ${document.uri}`
    );
    const result = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        document.uri,
        position
    );
    assert.ok(
        result?.items.some(
            (item) =>
                (typeof item.label === 'string' ? item.label : item.label.label) === completion
        ),
        `Missing catalog completion ${completion}`
    );
}

suite('MCFS real client integration', () => {
    const files = new MemoryFiles();
    const documents: vscode.TextDocument[] = [];
    const previous = { value: undefined as ReturnType<typeof snapshotActivationState> | undefined };
    const isolated = {
        client: undefined as LanguageClient | undefined,
        context: undefined as vscode.ExtensionContext | undefined,
    };
    let registration: vscode.Disposable;

    /**
    Open synthetic content using MCFS's current language mappings.
    @param name - Virtual basename.
    @param content - Synthetic source.
    @param language - MCFS language assignment.
    @returns Open virtual document.
    */
    async function open(
        name: string,
        content: string,
        language: string
    ): Promise<vscode.TextDocument> {
        const uri = vscode.Uri.parse(`mcfs://regression/${name}`);
        files.writeFile(uri, Buffer.from(content));
        const document = await vscode.languages.setTextDocumentLanguage(
            await vscode.workspace.openTextDocument(uri),
            language
        );
        documents.push(document);
        return document;
    }

    suiteSetup(async () => {
        await vscode.extensions.getExtension('joernberkefeld.sfmc-language')!.activate();
        previous.value = snapshotActivationState();
        assert.ok(previous.value);
        const hostClient = previous.value.client as LanguageClient;
        if (!hostClient.isRunning()) {
            await new Promise<void>((resolve, reject) => {
                const subscription = hostClient.onDidChangeState((event) => {
                    if (event.newState !== State.Running) return;
                    subscription.dispose();
                    clearTimeout(timer);
                    resolve();
                });
                const timer = setTimeout(() => {
                    subscription.dispose();
                    reject(new Error('Host client did not start'));
                }, 10_000);
            });
        }
        await hostClient.stop();
        registration = vscode.workspace.registerFileSystemProvider('mcfs', files, {
            isCaseSensitive: true,
        });
    });

    suiteTeardown(async () => {
        await isolated.client?.stop();
        const subscriptions = isolated.context?.subscriptions ?? [];
        for (const disposable of subscriptions) disposable.dispose();
        // Revert dirty buffers before closing; never save synthetic edits remotely.
        for (const document of documents) {
            await vscode.window.showTextDocument(document);
            await vscode.commands.executeCommand('workbench.action.files.revert');
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
        registration?.dispose();
        files.dispose();
        if (!previous.value) {
            return;
        }

        restoreActivationState(previous.value);
        await previous.value.client!.start();
    });

    test('already-open AMPscript synchronizes at production client activation and edits clear diagnostics', async () => {
        const document = await open(
            'before.amp',
            '%%[\nset @x = Concat("a", "b")\n// invalid comment\n]%%',
            'ampscript'
        );
        assert.strictEqual(document.languageId, 'ampscript');
        assert.strictEqual(isolated.client, undefined, 'Document must precede client construction');
        const extension = vscode.extensions.getExtension('joernberkefeld.sfmc-language')!;
        const context = {
            subscriptions: [],
            extension,
            asAbsolutePath: (relative: string) =>
                vscode.Uri.joinPath(extension.extensionUri, relative).fsPath,
            globalState: { get: () => true, update: async () => {} },
            workspaceState: { get: () => true, update: async () => {} },
        } as unknown as vscode.ExtensionContext;
        isolated.context = context;
        const started = Promise.withResolvers<void>();
        activate(context, {
            ...DEFAULT_ACTIVATION_DEPENDENCIES,
            createClient: (id, name, serverOptions, clientOptions) => {
                const client = new LanguageClient(id, name, serverOptions, clientOptions);
                isolated.client = client;
                return {
                    start: () => {
                        void client.start().then(started.resolve).catch(started.reject);
                    },
                    stop: () => client.stop(),
                };
            },
            createReporter: () => ({
                track: () => false,
                dispose: () => {},
                disposeAsync: async () => {},
            }),
            createStatusBar: () => {},
            setupFormatter: async () => {},
            checkWhatsNew: async () => {},
        });
        await started.promise;
        await intelligence(document, 'Concat', 'Concat');
        await diagnosticsWhen(document.uri, (diagnostics) =>
            diagnostics.some(
                (diagnostic) =>
                    diagnostic.source === 'ampscript' && diagnostic.message.includes('//')
            )
        );
        const cleared = diagnosticsWhen(document.uri, (diagnostics) => diagnostics.length === 0);
        const editor = await vscode.window.showTextDocument(document);
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );
        assert.ok(
            await editor.edit((builder) => {
                builder.delete(fullRange);
                builder.insert(new vscode.Position(0, 0), '%%[\nset @x = Concat("a", "b")\n]%%');
            })
        );
        await cleared;
    });

    test('subsequently opened wrapped script.js gets embedded SSJS providers and diagnostics', async () => {
        assert.ok(isolated.client, 'Previous test must start the real client');
        const document = await open(
            'script.js',
            '<script runat="server">\nPlatform.Load("Core", "1.1.1");\nvar x = Platform.Function.ParseJSON("{}");\nvar y = JSON.parse("{}");\n</script>',
            'sfmc'
        );
        assert.strictEqual(document.languageId, 'sfmc');
        await intelligence(document, 'ParseJSON', 'ParseJSON');
        await diagnosticsWhen(document.uri, (diagnostics) =>
            diagnostics.some(
                (diagnostic) =>
                    diagnostic.source === 'ssjs' && diagnostic.message.includes('JSON.parse')
            )
        );
    });

    for (const [name, language, content] of [
        ['format.amp', 'ampscript', '%%[var @x set @x="a"]%%'],
        [
            'mixed.html',
            'sfmc',
            '<div>%%[var @x set @x="a"]%%</div><script runat="server">var a=1;</script>',
        ],
        ['query.sql', 'sql', 'select a,b from example where a=1'],
    ]) {
        test(`formatting command produces edits for MCFS ${language} without local discovery`, async () => {
            const document = await open(name, content, language);
            const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
                'vscode.executeFormatDocumentProvider',
                document.uri,
                { tabSize: 4, insertSpaces: true }
            );
            assert.ok(edits?.length, `Missing formatting edits for ${language}`);
            assert.notStrictEqual(edits[0].newText, content);
            // A trap on the actual URI proves the formatter never reads fsPath,
            // including config/ignore discovery and synthetic parser selection.
            const virtual = new Proxy(document, {
                get: (target, key) =>
                    key === 'uri'
                        ? new Proxy(target.uri, {
                              get: (uri, property) => {
                                  if (property === 'fsPath')
                                      assert.fail('MCFS must not probe local fsPath');
                                  return Reflect.get(uri, property);
                              },
                          })
                        : Reflect.get(target, key),
            });
            const expected = await formatSfmcDocument(virtual);
            assert.ok(expected);
            const workspaceEdit = new vscode.WorkspaceEdit();
            workspaceEdit.set(document.uri, edits);
            assert.ok(await vscode.workspace.applyEdit(workspaceEdit));
            assert.strictEqual(document.getText().replaceAll('\r\n', '\n'), expected);
        });
    }
});
