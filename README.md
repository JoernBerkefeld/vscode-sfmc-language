# SFMC Language Service for VS Code

A Visual Studio Code extension providing comprehensive language support for **Salesforce Marketing Cloud Engagement** and **Marketing Cloud Next** — **AMPscript**, **SSJS** (Server-Side JavaScript), **GTL** (Guide Template Language), and **MCN Handlebars**. HTML files containing SFMC content are auto-detected and switched to the combined **SFMC (AMPscript / SSJS)** language, and `.hbs` (Handlebars) files receive always-on Marketing Cloud Next intelligence — all without any manual file-type changes.

## Feature Overview

| Feature | AMPscript (`.amp`) | SSJS (`.ssjs`) | SFMC HTML (`.html`) | Handlebars (`.hbs`) |
| -------------------------------- | :----------------: | :------------: | :-----------------: | :-----------------: |
| Syntax highlighting | ✓ | ✓ | ✓ (auto-detected) | ✓ (built-in) |
| Auto-completion | ✓ | ✓ | ✓ | ✓ |
| Hover / IntelliSense | ✓ | ✓ | ✓ | ✓ |
| Signature help | ✓ | ✓ | ✓ | ✓ |
| Go-to definition | — | ✓ | ✓ | — |
| Diagnostics / errors | ✓ | ✓ | ✓ | ✓ |
| Variable resolution | planned | ✓ | ✓ | — |
| Snippets | 36 | 18 | via sfmc language | via handlebars |

**Variable resolution** means the language service infers the concrete type (and where possible, the value) held in a variable. Hovering over a local variable reveals its resolved type rather than a generic `any`. This is fully available in SSJS and planned for AMPscript in a future release.

## AMPscript

### Syntax Highlighting

- Block syntax (`%%[ ... ]%%`) and inline expressions (`%%= ... =%%`)
- `<script runat="server" language="ampscript">` blocks (flexible attribute order, single/double quotes)
- Variables (`@name`), system variables (`@@ExecCtx`), keywords, operators, strings, comments, function calls
- Personalization strings (`%%FirstName%%`, `%%emailaddr%%`)

### Auto-Completion

- **150 AMPscript functions** with snippet-style parameter placeholders, organized across 14 categories (Content, Data Extension, HTTP, String, Math, and more — see `ampscript-data`)
- **17 keywords** with contextual snippets (`var`, `set`, `if`/`then`/`elseif`/`else`/`endif`, `for`/`to`/`downto`/`do`/`next`, `and`/`or`/`not`, `true`/`false`)
- **74 system personalization strings** with descriptions (subscriber identity, email/job metadata, dates, sender info, URLs, MobileConnect demographics, GroupConnect, execution context)
- **File-scoped variable suggestions** extracted from `@variable` declarations in the current document
- Context-aware — completions only appear inside AMPscript regions

### Hover / IntelliSense

- Typed function signatures with full parameter documentation
- Required / optional parameter markers
- Return type information and usage examples
- Keyword and personalization string documentation

### Signature Help

- Parameter hints while typing function arguments
- Active parameter highlighted as you type commas

### Diagnostics

- **Delimiter matching**: unmatched `%%[`/`]%%` and `%%=`/`=%%` pairs (both directions)
- **Nesting-aware control flow**: stack-based `IF`/`ENDIF` and `FOR`/`NEXT` validation with line-level error locations
- **Unknown function detection**: flags function calls not in the AMPscript catalog
- **Best-practice hints**: informational warnings for bare subscriber attribute access without `AttributeValue()` wrapping

### Marketing Cloud Next compatibility (`sfmcLanguageServer.targetPlatform`)

Set **`sfmcLanguageServer.targetPlatform`** to `"next"` (default: `"engagement"`) to enable MCN-mode diagnostics. Engagement mode is completely unchanged — the setting is additive.

| Setting value | Behaviour |
|---|---|
| `"engagement"` (default) | Existing diagnostics only — no MCN-specific checks |
| `"next"` | Adds errors for MCN-unsupported functions and SSJS blocks; adds information hints for functions with behavioral differences |

**In `"next"` mode:**

