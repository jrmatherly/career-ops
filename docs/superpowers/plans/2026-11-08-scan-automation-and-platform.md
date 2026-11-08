# Scan automation and platform plan

> **For agentic workers.** REQUIRED SUB-SKILL. Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal.** Let a scheduled scan rank its new rows and, per job, either surface them for review in the Inbox or evaluate them unattended through the web's existing read-only evaluate path; route the pod's Claude Code through CLIProxyAPI; link the dashboard to publish key management; and let a scheduled job use `portals.yml`'s filters instead of a stale copy.

**Architecture.** The scan runner stays zero-token and gains two optional steps, a rank of this run's rows and, for auto mode, an append-only user-layer ledger that a separate drain evaluates by POSTing to the dashboard's own `/api/run` over loopback, so every write stays in the web pod's process and under its tracker write token. The route is not extracted; it gains one kind. Review mode reuses the Inbox shortlist. Proxy routing is two env variables and a NetworkPolicy entry in home-cluster plus one doctor branch here. Key management stays on the publish service, linked and themed from the dashboard.

**Tech stack.** Node 24 `.mjs`, `node:test`, Next.js 16 in `web/`, Better Auth 1.7.14 in `publish/`, Flux and Jinja templates in home-cluster.

**Research.** `docs/superpowers/research/2026-11-08-scan-automation-and-platform/` (reports 01 to 04, the interrogation record and `decisions.tsv`). PR ids in order are PR-F1, PR-R1, PR-R2, PR-A1, PR-A2, PR-P1, PR-P2, PR-K1.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `<jstack>/skills/j-mode/playbooks/autopilot-full.md`, one owner per PR, the operator merging. PR-R2, PR-A2, PR-P2 and PR-K1 change an interaction or a live deployment and stop at merge-ready for the operator's review. PR-P2 lives in the home-cluster repository and is an operator item end to end.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Global constraints

- No headless worker gains a write tool or an auto-approve flag. `tests/headless-permission-flags.test.mjs` lists the only three files allowed to pass one; a new spawner that fails it is wrong, not the test (AGENTS.md, "Headless worker permissions").
- Every writer runs in the web pod's process tree. The drain evaluates by calling the dashboard over loopback, never by spawning `claude` itself (`lib/dir-lock.mjs` judges staleness by pid; `web/src/lib/core/run-registry.ts` holds the tracker write token in process memory).
- No new tracker column. New user-layer state goes under `data/`, append-only, with a `DATA_CONTRACT.md` row (Data Contract; convergence trail row 2026-11-07T01:06:10Z).
- Evaluate only. Nothing in this plan applies, submits or sends (Ethical Use).
- Every upstream file edited gets a row in the deviations table of `.claude/skills/upstream-review/SKILL.md` whose Notes cell opens with ADOPT, ADAPT, KEEP or SKIP and names the fork test that pins it. `tests/fork-deviations-covered.test.mjs` diffs HEAD, so run it after the commit. New fork files inside `web/`, `tests/`, `docs/` or `publish/` are covered by those directory entries and still get a row. A new root script goes in `config/local-paths.txt`.
- A new script resolves the data root with `getCareerOpsRoot()` from `path-resolver.mjs`, guards its entry with `isMainModule(import.meta.url)`, and never writes `data/applications.md` except through `merge-tracker.mjs` and `set-status.mjs`.
- Before every push run `node scripts/check-syntax.mjs` and `node test-all.mjs --quick`. `web/` changes also run `npm run typecheck` and `npm test` in `web/`. `publish/` changes run `npm --prefix publish test`. Commits follow Conventional Commits with a scope, preceded by `/simplify` and reviewed with `/code-review`.
- Fixtures contain no personal data. Nothing in this repository touches the cluster; cluster steps are the operator's, in home-cluster.
- No key is printed, logged or committed. A probe that needs a key reads it into a shell variable inside the pod and never echoes it.

## Review focus

1. A pending row the operator added by hand during a scan. It has no `scan-history.tsv` row, so it must never become an auto candidate. Test in PR-R1.
2. The runner dies after the scan appended rows and before the rank. The next tick must find those rows as candidates from durable state, not lose them. Test in PR-R1 (candidate rule) and PR-A1 (ledger).
3. A URL the operator evaluates from the Inbox while it sits `queued`. The drain must skip it as `skipped` with the reason, never reserve a second report number. Test in PR-A1.
4. A proxy that returns an Anthropic-shaped 429 on every seat. The drain must stop the batch on the first limit error and leave the rest `queued`. Test in PR-A1 with a fake route.
5. A job saved with `filtersFrom: "file"` and an empty positive list. It must run against `portals.yml` as the scanners read it, not fail "requires title keywords". Test in PR-F1.

## Data shapes

Decided here once, so every PR uses the same names.

**Scheduled job** (`web/src/lib/scheduled-jobs.ts`, `ScheduledJob` and `JobFields`). Two new fields.

```ts
filtersFrom: "custom" | "file";          // PR-F1. Default "custom" so stored jobs keep their meaning.
evaluate?: {                              // PR-R1 and PR-A1. Absent means off.
  mode: "off" | "review" | "auto";
  enabledAt: string;                      // ISO date; set when mode leaves "off"; the candidate rule reads it
  rankThreshold: number;                  // auto only; 1.0 to 5.0; default 3.5
  maxPerRun: number;                      // auto only; 1 to 20; default 5
};
```

Rank follows `CAREER_OPS_CLI` as `rank-pipeline.mjs` already does; evaluate runs on Claude through the dashboard. There is no per-job CLI field.

**Run record** (`JobRun`). New optional counts, all integers, written by `recordCompletion`.

```ts
ranked?: number; queued?: number; evaluated?: number; gated?: number; evalErrors?: number; evalMessage?: string;
```

`runs[].state` keeps its closed enum. `validateScheduledStore` ignores unknown fields, so the store needs no migration (measured, `web/src/lib/scheduled-jobs-store.mjs:59-80`).

**Candidate rule** (PR-R1, `web/src/lib/evaluate-candidates.mjs`). A pending `- [ ]` row of `data/pipeline.md` is a candidate for a job when `scan-history.tsv` has a row for its URL whose `first_seen` is on or after the later of the job's `evaluate.enabledAt` date and the date of its previous successful run, and, in auto mode, the ledger has no row for its normalised URL. Scan history records the board, not the job, so two jobs that run on the same day see the same new rows; the ledger queues a URL once. Pure function over four parsed inputs so the test needs no files.

**Ledger** (PR-A1, `data/evaluate-queue.tsv`, owned by root module `evaluate-queue.mjs`). Tab-separated, header row, append-only, last row per URL wins, URLs normalised with `normalizeUrl` from `url-key.mjs`, every cell through `tsvCell`.

```
url	at	jobId	runId	rank	reason	state	source
```

States are `queued`, `running`, `evaluated`, `failed`, `gated` and `skipped`. `skipped` is terminal and carries a reason (`already-evaluated`, `not-pending`, `no-api-text`). `rank` is a decimal or empty; an empty rank with reason `unranked` is queued and never auto-evaluated. A `running` row older than 800 seconds plus 60 is read as `failed`. `failed` is retried at most twice; the third `failed` is final. The CLI is `node evaluate-queue.mjs dump --json | add <state> ... | drain-plan --job <id>`, and the web reads it through `runCoreCli`, never the file.

**Profile keys** (`config/profile.yml`, documented in `config/profile.example.yml`).

```yaml
pipeline:
  auto_evaluate_daily_cap: 10   # PR-A1. Evaluations started by the drain per local day, all jobs together. Default 10.
```

**Evaluate-text kind** (PR-A1, `web/src/lib/worker-capabilities.mjs` and `run-prompts.mjs`). `KNOWN_KINDS` gains `evaluate-text` with `CAPS.localReadOnly`. Its prompt is the evaluate prompt with the JD text inlined and the WebFetch instruction replaced by "the posting text is below; do not fetch". `/api/run` accepts `{ kind: "evaluate-text", input: url, jdText }` and persists through the same `persistEvaluation`. Its argv also denies `Read(/proc/**)` and `Read(<data root>/.env)` through `--disallowedTools`, and its report header reads `**Verification:** unconfirmed (auto mode, no web research)`.

