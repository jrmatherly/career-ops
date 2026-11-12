# Deployment Configuration and Web UI Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the hosted career-ops deployment do what its settings say, and give the web UI one consistent layout that matches the approved mockups.

**Architecture:** Seven phases, each its own branch and PR, landed one at a time in order. Phases 1 to 4 are correctness fixes in the scanners, the ranker, the drain and `doctor`. Phases 5 to 7 are the UI: shared shell and components first, then each page, then the CV page. Every rule worth asserting lives in a plain `.mjs` module with a `node --test` suite; React components only render what those modules return.

**Tech Stack:** Node.js `.mjs` scripts at the repo root, Next.js (App Router) and Tailwind under `web/`, `node:test`, Playwright (`playwright-core`) for browser suites.

**Spec:** `docs/superpowers/research/2026-11-11-deployment-config-review/findings.md` (item ids S, C, O, U, M used below) and `mockups.html` beside it (the approved layouts; open it in a browser and click the sidebar).

## Global Constraints

- Work in a sibling git worktree, never in the shared checkout on `main`. One branch and one PR per phase. Land them serially. Never merge without Jason's explicit go in the session. Never force-push.
- Commits are Conventional Commits with a scope (`fix(scan): …`, `feat(web): …`). `fix` bumps the patch version and `feat` the minor, so choose the type by what ships.
- Before every push: `node scripts/check-syntax.mjs`, then `node test-all.mjs --quick`, then `node .githooks/coderabbit-review.mjs` as its own command.
- Root test command, written `ROOT_TEST <file>` below: `node --test tests/<file>`.
- Web test command, written `WEB_TEST <file>` below: `cd web && node --experimental-strip-types --import=./tests/helpers/saved-settings-off.mjs --test tests/lib/<file>`.
- A new test is its own file. Root suites go in `tests/*.test.mjs`. Web suites go in `web/tests/lib/*.test.mjs` and nowhere else under `web/tests`.
- Web logic goes in a `.mjs` module under `web/src/lib/`. A component is not a place for a rule you want to assert (`web/AGENTS.md`).
- Read `web/node_modules/next/dist/docs/` before writing Next.js code. This Next version differs from older ones.
- Status writes go only through `/api/status`. Nothing is ever auto-submitted. Personal data never lands in a system-layer file.
- Every fork-only change to a file upstream ships gets a row in the deviations table in `.claude/skills/upstream-review/SKILL.md`. Run `ROOT_TEST fork-deviations-covered.test.mjs` after committing, since it diffs `HEAD`.
- UI text floor is 12px (`text-xs`). Interactive targets are at least 24px in both dimensions. Primary buttons keep `text-brand-foreground` on `bg-brand`.
- Exact values Jason decided: daily evaluation cap **30**, automatic CV score **4.0**, minimum salary **the profile's `compensation.minimum`, in USD**, skip seniority levels **left unset**.
- This repository is public. No tracked file, test fixture or commit message names a company from the tracker or inbox, quotes the CV, or states a salary figure as Jason's. The unredacted findings, mockups and first draft of this plan are in the gitignored `private/review/2026-11-11-deployment-config-review/`; read them when a task needs the real rows.

## Provenance of the file references

Spot-checked against the files on 2026-11-11: `web/src/components/page-frame.tsx`, `web/src/lib/nav-items.ts`, `rank-pipeline.mjs:300,429`, `lib/resume/to-cv-md.mjs:146-184`, `web/scripts/evaluate-drain.mjs:138,169,297`, `web/src/components/scheduled-jobs-view.tsx:42,235`, `web/src/app/api/run/route.ts:603`, `scan-ats-full.mjs:347-397`, `scan.mjs:1326-1375`, `lib/evaluate-queue.mjs:28,173`, `lib/settings-registry.mjs:69-86`. Every other path and line number comes from three read-only explorer reports and is approximate. Run `codegraph explore "<names>"` on a task's files before editing and trust the code over this document where they differ.

## Review Focus

1. A `cv.md` whose Education section mixes the bullet form and the `###` entry form. Expected: every line is either read or listed as unreadable, and none is dropped on a rewrite. Pinned in Task 20.
2. A sweep resumed from a checkpoint written before the salary and seniority keys existed. Expected: the resume is allowed when those settings are still unset. Pinned in Task 1.
3. A CV render that fails or times out inside the drain. Expected: the evaluation stays evaluated, the remaining queue still drains, and the daily cap is unaffected. Pinned in Task 4.
4. A `config/profile.yml` with no `target_roles`, or one that fails to parse. Expected: the ranker runs with no targeting section and does not crash. Pinned in Task 2.
5. A queue row whose URL matches neither a tracker row nor an inbox row. Expected: the row shows its URL as it does today, never a blank. Pinned in Task 8.

---

## Phase 0: Operations (no code, Jason approves each write)

### Task 0: Release, settings and cleanup on the pod

Covers O1 to O4 and S1 to S3. Nothing here is a code change. Each bullet is a write Jason approves when it is run.

- [ ] **Step 1: Release.** On Jason's go, merge https://github.com/jrmatherly/career-ops/pull/73 and ask the home-cluster session to deploy career-ops 2.1.1 and web 1.1.3.
- [ ] **Step 2: Confirm the deploy.** `kubectl -n career-ops exec deploy/career-ops -- sh -c 'cat /app/VERSION; ls -la /data/data/scheduled-jobs.log'` after one scheduler tick. Expected: `2.1.1` and the log file exists.
- [ ] **Step 3: Apply the three settings** through the Settings page at `https://career.matherly.net/config`: Automatic evaluations per day `30`, Score for an automatic CV `4.0`, Minimum salary set to the profile's `compensation.minimum` with Salary currency `USD`. Then read them back from the pod: `pipeline.auto_evaluate_daily_cap: 30` and `auto_pdf_score_threshold: 4` in `/data/config/profile.yml`, a `salary_filter` block with that `min` and `currency: USD` in `/data/portals.yml`.
- [ ] **Step 4: Rewrite tracker notes** on rows 94 to 100 so each starts with its report's `final_decision`, the same way rows 53 to 59 and 93 were done. Back up `applications.md` first. Expected: `grep -c '| ; posted:' /data/data/applications.md` prints `0`.
- [ ] **Step 5: Confirm a live log line** reaches VictoriaLogs: query `kubernetes.pod_namespace:career-ops kubernetes.container_name:app _time:1h | stats count()` through the kube API proxy. Expected: a count above 0 after the deploy's startup lines.
- [ ] **Step 6: Record** the PR 72, release and deploy rows in `docs/superpowers/research/2026-11-08-scan-automation-and-platform/decisions.tsv`, in one push to `main` after the release merges. The plan, findings and mockups were pushed on 2026-11-11.

---

## Phase 1: The weekly sweep honors the salary and seniority settings (C1)

Branch `fix/sweep-salary-tier`. Upstream-offerable as is.

### Task 1: Salary and seniority filters in `scan-ats-full.mjs`

**Files:**
- Modify: `scan-ats-full.mjs` (import at ~74, `filterFingerprints` at ~195, `passesFilters` at ~827, config read at ~1282-1330, counters at ~1423 and ~1502, `processJobs` at ~1520-1560, summary at ~1903-1916, JSON at ~1986-1989)
- Test: `tests/scan-ats-full-salary-tier.test.mjs`

