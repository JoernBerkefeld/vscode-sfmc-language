/* ── Rule: sfmc/ssjs-require-hasownproperty ─────────────────────────────────────
   Requires a hasOwnProperty guard in for-in loops to avoid iterating over
   inherited SSJS properties (like _type) that SFMC objects often expose.
   ─────────────────────────────────────────────────────────────────────────── */

Platform.Load("Core", "1.1.5");

var obj = { a: 1, b: 2 };

/* ✅ ACCEPTED — hasOwnProperty guard present */
for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
        var val = obj[key];
    }
}

/* ❌ FAIL — no hasOwnProperty check; may iterate over inherited properties */
for (var key2 in obj) {
    var val2 = obj[key2];
}