- **Error** for any AMPscript function not available in Marketing Cloud Next (41 of 150 functions are supported). Example: `InsertDE`, `AttachFile`, `ContentArea` → `"InsertDE is not supported in Marketing Cloud Next."`
- **Information** for supported functions with behavioral differences (`FormatDate`, `Lookup`, `StringToDate`) — the note is shown in the Problems panel at the call site so you can act on it before deploying
- **Error** on any `<script runat="server">` block — SSJS is not supported in Marketing Cloud Next
- **MCN Handlebars** support activates: validation, completions, hover, signature help, and code actions for `{{...}}` mustaches and `{!$...}` built-in bindings. Binding hovers link to the Salesforce Developers documentation.

**Hover cards** always show the MCN support line regardless of the setting: `"Supported in Marketing Cloud Next (API v67.0+)"` or `"Not supported in Marketing Cloud Next"`, so you can check at a glance without switching modes.

### Variable Resolution

Variable resolution — inferring the type or value held by a `@variable` at any point in the file — is **planned** for a future release. The extension does not yet provide type-aware hover or diagnostics for AMPscript variables.

### Snippets

36 built-in snippets:

| Prefix | Description |
| ------------------------------------------------------ | ------------------------------------------ |
| `ampblock` | AMPscript block delimiters |
| `ampinline` | Inline output expression |
| `vout` | Variable output (`%%=v(@var)=%%`) |
| `ampvar` / `ampset` / `ampvarset` | Variable declaration and assignment |
| `ampif` / `ampifelse` / `ampifelseif` | Conditional blocks |
| `ampfor` / `ampforrows` | FOR loops (counting and row-set iteration) |
| `amplookup` / `amplookuprows` / `amplookuporderedrows` | Data Extension lookups |
| `amphttpget` / `amphttppost` | HTTP requests with error handling |
| `ampcloudpagesurl` | CloudPages URL builder |
| `ampcontentblock` | Content Builder block inclusion |
| `ampattrval` | Safe attribute retrieval |
| `ampempty` | Empty check with default |
| `ampupsertdata` / `ampinsertdata` | Data Extension DML |
| `ampcreateobject` | SOAP API object creation |
| `ampscripttag` | Script tag block |
| `amptemplate` | Full email template boilerplate |
| `ampssjs` | AMPscript-in-SSJS bridge pattern |
| `amptreatascontent` | TreatAsContent from SSJS |
| `ampredirectto` | Redirect to CloudPage |
| `ampdateformat` | Common date format patterns |
| `amprowsetloop` | RowSet loop with error check |

## SSJS (Server-Side JavaScript)

### Syntax Highlighting

- Standard JavaScript syntax, extended with SFMC-specific patterns
- `<script runat="server">` block recognition (without `language="ampscript"`)

### Auto-Completion

- **298 SFMC-specific completions** sourced from `ssjs-data`: 50 `Platform.Function.*` methods, 27 bare SSJS globals (`Stringify`, `Now`, `Write`, `GUID`, and more), 206 Core Library object methods across 39 objects, and 15 WSProxy operations — plus **60 ES3/ES5 built-in** completions (Array, String, Number, Object, Math, etc.)
- **`Platform.Function.*`**, **`Platform.Variable.*`**, **`Platform.Response.*`**, **`Platform.Request.*`** methods
- **Core library objects** with full method listings: `DataExtension`, `Subscriber`, `TriggeredSend`, `HTTP`, `Guard`, and more — available after `Platform.Load("Core", "1.1.5")`
- **WSProxy** method completions for `new Script.Util.WSProxy()`
- **Bare-name globals** (`Stringify()`, `Now()`, `GUID()`, etc.) alongside their `Platform.Function.*` equivalents
- **Context-aware member completions**: after a `.` only the relevant members are shown — the full global list is not injected into member-access positions

### Hover / IntelliSense

- **TypeScript-powered**: completions, hover, and diagnostics are backed by an embedded TypeScript language service with full SFMC type declarations — accurate, type-aware suggestions for all SFMC globals
- Function signature with parameter names and types
- `ssjs.guide` reference links embedded in hover cards
- `@deprecated` notices for functions that should not be used in new code
- `@remarks requiresCoreLoad` hints where `Platform.Load("Core", "1.1.5")` is required

### Signature Help

- Parameter hints while typing function arguments
- Active parameter highlighted as you type commas
- `ssjs.guide` links shown alongside the active signature

### Go-to Definition