**Interfaces:**
- Consumes: `buildSalaryFilter(salaryFilter) -> (salary) => boolean` from `scan.mjs`; `classifyTier(title) -> 'intern'|'entry'|'mid'|'senior'` from `classify-tier.mjs`.
- Produces: `passesFilters(job, { titleFilter, locationFilter, contentFilter, titleFilterConfig, companySlug, salaryFilter, skipTiers })`, where `salaryFilter` defaults to `() => true` and `skipTiers` to `[]`. Counters `droppedTier` and `droppedSalary`. JSON keys `postingsDroppedTier` and `postingsDroppedSalary`. Summary lines `Tier-filtered:` and `Salary-filtered:`. Fingerprint keys `skip_tiers` and `salary_filter`.

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { passesFilters, filterFingerprints, changedFilterKeys } from '../scan-ats-full.mjs';
import { buildSalaryFilter } from '../scan.mjs';

const pass = () => true;
const base = { titleFilter: pass, locationFilter: pass, contentFilter: null, titleFilterConfig: {} };
const salaryFilter = buildSalaryFilter({ min: 150000, currency: 'USD' });

test('a posting whose stated top of range is under the minimum is dropped', () => {
  assert.equal(passesFilters({ title: 'Director', salary: { min: 90000, max: 120000, currency: 'USD' } }, { ...base, salaryFilter }), false);
});
test('a posting with no salary passes', () => {
  assert.equal(passesFilters({ title: 'Director' }, { ...base, salaryFilter }), true);
});
test('a posting in another stated currency is dropped', () => {
  assert.equal(passesFilters({ title: 'Director', salary: { min: 200000, max: 250000, currency: 'EUR' } }, { ...base, salaryFilter }), false);
});
test('a skipped seniority level is dropped and an unmarked title is not', () => {
  assert.equal(passesFilters({ title: 'Infrastructure Engineer I' }, { ...base, skipTiers: ['entry'] }), false);
  assert.equal(passesFilters({ title: 'Infrastructure Engineer' }, { ...base, skipTiers: ['entry'] }), true);
});
test('changing either setting changes the checkpoint fingerprint', () => {
  const cp = { filters: filterFingerprints({}) };
  assert.ok(changedFilterKeys(cp, filterFingerprints({ salary_filter: { min: 150000 } })).includes('salary_filter'));
  assert.ok(changedFilterKeys(cp, filterFingerprints({ skip_tiers: ['entry'] })).includes('skip_tiers'));
});
test('a checkpoint written before these keys existed still resumes when both are unset', () => {
  const filters = filterFingerprints({});
  delete filters.salary_filter; delete filters.skip_tiers;
  assert.deepEqual(changedFilterKeys({ filters }, filterFingerprints({})), []);
  assert.deepEqual(changedFilterKeys({ filters }, filterFingerprints({ salary_filter: { min: 150000 } })), ['salary_filter']);
});
```

- [ ] **Step 2: Run** `ROOT_TEST scan-ats-full-salary-tier.test.mjs`. Expected: FAIL, the first test returns `true`.
- [ ] **Step 3: Implement.** Import both helpers. In `passesFilters`, check the tier after the title filter and the salary after the location filter, matching the order in `scan.mjs:5170,5195`. Read `config.skip_tiers` (global list only, validated against `intern, entry, mid, senior` the way `scan.mjs:4861` does) and `config.salary_filter` where the other filters are built. In `processJobs`, add the same two checks with their counters. Thread both counters through the checkpoint `cc` object, the human summary and the JSON, beside `droppedContent`. Add both keys to `filterFingerprints`. `changedFilterKeys(cp, fingerprints)` at line 217 compares `cp.filters[k] !== fingerprints[k]`, so a key missing from an older checkpoint reads as changed and blocks the resume. Make it compare a missing stored key against the fingerprint of an unset value (`filterFingerprints({})[k]`) for these two keys.
- [ ] **Step 4: Run** the new file plus `ROOT_TEST scan-ats-full-title-filter-full.test.mjs` and the `scan-ats-full-*checkpoint*` and `*resume*` suites. Expected: PASS.
- [ ] **Step 5: Commit** `fix(scan): the full sweep applies the salary and seniority filters`.

---

## Phase 2: The ranker knows what roles are wanted (C3)

Branch `fix/rank-targeting`. Upstream-offerable.

### Task 2: Targeting in the ranking prompt

**Files:**
- Modify: `rank-pipeline.mjs` (`buildPrompt` at 300, the call at ~452, the excerpt read at ~429)
- Test: `tests/rank-pipeline-targeting.test.mjs`

**Interfaces:**
- Produces: `readTargeting(profilePath) -> string` (empty string when the file is missing, unparseable or has no `target_roles`), and `buildPrompt(entries, cvExcerpt, targeting = '')`.

`readTargeting` returns at most 1,500 characters built from `config/profile.yml`: one line per `target_roles.primary` entry under `Primary:`, one per `target_roles.secondary` entry under `Secondary:`, and one per `target_roles.archetypes` entry as `{name} ({level}, {fit})`. Find the profile with `getProfilePath(DATA_ROOT)` from `path-resolver.mjs` (line 162); `DATA_ROOT` is already resolved at `rank-pipeline.mjs:50`.

When `targeting` is non-empty, `buildPrompt` adds this block after the profile excerpt, verbatim:

```
CANDIDATE TARGETING (the roles this person wants):
{targeting}

Score the title's role family and level against this targeting first, and keyword overlap second. A title whose role family or level the targeting does not list scores at most 3.0, however many keywords it shares.
```

- [ ] **Step 1: Write the failing tests.** Assert, with a temp `profile.yml` holding `target_roles.primary: ["Infrastructure Leader (Director / Head)"]`: `readTargeting(path)` contains `Infrastructure Leader (Director / Head)`; `readTargeting('/nope.yml') === ''`; `readTargeting` of a file containing `: : :` returns `''`; `buildPrompt(rows, cv, 'X')` contains `CANDIDATE TARGETING` and `scores at most 3.0`; `buildPrompt(rows, cv)` contains neither; both prompts still contain the existing untrusted-postings sentence the `selfTest` checks.
- [ ] **Step 2: Run** `ROOT_TEST rank-pipeline-targeting.test.mjs`. Expected: FAIL, `readTargeting` is not exported.
- [ ] **Step 3: Implement** both functions and pass `readTargeting(...)` at the `buildPrompt` call site.
- [ ] **Step 4: Run** the new file and every `tests/rank-pipeline*.test.mjs`, then `node rank-pipeline.mjs --self-test`. Expected: PASS.
- [ ] **Step 5: Acceptance check against real samples.** In a scratch data root (`CAREER_OPS_ROOT=<scratch>` holding copies of the pod's `cv.md`, `config/profile.yml` and a `data/pipeline.md` with the seven rows listed under C3 in the spec), run `node rank-pipeline.mjs --limit 7` and record old estimate, new estimate and evaluated score for each row in the PR body. Accept when the four software-engineer titles estimate under 3.5 and Company A and Company B stay at 3.5 or higher. If they do not, stop and report; do not tune the 3.0 figure silently.
- [ ] **Step 6: Commit** `fix(rank): rank against the profile's target roles, not only the CV excerpt`.

---

## Phase 3: The drain makes a CV at the threshold and marks gated roles (C7, U11)

Branch `feat/drain-auto-cv`.

### Task 3: The run's finished event carries the score

