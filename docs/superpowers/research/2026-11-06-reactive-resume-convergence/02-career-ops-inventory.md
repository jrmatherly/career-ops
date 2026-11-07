# career-ops feature inventory (resume, web, tracking)

Subagent research report, 2026-11-06. Model output: claims carry file:line evidence or are labelled inference; verify against the code before relying on one.

# career-ops feature inventory (resume building, web UI, tracking)

Scope: read-only, repo at /Users/jason/dev/career-ops (main at 42f2c07b). Nothing was created or edited. "V" means I read the cited lines. "G" means I confirmed a negative with grep. "N" means not verified beyond a header or doc comment. I did not run any script or test.

## 1. Resume/CV building and rendering

### Canonical sources
- `cv.md` is the canonical CV. It is a User Layer file (`DATA_CONTRACT.md:13`, `update-system.mjs:336`). AGENTS.md says "`cv.md` in project root is the canonical CV" and "NEVER hardcode metrics". V.
- `config/cv-facts.json` is a fact-gate allowlist, not a CV source. Its keys are `allow_metrics`, `allow_facts`, `forbidden_phrases` and `warn_phrases` (`config/cv-facts.example.json:1-15`). It is a user path (`update-system.mjs:353`). V.
- `data/career-profile.yml` is an optional "Master Career Profile". It is written only after explicit review of imported CV facts (`DATA_CONTRACT.md:42`). V.
  - Shape: `schema_version, candidate, summary[], experiences[], projects[], education[], certifications[], skills[]` (`templates/career-profile.example.yml:1-10`). V.
  - CLI `career-profile.mjs` has `import [--review]`, `validate`, `prepare-cv` and `verify-cv` (`career-profile.mjs:22-37`). `prepare-cv` and `verify-cv` build and re-check a payload from a selection of profile facts. V.
- `config/profile.yml` holds the candidate block, `style:`, `cv:` and `language:`. Example: `config/profile.example.yml:30-37` (photo, photo_style), `:214-260` (cv block). V.

### Tailored-CV JSON payload (consumed by `build-cv-html.mjs`)
The agent writes this payload and the script renders it. The script does not parse cv.md or YAML (`build-cv-html.mjs:3-16`). V.

Root keys, HTML format (`lib/cv-payload-schema.mjs:63-67`): `lang, page_format, country, candidate, sections, summary, competencies, experience, projects, education, certifications, awards, interests, skills, consent`. V.

Candidate fields read in `build-cv-html.mjs`:
- `candidate.name`
- `candidate.title`
- `candidate.photo`
- `candidate.photo_style`
- `candidate.phone`
- `candidate.email`
- `candidate.linkedin`
- `candidate.github`
- `candidate.portfolio`
- `candidate.location`

Evidence: `build-cv-html.mjs:771-796`, `:976-980`. V.

`payload.sections` overrides the section titles (`:787`). Defaults are at `:69-79`. V.

Entry fields per section (`lib/cv-payload-schema.mjs:22-38`; required fields marked *). V.

| Section | Fields |
|---|---|
| experience | company*, role*, location, context, dates, period, bullets |
| projects | name*, badge, description, bullets, tech, url |
| education | title*, org, location, year, description |
| certifications | title*, org, year |
| awards | title*, org, year |
| skills | category, items* (string or array) |

The LaTeX payload is a different shape (`:39-54`, `:68-75`). Education there is `{institution, degree, location, dates, coursework}` and the root has `name, contact_line, email, linkedin, github`. LaTeX does not render `certifications`, `competencies`, `interests` or `summary` (`:81-84`). V.

`validatePayload`, `hasRequiredFields` and `templateSlotWarnings` reject misspelled keys and warn when a template has no slot for a section (`:102-111`). V.

### Templates
- HTML templates in `templates/`: `cv-template.html` (default), `.compact`, `.executive`, `.jake`, `.leadership`, `.modern` and `.zh-minimal`. Also `ats/cv-template.ats.html`, `cover-letter-template.html` and `resume-template.html`. V (`ls`).
- LaTeX templates: `cv-template.tex` and `cv-template.cjk.tex`. V (`ls`).
- Section partials are in `templates/sections/` (`experience.html`, `education.html`, `projects.html`, `skills.html` and others). The builder uses a partial when one exists and otherwise a built-in fallback (`build-cv-html.mjs:18-26`). V.
- The template manifest is an HTML comment: `career-ops-template / name / version / sections: all`. See `templates/ats/cv-template.ats.html:2-6`. A declared section never falls back silently (`build-cv-html.mjs:28-33`). V.
- Template selection:
  - `cv.template: <name>` in profile.yml, kebab-case, for `cv-template.<name>.html` (`config/profile.example.yml:216-223`). V.
  - User templates live in `{DATA_ROOT}/data/templates/`.
  - Resolution is in `cv-templates.mjs:1-30`. V.
