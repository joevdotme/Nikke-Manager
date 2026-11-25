---
name: catalog-automation
description: Enable scheduled catalog updates on a fork or upstream. Use when setting up CATALOG_GITHUB_TOKEN, auto-merge, or the catalog-validate check, or when a fork of Nikke-Manager should open its own chore(data) pull requests.
---

# Catalog automation

Follow [docs/playbooks/catalog-automation.md](../../../docs/playbooks/catalog-automation.md). Do not improvise a second setup.

- The jobs are pinned to `joevdotme/Nikke-Manager` so a copied workflow does not push. Opting in means replacing that owner/repo with the fork's, then creating a new fine-grained token for that repository only.
- Do not mint a token from another token, and do not ask anyone to paste a token into chat. They generate it in the browser and save it as the repository Actions secret `CATALOG_GITHUB_TOKEN`.
- Keep `scripts/open-data-pr.sh` on `CATALOG_GITHUB_TOKEN`. Do not switch the push or the pull request to `GITHUB_TOKEN`.
- Use a 365-day expiration. GitHub rejects 366 and resets the form to 30 days.
- Do not set `NIKKE_LAUNCHER_VERSION_URL` unless they want a different version document. The game job already calls the public launcher endpoint.
- `docs/nikke-changelog.md` is updated only when the client version or server build changes, on the data pull request. The footer Nikke versions are stamped into the Pages artifact and are not committed.
- Do not change branch protection on a repository you were not asked to configure. On `joevdotme/Nikke-Manager`, auto-merge, the `catalog-validate` check, and the secret are already in place. The token expires on Thursday, November 25, 2027.