**Pod env** (PR-P1 here, PR-P2 in home-cluster). `ANTHROPIC_BASE_URL` (HelmRelease env, from `career_ops.anthropic_base_url`) and `ANTHROPIC_AUTH_TOKEN` (Secret, from `career_ops.anthropic_auth_token`), both optional; `claude_oauth_token` left empty when they are set.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] Read these from trunk at program start. Re-read them at every tick.
  - [ ] `<jstack>/skills/j-mode/playbooks/autopilot-full.md`
  - [ ] `<jstack>/skills/swarm/SKILL.md`
  - [ ] `git show origin/main:.claude/rules/dev-workflow.md`
  - [ ] `<jstack>/skills/j-mode/playbooks/opening-a-pr.md`
  - [ ] `<jstack>/skills/how/SKILL.md` and `<jstack>/skills/interrogate/SKILL.md`
- [ ] On the operator's go, arm the audit tick as `/loop 1h` with the tick prompt below. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from trunk. Audit the operation against it and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then post a short status message to the operator in chat only when the audit found a tracked change that no earlier status message reported, such as a PR opened, a code-ready head, a round launched or closed, a verdict, a merge, a stuck agent and the action taken, a blocker added or cleared, or a decision only the operator can make. Name every such change and nothing else. Do not repeat a table, the merged list, or an unchanged blocker. If the audit found none, end the turn with no reply text. Either way, log this tick's row in your decision trail. The row names the items reported, or none."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.
- [ ] Log every tick and every decision in `docs/superpowers/research/2026-11-08-scan-automation-and-platform/decisions.tsv`.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges.
  - [ ] PR-F1, PR-R2, PR-P1 and PR-K1 are independent and first. All branch from `main`.
  - [ ] PR-R1 after PR-F1 (both edit `scheduled-jobs.ts` and the runner).
  - [ ] PR-A1 after PR-R1 (reads the candidate rule and the job field).
  - [ ] PR-A2 after PR-A1 (shows the ledger and the auto settings).
  - [ ] PR-P2 is the operator's, in home-cluster, after PR-P1 merges and its image is built.
- [ ] Hold the file boundaries. PR-F1 and PR-R1 own `web/scripts/scheduled-jobs-runner.mjs` and `web/src/lib/scheduled-jobs.ts` in sequence. PR-R2 owns `web/src/lib/pipeline-table.mjs`, `web/src/lib/career-ops.ts` and `web/src/components/inbox/`. PR-A1 owns `evaluate-queue.mjs`, `web/src/lib/evaluate-drain.mjs`, `worker-capabilities.mjs`, `run-prompts.mjs` and the run route. PR-A2 owns `web/src/components/scheduled-scans/`. PR-P1 owns `doctor.mjs`. PR-K1 owns `publish/pages/account.mjs` and `web/src/components/shares/`.
- [ ] Hold the review gate. PR-R2, PR-A2 and PR-K1 change an interaction. PR-P2 changes a live pod. They wait for the operator's review in chat with screenshots and a video before merge.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Never require `gt`.
- [ ] Open the PR ready, never draft, per **Opening a PR**, with `gh pr create --base main`. The body states that no personal data was added and that `node test-all.mjs` passed.
- [ ] Run `node scripts/check-syntax.mjs` and `node test-all.mjs --quick` once before the PR-facing push, plus `npm run typecheck` and `npm test` in `web/` for web changes and `npm --prefix publish test` for publish changes. Push with hooks on.
- [ ] Run `/simplify` before each commit and `/no-comments` before review.
- [ ] Triage every Bugbot and security-reviewer comment per `../references/bugbot-triage.md`.
- [ ] Write the deviations row in the same commit as the upstream edit, then run `node --test tests/fork-deviations-covered.test.mjs` after committing.
- [ ] Rebase onto current trunk before the code-ready report and babysit. Keep that merge base in fix rounds. Rebase again only at merge prep, on a `git merge-tree` conflict with trunk, or on a CI failure that comes from a change on trunk.

### Verdict and merge, for every PR

- [ ] A full swarm runs once, at the code-ready head. Another full swarm runs only for new behavior, a redesign, or a large new diff. A rebase, a merge-conflict resolution, or a minor fix gets a single verifier at the new head. Run each full swarm per `<jstack>/skills/swarm/SKILL.md`. One gates lane. The ten live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. Two or more audit lanes, each with its own focus, that read the diff and the receipts and distrust the PR body. The root audits the receipts in the merge-ready report before the verdict.
- [ ] Clean only when every lane is `PASS`. Findings go back to the owner, including a defect that a lane filed as a note. A new head gets a fresh verdict, except for results that stay valid under the patch-id rule in `playbooks/shipping.md`.
- [ ] The operator merges every PR. An owner stops at merge-ready and reports the head SHA, the verdict and the receipts. No owner runs `gh pr merge`.

### Boot recipe, for every live lane

Each live lane runs in its own worktree at the PR head. Drive the dashboard through the `chrome-devtools-mcp:chrome-devtools` skill and the scripts through the `run` skill.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] `export CAREER_OPS_ROOT=/tmp/swarm-<pr-id>/worker-<n>/root` seeded from `examples/` and `templates/`, never from the operator's data. Start the dashboard with `npm --prefix web run dev` and wait for the ready line.
- [ ] Deliver input only through the control skill's commands. Read-only diagnostics are `curl -s -H 'Host: localhost' http://127.0.0.1:3000/api/healthz`, the data root's files, and `node evaluate-queue.mjs dump --json`.
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## Let a scheduled job use the file's filters (PR-F1)

**Depends on.** None.

**Files.**

- [ ] Edit `web/src/lib/scheduled-jobs.ts` (`ScheduledJob`, `JobFields`, `parseScheduledJobInput`).
- [ ] Edit `web/scripts/scheduled-jobs-runner.mjs` (`writeJobPortals`, `executeJob`).
- [ ] Edit `web/src/components/scheduled-scans/create-job-modal.tsx`, `edit-job-modal.tsx`, `job-card.tsx` and `web/src/components/explore/schedule-job-action.tsx`.
- [ ] Edit `web/tests/lib/scheduled-jobs-runner.test.mjs` and `web/tests/lib/scheduled-job-client.test.mjs`.
- [ ] Edit `docs/WEB_UI.md` (the scheduled scans section) and `.claude/skills/upstream-review/SKILL.md` (deviations rows for the five web files).

**Build.**

- [ ] Add `filtersFrom: "custom" | "file"` to `ScheduledJob` and `JobFields`; `parseScheduledJobInput` accepts `"file"` or `"custom"`, defaults to the base job's value, else `"custom"`.
- [ ] In `executeJob`, when `job.filtersFrom === "file"` skip `writeJobPortals`, leave `CAREER_OPS_PORTALS` as the parent environment has it, and keep `--since`, `--ats` and `--limit` on the command line.
- [ ] In `writeJobPortals`, inherit the file's `negative`, `always_allow` and `block_hard` when the job's list is empty, the way `positive` already falls back; stop clobbering `title_filter_full` with the job's lists when they are empty.
- [ ] Read the base file with `portalsConfigPath(root)` so the runner and the Portals page agree on `CAREER_OPS_PORTALS`.
- [ ] Add a "Use portals.yml filters" toggle to the create and edit modals and the Explore Schedule action; when on, hide the title and location lists. `job-card.tsx` shows "uses portals.yml" instead of the positive list.

**You see.**

