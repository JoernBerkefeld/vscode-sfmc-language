/* global DEBUG, deKey */
/**
 * Polyfill for String.prototype.startsWith (SFMC SSJS).
 * @param {string} searchString - characters to search for at the start
 * @param {number} [position] - position to start searching from (default 0)
 * @returns {boolean} true when the string starts with searchString
 */
String.prototype.startsWith = function (searchString, position) {
    position = position || 0;
    return this.indexOf(searchString, position) === position;
};

/**
 * Polyfill for Array.prototype.map (SFMC SSJS).
 * @param {Function} callback - called with (element, index, array); its return value becomes the new element
 * @returns {Array} a new array of the callback results
 */
Array.prototype.map = function (callback) {
    if (typeof callback !== 'function') { return []; }
    var result = [];
    for (var i = 0; i < this.length; i++) {
        result.push(callback(this[i], i, this));
    }
    return result;
};



/**
 * Polyfill for String.prototype.search (SFMC SSJS).
 * @param {RegExp} regexp - the pattern to search for
 * @returns {number} the index of the first match, or -1
 */
String.prototype.search = function (regexp) {
    var str = "" + this;
    var m = str.match(regexp);
    if (m === null || m.length === 0) { return -1; }
    return str.indexOf(m[0]);
};





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



// Test 1 & 2 & 3: polyfillable method -> squiggle + "Insert polyfill" quick-fix
var s = "5";
var padded = s.padStart(3, "0");


// Test 4: known-unsupported, no polyfill -> diagnostic with suggestion, no insert fix
var obj = Platform.Function.ParseJSON('{"a":1}');
var keys = Object.keys(obj);

// Test 5: caveat hover -> hover over `search` shows wrong-index caveat
var pos = "hello world".search(/world/);
