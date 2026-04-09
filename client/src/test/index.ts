import path from 'node:path';
import Mocha from 'mocha';
import { glob } from 'glob';

export function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
    });
    mocha.timeout(100_000);

    const testsRoot = __dirname;

    return glob.glob('**.test.js', { cwd: testsRoot }).then(async (files) => {
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
        } catch (ex) {
            console.error(ex);
            throw ex;
        }
    });
}