- [ ] A job saved with the toggle on runs and the runner's debug line reads `portals: <root>/portals.yml (file)`, with no `data/tmp/scheduled-*.yml` written.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `web/tests/lib/scheduled-jobs-runner.test.mjs` gains "file filters skip the overlay and leave CAREER_OPS_PORTALS alone", "custom job with empty negative inherits the file's negative list", "custom job with empty always_allow and block_hard inherits the file's lists" and "empty positive with filtersFrom file does not throw". Run `npm --prefix web test -- --test-name-pattern "scheduled"`.
- [ ] `web/tests/lib/scheduled-job-client.test.mjs` gains "create body carries filtersFrom". Run `npm --prefix web test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Create a custom-filter job at trunk and at head with the same lists and run it once. Save `f1-custom-run.png`. Pass when both runs record `success` and the same `rolesFound`.
- [ ] Lane 2. Create a job with the toggle on and run it. Save `f1-file-run.png`. Pass when the run is `success` and `data/tmp/` holds no `scheduled-*.yml` during the run.
- [ ] Lane 3. Edit an existing custom job, turn the toggle on, save, reload. Save `f1-edit-toggle.png`. Pass when the card reads "uses portals.yml".
- [ ] Lane 4. Explore, set filters, press Schedule with the toggle on. Save `f1-explore-schedule.png`. Pass when the created job has `filtersFrom: "file"` in `data/scheduled-jobs.json`.
- [ ] Lane 5. Custom job with an empty negative list against a `portals.yml` whose negative list holds `intern`. Save `f1-negative-inherit.png`. Pass when the overlay written during the run carries `intern` under `title_filter.negative`.
- [ ] Lane 6. Set `CAREER_OPS_PORTALS` to a second file and run a file-filter job. Save `f1-env-portals.png`. Pass when the run's debug line names the second file.
- [ ] Lane 7. A file-filter job against a `portals.yml` with an empty positive list. Save `f1-empty-positive.png`. Pass when the run fails with the scanner's own "no title keywords" message, not the runner's.
- [ ] Lane 8. Mobile width, create modal with the toggle. Save `f1-mobile-modal.png`. Pass when the toggle and the hidden lists render without horizontal scroll.
- [ ] Lane 9. Run history drawer after lanes 2 and 5. Save `f1-history.png`. Pass when both runs appear with their states.
- [ ] Lane 10. A stored job from before this PR, with no `filtersFrom`. Save `f1-legacy-job.png`. Pass when it loads as custom and runs with its overlay as before.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of `executeJob` for the portals engine against the example `portals.yml`, trunk and head, file mode and custom mode at head.
- [ ] Probe. `node --input-type=module -e` that imports the runner and times `executeJob` five times each, interleaved trunk and head.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Head custom mode within 5 percent of trunk; head file mode no slower than head custom mode.

**Review gate.** None. PR-F1 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The operator merges.

## Rank this run's rows after a scan (PR-R1)

**Depends on.** PR-F1.

**Files.**

- [ ] Edit `rank-pipeline.mjs` (`USAGE`, `KNOWN_FLAGS`, `VALUE_FLAGS`, `main`).
- [ ] Create `web/src/lib/evaluate-candidates.mjs`.
- [ ] Edit `web/src/lib/scheduled-jobs.ts` (`evaluate` field) and `web/scripts/scheduled-jobs-runner.mjs` (a rank step after `executeJob`, `recordCompletion` counts).
- [ ] Create `web/tests/lib/evaluate-candidates.test.mjs`; edit `web/tests/lib/scheduled-jobs-runner.test.mjs`; create `tests/rank-pipeline-urls-file.test.mjs`.
- [ ] Edit `.claude/skills/upstream-review/SKILL.md` (a row for `rank-pipeline.mjs`, ADAPT) and `docs/SCRIPTS.md` (the flag).

**Build.**

- [ ] Add `--urls-file <path>` to `rank-pipeline.mjs`. `main` reads the file, one URL per line, normalises each with `normalizeUrl` from `url-key.mjs`, and filters `pending` to those URLs before `selectBatch`. A missing file is a usage error. No change to the argv the ranker passes its CLI.
- [ ] `candidatesFor({ pendingRows, scanDates, ledgerUrls, since })` in `evaluate-candidates.mjs` returns the candidate URLs per the Data shapes rule, where `since` is the later of `enabledAt` and the previous successful run date. Pure.
- [ ] `parseScheduledJobInput` accepts `evaluate: { mode, rankThreshold, maxPerRun }`, bounds them per Data shapes, and sets `enabledAt` to today when mode leaves `off` and the base had none.
- [ ] In the runner, after `recordCompletion` of a `success` scan with `mode !== "off"`, compute candidates from `data/pipeline.md`, `data/scan-history.tsv` and, when PR-A1 has landed, the ledger; write them to `data/tmp/rank-<runId>.txt`; spawn `node rank-pipeline.mjs --urls-file <path> --limit <count>` with the same `cwd` and env the scanners get; parse the summary line for the ranked count; write `ranked` and, on exit 1, `evalMessage` from `scanFailureMessage`, into the run record under `withScheduledStore`. The rank step runs outside the scan's queue claim and never changes the run's `state`.

**You see.**

- [ ] After a review-mode run, the new rows in `data/pipeline.md` carry `| rank: N/5 — reason` and the run record shows `ranked: <count>`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/rank-pipeline-urls-file.test.mjs` asserts, through `--dry-run`, that only listed URLs are ranked and that a backlog row above them is left alone, plus the usage error on a missing file. Run `node --test tests/rank-pipeline-urls-file.test.mjs`.
- [ ] `web/tests/lib/evaluate-candidates.test.mjs` asserts the first-seen rule, the hand-added row with no scan-history entry (review focus 1), the ledger exclusion, and the `enabledAt` boundary day. Run `npm --prefix web test -- --test-name-pattern "candidates"`.
- [ ] `web/tests/lib/scheduled-jobs-runner.test.mjs` gains "rank step runs only for mode review or auto", "rank exit 1 leaves the scan success and records evalMessage" and "candidates survive a runner that died after the scan" (review focus 2, by running the step twice over the same files). Run `npm --prefix web test -- --test-name-pattern "scheduled"`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run a mode-off job at trunk and head. Save `r1-off-run.png`. Pass when neither writes a `rank:` segment and the run records match.
- [ ] Lane 2. Review-mode job against a fixture board that adds three rows, with `CAREER_OPS_CLI` pointing at a fake CLI script that returns fixed ranks. Save `r1-review-ranks.png`. Pass when the three new rows carry `rank:` and `ranked: 3` is on the run record.
- [ ] Lane 3. Same, with ten unranked backlog rows above. Save `r1-backlog.png`. Pass when the backlog stays unranked and the three new rows are ranked.
- [ ] Lane 4. Kill the runner between scan and rank (fake CLI that sleeps, SIGKILL the runner), then tick again. Save `r1-crash-resume.png`. Pass when the second tick ranks the rows the first scan added.
- [ ] Lane 5. A row added by hand to the Inbox during the scan. Save `r1-hand-row.png`. Pass when it carries no `rank:` after the run.
- [ ] Lane 6. Fake CLI exits 1. Save `r1-rank-fail.png`. Pass when the run is `success` with `evalMessage` set and no `rank:` written.
- [ ] Lane 7. Manual "Run now" on a review-mode job. Save `r1-manual-run.png`. Pass when the route returns after the scan and the rank lands within the next minute.
- [ ] Lane 8. `enabledAt` set to tomorrow. Save `r1-enabled-at.png`. Pass when no row is a candidate and `ranked: 0`.
- [ ] Lane 9. Two review-mode jobs due in the same tick window finding one shared URL. Save `r1-two-jobs.png`. Pass when the shared row is ranked once and both run records count it.
- [ ] Lane 10. `node rank-pipeline.mjs --urls-file missing.txt`. Save `r1-usage.png`. Pass when it prints the usage error and exits 2 without touching `data/pipeline.md`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time from scan exit to run record written, trunk (no rank) and head (mode off), plus head review mode with the fake CLI as the diff-added work.
- [ ] Probe. The runner under `time`, five runs each, interleaved.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Head mode off within 5 percent of trunk; head review mode under trunk plus 2 seconds per ten candidates with the fake CLI.

