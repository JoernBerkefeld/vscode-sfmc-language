import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { runTests } from '@vscode/test-electron';

/**
 * Launch the integration-test host against the fixture workspace so formatter
 * coexistence can write settings without VS Code toasting a workspace-write error.
 */
async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
        const extensionTestsPath = path.resolve(__dirname, './index');
        const fixtureWorkspace = path.resolve(__dirname, '../../testFixture');
        const userDataDirectory = mkdtempSync(path.join(tmpdir(), 'sfmc-extension-test-'));

        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                fixtureWorkspace,
                `--user-data-dir=${userDataDirectory}`,
                '--disable-extensions',
                '--disable-workspace-trust',
                '--skip-welcome',
                '--skip-release-notes',
            ],
        });
    } catch (error) {
        console.error('Failed to run tests', error);
        process.exit(1);
    }
}

main();
