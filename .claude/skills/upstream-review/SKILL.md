---
name: upstream-review
description: Review what changed in upstream career-ops-hq/career-ops (main) since our last review and decide what to cherry-pick into this fork without disturbing our deviations. Use for "sync from upstream", "what changed upstream", "review upstream commits", "did career-ops update", "bring upstream commit X in", "check upstream for new features", a session-start update-available notice, or any periodic upstream check. Encodes the fork's cherry-pick-not-merge rule, the watermark driver, the per-file divergence markers, the validation batch and the deviations we keep.
argument-hint: "[--stat | --urls | --show <sha> | --diverged | --advance <sha>]"
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/upstream-review.sh *) Bash(git show *) Bash(git log *) Bash(git diff *) Bash(git rev-parse *) Bash(git cherry-pick *) Bash(npm run lint) Bash(npm test) Bash(npm run typecheck) Bash(node validate-system-paths-coverage.mjs) Bash(node test-all.mjs *) Bash(node .githooks/pre-commit.mjs) Read Grep Glob
---

# Upstream review

This repo is a GitHub fork of `career-ops-hq/career-ops` that shares history with upstream. Our `main` left upstream at `f770ec6f` (2026-11-05, v1.39.0 plus one commit); run `--diverged` for the current footprint. Two rules follow from "shared history, deliberate deviations":

- **Never `git merge careerops/main`.** A merge takes every upstream commit, including the ones we decided to skip, and it moves the merge-base so the driver's `<` marker stops meaning anything. Adoption is `git cherry-pick -x <sha>`, oldest first. The 3-way merge uses the commit's own parent as the base, so a hunk applies cleanly when our copy of those lines equals the pre-image and conflicts otherwise; a file we changed elsewhere still takes a non-overlapping upstream hunk.
- **Never run `node update-system.mjs apply` in this checkout.** That is the product's updater for end users: it overwrites system-layer files wholesale from a release tarball. Our fork-local files survive it (they are declared in `config/local-paths.txt`) but any deviation inside a system file would not. `check` is harmless and the SessionStart hook runs it; an `update-available` notice is the cue to run this skill, not `apply`.

## Tooling

| Piece | Path |
| --- | --- |
| Driver | `${CLAUDE_SKILL_DIR}/scripts/upstream-review.sh` (needs `jq`) |
| Watermark (tracked) | `.upstream-review/watermark.json` (`forkPointSha` fixed, `lastReviewedSha` advances) |
| Decision logs (tracked) | `.upstream-review/reviews/<YYYY-MM-DD>-review.md` |
| Coverage declaration | `config/local-paths.txt` lists `.upstream-review/`, so the coverage guard accepts it |

```bash
${CLAUDE_SKILL_DIR}/scripts/upstream-review.sh            # fetch, list un-reviewed commits oldest first
${CLAUDE_SKILL_DIR}/scripts/upstream-review.sh --stat     # + each touched file with a divergence marker
${CLAUDE_SKILL_DIR}/scripts/upstream-review.sh --urls     # + github commit URL per commit
${CLAUDE_SKILL_DIR}/scripts/upstream-review.sh --show <sha>
${CLAUDE_SKILL_DIR}/scripts/upstream-review.sh --diverged # our footprint: files that differ from the fork point
${CLAUDE_SKILL_DIR}/scripts/upstream-review.sh --advance <tip-sha>  # after the log is written; the listing prints the tip SHA
```

The first run adds the `careerops` remote (named so that `gh` keeps `origin` as its default repo; it ranks a remote called `upstream` above `origin`). The driver compares `HEAD:<path>`, so run it from the branch you will pick onto.

Tags in the listing: `[merge]` (parents are in the range; not expanded) and `[picked]` (an earlier cherry-pick already carries this patch; `--cherry-mark` matched the patch id). Markers in `--stat`, our HEAD vs the commit's parent (pre-image) for each file it touches:

