# Changelog

## [2.0.0] - 2026-03-28

### Added

- **SSJS (Server-Side JavaScript) support**: Language contribution, syntax highlighting, completions, hover documentation, diagnostics, and snippets for `.ssjs` files
- **GTL (Guide Template Language) support**: Completions and snippets for `{{ }}` template expressions
- **SSJS snippets**: `<script runat="server">` block, `Platform.Load`, `Platform.Function.Lookup`, HTTP requests, WSProxy, try/catch, DataExtension patterns
- **GTL snippets**: Expression, variable output, Lookup, IIf, ContentBlockByKey patterns
- **Additional AMPscript snippets**: AMPscript-in-SSJS bridge, TreatAsContent, Redirect, date formatting, RowSet loop with error checking

### Changed

- **Renamed** from `vscode-ampscript-language` to `vscode-sfmc-language` to reflect multi-language support
- **Configuration keys** renamed from `ampscriptLanguageServer.*` to `sfmcLanguageServer.*`
- **Language server** now handles both `ampscript` and `ssjs` document types

## [1.0.0] - 2026-03-27

### Added

- **Complete function catalog**: 147 AMPscript functions with typed signatures, parameter documentation (required/optional), return types, and usage examples across 15 categories
- **80+ personalization strings**: System strings for subscriber identity, email/job metadata, send dates, sender/business unit info, standard URLs, MobileConnect demographics, GroupConnect/LINE, Reply Mail Management, impression regions, and execution context
- **30 built-in snippets**: Common patterns including block/inline delimiters, variable operations, conditionals, loops, DE lookups, HTTP requests, CloudPages URLs, SOAP API, and a full email template boilerplate
- **Guide Template Language (GTL)** syntax highlighting for `{{...}}` expressions
- **Content syndication** syntax highlighting for `%%HTTPGet "url"%%` patterns
- **Personalization string** syntax highlighting for `%%name%%` merge fields in HTML context
- **Best-practice diagnostics**: Informational hints for bare subscriber attribute access without `AttributeValue()` null safety
- **esbuild bundling** for faster extension activation and smaller VSIX size

### Fixed

- **Publisher typo**: Corrected `joernberkefeled` to `joernberkefeld`
- **Sub-package metadata**: Updated `client/package.json` and `server/package.json` from Microsoft LSP sample defaults to match extension identity
- **Configuration default mismatch**: Server-side `maxNumberOfProblems` default now matches the manifest default of 100 (was 200 in server code)
- **Inline delimiter asymmetry**: Diagnostics now detect orphaned `=%%` closers without matching `%%=` openers (previously only detected the reverse)
- **Redundant diagnostic handler**: Replaced direct `validateAmpscriptDocument` call on content change with `diagnostics.refresh()` to avoid conflicts with pull diagnostics

### Improved

- **Nesting-aware control flow diagnostics**: IF/ENDIF and FOR/NEXT checks now use stack-based tracking with line-level error locations instead of global counts
- **String matching in grammar**: Switched from naive regex to begin/end patterns for proper string scope handling
- **Flexible script tag matching**: `<script runat="server" language="ampscript">` now supports any attribute order and single or double quotes
- **Folding markers**: Extended to include `<script>` AMPscript blocks
- **Language configuration**: Added GTL `{{`/`}}` bracket pairs and auto-closing
- **Cross-platform test runner**: Replaced bash-only `scripts/e2e.sh` with Node-based `npm test` command
- **Integration tests**: Completely rewritten to test actual AMPscript completions and diagnostics (was still the Microsoft LSP sample)
- **`.vscodeignore`**: Optimized for esbuild output to reduce VSIX size
- **`undici-types`**: Moved from `dependencies` to `devDependencies` (compile-time only)
