# Reactive Resume convergence, 2026-11-06

Design for bringing the features of Reactive Resume v6 that career-ops lacks into this fork, so one project covers job finding, resume building and checking, application tracking, and public sharing. Decisions here come from six read-only research passes over both repositories, two prototypes, and four rounds of questions answered by the operator on 2026-11-06. Research reports live outside the repo in the session scratchpad and are summarised where a decision depends on them.

Reactive Resume (RR) is at `reactive-resume/reactive-resume`, MIT, v6.1.0 released 2026-11-05, clone HEAD `d065a9f7`. career-ops upstream is `career-ops-hq/career-ops` 1.39.0, this fork is `jrmatherly/career-ops` at `42f2c07b`.

## What the operator asked for

- All four feature families. A typed resume model with imports, a kanban tracker with a richer application record, a Check mode with a design editor, and sharing with exports.
- Public share links and multi-user capability, while keeping career-ops's agent-first file contract.
- Better Auth for every authentication need.
- Migration of the operator's own RR data. The operator runs RR v6 at `resume.matherly.net` (Kubernetes, Postgres 18, Pocket ID OIDC, R2) and keeps exports at `~/dev/job-search/matherly-ats.json` and `matherly-resume.json` (RR v6 resume JSON, templates `scizor` and `azurill`), plus `~/dev/job-search/jobs/applications.csv` (8 rows, RR CSV import shape).
- No upstream issues. Every change gets a row in the deviations table of `.claude/skills/upstream-review/SKILL.md` so upstream can still be merged and cherry-picked.

## What exists today

career-ops (the operator runs it as the upstream Claude Code plugin 1.39.0 with data root `~/career-ops-data`, 58 tracker rows, 48 reports):

- Resume. `cv.md` is the canonical CV and the source for every fact gate. `build-cv-html.mjs` renders a JSON payload (`lib/cv-payload-schema.mjs`) into one of eight HTML templates in about 85 ms; `generate-pdf.mjs` prints it with Playwright. Theming is YAML `style:` mapped to CSS variables in `theme-style.mjs`. Checks are `verify-cv-facts.mjs`, `verify-cv-structure.mjs`, `cv-title-check.mjs`, `verify-ats.mjs` (13 HTML-level ids) and `ats-payload.mjs`. There is no structured resume model, no JSON Resume or LinkedIn import, no DOCX export.
- Web. Next.js 16, React 19, Tailwind v4, hand-rolled UI, no zod, no drag-and-drop library, no auth (the `login/` folder holds a loading skeleton only), loopback bind plus an origin guard in `web/src/proxy.ts`. The pipeline is a 1050-line table with a per-row `StatusSelect` that posts to `/api/status`, which runs `set-status.mjs`. CV Studio edits an LLM-written HTML per report and previews it in an iframe. The web never calls `build-cv-html.mjs`.
- Tracker. `data/applications.md` with ten canonical states in `templates/states.yml`, an append-only `data/status-log.tsv`, and sidecars keyed by tracker number (`contacts.tsv`, `salary-observations.tsv`, `follow-ups.md`, `active-interviews.md`, `data/outcomes/`). `import-tracker.mjs` already imports Teal, Huntr and Simplify CSVs through the normal TSV plus `merge-tracker.mjs` path. No kanban, no lanes, no per-application timeline, no structured interview rounds or offer terms.

Reactive Resume v6 (verified in the clone):

- A pure Zod resume schema (`packages/schema/src/resume/`, about 2,300 lines) with basics, twelve sections, custom sections, structured dates, and design, typography, page and layout metadata. Eighteen React templates on the Forme PDF engine. Importers for RR JSON, JSON Resume, LinkedIn zip, DOCX and PDF (`packages/import/`, `fflate` only, except PDF which needs `pdfjs-dist`). A 23-rule Check (`packages/resume/src/ats/`, pure functions over the JSON). DOCX and ODT exports.
- An application tracker with six stages, up to 40 custom lanes, closed reasons, a timeline of stage, note and interview entries with IANA timezones, contacts, follow-up dates, offer terms, a next-step engine, CSV import and export, duplicate detection by canonical URL, and board, list, insights and calendar views.
- Public pages served as script-free HTML with a bcrypt password, an HMAC cookie, hourly per-visitor view dedup, and feedback links with frozen snapshots and unstored signed tokens. Better Auth with email, Google, GitHub, LinkedIn, generic OIDC, API keys, 2FA and passkeys.