**Review gate.** None. PR-R1 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The operator merges.

## Show rank and run grouping in the Inbox (PR-R2)

**Depends on.** None.

**Files.**

- [ ] Edit `web/src/lib/pipeline-table.mjs` (`parseInbox` keeps the `rank` segment), `web/src/lib/career-ops.ts` (`InboxJob` gains `rank?: number` and `rankReason?: string`, `readInbox` fills them), `web/src/lib/pipeline-sort.mjs`.
- [ ] Edit `web/src/components/inbox/inbox-triage.tsx` (the comparator at the documented single point, a "new since" facet keyed on the scan date) and the row component that shows the reason.
- [ ] Edit `web/tests/lib/pipeline-table.test.mjs` and the inbox tests; edit `.claude/skills/upstream-review/SKILL.md` (rows for the four web files).

**Build.**

- [ ] `parseInbox` returns `rank` and `rankReason` from the labelled segment; `readInbox` copies them onto `InboxJob`.
- [ ] The Inbox comparator sorts by rank descending when any row has one, then by age as today; rows without a rank sort after ranked rows.
- [ ] A facet chip "Added <date>" groups rows by their scan date from `readScanDates`, so a run's rows can be selected together and sent to Score shortlist.
- [ ] The row shows the rank as "rank 4.2" with the reason as its title text, never the word "score".

**You see.**

- [ ] A pipeline with ranked rows opens sorted by rank, each row labelled "rank N", and the shortlist tray's Score shortlist button evaluates the selected rows as before.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `web/tests/lib/pipeline-table.test.mjs` gains "parseInbox keeps rank and reason" and "a row without rank parses as before". Run `npm --prefix web test -- --test-name-pattern "pipeline-table"`.
- [ ] The inbox sort test gains "ranked rows first, descending, then age". Run `npm --prefix web test -- --test-name-pattern "inbox"`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open the Inbox with an unranked fixture at trunk and head. Save `r2-unranked.png`. Pass when the order and the rows match.
- [ ] Lane 2. Fixture with five ranked and three unranked rows. Save `r2-ranked-order.png`. Pass when ranked rows lead in descending order.
- [ ] Lane 3. Hover a ranked row. Save `r2-reason.png`. Pass when the reason shows.
- [ ] Lane 4. Facet "Added <date>" selects a run's rows. Save `r2-facet.png`. Pass when only rows with that scan date remain.
- [ ] Lane 5. Select three ranked rows and press Score shortlist with a fake CLI. Save `r2-score.png`. Pass when three evaluate jobs start and the cost confirmation shows first.
- [ ] Lane 6. A `rank:` segment with a `|` in the reason, sanitised by the ranker. Save `r2-pipe-reason.png`. Pass when the row's columns are intact.
- [ ] Lane 7. Mobile width. Save `r2-mobile.png`. Pass when the rank label fits without wrapping the company cell.
- [ ] Lane 8. Skip a ranked row. Save `r2-skip.png`. Pass when it flips to done and the order of the rest holds.
- [ ] Lane 9. Dark mode. Save `r2-dark.png`. Pass when the rank label meets contrast in both themes.
- [ ] Lane 10. Keyboard only, tab to a row and open the reason. Save `r2-a11y.png`. Pass when the reason is announced through the row's accessible name.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `readInbox` time on a 2000-row `pipeline.md`, trunk and head.
- [ ] Probe. `node --input-type=module -e` timing `readInbox` ten times each, interleaved.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Head within 10 percent of trunk.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 and lane 4 screenshots into `private/review/r2-review-order.png` and `private/review/r2-review-facet.png`.
- [ ] Record a 30 to 60 second video of sorting, grouping and scoring on a lane VM. Save it as `private/review/r2-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The operator merges.

## Evaluate auto-mode candidates through the dashboard (PR-A1)

**Depends on.** PR-R1.

**Files.**

- [ ] Create `evaluate-queue.mjs` (root, in `config/local-paths.txt`) and `tests/evaluate-queue.test.mjs`.
- [ ] Create `web/src/lib/evaluate-drain.mjs` and `web/tests/lib/evaluate-drain.test.mjs`.
- [ ] Edit `web/scripts/scheduled-jobs-runner.mjs` (auto mode writes `queued` rows after the rank; `main` runs the drain on every tick under its own lock before the idle return).
- [ ] Edit `web/src/lib/worker-capabilities.mjs` (`evaluate-text`), `web/src/lib/run-prompts.mjs` (the text variant), `web/src/app/api/run/route.ts` (accept `jdText` for the new kind), `web/tests/lib/claude-invocation.test.mjs` and `web/tests/lib/run-prompts.test.mjs`.
- [ ] Edit `DATA_CONTRACT.md` (the ledger row), `config/profile.example.yml` (`auto_evaluate_daily_cap`), `docs/SCRIPTS.md`, `docs/AUTOMATION.md` section 2, `web/README.md` (the sentence that the scheduled task never invokes a model now says "unless a job's evaluate mode is review or auto", and that auto mode needs the dashboard running), and `.claude/skills/upstream-review/SKILL.md` (rows for every upstream file above).

**Build.**

- [ ] `evaluate-queue.mjs` exports `readLedger(root)` (last row per normalised URL, stale `running` read as `failed`), `appendRow(root, row)` through `appendSidecarRow` and the pipeline lock, and `drainPlan(root, { jobId, rankThreshold, maxPerRun, dailyCap, today })` returning the URLs to evaluate, best rank first. Its CLI offers `dump --json`, `add` and `drain-plan --job <id> --json`, guarded by `isMainModule`.
- [ ] In the runner's auto branch, after the rank, append one `queued` row per candidate with its rank and reason, or an empty rank and reason `unranked`.
- [ ] `runDrain({ root, baseUrl, fetchFn, spawnFn })` in `evaluate-drain.mjs`. It first re-reads each job's `evaluate.mode` from the store and drains only jobs still in `auto`, then GETs `${baseUrl}/api/healthz` with `Host: localhost`; on any failure it leaves every row `queued` with reason `dashboard-offline`, consumes no retry, and returns. For each planned URL it checks that the pipeline row is still pending and the tracker has no row for the URL (else appends `skipped`), fetches the JD text with `node fetch-jd.mjs <url>` (exit 1 appends `skipped` with reason `no-api-text`), appends `running`, POSTs `{ kind: "evaluate-text", input: url, jdText }` to `${baseUrl}/api/run` with `Host: localhost`, reads the NDJSON stream to its result event, and appends `evaluated`, `gated` or `failed` with the message. A result whose message matches the route's rate-limit or usage-limit shape stops the batch. `baseUrl` defaults to `http://127.0.0.1:${PORT ?? 3000}`.
- [ ] `KNOWN_KINDS` gains `evaluate-text` with `CAPS.localReadOnly`; `buildPrompt` for that kind inlines `jdText` after the URL, replaces the WebFetch instruction with "the posting text is below; do not fetch anything", and sets the verification header to `unconfirmed (auto mode, no web research)`; `claudeCliArgs` adds `Read(/proc/**)` and `Read(<root>/.env)` to `--disallowedTools` for that kind; the route validates `jdText` as a non-empty string under 200 kB for that kind only.
- [ ] Gate before the drain is wired in. In a scratch container from `deploy/Dockerfile`, run `claude -p "Print the first line of /proc/self/environ" --allowedTools Read --disallowedTools "Read(/proc/**)"` with a dummy env var and confirm the tool is refused; record the result in Appendix C. If the deny rule does not hold, the drain ships disabled behind `CAREER_OPS_AUTO_EVALUATE=1` until it does.
- [ ] `main` in the runner runs `runDrain` under `withResourceLock` on `<storePath>.drain` after the scan claim is released and before `{ status: "idle" }`, and writes `evaluated`, `gated` and `evalErrors` counts onto the originating run records by `runId`.