- Navigate to SFMC function and object declarations in the bundled type definition file

### Diagnostics

- **Missing `Platform.Load`**: flags calls to Core Library objects (`DataExtension`, `HTTP.Get`, etc.) and bare globals (`Stringify()`, `Now()`, `GUID()`, etc.) when `Platform.Load("Core", "1.1.5")` has not been called **before** that line — order-aware
- **ES6+ syntax errors**: `let`/`const`, arrow functions, `for...of`, generator functions, spread `...`, destructuring are flagged as errors (SSJS runs in ES3/ES5 only)
- **TypeScript type diagnostics**: type-aware errors powered by the embedded TypeScript service
- **Non-functional Core methods**: **Warning** on Core Library methods that resolve and are callable but never take effect on a live business unit — covers static calls such as `FilterDefinition.Update(...)` as well as instance calls on objects created via `Init(...)`
- **MCN incompatibility** (when `sfmcLanguageServer.targetPlatform` is `"next"`): **Error** on any `<script runat="server">` block — SSJS is not supported in Marketing Cloud Next

#### Suppressing "Cannot find name" for cross-file variables

SFMC CloudPages and emails often rely on variables that are defined in another asset — such as a global DEBUG flag set in a parent page, a subscriber key passed via AMPscript, or a configuration variable set in an included script. The embedded TypeScript service does not see those other files and will report them as unknown names.

Use an ESLint-style file-level `/* global */` comment to tell the extension which names are supplied by the surrounding context. The comment must appear at the top of the `.ssjs` file (or inside a `<script runat="server">` block for SFMC HTML files):

```javascript
/* global DEBUG, deKey */

if (DEBUG) {
    Write(deKey);
}
```

Multiple names are separated by commas. The `:readonly` / `:writable` qualifiers used by ESLint are accepted for compatibility but have no effect on TypeScript diagnostics — all declared names are treated as `any`:

```javascript
/* global DEBUG:readonly, deKey:writable */
```

You can also use `/* globals */` (with a trailing `s`) — both spellings work identically. The declarations are scoped to the current document and are removed when the file is closed, so they cannot leak into other open files.

### Variable Resolution

The embedded TypeScript service infers the type — and where possible the concrete value — held by a variable at each point in the file. Hovering over a local variable shows its resolved type (`string`, `number`, a specific object type, etc.) rather than a generic `any`. This works for variables whose initializer has a known type and for variables reassigned within the same scope.

### Snippets

18 built-in snippets:

| Prefix | Description |
| ---------------------------------------------------- | --------------------------------- |
| `ssjsblock` | `<script runat="server">` wrapper |
| `ssjsplatformload` | `Platform.Load("core", "1")` |
| `ssjslookup` / `ssjslookuprows` | Platform.Function lookups |
| `ssjsinsertdata` / `ssjsupsertdata` | Data Extension DML |
| `ssjshttpget` / `ssjshttpgetsimple` / `ssjshttppost` | HTTP requests |
| `ssjswsproxy` / `ssjswsproxycreate` | WSProxy operations |
| `ssjstrycatch` | Try/catch error handling |
| `ssjsde` | DataExtension Init/Retrieve |
| `ssjsvarbridge` | AMPscript variable bridge |
| `ssjsrequestparam` / `ssjsformdata` | Request parameters |
| `ssjsredirect` / `ssjscloudpagesurl` | Navigation |
| `ssjstemplate` | Full CloudPage template |

## HTML Files — SFMC Language

Any `.html` file that contains SFMC content is automatically switched to the **SFMC (AMPscript / SSJS)** language (`sfmc`) — no manual language selection needed.

**Detection triggers** (checked on file open and on every content change, so pasting code into a blank file works immediately):

- AMPscript block: `%%[ ... ]%%`
- AMPscript inline: `%%= ... =%%`
- AMPscript script tag: `<script language="ampscript">`
- SSJS script tag: `<script runat="server">` (without `language="ampscript"`)

**What you get after detection:**

- Language shown in the VS Code status bar as **SFMC (AMPscript / SSJS)** with the blue/yellow icon
- Full AMPscript IntelliSense (completions, hover, signature help, diagnostics) inside `%%[ ]%%` and `%%= =%%` regions
- Full SSJS IntelliSense (completions, hover, signature help, go-to definition, TypeScript diagnostics) inside `<script runat="server">` blocks — with correct line/column offsets back to the HTML document
- Syntax highlighting for both AMPscript and SSJS content within the same file