**Files:**
- Modify: `web/src/app/api/run/route.ts` (~585-603), `web/src/lib/report-persist.mjs` (`persistEvaluation` at 225, `parseReportMeta` at 119)
- Test: `web/tests/lib/report-persist.test.mjs` (add cases)

**Interfaces:**
- Produces: the `done` event `{ type: "done", tokens, costUsd, reportN, score }` where `score` is a number from 0 to 5, or `null` when the report's score cannot be read.

- [ ] **Step 1: Write the failing test:** `persistEvaluation`'s result exposes `score: 4` for a Machine Summary scoring `4.0/5`, and `score: null` when the score cell is `N/A`.
- [ ] **Step 2: Run** `WEB_TEST report-persist.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.** Return the numeric score beside `num` from `persistEvaluation`, parsed from the `meta.score` string it already holds (`parseFloat`, then `null` unless the result is a finite number from 0 to 5). `scoreNum` lives in `format.ts`, which this `.mjs` module cannot import. Add `score` to the `send` at `route.ts:603`.
- [ ] **Step 4: Run** the suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): the evaluation's finished event reports its score`.

### Task 4: The drain starts a CV render at the threshold

**Files:**
- Modify: `lib/evaluate-queue.mjs` (beside `readDailyCap` at 173), `web/scripts/evaluate-drain.mjs` (`outcomeOf` at ~117-138, the loop at ~297)
- Test: `tests/evaluate-queue.test.mjs` (add), `web/tests/lib/evaluate-drain.test.mjs` (add)

**Interfaces:**
- Consumes: the `done` event's `score` and `reportN` from Task 3.
- Produces: `readAutoPdfThreshold(profilePath) -> number` in `lib/evaluate-queue.mjs`, default `DEFAULT_AUTO_PDF_THRESHOLD = 3` (the registry default at `lib/settings-registry.mjs:69`), same missing-file and invalid-value behavior as `readDailyCap`. `outcomeOf` returns `{ state, reason, reportN, score }`.

Rule: after an `evaluated` outcome is appended to the ledger, when `reportN` is set and `score !== null && score >= threshold`, the drain posts `{ kind: "pdf", input: String(reportN), cliId: "claude" }` to `/api/run` with the same timeout, waits for it, and logs `cv for report {reportN}: ready` or `cv for report {reportN}: failed ({reason})`. The CV run starts only after the evaluation's response has ended, because both take the tracker write lock. A CV run never changes the ledger row, never counts toward `maxPerRun` or the daily cap, and never stops the loop.

- [ ] **Step 1: Write the failing tests.** `readAutoPdfThreshold`: returns `4` for `auto_pdf_score_threshold: 4`, `3` for a missing key, `3` for a missing file, `3` with a stderr warning for `"high"`. Drain, using the suite's existing stub for `request`: a `done` event with `reportN: 94, score: 4` and threshold `4` produces a second call whose body is `{ kind: "pdf", input: "94", cliId: "claude" }`; `score: 3.9` produces none; `score: null` produces none; a CV call that returns status 500 leaves the ledger row `evaluated` and the next queued URL still runs; two evaluations at the threshold with `maxPerRun: 2` both evaluate.
- [ ] **Step 2: Run** `ROOT_TEST evaluate-queue.test.mjs` and `WEB_TEST evaluate-drain.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** per the rule above.
- [ ] **Step 4: Run** both suites. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): the scheduled drain renders a CV for roles at the automatic CV score`.

### Task 5: A gated role is marked in the inbox

**Files:**
- Modify: `web/src/lib/inbox-pending.mjs`, `web/src/lib/inbox-sort.mjs` (`compareInboxJobs` at 14), `web/src/lib/career-ops.ts` (`InboxJob` at 106), `web/src/app/pipeline/page.tsx`, `web/src/components/inbox/triage-row.tsx`
- Test: `web/tests/lib/inbox-pending.test.mjs`, `web/tests/lib/inbox-sort.test.mjs`

**Interfaces:**
- Produces: `markGated(jobs, ledgerEntries) -> jobs`, which sets `gated: string` (the ledger `reason`, such as `dealbreaker`) on each job whose URL key equals a ledger entry with `state === "gated"`, matched with `canonicalJobKey` from `web/src/lib/core/url-key.mjs`, the key `reconcileInbox` uses. `InboxJob.gated?: string`. `compareInboxJobs(a, b)` takes `{ job, age }` wrappers and orders one whose `job.gated` is set after every one that is not.

- [ ] **Step 1: Write the failing tests:** a job at `https://jobs.ashbyhq.com/example/11111111-1111-4111-8111-111111111111` with a matching `gated` ledger entry gets `gated: "dealbreaker"`; the sibling posting `…/22222222-2222-4222-8222-222222222222` does not; an `evaluated` or `skipped` entry marks nothing; a gated job ranked 3.7 sorts after an ungated job ranked 1.0.
- [ ] **Step 2: Run** both suites. Expected: FAIL.
- [ ] **Step 3: Implement.** `readInbox` is synchronous and `runCoreCli` returns a promise, so the marking happens in the async server page: `web/src/app/pipeline/page.tsx` awaits the ledger the way `web/src/app/api/evaluate-queue/route.ts` does (`runCoreCli("evaluate-queue", ["dump","--json"])`) and passes the inbox through `markGated` before rendering. A ledger that cannot be read marks nothing and does not throw. In `triage-row.tsx`, a gated row shows a `Badge tone="bad"` reading `Gated: {reason}` where the rank pill would be.
- [ ] **Step 4: Run** both suites. Expected: PASS.
- [ ] **Step 5: Commit** `fix(web): a role the drain gated is marked in the inbox and sorts last`. Add the deviations rows for this phase.

---

## Phase 4: The app knows it is hosted (C2, C4, C5, C6, U3, M5)

Branch `fix/hosted-copy`.

### Task 6: `doctor` does not ask for Playwright MCP on a hosted install

**Files:**
- Modify: `doctor.mjs` (`checkPlaywrightMcp` at ~1178)
- Test: `tests/playwright-mcp-detection.test.mjs` (add cases)

**Interfaces:**
- Produces: `checkPlaywrightMcp(root, activeCli, env = process.env)`. When `env.KUBERNETES_SERVICE_HOST` is set or `env.CAREER_OPS_SCHEDULER === 'external'`, it returns `{ pass: true, label: 'Playwright MCP not needed here (hosted install: web workers load no MCP servers)' }` before any config scan.

- [ ] **Step 1: Write the failing tests:** with `CAREER_OPS_SCHEDULER=external` and no MCP config, `node doctor.mjs --json` has no warning containing `Playwright MCP tools not detected`; with `KUBERNETES_SERVICE_HOST=10.0.0.1` the same; with neither set the existing warning still appears.
- [ ] **Step 2: Run** `ROOT_TEST playwright-mcp-detection.test.mjs`. Expected: FAIL on the first two.
- [ ] **Step 3: Implement** and pass `process.env` at both call sites (~1777 and ~2054).
- [ ] **Step 4: Run** the suite and `tests/doctor-*.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(doctor): no Playwright MCP warning on a hosted install`.

### Task 7: One hosted-or-local signal, and the copy that reads it

