/* ── Rule: sfmc/ssjs-no-unknown-function ────────────────────────────────────────
   Flags calls to Platform.Function methods that are not in the known SSJS catalog.
   ─────────────────────────────────────────────────────────────────────────── */

Platform.Load("Core", "1.1.5");

/* ✅ ACCEPTED — CreateObject is a known Platform.Function method */
var de = Platform.Function.CreateObject("DataExtension");

/* ✅ ACCEPTED — GUID is a known Platform.Function method */
var guid = Platform.Function.GUID();

/* ❌ FAIL — DoesNotExistMethod is not in the SSJS function catalog */
var bad = Platform.Function.DoesNotExistMethod("arg");
