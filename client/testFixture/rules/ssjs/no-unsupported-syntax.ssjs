/* ── Rule: sfmc/ssjs-no-unsupported-syntax ─────────────────────────────────────
   Flags ES6+ syntax features not supported by SFMC's legacy ECMAScript engine.
   Note: The SSJS parser uses ecmaVersion: 5. Features like `const` and `let`
   cause PARSE ERRORS (not rule violations) — they still show as red squiggles.
   Auto-fix rewrites let/const to var when the file is processed at a higher
   ecmaVersion (e.g. in the embedded HTML processor).
   ─────────────────────────────────────────────────────────────────────────── */

Platform.Load("Core", "1.1.5");

/* ✅ ACCEPTED — ES3/ES5: var declarations work in all SFMC SSJS contexts */
var name = "Jane";
var arr = [1, 2, 3];
var result = name + " has " + arr.length + " items";

/* ──────────────────────────────────────────────────────────────────────────
   ❌ FAIL — arrow function (parse error at ecmaVersion:5)
   The SSJS config enforces ecmaVersion:5 to mirror the engine.
   ES6+ features therefore surface as parse errors rather than as
   rule violations; the rule fires after the parser, so the diagnostic
   you see in the editor is "Parsing error: Unexpected token =>".
   This line remains uncommented so the automated fixture test can
   assert that at least one diagnostic is produced.
   ────────────────────────────────────────────────────────────────────────── */

var doubled = arr.map(function(x) { return x * 2; }); /* ✅ acceptable polyfill */
var doubledArrow = arr.map(x => x * 2); /* ❌ arrow fn — parse error at ecmaVersion:5 */
