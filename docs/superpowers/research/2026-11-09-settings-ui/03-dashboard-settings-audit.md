# Dashboard settings audit (web/)

Date: 2026-11-09. Read-only audit of `web/src`, `web/scripts`, `web/server.mjs`, `scripts/ui-server.mjs`, `deploy/`, plus root `*.mjs` and `lib/` for tunables. Paths are relative to the repo root unless they start with `web/`; `src/` means `web/src/`. Every `file:line` was read this session. "Inferred" marks a claim not directly read.

Not covered here (other agents): the list of environment variables and the list of config-file keys. Env vars and config keys appear below only where they explain a row.

## Summary of what matters

1. Only three things the dashboard calls "settings" reach a file the CLI reads: follow-up cadence (`config/profile.yml`), the profile and portals writers (assistant-only, no form), and scheduled-job settings (`data/scheduled-jobs.json`). The AI engine choice, logo toggle and evaluation sections live in browser `localStorage` and are invisible to the server, the CLI and the scheduled runner.
2. The `/config` page is one component with one server-backed section (`CadenceSettings`); the "key" and "manual" modes are unreachable dead code.
3. There is no authentication anywhere. The only gate is the same-origin and loopback Host check in `src/proxy.ts`. A settings API that returns or accepts secrets would sit behind that check alone.
4. Every child process inherits `process.env` (explicit `env: process.env`, a spread of it, or the default). Mutating `process.env` in the server process before spawning would reach all web-spawned children. It would not reach an OS-scheduled runner, the PDF painter started by `server.mjs`, or anything started before the mutation.
5. The settings writers for `profile.yml` and `portals.yml` take no lock. They rely on read, merge, then `atomicWriteWithBackup`. Only the cadence route adds an optimistic revision check.

---

## Section 1. What is editable today

### 1a. Settings-like controls