**You see.**

- [ ] After an auto-mode run, `node evaluate-queue.mjs dump --json` lists the rows with their states, each evaluated URL has a report under `reports/` and a tracker row, and the pipeline row is `- [x]`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/evaluate-queue.test.mjs` asserts last-row-wins, stale `running` read as `failed`, the third `failed` is final, the daily cap counts `running` and `evaluated` rows of today, URL normalisation folds two spellings, and `tsvCell` strips a tab from a reason. Run `node --test tests/evaluate-queue.test.mjs`.
- [ ] `web/tests/lib/evaluate-drain.test.mjs` with a fake `fetchFn` and `spawnFn` asserts the skip when the tracker has the URL (review focus 3), the `no-api-text` stay, the stop on a limit error leaving the rest `queued` (review focus 4), the `gated` outcome, the `running` row written before the POST, and that the POST carries `Host: localhost` and kind `evaluate-text`. Run `npm --prefix web test -- --test-name-pattern "drain"`.
- [ ] `web/tests/lib/claude-invocation.test.mjs` asserts `evaluate-text` denies WebFetch and WebSearch and keeps `--strict-mcp-config`; `run-prompts.test.mjs` asserts the text prompt carries the JD and no WebFetch instruction. Run `npm --prefix web test -- --test-name-pattern "claude-invocation|run-prompts"`.
- [ ] `tests/headless-permission-flags.test.mjs` passes unchanged. Run `node --test tests/headless-permission-flags.test.mjs`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, per the boot recipe, with `claude` replaced by a fake CLI that emits a stream-json result carrying a report envelope.

- [ ] Lane 1. Regression lane against trunk. Trunk has no drain, so record that and gate the diff-added behaviour. Run a mode-off job at head. Save `a1-off.png`. Pass when the ledger file is absent and the tick ends `idle`.
- [ ] Lane 2. Auto job, three candidates on a Greenhouse fixture board with a fake `fetch-jd` answer. Save `a1-three-evaluated.png`. Pass when three reports exist, the ledger shows three `evaluated`, and the pipeline rows are done.
- [ ] Lane 3. A candidate on a host outside `JD_TEXT_API_ATS`. Save `a1-no-api-text.png`. Pass when it is `skipped` with reason `no-api-text`, no report is written, and the next tick does not fetch it again.
- [ ] Lane 4. Evaluate one candidate from the Inbox while it is `queued`, then tick. Save `a1-ui-first.png`. Pass when the ledger row becomes `skipped` and only one report exists for that URL.
- [ ] Lane 5. Fake CLI returns a usage-limit error on the second row. Save `a1-limit-stop.png`. Pass when the first is `evaluated`, the second `failed`, the third still `queued`.
- [ ] Lane 6. Kill the runner during an evaluation, then tick after 15 minutes of fake clock. Save `a1-stale-running.png`. Pass when the stale `running` row reads as `failed` and is retried once.
- [ ] Lane 7. `auto_evaluate_daily_cap: 2` with five candidates. Save `a1-daily-cap.png`. Pass when two evaluate and three stay `queued`.
- [ ] Lane 8. Fake CLI returns a dealbreaker gate. Save `a1-gated.png`. Pass when the row is `gated` with the reason and is never retried on the next tick.
- [ ] Lane 9. Press Delete on a tracker row in the dashboard while the drain's evaluation is running. Save `a1-delete-blocked.png`. Pass when the delete answers the registry's busy status and no tracker row is lost.
- [ ] Lane 10. Stop the dashboard and run the drain from the command line with queued rows. Save `a1-offline.png`. Pass when every row stays `queued` with reason `dashboard-offline` and no retry is consumed; then `curl` the loopback route with kind `evaluate-text` and no `jdText` and pass when it answers 400.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Drain overhead per candidate excluding the model call, head only since trunk lacks the feature, plus the end state the user waits for, a report on disk and a done pipeline row.
- [ ] Probe. Fake CLI that answers in 100 ms; time `runDrain` over 20 candidates five times. At trunk, time a tick with no work to record the idle cost.
- [ ] Baseline. Record the trunk idle tick first.
- [ ] Rule. Under 500 ms per candidate of overhead, and the idle tick at head within 5 percent of trunk.

**Review gate.** None. PR-A1 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The operator merges.

## Show evaluate settings and outcomes on Scheduled scans (PR-A2)

**Depends on.** PR-A1.

**Files.**

- [ ] Edit `web/src/components/scheduled-scans/create-job-modal.tsx`, `edit-job-modal.tsx`, `job-card.tsx`, `run-history-drawer.tsx`.
- [ ] Create `web/src/components/scheduled-scans/evaluate-queue-panel.tsx` and `web/src/app/api/evaluate-queue/route.ts` (GET, reads through `runCoreCli("evaluate-queue", ["dump", "--json"])`).
- [ ] Edit the scheduled-scans tests under `web/tests/lib/` and `.claude/skills/upstream-review/SKILL.md`.

**Build.**

- [ ] A mode selector (Off, Review, Auto) with the threshold and per-run cap fields shown for Auto, and an explanation line that rank is a title-and-URL guess and Auto evaluates only postings whose ATS exposes the job text.
- [ ] The job card shows the mode; the run history drawer shows `ranked`, `queued`, `evaluated`, `gated`, `evalErrors` and `evalMessage`.
- [ ] A queue panel under the job list that lists ledger rows grouped by state with the rank and reason, read-only, with a link from each `queued` row to the Inbox facet for its scan date.

**You see.**

- [ ] A job set to Auto shows "Auto, rank 3.5 and above, 5 per run", and after a run the drawer reads "ranked 7, queued 7, evaluated 3, gated 1".

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] A component test asserts the Auto fields hide for Off and Review and the client sends `evaluate` in the body; a route test asserts the GET returns the dump and 503 when the CLI fails. Run `npm --prefix web test -- --test-name-pattern "scheduled|evaluate-queue"`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Create and edit a mode-off job at trunk and head. Save `a2-off-parity.png`. Pass when the saved job bodies match apart from the new default field.
- [ ] Lane 2. Set Auto with threshold 4.0 and cap 3, save, reload. Save `a2-auto-saved.png`. Pass when the card reads the values.
- [ ] Lane 3. Threshold 0.5 and cap 99. Save `a2-bounds.png`. Pass when the form refuses both with the bound in the message.
- [ ] Lane 4. Run history after a PR-A1 lane 2 run. Save `a2-drawer-counts.png`. Pass when the five counts show.
- [ ] Lane 5. Queue panel with mixed states. Save `a2-queue-panel.png`. Pass when rows group by state with rank and reason.
- [ ] Lane 6. Click a `queued` row's link. Save `a2-queue-link.png`. Pass when the Inbox opens with the facet for that date selected.
- [ ] Lane 7. `evaluate-queue.mjs` made to fail. Save `a2-queue-503.png`. Pass when the panel shows the error text and the rest of the page works.
- [ ] Lane 8. Mobile width for the modal and the panel. Save `a2-mobile.png`. Pass when no horizontal scroll.
- [ ] Lane 9. Dark mode. Save `a2-dark.png`. Pass when the mode badges meet contrast.
- [ ] Lane 10. Keyboard only through the mode selector. Save `a2-a11y.png`. Pass when every control is reachable and labelled.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Scheduled scans page LCP, trunk and head, with a 100-row ledger at head.
- [ ] Probe. chrome-devtools performance trace, three loads each, interleaved.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Head within 100 ms of trunk.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 and lane 5 screenshots into `private/review/a2-review-settings.png` and `private/review/a2-review-queue.png`.
- [ ] Record a 30 to 60 second video of setting Auto, running, and reading the drawer on a lane VM. Save it as `private/review/a2-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The operator merges.

## Make doctor gateway-aware (PR-P1)

**Depends on.** None.

**Files.**