The operator's `~/dev/job-search/tools/` already bridges the two by hand. `build_cv_md.py` turns the RR JSON into `cv.md`, `push_tailored.py` patches tailored copies through RR's MCP, and `rebuild_career.py` refills RR's career knowledge from career-ops. This program replaces the first and retires the other two.

## Decisions

### cv.md stays canonical, resume.json is an absorbed sidecar

The agent contract stays whole. `cv.md` remains the one canonical fact file that AGENTS.md names and the fact gate reads, and the four sanctioned writers (`add`, `expand`, `intake`, `interview`) and the web CV editor keep writing it unchanged. The addition is `data/resume.json`, a resume in Reactive Resume v6 JSON that is derived from `cv.md` and holds only what markdown cannot carry (ids, hidden flags, links, design, typography, structured dates, role grouping, skill levels). Upstream already follows this pattern for its own structured model. `data/career-profile.yml` is built from `cv.md` and is "a reviewed selection index, not an additional primary source" (`modes/master-profile.md:123`). The two files are siblings, both derived from `cv.md`.

The rule, enforced the same way by the CLI and the editor:

1. `resume.json` records the sha256 of the `cv.md` it was absorbed from and is valid only for that text. Every read for editing, rendering or sharing absorbs the current `cv.md` first, matching entries by normalised company plus dates (the key `cv-title-check.mjs` already uses, so a retitle is a changed entry, not an orphan) and bullets by sequence alignment. The absorb also records the file's own heading names, dash style and contact-line labels, and regeneration reproduces them, so a hand-written `cv.md` in the shipped example's shape passes the gate unchanged.
2. Lossless gate. An absorb is saved only if regenerating `cv.md` from the absorbed JSON reproduces the file after whitespace and date normalisation. On failure nothing is written. The editor goes read-only on the failing entries and lists unparsed lines, orphans (an entry whose key vanished, usually a rename), new entries and reorders. The user edits `cv.md`, or confirms "same entry, renamed", which pairs the orphan with the new entry and keeps its id. Orphans are never deleted without that confirmation. There is no Overwrite button.
3. Save order. A save first records the hash of the markdown it is about to write in `resume.json` as pending, then writes `cv.md` through the locked `replaceUserFile` only if the file still has the hash the editor read (else it refuses and the editor re-absorbs), then clears pending. A crash between the writes leaves pending set, and the next absorb recognises a `cv.md` with that hash as already saved.
4. Every text field the editor can change is emitted to `cv.md`, including contact lines, certifications, awards, languages, interests, publications, volunteer work, references and custom sections. Only presentation fields live solely in `resume.json`, under one root key `careerOps` (the career-ops template name, the style tokens, the hashes and the recorded file style), because RR's own `metadata.template` is an enum of RR template names.
5. First adoption. A `cv.md` outside the parseable shape fails the gate with its unparsed lines listed. The one path that writes `cv.md` from JSON is `resume.mjs adopt`, which shows the diff, keeps a backup and writes only on explicit confirmation.

A throwaway prototype on Reactive Resume's sample proved the round trip. No-op, bullet edit, bullet add with bold and a link, bullet delete, summary reword, skill edit, an `add-entry.mjs` project insert and an edit inside a hidden entry all absorbed and regenerated byte-identical. An appended job landed out of order and an en dash in a date was lost, both fixed by inserting at the parsed position and keeping the raw period text. Anchor comments in `cv.md` are out, because `career-profile.mjs import` reads them as headings. The prototype did not absorb a hand-written `cv.md` with no prior JSON or generate every section; both are PR-02 requirements with tests.

Adopting RR's own JSON, rather than inventing a format, means the operator's exports import without conversion, RR's importers and Check rules port unchanged, and the file round-trips back to any RR instance. The import path therefore writes `cv.md` (through the same regeneration) and then absorbs it, so an import is just another `cv.md` write.

