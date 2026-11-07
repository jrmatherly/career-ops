# Upstream decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every runtime path by which this fork, or a deployment of it, reaches `career-ops-hq/career-ops` or `santifer/career-ops` for code, versions or issue tracking, so an upstream change cannot alter what the fork installs, reports or tells its users.

**Architecture:** An audit on 2026-11-07 of the 215 tracked files that name either upstream namespace sorted them into three classes. Provenance (issue numbers in comments, maintainer credits, the `.upstream-review/` log, the Go module path) is inert and stays. Fork-aware references (`${{ github.repository }}`, `GITHUB_REPOSITORY`) already resolve to this repository. Six live ties remain, and they are what this plan changes: the update channel, the upgrade regression gate's mirror of it, the product prompts that tell an agent how to update, the web app's bug-report target, the install docs, and the crawler's contact URL. Each becomes a fork-owned constant with a deviations row, so the next upstream merge conflicts on purpose where it matters and nowhere else.

**Tech Stack:** Node `.mjs` scripts, Next.js web app, GitHub Actions, the fork's upstream-review skill and its deviations table.

**Spec:** the findings table below, which is the audit's output.

## Findings

| # | Tie | Where | What breaks if upstream changes it | Risk | Verdict |
|---|---|---|---|---|---|
| 1 | Update channel points at upstream | `update-system.mjs:131-141` (`CANONICAL_REPO`, `RAW_VERSION_URL`, `RELEASES_API`, `UPSTREAM_REF_API`) | `check` runs at every session start (`.claude/hooks/session-start.mjs:32`) and in every product install, and prompts to install upstream's next release; `apply` replaces every system-layer file with upstream's tarball, deleting the fork's work in `web/`, `lib/resume/`, `publish/`. A hosted instance (PR-17 image, PR-19 cluster) carries the same prompt. | High | Task 1: the constants name this fork. The fork cuts no releases, so `check` reports `no-remote-version` and says nothing; `--channel main` installs the fork's own `main`, which is the update a deployment wants. |
| 2 | Upgrade regression gate mirrors the same URL | `upgrade-tests.mjs:39-43` (`CANONICAL`, `CANONICAL_LEGACY`), the `Upgrade regression gate` job in `.github/workflows/test.yml` | The gate rewrites `CANONICAL` onto a local mirror; if Task 1 changes the updater's URL and this stays, the leg reaches the real network or the mirror misses. | High, coupled to 1 | Task 1: change together; keep both old URLs as legacy entries because old tags still embed them. |
| 3 | Product prompts describe an upstream update | `AGENTS.md` "Update Check", `modes/update.md:23,55` (`git fetch https://github.com/career-ops-hq/… career-ops-v{remote}`, release-notes link) | An agent running the product follows the prompt and fetches upstream's tag over the fork. | High, coupled to 1 | Task 2: the fetch names the fork; the release-notes line names the fork's commit log. |
| 4 | Web bug reports go to upstream's issues | `web/src/components/beta/beta-banner.tsx:17`, `web/src/lib/report/report.ts:3` (`REPO = "career-ops-hq/career-ops"`) | The banner's "similar issues" search and the "report a bug" link open on upstream; a fork user files a fork bug upstream. | Medium | Task 3: one constant in `report.ts`, read by the banner; the fork's slug. |
| 5 | Install docs send users upstream | `docs/SETUP.md:20,54,94,113`, `CONTRIBUTING.md` (14 hits) | Readers clone upstream or run `npx @santifer/career-ops init`, which installs upstream. | Medium, docs only | Task 4: the clone and PR lines name the fork; the `npx` line stays as upstream's installer with one sentence saying so (the install string is pinned by tests and was decided KEEP on 2026-11-06). |
| 6 | Crawler contact URL is upstream's | `user-agent.mjs:13` | A job board that reads the `+url` contacts upstream about this fork's scans. | Low | Task 5: the fork's URL. Keep the `career-ops/1.0` product token, which boards may already recognise. |
| 7 | Scaffolder pins plugins to upstream's latest release | `scaffolder/bin/release-tag.mjs:16`, pinned by `tests/scaffolder-release-tag.test.mjs:66` | Plugins scaffolded here target upstream's release. | Low | KEEP. Plugins are upstream's ecosystem (`career-ops-plugin-*`), same decision as the directory listings. |
| 8 | Go module path | `dashboard/go.mod` and 51 Go files import `github.com/santifer/career-ops/dashboard` | Nothing: the module is built from this tree, `go test ./...` resolves it locally, no `go get` of that path exists. It is a name. | None at runtime | KEEP. A rename touches 53 files that upstream still edits and turns every upstream dashboard change into an ADAPT conflict. Revisit only if the fork stops merging upstream. |
| 9 | Hired Wall and OpenRouter referer | `hired-share.mjs:51`, `openrouter-runner.mjs:435,502` | The wall is upstream's community feature by design; the referer is a courtesy header. | None | KEEP. |
| 10 | Plugin manifests, directory listings, `npx @santifer/career-ops` install strings, `funding.json`, `.well-known/funding-manifest-urls`, `package.json` author, `TRADEMARK.md` | 16 manifests and READMEs, `tests/*-directory-plugin.test.mjs`, `tests/skill-standalone-install.test.mjs`, `test-all.mjs:19753` | They name the author and upstream's directory submissions. | None | Already decided KEEP on 2026-11-05 and 2026-11-06 (deviations rows at lines 202 and 225). Not reopened here. |
| 11 | GitHub fork relationship | `gh api repos/jrmatherly/career-ops` reports `fork: true`, parent `career-ops-hq/career-ops` | The upstream-review skill's compare (`gh api repos/<fork>/compare/career-ops-hq:main...`) works because the repositories share a network. Detaching is a GitHub Support request, one-way, and would break that check. | None today | KEEP. Record the reasoning in the skill. |
| 12 | Fork-aware references | `docker-image.yml`, `test.yml` (`ghcr.io/${{ github.repository }}…`), the `.github/scripts/*.mjs` (`GITHUB_REPOSITORY`), `tests/record-fixtures.mjs:19` | Already resolve to this repository in Actions. | None | No change. |
| 13 | Provenance in comments and docs | about 60 scripts and tests citing `Issue #NNNN — github.com/career-ops-hq/career-ops`, `docs/SOURCE_INDEXING_LOG.md`, `.upstream-review/` | History. | None | No change. |

