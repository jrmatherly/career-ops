# RR applications vs career-ops tracker, field-level mapping

Subagent research report, 2026-11-06. Model output: claims carry file:line evidence or are labelled inference; verify against the code before relying on one.

NOTE: the Write tool refused the report file (policy: subagents return findings as text), so /private/tmp/.../scratchpad/tracker/report.md was NOT written. The full report is below. Read-only: nothing written in either repo. `RR/` = the RR clone `.../scratchpad/rr/repo`, `CO/` = /Users/jason/dev/career-ops. "Inferred" marks anything not read directly.

# RR v6 applications vs career-ops tracker: field-level mapping

## 0. Headline findings
1. career-ops ALREADY has a foreign-tracker importer: `CO/import-tracker.mjs` (425 lines). It reads a CSV (Teal, Huntr, Simplify), writes headed `N/A`-score TSVs through a reserved number, and runs `merge-tracker.mjs` (import-tracker.mjs:1-20, 336-375). An RR importer should extend this, not duplicate it.
2. Run unmodified on an RR CSV it loses or misstates: every `closed` row (stage unknown), every `saved` row (deliberately routed away from the tracker), `screening` (lands on Assessment), and Closed Reason, Tags, Salary, Source, Contacts, Stage Date. See section 5 and section 7.
3. There is no kanban or drag-drop in the web UI or Go dashboard (grep for `kanban|dnd-kit|draggable` over `web/src`, `web/package.json`, `dashboard/` found nothing). The pipeline is a virtualized table with tab filters and a per-row `StatusSelect`.
4. The RR CSV is lossy. The account-zip JSON is the faithful source: `applications.json` is the raw DB rows minus `userId` (RR/packages/api/src/features/auth/service.ts:106,123). Interview rounds, timezones and follow-up dates exist only there.

## 1. RR model

### 1.1 Application row (RR/packages/db/src/schema/applications.ts:52-121; exported verbatim as applications.json)
id, company*, role*, location, salary (free text), status (default `saved`), laneId, closedReason, resumeId, coverLetterId, sentResumeVersionId, sentCheckScore, sentCoverLetterVersionId, source, tags text[], sourceUrl, jobDescription, postingSource (JSON), requirements string[], matchScore, aiMetadata, notes, resumeFileUrl/Name, coverLetterUrl/Name, followUpAt, followUpDateOnly, followUpNote, contacts (JSON array), activity (JSON timeline array), trashedAt, appliedAt (not null, defaults to save time), submittedAt (first real submission, durable), createdAt, updatedAt.
- `appliedAt` is filled even for a job only saved. `submittedAt` is the honest "was it sent" marker and survives later moves to Saved or Closed (RR/docs/guides/exporting-your-data.mdx:47; db:112-114; `hasApplicationSubmission` schema data.ts:213-225).

### 1.2 Stages, reasons, timeline (RR/packages/schema/src/applications/data.ts)
- Stages: `saved, applied, screening, interview, offer, closed` (data.ts:6). `closed` replaced old `rejected` and `archived` (data.ts:5).
- Closed reasons: `accepted, not-selected, withdrew, accepted-other, no-response` (data.ts:44-50).
- Timeline union (data.ts:155-180), each with `id`, `at`:
  - `stage`: stage, laneId?, laneLabel?, closedReason?, canonicalTransition?, dateUnknown?, writeSequence?
  - `note`: text, followedUp?{stageEntryId, kind?:"reply"} (marks a sent follow-up, data.ts:172-174)
  - `interview`: kind (`screening|technical|behavioral|onsite|other`, data.ts:86), durationMinutes (5-1440, default 60), location, notes (<=5000), participants[] (name, role, profileUrl?, max 20, data.ts:99-124), audience (`recruiter|hiring-manager|practitioner|panel|other`, data.ts:126), timezone (IANA, default UTC, data.ts:128-134). `at` is the full scheduled start (data.ts:136-137).