**Files:**
- Create: `web/src/lib/deployment.mjs`, `web/src/components/deployment-context.tsx`
- Modify: `web/src/app/layout.tsx`, `web/src/components/app-shell.tsx:85`, `web/src/components/mobile-nav.tsx:200`, `web/src/app/config/page.tsx`, `web/src/components/config-form.tsx` (~134, ~205-234, ~344), `web/src/components/shares/shares-view.tsx:~90`, `web/src/app/portals/page.tsx`, `web/src/lib/scheduled-scheduler-status.mjs`, `web/src/components/scheduled-jobs-view.tsx` (type at 29-34, card at ~205-250)
- Test: `web/tests/lib/deployment.test.mjs`, `web/tests/lib/scheduler-external.test.mjs` (add)

**Interfaces:**
- Produces: `deploymentMode(env = process.env) -> { hosted: boolean, host: string | null }`. `hosted` is true when `validateAllowedHosts(env.CAREER_OPS_WEB_ALLOWED_HOSTS)` from `web/src/lib/bind-host.mjs` (returns `{ ok: true, hosts }` or `{ ok: false, error }`; treat `ok: false` as not hosted) holds at least one host that is not `localhost`, `127.0.0.1`, `[::1]` or a name ending in `.localhost`; `host` is the first such host. `useDeployment()` returns the same object in client components; `layout.tsx` provides it. `schedulerCardCopy(status) -> { title, badge, subline }`.

Copy, exact:

| Place | Hosted | Local |
|---|---|---|
| Sidebar and mobile nav footer | `Hosted · {host}` | `local-first · v0` (unchanged) |
| Settings description | `Hosted at {host}. Your data is in {dataRoot} on this server.` | unchanged |
| Settings CLI list | installed CLIs as rows, then one row `{n} other CLIs are supported and not installed on this server` with a `Show` button | unchanged |
| Settings stray line `Local-first · on our roadmap` | not rendered | unchanged |
| Shares empty state | `No shares yet. Publishing runs from a shell on this server, not from this page:` then the existing command | unchanged |
| Portals subline | `Backed by portals.yml on this server.` | unchanged |

`schedulerCardCopy`: for `status.source === "external"`, `title` is `status.description ?? "External scheduler"`, `badge` is `Running`, `subline` is `Last tick {when}` or `No tick recorded yet`. For `source === "os"` it returns today's strings. `dataRoot` comes from `careerOpsRoot()` in the server page and is passed to `ConfigForm` as a prop. This signal is deliberately different from Task 6's: `doctor` runs outside the web process and cannot see how the page is served, so it keys on the scheduler and Kubernetes variables.

- [ ] **Step 1: Write the failing tests.** `deploymentMode({ CAREER_OPS_WEB_ALLOWED_HOSTS: 'career.matherly.net' })` is `{ hosted: true, host: 'career.matherly.net' }`; `'localhost,127.0.0.1'` and an unset variable give `{ hosted: false, host: null }`; `'localhost, career.example.com'` gives host `career.example.com`. `schedulerCardCopy({ source: 'external', description: 'CronJob career-ops-scan-tick, every 15 minutes', task: { lastRun: '2026-11-12T02:00:00Z', nextRun: null } }).title` equals the description and its `subline` does not contain `Next OS check`.
- [ ] **Step 2: Run** `WEB_TEST deployment.test.mjs` and `WEB_TEST scheduler-external.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the module, the context, the copy table and the card. Add `source` and `description` to the component's `SchedulerStatus` type and to `isSchedulerStatusPayload`.
- [ ] **Step 4: Run** both suites, then `cd web && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(web): hosted installs describe themselves as hosted`.

### Task 8: The evaluate queue shows company, role and both numbers

**Files:**
- Modify: `web/src/lib/evaluate-settings.mjs`, `web/src/app/api/evaluate-queue/route.ts`, `web/src/components/scheduled-scans/evaluate-queue-panel.tsx`
- Test: `web/tests/lib/evaluate-settings.test.mjs`, `web/tests/lib/evaluate-queue-route.test.mjs`

**Interfaces:**
- Produces: `enrichLedger(entries, inboxJobs, applications) -> entries`, adding `company?: string`, `role?: string`, `score?: string`, `trackerN?: string` to each entry. A tracker row with the same URL key wins; an inbox row is the fallback and supplies only `company` and `role`.

Rendering: the row title is `{company} · {role}` when both exist and the URL otherwise. The rank shows as `est. {rank}` and the score, when present, as a `Badge` after an arrow. The link reads `View evaluation` and goes to `/pipeline/{trackerN}`; it is absent when `trackerN` is. The `report 94` text is no longer shown.

- [ ] **Step 1: Write the failing tests:** an entry whose URL matches tracker row 94 gets `company: 'Company A'`, `score: '4.0/5'`, `trackerN: '94'`; an entry matching only an inbox row gets `company` and `role` and no `trackerN`; an entry matching neither is returned unchanged with its `url` intact.
- [ ] **Step 2: Run** `WEB_TEST evaluate-settings.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `enrichLedger`, call it in the route with `parseInbox` and `readApplications`, and update the panel.
- [ ] **Step 4: Run** both suites. Expected: PASS.
- [ ] **Step 5: Commit** `fix(web): the evaluate queue names the company and role`. Add the deviations rows for this phase.

---

## Phase 5: Shared shell and components (U1, U2, U4, U5, U6, U7)

Branch `feat/web-shell`. This phase and the next two are fork design changes.

### Task 9: Time formatting in one module

**Files:**
- Create: `web/src/lib/format-time.mjs`
- Modify: `web/src/components/inbox/triage-row.tsx:16-22`, `web/src/components/explore/discovery-card.tsx:16`, `web/src/components/scheduled-scans/job-card.tsx:188`, `web/src/components/scheduled-jobs-view.tsx:37-39`, `web/src/components/home/follow-up-card.tsx:75`, `web/src/components/scheduled-scans/run-history-drawer.tsx:82,92`
- Test: `web/tests/lib/format-time.test.mjs`

**Interfaces:**
- Produces: `agoLabel(days: number | null) -> string` (`today`, `yesterday`, `{n} days ago` under 14, `{n} weeks ago` under 60, `{n} months ago` after; `''` for null). `formatDay(isoDate: string, now = new Date()) -> string` (`Nov 5`, with `, 2025` when the year differs from `now`). `formatWhen(iso: string | null, { now = new Date(), timeZone } = {}) -> string` (`Today 7:00 AM`, `Yesterday 7:00 AM`, otherwise `Nov 5, 7:00 AM`; `Not yet` for null).

