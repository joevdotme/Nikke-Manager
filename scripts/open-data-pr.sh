#!/usr/bin/env bash
# Open a chore(data) pull request for a catalog run that changed knowledge files.
# Does not open a pull request when CATALOG_GITHUB_TOKEN is missing.
# Enables squash auto-merge. A failing catalog-validate check leaves the PR open.
set -euo pipefail

if [ "${GITHUB_REPOSITORY:-}" != "joevdotme/Nikke-Manager" ]; then
    echo "Catalog pull requests run only on joevdotme/Nikke-Manager."
    exit 0
fi

source_name="${1:-}"
changelog="${2:-}"
if [ -z "$source_name" ] || [ -z "$changelog" ] || [ ! -f "$changelog" ]; then
    echo "Usage: scripts/open-data-pr.sh <game|prydwen|enikk> <changelog-file>"
    exit 1
fi

git diff --quiet -- knowledge/nikke-database.js knowledge/source-versions.json && {
    echo "No knowledge files changed. Not opening a pull request."
    exit 0
}

if [ -z "${CATALOG_GITHUB_TOKEN:-}" ]; then
    echo "CATALOG_GITHUB_TOKEN is not set. Not opening a pull request."
    exit 1
fi

branch="catalog/data-${source_name}-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git checkout -B "$branch"
git add -- knowledge/nikke-database.js knowledge/source-versions.json
git commit -m "chore(data): updated game resources"
# actions/checkout stores GITHUB_TOKEN as an Authorization extraheader. Git sends
# that header instead of the token in the push URL, and contents:read cannot create refs.
git config --local --unset-all http.https://github.com/.extraheader || true
git push "https://x-access-token:${CATALOG_GITHUB_TOKEN}@github.com/joevdotme/Nikke-Manager.git" "HEAD:refs/heads/${branch}"

export GH_TOKEN="$CATALOG_GITHUB_TOKEN"
pr_url="$(gh pr create --repo joevdotme/Nikke-Manager --base main --head "$branch" --title "chore(data): updated game resources" --body-file "$changelog")"
echo "$pr_url"
gh pr merge --repo joevdotme/Nikke-Manager "$pr_url" --squash --auto
