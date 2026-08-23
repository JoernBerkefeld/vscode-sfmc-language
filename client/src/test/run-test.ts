import path from 'node:path';

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

        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                fixtureWorkspace,
                '--disable-extensions',
                '--disable-workspace-trust',
                '--skip-welcome',
                '--skip-release-notes',
            ],
        });
    } catch {
        console.error('Failed to run tests');
        process.exit(1);
    }
}

main();
