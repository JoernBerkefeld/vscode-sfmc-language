# Changelog

All notable changes to the SFMC Language Service extension will be documented in this file.

## [1.3.1] — 2026-04-06

### Added

- **Status bar indicator**: a compact `sfmc` entry in the VS Code status bar shows a spinner while the language server is starting and a check mark once ready. Hover for a tooltip with a **Show Output** link, server status, and a quick **Settings** link. Click the item to open the language server output channel directly.

## [1.3.0] — 2026-04-06

### Added

- **MCP discovery**: the extension contributes a built-in Model Context Protocol server definition so VS Code can discover **mcp-server-sfmc** (validation, lookup, diff review, prompts, resources) for Copilot agent mode without hand-editing `.vscode/mcp.json`. For other editors and advanced configuration, see the [mcp-server-sfmc README](https://github.com/JoernBerkefeld/mcp-server-sfmc/blob/main/README.md).

### Changed

- Minimum supported VS Code version is now **1.101.0** (required for `vscode.lm.registerMcpServerDefinitionProvider`).

### Fixed

- Language server dependency is resolved from the npm package `sfmc-language-lsp` (^0.1.3) instead of a `file:` path, so `npm ci` / GitHub Actions builds succeed on a standalone clone.

## [1.2.4] — 2026-04-06

### Dependencies

- Bundle `sfmc-language-lsp` v0.1.3 (npm publish via GitHub Actions; includes TypeScript build tooling and lockfile fixes for CI).

## [1.2.3] — 2026-04-06

### Dependencies

- Bundle `sfmc-language-lsp` v0.1.2 (ampscript-data ^0.1.3, ssjs-data ^0.2.2 via language service).

## [1.2.2] — 2026-04-02

### Fixed

- SSJS IntelliSense (hover, completions, signature help) now works correctly in unsaved files when the language is manually set to SSJS
- Fixed GitHub Actions workflow permissions for release asset uploads

## [1.2.1] — 2026-04-02

### Fixed

- SSJS IntelliSense (hover, completions, signature help) now works correctly in unsaved files when the language is manually set to SSJS

## [1.0.0] — 2026-03-31

### Added

- AMPscript language support: syntax highlighting, auto-completion, hover documentation, signature help, and diagnostics
- SSJS (Server-Side JavaScript) language support: syntax highlighting, completions for platform functions, WSProxy, DataExtension, and HTTP functions
- GTL (Guide Template Language) snippets
- Language server (LSP) architecture for accurate, context-aware completions and diagnostics
- File association defaults: `.amp` / `.ampscript` → AMPscript, `.ssjs` → SSJS
- Custom file icons for AMPscript and SSJS in the Explorer
- Snippets for common AMPscript and SSJS patterns
