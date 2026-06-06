/* ── Rule: sfmc/ssjs-prefer-platform-load-version ───────────────────────────────
   Prefers a specific version string in Platform.Load() over a generic "1".
   A pinned version (e.g. "1.1.5") prevents unexpected behavior when Salesforce
   updates the Core library.
   ─────────────────────────────────────────────────────────────────────────── */

/* ❌ FAIL — generic "1" version string should be pinned to "1.1.5" */
Platform.Load("Core", "1");

var de = DataExtension.Init("MyKey");

/* ─────────────────────────────────────────────────────────────────────────── */
/* ✅ ACCEPTED example (shown as comment since a file can only have one load):  */
/*   Platform.Load("Core", "1.1.5");                                            */
