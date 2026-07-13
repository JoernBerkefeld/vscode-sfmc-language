// =============================================================================
// F5 test fixture — HTTP response CLR diagnostics + quick-fixes
// -----------------------------------------------------------------------------
// Exercises the two rules shipped with sfmc-language-lsp 3.2.0 /
// eslint-plugin-sfmc 4.2.0:
//   1. ssjs/clr-content-access        (require-string-clr-content)
//   2. ssjs/clr-header-access         (no-clr-header-access)
//
// Both fire ONLY on a variable assigned from `.send()` on a
// Script.Util.HttpRequest / Script.Util.HttpGet instance.
//
// What to verify in the Extension Development Host:
//   - Squiggles appear on every "❌ FAIL" line below (Error severity).
//   - No squiggle on any "✅ OK" line.
//   - Quick-fix (Ctrl+.) on a .content squiggle offers "Wrap with String(...)".
//   - Quick-fix on a .headers squiggle offers "Read header via getHeaderMap(...)"
//     and inserts the getHeaderMap() helper once.
//   - Hover over `content` / `headers` shows the CLR caveat note.
// =============================================================================

Platform.Load("Core", "1.1.5");

// -- Tracked response variables ------------------------------------------------
var req = new Script.Util.HttpRequest("https://api.example.com/data");
req.method = "GET";
var resp = req.send();

var greq = new Script.Util.HttpGet("https://api.example.com/cached");
var gresp = greq.send();

// -----------------------------------------------------------------------------
// resp.content — CLR string, must be wrapped in String() before use
// -----------------------------------------------------------------------------

// ✅ OK — content wrapped in String() before ParseJSON
var dataOk = Platform.Function.ParseJSON(String(resp.content) + "");

// ✅ OK — content wrapped before a string method
var headOk = String(resp.content).substring(0, 10);

// ❌ FAIL — raw content passed straight to ParseJSON
var dataBad = Platform.Function.ParseJSON(resp.content);

// ❌ FAIL — raw content assigned directly
var body = resp.content;

// ❌ FAIL — raw content concatenated
var msg = "Body: " + resp.content;

// ❌ FAIL — string method called directly on raw content
var snippet = resp.content.substring(0, 20);

// ❌ FAIL — HttpGet response content used without String()
var gbody = Platform.Function.ParseJSON(gresp.content);

// -----------------------------------------------------------------------------
// resp.headers — CLR object, only readable via for..in enumeration
// -----------------------------------------------------------------------------

// ✅ OK — enumerate headers with for..in (keys are "[Name, Value]")
for (var k in resp.headers) {
    var pair = String(k);
}

// ❌ FAIL — indexer access on headers
var ct = resp.headers["Content-Type"];

// ❌ FAIL — .Get() method on headers
var loc = resp.headers.Get("Location");

// ❌ FAIL — .Item() method on headers
var enc = resp.headers.Item("Content-Encoding");

// -----------------------------------------------------------------------------
// Negative cases — must NOT be flagged (not tracked response objects)
// -----------------------------------------------------------------------------

// ✅ OK — .content on a plain object literal
var config = { content: "static" };
var raw = config.content;

// ✅ OK — .headers on a plain object literal
var fake = { headers: {} };
var fakeCt = fake.headers["Content-Type"];
