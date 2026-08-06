/**
 * Polyfill for Math.min (SFMC SSJS) — handles any argument count.
 * @param {...number} [values] - numbers to compare
 * @returns {number} the smallest value, or NaN if any value is NaN
 */
Math.min = function () {
    if (arguments.length === 0) { return Number.POSITIVE_INFINITY; }
    var best = Number(arguments[0]);
    if (best !== best) { return NaN; }
    for (var i = 1; i < arguments.length; i++) {
        var v = Number(arguments[i]);
        if (v !== v) { return NaN; }
        if (v < best) { best = v; }
    }
    return best;
};

/**
 * Polyfill for Object.getPrototypeOf (SFMC SSJS).
 * @param {object} obj - the object whose prototype to return
 * @returns {object|null} the prototype, or null
 */
Object.getPrototypeOf = function (obj) {
    if (obj === null || obj === undefined) { return null; }
    return obj.constructor ? obj.constructor.prototype : null;
};

/**
 * Polyfill for Array.isArray (SFMC SSJS).
 * @param {*} value - the value to test
 * @returns {boolean} true when the value is an Array
 */
Array.isArray = function (value) {
    return Object.prototype.toString.call(value) === '[object Array]';
};

/**
 * Polyfill for Math.max (SFMC SSJS) — handles any argument count.
 * @param {...number} [values] - numbers to compare
 * @returns {number} the largest value, or NaN if any value is NaN
 */
Math.max = function () {
    if (arguments.length === 0) { return Number.NEGATIVE_INFINITY; }
    var best = Number(arguments[0]);
    if (best !== best) { return NaN; }
    for (var i = 1; i < arguments.length; i++) {
        var v = Number(arguments[i]);
        if (v !== v) { return NaN; }
        if (v > best) { best = v; }
    }
    return best;
};

// =============================================================================
// SSJS Test File for Extension Development
// Use this file to test completions, hover, and diagnostics
// =============================================================================

// -----------------------------------------------------------------------------
// Platform.Function methods - test completions and hover
// -----------------------------------------------------------------------------

// Completions: type "Platform.Function." and verify suggestions appear
var guid = Platform.Function.GUID();

// Hover: hover over ParseJSON to see signature
var data = Platform.Function.ParseJSON('{"name": "Test", "value": 123}');

// Hover: verify Stringify shows correct signature
var jsonString = Platform.Function.Stringify(data);

// Base64 encoding/decoding
var encoded = Platform.Function.Base64Encode("Hello World");
var decoded = Platform.Function.Base64Decode(encoded);

// URL encoding
var urlEncoded = Platform.Function.URLEncode("param=value&other=test");

// -----------------------------------------------------------------------------
// WSProxy - test completions for SOAP API wrapper
// -----------------------------------------------------------------------------

// Completions: type "prox." and verify WSProxy methods appear
var prox = new Script.Util.WSProxy();

// Hover: verify retrieve shows correct signature
var deResult = prox.retrieve("DataExtension", ["CustomerKey", "Name"]);

// Hover: verify create shows correct signature
var createResult = prox.createItem("DataExtensionObject", {
    CustomerKey: "MyDE",
    Properties: [
        { Name: "Email", Value: "test@example.com" }
    ]
});

// Hover: verify update shows correct signature
var updateResult = prox.updateItem("DataExtensionObject", {
    CustomerKey: "MyDE",
    Keys: [{ Name: "Email", Value: "test@example.com" }],
    Properties: [{ Name: "FirstName", Value: "Updated" }]
});

// Hover: verify delete shows correct signature
var deleteResult = prox.deleteItem("DataExtensionObject", {
    CustomerKey: "MyDE",
    Keys: [{ Name: "Email", Value: "test@example.com" }]
});

// -----------------------------------------------------------------------------
// HTTP Functions - test completions and hover
// -----------------------------------------------------------------------------

// Hover: verify HTTP.Get shows correct signature
var getResponse = HTTP.Get("https://api.example.com/data");

// Hover: verify HTTP.Post shows correct signature
var postResponse = HTTP.Post(
    "https://api.example.com/data",
    "application/json",
    '{"key": "value"}',
    ["Authorization: Bearer token123"]
);

