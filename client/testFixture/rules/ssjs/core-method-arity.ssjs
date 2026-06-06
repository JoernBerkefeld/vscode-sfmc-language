/* ── Rule: sfmc/ssjs-core-method-arity ──────────────────────────────────────────
   Enforces correct argument counts for Core Library object methods.
   Covers both static calls (DataExtension.Init) and instance methods (.Add, .Retrieve).
   ─────────────────────────────────────────────────────────────────────────── */

Platform.Load("Core", "1.1.5");

/* ✅ ACCEPTED — DataExtension.Init requires exactly 1 argument */
var de = DataExtension.Init("MyKey");

/* ✅ ACCEPTED — de.Rows.Add requires exactly 1 row object argument */
var row = {Email: "test@example.com"};
de.Rows.Add(row);

/* ❌ FAIL — DataExtension.Init called with no arguments (requires 1) */
var badDe = DataExtension.Init();

/* ❌ FAIL — de.Rows.Add called with too many arguments (requires 1) */
var row2 = {Email: "other@example.com"};
de.Rows.Add(row2, "extra");