| Page route | Control (label as shown) | What it changes | Stored where | Control file:line | Writer file:line |
|---|---|---|---|---|---|
| `/config` | "Use an AI tool you have" card, then the CLI rows (one button per installed CLI) | Which agent CLI id the browser sends with every AI request | `localStorage["career-ops:config"]` JSON `{mode, cliId, provider, logos}` | `src/components/config-form.tsx:114-120` (card), `:159` (row click) | `config-form.tsx:91-98` `save()` calls `writeConfig` at `src/lib/config-events.mjs:9-12`. Also `src/lib/saved-cli.ts:16-26` `persistCliId`, called by the effect at `config-form.tsx:84-86` |
| `/config` | "Save config" button | Commits cliId, provider, logos to localStorage and fires `career-ops:config-changed` | same key | `config-form.tsx:303-312` | `config-form.tsx:91-98`; `src/lib/config-events.mjs:9-12` |
| `/config` | "Company logos" toggle | Show real company logos vs monograms. Read by `company-logo.tsx`, `assistant-console.tsx`, `inbox-triage.tsx` | `localStorage["career-ops:config"].logos` | `config-form.tsx:272-298` | `config-form.tsx:97` via `writeConfig` |
| `/config` | "Track follow-ups" checkbox | Turns the Follow-ups page and follow-up date scheduling on or off; hides the nav item after `router.refresh()` | `config/profile.yml` key `follow_ups.enabled` | `src/components/followups/cadence-settings.tsx:161-171` | `cadence-settings.tsx:99-129` `toggle()` posts to `src/app/api/followups/cadence/route.ts:138-229` (write at `:219`) |
| `/config` | Six number inputs: "First follow-up", "Between follow-ups", "Max follow-ups", "Reply window", "Responded / assessment cadence", "Thank-you note" | Follow-up cadence days and the max count | `config/profile.yml` section `followup_cadence`, keys `applied_first_days`, `applied_subsequent_days`, `applied_max_followups`, `responded_initial_days`, `responded_subsequent_days`, `interview_thankyou_days` | `cadence-settings.tsx:13-20` (field list), `:178-193` (inputs) | `cadence-settings.tsx:60-97` `save()` posts to `api/followups/cadence/route.ts:138-229`; patch built at `:203-212`, `atomicWriteWithBackup` at `:219` |
| `/config` | (hidden, unreachable) "Provider" buttons and "Paste an AI key" password input | Nothing. Panels render only when `mode === "key"` or `"manual"`, but the only mode card calls `setMode("cli")` and load restores only `"cli"` | not persisted: `apiKey` is never written; `provider` is written but nothing reads it (inferred: grep found no reader outside config-form) | `config-form.tsx:218-261` (key panel, password input `:248`), `:262-266` (manual panel); comment `:49-50`, `:93-96` | none |
| `/scheduled-scans` | "Create Scheduled Scan" modal: Scan Name, Scan Engine (Full ATS Dataset Sweep / Zero-Token Portals.yml), Repeat Cadence (number + Hours/Days/Minutes) | A recurring scan job | `data/scheduled-jobs.json` (path from `src/lib/scheduled-runner-path.mjs:6-9`, override `CAREER_OPS_SCHEDULED_JOBS_PATH`), `jobs[]` | `src/components/scheduled-scans/create-job-modal.tsx:85-95`, `:99-107`, `:116-138` | `src/lib/scheduled-job-client.mjs:12-` `createScheduledJobRequest` to `src/app/api/scheduled-jobs/route.ts:27-36`, `createScheduledJob` at `src/lib/scheduled-jobs.ts:148` using `withScheduledStore` (`src/lib/scheduled-jobs-store.mjs:138-150`) |
| `/scheduled-scans` | "Use portals.yml filters" checkbox (`FiltersFromToggle`) | Job reads title/location lists from `portals.yml` each run vs its own list | job field `filtersFrom` in `data/scheduled-jobs.json` | `create-job-modal.tsx:216-231` | same as above |
| `/scheduled-scans` | `FilterBuilder` (shared with Explore): Discovery sources, Employers, Roles to find, Exclude, City or location, Posted within (24h/3d/7d/14d/30d), Sources (ATS chips), Always include, Exclude locations, Never include, Scan depth slider (50-500 companies/source) | The job's filters | job field `filters` in `data/scheduled-jobs.json` | `src/components/explore/filter-builder.tsx:133-139`, `:140-147`, `:149-175`, `:177-222`, `:236-251`, `:252-264`; mounted at `create-job-modal.tsx:146` | same as above |
| `/scheduled-scans` | `EvaluateFields`: "Evaluate new rows" (Off / Review / Auto), "Rank threshold (1 to 5)", "Evaluations per run (1 to 20)" | Whether the runner ranks and auto-evaluates new rows; cutoff and cap per run | job field `evaluate` `{mode, enabledAt, rankThreshold, maxPerRun}`; bounds clamped in `src/lib/scheduled-job-input.mjs:31-42` (threshold 1-5 step 0.1 default 3.5, max 1-20 default 5) | `create-job-modal.tsx:176-214` (select `:191`, threshold `:202`, max `:206`) | same writer; `src/lib/evaluate-settings.mjs:22-25` builds the body |
| `/scheduled-scans` | Edit job modal (same fields) | Updates an existing job | same store | `src/components/scheduled-scans/edit-job-modal.tsx:104-163` (reuses `EvaluateFields`, `FiltersFromToggle`) | `edit-job-modal.tsx:67` `updateScheduledJobRequest` (`scheduled-job-client.mjs:23-`) to `api/scheduled-jobs/[id]/route.ts:12-24` PATCH, `patchScheduledJob` at `scheduled-jobs.ts:183` |
| `/scheduled-scans` | Pause/Resume button on a job card; card menu delete | Job `status` active/paused/deleted | same store | `src/components/scheduled-scans/job-card.tsx:212`; delete `src/components/scheduled-jobs-view.tsx:101` | PATCH `api/scheduled-jobs/[id]/route.ts:12`; DELETE `:26-35`; handler `scheduled-jobs-view.tsx:88-91` |
| `/scheduled-scans` | "Run now" button; scheduler "start" button | Starts a runner process. Not a stored setting | none | `job-card.tsx:202`; `scheduled-jobs-view.tsx:116` | `api/scheduled-jobs/[id]/run/route.ts:72`; `api/scheduler/route.ts:19-64` |
| Quick evaluate on `/` and Inbox shortlist tray on `/pipeline` | "Evaluation sections" checkboxes, "Essentials", "Full evaluation" | Which optional report sections the AI run includes | `localStorage["career-ops:evaluation-sections"]` (JSON array); options list `src/lib/evaluation-options.mjs:2-12` | `src/components/evaluation-options.tsx:34-56` (checkbox `:47`); mounted `quick-evaluate.tsx:59`, `inbox/shortlist-tray.tsx:49` | `evaluation-options.tsx:25-30`; sent to the server in the run body (`app/api/run/route.ts:60`, `evaluationSections`) |
| Every page | Theme toggle ("Dark mode") | Light/dark | `localStorage["career-ops:theme"]` (`src/lib/theme.mjs:5`) | `src/components/theme-toggle.tsx:14-19`; mounted `app-shell.tsx:83`, `mobile-nav.tsx:127,203` | `src/components/theme-provider.tsx:74` |
| Assistant panel (all pages) | Panel size cycle button | Panel size compact/larger | `localStorage["career-ops:assistant-size"]` | `src/components/assistant-console.tsx:246-252` `cycleSize` | `assistant-console.tsx:249` |
| Assistant panel | Confirm cards `setProfile`, `setPortals`, `setPersonalization` (no form; the assistant proposes, the user confirms) | `config/profile.yml` (name, email, location, roles, comp range, currency, remote), `portals.yml` (`title_filter.positive`, `location_filter.allow`), `modes/_profile.md` eight sections | those files | `assistant-console.tsx:544-565` (`writeProfile`, `writePortals`, `writePersonalization`) | `src/app/api/profile/route.ts:64-122`; `src/app/api/portals/route.ts:21-53`; `src/app/api/personalization/route.ts:47-67` |
| Assistant panel | "remember" action | Appends a durable fact to `modes/_profile.md` | that file | `assistant-console.tsx:528-534` | `src/app/api/memory/route.ts:15-37` |

### 1b. Controls that persist user data, not settings (listed for completeness)