- Output format is `cv.output_format: html|latex|text` (`config/profile.example.yml:206`). `text` is tailored markdown with no PDF. V.

### Theming and layout beyond template choice
- `style:` in profile.yml maps to CSS custom properties (`theme-style.mjs:37-60`). V.
  - Keys: `accent_color, secondary_color, tag_color, tag_bg, tag_border, font_family, font_size, margin, job_break_inside, project_break_inside`.
  - Unknown keys are ignored.
- Section order: `cv.sections: [skills, education, ...]`, HTML only (`config/profile.example.yml:225-249`). V.
- `cv.locked_sections` blocks AI edits to named sections, enforced in the HTML pipeline only (`:262-266`). V.
- Page size: `page_format` and `country` give letter or A4 (`lib/page-format.mjs`, imported at `build-cv-html.mjs:47`). N for details.
- Profile photo is optional, with styles rounded, circle and square (`build-cv-html.mjs:59-67`, `:771-773`). V.
- Multi-page control:
  - `cv.max_pages` and `cv.strict_pages` in profile.yml (`config/profile.example.yml:251-260`). V.
  - The `--max-pages` and `--strict-pages` flags on `generate-pdf.mjs` win for one render (`generate-pdf.mjs:7`, `:1378`, `:1875`, `:2059-2091`). V.
  - Default is up to 2 pages, with a warning past that.

### Rendering path
- `generate-pdf.mjs` turns HTML into PDF with Playwright (`:3-16`). It supports `--batch` with one shared Chromium, `--kind=cv|cover` and `--format`. V.
- `generate-latex.mjs` validates and compiles a `.tex` file. It has a `--compile-only` mode for user-owned `.tex` and runs the fact gate before compiling (`generate-latex.mjs:3-16`). V. `build-cv-latex.mjs` is the LaTeX twin of the HTML builder (N, from the header comments).
- The pdf mode flow is `modes/pdf.md` (N). In the web app the agent emits HTML inside a `<<cv-html ...>>` envelope and the backend persists it. The agent gets no Write or Bash tool (`web/src/lib/cv-envelope.mjs:1-20`). V.

### Fact and structure gates
- `verify-cv-facts.mjs` blocks fabrication against cv.md, article-digest.md and cv-facts.json. `generate-pdf.mjs` runs it at `:1715` through `assertFacts`. `generate-latex.mjs` runs it too. V.
- `verify-cv-structure.mjs` is a non-blocking warning for a payload that silently loses or reorders cv.md structure (`verify-cv-structure.mjs:3-16`). V.
- `cv-title-check.mjs` flags an exact-string job-title mismatch against cv.md (`:3-16`). Warn-only. V.
- `verify-ats.mjs` scores a generated HTML from 0 to 100 with issues. It has `--keywords`, `--role`, `--min-score` and `--json` (`:3-16`). V.
- `ats-payload.mjs` folds `competencies` into `skills` and has three lints that only report (`:3-16`). V.
- `story-provenance-check.mjs` and `cv-sync-check.mjs` also exist (headers V).

### Import and export
- JSON Resume (jsonresume.org): G. A case-insensitive grep for "json resume" and "jsonresume" outside CHANGELOG returned nothing. There is no import or export.
- LinkedIn:
  - `linkedin-import.mjs` and `lib/linkedin-import.mjs` import job alert emails into the pipeline, not profile data (`linkedin-import.mjs:10-18`). V.
  - `linkedin-join.mjs` reads a connections CSV (AGENTS.md table).
  - The `intake` mode reads `documents/` (master CV, LinkedIn export PDF) and proposes additions. It never writes without confirmation, and there is no .docx support (`intake.mjs:3-22`). V.