// -----------------------------------------------------------------------------
// Deprecated functions — expect @deprecated indicator in hover
// -----------------------------------------------------------------------------
Platform.Load("core", "1.1.5");

// Deprecated: ContentArea — expect hover Deprecated banner + ssjs/deprecated diagnostic
// New: ContentArea - deprecated bare global; use ContentBlockByID / ContentBlockByName
var legacyContent = ContentArea(123);

// Deprecated: ContentAreaByName — expect hover Deprecated banner + ssjs/deprecated diagnostic
// New: ContentAreaByName - deprecated bare global; use ContentBlockByName
var legacyContentByName = ContentAreaByName("MyContentArea");

// requiresCoreLoad: hover over HTTP.Get — should show @remarks about Platform.Load
// Note: requires Platform.Load("Core", "1") to be called first
// New: HTTP.Get - requiresCoreLoad annotation in hover
var httpGetResult = HTTP.Get("https://example.com/api");

// -----------------------------------------------------------------------------
// Core Library Objects - test completions
// -----------------------------------------------------------------------------

// Load the core library
Platform.Load("core", "1.1.5");

// DataExtension operations
var deRows = DataExtension.Init("MyDataExtension");
var rows = deRows.Rows.Retrieve();

// Subscriber operations
var sub = Subscriber.Init("subscriber@example.com");
var subStatus = sub.Attributes;

// -----------------------------------------------------------------------------
// Write/Output functions
// -----------------------------------------------------------------------------

// Hover: verify Write shows correct signature
Write("Output text to page");
Write(Stringify(data));

// Variable function
var myVar = Variable.GetValue("@myVariable");
Variable.SetValue("@newVar", "newValue");

// -----------------------------------------------------------------------------
// ECMAScript built-ins — hover now shows ssjs.guide + MDN links
// -----------------------------------------------------------------------------

// New: ECMAScript builtin hover links to both ssjs.guide and MDN (e.g. Math.PI)
var circleArea = Math.PI * 4 * 4;
var myArray = [1, 2, 3];
// New: Array.prototype method hover deep-links to MDN (e.g. Array/slice)
var firstTwo = myArray.slice(0, 2);

// New: String.prototype method hover deep-links to MDN (e.g. String/replace)
var myString = "old string";
var cleaned = myString.replace("old", "new");

// -----------------------------------------------------------------------------
// Constructible built-ins — no false TS diagnostics (Bug 1 + Bug 7)
// -----------------------------------------------------------------------------

// New: `new Error()` is constructible (Bug 1) — no red squiggle expected
var err = new Error("boom");
var errMsg = err.message;

// New: value globals are constructible with prototype (Bug 7)
var arr2 = new Array(3);
var isArr = Array.isArray(arr2);
var now = new Date();
var num = new Number(5);
var str2 = new String("hi");
var obj2 = new Object();

// New: defining a prototype polyfill must not flag String/Array.prototype (Bug 7)
String.prototype.startsWith = function (search) {
    return this.indexOf(search) === 0;
};

// -----------------------------------------------------------------------------
// HttpRequest / HttpGet typed instances (Bug 2 + Bug 3)
// -----------------------------------------------------------------------------

// New: HttpRequest exposes writable props; send() returns HttpResponseInstance
var req = new Script.Util.HttpRequest("https://api.example.com");
req.method = "POST";
req.contentType = "application/json";
req.emptyContentHandling = 0;
req.postData = Stringify({ a: 1 });
var resp = req.send();
var statusCode = resp.statusCode;
// content is a CLR string — wrap with String() before use (ssjs/clr-content-access)
var body = String(resp.content);

// New: HttpGet has a smaller writable prop set (emptyContentHandling is numeric)
var get = new Script.Util.HttpGet("https://api.example.com");
get.retries = 1;
get.emptyContentHandling = 0;

// -----------------------------------------------------------------------------
// WSProxy returns WSProxyResult, not generic object (Bug 10)
// -----------------------------------------------------------------------------

// New: retrieve() returns a typed WSProxyResult with Status/Results/RequestID
var proxy = new Script.Util.WSProxy();
var wsResult = proxy.retrieve("DataExtension", ["Name"]);
var wsStatus = wsResult.Status;
var wsRows = wsResult.Results;

