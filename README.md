# Distribution app

Phone pages for the in-store order app and the warehouse pull sheet.

- `index.html` — store order page
- `pull.html` — warehouse pull page
- `gas.js` — asks for a PIN once per phone, loads the page from the Apps Script data link, and stands in for `google.script.run`

The page code itself lives in the Apps Script project (App.gs), so changes there show up here without touching this repo.
Add `?signout` to either address to forget the PIN on that phone.
