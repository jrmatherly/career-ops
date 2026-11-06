---
name: upstream-review
description: Review what changed in upstream career-ops-hq/career-ops (main) since our last review, check with GitHub and a local dry run whether it merges cleanly, and bring it into this fork without disturbing our deviations. Use for "sync from upstream", "sync fork", "what changed upstream", "review upstream commits", "did career-ops update", "are we behind upstream", "bring upstream commit X in", a session-start update-available notice, or any periodic upstream check. Encodes the fork's merge-first rule, the GitHub compare and merge-tree checks, the watermark driver, the per-file divergence markers, the validation batch and the deviations we keep.
argument-hint: "[--stat | --urls | --show <sha> | --diverged | --dry-run-merge | --github | --advance <sha>]"
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/upstream-review.sh *) Bash(git show *) Bash(git log *) Bash(git diff *) Bash(git rev-parse *) Bash(git merge-tree *) Bash(git merge *) Bash(git cherry-pick *) Bash(git revert *) Bash(gh api repos/*/compare/*) Bash(gh pr view *) Bash(npm run lint) Bash(npm test) Bash(npm run typecheck) Bash(node validate-system-paths-coverage.mjs) Bash(node test-all.mjs *) Bash(node .githooks/pre-commit.mjs) Read Grep Glob
---

# Upstream review

This repo is a **GitHub fork** of `career-ops-hq/career-ops` (GitHub reports `fork: true`, parent `career-ops-hq/career-ops`) and shares history with it. That gives us three things a copied repo never has, and the method below leans on all of them:

1. **A real merge-base.** `git merge-base HEAD careerops/main` is the last upstream commit our tree carries wholesale. Our deviation footprint is `git diff <merge-base> HEAD` (`--diverged`), and `git merge careerops/main` is a legal operation.
2. **A dry run that cannot touch the tree.** `git merge-tree --write-tree HEAD careerops/main` performs the merge in memory and lists the conflicting files (`--dry-run-merge`). GitHub answers the same question for a pull request through `mergeable`.
3. **GitHub's fork compare.** `gh api repos/<fork>/compare/career-ops-hq:main...<branch>` reports `ahead_by`, `behind_by` and `status` (`--github`), and the web compare pages show the same two directions. GitHub counts **commits, not patches**: a cherry-pick leaves the fork reading "behind" until a merge records the ancestry, and the "Sync fork" button only works on merge history.

## Sync policy: merge first, cherry-pick for the exceptions

- **Default is a merge.** When the window's verdicts are all ADOPT and `--dry-run-merge` is clean, `git merge careerops/main` on a branch, run the validation batch, push. The merge-base moves to the tip, GitHub shows `behind_by: 0`, and the next review starts from there. "Sync fork" on GitHub does the same merge into `main` directly, so use it only after the local dry run is clean and when you accept CI as the only validation; the local route runs the batch before anything lands.
- **A SKIP is a revert on our side, not a withheld merge.** Withholding the merge because of one unwanted commit forces cherry-pick-forever and a permanently misleading GitHub compare. Merge, then `git revert -x`-style the skipped commit (`git revert <sha>`, subject `revert(upstream): <original subject>`), and add a row to the deviations table. The revert is the deviation; a later upstream change to the same lines conflicts on purpose and gets read.
- **An ADAPT is a conflict resolved per the deviations table.** Take upstream's logic on everything the table does not name; keep ours where it does. Resolve, `git add`, finish the merge, record in the log.
- **Cherry-pick (`git cherry-pick -x`) is for taking a single fix early**, ahead of the next merge, or for a window you are not ready to merge wholesale. The merge that follows later absorbs the pick (patch ids match; the listing tags it `[picked]`).
- **Never run `node update-system.mjs apply` in this checkout.** That is the product's updater for end users: without `--force` it keeps every locally modified system file and writes a `.bak` beside it, so deviations freeze instead of receiving upstream changes; `--force` overwrites them (still after the `.bak`). Our fork-local files survive (declared in `config/local-paths.txt`). `check` is harmless and the SessionStart hook runs it; an `update-available` notice is the cue to run this skill.

## Tooling

| Piece | Path |
| --- | --- |
| Driver | `${CLAUDE_SKILL_DIR}/scripts/upstream-review.sh` (needs `jq`; `--github` needs `gh`) |
| Watermark (tracked) | `.upstream-review/watermark.json` (`forkPointSha` fixed history, `lastReviewedSha` advances) |
| Decision logs (tracked) | `.upstream-review/reviews/<YYYY-MM-DD>-review.md` |
| Coverage declaration | `config/local-paths.txt` lists `.upstream-review/`, so the coverage guard accepts it |

```bash
${CLAUDE_SKILL_DIR}/scripts/upstream-review.sh                 # fetch, list un-reviewed commits oldest first, with merge-base and unmerged count
${CLAUDE_SKILL_DIR}/scripts/upstream-review.sh --stat          # + each touched file with a divergence marker
${CLAUDE_SKILL_DIR}/scripts/upstream-review.sh --urls          # + github commit URL per commit
${CLAUDE_SKILL_DIR}/scripts/upstream-review.sh --show <sha>
${CLAUDE_SKILL_DIR}/scripts/upstream-review.sh --diverged      # our footprint vs the merge-base
${CLAUDE_SKILL_DIR}/scripts/upstream-review.sh --dry-run-merge # merge-tree: clean, or the conflicting files; exit 1 on conflict
${CLAUDE_SKILL_DIR}/scripts/upstream-review.sh --github        # GitHub compare: ahead/behind/status for main and this branch, compare URLs
${CLAUDE_SKILL_DIR}/scripts/upstream-review.sh --advance <tip-sha>  # after the log is written; the listing prints the tip SHA
```

The first run adds the `careerops` remote (named so that `gh` keeps `origin` as its default repo; it ranks a remote called `upstream` above `origin`). The driver compares `HEAD:<path>`, so run it from the branch you will merge onto.

Tags in the listing: `[merge]` (parents are in the range; not expanded) and `[picked]` (an earlier cherry-pick already carries this patch). Markers in `--stat`, our HEAD vs the commit's parent (pre-image) for each file it touches:

| | Meaning | What happens in a merge |
| --- | --- | --- |
| `=` | ours equals the pre-image | clean |
| `<` | ours equals the merge-base, not the pre-image | an older un-reviewed upstream commit touched it first; the merge brings both |
| `~` | ours differs from both | we changed it; a conflict is likely here, resolve per the deviations table |
| `x` | we removed it | check "Deleted or moved paths" below |
| `+` | new upstream file | created |
| `bin` | binary | inspect by hand |

## Method

1. Run `--stat` and `--github`. Group commits by area, the conventional-commit scope upstream uses: `fix(scan):`, `fix(providers):`, `docs(agents):`, `feat(web):`, `i18n(de):`, `test(...)`, `chore: release main`.
2. For each non-merge, non-`[picked]` commit, `--show <sha>` and read the diff against its own upstream parent.
3. Classify our state from the markers and the diff: ALREADY-HAVE, ABSENT, DIVERGED, PARTIAL.
4. Verdict: `ADOPT` (comes in with the merge), `ADAPT` (merge, resolve the `~` conflict per the table), `SKIP` (merge, then revert), `MONITOR`.
5. Run `--dry-run-merge`. A clean result with all-ADOPT verdicts is the fast path. Conflicting files should be the `~` files the ADAPT verdicts already name; a surprise conflict means a deviation nobody recorded, so record it first.
6. Write every verdict with file-level evidence to the dated decision log (template below).
7. On a branch: `git merge careerops/main`, resolve any conflicts, apply the SKIP reverts, then the validation batch below. Push only when the user asks.
   Also sync upstream's tags with the merge: `git fetch careerops '+refs/tags/career-ops-v*:refs/tags/career-ops-v*' '+refs/tags/web-v*:refs/tags/web-v*' && git push origin 'refs/tags/career-ops-v*' 'refs/tags/web-v*'`. The fork was created without them, and `upgrade-tests.mjs --pr-gate` (the `Upgrade regression gate` job in `test.yml`) fails with "No release tag is an ancestor of HEAD" when the newest `career-ops-v*` tag is missing; `update-system.mjs`'s release channel reads the same tags.
8. `--advance <tip-sha>` with the tip SHA from the listing you reviewed (a fresh fetch may have moved on) and commit `.upstream-review/` with the merge. After the push, `--github` should read `behind_by=0` for the branch.

For a large window (more than about 20 commits), dispatch one reviewer subagent per area with the SHAs, the marker output, and steps 2 to 4. Synthesize into one log.

### Validation batch

A merge commit does not run the pre-commit hook, so run its checks by hand, then the suite the way `.claude/rules/dev-workflow.md` and `/pr-ready` do:

```bash
node .githooks/pre-commit.mjs            # force-staged user-layer files, syntax (empty index: syntax only)
npm run lint
node validate-system-paths-coverage.mjs  # a new upstream file arrives in SYSTEM_PATHS with its commit; a fork file needs config/local-paths.txt
node test-all.mjs --quick
(cd dashboard && go test ./...)          # only when the batch touched dashboard/ or templates/states.yml
(cd web && npm test && npm run typecheck) # only when the batch touched web/ (its suite is not in test-all; needs `npm --prefix web ci` once)
git diff --name-only <sha-before-batch>..HEAD -- .claude .githooks .upstream-review config/local-paths.txt .gitignore
```

The last line lists fork-local files the batch touched. It should be empty except `.gitignore` (see Deviations); anything else means an upstream hunk landed on our automation and needs reading.

## Rules for this repo

- `chore: release main` commits (release-please) come in with the merge and are ADOPT: they only rewrite version tokens (`package.json`, `.release-please-manifest.json`, the `x-release-please-version` lines) and prepend `CHANGELOG.md`, and keeping `VERSION` aligned with upstream is what lets `update-system.mjs check` say "up-to-date" instead of nagging every session. Never cut a release of our own from this fork (`release.yml` was deleted here).
- Upstream commits that touch `.gitignore` show `~` because of our tail block. Merge anyway: upstream's hunks are above the block and merge cleanly; a conflict keeps both upstream's new rules and our tail, and `!config/local-paths.txt` must stay last.
- An upstream commit that adds a file under `.claude/` (settings, hooks, rules, agents, skills) is ADAPT, never taken blind: ours is the fork's automation. Read it for a rule or hook worth having, port the idea into our files, and resolve the conflict keeping ours.
- Upstream commits that touch only `README.*.md` translations, `SIGNATURES.md`, `CONTRIBUTORS.md`, `HIRED.md` or `docs/hired-count.json` are ADOPT without reading; they are upstream's community ledgers and we carry them as-is so `tests/readme-i18n-drift.test.mjs` and the signature tests stay green.
- A test-only upstream commit (`test(...)`) whose code commit we revert is reverted too; one whose code we keep stays.
- Generated or mirrored files are regenerated, never merged by hand: `claude-directory/`, `cursor-directory/`, `openai-directory/`, `antigravity-directory/` mirror `.agents/skills/career-ops/SKILL.md` and `tests/*-directory-plugin.test.mjs` compare them byte for byte. A conflict in one means the source skill changed; resolve `.agents/skills/career-ops/SKILL.md`, copy, and run those tests.
- Keep `-x` on every cherry-pick so the log line "cherry picked from commit" carries provenance. Keep upstream's subject, including its `(#NNNN)`: GitHub resolves those against this fork's own issue list, which is empty, so the decision log carries the `--urls` link for every adopted commit.
- A watermark advance without a decision log is a lost review. Never advance past commits you did not classify.

## Deleted or moved paths

An `x` marker means we removed the path, not always that the change is irrelevant. Add a line here for every later removal, with where the content went or why it is gone.

- `.github/workflows/` (2026-11-05): 19 upstream maintainer and community workflows removed: `auto-triage-scan-output`, `ci-approve`, `direction-gate`, `gfi-claims`, `gfi-handoff`, `gh-events-feed`, `hired-wall`, `label-bot`, `labeler`, `ledger-bot`, `manifesto-guestbook`, `plugin-registry-freshness`, `pr-adoption`, `pr-triage`, `release`, `sbom`, `signature-ci`, `stale`, `welcome`. They ran upstream's PR triage, good-first-issue claims, hired wall, manifesto ledger, Discord feeds and release-please against upstream secrets, and several would have acted on this fork's issues and PRs. Byte-for-byte copies of the whole `.github/` tree as it stood are in `private/OLD-.github/` (gitignored) for a follow-up review of which to re-adopt. An upstream commit touching a removed workflow is SKIP; the merge resolves the modify/delete conflict by keeping the deletion (`git rm` the path). `.github/scripts/*.mjs`, `.github/labeler.yml`, the templates and `.github/plugin/` stay, because tests import or read them. No test reads `.github/agents/`.
- `.github/agents/address-review.agent.md`, `.github/agents/adopt-pr.agent.md` (2026-11-05): bound to upstream's process. `address-review` stops unless the head repository is `career-ops-hq/career-ops` and resolves CodeRabbit threads the fork never gets; `adopt-pr` works from `adoptable` issues, and issues are off here. `docs-drift`, `i18n-sync`, `pr-brief` and `repro` are generic and stay. Copies in `private/OLD-.github/agents/`.

## Deviations decided

A new deviation gets a row here; a SKIP revert gets a row with the upstream SHA; a deleted path also gets a line in "Deleted or moved paths".

| Upstream | Ours | Status | Notes |
| --- | --- | --- | --- |
| `.claude/` holds only the `career-ops` skill symlink | `.claude/settings.json` (SessionStart, PostToolUse hooks), `.claude/hooks/`, `.claude/rules/`, `.claude/agents/contract-reviewer.md`, `.claude/skills/{pr-ready,add-provider,upstream-review}` | landed 2026-11-05 | Branch `claude-automation`. Upstream `.claude/` additions are ADAPT (see Rules). `.claude/skills/` is SYSTEM_PATHS, so our skills there survive the updater's prune only because they never appeared in upstream history. Fork suites: `tests/claude-hooks.test.mjs`, `tests/upstream-review-script.test.mjs`, `tests/fork-deviations-covered.test.mjs` (fails when a diverged path has no row here). |
| no git hooks | `.githooks/pre-commit` (+ `.mjs`), `core.hooksPath` set by the SessionStart hook | landed 2026-11-05 | Refuses force-staged gitignored files and syntax errors. Merges and cherry-picks bypass it; the validation batch runs it. |
| `config/local-paths.txt` gitignored, untracked | tracked and un-ignored (`!config/local-paths.txt`), declaring `.claude/rules/`, `.claude/agents/`, `.githooks/`, `.serena/`, `.upstream-review/` | landed 2026-11-05 | Upstream's own documented fork route (#2991, #4128). |
| `.gitignore` ends at upstream's rules | tail block: `private/`, `.codegraph/`, `.remember/`, `.claude/skill-stack.json`, `.claude/rules/skill-stack.md`, `!config/local-paths.txt` | landed 2026-11-05 | Every upstream `.gitignore` commit shows `~`; merge and keep the tail. |
| no `.serena/` | `.serena/project.yml` + its own `.gitignore` | landed 2026-11-05 | Serena language-server project config. |
| no upstream-review state | `.upstream-review/` | landed 2026-11-05 | This skill's watermark and logs. |
| 27 workflows incl. maintainer bots and release-please | 9 workflows: `test`, `web-ci`, `codeql`, `dependency-review`, `no-user-data`, `depends-on`, `plugin-registry-validate`, `copilot-setup-steps`, plus fork-only `docker-image` | landed 2026-11-05 | See "Deleted or moved paths". `test.yml` also runs on `push` and `workflow_dispatch` (no PR flow on a personal fork) and pulls the cv-visual image from GHCR with a local-build fallback; upstream hunks to its triggers or the two build steps are `~`, keep ours. The Node-floor step keeps upstream's bare name (`tests/node-floor.test.mjs` regex-matches it), every other step carries an emoji label. Action pins: `setup-node` v7.1.0 and `codeql-action` v4.39.3 everywhere; an upstream pin bump is ADOPT when newer, else keep ours. `no-user-data` also runs on push to `main` (compareCommits), since the fork has no PR flow. Six workflows carry a `concurrency:` cancel-in-progress block and emoji workflow, job and step names (except the Node-floor step); a job rename changes check names. The `test` job checks out with `fetch-depth: 0` so `tests/fork-deviations-covered.test.mjs` sees the upstream base. `test.yml` has no `merge_group` trigger or conditions (no merge queue here); `codeql.yml` also scans the `actions` language. |
| `CODEOWNERS` names upstream maintainers | every owner is `@jrmatherly` | landed 2026-11-05 | Upstream owner changes are `~`; keep ours, take any new path entries. `tests/codeowners-paths.test.mjs` only checks the paths exist. Header says nothing enforces ownership on the fork. |
| `dependabot.yml` covers npm, gomod and github-actions | github-actions only; npm/Go pins come in with the upstream merge | landed 2026-11-05 | Upstream edits to the file are `~`; keep ours. `renovate.json` is left as upstream ships it: no Renovate app on the fork, so it is inert and deleting it only buys conflicts. |
| `codeql.yml` installs Go after `codeql-action/init`; `web/tests/lib/cv-upload.test.mjs` opens a statement with `import.meta.resolve(...)` | setup-go runs before init; the probe is `void import.meta.resolve(...)` | landed 2026-11-05 | Both clear CodeQL tool-status warnings (untraced Go build; JS parse error). Upstream PR candidates; if upstream fixes them differently, take upstream's version. |
| `SECURITY.md`, `.github/SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md` route reports to `hi@santifer.io` | `support@matherly.net`; SECURITY.md also points shared-code issues at upstream's policy and credits in the commit, not release notes | landed 2026-11-05 | Contact lines only; an upstream rewording of the surrounding text is ADOPT, keep our address. `TRADEMARK.md`, `funding.json`, `package.json` author and the plugin manifests keep upstream's contact: they name the author and trademark owner, not this fork's maintainer. |
| `FUNDING.yml` → upstream Open Collective | comment-only | landed 2026-11-05 | File kept because `test-all.mjs` lists it. |
| root `Dockerfile` base image by tag; compose image `career-ops:local`; no registry | base pinned by digest (`mcr.microsoft.com/playwright:v1.64.1-jammy@sha256:a3966b65…`); compose `image: ghcr.io/jrmatherly/career-ops:latest` (still builds locally); `docker-image.yml` publishes both images to GHCR | landed 2026-11-05 | No Docker Hub anywhere upstream; the base is Microsoft's registry and stays. An upstream Playwright version bump touches the `FROM` line (`~`): take the new tag, re-resolve the digest with `docker buildx imagetools inspect`. Files: `Dockerfile`, `docker-compose.yml`, `DOCKER.md`. `docker-image.yml` attests `provenance: mode=max` and `sbom: true`. |
| no rulesets | branch ruleset `protect-main` blocks deletion and force-push on `main`, nothing else | landed 2026-11-05 | Repo setting, not a file; `gh api repos/jrmatherly/career-ops/rulesets`. Direct pushes still work. |
| no `docs/superpowers/` | `docs/superpowers/specs/`, `docs/superpowers/plans/` | landed 2026-11-05 | Fork design specs and implementation plans; covered by the `docs/` system entry, never shipped upstream. |
| no fork notice | `FORK.md` at the root: what this fork is, what differs, how it syncs, where to contribute | landed 2026-11-05 | Declared in `config/local-paths.txt`. README stays upstream's (CODEOWNERS-claimed, changes every release). |

## Decision log template

```markdown
# Upstream review - <YYYY-MM-DD>

Window: `<from>..<full tip sha>` on careerops/main, N commits (M merges, P already picked). Driver output: `--stat`, `--dry-run-merge` (clean | conflicts in ...), `--github` (status, ahead_by, behind_by before).

## Headline
One paragraph: merge or cherry-pick, what to revert, what to resolve, what to skip.

## Verdicts
| # | Commit | Area | Our state | Markers | Verdict | Evidence |
|---|--------|------|-----------|---------|---------|----------|

## Landed
Sync method (merge <sha> | cherry-picks in order), conflicts resolved and how, reverts applied, validation batch result (lint, coverage, test-all, go test and web if run, fork-local diff check), `--github` after (expect behind_by=0).
```

## Red flags

- `node update-system.mjs apply` in this checkout.
- Merging without `--dry-run-merge` first, or with ADAPT verdicts whose files the dry run did not list (a deviation nobody recorded).
- Dropping an unwanted upstream commit by withholding the merge instead of reverting it.
- Resolving a `~` conflict without reading our side and the deviations table first.
- Review state anywhere except `.upstream-review/`.
- Advancing the watermark to a SHA other than the tip printed by the listing you classified.
- A batch that lands with `node validate-system-paths-coverage.mjs` or `node test-all.mjs --quick` red.
