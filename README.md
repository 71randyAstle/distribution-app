# Distribution app

Phone pages for the in-store order app and the warehouse pull sheet.

- `index.html` — store order page
- `pull.html` — warehouse pull page
- `gas.js` — asks for a PIN once per phone, loads the page from the Apps Script data link, and stands in for `google.script.run`

The page code itself lives in the Apps Script project (App.gs), so changes there show up here without touching this repo.
Add `?signout` to either address to sign that phone out. Add `?refresh` to load the newest page code right away (normally the phone opens from its kept copy and checks for a newer one after 30 minutes).

Sign-in: a PIN is entered once per phone and traded for a sign-in token, which the phone keeps. After 5 wrong PINs, new sign-ins are blocked for 30 minutes; phones already signed in keep working.
