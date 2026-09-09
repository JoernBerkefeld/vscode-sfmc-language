# TypeScript-backed SSJS diagnostics

Diagnostics with source `sfmc-ts` come from the extension's embedded TypeScript language service. The numeric code remains the compiler's code; the documentation link describes this extension's SSJS adapter, not a shared LSP rule. Its URL is pinned to the **extension root package version**, not the server subpackage version or the installed TypeScript version.

Development builds intentionally link to the prospective release tag. Until that version and this page are tagged together, GitHub may return 404. There is no fallback to a moving branch or older documentation.

## How the adapter works

The adapter checks virtual JavaScript files using `checkJs` and `noLib`. Its bundled `sfmc-globals.d.ts` supplies the supported API declarations instead of the standard browser or Node.js libraries. Each document is isolated from other open documents: opening another file does not declare its variables in this one. Embedded scripts are checked through the server's extraction and position mapping.

This is static checking, not execution in Marketing Cloud. A clean result does not prove that credentials, data, network requests, or a particular runtime method will work. Conversely, a missing declaration or imprecise inferred type can cause a warning on code that runs successfully. The adapter recognizes selected global comments and polyfill patterns, not every dynamically constructed API. It filters selected JSDoc and guarded-polyfill diagnostics to avoid known false positives; it does not disable all compiler checking inside these constructs.

The bounded code-specific set is **2304 and 2339**, with regression fixtures that actually emit each code. All other compiler codes intentionally use the general troubleshooting section below rather than nonexistent code-specific anchors.

## TS2304

**Cannot find name.** The identifier is not declared in the current virtual document or its ambient declarations. Check spelling and scope first. Declare local variables before use and check the declaration of parameters used inside functions. Do not assume another open SSJS file contributes globals.

For values genuinely supplied by the execution environment, document the external global using the adapter's supported `/* global NAME */` convention. This is a type-checking declaration only: it does not create a runtime value. Avoid declaring every misspelling as a global to silence the warning. If a known SFMC global unexpectedly disappears, check the bundled declarations as described below.

## TS2339

**Property does not exist on type.** The receiver's inferred or declared type does not expose the member. Check both the member spelling and the return shape of the preceding call. Different HTTP APIs, for example, can expose different response properties; do not interchange them merely because they represent similar requests.

Inspect hover information for the receiver and trace where its value came from. Correct an inaccurate annotation or access the actual declared property. Dynamic properties and unsupported polyfill shapes may not be inferred. Do not substitute an arbitrary modern JavaScript method just to satisfy the compiler: SSJS runtime availability is a separate constraint. If a supported API is incorrectly modeled, report the declaration mismatch with a minimal reproduction rather than hiding it with broad type escapes.

## Other diagnostics

The number beside `sfmc-ts` is a TypeScript compiler diagnostic code. Read the full message and highlighted range first; this generic route is intentional and does not mean the code is unknown to the compiler. Syntax errors usually need missing delimiters or invalid expressions corrected before later diagnostics become useful. For assignment and argument errors, compare the inferred value type with the destination or function signature shown by hover and signature help. Check parameter order and count before changing types.

Reduce the input to the smallest example that still produces the message. Distinguish a real code problem from an adapter declaration limitation by recording the numeric code, full message, expected runtime behavior, extension version, and whether the script is standalone or embedded. Remove credentials and customer data before sharing the reproduction. The extension does not promise a quick fix for every compiler diagnostic.

## Troubleshooting the adapter

- If many SFMC globals suddenly appear undeclared, check that the extension's bundled `sfmc-globals.d.ts` is present. In a source checkout, the `copy-globals` build step copies the installed `ssjs-data` declarations into server output. Rebuild and restart the language server after repairing a missing artifact.
- Check the file's language mode and SSJS interpretation setting when embedded markup is being treated as JavaScript or ranges seem wrong. Include the surrounding script boundary in a sanitized reproduction.
- Global comments, annotations, and recognized polyfills affect static analysis only. They do not load libraries or provide missing runtime functionality.
- `disableLspDiagnosticsForEslintRules` addresses overlapping shared LSP rules; it is not a general switch for numeric `sfmc-ts` compiler diagnostics. Fix or narrow the underlying source issue rather than expecting that setting to suppress it.
- If the documentation URL is missing on GitHub in a development checkout, verify the root package version and release tag. Do not change a local URL to an unrelated released version to conceal a release-artifact problem.