**Plain HTML files** (no SFMC content) are never affected and remain as `html`.

## GTL (Guide Template Language)

GTL uses `{{ }}` delimiters and is a thin wrapper around AMPscript. The extension provides:

- Context-aware completions inside `{{ }}` — AMPscript functions, variables, and personalization strings
- 8 built-in snippets:

| Prefix | Description |
| -------------------- | ----------------------------------- |
| `gtlexpr` | GTL expression `{{ }}` |
| `gtlvar` | Variable output `{{ v(@var) }}` |
| `gtllookup` | Lookup via GTL |
| `gtlif` | Inline conditional `{{ IIf(...) }}` |
| `gtlcontent` | ContentBlockByKey via GTL |
| `gtlpersonalization` | Personalization string |
| `gtlattrval` | AttributeValue via GTL |
| `gtlformatdate` | Date formatting via GTL |

## Handlebars (`.hbs`) — Marketing Cloud Next

`.hbs` files use VS Code's built-in **Handlebars** language (HTML plus Handlebars), so syntax highlighting works out of the box — no custom language is registered by this extension. On top of that, the extension attaches its language server to Handlebars documents and provides **MCN Handlebars** intelligence for the Salesforce Marketing Cloud Next template engine.

Because Handlebars is a Marketing Cloud Next-only feature, `.hbs` files are **always** treated as `targetPlatform: "next"` regardless of the `sfmcLanguageServer.targetPlatform` setting. You get the same MCN Handlebars support that Engagement HTML files only receive when the setting is switched to `"next"`.

**What you get in `.hbs` files:**

