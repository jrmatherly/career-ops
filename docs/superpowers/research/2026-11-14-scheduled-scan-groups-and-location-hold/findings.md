# Scheduled scans: source groups and a location hold on auto-evaluation

Research for `docs/superpowers/plans/2026-11-14-scheduled-scan-groups-and-location-hold.md`. Read on `main` at 1f2a2852 (career-ops 2.3.1), 2026-11-14. Every file and line below was read in the code unless it is marked unverified.

## What the owner asked for

1. **Choose which sources run on which scan.** Heavy sources should be able to run on a weekly scan and light ones daily, so adding sources does not overwhelm a daily run.
2. **Hold auto-evaluation by location.** Auto-evaluate only postings confirmed remote or in the home area. A posting anywhere else that matches the titles must not be dropped. It stays in the Inbox, ranked, marked as held, for a decision by hand.

## Decisions already made

| Decision | Answer | Source |
|---|---|---|
| What happens to a held posting | It is ranked and not evaluated | Owner, 2026-11-14 |
| Dropping postings outside the home area at scan time | No. Missing them is worse than triaging them | Owner, 2026-11-14 |
| Auto-evaluation caps (per run, per day) | Decided after the hold ships, since the hold shrinks the queue | Owner, 2026-11-14 |
| One PR or two | One branch and one PR for both features | Owner, 2026-11-14 |
| Where the work is built | A fresh session, from the plan | Owner, 2026-11-14 |

## What exists today

### A scheduled scan reads every enabled source

- `buildScanCommand` (`web/scripts/scheduled-jobs-runner.mjs:119`) runs `scan.mjs --since N --quiet` for the `portals` engine. It passes no source selection.
- `scan.mjs` reads `tracked_companies` and `job_boards` (`:4666`) and skips an entry only on `enabled: false` (`resolveEntries`, `:4748`). `--company` takes one value and matches by substring (`:4744`), so it cannot carry a list.
- No entry key for a tag, group or cadence exists in `templates/portals.example.yml` or `scan.mjs`. An extra `group:` key on an entry passes `validate-portals.mjs` (0 errors, 0 warnings) and a dry-run scan with no warning (run 2026-11-14 on a scratch root).
- A `custom` job gets a temporary portals file: `jobPortals(job, base)` (`:210`) overrides the six lists in `FILTER_LISTS` (`:175`) and `writeJobPortals` (`:232`) writes it. A `file` job (`filtersFrom === "file"`) uses `portals.yml` itself with no overlay (`:267`, `:281`).
- The `full` engine reads no entries from `portals.yml`. Its companies come from the public ATS datasets (`scan-ats-full.mjs:1451`). Source selection does not apply to it.

### Auto-evaluation queues every ranked row above the threshold

- `rankJob` (`web/scripts/scheduled-jobs-runner.mjs:467`) ranks the rows a job's scan added, then, in `auto` mode only (`:508`), hands them to `queueCandidates`.
- `queueCandidates(root, { jobId, runId, rankThreshold, autoJobIds }, rows)` (`lib/evaluate-queue.mjs:158`) writes one ledger row per URL: `queued` when `rank >= rankThreshold`, else `skipped` with reason `below-threshold` or `unranked`. A URL already in the ledger is left alone (`:165`).
- The drain takes only waiting rows (`drainPlan`, `lib/evaluate-queue.mjs:135`) of jobs in `auto` mode (`autoJobs`, `web/scripts/evaluate-drain.mjs:36`). A `skipped` row is never drained.
- `review` mode ranks and writes no ledger row. Nothing is evaluated.

### The location decision already exists as a scan-time drop

- `buildWorkplacePolicy(policy)` (`providers/_country.mjs:180`) returns a gate `(location, title, offer) => { eligible, reason }`. Its policy takes `onsite_locations` and `remote_countries` (both required, nonempty lists) and optional `onsite_countries` and `remote_regions`. `docs/WORKPLACE_GEOGRAPHY.md` documents it.
- Today it is used only through `location_filter.workplace_policy`, where an ineligible posting is dropped at scan time (`scan.mjs:757`). The owner does not want that drop.
- The gate needs only a location and a title. `/api/whats-new` already calls it that way (`web/src/app/api/whats-new/route.ts:60`).
- A posting's location at queue time: the `location` column of its `data/scan-history.tsv` row (`lib/scan-history-columns.mjs:41`). `rankJob` already holds `scanHistoryRows`. `candidatesFor` (`web/src/lib/core/evaluate-candidates.mjs:66`) joins them to pending rows by `normalizeUrl`.

### The Inbox already marks rows from the ledger

- `markGated(jobs, ledgerEntries)` (`web/src/lib/inbox-pending.mjs:55`) sets `gated` on a pending job from a ledger row, called at `web/src/app/pipeline/page.tsx:35`. `triage-row.tsx:91` shows it as a badge.
- A pipeline row's labelled segments (`posted`, `trust`, `yrs`, `note`, `rank`) are a fixed list in four files (`web/src/lib/pipeline-table.mjs:31`, `scan.mjs:2192`, `sync-batch-input.mjs:175`, `web/src/lib/core/evaluate-candidates.mjs:12`). A mark that comes from the ledger touches none of them.

## Measurement: the existing gate on real scan history