- CV ingest: `/api/cv/ingest` converts an uploaded PDF to cv.md markdown through the user's configured CLI. It only proposes, and the write goes through `POST /api/cv` (`web/src/app/api/cv/ingest/route.ts:20-25`). V.
- Export formats are PDF, LaTeX and markdown text only (N, from the `output_format` options).
- Public share links: G. I found none. This is partly unverified, since I did not grep for "share".

### Visual or WYSIWYG editing
There are two web surfaces.
- `/cv` (`web/src/app/cv/page.tsx:1-7`) renders `CvEditor`. It is a cv.md markdown editor with autosave (600 ms) and an upload-and-ingest panel (`web/src/components/cv-editor.tsx:3-35`). V.
- `/pipeline/[id]/cv-studio` is the CV Studio (V for the domain, N for the UI).
  - It works per bullet on one tailored CV against the base CV, with keywords from the report.
  - Edits are `StudioEdits`: `use` (tailored, base or custom), `hidden`, `shown`, `order`, `restored`, and a preset of length (full or one-page) and tone (`web/src/lib/cv-studio/studio.mjs:1-35`).
  - Edits are stored per report in `.career-ops-web/cv-studio/*.json` and bound to the HTML by `sourceHash` (`studio.mjs:5-9`, `DATA_CONTRACT.md` User Layer table).
  - There is an AI rewrite route (`api/cv-studio/[n]/rewrite`), a live paged preview iframe (`components/cv-studio/cv-preview.tsx:1-25`) and a page estimator (`page-estimate.mjs`).
  - A saved result is written as an `-edited` output and re-rendered to PDF (`server.ts:10-16`).
- Not present: drag-and-drop section layout, in-browser template picker or theme editor, or a JSON-schema form editor. Template and style choice live in YAML. This is partly an absence claim I did not exhaustively grep.

## 2. Web UI, Go TUI, tracker index

### `web/` (Next.js 16, React 19, name `@career-ops/web` v0.17.0, `web/package.json`). V.
Pages (`web/src/app/**/page.tsx`, listed by `find`):
- `/` home
- `/analytics`
- `/apply`
- `/config`
- `/cv`
- `/documents` (lists output PDFs by kind cv or cover, with date and report id; `documents/page.tsx:7-16`)
- `/explore`
- `/followups`
- `/jobs`, `/jobs/[id]`
- `/pipeline`
- `/pipeline/[id]` (report view)
- `/pipeline/[id]/apply`
- `/pipeline/[id]/cv-studio`
- `/pipeline/compare`
- `/portals`
- `/scheduled-scans`
- `/login`

Notes:
- Pipeline list: a sortable table with checkboxes, a resume column, and Compare for the selected rows up to `COMPARE_MAX` (`pipeline-view.tsx:324`, `:722-728`). I found no kanban or board view (G on `pipeline-view.tsx` for kanban, board and drag).
- Report page: `ReportView` with a `StatusSelect` and the tailored-CV and cover-letter PDF links (`app/pipeline/[id]/page.tsx:41-62`, `report-view.tsx:120`).
- What's-new: `GET /api/whats-new` is the zero-token "new matches this week" feed. It reads `data/scan-history.tsv` for roles from the last N days (1 to 30, default 7) that the user has not evaluated (`app/api/whats-new/route.ts:12-29`). V.
- API routes include: apply (close, drive, fill, prefill, session), assistant, cv, cv-pdf, cover-pdf, cv-studio, documents, explore, followups (cadence, log, override, seed), pipeline, portals, profile, run, scheduled-jobs, scheduler, stats, status, tracker/delete, upskill and linkedin-import. V by `find` listing. Their handlers are N.

Apply flow:
- Files are in `web/src/lib/apply/`: `session.ts`, `drive.ts`, `planner.ts`, `greenhouse.ts`, `cv.ts`, `cover.ts`, `submit-guard.mjs` and others. N for logic.
- `resume-label.mjs:7-13`: a regex `RESUME_LABEL_RX` matches a form file-field label that asks for a résumé or CV, in many locales. `isResumeLabel()` is shared by the fill step (`session.ts`) and the review screen (`apply-view.tsx`), so the badge and the upload agree. Other uploads are left to the person. V.