| | Meaning | Adoption path |
| --- | --- | --- |
| `=` | ours equals the pre-image | `git cherry-pick -x <sha>` applies cleanly |
| `<` | ours equals the fork point, not the pre-image | an older un-reviewed upstream commit touched it first; pick in order |
| `~` | ours differs from both | we changed it; resolve the 3-way or hand-port |
| `x` | we removed it | check "Deleted or moved paths" below |
| `+` | new upstream file | cherry-pick creates it |
| `bin` | binary | inspect by hand |

## Method

1. Run `--stat`. Group commits by area, the conventional-commit scope upstream uses: `fix(scan):`, `fix(providers):`, `docs(agents):`, `feat(web):`, `i18n(de):`, `test(...)`, `chore: release main`.
2. For each non-merge, non-`[picked]` commit, `--show <sha>` and read the diff against its own upstream parent.
3. Classify our state from the markers and the diff: ALREADY-HAVE, ABSENT, DIVERGED, PARTIAL.
4. Verdict: `ADOPT` (cherry-pick: all files `=`, `<` with its predecessors, or `+`), `ADAPT` (hand-port or resolve: some `~`), `SKIP`, `MONITOR`.
5. Write every verdict with file-level evidence to the dated decision log (template below).
6. Adopt in a batch on a branch: cherry-pick oldest first, then run the validation batch below.
7. Then `--advance <tip-sha>` with the tip SHA from the listing you reviewed (a fresh fetch may have moved on) and commit `.upstream-review/` with the adopted commits. Push only when the user asks.

For a large window (more than about 20 commits), dispatch one reviewer subagent per area with the SHAs, the marker output, and steps 2 to 5. Synthesize into one log.

### Validation batch

`git cherry-pick` does not run the pre-commit hook, so run its checks by hand after the batch, then the suite the way `.claude/rules/dev-workflow.md` and `/pr-ready` do:

```bash
node .githooks/pre-commit.mjs            # force-staged user-layer files, syntax (empty index: syntax only)
npm run lint
node validate-system-paths-coverage.mjs  # a new upstream file lands in SYSTEM_PATHS with its commit; a fork file needs config/local-paths.txt
node test-all.mjs --quick
(cd dashboard && go test ./...)          # only when the batch touched dashboard/ or templates/states.yml
(cd web && npm test && npm run typecheck) # only when the batch touched web/ (its suite is not in test-all; needs `npm --prefix web ci` once)
git diff --name-only <sha-before-batch>..HEAD -- .claude .githooks .upstream-review config/local-paths.txt .gitignore
```

The last line lists fork-local files the batch touched. It should be empty except `.gitignore` (see Deviations); anything else means an upstream hunk landed on our automation and needs reading.

## Rules for this repo

- Keep `-x` on every cherry-pick so the log line "cherry picked from commit" carries provenance. Keep upstream's subject, including its `(#NNNN)`: GitHub resolves those against this fork's own issue list, which is empty, so the decision log carries the `--urls` link for every adopted commit.
- `chore: release main` commits (release-please) are ADOPT once every commit before them in the window is settled. They only rewrite version tokens (`package.json`, `.release-please-manifest.json`, the `x-release-please-version` lines) and prepend `CHANGELOG.md`, and keeping `VERSION` aligned with upstream is what lets `update-system.mjs check` say "up-to-date" instead of nagging every session. Never cut a release of our own from this fork; `release.yml` has no repository guard, so keep GitHub Actions for `release.yml` disabled on the fork or let it fail on the missing App token.
- Upstream commits that touch `.gitignore` show `~` because of our tail block. Cherry-pick anyway: upstream's hunks are above the block and merge cleanly; a conflict keeps both upstream's new rules and our tail, and `!config/local-paths.txt` must stay last.
- An upstream commit that adds a file under `.claude/` (settings, hooks, rules, agents, skills) is ADAPT, never a blind pick: ours is the fork's automation. Read it for a rule or hook worth having, port the idea into our files, and record the decision.
- Upstream commits that touch only `README.*.md` translations, `SIGNATURES.md`, `CONTRIBUTORS.md`, `HIRED.md` or `docs/hired-count.json` are ADOPT in bulk without reading; they are upstream's community ledgers and we carry them as-is so `tests/readme-i18n-drift.test.mjs` and the signature tests stay green.
- A test-only upstream commit (`test(...)`) whose code commit we skipped is SKIP too; one whose code we adopted is ADOPT in the same batch.
- Generated or mirrored files are regenerated, never merged by hand: `claude-directory/`, `cursor-directory/`, `openai-directory/`, `antigravity-directory/` mirror `.agents/skills/career-ops/SKILL.md` and `tests/*-directory-plugin.test.mjs` compare them byte for byte. A conflict in one means the source skill changed; resolve `.agents/skills/career-ops/SKILL.md`, copy, and run those tests.
- A watermark advance without a decision log is a lost review. Never advance past commits you did not classify.