- [ ] **Step 1: Write the failing tests** with a fixed `now` of `2026-11-11T21:00:00-05:00` and `timeZone: 'America/New_York'`: `formatWhen('2026-11-11T12:00:32Z', opts) === 'Today 7:00 AM'`; `formatWhen('2026-11-10T12:00:00Z', opts) === 'Yesterday 7:00 AM'`; `formatWhen('2026-11-05T12:00:00Z', opts) === 'Nov 5, 7:00 AM'`; `formatWhen(null) === 'Not yet'`; `formatDay('2026-11-05', now) === 'Nov 5'`; `formatDay('2025-12-31', now) === 'Dec 31, 2025'`; `agoLabel(0) === 'today'`, `agoLabel(1) === 'yesterday'`, `agoLabel(7) === '7 days ago'`, `agoLabel(21) === '3 weeks ago'`.
- [ ] **Step 2: Run** `WEB_TEST format-time.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** with `Intl.DateTimeFormat('en-US', …)` and replace the six inline formatters with calls. `follow-up-card` renders `Applied {formatDay(date)} · {agoLabel(days)}`.
- [ ] **Step 4: Run** the suite and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `refactor(web): one date and time formatter`.

Known limit, not fixed here: the "Added" chips on Pipeline come from `scan-history.tsv`, which stores a UTC date with no time, so a scan after 7 PM Eastern still shows the next day.

### Task 10: Grouped navigation

**Files:**
- Modify: `web/src/lib/nav-items.ts`, `web/src/components/app-shell.tsx` (~55-90), `web/src/components/mobile-nav.tsx`
- Test: `web/tests/lib/nav-items.test.mjs` (new; import the `.ts` through `tests/helpers/web-ts-alias-loader.mjs` as other suites do)

**Interfaces:**
- Produces: `NavItem.group: 'Daily' | 'Discover' | 'Profile' | 'Insight' | 'Pinned'`, and `navGroups(followupsEnabled) -> { label: string, items: NavItem[] }[]`.

Order: Daily (Today, Pipeline, Board, Follow-ups), Discover (Explore, Scheduled scans, Portals), Profile (CV, Resume, Documents, Shares), Insight (Analytics), Pinned (Settings). The Explore `chip` is removed. Resume stays until Task 22 removes it. The sidebar renders a `text-xs uppercase tracking-[0.14em] text-faint` label above each group and renders Pinned in the footer above the deployment line. The usage meter rows gain `title` text: `Tokens used in the last 5 hours, and the share of the plan's limit` and the 7-day equivalent (U26).

- [ ] **Step 1: Write the failing tests:** `navGroups(true).map(g => g.label)` deep-equals `['Daily','Discover','Profile','Insight','Pinned']`; the Daily hrefs are `['/', '/pipeline', '/board', '/followups']`; `navGroups(false)` has no `/followups`; no item has a `chip`; every `NAV_ITEMS` href appears in exactly one group.
- [ ] **Step 2: Run** the suite. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the suite and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): group the navigation and pin Settings`.

### Task 11: Page shell, header, tiles and tabs on every page

**Files:**
- Modify: `web/src/components/page-frame.tsx`
- Create: `web/src/components/page-header.tsx`, `web/src/components/ui/stat-tile.tsx`, `web/src/components/ui/tabs.tsx`
- Modify, to adopt the shell and header: `home/today-dashboard.tsx:171`, `explore/explorer-view.tsx:119-128`, `scheduled-jobs-view.tsx:155-161`, `pipeline-view.tsx:535`, `followups/followups-view.tsx:208`, `app/portals/page.tsx:28-31`, `analytics-view.tsx:38`, `cv-editor.tsx:165`, `app/documents/page.tsx:81-106`, `config-form.tsx:131`, `settings/settings-view.tsx:116`, `resume/resume-editor.tsx:176`, `board/board.tsx:60`, `shares/shares-view.tsx:58`, and `page-loading-skeletons.tsx` to match
- Test: `web/tests/lib/layout-shell.browser.test.mjs`, registered in `web/tests/browser-suites.mjs`

**Interfaces:**
- Produces: `PageFrame({ children, className?, width?: 'reading' | 'wide' })`, where `wide` is `max-w-6xl` (the default) and `reading` is `max-w-3xl`, both with `px-4 py-6 sm:px-6 sm:py-8 max-sm:pb-24`. `PageHeader({ title, description?, actions? })`, whose h1 is `font-display text-3xl tracking-tight text-landing` and whose description is `mt-1.5 text-sm text-muted`. `StatTile({ value, label, href? })`, whose value is `font-display text-4xl leading-none text-brand-text` and label `text-sm text-muted`. `Tabs({ items: { id, label, count? }[], value, onChange, ariaLabel })`, rendering buttons with `aria-pressed` and a 2px brand underline on the active one.

Widths: `reading` for Settings and Portals, `wide` for every other page. Titles are the nav labels, except Follow-ups (`Follow-ups`), Scheduled scans (`Scheduled scans`) and Analytics (`Analytics`). `StatTile` deliberately allows several serif numerals on one page, which the comment in `ui/stat-card.tsx` advises against; Jason asked for it (M1, M3).

- [ ] **Step 1: Write the failing browser test.** For each of `/`, `/explore`, `/scheduled-scans`, `/pipeline`, `/followups`, `/portals`, `/analytics`, `/cv`, `/documents`, `/config`, `/board`, `/shares`, at a 1280 by 900 viewport, follow the stubbing pattern in `accessible-names.browser.test.mjs` and assert: exactly one `h1` inside `main`; its computed `font-size` is `30px`; its computed `font-family` contains `Instrument Serif`; the h1's left edge is at least 16px right of `main`'s left edge and its top at least 24px below `main`'s top; `document.documentElement.scrollWidth <= innerWidth`; no element in `main` with its own text has a computed `font-size` under 12px; every `input[type=checkbox]`, `button` and `a` in `main` with a non-zero box is at least 24px in both dimensions.
- [ ] **Step 2: Run** `cd web && npm run build && npm run test:browser`. Expected: FAIL on Documents (no padding) and on the size checks.
- [ ] **Step 3: Implement** the four components and move every page onto `PageFrame` plus `PageHeader`. Replace every `text-[9px]`, `text-[10px]` and `text-[11px]` under `web/src/components` and `web/src/app` with `text-xs`. Give row checkboxes `size-6` and row title links `min-h-6 inline-flex items-center`.
- [ ] **Step 4: Run** `npm run typecheck`, the browser suite and `WEB_TEST` for any suite that greps component text (`settings-view-wiring`, `config-form-persist-wiring`, `portals-empty-copy`). Expected: PASS. `grep -rnE 'text-\[(9|10|11)px\]' web/src` prints nothing.
- [ ] **Step 5: Commit** `feat(web): one page shell and header for every page`. Add the deviations rows for this phase.

---

## Phase 6: Page by page

Branch `feat/web-pages`. Each task follows the matching screen in `mockups.html`.

### Task 12: Today (M1, M2, U24, U18)

**Files:**
- Modify: `web/src/lib/home/awaiting.mjs`, `web/src/components/home/today-dashboard.tsx` (hero at 189-203, button at 286-290), `web/src/components/home/decision-card.tsx`, `web/src/components/home/follow-up-card.tsx`
- Test: `web/tests/lib/awaiting-order.test.mjs`

**Interfaces:**
- Produces: `decisionBadges(app, { pdfReady, now }) -> { label: string, tone: 'good' | 'muted' }[]`, in this order: `Evaluated {formatWhen-style day}` (tone `good`; `Evaluated today` when the row's date is today), `CV ready` or `CV not made yet` (tone `muted`), and `Posted {formatDay(date)}` only when the notes carry `posted: YYYY-MM-DD`.

Layout: the hero is replaced by `PageHeader` with the date as its description, then three `StatTile`s: `{n}` `new matches this week`, `{n}` `follow-ups due today`, `{n}` `roles above the apply line` (the length of the Recommended group). The `Apply next` button is removed. Each decision card shows its badges under the role. The Below-the-apply-line group is collapsed behind one outline button `Show {n} roles below the apply line`. The follow-up button reads `Log follow-up`.

- [ ] **Step 1: Write the failing tests:** for a row dated today with notes `Consider; posted: 2026-11-11` and `pdfReady: false`, the labels are `['Evaluated today', 'CV not made yet', 'Posted Nov 11']`; with `pdfReady: true` the second is `CV ready`; notes with no `posted:` give two badges.
- [ ] **Step 2: Run** `WEB_TEST awaiting-order.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.** `pdfReady` comes from the same source the report page's PDF button uses (`web/src/lib/pdf-button-state.mjs`).
- [ ] **Step 4: Run** the suite, `today-snapshot`, `hero-state` and `home-followups-shown`. Expected: PASS, with `hero-state` assertions updated to the tile copy.
- [ ] **Step 5: Commit** `feat(web): Today shows counts as tiles and state on each role`.

