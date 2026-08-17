# Changelog

All notable changes to the SFMC Language Service extension will be documented in this file.

## [3.0.2] - 2026-08-18

### Fixed

- **Extension failed to activate on Windows/macOS (regression in 3.0.0/3.0.1).** The client bundler baked the build machine's absolute path into `import.meta.url`, so the published bundle called `createRequire('file:///home/runner/…')` — a path that only exists on the Linux CI runner. On any other OS this threw `TypeError: The argument 'filename' must be a file URL object, file URL string, or absolute path string` and the extension never started (formatting, completions, hover, and diagnostics were all unavailable). The bundler now resolves the URL at runtime via `pathToFileURL(__filename)`, so it is always valid on the machine that loads the extension.

### Added

- **Bundle regression test** (`npm run test:bundle`, part of `npm test`) that rebuilds the minified client bundle and asserts no absolute build path is baked in, the runtime `import.meta.url` shim is present, and the bundle loads and exports `activate`/`deactivate`.
- **Release guard.** The bundle-integrity check now runs as a dedicated step in both CI workflows (blocking merges and, via `needs: build`, blocking the marketplace publish) and in the pre-commit hook whenever the bundler or client source changes — so a non-portable bundle can no longer be released.

## [3.0.1] - 2026-08-17

### Added

- **Startup status line for formatter coexistence.** On every activation the extension now logs a single line to the **SFMC Prettier Formatter** output channel describing the takeover state — whether the coexistence prompt was already answered for the workspace (memento), whether the admin opt-out is active, which SFMC languages conflict with another formatter, and which (if any) were newly claimed. Makes it auditable why the prompt did or did not appear.

### Changed

- **`sfmcLanguageServer.formatterPromptDismissed: true` is now a full admin opt-out.** When set to `true` in committed workspace/folder (or user) settings, the extension no longer prompts **and** no longer silently writes `editor.defaultFormatter`, leaving a team's pinned formatter choice untouched. An explicit `true` is never removed by the extension (only the transient `false` reset value is auto-removed after the prompt is answered). Previously `true` suppressed only the prompt, not the silent claiming.

## [3.0.0] - 2026-08-14

### Added

