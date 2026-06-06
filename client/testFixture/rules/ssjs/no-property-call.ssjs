/* ── Rule: sfmc/ssjs-no-property-call ──────────────────────────────────────────
   Platform.Request and Platform.Response expose properties, not methods.
   Calling them with () is a runtime error.
   ─────────────────────────────────────────────────────────────────────────── */

Platform.Load("Core", "1.1.5");

/* ✅ ACCEPTED — reading a property without () */
var method = Platform.Request.Method;
var body = Platform.Request.Body;

/* ✅ ACCEPTED — setting a writable Response property via assignment */
Platform.Response.ContentType = "application/json";

/* ❌ FAIL — Platform.Request.Method is a property; calling it as a function errors */
var badMethod = Platform.Request.Method();

/* ❌ FAIL — Platform.Response.ContentType is a property; use assignment, not function call */
Platform.Response.ContentType("application/json");
