<script runat="server">
// wrapped-multi.ssjs — two server-script blocks with AMPscript and HTML between.
Platform.Load("Core", "1.1.1");
var firstName = "Jane";
</script>
%%[ SET @lastName = "Doe" ]%%
<p>Hello %%=v(@lastName)=%%</p>
<script runat="server">
Platform.Response.Write(firstName);
</script>
