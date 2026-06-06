/* ── MCN mode · SSJS test fixture ──────────────────────────────────────────────
   SSJS is NOT supported in Marketing Cloud Next at all.
   Every SSJS API call should produce an error.
   Open this file in VS Code — the ESLint extension shows live squiggles.
   ─────────────────────────────────────────────────────────────────────────── */

Platform.Load("Core", "1.1.1");

/* ❌ ALL Platform.Function calls → [ssjs-no-unknown-function target:next] errors */
var de = Platform.Function.CreateObject("DataExtension");
var proxy = new Script.Util.WSProxy();
var result = proxy.retrieve("DataExtension", ["CustomerKey", "Name"]);

/* ❌ Standard SSJS globals also flagged → SSJS is entirely unsupported in MCN */
var obj = Platform.Function.ParseJSON('{"key":"value"}');