Rejected. `resume.json` as the canonical file with the modes redirected (at least eleven upstream files change, among them `modes/expand.md`, and every future upstream writer of `cv.md` reintroduces silent loss). A dual model with a hash guard and an Overwrite button (one click deletes facts a mode added). Extending `career-profile.yml` into the model (its facts need `cv.md` line evidence and its ids are content hashes that change on every edit). A Postgres mirror. Replacing `cv.md` outright.

### Sharing is a separate fork-local service

Public share links are served by a new service under `publish/` in this repo, not by the Next.js app. Research found that the web app has no auth, that its agent runs are granted tools by name rather than by path, and that `careerOpsRoot()` is process-global at 103 call sites across 49 files in the most-churned area of upstream (411 commits in 90 days). The service receives already-rendered, script-free CV HTML from a CLI and serves it under a slug with a password gate, view counts, hide-contact-details and reviewer feedback links. View counts and comments are pulled back into `data/shares.json` and `data/share-feedback/{slug}.md`, so agents read feedback the same way they read everything else.

The prototype that proves the five risky claims (standalone render under a strict CSP, password gate, correct view counting under concurrency, feedback round-trip, contact hiding) is recorded in Appendix A of the plan.

Rejected. Publishing through the operator's RR instance (keeps sharing in a second product). Request-scoped data roots inside the Next.js app (not a security boundary without OS sandboxing; conflicts with every upstream merge).

### Authentication is Better Auth

The publish service uses Better Auth 1.7 mounted with `toNodeHandler` on `node:http`, with the built-in Kysely adapter over a `node:sqlite` `DatabaseSync` (the same driver the service uses for its own tables, no native build, `npx auth migrate` works against it). Plugins are `@better-auth/api-key` for CLI uploads (keys carry `permissions: { share: ["upload"] }`, the service calls `verifyApiKey` itself and strips `x-api-key` before any cookie lookup, session mocking stays off, a real per-key budget replaces the 10-per-day default), and `genericOAuth` with `discoveryUrl` to Pocket ID and `disableSignUp: true`. Email and password sign-in is never enabled. A `validateUserInfo` allow-list of emails gates who may sign in. `twoFactor` and `@better-auth/passkey` are optional later additions. A prototype on better-auth 1.7.14 ran the migration, served `/api/auth/ok`, and resolved both an `x-api-key` header and a signed session cookie.

### Multi-user is sharing-only first

Accounts live only on the publish service. Each person runs career-ops locally and uploads rendered CVs with their own API key, which is how Reactive Resume's own API works. This changes no upstream file and the prototype already proves the key path.

A Better Auth login in front of the single-user dashboard (so it can leave loopback) is deferred. It is a login, not tenancy, because the data root is process-global and agent tool grants are by name, not path. It also needs an exemption in the origin guard for the OIDC callback. One container per user behind a gateway, with per-user hostnames, is deferred until a second person needs their own career-ops. When that day comes, Envoy Gateway's native OIDC against Pocket ID is the recommended identity source rather than a Better Auth forward-auth service to maintain.

### Tracker stays at ten states, richer data goes in sidecars

RR's lanes, tags, closed reasons, lead source, note timeline and interview details have no home in `applications.md`. Adding states or columns costs about ten pinned test files, two web lists, the Go dashboard parity tests and the funnel definitions. Instead two append-only TSVs keyed by tracker number are added under `data/`, which `USER_PATHS` already covers:

- `data/application-meta.tsv` with `{num}\t{date}\t{key}\t{value}\t{source}`, latest value per (num, key) wins, keys `lane`, `tag`, `closed_reason`, `source`, `closed_at`.
- `data/application-events.tsv` with `{num}\t{datetime}\t{kind}\t{text}\t{source}`, kinds `note`, `contact`, `import`.

Interview rounds reuse `data/active-interviews.md` with timezone and duration packed into the Date/Time cell, because every reader takes only the leading date. The missing piece is a writer, which the plan adds. Offer terms go to `data/offers/{num}-terms.md` plus `salary-observations.tsv` rows. The stage mapping for an RR import is `saved` to the pipeline inbox, `applied` to Applied, `screening` to Responded (not Assessment, which is an async test), `interview` and `offer` unchanged, and `closed` by reason to Rejected (`not-selected`), Hired (`accepted`) or Discarded (`withdrew`, `accepted-other`, `no-response`, none). Rows RR never submitted are skipped.

