# portals.yml P1 fixes and PR-19 lane 9 (2026-11-07, 23:38 to 23:55 EST)

Side session of the convergence coordinator. The task: apply the three P1 defects the read-only `portals.yml` review measured (bare "Remote" dropped by the location filter, nine enabled `websearch` entries never scanned unattended, substring negatives dropping target titles), mirror the filter changes into both scheduled jobs, and run lane 9 of the PR-19 verification (the `volume-backup` CronJob). Every claim below was re-checked on 2026-11-08 00:05 EST before this file was written; where a re-check changed the picture, the section says so.

What changed is operator configuration only: `~/career-ops-data/portals.yml` (backup `portals.yml.bak-2026-11-07-before-p1` beside it), the same file on the `career-ops-data` claim, and the two jobs in `/data/data/scheduled-jobs.json` through the dashboard. No system-layer file was touched.

## 1. portals.yml

43 changed lines against the backup (`diff -u`, measured).

| Area | Before | After |
| --- | --- | --- |
| `location_filter.allow` | United States, USA, US, Atlanta | plus `Remote` |
| `location_filter.block` | absent | EMEA, Europe, APAC, Asia, LATAM, Latin America, India, United Kingdom, UK, Canada, Germany, Ireland, France, Brazil, Poland, Israel, Australia, Singapore, Mexico, Philippines |
| `location_filter.always_allow` | United States, USA, US, Atlanta | unchanged |
| `title_filter.negative` | `Sales`, `Lease`, `Growth`, `word:Software Engineer`, `word:Software Engineers` | `word:Sales`, `word:Lease`, `word:Growth`; the two software-engineer negatives removed |
| OpenAI | `openai.com/careers`, `scan_method: websearch` | `https://jobs.ashbyhq.com/openai`, `max_response_mb: 20` |
| Twilio | `jobs.twilio.com`, websearch | `https://job-boards.greenhouse.io/twilio` |
| Dialpad | `dialpad.com/careers`, websearch | `https://job-boards.greenhouse.io/dialpad` |