Run on the hosted instance, 2026-11-14, read-only. Policy: four home-area place names as `onsite_locations`, one country as `remote_countries`. Input: every `added` row of `data/scan-history.tsv`, once per URL.

| Result | Rows |
|---|---|
| Eligible (would auto-evaluate) | 214 |
| Held | 1,300 |
| Total | 1,514 |

| Held because | Rows |
|---|---|
| `onsite_outside_allowed_locations` | 1,149 |
| `onsite_country_restricted` | 62 |
| `remote_country_restricted` | 30 |
| `remote_eligibility_unconfirmed` | 29 |
| `location_unknown` | 28 |
| `exclusive_foreign_country` | 2 |

- Eligible locations read as intended: `Remote (United States | Canada)`, `USA Remote`, `US, Remote · United States`.
- The gate is conservative. A bare `Remote`, a blank location, and a state-limited remote label such as `Remote-MO` are all held. That is the safe direction here, because a held row is still ranked and visible.
- One false hold seen: a location listing many `Remote-<state>` labels that includes the home state. It is held, and the owner decides by hand.
- The counts above were taken before the US-state defect below was found. They used a policy that also listed the home state by name, which hid part of it.

## Measurement: US states

The gate reads a two-letter state code as the ISO country with the same letters, and "Georgia" as the country. Run locally on `main`, policy `remote_countries: [United States]`:

| Location | `onsite_locations` | Result |
|---|---|---|
| `Los Angeles, CA` | `[Los Angeles]` | `onsite_country_restricted` (Canada) |
| `Denver, CO` | `[Denver]` | `onsite_country_restricted` (Colombia) |
| `Chicago, IL` | `[Chicago]` | `onsite_country_restricted` (Israel) |
| `Boston, MA` | `[Boston]` | `onsite_country_restricted` (Morocco) |
| `Austin, TX` | `[Austin]` | eligible |
| `Indianapolis, IN` | `[Indianapolis]` | eligible |

The cause is `countries(loc, true)` in the on-site check (`providers/_country.mjs:278`) and in the remote check (`:286`). `scan.mjs` already knows the states (`USPS_STATES`, `US_STATE_NAMES_ALSO_COUNTRIES` and the matcher `compileUsStateAbbrev`, `:525-632`) but the gate does not use them. That matcher already keeps `in`, `or` and `me` from reading as states and treats the last part of `City, Region, CC` as a country.

On the hosted instance, a prototype rewrote an attached state code or state name to the United States before calling the unchanged gate. Both columns use one policy (three home-area cities as `onsite_locations`, one country) over the same 1,514 rows:

| | Gate as it is | With the prototype |
|---|---|---|
| All rows eligible | 212 | 296 |
| Rows that moved from held to eligible | | 84 |
| Rows that moved from eligible to held | | 0 |
| Rows naming a home-area city that are eligible | not measured with this policy | 87 of 91 |

The four home-area rows still held are a store address with no place part, a long multi-city list with a bare `Remote`, and one address the prototype's token rule did not reach. A state name alone in its segment (`Poland · Georgia · Bulgaria · Remote`) stayed the country and stayed held.

## Hazards for the build

- **Fixed key lists drop new fields.** `JobFields` and the result object in `web/src/lib/scheduled-jobs.ts:65` and `:136`; `scheduledJobBody` (`web/src/lib/scheduled-job-body.mjs:12`); the four-key return of `scheduledEvaluate` (`web/src/lib/scheduled-job-input.mjs:37`); `evaluateBody`, `clampEvaluate` and `evaluateForm` (`web/src/lib/evaluate-settings.mjs:14`, `:77`).
- **`parseExplorePatch` is shared with the Explorer** (`web/src/lib/explore.ts:142`). A job-only setting must not be added to `ExploreFilters`.
- **`KeywordField` is not exported** (`web/src/components/explore/filter-builder.tsx:32`). The job modals need it for two new chip fields.
- **The edit modal rebuilds `filters` from a hand-written list** (`web/src/components/scheduled-scans/edit-job-modal.tsx:45`).
- **A `file` job has no overlay.** Once any entry carries a group, a `file` job needs one too, or it scans every group. A runner test pins today's no-overlay behavior (`web/tests/lib/scheduled-jobs-runner.test.mjs:267`).
- **The store does not validate `filters` or `evaluate`** (`validateScheduledStore`, `web/src/lib/scheduled-jobs-store.mjs:59`), so a hand-edited job can hold a bad policy. The runner has to fail closed on one.
- **A held row is not weighed again.** `queueCandidates` skips a URL already in the ledger, and a rank pass only looks at rows since the job's previous run. Changing the hold later does not release older held rows. They are evaluated by hand from the Inbox.
- **`cleanChips` trims** (`web/src/lib/clean-chips.mjs:32`). On the hosted instance two title negatives saved through the job form lost a trailing space. Place names and group names do not depend on one.

## Not verified

- How often the `location` column of a scan-history row is blank where the pipeline row's location cell is not.
- Whether the Portals page (`web/src/lib/portals-config.mjs`) keeps an unknown `group:` key when it edits an entry. The plan adds a test for it.
- The internals of `web/src/components/scheduled-jobs-view.tsx` and `run-history-drawer.tsx`.
