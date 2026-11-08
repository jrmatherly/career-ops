# Landing handoff, 2026-11-08 18:10 EST (supersedes the 15:45 landing handoff)

Written by the A1-landing pickup session after landing PR 41 (program store) and PR 42 (R1 rank pass). No subagent of this session is running. Main checkout is on `main` at `5505a546`, clean. A fresh session resumes with `/jstack:j-mode`, Session pickup, then this file and `.remember/remember.md`.

## State
- Every scan-automation build unit is merged: P1 (37), K1 (38), F1 (35), R2 (40), A1 (39, `cedf9543`), R1 (42, `5505a546`). PR 41 (`08ac3688`) moved the program store onto main, where the project rule says research lives.
- The store is `<repo>/docs/superpowers/research/2026-11-08-scan-automation-and-platform/orchestrate/` on main: `units.tsv` (R1 merged 5505a546), `ledger.tsv` (R1 rounds 1 and 2), `gates.md`, `preferences.md` (28 orders), `briefs/`, `receipts/R1-r1/` and `receipts/R1-r2/` (seven and seven files, incl. owner reports and live lanes), `build/briefs/` (R1.md, R1-resume.md, A2.md). Trail: `decisions.tsv` beside it. This handoff is also copied under `orchestrate/receipts/handoff/`.
- Cleanup is done: no `claude/*` branch on origin; worktrees are the main checkout and the session worktree `distracted-ptolemy-303da4` (detached at 6983ec4f, clean, an archived session's); local branches `f1-merge-main` and `claude/scan-build-coordinator-f35d72` remain (older, outside this work; `git log --oneline main..<branch>` says what they hold before deleting).

## What R1 shipped (PR 42, 30 files)
`--urls-file` on `rank-pipeline.mjs`; `candidatesFor` in `web/src/lib/core/evaluate-candidates.mjs`; the `evaluate` job field with `enabledAt`; `rankPass`, `rankJob`, `rankFailureMessage`, `recordStepCounts` and an exported `main(args, { root, spawnFn })` in `web/scripts/scheduled-jobs-runner.mjs`; tests; docs rows. Two review rounds (verifier, live lanes, four toolkit reviewers each) plus one fix round and two coordinator commits closed: since/first_seen on the host clock (the plan's Data shapes said job.timezone and were amended), partial-failure messages with stdout and stderr forwarded under a job-id prefix, rank-specific failure wording with the ranker's basename, the pass in a `finally` so a failed scan does not skip other jobs, the `--job` guard pinned, U+0085 refused on every `POSTING_INPUT` branch, README and SKILL.md rows. The A1 round-4 follow-ups rode along (local: regex, "every 400" overclaim).

## Parked follow-ups (none a safety hole; from receipts/R1-r2/)
1. `describeCliFailure` in `rank-pipeline.mjs` slices a cause at 200 chars mid-word with no ellipsis, so the runner's 290-char word-boundary cut is unreachable through the CLI path (live lane C).
2. `evalMessage` can still carry non-ranker paths (the `--urls-file` cannot-read line, spawnSync text, module paths); same standard as `scanFailureMessage` today (code review 40).
3. With more than 50 waiting rows the RANK_WAITING message occupies `evalMessage`, so a partial failure in that pass is unnamed until the backlog drops (code 30, errors C).
4. `enabledAt` is stamped on the web server's clock and `since`/`first_seen` on the runner's and scanners'; different TZ settings between them would bring the day mismatch back on the enable day (errors D; one host by design).
5. RANK_LOCK staleMs vs several due jobs; `ranked` counting rows another job ranked the same day; over-50 overflow re-sending rows a ranker left unscored; a job saved before R1 keeps a job-timezone `enabledAt` until its next off-to-on transition.
6. From A1: gate `A1-deny-gate-linux-v2` (default C: prove the direct and recursive-Grep denies in the pod once its image carries A1, now on main) and gate `A2-auto-mode-secret-surface` (default A). The push-time security review flags the evaluate-text deny list as incomplete; that is this gate, not a new finding.

## Next
1. Units A2 (queue and drain auto-mode candidates) and A3 (Scheduled scans UI for evaluate settings and outcomes): not started. Order 27 wanted them with R1 in one PR; the operator's close-out (15:47 EST) landed R1 alone, so A2 and A3 are now their own PR or PRs, operator's call. `build/briefs/A2.md` exists with a FILL AT DISPATCH block that needs R1's shipped shapes (now on main: `rankPass(root, storePath, { spawnFn })`, `recordStepCounts(storePath, runId, { ranked, evalMessage })`, `evaluate: { mode, rankThreshold, maxPerRun, enabledAt }`, `JobRun.ranked` and `evalMessage`). A3 has no brief; author it from the plan's PR-A3 section with A2.md as the template. Re-measure every premise at main `5505a546`. A2 edits `web/tests/lib/run-route-kinds.test.mjs` (exists since PR 39). Take gate defaults unless the operator answers.
2. Older items unchanged: lane-6 CV re-run for report 059 on the pod (image from 66bb4d54 carries the PR 34 fix), convergence close-out (plan and spec to `completed/`, retire `~/dev/job-search/tools/*.py`), pod probe-file deletion, upstream PR candidates from PR 36.

## Leftovers with their check
- `git log --oneline main..f1-merge-main` and `git log --oneline main..claude/scan-build-coordinator-f35d72`: delete with `-D` only if the commits are already on main in another form.
- SessionStart warns `core.hooksPath` is the absolute `.githooks` path and the fork's guard is "not active"; `git config core.hooksPath` vs the SessionStart hook in `.claude/hooks/` shows which form it wants.
- The store docs commit recording the R1 merge was pushed to main directly (no PR was in flight; docs only), gated by check-syntax and `node test-all.mjs --quick`.

## Traps that held today
- The auto-mode classifier refuses a compound destructive git line; plain `git worktree remove` on clean unlocked worktrees (unlock stale locks first with `git worktree unlock`), `git branch -d`, and `git push origin --delete` pass one at a time.
- zsh: `$VAR:r` and `$VAR:w` are modifiers, so `git show "${B}:path"` needs the braces; `echo ======` runs a command named `=====`.
- test-all section 7 refuses a macOS home-directory prefix (the path form this handoff spells as `~`) in tracked Markdown; store briefs use `<repo>`, `<jstack>`, `~`.
- Orders 21 and 22 held: one writer per branch (stand the owner down before anyone else pushes), isolated agents return receipt text and the coordinator writes it. Owners spawn on opus, lanes and toolkit reviewers on opus or sonnet, never Fable. Load flakes seen three times today (cli-flag-validation, batch section 13, split-root), each green alone or on re-run.
