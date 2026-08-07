/* ── Rule: sfmc/ssjs-no-invalid-property-access ───────────────────────────────
   Some SSJS properties only work in one direction: reading `postData` throws,
   reading Platform.Response.ContentType returns an opaque CLR value, and
   assigning to a Platform.Request property has no effect. The restrictions come
   from the `access` field in ssjs-data.
   ─────────────────────────────────────────────────────────────────────────── */

var req = new Script.Util.HttpRequest("https://api.example.com/data");
var body = '{"id":1}';

/* ✅ ACCEPTED — assigning a write-only property is the supported direction */
req.postData = body;

/* ✅ ACCEPTED — reading a normal (unrestricted) request property */
var timeout = req.timeout;

/* ✅ ACCEPTED — reading a read-only Platform.Request property */
var method = String(Platform.Request.Method);

/* ✅ ACCEPTED — assigning a write-only-opaque Platform.Response property */
Platform.Response.ContentType = "application/json";

/* ✅ ACCEPTED — same property name on an object that is not a tracked request */
var config = { postData: body };
Platform.Response.Write(config.postData);

/* ❌ FAIL — reading a write-only property throws and aborts the page */
Platform.Response.Write(req.postData);

/* ❌ FAIL — reading a write-only-opaque property yields an opaque CLR value */
var contentType = Platform.Response.ContentType;

/* ❌ FAIL — assigning a read-only property has no effect */
Platform.Request.Method = "POST";