Plain `block`, not `block_hard`: `block_hard` beats `always_allow` and would drop "Remote - US or India" (measured in the review's `loc2.mjs`).

`max_response_mb` was not in the brief. The first audit of the repointed OpenAI entry returned `error: HTTP body exceeded maxBytes of 10485760`; `curl` measured the Ashby board at 13,677,746 bytes. `lib/entry-response-cap.mjs` reads a per-entry `max_response_mb` and `scan.mjs` applies it (`applyEntryResponseCap(ctx, company)` at scan.mjs:5020), so the scanner, not only the audit, gets the raised cap. Without it the repoint would have turned a never-scanned entry into an always-erroring one.

Checks run (all measured):

- `CAREER_OPS_ROOT=~/career-ops-data node validate-portals.mjs`: 0 errors, 0 warnings.
- `audit-portals.mjs --json` on a three-entry overlay (`CAREER_OPS_PORTALS=<overlay>`; the overlay's top-level key must be `tracked_companies`, an empty list comes back under `companies`): OpenAI ok ashby 818, Twilio ok greenhouse 128, Dialpad ok greenhouse 15.
- `kubectl cp` to `/data/portals.yml`, then `sha256sum` in the pod: `4b354fd56b7ecd3a18c177589ef0ee44ed092a3fe6d66f95b5b40a197c82ac06`, identical to the Mac copy. Re-checked on the replacement pod after the roll in section 5: same hash, so the claim held it.

## 2. Probe evidence

The probes call `buildLocationFilter` (scan.mjs) and `buildTitleFilter` (title-keywords.mjs) directly on the file, no live scan. Title column labels: POS means a positive matched, negOK means no negative fired.

Location, after:

| Location | Result | Note |
| --- | --- | --- |
| Remote · Remote, Global · Remote - US · Remote - US or India · Atlanta, GA · London or New York | pass | all six the brief required |
| Nationwide Remote · Remote, AMER · Remote, Americas · Remote, Worldwide | pass | the `scan-history.tsv` misses the review found |
| Remote - India · Remote (EMEA) · Remote - UK · Toronto | drop | all four the brief required |
| Anywhere | drop | no `allow` term matches; a title ending in "- Remote" still rescues it through `remote_title_fallback` (default true) |

No block-list adjustment was needed.

Title, after:

| Title | Before | After | Why |
| --- | --- | --- | --- |
| Director of Salesforce Platform | drop (`Sales` substring) | PASS | |
| Director, Salesforce Infrastructure | drop | PASS | |
| Principal Software Engineer, Platform | drop (`word:Software Engineer`) | PASS | `principal + platform` positive |
| Director, Growth Infrastructure | drop | **drop** | the title contains the word Growth, so `word:Growth` still fires. Only removing Growth from the negatives rescues it. Not done; operator call. |
| Head of Release Engineering | drop | **drop** (negOK) | no positive matches; the review's P2 positives item, not a negative-list fix |
| Staff Software Engineer, Infrastructure | drop | **drop** (negOK) | `Staff Infrastructure` needs adjacency; same P2 item |
| Sales Engineer · Account Executive · Software Engineer · Senior Software Engineer · Software Engineer, Infrastructure / Platform / Backend / AI | drop | drop | no positive matches any of them, so removing the software-engineer negative admitted nothing |

The brief expected the three bold rows to pass. Two of the three cannot pass without new positives and the third cannot pass while Growth is a negative at all. That is a limit of the fix as specified, not a probe disagreement.

## 3. Scheduled jobs

The dashboard at `career.matherly.net/scheduled-scans` was already signed in through Pocket ID in the browser pane, so no operator step was needed. The Edit Scan form does carry the block list: `edit-job-modal.tsx` reuses `FilterBuilder` from Explore, whose "More location controls & scan depth" section has "Always include" (`alwaysAllow`), "Exclude locations" (`block`) and "Never include" (`blockHard`), per `web/src/components/explore/filter-builder.tsx:236-246`. The runner maps them onto `location_filter` in `writeJobPortals` (`web/scripts/scheduled-jobs-runner.mjs:166-172`), over a base loaded from the data root's `portals.yml`, so the tracked-companies edits in section 1 (OpenAI's cap included) reach the daily job too.

Both jobs were edited the same way: five Exclude chips removed, three `word:` chips added, `Remote` added to City or location, the 20 block entries added to Exclude locations. Read back by `kubectl cp` of `/data/data/scheduled-jobs.json` and diffed against the copy taken before:

| Field | Daily (portals, 7d) | Weekly (full, 30d) |
| --- | --- | --- |
| `allow` | + Remote | + Remote |
| `block` | 20 entries | 20 entries |
| `negative` | − Sales, Lease, Growth, word:Software Engineer, word:Software Engineers; + word:Sales, word:Lease, word:Growth | same |
| `alwaysAllow`, `blockHard`, positives (28), `sinceDays`, `limitPerAts` | unchanged | unchanged |

Write timing (measured from the file): the weekly run that was `running` at 04:30Z finished `success` at 04:42:05Z; the saves landed at 04:46:12Z and 04:48:21Z. No save overlapped a run.

## 4. Lane 9: volume-backup

`kubectl -n career-ops create job --from=cronjob/volume-backup lane9-backup-1794112777` was allowed. The Job completed 1/1 in 5 s. The `snapshot` init container logged nothing (its guard and `tar` are silent on success). The `upload` container log:

```
status: success
target: s3/home-cluster-volumes/volumes/career-ops/career-ops/career-ops-20261108T043939Z.tar.gz
version_id: 7e5e468b8bb337d5b1640d81e06761b1
size: 3,548,748 bytes (3.38 MiB)
```

Full log at `private/review/lane9-backup.txt` (gitignored). The Job was deleted afterwards; `kubectl get jobs` shows none named lane9. Not done: an independent bucket listing. `rc object find` needs the `volume-backup` secret, which means creating a pod, a cluster write outside the brief. The upload log's `status: success` with a version id is the evidence.

## 5. Found on re-check

- **The web pod rolled during the work.** `career-ops-779cd68866-gcsdd` was replaced by `career-ops-76cc576f85-qzhh2` at 04:49:17Z, one minute after the last job save. The claim is a PersistentVolumeClaim, so both `portals.yml` (same sha256) and the job edits (re-read from the new pod: `allow` has Remote, `block` has 20 entries, `word:Sales` present, `word:Software Engineer` absent on both jobs) survived. Any later session must re-resolve the pod by label (`app.kubernetes.io/name=career-ops`); the pod name in the coordinator brief was already stale.
- `scan.mjs` applies `max_response_mb` (scan.mjs:5020), so section 1's OpenAI cap is a scanner fix, not an audit-only one.
- The audit overlay key is `tracked_companies`; `companies` silently audits nothing.

## 6. For the operator

- Six enabled `websearch` entries still have no provider and are never scanned unattended: Talkdesk, Gong, Genesys, Salesforce, Shopify, Zendesk. Repoint each to its real ATS board or set `enabled: false`. Their Greenhouse and Lever slugs 404 (review's curl); the real boards are unverified.
- Decide whether `Growth` should stay a negative at all. With it, "Director, Growth Infrastructure" and "Head of Growth Platform Engineering" drop.
- The review's P2 positives (DevOps, cloud, platform engineering management, release engineering, staff-level software titles) are the next lever; the negative cleanup above only stops the wrong drops.
- The OpenAI board carries 818 postings and will add time to every daily run (inferred from the count, not measured).

## Not done

- No live `scan.mjs` run against the new config; the probes exercise the same functions on the same file.
- No bucket listing for lane 9 (see section 4).
- Trail rows in `decisions.tsv` are the coordinator's to append.
