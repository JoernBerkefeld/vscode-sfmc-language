# Manual formatter test fixtures

Deliberately messy files for hand-testing the bundled Prettier formatter (F5 Extension Development Host).
Each `manual-test.*` should reformat cleanly with **Shift+Alt+F** (Format Document).

| File | Language id | What it proves |
|---|---|---|
| `manual-test.amp` | `ampscript` | AMPscript block + inline `%%= =%%` + `if`/`for` reflow |
| `manual-test.ssjs` | `ssjs` | SSJS statements, spacing, function body reflow |
| `manual-test.sql` | `sql` | SQL keyword casing + clause layout |
| `manual-test.html` | `sfmc` (auto-detected) | Mixed HTML + AMPscript block + `<script runat="server">` SSJS formatted as one unit |
| `manual-test.hbs` | `handlebars` | MCN Handlebars `{{ }}` + block helpers reflow |
| `plain-no-sfmc.html` | `html` (control) | Must **stay** `html` and must **not** be claimed by the SFMC formatter |

These are separate from `../fmt/` (which the automated test suite consumes and includes intentionally
invalid / ignored files).
