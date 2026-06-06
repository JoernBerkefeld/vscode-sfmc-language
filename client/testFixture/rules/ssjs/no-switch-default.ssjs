/* ── Rule: sfmc/ssjs-no-switch-default ──────────────────────────────────────────
   The `default` case in a switch statement may NOT reliably execute in SFMC SSJS.
   Use explicit cases for all expected values instead of relying on `default`.
   ─────────────────────────────────────────────────────────────────────────── */

Platform.Load("Core", "1.1.5");

var status = "active";

/* ✅ ACCEPTED — all expected values as explicit cases; no default clause */
switch (status) {
    case "active":
        Write("Active");
        break;
    case "inactive":
        Write("Inactive");
        break;
    case "pending":
        Write("Pending");
        break;
}

/* ❌ FAIL — `default` clause may not execute in SFMC SSJS */
switch (status) {
    case "active":
        Write("Active");
        break;
    default:
        Write("Unknown status: " + status);
}
