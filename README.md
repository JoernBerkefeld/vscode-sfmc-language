# SFMC Language Service for VS Code

A Visual Studio Code extension providing comprehensive language support for **Salesforce Marketing Cloud** — **AMPscript**, **SSJS** (Server-Side JavaScript), and **GTL** (Guide Template Language).

## Features

### Syntax Highlighting

- AMPscript block syntax (`%%[ ... ]%%`)
- Inline AMPscript expressions (`%%= ... =%%`)
- `<script runat="server" language="ampscript">` blocks (flexible attribute order, single/double quotes)
- Variables (`@name`), system variables (`@@ExecCtx`), keywords, operators, strings, comments, function calls
- Personalization strings (`%%FirstName%%`, `%%emailaddr%%`)
- Guide Template Language (GTL) expressions (`{{Name}}`, `{{Lookup(...)}}`)
- Content syndication patterns (`%%HTTPGet "url"%%`)

### Auto-Completion

- **147 AMPscript functions** with snippet-style parameter placeholders, organized across 15 categories (Data Extension, HTTP, Content, Encryption, Math, String, Date/Time, Utility, SOAP API, Salesforce, Dynamics CRM, MobileConnect, Social, Einstein, and more)
- **16 keywords** with contextual snippets (var, set, if/then/elseif/else/endif, for/to/downto/do/next, and/or/not, true/false)
- **80+ system personalization strings** with descriptions (subscriber identity, email/job metadata, dates, sender info, URLs, MobileConnect demographics, GroupConnect, execution context)
- **File-scoped variable** suggestions extracted from the current document
- Context-aware — completions only appear inside AMPscript regions

### Hover / IntelliSense

- Typed function signatures with parameter documentation
- Required/optional parameter markers
- Return type information
- Usage examples
- Keyword and personalization string documentation

### Signature Help

- Parameter hints while typing function arguments
- Active parameter highlighting as you type commas

### Diagnostics

- **Delimiter matching**: Unmatched `%%[`/`]%%` and `%%=`/`=%%` pairs (both directions)
- **Nesting-aware control flow**: Stack-based IF/ENDIF and FOR/NEXT validation with line-level error locations
- **Unknown function detection**: Flags function calls not in the AMPscript catalog
- **Best-practice hints**: Informational warnings for bare subscriber attribute access without `AttributeValue()` wrapping

### SSJS (Server-Side JavaScript)

- **Auto-completions** for `Platform.Function.*`, `Platform.Variable.*`, `Platform.Response.*`, `Platform.Request.*` methods
- **Core library objects** with method listings (DataExtension, Subscriber, TriggeredSend, etc.)
- **WSProxy** method completions
- **Hover documentation** for SSJS globals, Platform functions, and Core library objects
- **Diagnostics**: Missing `Platform.Load("core", "1")` detection, ES6+ syntax warnings

### GTL (Guide Template Language)

- **Context-aware completions** inside `{{ }}` expressions — AMPscript functions, variables, and personalization strings
- **GTL snippets** for common patterns

### Model Context Protocol (MCP) for AI assistants

