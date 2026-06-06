/* ── Rule: sfmc/ssjs-arg-types ──────────────────────────────────────────────────
   Checks that literal arguments match the expected parameter types for known
   SSJS functions. Only literal values are checked; variables are skipped since
   their runtime type cannot be determined statically.
   ─────────────────────────────────────────────────────────────────────────── */

Platform.Load("Core", "1.1.5");

/* ✅ ACCEPTED — CreateObject expects a string; "DataExtension" is a string literal */
var de = Platform.Function.CreateObject("DataExtension");

/* ✅ ACCEPTED — AddObjectArrayItem(apiObject, string, any) — types match */
var field = Platform.Function.CreateObject("DataExtensionField");
Platform.Function.AddObjectArrayItem(de, "Fields", field);

/* ❌ FAIL — CreateObject expects a string, not a number literal */
var bad = Platform.Function.CreateObject(42);

/* ❌ FAIL — InvokeCreate expects (apiObject, array, object); passing string as 2nd arg */
Platform.Function.InvokeCreate(de, "not-an-array", {});
