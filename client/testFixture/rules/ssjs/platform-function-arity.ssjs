/* ── Rule: sfmc/ssjs-platform-function-arity ────────────────────────────────────
   Flags Platform.Function calls with the wrong number of arguments.
   ─────────────────────────────────────────────────────────────────────────── */

Platform.Load("Core", "1.1.5");

/* ✅ ACCEPTED — CreateObject takes exactly 1 argument (the object type string) */
var de = Platform.Function.CreateObject("DataExtension");

/* ✅ ACCEPTED — AddObjectArrayItem takes exactly 3 arguments */
var arrObj = Platform.Function.CreateObject("DataExtensionObject");
Platform.Function.AddObjectArrayItem(de, "Fields", arrObj);

/* ❌ FAIL — CreateObject called with no arguments (requires 1) */
var badDe = Platform.Function.CreateObject();

/* ❌ FAIL — CreateObject called with too many arguments (max is 1) */
var badDe2 = Platform.Function.CreateObject("DataExtension", "extra");