// -----------------------------------------------------------------------------
// Stringify accepts any value type (Bug 8)
// -----------------------------------------------------------------------------

// New: Stringify is not restricted to objects
var s1 = Stringify("a string");
var s2 = Stringify(42);
var s3 = Stringify([1, 2, 3]);

// -----------------------------------------------------------------------------
// Generator-keyword false positive (Bug 9)
// -----------------------------------------------------------------------------

// New: a regular function followed by a JSDoc block must NOT be flagged as a
// generator declaration. The `*` below belongs to the comment, not `function`.
function notAGenerator() {}

/**
 * Some documented helper.
 */
function documentedHelper() {}

// -----------------------------------------------------------------------------
// New (ssjs-data 0.10.0): KNOWN_UNSUPPORTED members + gap-filling polyfills
// -----------------------------------------------------------------------------

// New: members the SFMC engine does not support or implements incorrectly
// should be flagged by diagnostics (verified on CloudPages).
var nums = [3, 1, 2];
var sliced = nums.slice(0, 2); // broken native — use the slice polyfill
var sorted = nums.sort(); // broken native — use the sort polyfill
var sub = "hello".substr(1, 3); // throws on engine — use substr polyfill
var pos = "abc".search(/x/); // returns 0 (not -1) on no match — use polyfill
var chars = "abc".split(""); // does NOT split into characters on engine
var hi = Math.max(1, 2, 3); // throws with 3+ args on engine — use polyfill
var lo = Math.min(); // returns NaN on engine — use polyfill
var proto = Object.getPrototypeOf(nums); // missing native — use polyfill

// -----------------------------------------------------------------------------
// New (ssjs-data 1.1.0): deprecated Classic Content Core Library classes
// -----------------------------------------------------------------------------

// New: Portfolio - legacy Classic Content file storage, superseded by Content Builder
var portfolioItem = Portfolio.Init("my-portfolio-key");
var portfolioAdd = Portfolio.Add({ Name: "logo.png", CategoryID: 12345 });
var portfolioRows = Portfolio.Retrieve({ Property: "Name", SimpleOperator: "equals", Value: "logo.png" });
portfolioItem.Update({ Name: "logo-v2.png" });
portfolioItem.Remove();


// New: Template - legacy Classic Content email template, superseded by Content Builder
var tpl = Template.Init("my-template-key");
var tplAdd = Template.Add({ CustomerKey: "my-template-key", Name: "Basic Template" });
var tplRows = Template.Retrieve({ Property: "CustomerKey", SimpleOperator: "equals", Value: "my-template-key" });
tpl.Update({ Name: "Basic Template v2" });

// New: Send - legacy classic send type, not Content Builder assets
var send = Send.Init(1234567);
var sendRows = Send.Retrieve({ Property: "ID", SimpleOperator: "equals", Value: 1234567 });
var sendLists = send.RetrieveLists();
send.CancelSend();
send.Remove();

// New: Send.Definition - legacy Classic Email Studio send definition, superseded by Journey Builder
var sendDef = Send.Definition.Init("my-send-definition");
var sendDefAdd = Send.Definition.Add({ CustomerKey: "my-send-definition", Name: "Nightly Send" });
var sendDefDe = Send.Definition.AddWithDE({ CustomerKey: "my-send-definition" }, "my-de-key");
var sendDefRows = Send.Definition.Retrieve({ Property: "CustomerKey", SimpleOperator: "equals", Value: "my-send-definition" });
sendDef.Send();
sendDef.TestSend();
sendDef.Update({ Name: "Nightly Send v2" });
sendDef.Remove();

// -----------------------------------------------------------------------------
// New (ssjs-data 1.4.0): Core-version-aware ErrorUtil diagnostic
// -----------------------------------------------------------------------------

// New: ErrorUtil only exists up to Platform.Load("Core", "1"). Because this file
// loads "1.1.5" above, the two lines below are reported as errors ("undefined at
// runtime") instead of the plain deprecation warning. Remove the comment markers
// to see the diagnostic.
// var errUtil = ErrorUtil;
// ErrorUtil.ThrowWSProxyError(wsResult);

Platform.Load("core", "1.1.1");
var re = /[0-9]+/g;
var arr = [1, 2, 3];
arr.push(4);
var s = "hello".indexOf("l");
