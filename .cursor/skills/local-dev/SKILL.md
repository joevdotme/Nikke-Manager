---
name: local-dev
description: Serve this Nikke Manager checkout on localhost so the installed Chrome extension can import into it. Use when running or previewing the app locally. Do not fork the extension for this.
---

# Local dev

The store extension already allows `http://localhost/*` and tries port 3000 first.

1. From the repo root, run `make serve` (or `make dev`).
2. Open `http://localhost:3000/`.
3. Close any tab on `https://pilgrimworks.github.io/Nikke-Manager` before Import Data. The extension updates an already-open manager tab and never reaches localhost while that tab exists.
4. Use the installed Nikke Manager extension. Do not install a second copy and do not fork the extension for this.

`make` and `make help` list targets. Catalog targets, when present, show up in that list.
