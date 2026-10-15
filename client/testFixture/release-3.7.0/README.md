# 3.7.0 VSIX acceptance fixtures

These editor-only fixtures cover extension 3.7.0. The files intentionally contain diagnostics and generated template output: do not run them in a browser or deploy them to Salesforce.

## Install only when you choose

1. Build artifact: `F:/Git/ide-root/vscode-sfmc-language/sfmc-language-BETA.vsix`.
2. In your chosen VS Code or Cursor test window, run **Extensions: Install from VSIX...**, select that file, and reload. The agent does not install into your profile. For a separate VS Code profile, create/select it yourself first.
3. Open `client/testFixture` as the workspace. Keep `sfmcLanguageServer.targetPlatform` set to `engagement` initially. Open both files in this directory and explicitly select **SFMC (AMPscript / SSJS)** (`sfmc`) for `browser.html`; `browser.amp` uses `ampscript`.
4. Confirm extension version **3.7.0** in Extensions. The pre-release VSIX is a local acceptance artifact, not a Marketplace release.

## Browser checks

- In both classic and module scripts in `browser.amp` and `browser.html`, place the cursor after `document.` and press Ctrl+Space: `querySelector` should appear. Hover `document` / `querySelector`; place the cursor inside `querySelector(` and press Ctrl+Shift+Space for DOM signature help.
- In `browser.amp`, hover `releaseClassic` in the second script, use F12 on `releaseGreet(releaseClassic)` and Find All References on its declaration. Navigation stays in this document. Hover/signature help on `releaseGreet` should retain the starred JSDoc description and `name` parameter.
- The module using `releasePrivate` from another module should have a missing-name diagnostic. `releaseClassic` should be visible in the module in `browser.amp`, but not in `browser.html`.
- `document.releaseMissingMember()` should have a diagnostic with source `javascript`, with no compiler number or documentation link. Remove `// @ts-check` from that script: its semantic errors should disappear; undo afterward. The final `const syntaxError = ;` in `browser.html` should still have a browser syntax diagnostic without opt-in.
- Quoted AMPscript / Handlebars output must not break `document.` completion in the same script. Hover the template function itself for template-owned help. Do not infer that arbitrary generated output is safe to execute.
- In each unquoted `generated` script, `document.` should return no browser or SFMC fallback completion, no browser hover/signature help, and no invented browser diagnostic. The next safe sibling script should still provide DOM intelligence.

## Existing SSJS regression fixture

Open `../test-ssjs-ts-html.html`, unchanged and already covered by integration tests. Keep target `engagement`. Hover `Platform.Function.GUID`, request completion after `Platform.Function.`, and request signature help inside `GUID(`. `totallyUndefinedVariable` should still produce an SSJS `sfmc-ts` diagnostic with its numeric code and documentation link, not `javascript`. Browser `document` APIs must not be added to server-side scripts. This file is also an editor-only diagnostic fixture, not deployable content.

## MCN hover check

In workspace settings temporarily set `sfmcLanguageServer.targetPlatform` to `next`. Open `browser.amp`, hover `Concat` in `SET @label = Concat("Local", " candidate")` and in the quoted template. Expect **Summer '26 / API v67.0** support guidance, not stale Winter '27 guidance or an MCN unsupported-function error. Concat is a small non-destructive MCN sample. Existing SSJS fixtures should instead be flagged unsupported under `next`; this is expected. Restore target `engagement` afterward.

## Acceptance scope

Report pass/fail for browser intelligence, scope/navigation, diagnostics, template isolation, SSJS regression, and MCN hover. Running these checks does not itself authorize a release or automatic profile changes.
