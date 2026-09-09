/**
Documentation owned by the extension's TypeScript adapter, not the shared LSP.
 */
// Static module-relative require lets esbuild embed the root manifest in its bundle.
// Unbundled tsc/watch output stays at server/out, the same depth as server/src.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Static JSON require embeds metadata in esbuild and preserves the direct tsc output layout.
const extensionPackage: { version: string } = require('../../package.json');

/**
Explicitly documented codes exercised by the adapter regression fixtures.
 */
export const DOCUMENTED_TYPESCRIPT_CODES: readonly number[] = [2304, 2339];

/**
 * Resolve a numeric compiler code without inventing undocumented anchors.
 * @param code - the original TypeScript diagnostic code
 * @returns an HTTPS URL pinned to the extension root package version
 */
export function getTypescriptDiagnosticUrl(code: number): string {
    const anchor = DOCUMENTED_TYPESCRIPT_CODES.includes(code) ? `ts${code}` : 'other-diagnostics';
    return `https://github.com/JoernBerkefeld/vscode-sfmc-language/blob/v${extensionPackage.version}/docs/diagnostics/typescript.md#${anchor}`;
}