How the web calls core:
- `rootScript(name)` resolves `<checkout>/<name>.mjs` at runtime, so Next does not bundle it (`web/src/lib/career-ops.ts:18-23`). V.
- Scripts are spawned as child processes. For example `api/run/route.ts:5-25` imports `spawn`, `spawnHeadlessCli`, `resolvePdfPaths` and `renderAndMarkPdf`, and runs the user's agent CLI in headless mode. V.
- `claude-invocation.mjs` defines per-worker-kind tool allow lists. `WRITE_CAPABLE_TOOLS = Write, Edit, MultiEdit, NotebookEdit, Bash` (`:30`). Deny lists are derived from the allow lists. `pdf` has no Bash since #2172 (`:1-21`). V.
- Data-root and tracker reads are reimplemented in TS (`career-ops.ts:1-30`: `readTrackerFile`, `parseApplications`, `parseStatusLog`). V.

### Go TUI (`dashboard/`)
- `dashboard/README.md:3-20` (V): a standalone, optional Go TUI. It has filter tabs, sort modes, grouped and flat views, lazy report previews and an inline status picker. It opens the posting with `o`. It reads the tracker directly. A status change runs `set-status.mjs` and a PDF runs `generate-pdf.mjs`. The DATE column comes from `status-log.tsv`. It needs an existing tracker.
- Screens: `dashboard/internal/ui/screens/{fit,pipeline,progress,stats,viewer}.go` (`find` listing).
- Data layer: `dashboard/internal/data/{career,derive,funnel_history,pdf,stats,status_writer}.go` and others (`find` listing).

### `tracker.mjs` and the sqlite index
- Derived `applications.db` built with built-in `node:sqlite` (Node 22.13 or later). `applications.md` stays the source of truth (`tracker.mjs:3-10`, `:38`). V.
- Tables (`tracker.mjs:233-262`): `applications(id, pos, date, company, role, score, status, pdf, report, notes, extras)`, `status_events(app_id, status, date, source)` and `meta`.
- Commands: `sync [--check]`, `query [--status --company --role --since --min-score --id --limit --csv --json]`, `history`, `export` and `delete --num N` (`:11-20`). V.
- The index is safe to delete and rebuilds from the ledger. "Phase 2" (DB as source of truth) is explicitly not implemented (`:6-7`). V.

## 3. Application tracking

### Data model
- `data/applications.md` is a markdown table with these columns (AGENTS.md TSV section and `tracker.mjs:233-245`): `# | Date | Company | Role | Score | Status | PDF | Report | Notes`. A URL column is optional and a Via column is optional (AGENTS.md). V. `data/` in this checkout holds only `offers/`, `parser-output/` and `pipeline.md`, so there is no live tracker here.
- States are in `templates/states.yml:16-80`. V.
  - They are: evaluated, applied, responded, assessment, interview, offer, rejected, discarded, skip, hired.
  - Terminal: offer, rejected, discarded, skip, hired.
  - Each has `aliases` (multilingual) and `dashboard_group`.
- `data/status-log.tsv` is an append-only ledger with the format `{tracker#}\t{date}\t{from}\t{to}\t{source}\t{note}`. It is a sibling of the tracker file, and set-status appends to it. Corrections are new `correction` lines (`DATA_CONTRACT.md:62`). V.
- `data/active-interviews.md` is a user-pasted table `| Company | Role | Round | Date/Time | Interviewer | Status | Notes |`. See `docs/SCRIPTS.md:1478` for the header, V. `ics-interview.mjs` reads an .ics invite and prints a ready-to-paste row. It never writes the file (`ics-interview.mjs:3-22`, V). `rejection-latency.mjs` and `process-quality.mjs` read it. `rejection-latency.mjs:135-363` parses a YYYY-MM-DD date from the Date/Time cell and skips rows it cannot parse. V for the date parsing, N for the rest.
- `data/follow-ups.md` holds logged follow-ups (`DATA_CONTRACT.md:52`). The web type `FollowupLogEntry` has `num`, `appNum` and a channel of Email, LinkedIn, Phone or Other (`web/src/lib/followups.ts:6-9`, `:30-40`). `followup-cadence.mjs` computes overdue follow-ups from profile settings (`applied_first_days`, `applied_subsequent_days`, `applied_max_followups`, `responded_*`, `interview_thankyou_days`; `followups.ts:12-24`) and extracts contacts (`followup-cadence.mjs:3-12`). V.
- `data/contacts.tsv` is `{name}\t{company}\t{type}\t{title}\t{phone}\t{email}\t{linkedin}\t{tracker#|-}\t{notes}`. The `type` is recruiter, hiring-manager, peer, interviewer, internal-referral or other. `contacts.mjs` exports vCard 3.0 (`DATA_CONTRACT.md:66`, `contacts.mjs:3-15`). V. The tracker# column links a contact to an application.
- `data/salary-observations.tsv`: `{tracker#}\t{date}\t{desired|advertised|actual}\t{amount}\t{currency}\t{source}\t{note}`. Append-only (`DATA_CONTRACT.md:61`). V. Offer details are otherwise only in free text in Notes, plus the `offer-prep` mode (N).
- `interview-prep/` holds `story-bank.md`, `{company}-{role}.md` and `sessions/*.md` (real and mock transcripts) (`DATA_CONTRACT.md:25-27`). V.
- `outcome.mjs <tracker#|company> <type>` (`outcome.mjs:3-19`, V):
  - The types are interview_progress, offer_received, hired, offer_declined, rejected, no_response and interview_only (plus aliases in `lib/outcome-types.mjs:26-41`).
  - It archives into `data/outcomes/{num}_{company}_{role}/` with `submitted_cv.md`, `submitted_cover_letter.md`, `posting.pdf` (or `posting_missing.md`) and an append-only `outcome.md`.
  - It syncs the tracker state through `set-status.mjs` under the shared lock.
