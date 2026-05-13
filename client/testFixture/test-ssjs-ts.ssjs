// ssjs-ts test fixture — used by ssjs-ts.test.ts
// Line numbers matter: keep this file stable.
// Line 0 (index)
Platform.Load("Core", "1.1.5");

// Line 3: DataExtension Init — de should be typed as DataExtensionInstance
var de = DataExtension.Init("NTO Customer List");

// Line 6: de.Rows — should get Rows/Fields completions after dot
var rows = de.Rows.Lookup(["Email"], ["jane@example.com"]);

// Line 9: WSProxy
var api = new Script.Util.WSProxy();

// Line 12: api methods — should get WSProxy instance method completions
var result = api.retrieve("DataExtension", ["Name", "CustomerKey"]);

// Line 15: Platform.Function member completions
var guid = Platform.Function.GUID();

// Line 18: Platform.Response member completions
Platform.Response.Write(Stringify(result));

// Line 21: Math built-in
var rounded = Math.round(3.7);

// Line 24: String built-in
var upper = guid.toUpperCase();

// Line 27: undefined reference — should produce a sfmc-ts diagnostic
var broken = totallyUndefinedVariable.toString();
