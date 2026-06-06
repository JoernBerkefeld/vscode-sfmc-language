/* ── Rule: sfmc/ssjs-no-unavailable-method ──────────────────────────────────────
   Flags Array (and String) methods that are unavailable or broken in SFMC's
   legacy ECMAScript 3 engine. Suggests polyfills.
   ─────────────────────────────────────────────────────────────────────────── */

Platform.Load("Core", "1.1.5");

var arr = [3, 1, 2];

/* ✅ ACCEPTED — join() exists in ES3 */
var joined = arr.join(", ");

/* ✅ ACCEPTED — push() exists in ES3 */
arr.push(4);

/* ❌ FAIL — Array.prototype.map does not exist in SFMC SSJS (ES3) */
var doubled = arr.map(function(x) { return x * 2; });

/* ❌ FAIL — Array.prototype.filter does not exist in SFMC SSJS (ES3) */
var evens = arr.filter(function(x) { return x % 2 === 0; });

/* ❌ FAIL — Array.isArray is ES5+, unavailable in SFMC SSJS */
var isArr = Array.isArray(arr);