- Contact (data.ts:66-77): name, role, type (free-form pill), email, phone.

### 1.3 Lanes (lanes.ts:9-18; db:16-48)
Lane = id, category (one of the 6 stages), label|null, color #hex, position, systemKey, closedReason (preset outcome), retiredAt. Max 40 (lanes.ts:5). Defaults are the 6 stages (lanes.ts:26-47). A row's lane must match its stage (lanes.ts:55-72). Exported as `application-stages.json` = `{revision, lanes[]}` (docs:35; account-zip.ts:93).

### 1.4 Next step and follow-up (next-step.ts, follow-up.ts)
- NextStep kinds: interview, follow-up, no-reply, waiting, interview-feedback, no-interview, offer, not-applied, closed (next-step.ts:43-56). No-reply threshold 10 days (next-step.ts:6). `needsAttention`: interview within 7 days, follow-up due within 1 day, no-reply, offer (next-step.ts:158-176).
- Follow-up: `followUpAt` + `followUpDateOnly` (date-only means that day at 09:00 in the user zone, follow-up.ts:6-14) + `followUpNote`.
- Offer `respondBy` drives the Offer next step (next-step.ts:23-41, 83-96).

### 1.5 Offers and career data (schema career.ts, db career.ts)
- Offers are `career_artifact` rows (db career.ts:71-86) with `data.kind="offer"` (career.ts:326-335) and OfferTerms (career.ts:149-177): version (`written|verbal`), currency, period (`hour|month|year`), base, variable, variablePercent, variableConditions, equity (text), location, officeDays, leave, learning, other, respondBy (ISO datetime), startDate; plus origin (`manual|message`), editedAt. Linked by applicationId.
- Notifications `career_notification` (notice JSON, readAt; db career.ts:128-142) are derived. Skip.
- Facts, stories, answers, workspace (db career.ts:48-70, 168-185) and saved AI results (career.ts:199-325): no career-ops equivalent worth importing. AI-written content must not enter career-ops generated content (AGENTS.md Source-of-Truth Boundary).
- The shape of `career.json` comes from `careerService.exportData` (RR/packages/api/src/features/career/service.ts). I did NOT read it. Inferred: offers sit under a saved-items key. Verify before coding.

### 1.6 Duplicate detection (RR/packages/api/src/features/applications/duplicates.ts:7-40)
Key = `canonicalOpportunityUrl(sourceUrl)` (posting-url.ts:1-29): http(s) only, no credentials, real host, hash dropped, LinkedIn `/jobs/view/` query stripped, tracking params stripped (utm_*, gclid, ref, source, token, etc.), remaining params sorted. Active rows only; a clash raises CONFLICT. RR has no company+role fallback. career-ops uses URL first (`url-key.mjs`), then fuzzy company+role.

## 2. RR export formats
### 2.1 Account zip (Settings > Account > Your data > Export everything)
Files (docs/guides/exporting-your-data.mdx:30-45): account.json, application-profile.json, applications.json, application-stages.json, resumes/, letters/, document-versions.json, versions/, career.json, ai-content-reports.json, feedback.json, uploads/, upload-manifest.json. Built at packages/utils/src/account-zip.ts:68-93. Docs: "an account backup, not a bulk-import file" (docs:70). Serialization (ISO timestamps, native JSON arrays) is inferred from Drizzle output; not checked against a real archive.

### 2.2 CSV export (web app only; RR/apps/web/src/features/applications/csv.ts:35-113)
Exact headers in order: `Company, Role, Stage, Lane, Lane Category, Lane Closed Reason, Stage Date, Application Date, Location, Salary, Source, URL, Job Description, Posting Source, Tags, Contacts, Notes, Closed Reason, Stage History, Timeline, Created At, Updated At` (csv.ts:35-58; same list at docs/guides/importing-applications-from-csv.mdx:133).
Cells: UTF-8 BOM, every cell quoted, CRLF, formula-like values prefixed with `'` (web csv.ts:111-112; schema csv.ts:479-484). Stage = stage id. Stage Date = date of the current stage entry (blank if unknown). Application Date = `appliedAt` only if sent (web csv.ts:76-86). Tags = `a; b`, or a JSON array when a tag contains `; , |` (web csv.ts:91-94). Contacts = lines `Name (role, type)`, no email or phone (web csv.ts:95-100). Stage History = `Applied (2026-07-01) → Screening (...)`. Timeline = `date: text` lines with interviews flattened to `Technical interview (ISO)`: no timezone, duration, participants or notes (web csv.ts:61-69, 106).

