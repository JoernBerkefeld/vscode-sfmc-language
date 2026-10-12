import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESLint } from 'eslint';

const filePath = 'client/src/formatting-regression.ts';
const samples = [
    `/**
 * Return the supplied text.
 * @param text - Text to return.
 * @returns The supplied text.
 */
export function echo(text: string): string {
    return text;
}
`,
    `export class TextFormatter {
    /**
     * Return the supplied text.
     * @param text - Text to return.
     * @returns The supplied text.
     */
    echo(text: string): string {
        return text;
    }
}
`,
];

test('ESLint autofix preserves starred JSDoc including indented comments', async () => {
    const eslint = new ESLint({ fix: true });
    const config = await eslint.calculateConfigForFile(filePath);
    assert.equal(config.rules['unicorn/no-asterisk-prefix-in-documentation-comments'][0], 0);
    assert.equal(config.rules['jsdoc/check-alignment'][0], 1);

    for (const source of samples) {
        const [result] = await eslint.lintText(source, { filePath });
        assert.deepEqual(result.messages, []);
        assert.equal(result.output ?? source, source);
    }
});
