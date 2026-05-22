// test-ssjs-requires-load.ssjs
// Used by ssjs-diagnostics.test.ts
// Intentionally has NO Platform.Load call — all requiresCoreLoad globals must be flagged.
var s = Stringify({ foo: 1 });
var n = Now();
var g = GUID();
