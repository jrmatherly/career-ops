# Build coordinator handoff (units R1, A2, A3), 2026-11-08

Written by the "Scan-automation build coordinator" session on the operator's stop order (14:54 EST, their words: "once PR39 lands, i want all sessions to stop, we will focus our attention to cleaning up so that we can archive all open sessions -- the rest of the work will be done under new/fresh sessions"). Final at 15:00 EST on the operator's order (14:59 EST, their words: "Stop all background tasks running in our latest session agents").

## Store
Sub-store: `docs/superpowers/research/2026-11-08-scan-automation-and-platform/orchestrate/build/` in worktree `claude/busy-shannon-d44979` (the landing coordinator commits it). Files: `units.tsv`, `ledger.tsv` (header only, no verdicts yet), `decisions.tsv` (this session's trail), `orders-local.md`, `briefs/R1.md`, `briefs/A2.md`, this handoff. Main-store files were never written by this session.

## Operator orders that bind the next session
- Order 26 (14:25 EST): one PR active in landing at a time; the operator merges every PR.
- Order 27 (14:51 EST, "I want to reduce the number of PR's we are creating, so if we are able to streamline/combine R1, A2 and A3 under a single/combined branch and PR, that would be preferred"): R1, A2 and A3 share branch `claude/r1-rank-pass` and ONE PR, opened only at A3 code-ready. Owner order R1 -> A2 -> A3, one owner on the branch at a time, per-unit Conventional Commits. The A3 owner does merge-main (merge origin/main as a merge commit, keep both sides of the SKILL.md deviations table, prove nothing else differs) and opens the PR. Then ONE verification over the whole branch (verifier on opus, pr-review-toolkit code-reviewer and silent-failure-hunter on opus, pr-test-analyzer and comment-analyzer on sonnet, a live lane for the A3 UI), one fix-forward to a fresh owner, then merge-ready to whoever owns the main ledger.
- Gate `A2-auto-mode-secret-surface` (main `gates.md`): open, default A (pod-only auto mode, Mac needs CAREER_OPS_AUTO_EVALUATE_LOCAL=1, A1's deny list gains ~/.ssh/**, ~/.aws/**, ~/.config/gh/**, ~/.gnupg/**, .env*). Take A unless the operator answers otherwise; never edit gates.md from the build side.

## Unit state
- R1: owner stopped mid-build at 15:00 EST (TaskStop, 28 minutes in); WIP pushed by the orchestrator session on `claude/r1-rank-pass`. At the stop, worktree `.claude/worktrees/agent-a426338030134c584` was on `claude/r1-rank-pass` at base 6fb1403b with NO commit and uncommitted edits to: `.claude/skills/upstream-review/SKILL.md`, `docs/SCRIPTS.md`, `rank-pipeline.mjs`, `tests/cli-flag-validation.test.mjs`, `tests/rank-pipeline-urls-file.test.mjs` (new), `web/scripts/scheduled-jobs-runner.mjs`, `web/src/lib/core/evaluate-candidates.mjs` (new), `web/src/lib/scheduled-job-input.mjs`, `web/src/lib/scheduled-jobs.ts`, `web/tests/lib/evaluate-candidates.test.mjs` (new), `web/tests/lib/scheduled-jobs-runner.test.mjs`. No report was received, so nothing in it is verified; no gate (check-syntax, test-all, typecheck) is known to have run. A fresh R1 owner starts from that WIP commit with `briefs/R1.md`, treats every edit as unverified, and finishes to code-ready; it inherits none of the stopped agent's reasoning, so it re-reads the brief's premises. The live-ui "You see" proof and the owner trail `owners/R1.tsv` were not done.
- A2: not started. Brief at `briefs/A2.md`, premise-checked at main aafbfddb and PR 39 head a1e4df6b. Its "FILL AT DISPATCH" block needs R1's report: branch tip SHA, rankPass signature, recordStepCounts shape, the evaluate field shape, and any premise R1 found false. One plan premise is false and the brief says so: the run route has no `gated` terminal event (the honesty gate sends `error`), so the drain needs a route field or a message match.
- A3: not started, no brief. Author it from the plan's PR-A3 section with `briefs/A2.md` as the template once A2 is code-ready; its premises (Scheduled scans components, run-history-drawer, scheduled-job-body.mjs, runCoreCli) must be measured at A2's tip. A3 is review-gated (operator reviews screenshots and a video before merge).

## Before dispatching A2, a fresh session must
1. Confirm PR 39 (A1) is MERGED and read its merge commit; A2 edits `web/tests/lib/run-route-kinds.test.mjs`, which exists only from PR 39.
2. Merge origin/main into `claude/r1-rank-pass` (keep both SKILL.md table sides) so A2 starts from a tip that contains A1; or brief the A2 owner to do it first and prove nothing else differs.
3. Fill the A2 brief's FILL AT DISPATCH block from R1's code-ready report (receipts/R1/ if present, else the branch itself).
4. Re-read main `preferences.md` (orders 1 to 27) and paste it verbatim into the brief; the copy in `briefs/A2.md` was pasted at 14:55 EST.
5. Spawn with `subagent_type: jstack:j-agent`, `model: opus`, `isolation: worktree`, named `a2-owner`, pointing at the brief by absolute path.

## Known traps
- Briefs that state a fact about callers or the CLI must be measured before dispatch; the R1 brief's premises were read from PR 35's head, the A2 brief's from PR 39's head.
- Agents in isolated worktrees return receipts as text; the coordinator writes them.
- An in-session `claude` probe inherits this app's host-auth env; measure under `env -i`.
- Judge root suites by `node test-all.mjs --quick --only <suite>` or the failure marker, never bare exit codes.
