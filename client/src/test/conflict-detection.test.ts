import * as vscode from 'vscode';
import * as assert from 'node:assert';
import { CONFLICTING_EXTENSIONS, SUPPRESS_KEY } from '../extension';
import { activate } from './helper';

suite('Conflict detection — static data', () => {
    test('CONFLICTING_EXTENSIONS contains xnerd.ampscript-language', () => {
        const ids = CONFLICTING_EXTENSIONS.map((entry) => entry.id);
        assert.ok(
            ids.includes('xnerd.ampscript-language'),
            'xnerd.ampscript-language must be listed as a conflicting extension'
        );
    });

    test('CONFLICTING_EXTENSIONS contains FiB.beautyAmp', () => {
        const ids = CONFLICTING_EXTENSIONS.map((entry) => entry.id);
        assert.ok(
            ids.includes('FiB.beautyAmp'),
            'FiB.beautyAmp must be listed as a conflicting extension'
        );
    });

    test('every entry has a non-empty id and name', () => {
        for (const entry of CONFLICTING_EXTENSIONS) {
            assert.ok(entry.id.length > 0, `id must not be empty (got: ${JSON.stringify(entry)})`);
            assert.ok(
                entry.name.length > 0,
                `name must not be empty (got: ${JSON.stringify(entry)})`
            );
        }
    });

    test('every id follows the publisher.extensionName format', () => {
        const validId = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_.-]+$/;
        for (const entry of CONFLICTING_EXTENSIONS) {
            assert.ok(
                validId.test(entry.id),
                `"${entry.id}" does not match publisher.extensionName format`
            );
        }
    });

    test('SUPPRESS_KEY is a non-empty string', () => {
        assert.strictEqual(typeof SUPPRESS_KEY, 'string');
        assert.ok(SUPPRESS_KEY.length > 0);
    });
});

suite('Conflict detection — VS Code integration', () => {
    suiteSetup(async () => {
        // Ensure the extension is active before running integration tests
        const extension = vscode.extensions.getExtension('joernberkefeld.sfmc-language');
        if (extension && !extension.isActive) {
            await extension.activate();
        }
    });

    test('suppressConflictWarning setting is registered and defaults to false', async () => {
        // activate() waits for the extension to be fully active
        const { getDocumentUri } = await import('./helper');
        await activate(getDocumentUri('test-ampscript.amp'));

        const config = vscode.workspace.getConfiguration('sfmcLanguageServer');
        const value = config.get<boolean>('suppressConflictWarning');
        assert.strictEqual(value, false, 'suppressConflictWarning should default to false');
    });

    test('conflicting extensions are not active in the test host', () => {
        for (const entry of CONFLICTING_EXTENSIONS) {
            const extension = vscode.extensions.getExtension(entry.id);
            assert.ok(
                !extension || !extension.isActive,
                `Conflicting extension "${entry.id}" must not be active in the test environment`
            );
        }
    });

    test('extension does not bundle an extensionPack (standalone extension)', () => {
        const extension = vscode.extensions.getExtension('joernberkefeld.sfmc-language');
        assert.ok(extension, 'sfmc-language extension must be present');
        // This extension is standalone. Users who want a curated set of SFMC
        // extensions should install one of the dedicated *-extension-pack extensions,
        // so this manifest must not declare its own extensionPack.
        assert.strictEqual(
            extension.packageJSON?.extensionPack,
            undefined,
            'sfmc-language must not declare an extensionPack'
        );
    });

    test('mcpServerDefinitionProviders includes sfmcLanguageMcp', () => {
        const extension = vscode.extensions.getExtension('joernberkefeld.sfmc-language');
        assert.ok(extension, 'sfmc-language extension must be present');
        const providers = extension.packageJSON?.contributes?.mcpServerDefinitionProviders;
        assert.ok(Array.isArray(providers), 'mcpServerDefinitionProviders must be an array');
        const ids = providers.map((p: { id?: string }) => p.id);
        assert.ok(
            ids.includes('sfmcLanguageMcp'),
            'mcpServerDefinitionProviders must include id "sfmcLanguageMcp"'
        );
    });

    test('sfmc-language.showOutput command is contributed in the manifest', () => {
        const extension = vscode.extensions.getExtension('joernberkefeld.sfmc-language');
        assert.ok(extension, 'sfmc-language extension must be present');
        const contributed: { command: string }[] =
            extension.packageJSON?.contributes?.commands ?? [];
        assert.ok(Array.isArray(contributed), 'contributes.commands must be an array');
        const ids = contributed.map((c) => c.command);
        assert.ok(
            ids.includes('sfmc-language.showOutput'),
            'contributes.commands must include "sfmc-language.showOutput"'
        );
    });

    test('sfmc-language.showOutput command is registered at runtime', async () => {
        const { activate, getDocumentUri } = await import('./helper');
        await activate(getDocumentUri('test-ampscript.amp'));
        const allCommands = await vscode.commands.getCommands(true);
        assert.ok(
            allCommands.includes('sfmc-language.showOutput'),
            '"sfmc-language.showOutput" must be registered after activation'
        );
    });

    test('sfmc-language.showWhatsNew command is contributed in the manifest', () => {
        const extension = vscode.extensions.getExtension('joernberkefeld.sfmc-language');
        assert.ok(extension, 'sfmc-language extension must be present');
        const contributed: { command: string }[] =
            extension.packageJSON?.contributes?.commands ?? [];
        const ids = contributed.map((c) => c.command);
        assert.ok(
            ids.includes('sfmc-language.showWhatsNew'),
            'contributes.commands must include "sfmc-language.showWhatsNew"'
        );
    });

    test('sfmc-language.showWhatsNew command is registered at runtime', async () => {
        const { activate, getDocumentUri } = await import('./helper');
        await activate(getDocumentUri('test-ampscript.amp'));
        const allCommands = await vscode.commands.getCommands(true);
        assert.ok(
            allCommands.includes('sfmc-language.showWhatsNew'),
            '"sfmc-language.showWhatsNew" must be registered after activation'
        );
    });
});
