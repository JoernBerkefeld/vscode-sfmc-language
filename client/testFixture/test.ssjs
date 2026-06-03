// Test 8–10: DateTime methods with correct namespace prefix
// Platform.Load("Core", "1");
var sysDate = DateTime.SystemDateToLocalDate(Now());
var localDate = DateTime.LocalDateToSystemDate(Now());

// Test 11: ContentArea / ContentAreaByName hover
var ca = Platform.Function.ContentArea("key");
var can = Platform.Function.ContentAreaByName("name");

// Test 12: hover over these — expect ssjs.guide link
var proxy = new Script.Util.WSProxy();
var result = Platform.Function.HTTPGet("https://example.com", true);
Platform.Function.ParseJSON('{"a":1}');
HTTP.Get("https://example.com", ["Authorization: Bearer token123"]);
// Test 13: Platform.Load order diagnostic
var de = DataExtension.Init("myDE");   // ← should warn: Load must come first
Platform.Load("Core", "1");

// Test 14: bare Write — no Core-load error
Write("hello world");