### 2.3 What RR's own CSV import accepts
Sample (schema csv.ts:11-12): `Company,Role,Stage,Application Date,Stage Date,Location,Salary,Source,Tags,Contact Name,Contact Email,Contact Phone`. Header aliases (csv.ts:161-201): company/employer/organization; role/title/position/job title; status/stage; applied date/application date/date applied/applied on; closed reason; stage date/stage entered at; location; salary/salary range/compensation; source; notes/note; url/link/job url/job posting; job description; posting source; tags; contact name/role/type/email/phone; archived; lane; lane category; lane closed reason. "Contacts", "Stage History", "Timeline", "Created At", "Updated At" are not mapped (the four present headers identify an RR export, csv.ts:313-315). Stage aliases (csv.ts:138-158): wishlist/bookmarked/to apply -> saved; phone screen/recruiter screen/recruiter call/screen -> screening; interviewing -> interview; offer received -> offer; rejected/declined/not selected -> closed:not-selected; ghosted/no response -> closed:no-response; withdrawn/withdrew -> closed:withdrew; hired/accepted -> closed:accepted. Dates: ISO, 10/15/2026, 15/10/2026, 15.10.2026 (csv.ts:104-135). Cap 500 rows per import (docs:100).

## 3. career-ops model today
### 3.1 Tracker data/applications.md
Columns `# | Date | Company | Role | Score | Status | PDF | Report | Notes`, optional URL, Via, Location (AGENTS.md "TSV Format for Tracker Additions"; SQLite index columns id,pos,date,company,role,score,status,pdf,report,notes,extras at CO/tracker.mjs:233-262). One Date column only. Write paths (AGENTS.md "Pipeline Integrity"): new rows via headed TSV in batch/tracker-additions + merge-tracker.mjs; status and notes via set-status.mjs; never hand-edit. Merge dedup: URL, then report#, entry#, fuzzy company+role; different req IDs in Notes keep rows distinct.

### 3.2 States (CO/templates/states.yml:16-80)
evaluated, applied, responded, assessment, interview, offer, rejected, discarded, skip, hired. Each has label, aliases, description, dashboard_group (equal to its own id for all ten). `terminal: true` on offer, rejected, discarded, skip, hired (yml:52,59,66,73,80). `assessment` has alias `screening` (yml:37). `discarded` has `lapsed`, `cerrada`. `hired` has `accepted`. No `closed`, `saved`, `withdrawn`, `ghosted` alias exists in the yml.

### 3.3 Status ledger data/status-log.tsv (sibling of the active tracker)
`{tracker#}\t{date}\t{from}\t{to}\t{source}\t{note}`; `-` = unknown; `to=-` retracts the latest; `correction` replaces a same (num,to) date (funnel-velocity.mjs:6-24; parser :130-155). `VALID_SOURCES = set-status, web, correction, backfill, manual, reply-watch, dedup-tracker, close-stale` (funnel-velocity.mjs:88). Day-math trusts only set-status, web, correction, reply-watch (:92). Other sources parse but are excluded from hop math.
- `set-status.mjs --source` accepts only set-status, web, reply-watch (set-status.mjs:276, 302-303). `--on YYYY-MM-DD` backdates (set-status.mjs:167). So an importer cannot write `backfill` or `manual` rows through set-status. It would need `appendLedgerRows` from tracker-utils.mjs (imported at set-status.mjs:~120). Using it from a new script is inferred, untested.
- merge-tracker.mjs appends no ledger rows for new rows (grep for `status-log|appendLedger|ledger` matched only a comment at :1668). Imported rows have no history unless the importer writes it.

