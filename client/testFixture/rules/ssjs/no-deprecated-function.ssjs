/* ── Rule: sfmc/ssjs-no-deprecated-function ─────────────────────────────────────
   Flags SSJS functions that have been deprecated.
   ─────────────────────────────────────────────────────────────────────────── */

Platform.Load("Core", "1.1.5");

/* ✅ ACCEPTED — Platform.Function.LookupRows is the current function */
var rows = Platform.Function.LookupRows("MyDE", "Email", "test@example.com");

/* ❌ FAIL — ContentArea is deprecated; use ContentBlockByKey or ContentBlockById */
var content = ContentArea("MyContentAreaKey");

/* ❌ FAIL — ContentAreaByName is deprecated; use ContentBlockByName */
var content2 = ContentAreaByName("My Content Area");

/* ❌ FAIL — ErrorUtil is undefined under Core "1.1.5" (loaded above), so this throws
   a TypeError at runtime; check result.Status and throw new Error(...) instead.
   The plain "deprecated" variant needs Core "1" — see no-deprecated-function-core1.ssjs. */
ErrorUtil.ThrowWSProxyError(content);

/* ❌ FAIL — Portfolio is a deprecated legacy Classic Content class */
var results = Portfolio.Retrieve("Name", "MyPortfolio");

/* ❌ FAIL — Portfolio instance method is deprecated */
var portObj = Portfolio.Init("myPortfolioCK");
portObj.Update();

/* ❌ FAIL — Template is a deprecated legacy Classic Content class */
var templateResults = Template.Retrieve("Name", "MyTemplate");

/* ❌ FAIL — Send is a deprecated legacy Classic Content send class */
var sendResults = Send.Retrieve("Name", "MySend");

/* ❌ FAIL — Send.Definition instance method is deprecated */
var sendDef = Send.Definition.Init("mySendDefinitionCK");
sendDef.Send();