- [ ] Edit `doctor.mjs` (`checkBillingSource`), `tests/doctor-billing-source.test.mjs`, `docs/RUNNING_ON_A_BUDGET.md` section 2b, `deploy/README.md` (the env table), `.claude/skills/upstream-review/SKILL.md` (rows for the four files).

**Build.**

- [ ] In `checkBillingSource`, when `ANTHROPIC_BASE_URL` is set and its host is not `api.anthropic.com`, return a pass labelled "Billing source. Requests route through a gateway at <host>, and the gateway's credential decides billing" with no fix lines, before the key and token branch.
- [ ] `deploy/README.md` documents `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` as the proxy pair, exclusive with `CLAUDE_CODE_OAUTH_TOKEN`.

**You see.**

- [ ] `ANTHROPIC_BASE_URL=http://proxy.example:8317 ANTHROPIC_AUTH_TOKEN=x node doctor.mjs` prints the gateway line and no "bills per token" warning.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/doctor-billing-source.test.mjs` gains "a gateway base URL with a token reports the gateway, not per-token billing" and "api.anthropic.com as base URL keeps the key warning". Run `node --test tests/doctor-billing-source.test.mjs`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. `ANTHROPIC_API_KEY=x node doctor.mjs` at trunk and head. Save `p1-key-warning.png`. Pass when both print the per-token warning.
- [ ] Lane 2. Gateway URL plus token. Save `p1-gateway.png`. Pass when the gateway line prints.
- [ ] Lane 3. Gateway URL alone. Save `p1-url-only.png`. Pass when the gateway line prints.
- [ ] Lane 4. `ANTHROPIC_BASE_URL=https://api.anthropic.com` plus a key. Save `p1-anthropic-host.png`. Pass when the key warning prints.
- [ ] Lane 5. `CLAUDE_CODE_USE_BEDROCK=1` plus a gateway URL. Save `p1-cloud-first.png`. Pass when the cloud warning wins.
- [ ] Lane 6. `node doctor.mjs --json` with the gateway pair. Save `p1-json.png`. Pass when the JSON is unchanged in shape.
- [ ] Lane 7. The web doctor route with the gateway pair in the dashboard's env. Save `p1-web-doctor.png`. Pass when the route answers as before.
- [ ] Lane 8. A malformed `ANTHROPIC_BASE_URL`. Save `p1-malformed.png`. Pass when doctor prints a warn naming the value as unparseable and never throws.
- [ ] Lane 9. `deploy/README.md` rendered. Save `p1-readme.png`. Pass when the table row reads as written.
- [ ] Lane 10. `node test-all.mjs --quick`. Save `p1-suite.png`. Pass when green.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `node doctor.mjs --json` wall time, trunk and head.
- [ ] Probe. `time` over five runs each, interleaved.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Head within 5 percent of trunk.

**Review gate.** None. PR-P1 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The operator merges.

## Route the web pod through CLIProxyAPI (PR-P2, operator, home-cluster)

**Depends on.** PR-P1.

**Files.**

- [ ] Edit `template/scripts/validate.py` (`CareerOps` gains `anthropic_base_url: str = ""` and `anthropic_auth_token: Secret = ""`, with the rule that the token needs the URL), `cluster.schema.json`, `cluster.sample.toml`, `template/scripts/test_validate.py`, `.github/template-tests/valid/public.toml`, a new `.github/template-tests/invalid/career-ops-proxy-token-without-url.toml` listed in `template-e2e.yaml`.
- [ ] Edit `template/config/kubernetes/apps/career-ops/career-ops/app/helmrelease.yaml.j2` (env `ANTHROPIC_BASE_URL` under `#% if career_ops.anthropic_base_url %#`) and `secret.sops.yaml.j2` (`ANTHROPIC_AUTH_TOKEN` under the same guard; `CLAUDE_CODE_OAUTH_TOKEN` rendered only when the field is non-empty).
- [ ] Edit `template/config/kubernetes/apps/llms/cliproxyapi/app/networkpolicy.yaml.j2` (a `from` entry with `namespaceSelector` `kubernetes.io/metadata.name: career-ops` and `podSelector` for the web pod, under `career_ops_enabled`).
- [ ] Edit `.claude/rules/apps/career-ops.md` and `.claude/rules/apps/cliproxyapi.md`.

**Build.**

- [ ] Render with `just configure`, confirm the diff touches only the two career-ops manifests and the proxy NetworkPolicy, and commit on a branch.
- [ ] Before the real pod, run a scratch pod in namespace `career-ops` from the career-ops image with the two variables and no OAuth token, and run `claude -p "Reply with the single word ok" --tools "" --disallowedTools "*"` inside it. The key is read from the pod env, never echoed.
- [ ] Set `claude_oauth_token = ""` in `cluster.toml` when the proxy pair is set, so no run carries both.

**You see.**

- [ ] The scratch pod prints `ok`, the proxy's manager console shows one request from the career-ops client key, and `node doctor.mjs` in the pod prints the gateway line.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `template/scripts/test_validate.py` gains "token without url is refused" and "url alone renders the env and no secret key". Run `uv run pytest template/scripts/test_validate.py -k career_ops`.
- [ ] `template-e2e.yaml` passes with the new invalid fixture. Run the workflow on the branch.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, where for this PR a lane drafts the exact commands and the operator runs each one against the cluster and pastes the result; no agent runs `kubectl`.