This extension registers the **[mcp-server-sfmc](https://www.npmjs.com/package/mcp-server-sfmc)** MCP server with VS Code so **GitHub Copilot agent mode** (and other MCP-aware chat flows) can discover SFMC tooling automatically — validation and lookups for AMPscript and SSJS, diff-aware review, fix suggestions, catalogs as resources, and guided prompts. You do **not** need a separate npm install or a manual `.vscode/mcp.json` entry for that discovery; the server is still loaded via `npx` when the tool runs.

**Finding this extension vs. the MCP Server Gallery in VS Code**

- In the Extensions view, **`@contribute:mcp`** filters extensions that contribute MCP server definitions. This extension appears there because it declares that contribution and registers `mcp-server-sfmc`.
- The **`@mcp`** filter opens the MCP Server Gallery, which is backed by the curated **[GitHub MCP Registry](https://github.com/mcp)** (not the full Marketplace catalog). Publishing the VS Code extension does not add the server to that gallery. The npm package **`mcp-server-sfmc`** is registered as **`io.github.JoernBerkefeld/mcp-server-sfmc`** (see [mcp-server-sfmc](https://github.com/JoernBerkefeld/mcp-server-sfmc) `mcpName` / `server.json`); after a release, metadata is published to the MCP Registry via **`mcp-publisher`** (locally or from CI). Quickstart: [Publish an MCP Server to the MCP Registry](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx). Ensure **`chat.mcp.gallery.enabled`** is on if the gallery does not appear.

**Requirements:** VS Code **1.101 or newer** (see `engines` in this extension’s `package.json`). Older versions can add the server manually as described in the [mcp-server-sfmc README](https://github.com/JoernBerkefeld/mcp-server-sfmc/blob/main/README.md) (also covers Cursor, Claude Desktop, Windsurf, and global or local installs).

### Snippets

**AMPscript snippets** (36 built-in):

| Prefix                                                 | Description                                |
| ------------------------------------------------------ | ------------------------------------------ |
| `ampblock`                                             | AMPscript block delimiters                 |
| `ampinline`                                            | Inline output expression                   |
| `vout`                                                 | Variable output (`%%=v(@var)=%%`)          |
| `ampvar` / `ampset` / `ampvarset`                      | Variable declaration and assignment        |
| `ampif` / `ampifelse` / `ampifelseif`                  | Conditional blocks                         |
| `ampfor` / `ampforrows`                                | FOR loops (counting and row set iteration) |
| `amplookup` / `amplookuprows` / `amplookuporderedrows` | Data Extension lookups                     |
| `amphttpget` / `amphttppost`                           | HTTP requests with error handling          |
| `ampcloudpagesurl`                                     | CloudPages URL builder                     |
| `ampcontentblock`                                      | Content Builder block inclusion            |
| `ampattrval`                                           | Safe attribute retrieval                   |
| `ampempty`                                             | Empty check with default                   |
| `ampupsertdata` / `ampinsertdata`                      | Data Extension DML                         |
| `ampcreateobject`                                      | SOAP API object creation                   |
| `ampscripttag`                                         | Script tag block                           |
| `amptemplate`                                          | Full email template boilerplate            |
| `ampssjs`                                              | AMPscript-in-SSJS bridge pattern           |
| `amptreatascontent`                                    | TreatAsContent from SSJS                   |
| `ampredirectto`                                        | Redirect to CloudPage                      |
| `ampdateformat`                                        | Common date format patterns                |
| `amprowsetloop`                                        | RowSet loop with error check               |

**SSJS snippets** (18 built-in):

| Prefix                                               | Description                       |
| ---------------------------------------------------- | --------------------------------- |
| `ssjsblock`                                          | `<script runat="server">` wrapper |
| `ssjsplatformload`                                   | `Platform.Load("core", "1")`      |
| `ssjslookup` / `ssjslookuprows`                      | Platform.Function lookups         |
| `ssjsinsertdata` / `ssjsupsertdata`                  | Data Extension DML                |
| `ssjshttpget` / `ssjshttpgetsimple` / `ssjshttppost` | HTTP requests                     |
| `ssjswsproxy` / `ssjswsproxycreate`                  | WSProxy operations                |
| `ssjstrycatch`                                       | Try/catch error handling          |
| `ssjsde`                                             | DataExtension Init/Retrieve       |
| `ssjsvarbridge`                                      | AMPscript variable bridge         |
| `ssjsrequestparam` / `ssjsformdata`                  | Request parameters                |
| `ssjsredirect` / `ssjscloudpagesurl`                 | Navigation                        |
| `ssjstemplate`                                       | Full CloudPage template           |

**GTL snippets** (8 built-in):

| Prefix               | Description                         |
| -------------------- | ----------------------------------- |
| `gtlexpr`            | GTL expression `{{ }}`              |
| `gtlvar`             | Variable output `{{ v(@var) }}`     |
| `gtllookup`          | Lookup via GTL                      |
| `gtlif`              | Inline conditional `{{ IIf(...) }}` |
| `gtlcontent`         | ContentBlockByKey via GTL           |
| `gtlpersonalization` | Personalization string              |
| `gtlattrval`         | AttributeValue via GTL              |
| `gtlformatdate`      | Date formatting via GTL             |

## File Types

This extension activates for:

- `*.ampscript`, `*.amp` -- AMPscript files
- `*.ssjs` -- Server-Side JavaScript files

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
4. Open a `.ampscript` or `.amp` file in the Extension Development Host

## Configuration

| Setting                                  | Default | Description                                             |
| ---------------------------------------- | ------- | ------------------------------------------------------- |
| `sfmcLanguageServer.maxNumberOfProblems` | `100`   | Maximum number of diagnostics reported per file         |
| `sfmcLanguageServer.trace.server`        | `off`   | Traces LSP communication (`off`, `messages`, `verbose`) |

## Architecture

```
vscode-sfmc-language/
├── client/              Language client (VS Code extension host)
│   ├── src/extension.ts   Starts the language server over IPC
│   └── src/test/          Integration tests (completion, diagnostics)
├── server/              Language server (Node.js LSP)
│   ├── src/server.ts        Completions, hover, signature help, diagnostics
│   ├── src/ampscriptData.ts AMPscript function catalog, keywords, personalization strings
│   └── src/ssjsData.ts     SSJS Platform functions, Core library objects, WSProxy
├── syntaxes/            TextMate grammars for syntax highlighting
│   ├── ampscript.tmLanguage.json   AMPscript + GTL grammar
│   └── ssjs.tmLanguage.json        SSJS grammar (extends JavaScript)
├── snippets/            VS Code snippet definitions
│   ├── ampscript.snippets.json     AMPscript snippets
│   ├── ssjs.snippets.json          SSJS snippets
│   └── gtl.snippets.json           GTL snippets
├── language-configuration.json      AMPscript bracket/comment/folding config
├── ssjs-language-configuration.json SSJS bracket/comment/folding config
└── package.json         Extension manifest
```

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

## Troubleshooting

### `Cannot find module 'undici-types'`

```bash
npm install
npm run compile
```

## Notes

- AMPscript function metadata is sourced from the `ampscript-data` shared package.
- SSJS function metadata is sourced from the `ssjs-data` shared package.
- This extension provides editing support for SFMC languages — it does not execute AMPscript or SSJS code.