- **Built-in document formatter.** The extension now ships a bundled copy of [Prettier](https://prettier.io/) and [`prettier-plugin-sfmc`](https://www.npmjs.com/package/prettier-plugin-sfmc) and runs them in-process, so **Format Document** and **Format on Save** work for AMPscript, SSJS, SFMC HTML (mixed AMPscript/SSJS/Handlebars content), MCN Handlebars, and SQL with no separate Prettier or plugin install. Plain HTML (no SFMC markers) is intentionally left to other formatters.
- **Out-of-the-box formatter setup with coexistence handling.** SFMC languages that have no `editor.defaultFormatter` in workspace/folder settings are claimed silently. When a language already points at a different formatter (the Prettier extension or any other), a prominent modal dialog offers — once per workspace — to switch the conflicting languages too. Informational notifications confirm which languages were claimed or switched.
- **Dedicated "SFMC Prettier Formatter" output channel** that logs each format run (target file, config/ignore file paths, effective options, timing, and errors) in the same style as the Prettier extension.
- Workspace `.prettierrc*` / `.editorconfig` and `.prettierignore` are respected; the bundled plugin is always injected so a second Prettier is never resolved. For full control over the Prettier or plugin version, use the Prettier extension (`esbenp.prettier-vscode`) instead.

### Changed

- **BREAKING:** The extension now registers itself as a document formatter and, on first activation in a workspace, may write `editor.defaultFormatter` entries into workspace settings for SFMC languages that had none. This changes formatting behaviour for existing users. Set `sfmcLanguageServer.enableFormatter` to `false` to opt out entirely, or set `editor.defaultFormatter` per language to choose a different formatter.

### Configuration

- Added `sfmcLanguageServer.enableFormatter` (default `true`) to toggle the built-in formatter.
- Added `sfmcLanguageServer.formatterPromptDismissed` — a temporary reset lever to re-show the coexistence prompt; the extension removes it from settings automatically once answered (the choice is remembered internally per workspace).

## [2.17.0] - 2026-08-13

### Added

- **AMPscript non-functional-at-runtime diagnostics.** Functions that resolve at runtime but have no known working invocation (e.g. `GetPortfolioItem`, `GetPublishedSocialContent`, whose underlying Classic feature is retired) are now flagged as an **error** at the call site. The functions remain in completions and hover — they exist in the language — but every reached call aborts the page. The diagnostic is suppressed when `disableLspDiagnosticsForEslintRules` is enabled, matching the new `eslint-plugin-sfmc` `amp-no-nonfunctional-function` rule.
- **Non-functional functions render struck through in completions**, for both AMPscript and SSJS, the same way deprecated members do — the call site is a bug, so the label reads as struck through. For SSJS this is driven by the bundled `sfmc-globals.d.ts`, which now marks these members `@deprecated` so TypeScript strikes them through and warns (`ts(6385)`) at call sites.

### Changed

- Refreshed the bundled AMPscript catalog: many additional functions are now marked runtime-verified (Math, String, Date/Time, Encryption/Encoding families, `AuthenticatedEmployeeID`, plus a content/HTTP/MC-API/MSCRM sweep), and the Marketing Cloud Next Handlebars equivalence data was corrected so `ContentBlockByKey` maps to `getContentBlock` while `ContentBlockByID` and `ContentBlockByName` are no longer tied to it. The catalog also picks up `minArgs` corrections (`ContentImageByID` / `ContentImageByKey` 2→1, `BarcodeURL` 9→4) and flags `GetPortfolioItem` / `GetPublishedSocialContent` as non-functional at runtime.
- Refreshed the bundled SSJS catalog with runtime-verified return types, a dedicated `HttpGetInstance` type for `Script.Util.HttpGet`, and corrected `Script.Util.HttpRequest` / `HttpResponse` documentation.

### Dependencies

- Bump `sfmc-language-lsp` from `^3.11.0` to `^3.16.0` — adds the `ampscript/nonfunctional-function` diagnostic, strikes non-functional functions through in AMPscript and SSJS completions, and drops the redundant AMPscript hover banner.
- Bump `ampscript-data` (bundled via the language server) from `3.2.0` to `3.5.0` — adds the `handlebarsExact` flag, the `AMPSCRIPT_OPERATORS` export, keyword Handlebars equivalents, and the `nonFunctionalFunctionLookup` export; removes the speculative `mcnHandlebarsGap` field; and lands a large runtime-verification sweep with `minArgs` / parameter corrections.
- Bump `ssjs-data` (bundled via the language server) from `1.5.0` to `1.7.0` — runtime-verified return types, corrected HTTP utility docs, and `@deprecated` tagging of `nonFunctionalAtRuntime` methods in the generated `sfmc-globals.d.ts`.

## [2.16.0] - 2026-08-07

### Added

- New `ssjs/invalid-property-access` diagnostic surfaced from the language server, covering members whose read or write side does not behave the way the property name suggests:
    - Reading a write-only member such as `Script.Util.HttpRequest.postData` is reported as an **error** — the value can only be set, never read back.
    - Reading `Platform.Response.ContentType` or `Platform.Response.CharacterSet` is reported as a **warning** — both return an opaque platform value rather than the string that was assigned to them.
    - Assigning to a read-only `Platform.Request` property (`Method`, `QueryString`, `ClientIP`, …) is reported as an **error** — the assignment is accepted at runtime but silently has no effect.

### Dependencies

- Bump `sfmc-language-lsp` from `^3.10.0` to `^3.11.0`.
- Bump `ssjs-data` (bundled via the language server) to `1.5.0` — adds the `access` attribute and the `propertyAccessLookup` export that drive the new diagnostic.

## [2.15.0] - 2026-08-06

### Added

- Core-version-aware SSJS diagnostics. `ErrorUtil` and `ErrorUtil.ThrowWSProxyError` only exist up to `Platform.Load("Core", "1")`. When a file loads a newer Core version, using them is now reported as an **error** stating the member is undefined at runtime, instead of the generic deprecation warning. Files that load `Core` version `1` keep the previous warning.

### Dependencies

- Bump `sfmc-language-lsp` from `^3.9.0` to `^3.10.0`.
- Bump `ssjs-data` (bundled via the language server) to `1.4.0` — adds the `maxCoreVersion` field and the `maxCoreVersionLookup` export that drive the new diagnostic.

## [2.14.1] - 2026-07-30

### Fixed

- The v2.14.0 VSIX shipped a stale `ssjs-data` catalog: the root lockfile pinned `1.1.1` while `server/package-lock.json` resolved a second, conflicting copy at `1.1.3`. Both lockfiles were regenerated from the registry so exactly one `ssjs-data` version is bundled.

### Changed

- README completion counts corrected against the bundled catalogs: 155 AMPscript functions (41 MCN-supported), 223 SFMC-specific SSJS completions (132 Core Library methods across 41 objects, 14 WSProxy operations), and 127 ECMAScript built-ins.

### Dependencies

- Bump `sfmc-language-lsp` from `^3.8.2` to `^3.8.3`.
- Bump `ssjs-data` (bundled via the language server) from `1.1.1`/`1.1.3` to `1.2.0` — `Reflect` guidance no longer suggests the broken `in` operator, `Intl` / `toLocaleString` / `toLocaleDateString` now point at the AMPscript `FormatNumber` / `FormatDate` functions via `Platform.Function.TreatAsContent` instead of non-existent Platform functions, `Platform.Function.Stringify` examples use `Platform.Response.Write`, plus corrected `Number.prototype.toPrecision`, `decodeURI`, `Boolean`, and `Error` runtime notes.

## [2.14.0] - 2026-07-27

### Added

- New SSJS diagnostic that warns when you call a method on a deprecated Core Library class. It resolves both static calls such as `Send.Definition.Add(...)` and instance calls on variables created via `Init(...)`, and explains what replaced the legacy feature.

### Changed

- Completions for deprecated Core Library classes are now rendered with strike-through and their documentation starts with a `**Deprecated.**` marker.
- Hover for deprecated Core Library classes now opens with a `⚠️ Deprecated.` banner.
- `Portfolio`, `Template`, `Send`, and `Send.Definition` are marked deprecated — they operate on legacy Classic Content / Classic Email Studio objects rather than Content Builder assets.

### Fixed

- The `ssjs/nonfunctional-method` diagnostic now reports as an **Error** instead of a Warning — a method confirmed non-functional at runtime (every tested invocation fails) is not merely "discouraged", so it no longer shares severity with an ordinary deprecation warning.
- Deprecated- and nonfunctional-method diagnostics are now gated by call style: a method's static/instance nature is compared against how it was actually called, so calling an instance-only method in its static form (or vice versa) is no longer misreported as deprecated instead of surfacing as an unknown member.
- Bare deprecated globals such as `ContentArea("key")` and `ContentAreaByName("name")` now emit `ssjs/deprecated` (previously hover/completion showed deprecated, but the diagnostic was missing because the lookup required `type === 'function'` while those catalog rows omit `type`). Deprecated `Platform.Function.ContentArea*` calls are covered the same way.
- The bundled `.d.ts` declarations no longer silently drop the `SendDefinitionInstance` interface or its deprecated methods (including `TestSend`), and `new Error("message")` no longer fails to type-check with "has no construct signatures".
- Restored JSDoc documentation on `Error`/`Number` builtin type declarations (and `EvalError`, `RangeError`, `ReferenceError`, `SyntaxError`, `TypeError`, `URIError`, `Boolean`, `RegExp`) — the fix above for `new Error(...)` construct-signature type-checking had the side effect of silently dropping their description, runtime-verification `@remarks`, official-docs-divergence notes, `@param`, and `@example` from IntelliSense hover.
- `SendInstance.Tracking` in the bundled `.d.ts` no longer references an undeclared `SendTrackingInstance` type — it now correctly resolves to `.Clicks`/`.TotalByInterval` sub-objects, matching the runtime shape and the existing `TriggeredSendTrackingInstance` pattern.
- Added the missing `interface Boolean` declaration to the bundled `.d.ts` so `BooleanConstructor` no longer references `Boolean` as a type with nothing backing it — `new Boolean(...)` type-checks cleanly and boxed instances expose `valueOf()`.

### Dependencies

- Bump `sfmc-language-lsp` from `^3.7.0` to `^3.8.2`.
- Bump `ssjs-data` (bundled via the language server) from `1.0.0` to `1.1.3` — class- and method-level deprecation flags for the Classic Content Core Library classes, the new `coreDeprecatedMethodLookup` export, the fixes listed above, restored JSDoc on constructible ECMAScript built-ins, and the `SendTrackingInstance`/`Boolean` interface fixes.

## [2.13.0] - 2026-07-25

### Added

- New SSJS diagnostic that warns when you call a Core Library method which resolves and is callable but never takes effect on a live business unit. It covers both static calls such as `FilterDefinition.Update(...)` and instance calls on objects created via `Init(...)`, and currently flags the known non-functional methods on `Account`, `AccountUser`, `Portfolio`, `FilterDefinition`, `Send.Definition`, and `TriggeredSend`.

### Changed

- Hover for Core Library methods now surfaces the behaviour observed during live-account verification, including cases where the runtime disagrees with the official documentation.

### Dependencies

- Bump `sfmc-language-lsp` from `^3.6.0` to `^3.7.0`.
- Bump `ssjs-data` (bundled via the language server) from `0.22.0` to `1.0.0` — runtime verification of the Core library, the new `nonFunctionalAtRuntime` flag, 108 newly confirmed entries, and 27 previously blocked entries resolved.

## [2.12.0] - 2026-07-23

### Changed

- SSJS diagnostics now reflect the refined ECMAScript builtin catalog from `ssjs-data` 0.22.0: `String.prototype.search` is treated as a present-but-unreliable builtin (surfaced via hover caveat and differs-from-docs note) rather than a polyfill-required member.

### Dependencies

- Bump `sfmc-language-lsp` from `^3.5.0` to `^3.6.0`.
- Bump `ssjs-data` (bundled via the language server) from `0.21.0` to `0.22.0` — ECMAScript builtin `isConfirmed` backfill (192 entries flagged runtime-verified), `POLYFILLABLE_METHODS` deduplication (7 duplicates removed), and differs-from-official-docs annotations.

## [2.11.0] - 2026-07-22

### Changed

- Bare-name Core globals `Now`, `GUID`, `IsEmailAddress`, `IsPhoneNumber`, `BeginImpressionRegion`, and `EndImpressionRegion` are documented as first-class Core Library entries. Hover and completions reflect their runtime-verified return types (`Now` returns a genuine JavaScript `Date`; `EndImpressionRegion` returns `undefined`).
- Corrected WSProxy method metadata: the obsolete `setBatchSize` method was removed; `getNextBatch` is the runtime-verified batch continuation method.
- Verified return types for `DateTime.SystemDateToLocalDate` and `DateTime.LocalDateToSystemDate` (genuine JavaScript `Date` objects).

### Dependencies

- Bump `sfmc-language-lsp` from `^3.4.1` to `^3.5.0`.
- Bump `ssjs-data` (bundled via the language server) from `0.20.0` to `0.21.0` (bare-name Core alias pages, verified `Date` return types, WSProxy method corrections).

## [2.10.1] - 2026-07-17

### Changed

- Bare-name `Redirect` is now recognized as a runtime-verified SSJS Core global. It is offered in completions again and is no longer flagged as a nonexistent global. `ssjs-data` 0.20.0 verified on a CloudPage that `Redirect` exists after `Platform.Load("core")` when called in the same scope as the load (use `Platform.Response.Redirect` for scope-independent redirects).

### Dependencies

- Bump `sfmc-language-lsp` from `^3.4.0` to `^3.4.1`.
- Bump `ssjs-data` (bundled via the language server) from `0.19.0` to `0.20.0` (verified WSProxy method metadata, `WspResult` type, runtime-verified `Redirect` global).

## [2.10.0] - 2026-07-14

### Added

- **Nonexistent-global diagnostic** for SSJS: bare-name globals that are officially documented but throw a `ReferenceError` at runtime (e.g. `Redirect`) are now flagged as errors, with a hint pointing to the supported replacement.
- **Deprecated diagnostic** for SSJS: deprecated bare-name globals and `ErrorUtil.*` methods (e.g. `ErrorUtil.ThrowWSProxyError`) are flagged as warnings.
- **Deprecated hover banner**: hovering a deprecated SSJS function or method now shows a "Deprecated" banner.

### Changed

- Phantom globals that do not exist at runtime are no longer offered in SSJS completions.

### Dependencies

- Bump `sfmc-language-lsp` from `^3.3.0` to `^3.4.0` (nonexistent-global and deprecated diagnostics, deprecated hover banner).
- Bump `ssjs-data` (bundled via the language server) from `0.18.0` to `0.19.0` (`notDefinedAtRuntime` global exports, phantom/deprecated metadata).

## [2.9.0] - 2026-07-14

### Added

- **HTTP property-value validation** for SSJS: assigning an invalid literal to a `Script.Util.HttpRequest` / `Script.Util.HttpGet` property is now flagged against its allowed values — enum membership, numeric kind, and minimum. Examples caught: `req.method = 'POT'`, `req.emptyContentHandling = 5`, `req.retries = -2.45`.
- **Labeled enum quick-fixes**: replacement suggestions for enum-constrained properties now include the value's meaning, e.g. "Replace with `0` (continue)" and "Replace with `2` (continue to next subscriber - email sends only)".

### Changed

- Polyfill quick-fixes are inserted at the top of the file (after a leading `/* global … */` directive when present), matching the `eslint-plugin-sfmc` quick-fix so both tools place polyfills consistently.

### Dependencies

- Bump `sfmc-language-lsp` from `^3.2.0` to `^3.3.0` (HTTP property-value validation, labeled enum quick-fixes, top-of-file polyfill insertion).
- Bump `ssjs-data` (bundled via the language server) from `0.16.x` to `0.18.0` (`enumLabels` metadata on HTTP property value constraints).

## [2.8.0] - 2026-07-02

### Added

- **MCN Handlebars language support** now reaches the editor: validation, completions, hover, signature help, and code actions for `{{...}}` mustaches and `{!$...}` built-in bindings (powered by `sfmc-language-lsp` 2.x). Handlebars intelligence activates when `sfmcLanguageServer.targetPlatform` is set to `next`.
- **MCN Handlebars snippets** for the `ampscript` and `sfmc` languages (`snippets/mcn-handlebars.snippets.json`).
- **Target-platform status bar item** now reflects the active `targetPlatform`: it shows `sfmc-e` for Engagement and `sfmc-next` for Next, and its tooltip adds an _MCE Mode_ / _MCNext Mode_ line that opens Settings pre-filtered to `@ext:joernberkefeld.sfmc-language targetplatform`. The item refreshes automatically when the setting changes.
- Syntax highlighting for the combined `sfmc` grammar now covers MCN Handlebars mustaches and bindings.

### Changed

- Signature help now also triggers on space, so parameter hints appear while typing arguments to a Handlebars helper.
- Binding hovers include a **Salesforce Developers** documentation link.

### Dependencies

- Bump `sfmc-language-lsp` from `^1.10.2` to `^2.0.1` (MCN Handlebars language service, binding hover doc link, parameterless-helper `@return` formatting).
- Bump `handlebars-data` (bundled via the language server) to `0.2.0` (built-in bindings carry `docUrl`).

## [2.7.1] - 2026-06-25

### Fixed

- Typing `RegExp` (without a trailing dot) no longer offers `RegExp.prototype` instance members (`test`, `exec`, `lastIndex`, `global`, `source`, …) as bare global completions. Those members are only valid on a `RegExp` instance, so suggesting them as standalone identifiers produced misleading completions and TypeScript "property does not exist" squiggles. Prototype/instance members are now excluded from global completions; the `RegExp` constructor is still offered as a bare identifier.
- Required parameters of ECMAScript built-ins are no longer typed as optional in hover and diagnostics. `Date.parse(dateString)` (required per MDN) and 30+ siblings — `Math.pow`/`atan2`, `parseInt`/`parseFloat`/`isNaN`/`isFinite`, `Object.defineProperty`, `Object.hasOwnProperty`, `Date.UTC`, `String.charAt`/`match`/`replace`/`slice`/`split` — now correctly require their leading arguments.

### Dependencies

- Bump `sfmc-language-lsp` from `^1.9.2` to `^1.10.2` (RegExp global-completion fix, required-parameter arity fix).
- Bump `ssjs-data` (bundled via the language server) from `0.11.1` to `0.12.1` (corrected required-parameter optionality in the generated type declarations).

## [2.7.0] - 2026-06-24

### Added

- **Insert polyfill** quick-fix for SSJS: when a diagnostic flags a polyfillable ES3/ES5/ES6 member, the lightbulb inserts the verified ES3-safe polyfill source (with full JSDoc — description, `@param` incl. `[]` for optional, `@returns`). The polyfill is placed **after** a leading `/* global … */` directive when present, otherwise at the top of the file, and is skipped if already present.
- **Replace with Platform.Function** quick-fix: rewrites `JSON.parse(...)` to `Platform.Function.ParseJSON(...)` and `JSON.stringify(...)` to `Platform.Function.Stringify(...)`.
- Method hover now shows the SFMC-engine **caveat** below the description for built-ins that behave incorrectly (e.g. `String.search` returning the wrong index).

### Changed

- SSJS `ssjs/polyfill-required` diagnostic now fires **only** for members that have a verified polyfill available; members with no polyfill are left to TypeScript's native diagnostics, removing duplicate squiggles. Diagnostic wording distinguishes "broken" vs "unavailable" members.
- The `sfmcLanguageServer.disableLspDiagnosticsForEslintRules` setting description now documents that it also suppresses the SSJS unavailable/broken/polyfillable diagnostics covered by `eslint-plugin-sfmc`'s `ssjs/no-unavailable-method` rule.

### Fixed

- **Go to Definition** on a polyfilled method (both at the polyfill declaration and at call sites) now lands on the `Ctor.prototype.method = …` assignment line instead of the preceding JSDoc comment.
- `HTTP.Get` / `HTTP.Post` results no longer report a false `Property does not exist on type 'object'` error. Their return types are now `{ Status: number, Content: string }` and `{ StatusCode: string, Response: string }` respectively.
- Polyfilled `Array.prototype.map` / `forEach` callbacks no longer trigger a spurious `No overload matches this call` (sfmc-ts 2769); static polyfills like `Array.isArray` no longer report `Property does not exist on type 'ArrayConstructor'` (sfmc-ts 2339).

### Dependencies

- Bump `sfmc-language-lsp` from `^1.7.1` to `^1.9.2` (insert-polyfill quick-fix, `JSON` → `Platform.Function` quick-fix, `polyfill-required` diagnostic, caveat hover).
- Bump `ssjs-data` (bundled via the language server) from `0.9.0` to `0.11.1` (`KNOWN_UNSUPPORTED`, gap-filling polyfills, stronger `String.search` caveat, corrected `HTTP.Get` / `HTTP.Post` return object shapes).

## [2.6.0] - 2026-06-21

### Added

- **Find All References** for SSJS symbols (variables and functions) — right-click → _Find All References_ / `Shift+F12` now lists every usage in the file.

### Fixed

- Optional JSDoc parameters (`@param {Type} [name]`) on polyfill / user methods now produce an optional TypeScript parameter, so calling the method with fewer arguments no longer reports a spurious `Expected N arguments, but got M` error and hover keeps the declared type instead of falling back to `any`.
- JSDoc type annotations that reference user-defined or undeclared types (e.g. `@typedef`, `@property {WSProxy} …`) no longer trigger false `Cannot find name` / `Duplicate identifier` diagnostics. Type validation is now scoped to executable code; types named only inside JSDoc comments are not checked.
- A polyfill assignment such as `Array.prototype.map = function(){…}` no longer breaks the generated declaration merge (the preceding-JSDoc extractor previously over-captured intervening source), which had caused a spurious `Property 'map' does not exist on type 'any[]'` error.
- No more false `Generator functions are not supported` diagnostic when a regular `function` keyword is followed by a JSDoc block on a later line.

### Dependencies

- Bump `sfmc-language-lsp` from `^1.7.0` to `^1.7.1` (generator-function diagnostic fix)
- Bump `ssjs-data` (bundled via the language server) from `0.8.0` to `0.9.0` (constructible built-ins, HTTP/WSProxy result property types, MDN doc links, `ParseJSON`/`Stringify` return-type corrections)

## [2.5.0] - 2026-06-19

### Added

- ECMAScript built-in hovers now include an official **MDN** documentation link next to the existing `ssjs.guide` reference. Instance methods deep-link to the exact MDN page (e.g. `Array.prototype.slice` → `.../Global_Objects/Array/slice`), constructors and global functions resolve to their reference pages, and unrecognized owners fall back to an MDN search URL.

### Changed

- `Array.prototype.splice` polyfill documentation corrected to use MDN parameter names and to note that the engine bug only surfaces once the third (insertion) argument and beyond are used; calls limited to the first two arguments behave correctly.
- All ECMAScript built-ins (including previously missing ones) are now discoverable via `ssjs.guide` search and resolve to a documentation page from hover.

### Dependencies

- Bump `sfmc-language-lsp` from `^1.6.0` to `^1.7.0` (MDN hover links)
- Bump `ssjs-data` (transitively) from `0.6.0` to `0.8.0` (splice polyfill fix, builtin search indexing, `mdnBuiltinUrl()` helper)
- Bump `ampscript-data` (transitively) to `2.0.4` (removed unsupported `like` operator from `RetrieveSalesforceObjects`)

## [2.4.0] - 2026-06-18

### Added

- Value-confirmed `Date` prototype methods (`getFullYear`, `getDay`, `getMinutes`, `getSeconds`, `getMilliseconds`, `valueOf`, `toString`, `toDateString`, `toUTCString`), the `Date.UTC` static, and `Object.defineProperty` are now recognized as working ECMAScript built-ins in completions, hover, and diagnostics.

### Changed

- `Array.prototype.splice` is now treated as polyfillable (broken on the SFMC JINT engine) rather than a working built-in.

### Dependencies

- Bump `sfmc-language-lsp` from `^1.5.0` to `^1.6.0` (ssjs-data 0.6.0 ECMAScript built-ins catalog updates)
- Bump `ssjs-data` (transitively) from `0.5.0`/`0.4.2` to `0.6.0`

## [2.3.0] - 2026-06-16

### Added

- AMPscript `@variable` hovers now show inferred type in a TypeScript-style code fence (e.g. `var @rows: rowset`, `var @x: any`) — matching the SSJS variable hover design.
- AMPscript parameter hints (signature help) now display TypeScript-style typed labels: `param?: type` (e.g. `startDate: date`, `numRetries?: number`). Optional parameters are marked with `?` instead of square brackets, and the full `param?: type` token is highlighted as you type each argument — matching the SSJS signature help experience.
- `sfmcLanguageServer.disableLspDiagnosticsForEslintRules` setting: when enabled, LSP diagnostics that duplicate `eslint-plugin-sfmc` rules are suppressed so ESLint remains the single source of truth for those checks.

### Changed

- `ampscript/enum-value` diagnostic severity changed from **Warning** to **Error** — passing a literal value not in the allowed enum is now a hard error.
- `ampscript/arg-type` diagnostic severity changed from **Warning** to **Error** — literal and variable type mismatches are now hard errors.

### Fixed

- Parameter highlighting in signature help no longer partially matches `content` inside `contentTypeHeader` — the correct parameter token is always highlighted (fixes `HTTPPostWithRetry` parameter 3 regression).
- Signature help parameter documentation now uses `MarkupContent` so `**Default:**` formatting and backtick literals render correctly instead of showing raw markdown text.

### Dependencies

- Bump `sfmc-language-lsp` from `^1.3.0` to `^1.5.0` (typed sig help labels, variable hover redesign, enum/arg-type as errors, labelRange fix, MarkupContent for param docs)
- Bump `ampscript-data` (transitively) from `2.0.2` to `2.0.3`

## [2.2.0] - 2026-06-15

### Added

- Enum completion exclusivity: when the cursor is on an enum-typed AMPscript parameter (e.g. the second argument of `DatePart`), IntelliSense now offers only the valid enum values instead of mixing them with functions, keywords, and variables.

### Changed

- Enum validation now also flags numeric and boolean literals passed to an enum-typed parameter (previously only quoted string literals were checked).
- Repeat-group signature help highlights repeating parameter slots correctly (e.g. `Concat`'s `stringN`, and the paired columns of `UpdateData` / `UpsertData`).

### Fixed

- `HTTPPost2` snippet now matches the current 6-argument signature (`url, contentType, contentToPost, exceptionOnError, response, responseRowSet`) instead of the outdated argument list.

### Known issues

- When the cursor is on an enum-typed argument, VS Code's contributed AMPscript snippets (e.g. `%%=`, `ampblock`) may still appear alongside the enum values. Suppressing those requires migrating the snippets to a programmatic provider, which is planned for a follow-up release.

### Dependencies

- Bump `sfmc-language-lsp` from `^1.2.0` to `^1.3.0` (enum completion exclusivity, number/boolean enum validation, repeat-group signature help)
- Bump `ampscript-data` (transitively, via the language server) from `2.0.1` to `2.0.2` (Concat syntax `stringN` fix)

## [2.1.2] — 2026-06-06

### Fixed

- Instance methods on core library classes (`DeliveryProfile.Update`, `SenderProfile.Remove`, `Account.Update`, etc.) no longer appear as static method suggestions in VS Code IntelliSense
- `Function.X` (e.g. `Function.GUID()`) completions removed — this was never a valid SSJS shorthand; only `Platform.Function.X()` and bare `X()` are correct

### Dependencies

- Bump `sfmc-language-lsp` from `^1.0.2` to `^1.0.3` (removes invalid `Function.X` completions and hover; instance-vs-static fix for core library `.d.ts`)

## [2.1.1] — 2026-06-06

### Fixed

- Diagnostic line numbers for arity errors, arg-type warnings, unknown-function errors, HTML-comment warnings, and JS-line-comment warnings were reported N lines too early when a multi-line `/* */` block comment appeared before the problematic AMPscript code.

### Dependencies

- Bump `sfmc-language-lsp` from `^1.0.1` to `^1.0.2` (line-position bugfix for non-MCN diagnostics)

## [2.1.0] — 2026-06-06

### Added

- **Auto-configure `eslint.validate`**: the extension now contributes `eslint.validate` defaults for the `ampscript`, `ssjs`, and `sfmc` language IDs (plus all standard JS/TS/HTML IDs). Users with `dbaeumer.vscode-eslint` installed will see `eslint(sfmc/...)` diagnostics from `eslint-plugin-sfmc` without any manual settings change.

## [2.0.0] — 2026-06-06

### Added

- **`sfmcLanguageServer.targetPlatform` setting** (`engagement` | `next`, default `engagement`): controls whether the language server runs in standard MCE mode or in Marketing Cloud Next compatibility mode. Set to `next` to enable the diagnostics below without affecting any existing MCE workflow.
- **MCN AMPscript diagnostics** (active when `targetPlatform: 'next'`):
  - **Error** for any AMPscript function call where the function is not supported in Marketing Cloud Next — e.g. `InsertDE`, `AttachFile`, `ContentArea`. Message: `"<FunctionName> is not supported in Marketing Cloud Next."`
  - **Information** for functions that are MCN-supported but have behavioral differences (`FormatDate`, `Lookup`, `StringToDate`) — the `mcnNotes` text is surfaced as a hint in the Problems panel so the behavioral difference is visible at the call site.
- **MCN SSJS diagnostics** (active when `targetPlatform: 'next'`):
  - **Error** on any `<script runat="server">` block — SSJS is not supported in Marketing Cloud Next. The error is placed on the opening `<script>` tag.
- **MCN hover badge**: every AMPscript function hover card now shows a Marketing Cloud Next support line — either `"Supported in Marketing Cloud Next (API v67.0+)"` (optionally with behavioral notes) or `"Not supported in Marketing Cloud Next"`.

### Fixed

- **MCN diagnostic line numbers** — errors were reported on the wrong line when the document contained multi-line comment blocks or HTML content before the AMPscript region. The offset now correctly reflects the absolute document position.

### Dependencies

- Bump `sfmc-language-lsp` from `^0.3.2` to `^1.0.1` (MCN platform support + line-number bugfix)

## [1.8.1] — 2026-06-03

### Fixed

- **`WSProxy.methodName` entries removed from SSJS completions**: typing "WSProxy" no longer surfaces `WSProxy.createBatch`, `WSProxy.retrieve`, etc. as if they were static calls. Instance method completions (e.g. `proxy.retrieve(...)`) are handled by the TypeScript engine via the typed `Script.Util.WSProxy` class declaration.

### Dependencies

- Bump `sfmc-language-lsp` from `0.3.1` to `^0.3.2`

## [1.8.0] — 2026-06-03

### Fixed

- **`WSProxy` no longer appears in SSJS auto-completions**: using `new WSProxy()` (the short form) is correctly flagged as an error. It was still offered as a completion item; the bare `WSProxy` entry has been removed from the catalog. Use `new Script.Util.WSProxy()` instead.
- **`DateTime.SystemDateToLocalDate` and `DateTime.LocalDateToSystemDate` completions and diagnostics**: both methods were absent from the SSJS completion catalog and the TypeScript global declarations loaded by the checker were stale. They now complete correctly and no longer show red squiggles when `Platform.Load("core", "1.1.5")` is present.
- **`Script.Util.WSProxy` hover now shows ssjs.guide link**: the hover card for `Script.Util.WSProxy` and `WSProxy` methods was missing the guide reference link; it is now included.
- **`sfmc-globals.d.ts` stays fresh automatically**: the file is now refreshed on every `npm run compile` and every `npm install` (via the `postinstall` hook), preventing the stale-type-declarations issue that caused the `DateTime` bugs above.

### Dependencies

- Bump `sfmc-language-lsp` from `0.3.0` to `^0.3.1`

## [1.7.0] — 2026-05-25

### Added

- **`/* global */` comment support for SSJS diagnostics**: the embedded TypeScript checker now honors ESLint-style file-level global-comment annotations. Variables defined in another SFMC asset — such as a debug flag set in a parent page, a subscriber key passed via AMPscript, or a configuration variable from an included script — no longer trigger "Cannot find name" errors when declared with `/* global DEBUG, deKey */` or `/* globals DEBUG:readonly, deKey:writable */`. Declarations are scoped to the current document and cleaned up automatically when the file is closed or the comment is removed. The same syntax works inside `<script runat="server">` blocks in SFMC HTML files.

## [1.6.3] — 2026-05-25

### Fixed

- **SSJS type checking broken in marketplace install**: `sfmc-globals.d.ts` (the type declarations for `Platform`, `Script`, `Request`, `WSProxy`, and all other SFMC globals) was never included in the VSIX — `node_modules` is stripped at package time so all runtime path lookups failed silently, leaving the TypeScript service disabled. The file is now copied to `server/out/` during `vscode:prepublish` and explicitly re-included in `.vscodeignore`.
- **Client bundle not minified in published VSIX**: `vscode:prepublish` passed `--minify` only to the server esbuild call (not the client) due to how npm appends extra args to chained scripts. Both bundles are now minified independently.

## [1.6.2] — 2026-05-25

### Dependencies

- Bump `sfmc-language-lsp` from 0.2.6 to 0.2.7 (removes `GetValue` and `SetValue` from the AMPscript function catalog — both were SSJS-only concepts)

## [1.6.1] — 2026-05-24

### Added

- **`ContentArea()` and `ContentAreaByName()` hover support**: both the global forms (requiring `Platform.Load`) and the `Platform.Function.*` qualified forms now show correct hover cards with distinct signatures — global forms use `errorMsg: string` as the 3rd parameter, qualified forms use `stopOnError: boolean`
- **`Platform.Function.Stringify` dedicated page**: hover now links to the new dedicated `/platform-functions/stringify/` ssjs.guide page, noting the difference from the bare-name `Stringify()` global which requires `Platform.Load`

### Fixed

- **Missing `declare function` for non-aliasOf globals in `sfmc-globals.d.ts`**: `Base64Encode`, `Base64Decode`, `Format`, `String`, `Error`, `ContentArea`, and `ContentAreaByName` are now correctly emitted as top-level TypeScript declarations in the bundled type definitions

### Dependencies

- Bump `sfmc-language-lsp` from 0.2.5 to 0.2.6 (which bundles `ssjs-data` 0.3.5)

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