### Task 13: Scheduled scans (M3, M4, U15)

**Files:**
- Modify: `web/src/lib/scheduled-cadence.mjs`, `web/src/components/scheduled-jobs-view.tsx`, `web/src/components/scheduled-scans/job-card.tsx`
- Test: `web/tests/lib/scheduled-cadence.test.mjs` (new; the module's only export today is `nextScheduledRun`)

**Interfaces:**
- Produces: `cadenceLabel(job) -> string`. For `{ unit: 'days', every: 1, timezone: 'America/New_York', startAt: '2026-11-06T12:00:00.000Z' }` it returns `Daily · 7:00 AM Eastern`. For `{ unit: 'days', every: 7, timezone: 'UTC', startAt: '2026-11-08T04:18:28.829Z' }` it returns `Weekly · Sun 4:18 AM UTC`. Any other interval returns `Every {n} {unit} · {time} {zone}`. The zone name is the short generic name from `Intl.DateTimeFormat(…, { timeZoneName: 'shortGeneric' })` with `ET` spelled `Eastern`, `CT` `Central`, `MT` `Mountain`, `PT` `Pacific`, and `GMT+0` (what Node prints for `UTC`) spelled `UTC`. Node prints `7:00 AM ET` and `Sun` for these inputs, checked on 2026-11-11.

Layout: three `StatTile`s (`active scans`, `runs, none failed` or `runs, {n} failed`, `roles found`) replace the four stat cards. On each job card the name is `text-base font-semibold`, `cadenceLabel` is a brand-tone badge on the right, the keywords are `{n} keywords` with a `Show` toggle, and the last run is its own bordered line: a status dot, the label `LAST RUN`, `formatWhen(lastRunAt)`, and `{n} roles` in bold on the right.

- [ ] **Step 1: Write the failing tests** for the three `cadenceLabel` cases above.
- [ ] **Step 2: Run** the suite. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the suite and `scheduled-jobs-runner`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): scheduled scans show schedule and last run at a glance`.

### Task 14: Pipeline (U8, U9, U10, U12)

**Files:**
- Modify: `web/src/lib/pipeline-navigation.mjs`, `web/src/lib/company-presentation.mjs`, `web/src/components/pipeline-view.tsx` (tabs at ~647-670, inbox at ~758-773), `web/src/components/inbox/triage-row.tsx` (55-108)
- Test: `web/tests/lib/pipeline-navigation.test.mjs`, `web/tests/lib/company-presentation.test.mjs` (both exist; add cases)

**Interfaces:**
- Produces: `splitTabs(tabs, counts, active) -> { shown: Tab[], more: Tab[] }`: Inbox, Evaluated and Applied are always shown; any other tab is shown when its count is above 0 or it is the active tab; the rest go to `more`. `displayCompany(name) -> string`: a name with any uppercase letter is returned unchanged; an all-lowercase name is split on `-`, `_` and spaces and each word is capitalized. `compactLocation(location) -> string`: split on ` · `, strip a leading two-letter code and dash (`US - `), drop case-insensitive repeats and any part contained in an earlier part, keep the first three, join with `, `.

Layout: `LinkedInPaste` renders only after an `Add from LinkedIn` button in the header is pressed. Tabs render `shown` and then a `More` menu holding `more`. A row's rank renders as a dashed pill `est. {rank}` with `title="Estimated from the title and company. Not an evaluation."`, and the `not scored` text is removed.

- [ ] **Step 1: Write the failing tests:** with counts `{ INBOX: 62, EVALUATED: 28, APPLIED: 3, RESPONDED: 0, DISCARDED: 20, SKIP: 16, OFFER: 0 }` and active `INBOX`, `shown` ids are `['INBOX','EVALUATED','APPLIED','DISCARDED','SKIP']`; with active `OFFER`, `OFFER` is in `shown`. `displayCompany('acme') === 'Acme'`, `displayCompany('example-labs') === 'Example Labs'`, `displayCompany('Initech') === 'Initech'`, `displayCompany('OpenAI') === 'OpenAI'`. `compactLocation('US - Seattle · Seattle · United States') === 'Seattle, United States'`; `compactLocation('Remote') === 'Remote'`.
- [ ] **Step 2: Run** both suites. Expected: FAIL.
- [ ] **Step 3: Implement.** Add above `displayCompany`: `// shortcut: capitalizes slugs and cannot restore an acronym or a brand's own casing; replace with a real name source when the sweep records one.`
- [ ] **Step 4: Run** both suites plus `inbox-parse`, `inbox-sort`, `pipeline-*`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): the pipeline inbox starts at the top and labels estimates`.

### Task 15: Explore (U13, U14)

**Files:**
- Modify: `web/src/components/explore/filter-builder.tsx` (preset radio at ~137, Exclude at ~159)
- Test: `web/tests/lib/employer-preset.browser.test.mjs` (update selectors)

Layout: the Exclude field collapses to one row, `{n} exclusions` followed by the first five values in faint text, with an `Edit` button that expands the existing `KeywordField`. The discovery-source radios move inside the existing `More location controls & scan depth` disclosure. The scan button stays directly under the Posted-within row.

- [ ] **Step 1: Update the browser test** so it opens the disclosure before choosing the China preset, and add an assertion that at 1280 by 900 the scan button's bottom edge is inside the viewport with the default filters loaded.
- [ ] **Step 2: Run** the browser suite. Expected: FAIL on the new assertion.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the browser suite and `WEB_TEST employer-preset.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): Explore keeps the scan button on the first screen`.

### Task 16: Portals (U17)

**Files:**
- Create: `web/src/lib/portals-view-model.mjs`
- Modify: `web/src/app/api/portals/verify/route.ts`, `web/src/app/portals/page.tsx`, `web/src/components/portals-view.tsx` (`WatchedList` at 167)
- Test: `web/tests/lib/portals-view-model.test.mjs`, `web/tests/lib/portals-route.test.mjs`

**Interfaces:**
- Produces: `filterPortals(companies, { query, tab, health }) -> companies`, where `tab` is `'scanned' | 'paused' | 'attention'` and `health` is `{ [name]: { status, detail } }`; `scanned` is enabled, `paused` is not enabled, `attention` is enabled with health status `broken`; `query` matches name or host case-insensitively. `portalCounts(companies, health) -> { scanned, paused, attention }`. The verify route writes `{DATA_ROOT}/data/portal-health.json` as `{ checkedAt: ISO string, companies: [{ name, status, detail }] }` after a successful check, and the page reads it. A missing file means no health; a file that fails to parse is an error surfaced on the page, not treated as missing.

Layout: `Tabs` (Scanned, Paused, Needs attention) with counts, a search input, and on each row a status dot and `{detail} · checked {formatWhen(checkedAt)}` under the name once a check has run.

- [ ] **Step 1: Write the failing tests:** from five companies (three enabled, one of them `broken`, two paused), `portalCounts` is `{ scanned: 3, paused: 2, attention: 1 }`; `filterPortals(…, { tab: 'attention' })` returns the broken one; `query: 'ASHBY'` matches a host of `jobs.ashbyhq.com`; an empty `health` gives `attention: 0`.
- [ ] **Step 2: Run** the suite. Expected: FAIL.
- [ ] **Step 3: Implement.** Write the health file atomically (temp file, then rename).
- [ ] **Step 4: Run** both suites and `portals-config`, `portals-empty-copy`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): Portals can be searched and filtered, and keeps its last health check`.

