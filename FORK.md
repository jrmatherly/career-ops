# This is a fork

`jrmatherly/career-ops` is a personal fork of
[career-ops-hq/career-ops](https://github.com/career-ops-hq/career-ops), the
open-source AI job-search agent. The product, its documentation and its
contribution process belong upstream; this repository exists to run the tool
with a few operational changes of its own.

## What differs

Every deliberate difference from upstream has a row in the deviations table in
[`.claude/skills/upstream-review/SKILL.md`](.claude/skills/upstream-review/SKILL.md).
In short: a Claude Code harness (`.claude/`, `.githooks/`), the fork's own CI
set (ten workflows instead of upstream's maintainer bots; a push that changes
only documentation runs the suite on Ubuntu alone), the fork's own releases
(below), a GHCR image build, and contact addresses that route reports to the
fork owner. The product code is upstream's, plus the Reactive Resume
convergence (resume model, editor, board, shares, publish service); a user
arriving from Reactive Resume follows
[`docs/MIGRATING_FROM_REACTIVE_RESUME.md`](docs/MIGRATING_FROM_REACTIVE_RESUME.md).

## Releases

The fork cuts its own releases with release-please (`.github/workflows/release.yml`),
on the 2.x line so its numbers never collide with upstream's 1.x. The web
component is versioned separately from 1.0.0 and shows in the web UI's version
pill. Conventional commits on `main` keep a release PR open; merging it tags
`career-ops-vX.Y.Z` and `web-vX.Y.Z`, publishes the GitHub Releases, writes
`CHANGELOG.fork.md` and `web/CHANGELOG.fork.md`, and builds the server image
under the release tag. The updater (`node update-system.mjs check`) and the
Claude plugin (`.claude-plugin/plugin.json`) follow these releases. Upstream's
`CHANGELOG.md`, root `package.json` version and the npm-facing directory
listings keep upstream's 1.x numbers, because they describe upstream's
packages; upstream's releases ship inside the next fork release after an
upstream review.

## How it syncs

Upstream is merged, not re-based, through the `/upstream-review` skill: it
lists what changed since the last review, dry-runs the merge, and records each
decision under `.upstream-review/reviews/`. `tests/fork-deviations-covered.test.mjs`
fails when a diverged path has no row in the table.

## Run the fork as your plugin

On a Mac, daily use goes through the Claude Code plugin with the
`~/career-ops-data` data root, never through this checkout. The fork's
production path is the server image documented in `deploy/README.md`, a pod
with `CAREER_OPS_ROOT=/data` (the full path is `docs/DEPLOYMENT.md`).
In Claude Code, run the fork route that
[`docs/CLAUDE_PLUGIN.md`](docs/CLAUDE_PLUGIN.md) documents:

```
/plugin marketplace add jrmatherly/career-ops
/plugin install career-ops@career-ops
```

The plugin installs from the fork's `main` and updates only when `version` in
`.claude-plugin/plugin.json` changes, so a branch checked out here never reaches
daily use and user data cannot land in the checkout. On a Mac the data root
is `~/career-ops-data`, the plugin default, so `CAREER_OPS_ROOT` needs no change
there.

## Where to contribute

Bug reports, features and pull requests for the product go to
[career-ops-hq/career-ops](https://github.com/career-ops-hq/career-ops).
Issues are off on this fork, and pull requests are only the owner's own branch
merges; `CONTRIBUTING.md`'s bots, `/assign` claims and adoption ladder run
upstream only. A problem with something only this fork has (its hooks, workflows, GHCR images) goes to
support@matherly.net. Security reports for the fork's own files follow
[`SECURITY.md`](SECURITY.md).

`MAINTAINERS.md`, `CONTRIBUTORS.md`, `SIGNATURES.md` and `HIRED.md` are
upstream's ledgers, carried unchanged (plus a fork banner on the first) and
refreshed only when upstream is merged in. Fork design notes live under
`docs/superpowers/`.
