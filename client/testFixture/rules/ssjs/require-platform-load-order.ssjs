/* ── Rule: sfmc/ssjs-require-platform-load-order ────────────────────────────────
   Platform.Load("core", "1") must appear BEFORE any Core library usage,
   not after. Using Core objects before Platform.Load causes runtime errors.
   ─────────────────────────────────────────────────────────────────────────── */

/* ❌ FAIL — DataExtension.Init called before Platform.Load */
var early = DataExtension.Init("TooEarlyKey");

Platform.Load("Core", "1.1.5");

/* ✅ ACCEPTED — after Platform.Load, Core library usage is fine */
var de = DataExtension.Init("MyKey");