## Deleted or moved paths

An `x` marker means we removed the path, not always that the change is irrelevant. Nothing removed yet. Add a line here for every later removal, with where the content went or why it is gone.

## Deviations decided

A new deviation gets a row here; a deleted path also gets a line in "Deleted or moved paths".

| Upstream | Ours | Status | Notes |
| --- | --- | --- | --- |
| `.claude/` holds only the `career-ops` skill symlink | `.claude/settings.json` (SessionStart, PostToolUse hooks), `.claude/hooks/`, `.claude/rules/`, `.claude/agents/contract-reviewer.md`, `.claude/skills/{pr-ready,add-provider,upstream-review}` | landed 2026-11-05 | Branch `claude-automation`. Upstream `.claude/` additions are ADAPT (see Rules). `.claude/skills/` is SYSTEM_PATHS, so our skills there survive the updater's prune only because they never appeared in upstream history. |
| no git hooks | `.githooks/pre-commit` (+ `.mjs`), `core.hooksPath` set by the SessionStart hook | landed 2026-11-05 | Refuses force-staged gitignored files and syntax errors. Cherry-pick bypasses it; the validation batch runs it. |
| `config/local-paths.txt` gitignored, untracked | tracked and un-ignored (`!config/local-paths.txt`), declaring `.claude/rules/`, `.claude/agents/`, `.githooks/`, `.serena/`, `.upstream-review/` | landed 2026-11-05 | Upstream's own documented fork route (#2991, #4128). |
| `.gitignore` ends at upstream's rules | tail block: `private/`, `.codegraph/`, `.remember/`, `!config/local-paths.txt` | landed 2026-11-05 | Every upstream `.gitignore` commit shows `~`; pick and keep the tail. |
| no `.serena/` | `.serena/project.yml` + its own `.gitignore` | landed 2026-11-05 | Serena language-server project config. |
| no upstream-review state | `.upstream-review/` | landed 2026-11-05 | This skill's watermark and logs. |

## Decision log template

```markdown
# Upstream review - <YYYY-MM-DD>

Window: `<from>..<full tip sha>` on careerops/main, N commits (M merges, P already picked). Driver output: `--stat`.

## Headline
One paragraph: what to adopt now, what to port, what to skip.

## Verdicts
| # | Commit | Area | Our state | Markers | Verdict | Evidence |
|---|--------|------|-----------|---------|---------|----------|

## Adopted
Cherry-picked SHAs in order with their upstream URLs, validation batch result (lint, coverage, test-all, go test if run, fork-local diff check).
```

## Red flags

- `git merge careerops/main`, `git pull` from upstream, or `node update-system.mjs apply` in this checkout.
- Cherry-picking a `~` file without reading our side first.
- Review state anywhere except `.upstream-review/`.
- Advancing the watermark to a SHA other than the tip printed by the listing you classified.
- A batch that lands with `node validate-system-paths-coverage.mjs` or `node test-all.mjs --quick` red.