## Global Constraints

- Fork rules from `.claude/rules/dev-workflow.md`: sibling worktree, Conventional Commits with a scope, `/simplify` then `/code-review` per commit, `node scripts/check-syntax.mjs` and `node test-all.mjs --quick` before the push; `web/` changes also run `npm run typecheck` and `npm test` there.
- Every changed upstream file gets a deviations-table row in `.claude/skills/upstream-review/SKILL.md` whose Notes cell names the exact hunk we own and opens with ADAPT, so the next merge keeps ours only where the row says.
- `update-system.mjs` is also a USER_PATHS/SYSTEM_PATHS manifest owner; Task 1 touches only the four URL constants and nothing in the manifests.
- Never run `node update-system.mjs apply` in the checkout. Task 1's proof runs `check` only, plus the hermetic upgrade gate.
- No change to the author, trademark, funding or plugin-listing files (finding 10).

## Review Focus

1. `node update-system.mjs check` in a checkout of the fork with no releases: must print `{"status":"no-remote-version"…}` and nothing else, never `update-available` for an upstream tag. Pinned in Task 1.
2. `node update-system.mjs check --channel main` on a fork checkout behind `origin/main`: must report the fork's `main` SHA, so a deployment can update to the fork. Pinned in Task 1.
3. The upgrade gate's legs that start from an old upstream tag (whose embedded updater still names `santifer/career-ops` or `career-ops-hq/career-ops`): must keep resolving to the local mirror. Pinned in Task 1 by running `node upgrade-tests.mjs` locally.
4. The web bug-report link with a diagnostic payload: must open `https://github.com/jrmatherly/career-ops/issues/new?…`. Pinned in Task 3 by `web/tests/lib/report.test.mjs` (or the existing report test file, extended).
5. A session start after Task 1: the SessionStart hook's `check` must stay under its 12 s timeout against the fork's API endpoints. Pinned in Task 1 by timing one run.

---

### Task 1: The update channel names the fork

**Files:**
- Modify: `update-system.mjs:131-141`
- Modify: `upgrade-tests.mjs:39-43`
- Test: `tests/updater-fork-origin.test.mjs` (new)
- Modify: `.claude/skills/upstream-review/SKILL.md` (two rows, and a line under "Sync policy" saying the updater now tracks the fork)

**Interfaces:**
- Produces: `CANONICAL_REPO = 'https://github.com/jrmatherly/career-ops.git'`, `RAW_VERSION_URL`, `RELEASES_API` and `UPSTREAM_REF_API` on `jrmatherly/career-ops`; `upgrade-tests.mjs` `CANONICAL` equal to the new `CANONICAL_REPO`, with `CANONICAL_LEGACY` becoming an array of the two upstream URLs.

- [ ] **Step 1: Write the failing test**

`tests/updater-fork-origin.test.mjs`: import the constants (export them if they are not; `SEMVER_RE` already is) and assert each contains `jrmatherly/career-ops` and none contains `career-ops-hq` or `santifer`; import `upgrade-tests.mjs`'s `CANONICAL` and assert it equals `CANONICAL_REPO`, and that its legacy list still names both upstream URLs. Follow the discovered-suite rules (own file, no `process.exit`).