| Page route | Control | Stored where | Control file:line | Writer file:line |
|---|---|---|---|---|
| `/cv` | CV editor textarea (autosave 600 ms) | `cv.md` | `src/components/cv-editor.tsx:237`; `AUTOSAVE_MS` `:23` | `src/app/api/cv/route.ts:31-` (`atomicWriteWithBackup` at `:44`) |
| `/cv` | CV ingest (paste/upload) | `cv.md` via headless CLI | `src/components/cv/cv-ingest.tsx:119,239` | `src/app/api/cv/ingest/route.ts:73`, `api/cv/route.ts` |
| `/resume` | Section form fields, Design panel, Template select (template stored as `careerOps.template` in the draft; written into `cv.md` by the core `resume save`, inferred) | `cv.md` through core `resume.mjs save` | `src/components/resume/section-form.tsx:52-76`, `design-panel.tsx:65-74`, `template-picker.tsx:15` | `src/components/resume/resume-editor.tsx:164` to `src/app/api/resume/route.ts:66-` (`runCoreCli("resume", ["save", ...])` at `:72`) |
| `/pipeline`, `/board`, Today | Status select, delete | `data/applications.md` via `set-status.mjs`, `tracker.mjs delete` | `src/components/status-select.tsx`, `delete-from-tracker.tsx:23,43` | `src/app/api/status/route.ts:52`, `api/tracker/delete/route.ts:22-60` |
| `/board` | Lane / tag on a card | `data/application-meta.tsv` via `app-meta.mjs` | `src/components/board/application-sheet.tsx:38` | `src/app/api/app-meta/route.ts:16-45` |
| `/followups`, Today | Log, override next date, seed | `data/follow-ups.md` | `src/components/followups/log-dialog.tsx:42`, `next-date-dialog.tsx:42`, `apply-checklist.tsx:257` | `src/app/api/followups/log/route.ts:31,109`, `override/route.ts:45,73`, `seed/route.ts:11` |
| `/pipeline` (Inbox) | Skip checkbox | `data/pipeline.md` | `src/lib/inbox-skip-client.mjs` | `src/app/api/inbox/skip/route.ts:30-`, `src/lib/inbox-skip.mjs:96-100` |
| `/explore` | Add to pipeline, AI hunt | `data/pipeline.md`, `data/scan-history.tsv` | `explore-provider.tsx:407,529` | `src/app/api/explore/add/route.ts:11`, `src/lib/core/pipeline.ts:102` (spawns a node `-e` child) |
| `/apply` | Answers, fill, close | in-memory sessions; log to `.career-ops-web/apply-prefill.log` | `apply-provider.tsx:111-373` | `src/app/api/apply/*/route.ts`, `prefill/route.ts:57,78` |
| `/shares`, LinkedIn paste | Pull share, import connections | via `publish/share.mjs`, `linkedin-import.mjs` | `shares-view.tsx:28`, `linkedin-paste.tsx:29` | `src/app/api/shares/pull/route.ts:18`, `api/linkedin-import/route.ts:74` |
| Assistant panel | Chats | `.career-ops-web/chats/<id>.json` | `assistant-console.tsx:350-367` | `src/app/api/assistant/chats/route.ts:18,27`; `src/lib/assistant-chat-store.mjs:60-88` |
| Worker runs | Run log persistence | `.career-ops-web/runs/<id>.md` | `src/components/jobs/job-store.tsx:199` | `src/app/api/runs/save/route.ts:26-68` |

### 1c. localStorage / sessionStorage keys that hold UI state only

| Key | Holds | File:line |
|---|---|---|
| `career-ops:config` | `{mode, cliId, provider, logos}` | `src/lib/config-events.mjs:1`; read by `usage-meter.tsx:32`, `company-logo.tsx:29`, `apply-provider.tsx:55`, `explorer-view.tsx:55`, `cv-ingest.tsx:23`, `explore-provider.tsx:477`, `inbox-triage.tsx:85`, `assistant-console.tsx:289` |
| `career-ops:usage-budget` | `{w5, w7}` token budgets for the usage meter. Read only: no UI or code writes it (grep found only the read) | `src/components/usage-meter.tsx:34`; defaults `:12` |
| `career-ops:pipeline-views` | Saved pipeline views (max 8, `VIEW_LIMIT` `src/lib/pipeline-views.mjs:3`) | `src/components/pipeline-view.tsx:40,166` |
| `career-ops:shortlist`, `career-ops:hidden` | Inbox shortlist and hidden rows | `src/components/inbox/inbox-triage.tsx:24-25,95,98` |
| `career-ops:jobs` | Worker job list, last 40 | `src/components/jobs/job-store.tsx:51,102` |
| `career-ops:first-score-seen`, setup-banner dismiss key | One-time dismissals | `src/components/explore/first-score-view.tsx:11,68`; `onboarding-banner.tsx:72` |
| `career-ops:chat` (legacy), `career-ops:explore-results` (sessionStorage), CV editor draft (sessionStorage) | Migration, tab state | `assistant-console.tsx:41`; `explore-provider.tsx:101`; `cv-editor.tsx:27,141` |

Pages with no persisting control: `/portals` (read-only list plus a health check; the page text says to edit `portals.yml` directly or ask the assistant, `src/app/portals/page.tsx:36-38`), `/analytics`, `/documents`, `/pipeline/compare`, `/jobs`. `/login` has only a `loading.tsx` (`src/app/login/`), no page.

---

## Section 2. How the dashboard writes user files safely

