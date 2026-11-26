<!--
Title. Squash merge uses this as the commit on main, and that line is the release changelog entry.

    <type>(<scope>): <imperative summary>

Types: feat, fix, chore, ci, refactor, test, build, perf.
Scope is optional and short: auth, catalog, data, dev, docs.
The summary is lowercase, imperative, and has no trailing period.
feat and fix are the user-facing changelog. Use chore or ci when the change should not read as a product change.
Documentation-only changes use chore(docs), not a docs type.
Catalog data pulls keep this exact title: chore(data): updated game resources
VERSION is bumped on main after the squash merge. feat is minor. fix, perf, and chore(data) are patch. A breaking feat, fix, or perf is major. Leave VERSION alone unless this pull request needs a different number.

Labels. Apply one type label. Do not put enhancement on a chore or a ci change.

    feat, perf        → enhancement
    fix               → bug
    chore(docs)       → documentation
    chore, ci, refactor, test, build → no type label

Add good first issue or help wanted only when that is true.
Add accessibility when the change affects people using assistive tech.
-->

## Changelog

-

## How to test

1.

## Screenshots

No UI change.

<!-- When a screen changed, replace the line above with before and after images. -->
