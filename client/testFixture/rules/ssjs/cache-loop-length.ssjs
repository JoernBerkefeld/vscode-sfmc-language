/* ── Rule: sfmc/ssjs-cache-loop-length ──────────────────────────────────────────
   Flags for-loop conditions that re-evaluate .length on each iteration.
   Cache the length in a variable for better performance.
   ─────────────────────────────────────────────────────────────────────────── */

Platform.Load("Core", "1.1.5");

var arr = [1, 2, 3, 4, 5];

/* ✅ ACCEPTED — length cached before the loop */
var len = arr.length;
for (var i = 0; i < len; i++) {
    var item = arr[i];
}

/* ❌ FAIL — arr.length evaluated on every iteration */
for (var j = 0; j < arr.length; j++) {
    var item2 = arr[j];
}
