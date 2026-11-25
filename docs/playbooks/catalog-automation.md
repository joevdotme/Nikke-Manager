# Catalog automation

Scheduled jobs can rebuild `knowledge/nikke-database.js` and open a pull request titled `chore(data): updated game resources`. Squash auto-merge runs only after `catalog-validate` passes. `VERSION` does not change.

The jobs are pinned to one repository on purpose. A fork, or an upstream copy, does nothing until you point that pin at your own `owner/repo` and create your own token. Do not reuse someone else's token.

On `joevdotme/Nikke-Manager` this is already done. The token is named `Nikke catalog`, the Actions secret is `CATALOG_GITHUB_TOKEN`, and it expires on Thursday, November 25, 2027. Regenerate it before that date. The steps below are for a new fork or for upstream.

## Opt in

Replace `joevdotme/Nikke-Manager` with your `owner/repo` in:

- `.github/workflows/catalog-game.yml`
- `.github/workflows/catalog-prydwen.yml`
- `.github/workflows/catalog-enikk.yml`
- `.github/workflows/catalog-update.yml`
- `.github/workflows/catalog-validate.yml`
- `.github/workflows/pages.yml`
- `scripts/open-data-pr.sh` (the guard, the push URL, and both `gh` commands)

Leave the guard in place with your repository name. Deleting it makes every copy, including a mirror you did not mean to publish, able to push.

`scripts/open-data-pr.sh` must keep using `CATALOG_GITHUB_TOKEN` for the push, `gh pr create`, and `gh pr merge --squash --auto`. The workflow passes that secret in `.github/workflows/catalog-update.yml`. Do not switch those calls to `GITHUB_TOKEN`. Pull requests opened with the default token do not start the required `catalog-validate` check, so auto-merge waits forever.

## Token

Create the token in a browser, signed in as the account that should own the data pull requests. GitHub will not let another token mint this one.

Open:

https://github.com/settings/personal-access-tokens/new?name=Nikke+catalog&description=Push+catalog+data+branches+and+open+chore+pull+requests.&expires_in=365&contents=write&pull_requests=write

Then set:

- Resource owner: your user account, or the organization that owns the repo
- Repository access: **Only select repositories**, and select that one repository. The link cannot preselect it
- Contents: Read and write
- Pull requests: Read and write
- Metadata: Read-only. GitHub adds this on its own
- Every other permission: No access

Use 365 days, not 366. GitHub rejects 366 with "exceeds the allowed limit of 365 days" and resets the form to 30 days. If that happens, set a custom date one year out before you generate the token.

Generate the token. If GitHub asks for a password or a second factor, finish that yourself. Put the value only in the Actions secret in the next step. Do not paste it into chat, a commit, or a log. GitHub shows it once.

## Secret

Repository **Actions** secret, not an environment secret, a Codespaces secret, a Dependabot secret, or a variable.

- Name: `CATALOG_GITHUB_TOKEN`
- Value: the token you just generated

Settings → Secrets and variables → Actions → Repository secrets:

`https://github.com/OWNER/REPO/settings/secrets/actions`

Confirm the name is listed. The value stays hidden.

## Repository settings

On that repository:

- Settings → General → Pull Requests → **Allow auto-merge**
- Branch protection on `main`: require the status check `catalog-validate`. Do not require a reviewer. Leave administrators able to bypass, so a human can still merge a feature pull request that does not run that check. Auto-merge still waits for the check.

The check name is the job name `catalog-validate` in `.github/workflows/catalog-validate.yml`. It runs on pull requests to `main` after the workflow file is on the default branch.

## Launcher version

You do not need `NIKKE_LAUNCHER_VERSION_URL`. The game job already posts to `https://www.jupiterlauncher.com/api/v1/fleet.repo.game.RepoSVC/GetVersion`. A change to `version_info.build_id` or the Game CDN root scrapes. A launcher-only bump does not. Set the variable only to point the job at a different version document.

## First run

After the workflow files are on the default branch, open Actions → `catalog-game` → Run workflow. Then confirm:

- The run does not exit early with "Catalog pull requests run only on joevdotme/Nikke-Manager."
- If knowledge files changed, the pull request author is the token owner, not `github-actions[bot]`. The commit on the data branch is still authored as `github-actions[bot]`. That split is expected.
- The `catalog-validate` check starts on that pull request.
- A green check squash-merges. A red check stays open and does not deploy.

`catalog-prydwen` and `catalog-enikk` can be dispatched the same way. Prydwen walks every character page, so the game dispatch is the shorter first test.

## Rotation

Regenerate the token before it expires and update the `CATALOG_GITHUB_TOKEN` secret. After expiry the job still scrapes, then stops before opening a pull request.

## Pages and Sign In

The Pages workflow uses the same repository pin. Turn it on only if this repository should publish GitHub Pages.

Sign In is a separate switch. `scripts/write-features.js` enables it in the deploy artifact only when `joevdotme.github.io` is an authorized Firebase domain. A fork that wants its own host changes `HOST` in that file to its `github.io` host. `localhost` does not count. An error leaves the flag off.
