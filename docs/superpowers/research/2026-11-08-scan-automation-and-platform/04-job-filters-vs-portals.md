# Thread 4. Scheduled jobs that use the file's filters

Read-only investigation, 2026-11-08. Claims are labelled measured, inferred or guess.

## How a job's filters reach the scanners

A scheduled job stores `filters: ExploreFilters` with `positive`, `negative`, `allow`, `block`, `blockHard`, `alwaysAllow`, `sinceDays`, `ats` and `limitPerAts` (measured, `web/src/lib/scheduled-jobs.ts:17-33`, `web/src/lib/explore.ts:22-34`). Before each attempt `writeJobPortals` in `web/scripts/scheduled-jobs-runner.mjs:145-180` reads `<root>/portals.yml`, overlays the job's lists and writes a temp file under `data/tmp/`, and `executeJob` passes it as `CAREER_OPS_PORTALS` to `scan.mjs` or `scan-ats-full.mjs`, which read `PORTALS_PATH` from that variable (measured, `scan.mjs:121`, `scan-ats-full.mjs:74`). The command line carries only `--since`, `--ats`, `--limit` and output flags (measured, `buildScanCommand`).

The overlay is where the drift lives (measured, runner lines 152-173):

- `positive` falls back to the file's list when the job's is empty, and the run fails when both are empty.
- `negative` is always the job's list; the file's negative list, including the template's junior and intern entries, is never inherited.
- `location_filter.allow`, `block`, `block_hard` and `always_allow` are replaced wholesale by the job's lists, so a job with empty lists turns the allow-list off and drops the file's `always_allow` and `block_hard`.
- `title_filter_full` is overwritten with the job's title lists, so the full engine's separate list is clobbered too.
- Every other key passes through from the file.

The job's copy is seeded once. Explore's Schedule button snapshots the live Explore filters, which `seedExploreFilters` read from `portals.yml` when the page loaded, with the note "Seeded from your portals.yml — edit freely" (measured, `web/src/components/explore/schedule-job-action.tsx`, `web/src/lib/core/portals.ts:83-114`, `filter-builder.tsx:149`). The create modal starts blank (measured). Nothing links a job back to the file afterwards, and no sync affordance exists (measured, grep). The per-job copy arrived with the scheduled-jobs feature itself in commit 85b67f52 with no stated reason (measured, `git log -S`). The pre-dashboard cron ran plain `node scan.mjs`, which read the file (measured, `docs/AUTOMATION.md:68-123`).

There are two smaller inconsistencies (measured). The runner reads `path.join(root, "portals.yml")` while the web's `portalsConfigPath(root)` honours `CAREER_OPS_PORTALS`; and the full engine's checkpoint fingerprint includes the filters, so a `--resume` after an overlay change aborts with "changed since the checkpoint" (`scan-ats-full.mjs:189-203`).

Tests pin the positive fallback and the `blockHard` and `alwaysAllow` mapping (measured, `web/tests/lib/scheduled-jobs-runner.test.mjs:118-153`). No test covers the negative or location wipe (measured).

## Does "use the file's filters" earn its place

Yes (inferred). The operator's review found the daily job carrying a stale copy; the cheapest correct state for a job that should track the file is no overlay at all, which is what the scanners already do when `CAREER_OPS_PORTALS` is unset. The change is one field, one branch in the runner and a toggle in two modals. The wipe of `negative`, `always_allow` and `block_hard` for a custom-filter job is a separate defect; it should inherit the file's lists when the job's are empty, the way `positive` already does, and a test should pin it.

## Data shape

`filtersFrom: "file" | "custom"` on the job, default `"custom"` so stored jobs keep their meaning (inferred). `parseScheduledJobInput` must accept it, because unknown keys are dropped there (measured, `scheduled-jobs.ts:90-113`). `validateScheduledStore` ignores unknown fields, so no store migration is needed (measured). With `"file"` the runner skips `writeJobPortals`, leaves `CAREER_OPS_PORTALS` to the environment, and keeps `sinceDays`, `ats` and `limitPerAts` on the command line, since `portals.yml` has no equivalent for the last two (measured, no such keys). The job card shows "uses portals.yml" instead of the positive list.

## Alternatives considered

- Re-seed every job from the file on each run while keeping the copy. Keeps two sources that must agree and still needs the toggle to say which wins (inferred).
- Drop per-job filters entirely. Breaks the Explore-to-job flow that snapshots a one-off search (measured, `schedule-job-action.tsx`).
- A sync button that copies the file into the job. Drift returns the day after (inferred).

## Recommendation

Add `filtersFrom` with a `file` value and the runner branch, fix the inheritance of `negative`, `always_allow` and `block_hard` for custom jobs, make the runner read `portalsConfigPath(root)`, and pin all three with tests. Fold it into the plan as a small PR that lands before the evaluate chain, so the first review-mode runs see the operator's curated filters.

## Open question for the operator

- Should the two existing jobs on the claim switch to `file` once the field exists? That is a dashboard edit, not a code change.