- `data/pdf-index.tsv` links PDFs to reports (`DATA_CONTRACT.md:58`). `data/outcomes/*` is user data (`:60`).
- Other trackers: `data/blacklist.md`, `data/scan-history.tsv`, `data/assessments.tsv` (assessment-log.mjs, including take-home deadlines) and `data/reply-candidates.json` (AGENTS.md table).

### Write paths
- `set-status.mjs <tracker#|company> <state> [--note] [--role] [--row N] [--report N] [--force] [--dry-run]` is the canonical status or note update. It does strict states.yml validation, takes the shared lock and writes atomically (`set-status.mjs:3-30`, AGENTS.md rule 2). V.
- `merge-tracker.mjs` merges `batch/tracker-additions/*.tsv`, deduping by URL, then report number, then fuzzy company and role (`merge-tracker.mjs:3-25`). It sorts by `#` ascending and has migration flags. V.
- New rows are never hand-edited into the table. They go through TSV plus merge (AGENTS.md "Pipeline Integrity"). V.
- `tracker.mjs delete --num N` removes a row and reindexes. The web `/api/tracker/delete` route sits behind a feature probe, `trackerCanDelete()` (`career-ops.ts:27-34`). V.
- The Go TUI writes status through `set-status.mjs` (`dashboard/README.md`). V.

### Missing versus a typical kanban job tracker (what the repo does not have)
- No board view with drag-and-drop columns in the web app (G for pipeline-view). Status changes go through a dropdown (`StatusSelect`) or the TUI's picker.
- No per-application structured interview rounds with dates in the tracker itself. `active-interviews.md` is a hand-pasted free-form table that scripts only read (except via the .ics helper).
- No structured offer record (salary, equity, deadline) on the application row. Salary observations are a separate TSV and offer-prep is a mode.
- Documents per application: only the report, `pdf-index.tsv` and the `outcome` archive. There is no attachment store on the row.
- Contacts link to an application only through the `tracker#` column of `contacts.tsv`. There is no contact entity on the row.
- Reminders: follow-up cadence exists, but there is no calendar push or notification. N, so check `/followups` and `scheduled-scans` for scheduling.
- No app-level multi-user model. The data is local-first, with a `/login` page that I did not read.

## Data contract and registration
- User Layer is preserved by updates. System Layer is auto-updatable (AGENTS.md "Data Contract"). `USER_PATHS` is at `update-system.mjs:334-358`. It includes `cv.md`, `config/profile.yml`, `data/`, `reports/`, `output/`, `interview-prep/`, `documents/`, `config/cv-facts.json`, `.claude/settings.json` and `.claude/hooks/`. V.
- `SYSTEM_PATHS` is an exported array literal at `lib/update-manifest.mjs:36` that `apply()` prunes against. V.
- A new user-layer data file under `data/` is already covered by the `data/` entry. Update the `DATA_CONTRACT.md` table to document it.
- A new system script, template or doc has to be added to `SYSTEM_PATHS`, or `node validate-system-paths-coverage.mjs` fails (`dev-workflow.md` rule 4).
- A fork-local file at the repo root, or in a directory upstream does not ship, goes in `config/local-paths.txt` (read at `update-system.mjs:370`, `:401`). It currently lists `.claude/rules/`, `.claude/agents/`, `.githooks/`, `.serena/`, `.upstream-review/` and `FORK.md` (V).
- A user-layer file must never land in `modes/_shared.md`, scripts, templates or AGENTS.md (`dev-workflow.md` rule 5).

