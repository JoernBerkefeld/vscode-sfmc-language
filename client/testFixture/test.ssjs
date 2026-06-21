// Test 8–10: DateTime methods with correct namespace prefix
Platform.Load("Core", "1.1.5");
var sysDate = DateTime.SystemDateToLocalDate(Now());
var localDate = DateTime.LocalDateToSystemDate(Now());

// Test 11: ContentArea / ContentAreaByName hover
var ca = Platform.Function.ContentArea(1);
var can = Platform.Function.ContentAreaByName("name");

// Test 12: hover over these — expect ssjs.guide link
var proxy = new Script.Util.WSProxy();
var result = Platform.Function.HTTPGet("https://example.com", true);
Platform.Function.ParseJSON('{"a":1}');
HTTP.Get("https://example.com", ["Authorization: Bearer token123"]);
// Test 13: Platform.Load order diagnostic
var de = DataExtension.Init("myDE");   // ← should warn: Load must come first
Platform.Load("Core", "1.1.5");

// Test 14: bare Write — no Core-load error
Write("hello world");



// Test 1: hover .startsWith → searchString: string, position?: number): boolean
/**
 * @param {string} searchString what to search for
 * @param {number} [position] where to start
 * @returns {boolean} whether it starts with searchString
 */
 String.prototype.startsWith = function (searchString, position) {
    position = position || 0;
    return this.indexOf(searchString, position) === position;
};
var a = "hello".startsWith("he");
var b = "world".startsWith("wo");

// Test 2: hover .map → callbackFn: Function, ctx: any, returns any[]
/**
 * @typedef {object} Client
 * @property {string} instance_url url of the SFMC instance
 * @property {string} access_token oauth token
 * @property {WSProxy} proxy WSProxy instance for API calls
 * @property {number} mid mid of the BU
 */


/**
 * @param {Function} callbackFn callback for map
 * @param {Client} ctx unknown user type
 * @returns {Array} mapped array
 */
Array.prototype.map = function (callbackFn, ctx) {
    var arr = [];
    for (var i = 0; i < this.length; i++) {
        arr.push(callbackFn(this[i], i, this));
    }
    return arr;
};
var out = [1, 2].map(function (x) { return x; });

// Test 3: polyfill with NO JSDoc → defaults to any
String.prototype.trimStart = function () {
    return this.replace(/^\s+/, "");
};
var t = "  x".trimStart();

// Test 4: Find All References on a top-level function
function buildKey(id) {
    return "k-" + id;
}
var k1 = buildKey("1");
var k2 = buildKey("2");

// Test 6: unknown identifier → no references
var z = somethingUndeclared;
