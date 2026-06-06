/* ── Rule: sfmc/ssjs-prefer-parsejson-safe-arg ──────────────────────────────────
   Platform.Function.ParseJSON() throws a 500 error if the argument is undefined.
   Concatenating an empty string (`+ ''`) coerces undefined to the string "undefined",
   which ParseJSON handles gracefully instead of throwing.
   ─────────────────────────────────────────────────────────────────────────── */

Platform.Load("Core", "1.1.5");

var jsonStr = '{"name":"Jane","age":30}';

/* ✅ ACCEPTED — safe: concatenating '' coerces undefined to "undefined" */
var safe = Platform.Function.ParseJSON(jsonStr + '');

/* ❌ FAIL — unsafe: if jsonStr is undefined, ParseJSON throws a 500 */
var unsafe = Platform.Function.ParseJSON(jsonStr);