### Kanban is a view over the existing status write path

A board page in the web app shows the ten states as columns, with the optional lane from `application-meta.tsv` as a sub-grouping. A drop posts to `/api/status`, the existing path with its undo and ledger. A lane-only move appends to `application-meta.tsv` and never touches the tracker. Native HTML5 drag and drop with a keyboard fallback, no new dependency. The detail sheet joins `status-log.tsv`, the two new sidecars, `active-interviews.md`, `contacts.tsv` and `follow-ups.md` by tracker number, and a port of RR's next-step engine (pure, 10-day no-reply default) labels each card.

### Check mode is two layers

RR's 23 data rules (contact, dates, layout, headings, writing) port to `lib/resume/check.mjs` and run on `data/resume.json` or the payload. `verify-ats.mjs` keeps checking the rendered HTML (charset, fonts, hidden text, tables, multi-column). The two sets do not overlap, as the research tabulated. The web panel pins each finding to a block id in the preview iframe, which CV Studio already assigns.

### Templates stay career-ops's own

RR's templates are React components on Forme and cannot be ported into the Playwright HTML pipeline. The eight HTML templates are exposed through a picker, and `theme-style.mjs` gains RR's design vocabulary (heading font and size, line height, section and item gaps, text and background colours, sidebar width) as CSS variables with `var(--x, default)` fallbacks, so an unset value keeps output byte-identical.

### Exports

Per-share hiding. `cv.md` keeps every section and item. `resume.json`'s own `hidden` flags are the default for a public render, and each share record stores an overlay of section keys and item ids to hide, applied to a copy at render time and never written back. Publishing refuses while the gate fails, so an item whose identity changed cannot reappear in public under a stale overlay.

DOCX from the payload with the `docx` package, as RR does. ODT is deferred. PDF, LaTeX and markdown already exist. RR JSON and JSON Resume exports come from the model.

### Versions and trash

The data root is a directory the operator can keep under git. Resume versions are the git history of `data/resume.json`. No version UI and no trash feature in this program.

### Licence

Vendored RR code keeps the MIT notice (copyright Amruth Pillai) in a `THIRD_PARTY_NOTICES.md` and a header comment per file.

### Install path

The operator runs upstream's plugin. The fork is installed from the `jrmatherly/career-ops` GitHub marketplace, the route `docs/CLAUDE_PLUGIN.md` documents for a fork, so daily use tracks the fork's `main` and never the branch a dev checkout happens to have, and user data cannot land in the checkout.

## Constraints

- A new tracked file must be claimed by `SYSTEM_PATHS`, `USER_PATHS` or `config/local-paths.txt`. Fork-local root scripts, new `lib/` modules and `publish/` go in `config/local-paths.txt` (`SYSTEM_PATHS` names `lib/` files one by one, so nothing new falls under it). Files inside shipped directories are covered by that directory's entry and get a deviations row. New `data/` files are covered and get a `DATA_CONTRACT.md` row.
- Every diverged upstream path gets a deviations row. `tests/fork-deviations-covered.test.mjs` diffs HEAD, so it runs after committing.
- New scripts resolve the root through `path-resolver.mjs`, use `isMainModule`, and never write the tracker except through `merge-tracker.mjs` and `set-status.mjs`. Reconstructed history goes to `status-log.tsv` with source `backfill`.
- Headless workers never gain write tools. An AI "improve this" feature follows the CV Studio rewrite route pattern.
- Conventional Commits with a scope. Before push, `node scripts/check-syntax.mjs` and `node test-all.mjs --quick`. Changes under `dashboard/` or to `states.yml` also need `go -C dashboard test ./...`.
- Node 22.13 or newer for `node:sqlite`. The operator has 24.22.2.
- Source-of-truth boundary. Imported RR knowledge (facts, stories, AI answers) is never imported into generated content. Only the resume JSON and the tracker rows cross.

## Out of scope

RR's mobile app, Forme templates, PDF import, the AI coach and discovery scheduler, ODT export, account trash, and a custom-domain feature on the publish service. Each is a possible later program.