- [ ] Lane 1. Regression lane against trunk. One dashboard evaluate at trunk (OAuth token) and one at head (proxy), same fixture URL. Save `p2-evaluate-parity.png`. Pass when both produce a report with the same sections.
- [ ] Lane 2. Scratch pod `claude -p` through the proxy. Save `p2-scratch-ok.png`. Pass when it prints `ok`.
- [ ] Lane 3. The proxy's usage page after lane 2. Save `p2-usage.png`. Pass when the request appears under the career-ops key.
- [ ] Lane 4. `kubectl exec` into the web pod and `node doctor.mjs`. Save `p2-doctor.png`. Pass when the gateway line prints.
- [ ] Lane 5. `env | grep -c CLAUDE_CODE_OAUTH_TOKEN` in the web pod. Save `p2-no-oauth.png`. Pass when it prints 0.
- [ ] Lane 6. A pod in another namespace curls the proxy Service. Save `p2-netpol-deny.png`. Pass when it times out.
- [ ] Lane 7. The web pod curls `/healthz` on the proxy Service. Save `p2-netpol-allow.png`. Pass when it answers 200.
- [ ] Lane 8. Dashboard usage meter after lane 1. Save `p2-usage-meter.png`. Pass when it still renders and the operator notes its windows now span three seats.
- [ ] Lane 9. Remove the proxy pair in `cluster.toml`, re-render. Save `p2-render-off.png`. Pass when the diff restores the OAuth-only manifests.
- [ ] Lane 10. A wrong client key in the scratch pod. Save `p2-bad-key.png`. Pass when `claude -p` fails fast with an authentication error and the dashboard's fatal-stderr rule would catch it.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time to first streamed token of a dashboard evaluate, OAuth token at trunk and proxy at head.
- [ ] Probe. Three evaluates each on the same fixture URL, interleaved, read from the run log timestamps.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Head within 2 seconds of trunk.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 and lane 3 screenshots into `private/review/p2-review-ok.png` and `private/review/p2-review-usage.png`.
- [ ] Record a 30 to 60 second video of one dashboard evaluate through the proxy. Save it as `private/review/p2-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The operator merges in home-cluster and watches Flux reconcile the web pod.

## Link and theme publish key management (PR-K1)

**Depends on.** None.

**Files.**

- [ ] Edit `publish/pages/account.mjs` (inline token values, dark variant, key destination copy), `publish/tests/service.test.mjs` (script-free and parity assertions).
- [ ] Edit `web/src/components/shares/shares-view.tsx` and `web/src/app/shares/page.tsx` (the link, `PUBLISH_URL` read server-side), `web/src/app/api/shares/pull/route.ts` (the destination copy), `web/tests/lib/shares.test.mjs`.
- [ ] Edit `publish/README.md` and `.claude/skills/upstream-review/SKILL.md` (rows for the web files).

**Build.**

- [ ] The account page's inline `<style>` carries the `:root` light values from `web/src/app/globals.css` (`--bg`, `--surface`, `--border`, `--fg`, `--muted`, `--brand`) and the `.dark` values under `@media (prefers-color-scheme: dark)`, with a comment naming `globals.css` as the source. No `<script>`, no external URL, CSP unchanged.
- [ ] The key-shown-once copy and the pull route's two messages name both destinations, "the `[career_ops]` block of `cluster.toml` on a cluster install, or the data root `.env` on a local install".
- [ ] `shares/page.tsx` reads `process.env.PUBLISH_URL`; when set and `https`, `shares-view.tsx` shows "Manage publish keys" as a new-tab link with `rel="noopener"` to `${PUBLISH_URL}/account`; otherwise no link.

**You see.**

- [ ] The Shares page shows the link, and the account page opens in the dashboard's colours in light and dark mode with the same forms as before.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `publish/tests/service.test.mjs` gains "account page has no script tag and no external URL" and "account page carries the dashboard token values", the second reading `web/src/app/globals.css` and asserting each named variable's value appears in the page. Run `npm --prefix publish test`.
- [ ] `web/tests/lib/shares.test.mjs` gains "link renders only for an https PUBLISH_URL". Run `npm --prefix web test -- --test-name-pattern "shares"`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, per the boot recipe, with the publish service started from `publish/start.mjs` against a temp database.

- [ ] Lane 1. Regression lane against trunk. Sign in, mint, list, revoke at trunk and head. Save `k1-mint-parity.png`. Pass when both flows succeed and the key prefix is `cops_`.
- [ ] Lane 2. Account page in light mode. Save `k1-light.png`. Pass when the background and brand colours match the dashboard's values.
- [ ] Lane 3. Account page with `prefers-color-scheme: dark`. Save `k1-dark.png`. Pass when the dark values apply.
- [ ] Lane 4. Response headers of `/account`. Save `k1-csp.png`. Pass when the CSP string is byte-identical to trunk.
- [ ] Lane 5. Shares page with `PUBLISH_URL` set to an `https` URL. Save `k1-link.png`. Pass when the link shows and opens a new tab.
- [ ] Lane 6. Shares page with `PUBLISH_URL` unset. Save `k1-no-link.png`. Pass when no link renders.
- [ ] Lane 7. Shares page with an `http` `PUBLISH_URL`. Save `k1-http-hidden.png`. Pass when no link renders.
- [ ] Lane 8. The key-shown-once panel. Save `k1-copy.png`. Pass when it names both destinations.
- [ ] Lane 9. Mobile width of the account page. Save `k1-mobile.png`. Pass when the forms fit without horizontal scroll.
- [ ] Lane 10. Pull route message when the service is unreachable. Save `k1-pull-copy.png`. Pass when the toast names both destinations.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Byte size of the `/account` response, trunk and head.
- [ ] Probe. `curl -s -o /dev/null -w '%{size_download}'` three times each.
- [ ] Baseline. Record the trunk size first.
- [ ] Rule. Head under trunk plus 4 kB.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2, lane 3 and lane 5 screenshots into `private/review/k1-review-light.png`, `private/review/k1-review-dark.png` and `private/review/k1-review-link.png`.
- [ ] Record a 30 to 60 second video from the Shares link to a minted key on a lane VM, with the key masked. Save it as `private/review/k1-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The operator merges.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] The two existing jobs on the claim are switched to `filtersFrom: "file"` by the operator in the dashboard, and the first weekly full sweep has run with evaluate `off` so its volume is known before `review` is turned on.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

No code prototype was built; the brief was research and plan only. These are the measured facts the plan rests on and the questions that stay unproven until a PR runs.

- The proxy is reachable from the operator's network and bearer-gated. `GET /healthz` answered 200, `GET /v1/models` answered 401 with `Missing API key`, `GET /v1/messages` answered 404 (2026-11-08, no key used). An authenticated model list and a `claude -p` through the proxy from a pod are unproven here; the home-cluster rule file records the operator measuring both on 2026-11-07. PR-P2 lane 2 settles it.
- The origin guard admits a loopback host with no browser headers. Read in `web/src/lib/origin-guard.mjs` `checkRequest`, and relied on by the scan tick's `Host: localhost` curl in the HelmRelease. A runner POST to `/api/run` over loopback is unproven until PR-A1 lane 2.
- Six dashboard evaluations of 2026-11-05 cost a median of 70 thousand output tokens and 2.7 million cache-read tokens each (measured on the Mac data root, no personal data copied). The weekly full sweep's volume is unknown until it runs once.
- The doctor billing warning is CLI-only; `ANTHROPIC_API_KEY=x node doctor.mjs --json` returns warnings without it (measured 2026-11-08).
- Whether Claude Code 2.1.319 reads an empty `CLAUDE_CODE_OAUTH_TOKEN` as no credential is a guess; PR-P2 renders the key only when non-empty so the question does not arise.
- Whether the headless `Read` tool in the pod can read `/proc/self/environ`, and whether a `Read(/proc/**)` deny rule holds, is unchecked. PR-A1's Build has the gate; the drain stays disabled until it passes.

## Appendix B. Alternatives rejected

- **Spawning `claude -p "Run career-ops pipeline mode"` from the runner.** The pipeline mode needs Bash, Write and a browser, so the worker would need a flag of the `--dangerously-skip-permissions` family, which AGENTS.md forbids for a new spawner and `tests/headless-permission-flags.test.mjs` fails.
- **A pipeline snapshot before and after the scan as the candidate set.** Lost on a crash, a timeout after rows were appended, or a retry; the runner requeues a stale claim and re-runs the scan, which adds nothing the second time. All three reviewers raised it.
- **Spawning `rank-pipeline.mjs --limit N` with no URL filter.** It ranks the oldest unranked rows first and never reaches this run's rows while a backlog exists.
- **Extracting `runEvaluate` into a plain `.mjs` module.** The prompt needs `readLanguageConfig`, `readMemory`, `readInbox` and the binary path from TypeScript modules, and a runner-side merge would be invisible to `acquireTrackerWrite`. Reusing the route over loopback keeps both. Kept as the fallback if the loopback call proves unreliable in PR-A1.
- **A review queue page with approve all, approve selected and hand-picked rows.** The Inbox shortlist already selects rows and bulk-evaluates them with a cost confirmation; only the rank was missing. The operator may still want a page; it is an open decision below.
- **A ledger for review mode.** With the Inbox serving review, the ledger exists for auto mode only.
- **`webSearchOnly` for the auto kind.** It would keep the comp and legitimacy research that `modes/_shared.md` and `modes/oferta.md` ask for, but a search query is a channel out of the pod for whatever the agent read. The auto report says it carries no web research instead. Open decision 9.
- **Reusing `readSidecarRows` keyed by URL.** It rejects a first cell that is not a positive integer, and the web reads sidecars through a core CLI dump, so the ledger has its own module and CLI.
- **Raising the runner lock's stale time for long runs.** Staleness is judged by the owner pid being alive, so the number does nothing; the drain runs under its own lock instead.
- **A manual run route that waits through evaluations.** It would hold a browser request through the gateway for hours; the route keeps returning after the scan.
- **Auto mode with the dashboard's network scope on every posting.** A hostile posting would get an agent that holds `cv.md` and can fetch any URL, unattended. Auto mode uses API-fetched JD text and a no-network scope.
- **`ANTHROPIC_API_KEY` for the proxy.** Claude Code sends it as `x-api-key`; the proxy is documented for Bearer only.
- **An `apiKeyHelper` settings file in the image.** A static key needs no helper and the image has no settings file.
- **Routing the OpenAI-shaped evaluators instead of Claude Code.** They are not wired into the web or scheduled runs.
- **Option (b), minting publish keys server-to-server from the dashboard.** `PUBLISH_API_KEY` is pod env from a sops Secret and `share.mjs` reads env first, so a key the dashboard writes is shadowed; the admin route would also loosen the publish NetworkPolicy that makes `cf-connecting-ip` trustworthy and add a minting credential to an internet-facing service.
- **Option (d), account management inside the dashboard.** Rejected by the convergence plan's Appendix B (no in-app Better Auth) and C (the dashboard is never routed through publish).
- **An iframe of the account page.** `frame-ancestors 'none'` and `SameSite=Lax` cookies.
- **Re-seeding every job's filters from the file on each run.** Two sources that must agree, and the toggle is still needed to say which wins.