### Task 17: Board and Analytics (U23, U19)

**Files:**
- Modify: `web/src/lib/board.mjs` (`groupByColumn(rows, meta)` at 45), `web/src/components/board/column.tsx`, `web/src/components/board/card.tsx`, `web/src/lib/analytics-metrics.mjs` (`funnelBarModel(stage, tracked)` at 135), `web/src/components/analytics-view.tsx` (97-104)
- Test: `web/tests/lib/board.test.mjs`, `web/tests/lib/funnel-bar-model.test.mjs`

**Interfaces:**
- Produces: within a board lane, rows sort by numeric score descending, with unscored rows last and input order kept on ties. `splitAtApplyLine(rows, threshold = 3.5) -> { above, below }` for the Evaluated column. `funnelBarModel` rows gain `now: number`, the count of rows currently in that status, beside the existing cumulative count.

Layout: the Evaluated column shows `above`, then one button `{n} below the apply line` that expands `below`. Cards in the Evaluated column drop the `Not applied` text. The funnel shows two right-hand columns headed `Ever reached` and `There now`, and its bars use `bg-brand`.

- [ ] **Step 1: Write the failing tests:** scores `['2.0/5','4.0/5','N/A','3.6/5']` sort to `4.0, 3.6, 2.0, N/A`; `splitAtApplyLine` puts 4.0 and 3.6 in `above`; for a tracker with three rows in Applied and six that moved past it, the Applied funnel row has cumulative `9` and `now: 3`.
- [ ] **Step 2: Run** both suites. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both suites and `analytics-metrics`, `funnel-tiles`, `analytics-view-model`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): the board sorts by score and the funnel shows current counts`.

### Task 18: Documents and Follow-ups (U20, U18)

**Files:**
- Create: `web/src/lib/document-titles.mjs`
- Modify: `web/src/lib/documents.ts` (list at ~117-164), `web/src/app/documents/page.tsx` (~98-167), `web/src/components/followups/followups-view.tsx` (`NarrativeCard` at 348, `FollowupRow` at 376)
- Test: `web/tests/lib/document-titles.test.mjs`

**Interfaces:**
- Produces: `documentTitle(doc, applications) -> { title: string, subtitle: string, trackerN: string | null }`. When `doc.reportId` matches a tracker row's report number, `title` is the company, `subtitle` the role and `trackerN` the row number. Otherwise `title` is `doc.filename`, `subtitle` is `''` and `trackerN` is `null`.

Layout: each Documents card shows the title, the subtitle, then `{CV|Cover letter} · {formatDay(date)}`, with `Open PDF` and, when `trackerN` is set, `Open role` linking to `/pipeline/{trackerN}`. The template badge is removed. On Follow-ups, `NarrativeCard` renders only when more than five follow-ups are active, the role cell wraps and no longer truncates, and the table container scrolls horizontally inside the page frame.

- [ ] **Step 1: Write the failing tests:** a doc with `reportId: 42` and a tracker row whose report link is `042-fabrikam-…` gives `{ title: 'Fabrikam', subtitle: 'Engineering Manager - Network Infrastructure- US', trackerN: '42' }`; a doc with `reportId: null` gives its filename and `trackerN: null`.
- [ ] **Step 2: Run** the suite. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the suite and `documents*.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): documents are titled by company and role`.

### Task 19: Settings (U25)

**Files:**
- Create: `web/src/lib/settings-changes.mjs`
- Modify: `web/src/components/settings/settings-view.tsx` (sections at ~116-160), `web/src/app/config/page.tsx`
- Test: `web/tests/lib/settings-changes.test.mjs`, `web/tests/lib/settings-view-wiring.test.mjs` (update)

**Interfaces:**
- Produces: `pendingChanges(draftByGroup, savedByGroup) -> { count: number, groups: { id: string, changes: object }[] }`, listing only keys whose draft value differs from the saved value.

Layout: the page uses the `wide` frame as a two-column grid. The left column, 200px and sticky, lists the sections as anchor links: AI engine, Scanner and filters, Automation and evaluation, Profile preferences, Follow-up cadence, Integrations, Model runners, Keys and tokens, Deployment. The per-section `Save {group}` buttons are removed. One bar is fixed to the bottom of the content column whenever `count > 0`, reading `{count} unsaved change(s)` with `Discard` and `Save changes`; saving sends each changed group through the existing `send(group, changes, "Saved.")` in order and stops at the first failure, leaving the unsent groups pending. The AI-engine `Save config` button and the cadence `Save cadence` button are unchanged, since they write to different stores.

- [ ] **Step 1: Write the failing tests:** two groups with one changed key each give `count: 2` and two `groups`; a draft equal to saved gives `count: 0` and `groups: []`; a key changed and changed back is not counted.
- [ ] **Step 2: Run** the suite. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the suite and `settings-route`, `settings-form`, `settings-state`, `saved-settings-off`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): Settings has a section list and one save bar`. Add the deviations rows for this phase.

---

## Phase 7: The CV page (M6, M7, M8, U4, U21, U22)

Branch `feat/web-cv-page`.

### Task 20: Read `###` entries in Education and Volunteer

The hardest task in the plan. Give it to the strongest model.

**Files:**
- Modify: `lib/resume/to-cv-md.mjs` (`SECTION_ROWS.education` at ~158, `volunteer`, `resumeToCvMarkdown`), `lib/resume/absorb.mjs` (`absorbList` at ~422, `parseEntries` at ~154), `lib/resume/schema.mjs` (`parseResume` at 56)
- Test: `tests/resume-absorb-entry-sections.test.mjs`

**Interfaces:**
- Produces: a section in `resume.json` may carry `layout: 'entries'`. When a list-kind section's lines include a `###` heading, `absorb` reads the whole section with the entries grammar (`### {name} — {location}`, an optional `**{bold line}**`, an optional period line, then prose) and sets `layout: 'entries'`. `resumeToCvMarkdown` writes a section with that layout back in the same grammar. Field mapping reuses each section's existing item fields: for Education the heading name is the school, the bold line the degree, and the period line the period; for Volunteer the heading name is the organization, the bold line the position, and the prose the description.

- [ ] **Step 1: Write the failing tests** with this exact input:

```md
## Education

### Example State University — Springfield, IL
**Associate's - Business Administration**
Aug 2010 – May 2012

## Volunteer

### Example Food Bank
2023 – Present

Provide IT support for a local nonprofit.
```

