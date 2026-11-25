# Extension dev host

Handoff for a later fork of [PilgrimWorks/Nikke-Manager-Extension](https://github.com/PilgrimWorks/Nikke-Manager-Extension). Not this round. Localhost plus `make serve` covers day-to-day imports with the store extension. Use this when a Pages URL should win without closing the pilgrimworks tab and without a second installed copy.

Do not change the store listing. Load the result unpacked.

## Today

`manifest.json` `host_permissions` allows:

- `https://www.blablalink.com/*`
- `https://api.blablalink.com/*`
- `https://sg-tools-cdn.blablalink.com/*`
- `https://pilgrimworks.github.io/*`
- `http://localhost/*`
- `http://127.0.0.1/*`

`background.js` `MANAGER_URLS` is localhost ports 3000 and 8080 plus `https://pilgrimworks.github.io/Nikke-Manager`. `resolveManagerUrl` pings `${url}/nikke-manager-ping.json` and accepts `{ "app": "nikke-manager" }`. `sendToManager` injects `window._nikkeExtImport` into a matching tab, or opens the first URL that answers the ping.

If a pilgrimworks tab is already open, the extension updates that tab and never reaches localhost.

## Dev mode

Add an options page stored in `chrome.storage.local`:

- `devMode` boolean, default false.
- `customManagerUrl` string, default empty. Example: `https://joevdotme.github.io/Nikke-Manager`.

Dev mode off keeps the current hardcoded list, so one install still talks to PilgrimWorks and localhost. Dev mode on uses only `customManagerUrl`. It must not also open pilgrimworks.github.io. That toggle replaces running two copies.

MV3 cannot invent a host permission from a text box. Keep the current hosts as required permissions. Add `optional_host_permissions` for `https://*/*` and `http://*/*`, and call `chrome.permissions.request` only when the user saves a custom URL with dev mode on. The ping check still has to succeed before that URL is used. Turning dev mode off stops using the custom URL.

Do not send this options page upstream unless PilgrimWorks asks for it.
