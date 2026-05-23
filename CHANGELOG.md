# Changelog

All notable changes to the SFMC Language Service extension will be documented in this file.

## [1.6.0] — 2026-05-23

### Added

- **New `sfmc` language ID**: HTML files containing any SFMC content (AMPscript `%%[…]%%` / `%%= … =%%` / `<script language="ampscript">` blocks, or SSJS `<script runat="server">` blocks) are now automatically switched to the new **SFMC (AMPscript / SSJS)** language rather than to plain AMPscript — displayed with a combined blue/yellow icon in the status bar. `.amp` and `.ssjs` files are unaffected.
- **Live auto-detection on paste**: pasting SFMC content into a new `.html` file now immediately re-evaluates the language — no save or re-open required.
- **SSJS in HTML files**: full SSJS IntelliSense is available inside `<script runat="server">` blocks in HTML:
  - **Completions**: `Platform.*`, `DataExtension`, `WSProxy`, `Math`, `String`, and all other SFMC globals work inside the script tag
  - **Hover**: SFMC function signatures, descriptions, `ssjs.guide` links, and `@deprecated` annotations show when hovering over SSJS code in HTML
  - **Diagnostics**: `requiresCoreLoad` errors, ES6+ errors, and TypeScript type diagnostics are reported at the correct line and column within the HTML file
  - **Signature help**: parameter hints and `ssjs.guide` links work inside SSJS function calls in HTML
  - **Go-to Definition**: navigates to SFMC function definitions from within HTML SSJS blocks
- **Syntax highlighting**: `<script runat="server">` content (without `language="ampscript"`) is now highlighted as SSJS via the TextMate grammar's `ssjs-tag` rule

## [1.5.2] — 2026-05-22

### Fixed

- **Order-aware `Platform.Load` check**: bare globals (`Stringify()`, `Now()`, `GUID()`, etc.) and Core Library objects (`DataExtension`, `HTTP.Get`, etc.) are now only cleared of diagnostics when `Platform.Load("Core","1.1.5")` appears **before** them in the file — a load statement below the usage no longer silences the error for that call
- **`Write()` false-positive removed**: bare `Write()` is a native SSJS output function that does not require `Platform.Load`; the erroneous diagnostic has been removed

### Dependencies

- Bump `sfmc-language-lsp` from 0.2.4 to 0.2.5 (which bundles `ssjs-data` 0.3.4)

## [1.5.1] — 2026-05-22

### Fixed

- **SSJS comment-aware validation**: validators now skip code inside comments, preventing false-positive diagnostics for `Platform.Load`, `let`/`const`, and bare globals when those appear in comments
- **Bare-global diagnostics**: `Stringify()`, `Now()`, `GUID()` and other bare aliases that require `Platform.Load("Core","1")` are now flagged with an error when the load call is missing
- **`ssjs.guide` links for bare aliases**: hover and IntelliSense now show clickable `ssjs.guide` reference links for bare-name globals (`Now()`, `GUID()`, `Stringify()`, etc.) — previously only their `Platform.Function.*` equivalents had links

### Dependencies

- Bump `sfmc-language-lsp` from 0.2.3 to 0.2.4 (which bundles `ssjs-data` 0.3.3)

## [1.5.0] — 2026-05-20

### Added

- **TypeScript IntelliSense for SSJS files**: completions, hover info, and diagnostics for `.ssjs` files are now powered by an embedded TypeScript language service, providing accurate type-aware suggestions for all SFMC Platform functions, WSProxy, DataExtension, HTTP, and ECMAScript built-ins.
- **`@deprecated` indicator in IntelliSense**: hover over deprecated functions (`ContentArea`, `ContentAreaByName`) now shows a `*Deprecated*` notice.
- **`@remarks requiresCoreLoad` hint**: hover over functions requiring `Platform.Load("Core", "1")` (such as `HTTP.Get`, `HTTP.Post`) now shows a `*remarks:* Requires Platform.Load(...)` hint.
- **Merged hover**: SSJS hover now combines the TypeScript type signature with the SFMC description — both are shown together instead of one overriding the other.
- **`new WSProxy()` shorthand**: `WSProxy` is now available as a global constructor alias, so `new WSProxy()` works the same as `new Script.Util.WSProxy()` for completions and type checking.

### Fixed

- **SSJS completions scope**: member-access completions (e.g. `de.`, `api.`, `Platform.Function.`) no longer inject the full list of ~100 SFMC globals into the list — only the relevant members are shown.
- **Extension activation**: the extension now activates on VS Code startup (`onStartupFinished`) so IntelliSense is ready when a `.ssjs` file is opened without needing to open an AMPscript file first.
- **Signature help link rendering**: the `ssjs.guide` reference link in signature help tooltips now renders as a clickable markdown link instead of plain text.
- **Signature help fallback removed**: SSJS signature help now uses only the TypeScript language service; the SFMC LSP fallback is no longer invoked, preventing duplicate or incorrect suggestions.
- **ES6+ diagnostics severity**: ES6+ patterns (`let`, `const`, arrow functions, `for...of`, generator functions, spread `...`, destructuring) are now flagged as **Error** severity (were incorrectly shown as Warning).
- **Missing ES6+ patterns**: `for...of` loops, generator functions, spread operator (`...`), and object/array destructuring are now detected and flagged as errors.
- **False-positive SSJS diagnostics**: argument type-checking now uses a fully-qualified prefix lookup (`WSProxy.retrieve` vs `DateTime.TimeZone.Retrieve`), preventing false positives when different namespaces share a method name. Calls on user-defined variables (e.g. `api.retrieve()`) are no longer flagged.

### Dependencies

- Bump `sfmc-language-lsp` from 0.2.2 to 0.2.3

## [1.4.0] — 2026-04-08

### Added

- **What's New**: after an update, a notification offers to open release notes in a webview, parsed from this changelog for the current version. Use command **SFMC: Show What's New** anytime.

### Changed

- **Extension Pack**: includes **SFMC Data Loader** (`joernberkefeld.sfmc-data`) as a recommended companion extension.

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
