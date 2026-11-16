/**
 * ts-service.ts
 *
 * The extension's instance of the shared TypeScript-based SSJS service from
 * `sfmc-language-lsp/typescript`. This module only locates `sfmc-globals.d.ts`,
 * wires the extension's diagnostic documentation and exposes the instance's
 * methods under the names the server handlers use.
 */
import * as fs from 'node:fs';
// eslint-disable-next-line unicorn/import-style
import * as path from 'node:path';

import { createSsjsTypeScriptService } from 'sfmc-language-lsp/typescript';
import { getTypescriptDiagnosticUrl } from './diagnostic-documentation';

/**
 * Load the bundled SSJS globals `.d.ts` content used to type the virtual files.
 * @returns the globals declaration file content as a string
 */
function loadGlobalsContent(): string {
    // Resolve the path to ssjs-data via require if possible (handles hoisted installs)
    let resolvedPackagePath: string | undefined;
    try {
        resolvedPackagePath = require.resolve('ssjs-data/package.json');
    } catch {
        // ssjs-data not resolvable via require
    }

    const candidates: string[] = [
        // 1. Installed extension — file copied here by vscode:prepublish (__dirname = server/out/)
        path.resolve(__dirname, 'sfmc-globals.d.ts'),
        // 2. Dev mode — direct sibling install in server/node_modules
        path.resolve(__dirname, '..', 'node_modules', 'ssjs-data', 'dist', 'sfmc-globals.d.ts'),
        // 3. Module-resolution lookup (handles hoisted or alternate install locations)
        ...(resolvedPackagePath
            ? [path.join(path.dirname(resolvedPackagePath), 'dist', 'sfmc-globals.d.ts')]
            : []),
        // 4. Workspace sibling — __dirname is server/out at runtime
        path.resolve(__dirname, '..', '..', '..', 'ssjs-data', 'dist', 'sfmc-globals.d.ts'),
    ];

    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) {
                return fs.readFileSync(p, 'utf8');
            }
        } catch {
            // try next
        }
    }

    return '// sfmc-globals.d.ts not found — SFMC type checking disabled';
}

const service = createSsjsTypeScriptService({
    globalsDts: loadGlobalsContent(),
    diagnosticUrl: getTypescriptDiagnosticUrl,
});

export const updateSsjsDocument = service.updateDocument;
export const removeSsjsDocument = service.removeDocument;
export const getSsjsCompletions = service.getCompletions;
export const getSsjsCompletionInfo = service.getCompletionInfo;
export const getSsjsDiagnostics = service.getDiagnostics;
export const getSsjsHover = service.getHover;
export const getSsjsDefinition = service.getDefinition;
export const getSsjsReferences = service.getReferences;
export const getSsjsSignatureHelp = service.getSignatureHelp;