- **Completions** for MCN Handlebars helpers inside `{{ ... }}` mustaches and for built-in `{!$...}` data bindings
- **Hover** documentation for helpers and bindings, with links to the Salesforce Developers documentation
- **Signature help** for helper arguments — MCN helper arguments are whitespace-separated (e.g. `{{substring value 0 3}}`), so hints appear as you type spaces
- **Diagnostics** for unsupported Handlebars constructs (partials, decorators, and built-in helpers absent from MCN's locked-down engine)
- **Code actions** / quick fixes for MCN Handlebars diagnostics

## Status Bar

A compact entry appears in the VS Code status bar (bottom-right) as soon as the extension activates. Its label reflects the active `sfmcLanguageServer.targetPlatform`: **`sfmc-e`** for Engagement and **`sfmc-next`** for Marketing Cloud Next.

- **Spinner** while the language server is starting up.
- **Check mark** once the server is running and ready.
- **Error icon** if the server stops or fails.
- **Click** to open the language server output channel.
- **Hover** for a tooltip with a **Show Output** link, live server status, active trace level (if enabled), a quick **Settings** link, and an **MCE Mode** / **MCNext Mode** line that opens Settings filtered to the `targetPlatform` option. The label and tooltip update automatically when the setting changes.

## Model Context Protocol (MCP) for AI Assistants

This extension registers the **[mcp-server-sfmc](https://www.npmjs.com/package/mcp-server-sfmc)** MCP server with VS Code so **GitHub Copilot agent mode** (and other MCP-aware chat flows) can discover SFMC tooling automatically — validation and lookups for AMPscript and SSJS, diff-aware review, fix suggestions, catalogs as resources, and guided prompts. You do **not** need a separate npm install or a manual `.vscode/mcp.json` entry for that discovery; the server is still loaded via `npx` when the tool runs.

**Finding this extension vs. the MCP Server Gallery in VS Code**

- In the Extensions view, **`@contribute:mcp`** filters extensions that contribute MCP server definitions. This extension appears there because it declares that contribution and registers `mcp-server-sfmc`.
- The **`@mcp`** filter opens the MCP Server Gallery, which is backed by the curated **[GitHub MCP Registry](https://github.com/mcp)** (not the full Marketplace catalog). Publishing the VS Code extension does not add the server to that gallery. The npm package **`mcp-server-sfmc`** is registered as **`io.github.JoernBerkefeld/mcp-server-sfmc`** (see [mcp-server-sfmc](https://github.com/JoernBerkefeld/mcp-server-sfmc) `mcpName` / `server.json`); after a release, metadata is published to the MCP Registry via **`mcp-publisher`** (locally or from CI). Quickstart: [Publish an MCP Server to the MCP Registry](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx). Ensure **`chat.mcp.gallery.enabled`** is on if the gallery does not appear.

**Requirements:** VS Code **1.101 or newer** (see `engines` in this extension's `package.json`). Older versions can add the server manually as described in the [mcp-server-sfmc README](https://github.com/JoernBerkefeld/mcp-server-sfmc/blob/main/README.md) (also covers Cursor, Claude Desktop, Windsurf, and global or local installs).

## File Types

| File pattern | Language | Notes |
| --------------------------------- | --------------------------- | ----------------------------------------------------- |
| `*.ampscript`, `*.amp` | AMPscript | Always |
| `*.ssjs` | SSJS | Always |
| `*.html` containing SFMC content | SFMC (AMPscript / SSJS) | Auto-detected on open and on paste |
| `*.html` without SFMC content | html (unchanged) | Extension does not touch plain HTML |
| `*.hbs` | Handlebars (built-in) | MCN Handlebars intelligence, always in `next` mode |

## Installation

### Option 1: Install from VSIX

1. Build and package:

    ```bash
    npm install
    npm run compile
    npm run package
    ```

2. In VS Code: **Extensions** > `...` > **Install from VSIX...** > select the generated `.vsix` file

### Option 2: Run in Extension Development Host

1. Open the `vscode-sfmc-language` folder in VS Code
2. Run `npm install` and `npm run compile`
3. Press `F5` and choose **Launch Client**
4. Open a `.ampscript`, `.amp`, `.ssjs`, or `.hbs` file in the Extension Development Host

## Configuration

| Setting | Default | Description |
| ---------------------------------------- | ------- | ------------------------------------------------------- |
| `sfmcLanguageServer.maxNumberOfProblems` | `100` | Maximum number of diagnostics reported per file |
| `sfmcLanguageServer.trace.server` | `off` | Traces LSP communication (`off`, `messages`, `verbose`) |

## Architecture

```
vscode-sfmc-language/
├── client/                   Language client (VS Code extension host)
│   ├── src/extension.ts        Starts the LSP server, auto-detects SFMC HTML files
│   └── src/test/               Integration tests (completion, diagnostics, hover)
├── server/                   Language server (Node.js LSP)
│   ├── src/server.ts           LSP adapter — completions, hover, signature help, diagnostics
│   └── src/tsService.ts        Embedded TypeScript language service for SSJS
├── syntaxes/                 TextMate grammars for syntax highlighting
│   ├── ampscript.tmLanguage.json   AMPscript + GTL grammar (includes SSJS embed rules)
│   ├── ssjs.tmLanguage.json        SSJS grammar (extends JavaScript)
│   └── sfmc.tmLanguage.json        SFMC HTML grammar (delegates to ampscript grammar)
├── snippets/                 VS Code snippet definitions
│   ├── ampscript.snippets.json
│   ├── ssjs.snippets.json
│   └── gtl.snippets.json
├── resources/icons/          Language icons (amp, ssjs, sfmc)
├── language-configuration.json      AMPscript bracket/comment/folding config
├── ssjs-language-configuration.json SSJS bracket/comment/folding config
└── package.json              Extension manifest
```

Language intelligence is delegated to two shared packages:

- **`sfmc-language-lsp`** — AMPscript and SSJS function catalog, validators, hover, completions, code actions
- **`ssjs-data`** — SSJS function/object metadata and TypeScript declarations (`sfmc-globals.d.ts`)

## Development

```bash
npm install          # Install root + client + server dependencies
npm run compile      # TypeScript compilation (type-checked)
npm run watch        # Watch mode for development
npm test             # Run integration tests in VS Code instance
npm run lint         # ESLint
npm run package      # Package as .vsix
```

The extension uses **esbuild** for production bundling (`vscode:prepublish`), reducing load time and VSIX size.

## Notes

- AMPscript function metadata is sourced from the `ampscript-data` shared package.
- SSJS function metadata and TypeScript declarations are sourced from the `ssjs-data` shared package.
- This extension provides editing support for SFMC languages — it does not execute AMPscript or SSJS code.
