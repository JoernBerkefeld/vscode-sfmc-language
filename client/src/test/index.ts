import path from 'node:path';
import Mocha from 'mocha';
import { glob } from 'glob';

/**
 * Discover and run the Mocha test suite for the extension integration tests.
 * @returns a promise that resolves when all tests pass, or rejects on failure
 */
export async function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
    });
    mocha.timeout(100_000);

    const testsRoot = __dirname;

    const files = await glob.glob('**.test.js', { cwd: testsRoot });
    for (const f of files) mocha.addFile(path.resolve(testsRoot, f));

    try {
        await new Promise<void>((resolve, reject) => {
            mocha.run((failures: number) => {
                if (failures > 0) {
                    reject(`${failures} tests failed.`);
                } else {
                    resolve();
                }
            });
        });
    } catch (error) {
        console.error(error);
        throw error;
    }
}
