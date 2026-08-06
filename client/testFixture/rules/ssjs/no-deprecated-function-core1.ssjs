/* ── Rule: sfmc/ssjs-no-deprecated-function ─────────────────────────────────────
   Companion to no-deprecated-function.ssjs, covering the Core "1" variant of the
   ErrorUtil message. Cannot live in the same file: that one loads Core "1.1.5".
   NOTE: the Platform.Load line also produces a ssjs-prefer-platform-load-version
   diagnostic (without an autofix, because the file uses ErrorUtil).
   ─────────────────────────────────────────────────────────────────────────── */

Platform.Load("Core", "1");

/* ✅ ACCEPTED — WSProxy itself is not deprecated */
var proxy = new Script.Util.WSProxy();
var result = proxy.retrieve("DataExtensionObject[MyDE]", ["Email"]);

/* ❌ FAIL — ErrorUtil.ThrowWSProxyError works under Core "1" but is deprecated;
   check result.Status and throw new Error(...) instead */
ErrorUtil.ThrowWSProxyError(result);
