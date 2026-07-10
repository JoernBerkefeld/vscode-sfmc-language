import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import jsdoc from 'eslint-plugin-jsdoc';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: [
            '**/node_modules/**',
            'client/out/**',
            'server/out/**',
            'client/testFixture/**',
            '**/*.vsix',
            '**/coverage/**',
            '.vscode-test/**',
        ],
    },
    eslint.configs.recommended,
    eslintPluginPrettierRecommended,
    jsdoc.configs['flat/recommended'],
    eslintPluginUnicorn.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            parserOptions: {
                tsconfigRootDir: import.meta.dirname,
            },
            globals: {
                ...globals.nodeBuiltin,
                Atomics: 'readonly',
                SharedArrayBuffer: 'readonly',
            },
        },
        rules: {
            'no-console': 'warn',
            'jsdoc/require-param-type': 'off',
            'jsdoc/require-returns-type': 'off',
        },
    },
    {
        files: ['client/src/test/**/*.ts'],
        rules: {
            'no-console': 'off',
            'unicorn/no-process-exit': 'off',
            'unicorn/prefer-top-level-await': 'off',
        },
    }
);
