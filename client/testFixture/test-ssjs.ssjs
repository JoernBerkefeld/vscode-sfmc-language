// =============================================================================
// SSJS Test File for Extension Development
// Use this file to test completions, hover, and diagnostics
// =============================================================================

// -----------------------------------------------------------------------------
// Platform.Function methods - test completions and hover
// -----------------------------------------------------------------------------

// Completions: type "Platform.Function." and verify suggestions appear
var guid = Platform.Function.GUID();

// Hover: hover over ParseJSON to see signature
var data = Platform.Function.ParseJSON('{"name": "Test", "value": 123}');

// Hover: verify Stringify shows correct signature
var jsonString = Platform.Function.Stringify(data);

// Base64 encoding/decoding
var encoded = Platform.Function.Base64Encode("Hello World");
var decoded = Platform.Function.Base64Decode(encoded);

// URL encoding
var urlEncoded = Platform.Function.URLEncode("param=value&other=test");

// -----------------------------------------------------------------------------
// WSProxy - test completions for SOAP API wrapper
// -----------------------------------------------------------------------------

// Completions: type "prox." and verify WSProxy methods appear
var prox = new Script.Util.WSProxy();

// Hover: verify retrieve shows correct signature
var deResult = prox.retrieve("DataExtension", ["CustomerKey", "Name"]);

// Hover: verify create shows correct signature  
var createResult = prox.createItem("DataExtensionObject", {
    CustomerKey: "MyDE",
    Properties: [
        { Name: "Email", Value: "test@example.com" }
    ]
});

// Hover: verify update shows correct signature
var updateResult = prox.updateItem("DataExtensionObject", {
    CustomerKey: "MyDE",
    Keys: [{ Name: "Email", Value: "test@example.com" }],
    Properties: [{ Name: "FirstName", Value: "Updated" }]
});

// Hover: verify delete shows correct signature
var deleteResult = prox.deleteItem("DataExtensionObject", {
    CustomerKey: "MyDE",
    Keys: [{ Name: "Email", Value: "test@example.com" }]
});

// -----------------------------------------------------------------------------
// HTTP Functions - test completions and hover
// -----------------------------------------------------------------------------

// Hover: verify HTTP.Get shows correct signature
var getResponse = HTTP.Get("https://api.example.com/data");

// Hover: verify HTTP.Post shows correct signature
var postResponse = HTTP.Post(
    "https://api.example.com/data",
    "application/json",
    '{"key": "value"}',
    ["Authorization: Bearer token123"]
);

// -----------------------------------------------------------------------------
// Core Library Objects - test completions
// -----------------------------------------------------------------------------

// Load the core library
Platform.Load("core", "1.1.5");

// DataExtension operations
var deRows = DataExtension.Init("MyDataExtension");
var rows = deRows.Rows.Retrieve();

// Subscriber operations  
var sub = Subscriber.Init("subscriber@example.com");
var subStatus = sub.Attributes;

// -----------------------------------------------------------------------------
// Write/Output functions
// -----------------------------------------------------------------------------

// Hover: verify Write shows correct signature
Write("Output text to page");
Write(Stringify(data));

// Variable function
var myVar = Variable.GetValue("@myVariable");
Variable.SetValue("@newVar", "newValue");