| Pattern | What it does | file:line |
|---|---|---|
| `atomicWrite` | Creates parent dir; writes a dot-prefixed temp file in the same dir (`.<name>.<pid>.<ts>.<uuid>.tmp`), then `renameSync`. On failure removes the temp file (it holds a copy of the user's file) and rethrows. Synchronous; no Windows rename retry (the core has one) | `src/lib/core/safe-write.ts:25-57`; temp name `:31`; why no retry `:18-23` |
| `backup` + `atomicWriteWithBackup` | Copies existing non-blank content to `<file>.bak-<ISO ts>` first; if the backup fails the write is stopped. Returns the backup path. Nothing prunes old `.bak-*` files (inferred: no prune code found in `lib/core/*.ts` or `lib/*.mjs`) | `safe-write.ts:60-75` (backup), `:78-82` |
| Refuse-on-malformed (profile) | File absent: seed from `config/profile.example.yml` (person fields blanked by `firstProfileText`). File present but unparseable: 409 "refusing to overwrite". Parseable but not a mapping (list, scalar, null): 409. Only then deep-merge and write | `src/app/api/profile/route.ts:84-107`; `isMapping` `src/lib/portals-config.mjs:23`; `deepMerge` `profile/route.ts:38-44`; write `:114-117` |
| Same guard, cadence route | Same two 409 cases, plus GET returns 500/409 instead of defaults so the form cannot save defaults over real values | `src/app/api/followups/cadence/route.ts:91-123` (GET), `:175-192` (POST) |
| Optimistic revision | GET returns a sha256 prefix of the file text (`textRevision`) or `"absent"`; POST may send it back and gets 409 if it changed. Clients that omit it still merge. Only this route has it | `cadence/route.ts:31-38`, `:194-201`; client use `cadence-settings.tsx:80,111` |
| Comment-preserving line editor | `patchProfileText(source, patch, expected)` edits only `section.key` lines one level under a top-level section, keeps trailing comments and other lines byte for byte, then verifies the result parses to exactly `expected`. Returns null for flow mappings, block scalars, anchors, or any mismatch | `src/lib/profile-yaml-edit.mjs:202-216` (function), `:134-200` (`setSection`), header `:7-13`; null fallback is `yaml.dump` (drops comments) at `profile/route.ts:114-116`, `cadence/route.ts:218` |
| Portals text editor | `patchPortalFiltersText` same idea for `title_filter.positive` and `location_filter.allow`; `loadPortalsDocument` distinguishes absent (seed from template) from invalid (409) | `src/app/api/portals/route.ts:32-48`; `src/lib/portals-config.mjs` |
| Section-safe markdown writer | `savePersonalization` replaces only the bodies of named `## Your ...` sections, keeps all other bytes, passes `atomicWriteWithBackup` in as `write` | `src/app/api/personalization/route.ts:58-60`; `src/lib/personalization-file.mjs:150-` |
| `readJsonObject` | Parses the body and returns null for null, arrays and scalars so the route can answer 400 instead of throwing a 500 | `src/lib/json-body.ts:4-12` |
| Dir lock | One cross-process directory lock: owner PID in `owner.json`, stale reclaim serialized behind a guard dir. The web copy is byte-for-byte the root `lib/dir-lock.mjs` (a test enforces it) | `src/lib/core/dir-lock.mjs:1-35` (header), `acquireDirLock` `:725`, `tryAcquireDirLockSync` `:856`, `releaseOrWarn` `:973` |
| Lock users in web | Scheduled store (`withResourceLock` lock at `<store>.lock`, defaults 8 s timeout, 80 ms retry, 30 s stale, store written by temp+rename without a backup); chat store (`tryAcquireDirLockSync`) | `src/lib/scheduled-jobs-store.mjs:14-16,129-150,82-95`; `src/lib/assistant-chat-store.mjs:5,57,61` |
| Follow-ups lock | Two guards that compose: in-process promise queue `withLogLock`, plus the core's cross-process `withFollowupsLock` imported from `followup-seed.mjs` (the web does not derive the lock dir; timeout `CAREER_OPS_WEB_FOLLOWUPS_LOCK_TIMEOUT_MS` or 5 s). Not reentrant | `src/lib/core/followups-lock.ts:6-36` (rationale), `:86-91`; `src/lib/followups-server.ts:33,46` |
| Tracker lock | The tracker is written by core scripts, not the web. `runCoreCli` bounds their lock wait so a busy tracker answers fast | `src/lib/core-cli.ts:5,18-27,41` |
| Locks on settings files | None. `profile/route.ts`, `portals/route.ts`, `personalization/route.ts` take no lock; the cadence route has the revision check only. A concurrent CLI edit between read and rename wins or loses silently (inferred from absence of any lock call in those files) | `src/app/api/profile/route.ts:64-122` |
| Request guard | `proxy.ts` runs `checkRequest` on every request except `_next/static`, `_next/image`, `favicon.ico`. Host must be loopback or in `CAREER_OPS_WEB_ALLOWED_HOSTS`. Origin layer: an origin in `CAREER_OPS_ALLOWED_ORIGINS` passes; else `Sec-Fetch-Site` same-origin or none passes, cross-site is 403 except a top-level GET/HEAD document navigation outside `/api/`; with no Fetch Metadata, an Origin must equal Host and an absent Origin passes | `src/proxy.ts:23-39,49`; `src/lib/origin-guard.mjs:138-196` |
| Bind | `server.mjs` picks the listen interface from the same env value; loopback unless opted in | `web/server.mjs:24-71`; `src/lib/bind-host.mjs` |
| Authentication | None beyond the guard above. `proxy.ts`, `origin-guard.mjs`, `server.mjs` and all `app/api` routes contain no credential, token or session check (grep for authorization/bearer/session-style identifiers matched only the job-application flow and a log redactor, `src/lib/report/report.ts:17`). `/login` has no page. Header says so directly: a route that answers an unauthenticated request is an RCE primitive and the guard is the control | `src/lib/origin-guard.mjs:3-6`; `src/app/login/` |

---

## Section 3. Child processes and environment

### 3a. Every spawn site under `web/src`, `web/scripts`, `web/server.mjs`

"Env" = what the child sees. Default (no `env` option) means `process.env` of the server at spawn time.

| file:line | Runs | Explicit env? |
|---|---|---|
| `web/server.mjs:104` | `generate-pdf.mjs --pdf-server` (detached painter) | Yes: `{...process.env, CAREER_OPS_PDF_SHARED:"1", CAREER_OPS_PDF_SERVER_PROCESS:"1"}` (`:109-113`). Snapshot at startup |
| `web/server.mjs:118` | `next dev` / `next start` (spawnSync) | Yes: `{...process.env, NEXT_TELEMETRY_DISABLED:"1"}` (`:120`) |
| `scripts/ui-server.mjs:208` | `web/server.mjs dev` | Yes: `childEnv = {...process.env, PORT, HOSTNAME, CAREER_OPS_ROOT: dataRoot}` (`:193-198`) |
| `src/lib/core-cli.ts:33` (`runCoreCli`) | Any root script: `resume`, `app-meta`, `evaluate-queue`, `publish/share`, `build-cv-html`, `set-status` (callers: `api/resume/*`, `api/app-meta`, `api/evaluate-queue`, `api/shares/pull`, `lib/cv-render.ts:64`, `lib/run-core-script.ts:24`, `core-cli.ts:71`) | Yes: `{...process.env, ...boundedLockWait()}` (`:41`); 30 s timeout `:5` |
| `src/lib/spawn-cli.mjs:71` (`spawnHeadlessCli`) | The user's agent CLI (claude, codex, etc.) | Caller supplies options. All callers pass `env: process.env`: `api/assistant/route.ts:131`, `api/explore/ai/route.ts:184`, `api/cv/ingest/route.ts:165`, `api/run/route.ts:335`, `lib/apply/drive.ts:113`, `lib/apply/planner.ts:95`, `lib/apply/agent-interpret.ts:101`, `lib/cv-studio/rewrite-run.ts:30` |
| `src/lib/cli-fencing-probe.mjs:88` | `<cli> --help` probe | Yes: `{...process.env, NO_COLOR:"1"}` |
| `src/lib/core/scan.ts:207` | `scan-ats-full.mjs` | Yes: `{...process.env, CAREER_OPS_PORTALS: tempPortals}` |
| `src/lib/core/pipeline.ts:102` | `node --input-type=module -e <code>` appending to pipeline and scan history | Yes: `env: process.env` |
| `src/lib/core/employer-discovery.mjs:19` | `--worker` employer discovery | No (default inherit) |
| `src/app/api/scheduler/route.ts:26` | `web/scripts/scheduled-jobs-runner.mjs` (detached, `stdio:"ignore"`) | No (default inherit) |
| `src/app/api/scheduled-jobs/[id]/run/route.ts:38` | `scheduled-jobs-runner.mjs --job <id>` | Yes: `env: process.env`; timeout 76 min `:13` |
| `src/app/api/linkedin-import/route.ts:36` | `linkedin-import.mjs --json` | Yes: `env: process.env` |
| `src/app/api/tracker/delete/route.ts:60` | `tracker.mjs delete --num N` | Yes: `env: process.env` |
| `src/app/api/company-history/route.ts:30` | `company-history.mjs` | No (execFile default); 20 s |
| `src/app/api/followups/route.ts:24` | `followup-cadence.mjs --json` | No; 12 s |
| `src/app/api/followups/cadence/route.ts:62` | `followup-cadence.mjs --json` (defaults) | No; 12 s |
| `src/app/api/patterns/route.ts:33` | `analyze-patterns.mjs` | No; 30 s |
| `src/app/api/upskill/route.ts:26` | `upskill.mjs` | No; 30 s |
| `src/app/api/doctor/route.ts:28` | `doctor.mjs --json` | No; 10 s |
| `src/app/api/portals/verify/route.ts:39` | `verify-portals.mjs` | No; 110 s |
| `src/app/api/keyword-match/route.ts:32` | `keyword-match.mjs --json` | No; 20 s |
| `src/app/api/stats/route.ts:31` | `stats.mjs` | No; 20 s |
| `src/app/api/quiet-companies/route.ts:27` | `rejection-latency.mjs` | No; 20 s |
| `src/app/api/version/route.ts:32` | `git rev-parse --short HEAD` (execSync) | No |
| `web/scripts/scheduled-jobs-runner.mjs:265` and `:460` (via `spawnFn`, default `spawnSync`, `:538`) | Scan command (`:262-264`), and `rank-pipeline.mjs --urls-file ... --limit N` | Yes: `coreEnv(root)` = `{...process.env, CAREER_OPS_ROOT: root, [CAREER_OPS_PROFILE resolved]}` (`:219-227`); scan adds `CAREER_OPS_PORTALS` (`:270`) |
| `web/scripts/evaluate-drain.mjs` | Spawns nothing. POSTs evaluate-text runs to the dashboard at `CAREER_OPS_WEB_URL` (default `http://127.0.0.1:3000`) | n/a (`:3-4`, `:149`) |

### 3b. Is there one place to set `process.env` once?

| Candidate | Finding | Evidence |
|---|---|---|
| `instrumentation.ts` | Does not exist (no such file under `web/` or `web/src`; `ls` found none) | checked this session |
| `web/next.config.mjs` | Already assigns `process.env.NEXT_TELEMETRY_DISABLED = "1"` at module load, so the config module is a precedent for early env writes. It loads in the Next process for `next dev`/`next start`/`next build` | `web/next.config.mjs:1-4` |
| `web/package.json` scripts | `dev` = `node server.mjs dev`, `start` = `node server.mjs start`, `build` = `next build` (no launcher) | `web/package.json:6-9` |
| `web/server.mjs` | The single launcher for `dev` and `start`, and it already builds the child env at `:118-122`. A settings loader here would feed the Next server and everything it spawns, plus the painter at `:104-114`. It imports only from `web/` by design (header `:9-11`) | `web/server.mjs:99-122` |
| `scripts/ui-server.mjs` | Also builds `childEnv` and wraps `server.mjs` (`:193-198`, `:208`) | `scripts/ui-server.mjs` |
| Docker | `CMD ["node","web/server.mjs","start"]` under `tini`; image `ENV` sets `NODE_ENV`, `HOME`, `CAREER_OPS_CLI=claude` | `deploy/Dockerfile:31-39` |
| Child inheritance | Every web-spawned child gets `process.env`: explicit `env: process.env`, an explicit spread of it taken at call time, or the default. So a mutation of `process.env` inside the server process before the spawn reaches those children. `runCoreCli` and `scan.ts` spread at call time, so they see later mutations | rows in 3a |
| Reads in the server process | `proxy.ts` reads `CAREER_OPS_WEB_ALLOWED_HOSTS` and `CAREER_OPS_ALLOWED_ORIGINS` on every request (`src/proxy.ts:28-29`), `schedulerSource()` reads `CAREER_OPS_SCHEDULER` per call (`src/lib/scheduler-status.ts:42`), `boundedLockWait` reads its var per call (`core-cli.ts:22`). Whether Next inlines any `process.env.X` at build time in route code is not verified (inferred: not for server-side dynamic reads) |
| Not reached | (a) the OS-scheduled runner, (b) the painter started at `server.mjs:104` (env fixed at spawn), (c) bind interface, which `server.mjs:24-28` decides from the real env before Next starts, (d) whether `next dev` runs routes in a different process than the launcher: not verified, so a mutation made in a route handler affects only that process and the children it spawns later |

Conclusion: two workable single points. (1) `web/server.mjs` before `:99`/`:118` for values that must exist before bind and for the painter. (2) A module imported at the top of each route is not single; `instrumentation.ts` (new file) would run once in the Next server process but would not cover `server.mjs`-level decisions. Neither reaches the OS runner.

### 3c. How `scheduled-jobs-runner.mjs` starts and what it sees

| Start path | Mechanism | Environment the runner sees | Evidence |
|---|---|---|---|
| OS task, macOS | `launchd` LaunchAgent label `io.career-ops.scheduled-scan` via `install-scan-schedule.sh` | Minimal scheduler env plus a baked prefix of only `CAREER_OPS_ROOT`, `CAREER_OPS_DATA_DIR`, `CAREER_OPS_SCHEDULED_JOBS_PATH` captured at install time. Nothing else from the web process or UI | `web/scripts/install-scan-schedule.sh:1-3` (header), `:54-62` (the three vars), `:86` (`RUN` line) |
| OS task, Linux | One marked crontab line, same `RUN` string, 15-minute cadence (`QUARTER_MS` `src/lib/scheduled-os-schedule.mjs:23`; script text "15-minute") | Same baked three vars | `install-scan-schedule.sh:1-3,86`; also `.ps1` for Windows (not read) |
| Kubernetes CronJob | External scheduler POSTs `/api/scheduler`; set `CAREER_OPS_SCHEDULER=external` so the page reports the tick instead of reading crontab | Inherits the web server's `process.env` (the route spawns with no `env`) | `deploy/README.md:48-49,59-62`; `src/app/api/scheduler/route.ts:19-64`; `src/lib/scheduler-status.ts:41-49` |
| Dashboard click | "Run now" and the scheduler start button | Web server `process.env` (`env: process.env` for per-job run, default for `/api/scheduler`) | `api/scheduled-jobs/[id]/run/route.ts:38-41`; `api/scheduler/route.ts:26-31` |
| Env the runner itself reads | `CAREER_OPS_RANK_CLI` (`scheduled-jobs-runner.mjs:376`), `CAREER_OPS_PORTALS` (`:151-152`), `CAREER_OPS_PROFILE` (`:225`). `evaluate-drain.mjs` reads `CAREER_OPS_WEB_URL` (`:149`), `KUBERNETES_SERVICE_HOST` or `CAREER_OPS_AUTO_EVALUATE_LOCAL=1` to allow draining (`:158`) | | as cited |

Consequences for a Settings UI (inferred from the above): a value saved only in the browser (the CLI id in `localStorage`) never reaches the runner, whose ranker picks a CLI from `--cli`, `CAREER_OPS_RANK_CLI`, or `.env` (`rank-pipeline.mjs:397`, `src/lib/remembered-cli.mjs:19-36`). A value that must apply to an OS-scheduled run has to live in a file the runner reads (profile, portals, or the store), not in the web process env.

---

## Section 4. Hardcoded tunables

Selective. "Cfg" notes where an env var or config key already exists, so those rows are probably out of scope. "Plausible" is my judgment.

| Constant | Value | file:line | Controls | Plausible? |
|---|---|---|---|---|
| Default rank threshold | 3.5 (bounds 1-5) | `src/lib/scheduled-job-input.mjs:40`; form default `src/lib/evaluate-settings.mjs:76` | Auto/Review rank cutoff for a NEW job. Per-job editable, no global default | yes: every new job starts here |
| Default evaluations per run | 5 (bounds 1-20) | `scheduled-job-input.mjs:41`; `evaluate-settings.mjs:76` | Cap per scheduled run | yes: cost control |
| `RANK_MAX_PER_PASS` | 50 | `web/scripts/scheduled-jobs-runner.mjs:402` | Rows ranked per runner tick | maybe: tied to the ranker timeout math in the comment at `:401` |
| rank-pipeline `DEFAULT_LIMIT` / `LIMIT_CEILING` / `BATCH_SIZE` | 20 / 200 / 10 | `rank-pipeline.mjs:53,56,57` | CLI `--limit` default and hard ceiling; AI ranker batch size | maybe: ceiling protects spend |
| rank timeout | 180 000 ms | `rank-pipeline.mjs:58`; env `CAREER_OPS_RANK_TIMEOUT_MS` (`:121,320`) | Per ranker call | no (Cfg exists) |
| `DEFAULT_DAILY_CAP` | 10 | `lib/evaluate-queue.mjs:28`; config `pipeline.auto_evaluate_daily_cap` (`:172`) | Auto evaluations per day | no (Cfg exists); shows as a good Settings candidate |
| `MAX_FAILURES` | 3 | `lib/evaluate-queue.mjs:27` | Attempts before a queued row is spent | maybe |
| `SCAN_TIMEOUT_MS` | 25 min | `web/scripts/scheduled-jobs-runner.mjs:30` | Per scan/rank spawn in the runner | maybe: slow networks |
| `MAX_RUNS` | 100 | `scheduled-jobs-runner.mjs:28` (trim at `:336`) | Run-history retention in `scheduled-jobs.json` | maybe: retention |
| `MAX_ATTEMPTS` | 3 | `scheduled-jobs-runner.mjs:29` | Scan retries per tick | no |
| Per-job run route timeout | 76 min | `src/app/api/scheduled-jobs/[id]/run/route.ts:13` | Kill for a manual run | no |
| `DEFAULT_SCAN_TIMEOUT_MS` | 230 000 ms | `src/lib/core/scan-timeout.mjs:11`; config `scan.timeout_seconds` (`:25`) | Explore scan kill | no (Cfg exists) |
| Explore defaults | `sinceDays` 7, `limitPerAts` 150, ATS list all four | `src/lib/explore.ts:11,43-45`; bounds `:166-169` (since 1-60, limit 50-500) | Starting filters on Explore and a new scheduled job | yes: users retune these every session |
| Recency chips | 24h/3d/7d/14d/30d | `src/components/explore/filter-builder.tsx:11-17` | Posted-within choices | no |
| `DEFAULT_OFFER_LIMIT` / `MAX_OFFER_LIMIT` | 24 / 200 | `src/lib/whats-new.mjs:2,12` | "What's new" list sizes on Today and Explore | maybe |
| `EMPLOYER_PAGE_CAP` | 10 pages/employer | `src/lib/core/employer-source.mjs:6` | China employer preset coverage | no |
| AI run kill (evaluate) | 740 000 ms; pdf 600 000; other 780 000; `maxDuration` 800 s | `src/lib/run-cli-support.mjs:441-446`; `src/app/api/run/route.ts:34` | Per headless run | maybe: slow local models |
| Assistant kill | 90 000 ms; `maxDuration` 120 | `src/app/api/assistant/route.ts:157,38` | Chat reply timeout | maybe |
| CV ingest kill | 240 000 ms | `src/app/api/cv/ingest/route.ts:191` | CV import | maybe |
| Explore AI kill | 480 000 ms | `src/app/api/explore/ai/route.ts:265` | AI hunt | maybe |
| Apply drive / interpret / planner kills | 90 000 / 150 000 / `min(300 000, 150 000 + 6 000*fields)` | `src/lib/apply/drive.ts:125`, `agent-interpret.ts:113`, `planner.ts:81` | Apply flow | no |
| `JD_TEXT_MAX_CHARS` | 16 KiB | `src/app/api/run/route.ts:38` | Pasted JD cap for evaluate-text | no |
| Usage meter budgets | w5 140 000 000, w7 1 000 000 000 tokens | `src/components/usage-meter.tsx:12`; override key `career-ops:usage-budget` has no writer | 5h and 7d bars | yes: needs a real control; today only hand-editing localStorage works |
| Usage poll | 60 s | `usage-meter.tsx:51` | Meter refresh | no |
| Score tone cutoffs | good 4.2, warn 3.8, neutral 3.0 | `src/lib/format.ts:48-56` | Score colors (comment says it mirrors the Go TUI) | maybe: must stay in step with `dashboard/` |
| Analytics tiers | 4.5 / 4.0 / 3.5 / 3.0 | `src/lib/analytics-metrics.mjs:288` | Tier buckets | maybe |
| "Apply line" copy | 4.0 | `src/components/score-methodology.tsx:37` | Explanatory text only; the rule lives in modes and AGENTS.md | no (not a setting) |
| `FOLLOW_UP_AFTER_DAYS` | 10 | `src/lib/next-step.mjs:13` (used `:160,171`) | "No reply" nudge on the next-step line; separate from the `followup_cadence` keys (inferred: it does not read them) | yes: overlaps the cadence settings and can disagree with them |
| Title-fit bands | strong 0.6, related 0.34 | `src/lib/title-fit.mjs:80` | Inbox title match chips | no |
| Awaiting-decision cards | 6 | `src/lib/home/awaiting.mjs:43` | Today decision cards | no |
| `BATCH_CAP` | 12 | `src/app/actions/registry.ts:25` | Assistant fan-out ceiling | maybe |
| Job list persisted | 40 | `src/components/jobs/job-store.tsx:102` | Worker list kept in localStorage | no |
| `UNDO_LIMIT`, `VIEW_LIMIT`, `COMPARE_MAX` | 30, 8, 3 | `src/lib/cv-studio/studio.mjs:411`; `pipeline-views.mjs:3`; `pipeline-compare.mjs:4` | UI caps | no |
| `scan-ats-full` cache TTL | 24 h | `scan-ats-full.mjs:100,589` | ATS dataset cache age | maybe: bandwidth vs freshness |
| Scan concurrency | 10 default (env `CAREER_OPS_SCAN_CONCURRENCY`, `CAREER_OPS_SCAN_HOST_CONCURRENCY`) | `scan.mjs:167`; `scan-ats-full.mjs:112` (20) | Parallel fetches | no (Cfg exists) |
| Scratch retention | min 1 h, max 7 d | `lib/scratch-dirs.mjs:80,110` | Temp dir cleanup age | no |
| PDF server idle | 30 min | `lib/pdf-server.mjs:14` | Painter shutdown | no |
| `.bak-*` retention | none (never pruned, inferred) | `src/lib/core/safe-write.ts:60-75` | Backups pile up with every settings save | maybe: a retention setting or a prune rule |
| Web lock waits | 8 s store, 5 s follow-ups, 10 s `LOCK_WAIT_DEFAULT_MS` capped at 25 s | `scheduled-jobs-store.mjs:14`; `followups-lock.ts:91`; `core-cli.ts:18-19` | Lock waits | no (internal) |

---

## Section 5. Navigation, reusable patterns, tests

### 5a. Navigation

| Item | Finding | file:line |
|---|---|---|
| Nav source of truth | `NAV_ITEMS` array of `{href, label, icon, chip?}`, 13 entries; `visibleNavItems(followupsEnabled)` drops `/followups` when follow-ups are off | `src/lib/nav-items.ts:13-27,29-31` |
| `/config` link | `{ href: "/config", label: "Config", icon: Settings }` | `nav-items.ts:23` |
| Consumers | Desktop sidebar, mobile menu, command palette | `src/components/app-shell.tsx:21,49`; `mobile-nav.tsx:13,167`; `command-palette.tsx:8,32` |
| Active state | `isActivePath` is `startsWith` except for `/`, so `/config/anything` would highlight Config | `nav-items.ts:33-35` |
| Other links to `/config` | Onboarding banner, home, inbox tray, explorer, CV ingest, followups page, assistant | `onboarding-banner.tsx:101`, `home/first-run-home.tsx:31`, `home/onboarding-progress.tsx:95`, `inbox/shortlist-tray.tsx:136`, `explore/explorer-view.tsx:389,418`, `cv/cv-ingest.tsx:330`, `app/followups/page.tsx:15`, `assistant-console.tsx:132,274,940` |
| `/config` page | `src/app/config/page.tsx` renders `<ConfigForm />`, a single-column `max-w-2xl` form with section labels as `<label>` text, no tabs | `src/app/config/page.tsx:3-5`; `config-form.tsx:103` |
| Server-rendered nav state | Layout passes `followupsEnabled` read from the profile; `router.refresh()` after the toggle re-renders it | `cadence-settings.tsx:120-122`; `src/lib/followups-setting.mjs:3-5` |

### 5b. Existing section, tab and card patterns

| Pattern | Where | Note |
|---|---|---|
| No tab component. No `role="tablist"` or `role="tab"` anywhere in `src/` | grep over `components` and `app` | Pipeline status tabs are built inline in `pipeline-view.tsx` (`tab`, `:280`), not a shared component |
| `Card` | `src/components/ui/card.tsx:13-33` | `rounded-2xl border bg-surface/50 p-5`, optional gradient `corner` and `elevated` |
| `PageFrame` | `src/components/page-frame.tsx:4-6` | `max-w-6xl` page wrapper |
| Section card used by `/config` | `<label class="mt-8 mb-2 ... uppercase tracking">` heading plus `rounded-xl border border-border bg-surface/50 p-4` box | `cadence-settings.tsx:133-136`; `config-form.tsx:272-276` |
| Disclosure | Native `<details>` with `group` styling | `score-methodology.tsx:29`, `report-markdown.tsx:71`, `prep-pack.tsx:15`, `quick-evaluate.tsx:57` |
| `Modal` | `src/components/ui/modal.tsx` (used by create/edit job) | |
| Toggle switch | Inline button+span, not a component | `config-form.tsx:272-298` |
| `StatCard`, `Badge`, `Button`, `Skeleton` | `src/components/ui/*.tsx` | |
| Load/save/revision form pattern worth copying | `CadenceSettings`: load with retry on failure, never show defaults on a failed read, `writePending` ref, revision echo, `409` triggers reload | `cadence-settings.tsx:32-97` |
| Cross-component config event | `writeConfig`/`subscribeConfig` fire `career-ops:config-changed` and listen to `storage` | `src/lib/config-events.mjs:9-30` |

### 5c. Test conventions

| Item | Finding | file:line |
|---|---|---|
| Runner | `npm test` = `node --experimental-strip-types --test "tests/**/*.test.mjs"` | `web/package.json:10` |
| Browser suites | `npm run test:browser` = `node tests/browser-suites.mjs`; suites are `tests/lib/*.browser.test.mjs`, each on its own built server, needs `npm run build` first | `web/package.json:12`; `tests/browser-suites.mjs:1-30` |
| Layout | `tests/lib/*.test.mjs` (about 313 files), `tests/helpers/`, `tests/fixtures/` | listing |
| Pure logic | Lives in plain `.mjs` so `node --test` imports it directly; `.ts` is reached through a dynamic import after loading the alias hook | `web/AGENTS.md:34-38`; `tests/helpers/web-ts-alias-loader.mjs:1-14` |
| Route tests | Import `../helpers/web-ts-alias-loader.mjs`, set `CAREER_OPS_CODE_ROOT`, `CAREER_OPS_ROOT` to temp dirs, import the route handler dynamically, call `POST(new Request(...))` | `tests/lib/app-meta-route.test.mjs:1-22` |
| Component tests | There is no React render test. Components are checked by reading the source file and asserting with regexes ("source-reading style") | `tests/lib/config-form-persist-wiring.test.mjs:1-30`; `tests/lib/config-soon-hidden.test.mjs:1-15` |
| Existing tests near settings | `config-events`, `config-form-persist-wiring`, `config-soon-hidden`, `cadence-revision`, `profile-write-shape`, `profile-yaml-edit`, `profile-first-run-seed`, `safe-write-backup-failure`, `safe-write-temp-cleanup`, `portals-config`, `scheduled-job-body`, `scheduled-jobs-runner`, `origin-guard`, `saved-cli-pick`, `saved-cli-resolve` | `tests/lib/` listing |
| Typecheck | `npm run typecheck` = `tsc --noEmit` | `web/package.json:9` |
| Project gates | `npm run lint` then `node test-all.mjs --quick`; a new test is its own `tests/*.test.mjs` file | `.claude/rules/dev-workflow.md` |

---

## Not verified

- Whether `next dev` renders routes in the launcher's process or a child; the "single place" analysis assumes children are spawned from whichever process runs the route handler.
- That no other code reads `career-ops:config` `provider` or `mode` (grep of `config-form`, `saved-cli` and the readers listed in 1c found only `cliId` and `logos` consumers).
- `install-scan-schedule.ps1` (Windows) env handling, not opened.
- Whether the resume Template select persists into `cv.md` exactly as `careerOps.template` (read only the editor wiring, not `lib/resume/to-cv-md.mjs`).
- Core-script env reads beyond those cited; the env-var inventory is another agent's.