Run: `node test-all.mjs --only updater-fork-origin`
Expected: FAIL on the first assertion.

- [ ] **Step 2: Change the constants**

Four lines in `update-system.mjs`, two in `upgrade-tests.mjs`, plus the `insteadOf` lines in its git config writer (line 81) iterating the legacy list. Update the comments next to them in one line each.

Run the test. Expected: PASS.

- [ ] **Step 3: Prove the three behaviours**

```bash
node update-system.mjs check
node update-system.mjs check --channel main
time node update-system.mjs check
node upgrade-tests.mjs
```

Expected: `no-remote-version`; a `main` status naming `origin/main`'s SHA; under 12 s; the gate green. Keep the outputs in the PR body.

- [ ] **Step 4: Rows and commit**

Two ADAPT rows ("our hunk is the four URL constants" / "the two mirror URLs and the legacy list"). Commit `fix(update): track this fork, not upstream, for releases and main`.

### Task 2: The product prompts describe a fork update

**Files:**
- Modify: `AGENTS.md` "Update Check" section (the release wording), `modes/update.md:23,55`
- Modify: deviations table (two rows)

- [ ] **Step 1: Edit** the `git fetch` line to the fork's URL and the release-notes line to `https://github.com/jrmatherly/career-ops/commits/main`. In `AGENTS.md`, replace "a newer career-ops release is published" with the fork's reality: no releases are cut, `check` is silent, and `--channel main` is the supported update.
- [ ] **Step 2: Verify** `node test-all.mjs --only agents` (whichever suites parse `AGENTS.md`, found with `grep -l AGENTS.md tests/*.test.mjs`) stays green.
- [ ] **Step 3: Rows and commit** `docs(update): describe the fork's update channel`.

### Task 3: Web bug reports open on the fork

**Files:**
- Modify: `web/src/lib/report/report.ts:3`, `web/src/components/beta/beta-banner.tsx:17` (import the constant instead of redeclaring it)
- Test: the existing test for `report.ts` under `web/tests/lib/` (extend) or `web/tests/lib/report-target.test.mjs` (new)
- Modify: deviations table (two rows)

- [ ] **Step 1: Failing test** asserting `issueUrl(diag, "x")` starts with `https://github.com/jrmatherly/career-ops/issues/new` and that `beta-banner.tsx`'s source has no `career-ops-hq` string.
- [ ] **Step 2: Export** `REPO` from `report.ts` as the fork slug, import it in the banner.
- [ ] **Step 3: Run** `cd web && npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 4: Rows and commit** `fix(web): send bug reports to this fork`.

### Task 4: Install docs name the fork

**Files:**
- Modify: `docs/SETUP.md:20,94,113`, `CONTRIBUTING.md` (clone and PR-target lines only)
- Modify: deviations table (one row covering both)

- [ ] **Step 1: Edit** the clone URL and the "open a pull request against" line to the fork. Leave the `npx @santifer/career-ops init` line and add one sentence after it: it installs upstream's release, and a fork checkout comes from the clone line above.
- [ ] **Step 2: Verify** `node test-all.mjs --only docs` and any suite that greps `docs/SETUP.md` (`grep -l SETUP.md tests/*.test.mjs`).
- [ ] **Step 3: Row and commit** `docs(setup): point the clone and PR lines at this fork`.

### Task 5: Crawler contact URL

**Files:**
- Modify: `user-agent.mjs:13`
- Modify: deviations table (one row)

- [ ] **Step 1: Edit** the `+https://…` part to `https://github.com/jrmatherly/career-ops`; keep `career-ops/1.0`.
- [ ] **Step 2: Verify** `node test-all.mjs --only user-agent` (and `grep -rn "career-ops-hq" tests/ | grep -i agent` for any pin).
- [ ] **Step 3: Row and commit** `fix(scan): name this fork in the crawler contact URL`.

### Task 6: Record the KEEP decisions

**Files:**
- Modify: `.claude/skills/upstream-review/SKILL.md` ("Deviations decided", one row each for findings 7, 8 and 11 with Notes opening KEEP and the reason from the table)

- [ ] **Step 1: Add the rows.** Finding 11's row names the compare endpoint the skill depends on.
- [ ] **Step 2: Run** `node test-all.mjs --only fork-deviations` (the deviations-coverage test) and `node validate-system-paths-coverage.mjs`.
- [ ] **Step 3: Commit** `docs(upstream-review): record the ties we keep and why`.

### Task 7: PR

- [ ] One PR for Tasks 1-6 (they are small and share the deviations table). Pre-push checks from Global Constraints.
- [ ] `gh pr create --base main`; body lists the findings table's verdicts in one line each and the Task 1 outputs; no personal data added; `node test-all.mjs` passed.
- [ ] `/pr-review-toolkit:review-pr`, then raise `gh pr merge <n> --merge --delete-branch` for the operator.