## Test conventions
- New test: its own file `tests/*.test.mjs`. Never a numbered section in `test-all.mjs`, never a `*.test.mjs` at the repo root, and no `process.exit()` or `finish()` in a discovered suite. Entry-point checks use `isMainModule(import.meta.url)` from `lib/is-main-module.mjs`. Chromium and TeX suites declare `toolRequired('browser'|'latex')` (`dev-workflow.md`; `tests/required-tools.mjs:51`). V.
- There are 937 files under `tests/` and `ls tests/*.test.mjs | wc -l` reported 937 (I did not separate subdirectories). The web has its own `npm test` with `node --test "tests/**/*.test.mjs"` (`web/package.json`). V.
- `node test-all.mjs` supports `--quick`, `--only <substring>`, `--needs browser,latex` and `--jobs N` (`test-all.mjs:9-24`). V.
- Before push: `npm run lint`, then `node test-all.mjs --quick`. Changes under `dashboard/` or to `states.yml` also need `go test ./...` from `dashboard/` (`dev-workflow.md`). V. The auto-memory note says `npm run lint` exits 2 from a wrapper, so run `scripts/check-syntax.mjs` directly. I did not re-run that.
- `tests/cv-visual/` holds the Playwright visual regression suites (`cv-visual.test.mjs`, `baselines.json`, a Dockerfile). V by `ls`.

## Fork rules
- `FORK.md:1-38` (V): the fork is `jrmatherly/career-ops`. All deliberate divergence has a row in the deviations table in `.claude/skills/upstream-review/SKILL.md`. Upstream is merged, not rebased, through `/upstream-review`. `tests/fork-deviations-covered.test.mjs` fails when a diverged path has no row.
- The deviations table is under "## Deviations decided" (`SKILL.md:105`). Example rows: `.claude/` harness (line 111) and the 9 CI workflows (line 117). A new deviation gets a row, a skip is a revert with the upstream SHA in the row, and a deleted path also gets a line in "Deleted or moved paths" (`:107`). V.
- `dev-workflow.md` also says:
  - Conventional Commits with a scope, enforced by `.githooks/commit-msg`.
  - The fork cuts no releases.
  - Never run `update-system.mjs apply`, `npm run update` or `./cops update` here.
  - A new feature needs an upstream issue first; bug fixes, providers and docs go straight to a PR.
  - The pre-commit hook refuses newly added gitignored files.
- My auto-memory notes say another session may be mid-edit in this checkout (use a sibling worktree), and that `fork-deviations-covered` diffs HEAD, so rerun it after committing. Not re-verified.

## Largest gaps, my inference
1. There is no structured resume document model with a JSON Resume or Reactive-Resume-style schema. The source of truth is free-form `cv.md`, and the payload shape differs between HTML and LaTeX. Without a typed schema, a visual builder, import or export, and public pages cannot share one model.
2. There is no WYSIWYG or template/theme editor. Theming is YAML plus CSS variables, and CV Studio edits only bullets and order on one tailored CV.
3. There are no public share links or hosted resume pages. The product is local-first, and PDF, LaTeX and markdown are the only outputs.
4. The web pipeline has no kanban board and no drag-and-drop between states. It is a sortable table with a status dropdown, and the Go TUI is similar.
5. Per-application detail is thin. There are no structured interview rounds, offer details, attached documents, contact records or reminders on the row. They are spread across `active-interviews.md`, `salary-observations.tsv`, `contacts.tsv` and `outcomes/`, so a kanban card would have to join several files by tracker#.

Unchecked: the web page contents beyond headers, the `modes/*.md` instructions, `lib/page-format.mjs`, the `/login` auth model, and anything under `docs/` beyond the cited lines.
