/* ── Rule: sfmc/ssjs-no-deprecated-function ─────────────────────────────────────
   Flags SSJS functions that have been deprecated.
   ─────────────────────────────────────────────────────────────────────────── */

Platform.Load("Core", "1.1.5");

/* ✅ ACCEPTED — Platform.Function.LookupRows is the current function */
var rows = Platform.Function.LookupRows("MyDE", "Email", "test@example.com");

/* ❌ FAIL — ContentArea is deprecated; use ContentBlockByKey or ContentBlockById */
var content = ContentArea("MyContentAreaKey");

/* ❌ FAIL — ContentAreaByName is deprecated; use ContentBlockByName */
var content2 = ContentAreaByName("My Content Area");
