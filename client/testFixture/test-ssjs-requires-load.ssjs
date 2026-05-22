// test-ssjs-requires-load.ssjs
// Used by ssjs-diagnostics.test.ts
// Section A: NO Platform.Load — all requiresCoreLoad globals must be flagged.
var s = Stringify({ foo: 1 });
var n = Now();
var g = GUID();

// Section B: Platform.Load appears AFTER the bare calls — those calls must still be flagged.
var s2 = Stringify({ bar: 2 });
Platform.Load("Core", "1.1.5");
// Calls below the load are fine — no diagnostic expected for these:
var n2 = Now();
