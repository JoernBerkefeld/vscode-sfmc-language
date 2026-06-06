Platform.Load("Core", "1.1.5");

/* Rule: sfmc/ssjs-no-treatascontent-injection
   Flags string concatenation inside TreatAsContent() calls.
   Concatenating dynamic values risks AMPscript injection.
   Use Variable.SetValue() instead to pass data into AMPscript variables. */

/* ACCEPTED - static string literal, no concatenation risk */
var staticAmp = "%%=UpperCase('hello')=%%";
TreatAsContent(staticAmp);

/* ACCEPTED - Variable.SetValue() used to safely inject the dynamic value */
Variable.SetValue("@userName", "Jane");
TreatAsContent("%%=UpperCase(@userName)=%%");

/* FAIL - dynamic value concatenated directly into TreatAsContent argument */
var userName = "Jane";
TreatAsContent("%%=UpperCase('" + userName + "')=%%");
