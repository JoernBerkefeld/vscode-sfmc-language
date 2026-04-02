# Changelog

All notable changes to the SFMC Language Service extension will be documented in this file.

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