Assert: `absorb(md, null).report.unparsed` is `[]`; `lossless` is `true`; the education section has one item whose school is `Example State University`, location `Springfield, IL` and period `Aug 2010 – May 2012`; the volunteer section has one item whose organization is `Example Food Bank` and period `2023 – Present`; `resumeToCvMarkdown(result.data)` equals the input after the module's own `normalizeForCompare`. Then the Review Focus case: an Education section holding one `###` entry followed by one bullet `- BS, State University, City (2005)`. Assert that every non-blank input line is either represented in `data` or present in `report.unparsed`, and that `lossless` is `false` when anything is in `unparsed`. Then: the existing bullet-only Education fixture in `tests/fixtures/resume/cv-example-shape.md` still absorbs with no `layout` key.
- [ ] **Step 2: Run** `ROOT_TEST resume-absorb-entry-sections.test.mjs`. Expected: FAIL, three unparsed lines in Education.
- [ ] **Step 3: Implement.** Accept the optional `layout` key in the schema with the single value `'entries'`.
- [ ] **Step 4: Run** the new file and every `tests/resume-*.test.mjs` and `tests/cv-markdown-*.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(resume): read heading-style entries in Education and Volunteer`.

### Task 21: Download the master CV as a PDF

**Files:**
- Create: `web/src/app/api/cv/pdf/route.ts`, `web/src/lib/cv-master-pdf.mjs`
- Test: `web/tests/lib/cv-master-pdf.test.mjs`

**Interfaces:**
- Consumes: the HTML that `POST /api/resume/preview` returns for the absorbed resume data (`renderCv` in `web/src/lib/cv-render.ts`), and `spawnGeneratePdf({ spawnFn, execPath, coreRoot, html, finalPdf, format, reportNum })` in `web/src/lib/pdf-render.mjs:96`, which runs the root `generate-pdf.mjs`. Read it first: if it requires `reportNum`, make that argument optional there, and do not call `markTrackerReady` or `renderAndMarkPdf`, which write the tracker.
- Produces: `GET /api/cv/pdf` responding `200 application/pdf` with `Content-Disposition: attachment; filename="{slug}-cv.pdf"`. `masterPdfFilename(fullName) -> string`, lowercased, non-alphanumerics collapsed to `-`, falling back to `cv.pdf` for an empty name. The route responds `409` with `{ error: "cv.md could not be read cleanly" }` when the absorb is not lossless and `404` when `cv.md` is missing.

The route renders into a fresh temp directory outside the data root and removes it when the response ends. It writes nothing under `output/` and does not touch the tracker or the PDF index. No agent runs.

- [ ] **Step 1: Write the failing tests:** `masterPdfFilename('Ada Lovelace') === 'ada-lovelace-cv.pdf'`; `masterPdfFilename('') === 'cv.pdf'`; `masterPdfFilename('Zoë  O’Neil') === 'zo-o-neil-cv.pdf'`. With the module's spawn function stubbed: a lossless absorb calls it once with an `.html` input and a `.pdf` output in the same temp directory; a lossy absorb calls it zero times.
- [ ] **Step 2: Run** the suite. Expected: FAIL.
- [ ] **Step 3: Implement.** A root suite that really launches Chromium declares `toolRequired('browser')` from `tests/required-tools.mjs`; a web suite that does belongs in the browser suites instead.
- [ ] **Step 4: Run** the suite and `cv-render`, `cv-studio-render`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): download the master CV as a PDF`.

### Task 22: One CV page with Preview and Edit

**Files:**
- Create: `web/src/lib/cv-attention.mjs`, `web/src/components/cv/cv-page.tsx`
- Modify: `web/src/app/cv/page.tsx`, `web/src/components/cv-editor.tsx` (~165-250), `web/src/components/resume/gate-panel.tsx` (85-166), `web/src/app/resume/page.tsx`, `web/src/lib/nav-items.ts`
- Test: `web/tests/lib/cv-attention.test.mjs`, `web/tests/lib/layout-shell.browser.test.mjs` (add `/cv` cases)

**Interfaces:**
- Consumes: `GET /api/resume` (`{ data, report: { unparsed: { line, text }[] }, lossless }`), `POST /api/resume/preview`, `CvPreview({ html })`, `GET /api/cv/pdf` from Task 21, `Tabs` from Task 11.
- Produces: `attentionSummary(report, cvMarkdown) -> { count: number, sections: { name: string, line: number }[], firstLine: number | null }`, where each unparsed line is assigned to the nearest `## ` heading above it, `sections` holds one entry per distinct heading with its first unparsed line, and `count` is `sections.length`.

Layout, per the CV screen in `mockups.html`:
- Header actions: `Upload PDF or TeX`, and a primary `Export` menu with `Download PDF` (links to `/api/cv/pdf`) and `Print` (calls `print()` on the preview iframe's window).
- When `count > 0`, a full-width banner button above the tabs reads `{count} section(s) need attention.` then `{names with lines} could not be read, so they may be missing from tailored CVs.` and ends with `Fix in editor →`. Pressing it switches to Edit, focuses the textarea and selects line `firstLine`.
- `Tabs`: `Preview` (default) and `Edit`. The tab is mirrored in the URL as `?tab=edit`.
- Preview renders `CvPreview` with a faint caption `Page 1 of {n} · {format} · rendered from cv.md`. When the absorb is not lossless it shows the existing markdown preview and disables `Download PDF`.
- Edit holds the existing markdown editor beside the live preview. Both panes are `h-[calc(100vh-16rem)] overflow-auto`, so each scrolls on its own (U22). A `Structured editor` link under the panes renders the existing `ResumeEditor`.
- `gate-panel.tsx` no longer prints entry ids.
- `/resume` redirects to `/cv?tab=edit`, and the Resume nav item is removed from `nav-items.ts`.

- [ ] **Step 1: Write the failing tests:** for a `cv.md` where line 60 is `## Education` and line 80 is `## Volunteer`, a report with unparsed lines 68, 70, 71, 85, 86 and 88 gives `{ count: 2, sections: [{ name: 'Education', line: 68 }, { name: 'Volunteer', line: 85 }], firstLine: 68 }`; an empty `unparsed` gives `{ count: 0, sections: [], firstLine: null }`; an unparsed line above the first heading is assigned the name `Header`. In the browser suite, on `/cv`: the active tab is `Preview`; an `Export` control exists; the preview document's headings never skip a level; with a stubbed lossy response the banner is present, and pressing it makes `Edit` the active tab.
- [ ] **Step 2: Run** `WEB_TEST cv-attention.test.mjs` and the browser suite. Expected: FAIL.
- [ ] **Step 3: Implement.** Update `navGroups` expectations in `nav-items.test.mjs` so Profile is `CV, Documents, Shares`.
- [ ] **Step 4: Run** both, plus `resume-route`, `resume-gate-routes`, `resume-form` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): one CV page with a PDF preview, export and an attention banner`. Add the deviations rows for this phase.

---

## After the last phase

- [ ] Release and deploy on Jason's go, then walk the thirteen pages at `https://career.matherly.net` against `mockups.html` and record what differs.
- [ ] Re-run the measurements from the spec on `/pipeline` at a 798px viewport. Expected: no text under 12px and no control under 24px.
- [ ] Force the weekly sweep once and confirm from the pod that the summary prints `Tier-filtered:` and `Salary-filtered:`, that a role scoring 4.0 or higher has a PDF in `/data/output/`, and that estimates for software-engineer titles fall under 3.5.

## Not in this plan

- S4, skip seniority levels: left unset by decision.
- S5, follow-up cadence: the defaults stand until Jason asks for different numbers.
- H1 and H2: owned by the home-cluster session.
- Moving Shares into Documents, a display-name source for swept company slugs, local-time "Added" dates, phone-width and light-mode review, and the report, apply and job detail pages.
