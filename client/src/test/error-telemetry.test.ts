import * as assert from 'node:assert';
import { sanitizeErrorCode, sanitizeErrorName, sanitizeFailureTelemetry } from '../error-telemetry';

suite('errorTelemetry sanitizer', () => {
    test('accepts short Error names and rejects free-form text', () => {
        assert.strictEqual(sanitizeErrorName('TypeError'), 'TypeError');
        assert.strictEqual(sanitizeErrorName('FileSystemError'), 'FileSystemError');
        assert.strictEqual(sanitizeErrorName('Error: boom'), undefined);
        assert.strictEqual(sanitizeErrorName(String.raw`C:\Users\x`), undefined);
        assert.strictEqual(sanitizeErrorName(''), undefined);
    });

    test('accepts identifier codes and small integers, rejects paths', () => {
        assert.strictEqual(sanitizeErrorCode('ENOENT'), 'ENOENT');
        assert.strictEqual(sanitizeErrorCode('FileNotFound'), 'FileNotFound');
        assert.strictEqual(sanitizeErrorCode(1), '1');
        assert.strictEqual(sanitizeErrorCode(-1), undefined);
        assert.strictEqual(sanitizeErrorCode(100_000), undefined);
        assert.strictEqual(sanitizeErrorCode(String.raw`C:\Users\x\settings.json`), undefined);
        assert.strictEqual(sanitizeErrorCode('ENOENT: no such file'), undefined);
    });

    test('never copies message or stack onto the payload', () => {
        const error = {
            name: 'Error',
            code: 'ENOENT',
            message: String.raw`wrote C:\Users\secret\settings.json`,
            stack: 'Error: wrote C:\\Users\\secret\\settings.json\n    at x',
        };
        const properties = sanitizeFailureTelemetry(error, 'claimLanguages');
        assert.deepStrictEqual(properties, {
            errorCategory: 'claimLanguages',
            errorName: 'Error',
            errorCode: 'ENOENT',
        });
        assert.strictEqual(Object.hasOwn(properties, 'message'), false);
        assert.strictEqual(Object.hasOwn(properties, 'stack'), false);
    });
});
