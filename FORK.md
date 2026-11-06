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
set (nine workflows instead of upstream's maintainer bots and release
automation), a GHCR image build, and contact addresses that route reports to
the fork owner. The product code is upstream's.

## How it syncs

Upstream is merged, not re-based, through the `/upstream-review` skill: it
lists what changed since the last review, dry-runs the merge, and records each
decision under `.upstream-review/reviews/`. `tests/fork-deviations-covered.test.mjs`
fails when a diverged path has no row in the table.

## Where to contribute

Bug reports, features and pull requests go to
[career-ops-hq/career-ops](https://github.com/career-ops-hq/career-ops).
Issues and pull requests are not used on this fork. Security reports for the
fork's own files follow [`SECURITY.md`](SECURITY.md).
