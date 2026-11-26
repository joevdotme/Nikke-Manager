---
name: refresh-catalog
description: Rebuild the Nikke knowledge files from the game catalog, the Fandom wiki, and enikk, then preview them locally. Use when refreshing catalog data in this checkout. Do not open a pull request.
---

# Refresh catalog

The scheduled jobs on this fork open `chore(data): updated game resources` pull requests. A local refresh does not.

1. From the repo root, run `make catalog` (or `make catalog-game`, `make catalog-fandom`, `make catalog-enikk` for one source). Weapon types come from the Nikke Fandom wiki through its API. The wiki text is CC BY-SA. The changelog line links the Weapon article. Do not copy wiki prose into the repo.
2. Run `make verify` when you want the same gates as `catalog-validate`. `verify-weapons.js` only compares. It does not edit the database.
3. Run `make serve` and import with the installed extension.
4. Do not commit the knowledge diff and do not open a pull request from this checkout. The fork workflows do that when a source actually changes.

Enabling those workflows on a fork or on upstream is a separate setup. Follow `.cursor/skills/catalog-automation/SKILL.md` and `docs/playbooks/catalog-automation.md`.