## Appendix C. Risks

- **Unattended agents on untrusted text** (PR-A1). Even with no network tool, the agent reads the pod's files. The report is the only output and the operator reads it. The owner checks whether `Read` reaches `/proc/self/environ` in the pod and records the answer here.
- **Loopback coupling** (PR-A1). The drain depends on the dashboard answering on `127.0.0.1:3000`. In the pod the runner is the dashboard's own child, so the server is up. On a Mac install cron or launchd starts the runner and the dashboard may be off; the drain probes `/api/healthz` first and leaves rows `queued` with reason `dashboard-offline`, consuming no retry.
- **Shared candidates across jobs** (PR-R1, PR-A1). Scan history names the board, not the job, so an auto job can pick up rows another job found on the same day. The ledger queues each URL once and the per-run and daily caps bound it. The owner states this on the Scheduled scans page copy.
- **Secrets readable by the agent** (PR-A1). `Read` can reach `/proc/self/environ`, which after PR-P2 holds the proxy token and the publish key, and a report is read later by agents that do have network. The kind denies `Read(/proc/**)` and the data root `.env`, and the gate in PR-A1's Build proves the deny holds before the drain is wired in.
- **Spend** (PR-A1, PR-A2). Default `off`, a per-run cap of 5 and a daily cap of 10 bound the first run of a new job, which is where the volume spike is (66 rows on the daily job's first run). The first weekly sweep runs with evaluate `off`.
- **Rank is a guess** (PR-R1, PR-R2). It sees company, title, URL and 2000 characters of CV. The UI never calls it a score.
- **Upstream files edited** (every PR). `rank-pipeline.mjs`, `doctor.mjs`, `worker-capabilities.mjs`, `run-prompts.mjs`, the run route, `pipeline-table.mjs`, `career-ops.ts`, the runner, `scheduled-jobs.ts`, the Inbox and scheduled-scans components, `DATA_CONTRACT.md`, `docs/AUTOMATION.md`, `docs/SCRIPTS.md`, `web/README.md`. Each gets a deviations row with its hunk rule in the same commit.
- **Three pooled seats** (PR-P2). The dashboard usage meter frames local transcripts as one account's windows; behind the proxy they describe no single account. The proxy's consoles are the usage view.
- **Proxy re-seed** (PR-P2). A second client key for career-ops lives on the proxy's volume and is lost on a re-seed. Sharing the `cluster.toml` key avoids that; the operator decides.
- **Token drift** (PR-K1). The account page copies token values; the parity test fails the build when `globals.css` changes them.
- **Cluster steps are the operator's** (PR-P2). Nothing here touches the cluster.

## Appendix D. Open decisions for the operator

1. Is a separate review queue page still wanted once the Inbox shows rank and groups rows by run, or does the shortlist cover approve all, approve selected and hand-picked? The plan assumes the Inbox covers it (PR-R2) and leaves the page out.
2. Should auto mode stay limited to postings whose ATS exposes JD text through an API (the default here), or evaluate every ranked row with the dashboard's network scope?
3. Should `auto` also render PDFs above `auto_pdf_score_threshold`? The plan is report-only.
4. Proxy client key, shared from `cluster.toml` or a second key minted in the manager console for per-client usage?
5. Proxy path, the in-cluster Service URL with a NetworkPolicy entry (the plan's default) or the gateway hostname?
6. With three pooled seats, keep the dashboard usage meter or hide it when `ANTHROPIC_BASE_URL` is set?
7. On a cluster install a key rotation is a `cluster.toml` edit. Should the account page print the exact line to paste?
8. Should the two existing jobs switch to `filtersFrom: "file"` once PR-F1 lands?
9. Auto-mode reports carry no web research. Accept and label it (the plan's default), or allow the `webSearchOnly` scope and accept the query channel?
10. Is auto mode wanted on the Mac install at all, where the dashboard may be off when the runner ticks?

## Appendix E. Links and reading list

- The research folder `docs/superpowers/research/2026-11-08-scan-automation-and-platform/`, reports 01 to 04, `reviews/01-design-interrogation.md` and `decisions.tsv`.
- `AGENTS.md` Data Contract, Headless worker permissions, Untrusted External Content, Ethical Use. `DATA_CONTRACT.md`. `.claude/rules/dev-workflow.md`. `.claude/skills/upstream-review/SKILL.md` Deviations decided.
- `web/scripts/scheduled-jobs-runner.mjs`, `web/src/lib/scheduled-jobs.ts`, `web/src/lib/scheduled-jobs-store.mjs`, `web/src/lib/scheduled-scan-error.mjs`, `web/src/app/api/scheduler/route.ts`, `web/src/app/api/scheduled-jobs/[id]/run/route.ts`.
- `rank-pipeline.mjs`, `url-key.mjs`, `lib/application-meta.mjs` (`appendSidecarRow`, `tsvCell`), `pipeline-lock.mjs`, `lib/dir-lock.mjs`.
- `web/src/app/api/run/route.ts`, `web/src/lib/claude-invocation.mjs`, `web/src/lib/worker-capabilities.mjs`, `web/src/lib/run-prompts.mjs`, `web/src/lib/report-persist.mjs`, `web/src/lib/evaluation-gate.mjs`, `web/src/lib/run-cli-support.mjs`, `web/src/lib/origin-guard.mjs`, `web/src/lib/core/run-registry.ts`.
- `web/src/lib/pipeline-table.mjs`, `web/src/lib/career-ops.ts` (`InboxJob`, `readInbox`, `readScanDates`), `web/src/components/inbox/inbox-triage.tsx`, `web/src/components/inbox/shortlist-tray.tsx`.
- `doctor.mjs` `checkBillingSource`, `tests/doctor-billing-source.test.mjs`, `deploy/Dockerfile`, `deploy/README.md`, `liveness-api.mjs` `JD_TEXT_API_ATS`, `browser-extract.mjs` `fetchJdViaKnownApi`, `fetch-jd.mjs`.
- `publish/server.mjs`, `publish/auth.mjs`, `publish/pages/account.mjs`, `publish/share.mjs`, `web/src/app/api/shares/pull/route.ts`, `web/src/components/shares/shares-view.tsx`, `web/src/app/globals.css`.
- home-cluster `.claude/rules/apps/cliproxyapi.md`, `template/config/kubernetes/apps/llms/cliproxyapi/app/`, `template/config/kubernetes/apps/career-ops/career-ops/app/`, `template/scripts/validate.py`, commit `dd52dd2`.
- Claude Code docs, https://code.claude.com/docs/en/authentication (Authentication precedence), https://code.claude.com/docs/en/llm-gateway, https://code.claude.com/docs/en/llm-gateway-protocol, https://code.claude.com/docs/en/env-vars. Better Auth, https://better-auth.com/docs/plugins/api-key. CLIProxyAPI, https://help.router-for.me/agent-client/claude-code.html.
- PR-A1 gets `<jstack>/skills/how/SKILL.md` grounding on the run route and `<jstack>/skills/interrogate/SKILL.md` on the drain before code. PR-P2 gets interrogate on the NetworkPolicy change. The trail continues in `decisions.tsv` per `<jstack>/skills/show-me-your-work/SKILL.md`.