### 3.4 Other user-layer files
- data/active-interviews.md: table `| Company | Role | Round | Date/Time | Interviewer | Status | Notes |` (docs/SCRIPTS.md:1478; rejection-latency.mjs:534; process-quality.mjs:283). Readers take the leading YYYY-MM-DD of Date/Time and skip rows whose Status is Rejected, Declined, Ghosted or Done (SCRIPTS.md:916). Matched to tracker rows by `#N in tracker` in Notes, else fuzzy company+role (tracker-sync-check.mjs header). No script writes it: `ics-interview.mjs` only prints a paste-ready row (SCRIPTS.md:1478). No timezone or duration column.
- data/contacts.tsv: no header, `{name}\t{company}\t{type}\t{title}\t{phone}\t{email}\t{linkedin}\t{tracker#|-}\t{notes}`; type enum recruiter|hiring-manager|peer|interviewer|internal-referral|other; update-in-place; UID from name+company (contacts.mjs:5-50). Already joins to a tracker#.
- data/follow-ups.md: table `| num | appNum | date | company | role | channel | contact | notes |` of SENT follow-ups (modes/followup.md:179-195), plus pin lines `- next #<app> <YYYY-MM-DD> (set <YYYY-MM-DD>) — note`; last pin wins; trailing note ignored by the parser (followup-cadence.mjs OVERRIDE_RE and comment ~551-560). followup-seed.mjs writes a pin when a row becomes Applied.
- data/salary-observations.tsv: `{tracker#}\t{date}\t{desired|advertised|actual}\t{amount}\t{currency}\t{source}\t{note}`, append-only; actual trust tiers contract > offer-letter > recruiter-verbal > user (SCRIPTS.md:536; DATA_CONTRACT.md row).
- outcome.mjs + lib/outcome-types.mjs: interview_progress|stage_reached|interview|interview_only -> Interview; offer_received|offer -> Offer; hired|accepted -> Hired; offer_declined|declined -> Discarded; rejected|rejection -> Rejected; no_response|ghosted -> Discarded (outcome-types.mjs:21-35). Writes append-only data/outcomes/{num}_{company}_{role}/outcome.md and archives artifacts (outcome.mjs:12-16, 578).
- data/offers/*: offers, contracts, prep notes in markdown (offer-prep mode; DATA_CONTRACT). No structured terms.
- data/pipeline.md: URL inbox (pre-evaluation). This is where "saved" jobs live.

### 3.5 UI that exists
- web/src/components/pipeline-view.tsx (1050 lines): tabs from PIPELINE_TABS (web/src/lib/pipeline-navigation.mjs:28), sort keys tracker|company|role|score|status|date (pipeline-view.tsx:40), saved views in localStorage (VIEWS_KEY :41), CSV export via trackerCsv, a StatusSelect per row (:875). StatusSelect posts /api/status, which spawns set-status.mjs (web/src/app/api/status/route.ts:17-31, 56) and supports undo.
- Follow-ups page: web/src/components/followups/followups-view.tsx with LogDialog, NextDateDialog, CadenceSettings, QuietCompanies; APIs /api/followups/{cadence,log,override,seed}.
- Status list in web: CANONICAL_STATES (web/src/lib/format.ts:17-28).
- No lane concept, no drag-and-drop, no per-application timeline, no interview list.

## 4. (a) RR field -> career-ops home today
| RR field | Home today | Verdict |
|---|---|---|
| company, role | tracker Company, Role | home |
| sourceUrl | tracker URL column (optional; needs `merge-tracker.mjs --backfill-urls` first, import-tracker.mjs:~305) | home if column exists |
| location | tracker Location column, else appended to Notes (additionTsv) | partial |
| salary (text) | salary-observations `advertised` needs numeric amount+currency | partial (must parse) |
| status | tracker Status via states.yml | lossy, section 5 |
| closedReason | none; Rejected vs Discarded + Notes | NO HOME |
| laneId / lane label | none | NO HOME |
| appliedAt / submittedAt | tracker Date (one date); status-log `to=Applied` dated appliedAt | partial |
| stage activity entries | status-log rows (source backfill) | home, writer missing (3.3) |
| createdAt, updatedAt | none | no home, low value |
| source (LinkedIn, Referral) | tracker Via (agencies only) else Notes | partial |
| tags | none | NO HOME |
| notes | tracker Notes (single line) | partial (multi-line flattened) |
| activity note entries | none; Notes line, or follow-ups.md only when `followedUp` (a sent follow-up) | partial |
| activity interview entries | active-interviews.md row (Round, Date/Time, Interviewer, Notes); no tz, duration, audience columns | partial; no writer |
| contacts[] | contacts.tsv (title, type enum, phone, email, tracker#) | home (RR type is free-form: map to enum, else `other`) |
| followUpAt, followUpDateOnly, followUpNote | follow-ups.md pin line | partial (time of day, date-only flag lost) |
| jobDescription, postingSource | report "Job Description (archived verbatim)" section or jds/ capture | home, needs a report or jds/ file |
| requirements, matchScore, aiMetadata | none; career-ops scores are its own 1-5 | do not import (not comparable) |
| resume/letter ids, sentCheckScore, file urls | none (output/ PDFs, data/pdf-index.tsv keyed by report) | no home |
| trashedAt | none | skip trashed rows |
| Offer terms (career.json) | salary-observations (base/variable as `actual`), data/offers/*.md prose | partial; respondBy, equity, leave, officeDays, startDate have no structured home |
| facts, stories, answers, workspace | story-bank.md, article-digest.md | do not import (Source-of-Truth rule) |
| lanes config | none | no home |

## 5. (b) RR stage -> states.yml state
| RR stage / reason | career-ops target | Notes |
|---|---|---|
| saved | NO STATE. Use data/pipeline.md (URL inbox) | Evaluated means a report exists. import-tracker skips these on purpose (NOT_APPLIED, import-tracker.mjs:69-81, 234). |
| applied | Applied | direct |
| screening | Responded (recommended) | states.yml:37 aliases `screening` to Assessment (async test). import-tracker maps `screen`/`phone screen` to Responded (~:82-84) but `screening` resolves via resolveCanonicalState first (:186) to Assessment. Mismatch with RR meaning (RR csv.ts:143-146). Inference: needs an override for RR input. |
| interview | Interview | direct |
| offer | Offer | direct |
| closed + not-selected | Rejected | direct |
| closed + accepted | Hired | |
| closed + withdrew | Discarded | "Discarded by candidate" (yml:64) |
| closed + accepted-other | Discarded | indistinguishable from withdrew; outcome `offer_declined` maps the same (outcome-types.mjs:29) |
| closed + no-response | Discarded | matches `ghosted` (outcome-types.mjs:34) |
| closed, no reason | Discarded | RR allows null reason (db:72) |
| closed, never submitted (submittedAt null) | SKIP or drop | not an application (data.ts:213-225) |
| custom lane | none | keep as sidecar label |

career-ops lacks: Saved (pre-evaluation), closed-reason granularity (withdrew / accepted-other / no-response collapse to Discarded), Screening distinct from Assessment, and Closed as a stage separate from outcome. Recommendation: do not add states (section 8 shows the cost); keep reasons in a sidecar.

## 6. (c) Proposed minimal new user-layer files
Principle: keep applications.md at canonical columns. Add append-only sidecars keyed by tracker#, same convention as salary-observations.tsv and status-log.tsv. `data/` is already a USER_PATHS prefix (update-system.mjs:346), so new data/*.tsv files survive updates. Each needs a DATA_CONTRACT.md row. Whether a test enforces that row is unverified.

| New file | Format | Holds | Why |
|---|---|---|---|
| data/application-meta.tsv | `{tracker#}\t{date}\t{key}\t{value}\t{source}`, latest per (num,key) wins; keys lane, tag, closed_reason, source, closed_at | lane, tags (multi-row), RR closed reason, lead source | One key/value log avoids a new applications.md column that every reader (web, Go, tracker.mjs `extras`) would have to handle. |
| data/application-events.tsv | `{tracker#}\t{datetime}\t{kind}\t{text}\t{source}`, kinds note, contact, import | RR note entries and non-stage timeline lines with real timestamps | Notes cell is one line; status-log is status-only. Needed for an activity timeline. |
| Interview rounds: reuse data/active-interviews.md. Put `2026-09-02 14:00 America/Toronto (60m)` in Date/Time, kind in Round, `name, role; ...` in Interviewer, `#N in tracker` + audience + notes in Notes | existing 7-column table | rounds with tz and duration | Readers need only a leading YYYY-MM-DD (SCRIPTS.md:916), so nothing breaks. The missing piece is a writer (none exists). If structured queries are wanted later, data/interviews.tsv is the alternative; do not add both. |
| Per-application contacts | no new file: contacts.tsv with tracker# set | RR contacts[] | Join column already exists. |
| Offer terms | data/offers/{tracker#}-terms.md plus salary-observations `actual` rows (base, variable; written -> `offer-letter`, verbal -> `recruiter-verbal`) | base, variable, equity, leave, officeDays, startDate, respondBy | data/offers/* and the salary log are the existing homes. Also pin respondBy in follow-ups.md so cadence tooling sees it. |
| Follow-up date | no new file: pin line in follow-ups.md | followUpAt, followUpNote | Existing parser. |
| Imported status history | no new file: status-log.tsv rows with source `backfill` | RR stage entries with dates | `backfill` is in VALID_SOURCES and excluded from day-math (correct for reconstructed data). Needs a ledger writer (3.3). |

Kanban design implication: columns = the ten states (dashboard_group is 1:1 today, yml:21,27...), with `lane` from application-meta.tsv as an optional sub-grouping. A drag = POST /api/status -> set-status.mjs (existing path, with --expect-status guard, undo, ledger). A lane-only change appends to application-meta.tsv and does not touch the tracker.

## 7. (d) Importer: write paths and limits
Must use:
1. Rows: headed TSV in a private temp additions dir + CAREER_OPS_ADDITIONS + merge-tracker.mjs with reserved numbers (`reserveReportNumbers`), exactly as import-tracker.mjs:336-375. Score `N/A`, pdf `❌`, report `—`. Dedup comes free from merge; `planImport` pre-marks `tracked`/`repeat` (~:226-232).
2. Status: initial status in the TSV. Replayed transitions must go through set-status.mjs with `--on <date>` and `--source set-status|web` only. Reconstructed dates should not count as observed, so the better path is a direct `backfill` ledger append (inferred; needs a small exported helper).
3. Contacts: append to data/contacts.tsv. Follow-up pins: append to data/follow-ups.md. Offers: salary log + data/offers/.
4. JD: if jobDescription exists, write a jds/ capture named with `--report=N` (AGENTS.md "JD captures") or the row fails check-jd-archive.mjs. For N/A imported rows no report exists. Whether imported rows are exempt is unverified (AGENTS.md says verify-pipeline check 17 errors only for sent applications with no terminal status).

Cannot express (dropped or flattened):
- Multiple dates: tracker has one Date; appliedAt, stage date and createdAt collapse. Only status-log holds stage dates.
- Closed-reason granularity, lane, tags, source: need the sidecars, or Notes text (import-tracker already writes `source stage: X`, ~:245).
- Interview tz, duration, participants, audience: only as text packed into active-interviews cells.
- followUpDateOnly and time of day.
- RR resume/letter links and version snapshots, match score, AI metadata, requirements, facts, stories.
- `saved` rows: route to data/pipeline.md. The inbox line grammar was not read (check modes/pipeline.md first).

Existing import-tracker gaps against an RR CSV (verified by reading COLUMN_ALIASES and OTHER_TRACKER_STAGES):
- COLUMN_ALIASES (import-tracker.mjs:56-64) recognizes company, role, status/stage, date (including `application date`), url, location, notes. It ignores Closed Reason, Stage Date, Salary, Source, Tags, Contacts, Lane*, Stage History, Timeline.
- RR `closed` is unknown to resolveStage (absent from states.yml aliases and from OTHER_TRACKER_STAGES, import-tracker.mjs:74-95), so every closed row is reported `unknown-status` and not imported.
- `saved` -> NOT_APPLIED (skipped by design). `screening` -> Assessment (section 5).
- Rows with blank Application Date fall back to `today` and are flagged `undated` (~:232-234).
- Recommendation: add an RR-export detector (the four headers at RR csv.ts:313-315) enabling an RR profile: `closed` + Closed Reason -> state per section 5, `screening` -> Responded, Stage Date/Tags/Source/Salary -> sidecars, and skip rows with no submission (submittedAt empty, so Application Date blank).

## 8. (e) Adding a state; what pins the list
Add an entry to CO/templates/states.yml (id, label, aliases, description, dashboard_group; `terminal: true` for end states). The header (yml:9-14) says non-terminal order = file position, used by tracker-sync-check.mjs compareLifecycle. Pinned by:
- tests/analytics-state-contract.test.mjs:12-21 (read): hardcoded `expected` map keyed by label.toUpperCase(); a state with no case fails "No contract case for ...". Also needs web/src/lib/analytics-metrics.mjs computeProgressMetrics to classify it.
- tests/states-alias-coverage.test.mjs (header read): every alias in normalize-statuses.mjs must be in states.yml.
- Listed by `grep states.yml tests/`, bodies not read: states-canonical-load, status-aliases-from-states, merge-tracker-states-missing, set-status*, stats, followup-cadence, tracker-utils, close-stale, dedup-tracker-status-aliases, reply-proposals, verify-pipeline-via-skip and others.
- Web: hardcoded CANONICAL_STATES (web/src/lib/format.ts:17-28), statusDot colours, PIPELINE_TABS.
- Go dashboard: dashboard/internal/data/states_parity_test.go:16-72 parses states.yml by hand (no YAML dependency) and asserts NormalizeStatus agrees for every alias; canonical_states_test.go:12-27 asserts the Go canonical list equals states.yml. dashboard/ changes also need `go test ./...` (dev-workflow rule).
- Funnel semantics (stats.mjs `ever*`, funnel-velocity.mjs hops): inferred, not read.
Cost: roughly ten test files, two UI lists, the Go package, funnel definitions. Not worth it for "Saved" or closed reasons; sidecars avoid all of it.

## 9. Not verified, settle before building
1. A real RR zip: confirm applications.json serialization and the offers key path in career.json (RR career/service.ts exportData not read).
2. modes/pipeline.md inbox line format for data/pipeline.md.
3. Whether any test enforces a DATA_CONTRACT row per new data/ file.
4. Whether appendLedgerRows (tracker-utils.mjs) is safe to call from a new script under the tracker writer lock.
5. Fork rules (.claude/rules/dev-workflow.md): new scripts or tests in shipped dirs need SYSTEM_PATHS or config/local-paths.txt coverage (validate-system-paths-coverage.mjs). Upstream wants an issue first for a new feature, mode or command.
6. CO/data/ in this checkout has no applications.md (only pipeline.md, offers/, parser-output/), so nothing was run against a live tracker.

Skipped: I did not read the bodies of most state-pinning tests, packages/api career/service.ts, modes/pipeline.md, or tracker-aliases.json. I ran nothing in either repo.
