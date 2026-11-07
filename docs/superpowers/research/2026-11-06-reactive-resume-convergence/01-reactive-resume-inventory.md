# Reactive Resume v6 feature inventory

Subagent research report, 2026-11-06. Model output: claims carry file:line evidence or are labelled inference; verify against the code before relying on one.

# Reactive Resume feature inventory (November 2026)

- Clone: `/private/tmp/claude-501/-Users-jason-dev-career-ops/9d4e3414-0fa5-470a-ad4f-a6db69a9b9c4/scratchpad/rr/repo`
- HEAD SHA: `d065a9f76538afda5da5de9374da2ed51f96c1e4` (commit dated 2026-11-07 00:17 +0100)
- Nothing was run from inside the clone. All of it is read-only. I wrote nothing in `/Users/jason/dev/career-ops`.
- "V" means verified from source or `gh` output. "I" means inferred. Paths are relative to the clone root.
- Line numbers: I recorded them only for the career-ops-relevant files where I grepped (e.g. the `templateSchema` at `packages/schema/src/templates.ts:3`). Elsewhere the citation is file-level.
- I did not read every file. The sections on the career coach, offers and the application workspace come from the schema, the DB and the docs. I did not trace their service code.

## Headline

The older "JSON resume builder" picture of Reactive Resume is out of date. v6 is a "resume builder + cover letters + ATS-style check + job application tracker + AI career workspace". The project's own README says it is "for writing resumes and cover letters, checking your work, and tracking job applications" (`README.md:8`, V).

## 1. Repo metadata (V, `gh repo view`)

- Default branch is `main`. Stars: 45,427. Description: "A one-of-a-kind resume builder that keeps your privacy in mind…".
- License is MIT (`licenseInfo.key: mit`; also `LICENSE`, and `package.json` declares `"license": "MIT"`).
- Latest release is `v6.1.0`, published 2026-11-05T03:55:20Z. The changelog dates it 4 Nov 2026 (`docs/changelog/index.mdx:7`).
- Release cadence is high: v6.0.0 on 2026-10-04, then v6.0.1 through v6.0.9 and v6.1.0 within about a month. Separate `forme-native-*` pre-releases also appear.

## 2. Tech stack (V unless noted)

- **Monorepo:** pnpm workspaces and Turbo. `apps/` holds `web`, `server` and `mobile`. `packages/` holds `ai, api, auth, config, db, docx, dsh-plugin, email, env, fonts, forme-native, import, mcp, odt, pdf, resume, schema, ui, utils` (`package.json` workspaces, `AGENTS.md` ownership map). Node 24 (`package.json` engines).
- **Web:** a client-rendered React SPA with TanStack Router (file-based routes) and TipTap rich text. It also uses `@dnd-kit/core`, Lingui for i18n, and `pdfjs-dist` for preview (`apps/web/package.json`, `apps/web/PRODUCT.md`).
- **Server:** Hono plus oRPC, with an OpenAPI spec (`docs/spec.json`) and an MCP transport (`apps/server/src/{http,rpc,mcp,openapi}`, per `AGENTS.md`).
- **Mobile:** an Expo/React Native app in `apps/mobile`. App Store and Play Store badges are in `README.md:17-18`. `AGENTS.md` requires web/mobile parity for user-facing changes.
- **DB:** PostgreSQL through Drizzle ORM (`packages/db/src/schema/*.ts`, `migrations/`). Redis is used for agent streaming and is optional outside Vercel (`compose.yml`, `docs/self-hosting/upgrading-to-v6.mdx`).
- **Storage:** S3-compatible. The dev compose uses SeaweedFS. Local-disk and Vercel Blob are also mentioned (`compose.yml`, `upgrading-to-v6.mdx`).
- **Auth:** Better Auth (`packages/auth/src/config.ts`).
- **PDF:** the in-house "Forme" engine (`@formepdf/core` and `@formepdf/react` 0.31.0 in `apps/server/package.json`). README says "Live PDF preview and browser downloads powered by Forme, rendered in a background worker" (`README.md:92`). There is no Chromium or printer service. The docs state the `PRINTER_*`, `BROWSERLESS_*` and `CHROME_*` variables "are no longer read" (`docs/self-hosting/environment-variables.mdx:24-25`). I did not read the Forme internals, so I can't say whether it uses WASM.
- **AI:** the Vercel AI SDK (`ai`) with provider packages for Anthropic, OpenAI, OpenAI-compatible, Google, Groq, Mistral, DeepSeek, xAI, Cerebras, Cohere, Fireworks, Perplexity and Together (`apps/server/package.json:17-29`). The README also names OpenRouter and Ollama (`README.md:133`).
- **Deploy targets:** Docker, Vercel, Cloudflare Workers, Hostinger, Kubernetes, NAS (`README.md:146`, `docs/self-hosting/*.mdx`, `wrangler.jsonc`, `vercel.json`).
- **i18n:** 55 `.po` locale files in `apps/web/locales` (V by `ls`; this includes the `en-US` source). Translations are managed through Crowdin (`crowdin.yml`).

## 3. Resume data schema (V, `packages/schema/src/resume/data.ts`)

The top level is `resumeDataSchema`, a Zod loose object. Its keys are `picture`, `basics`, `summary`, `sections`, `customSections` and `metadata`.

- **`basics`:** `name, headline, email, phone, location, website{label,url}, customFields[{id,icon,text,link}]`.
- **`summary`:** a section object with `title, icon, columns, hidden, showHeading, keepTogether, startOnNewPage, content` (HTML).
- **`sections`:** twelve fixed keys, each with `items[]`. All items share `id, hidden`.
  - `profiles`: `icon, iconColor, network, username, website`.
  - `experience`: `company, position, location, period, dates, website, description` (HTML), plus `roles[]{id, position, period, dates, description}` for multiple roles at one company.
  - `education`: `school, degree, area, grade, location, period, dates, website, description`.
  - `projects`: `name, period, dates, website, description`.
  - `skills`: `icon, iconColor, name, proficiency, level` (0-5), `keywords[]`. The section also has `keywordLayout` (inline or list) and `layout` (default or inline).
  - `languages`: `language, fluency, level` (0-5).
  - `interests`: `icon, iconColor, name, keywords[]`.
  - `awards`: `title, awarder, date, dates, website, description`.
  - `certifications`: `title, issuer, date, dates, website, description`.
  - `publications`: `title, publisher, date, dates, website, description`.
  - `volunteer`: `organization, location, period, dates, website, description`.
  - `references`: `name, position, website, phone, description`.
- **`customSections`:** a discriminated union on `type`. The types are the 13 above (`summary` through `references`, minus none) plus `cover-letter` (items are `recipient` and `content`). Each custom section reuses that type's item schema (`data.ts`, `sectionTypeSchema`). A custom section is therefore a user-titled, user-placed section that reuses a built-in item shape. There is no free-form schema.
- **`metadata`:**
  - `template` (an enum, default `onyx`), `layout{pages[...]}`, and `page` (gaps, margins, format, locale, `hideIcons`, `hideLinkUnderline`, …).
  - `design` (colors, level designs, entry headers) and `typography` (font family, weight and size, 6-24pt).
  - `notes` (private), `styleRules`, `stylesheet` (Semantic CSS), `web.showCredit`, and `check{ignored, hiddenTerms}`.
- **Structured dates:** items carry `dates` (`resumeDatesSchema`) alongside legacy text `period`/`date`. The schema notes that the text field is "written from `dates` on every save" (`data.ts`, `packages/schema/src/resume/dates.ts`).
- **Import:** JSON Resume, LinkedIn and PDF imports are covered in section 5.
- **JSON Resume export:** I found no JSON Resume export. The export docs list PDF, DOCX, ODT, Markdown and Reactive Resume JSON only (`docs/guides/exporting-your-resume.mdx:12-18`, V). Treat "no JSON Resume export" as likely true but not exhaustively searched.

## 4. Builder and editor features

- **Templates:** 18 (V). The `templateSchema` enum (`packages/schema/src/templates.ts:3`) is `azurill, bronzor, chikorita, ditgar, ditto, gengar, glalie, kakuna, lapras, leafish, meowth, onyx, persian, pikachu, porygon, rhyhorn, scizor, smeargle`.
  - `templateLayouts` (`:40`) tags each with columns (1 or 2), sidebar side, header placement and an `atsSafe` flag.
  - ATS-safe one-column templates: `bronzor, kakuna, lapras, meowth, onyx, persian, porygon, rhyhorn, scizor, smeargle`.
  - The gallery previews templates filled with your own content (`README.md:99-101`).
- **Editor modes:** four, as of v6: Write, Design, Check and Share (`docs/guides/whats-new-in-v6.mdx` table).
- **Theming:** font presets and custom fonts, colors, spacing (`gapX`, `gapY`, margins), A4 or Letter, left or right sidebar, and "fit to page" by density, margin and text size (`README.md:101-102`). It also supports Custom Styles as "Semantic CSS" with an on-page element picker (`README.md:103`; schema `styleRules`/`stylesheet`).
- **Layout:** multi-page layout with per-page sections, per-section column count (1-6), `keepTogether` and `startOnNewPage` (`data.ts`, `baseSectionSchema`).
- **Rich text:** TipTap, stored as HTML strings.
- **Editor extras:** autosave, local recovery of unsaved drafts, up to 200 undo steps (`README.md:94`). Automatic and named versions with restore (`resumeVersion` table, `packages/db/src/schema/resume.ts:98`). Trash with a 30-day recovery window (`README.md:118`). A resume can be locked from editing (`isLocked`).
- **Cover letters:** standalone documents with their own editor, exports and version history. They can be linked to a resume to sync sender details and design (`README.md:112-118`; `packages/db/src/schema/cover-letter.ts`).
- **AI assistant (V from README and docs):**
  - It sits beside a resume or letter. It proposes edits, with a diff and rationale, and the user accepts or rejects each one (`README.md:128-134`; `docs/guides/using-the-assistant.mdx:3`).
  - It can improve selected text, review writing and draft letters from a resume plus a posting.
  - It can translate a resume into a separate language copy ("Translate into…", changelog v6.1.0 highlights).
  - Optional web search and page reading are available. Self-hosters can configure shared AI providers.
  - I did not find a literal "change tone" or "fix grammar" button. The grammar-like feature is the AI "Writing" review (`apps/web/src/features/resume/editor/check/writing-tab.tsx`).
- **Public sharing (V, `packages/db/src/schema/resume.ts:18-43`):** `isPublic`, `slug`, an optional `password`, `showDownloadButtons`, `allowWordDownload`, `showInSearchEngines`, `hideContactDetails`, and `isPrimary`. A custom-domain table also exists (`packages/db/src/schema/custom-domain.ts`).
  - Share mode publishes a template-styled web page (`docs/guides/whats-new-in-v6.mdx`).
  - v6.1.0 added private feedback links per reviewer. They show the resume as it was when the link was made, collect comments, can show progress on up to 20 applications you choose, and expire (changelog v6.1.0 highlights). The tables are in `packages/db/src/schema/feedback.ts`.
- **View analytics (V):** the `resume_statistics` table holds `views, downloads, lastViewedAt, lastDownloadedAt`. A `resume_statistics_daily` table keeps per-day counts (`packages/db/src/schema/resume.ts:158-206`).
- **Export:** PDF, DOCX, ODT, Markdown, and Reactive Resume JSON (`docs/guides/exporting-your-resume.mdx:12-18`). DOCX and ODT are simplified layouts that won't match the PDF exactly. There is no printer service (see section 2).
- **Integrations:**
  - The REST API (oRPC/OpenAPI) is covered by an API key (`apikey` plugin in `packages/auth/src/config.ts`).
  - An MCP server exposes tools for resumes, cover letters and applications (`packages/mcp/src/mcp-tool-names.ts`: `list_resumes, create_resume, import_resume, apply_resume_patch, …, list_applications, create_application, update_application, get_application_stats, …`).
  - `packages/dsh-plugin` is a DeepSeek Harness plugin.
- **Account data tools:** account data export and account deletion are in the guides (`docs/guides/exporting-your-data.mdx`, `deleting-your-account.mdx`).

## 5. Job tracking: it exists, and it is extensive (V)

This is the answer to question 3d. Reactive Resume v6 has a full job application tracker and a career workspace. It originated as an issue (#2670, "[Feature] Built-in Job Application Tracker (Personal ATS)", CLOSED; `gh issue list`). Other results: #3393, "Export job applications as CSV", CLOSED; #2236 (AI JD-based customized resume, CLOSED, labelled v4); #1765 (PDF generation, v4). The tracker shipped in the v5 line: the changelog's v5-era "Job Applications" section lists "dashboard Applications page with kanban board, table, insights dashboard, detail sheet, … CSV import" (`docs/changelog/index.mdx:1256`).

- **Stages:** `saved, applied, screening, interview, offer, closed` (`packages/schema/src/applications/data.ts:7`).
- **Closed reasons:** `accepted, not-selected, withdrew, accepted-other, no-response`.
- **Custom lanes:** up to 40 user-defined lanes, each mapped to one of the six canonical categories. They carry a label, a hex color and a position (`packages/schema/src/applications/lanes.ts`).
- **`application` table (`packages/db/src/schema/applications.ts:52`):** `company, role, location, salary, status, laneId, closedReason`, and:
  - a live `resumeId` link, plus `sentResumeVersionId` and `sentCheckScore` (the resume version and Check score at the Applied moment), and the same pair for cover letters;
  - `source, tags[], sourceUrl, jobDescription, postingSource` (how the snapshot was fetched), `requirements[], matchScore, aiMetadata, notes`;
  - uploaded resume and cover-letter files, `followUpAt/followUpNote`, `contacts[]` (name, role, type, email, phone), and `activity[]` (a timeline of stage, note and interview entries);
  - `trashedAt, appliedAt, submittedAt`.
- **Interviews:** timeline entries with `kind` (screening, technical, behavioral, onsite, other), duration, location, notes, participants, audience and an IANA timezone (`data.ts`). Calendar-event export and cancel files are in `packages/schema/src/applications/calendar.ts`.
- **Views:** List, Board, Insights, Calendar (`README.md:122`; `apps/web/src/features/applications/components/{board,list-view,insights-view,calendar-view}.tsx`). Insights uses source counts and stage baselines. A Trash view is at `apps/web/src/routes/dashboard/applications/trash.tsx`.
- **Next-step engine:** computes what each application needs next (interview, follow-up, no-reply, waiting, offer, closed) with a 10-day follow-up default (`packages/schema/src/applications/next-step.ts:7`). A "Needs you" filter exists (changelog v6.1.0).
- **Other tracker features:** CSV import and export (`packages/schema/src/applications/csv.ts`), duplicate detection (`packages/api/src/features/applications/duplicates.ts`), keyboard shortcuts (`j/k/1-5/x/f`), reply drafting for recruiters, and an application packet for employer forms (`packages/api/src/features/applications/packet*.ts`).
- **Posting capture:** URL or pasted text, with a "builtin" fetch or optional Firecrawl, Tavily or Exa (`postingSourceSchema`, `data.ts:15-20`). A desktop browser helper and a phone share-sheet capture are also available (changelog v6.1.0).
- **Career workspace (`/dashboard/career`, `packages/schema/src/career.ts`, `packages/db/src/schema/career.ts`):**
  - **Per-application tabs:** `fit, apply, prepare, practise, debrief, messages, saved`.
  - **Knowledge:** facts, stories and preferences, with provenance sources.
  - **Offers:** side-by-side offer comparison, with versioned terms and respond-by dates (`career-offer.ts`).
  - **Coach:** an AI chat with explicit context-disclosure controls.
  - **Discovery:** `careerSchedule`, `careerJob` and `careerOpportunity` tables hold scheduled role-discovery runs. Results are reviewed in "Today" and tracked only when you choose.
  - **Notifications:** `careerNotification` rows, with optional email.
- **Fit design:** the docs say "Read the evidence, not a score". Fit compares posting requirements against your saved facts and does not produce a numeric match score (`docs/guides/checking-job-fit.mdx`). The `matchScore` column exists in the DB. I did not trace where it is written.

## 6. Resume validation and ATS features (V)

- **Check mode:** a 0-100 readability score. It is "the share of checks your resume passes" (23 checks, 22 for non-English resumes), grouped into five categories: contact details, dates, layout, section headings, writing (`docs/guides/checking-your-resume.mdx`). Rules are in `packages/resume/src/ats/{rules,catalog,section-aliases}.ts`, for example `MISSING_EMAIL`, `REVERSED_PERIOD`, `SECTION_MISSING_FROM_LAYOUT`.
- **Issues and fixes:** each issue is pinned to its line on the page with a one-click fix (`apps/web/src/features/resume/editor/check/{issues,page-layer}.tsx`). Users can ignore issues (`metadata.check.ignored`).
- **Job match:** extracts the terms a posting stresses and shows which your resume covers. It is not part of the score (`checking-your-resume.mdx:109`). It runs in the browser (`check/job-match.tsx`). Users can hide terms as untrue (`metadata.check.hiddenTerms`).
- **Parser view:** shows the text a parser reads from the exported PDF (`check/parser-view.tsx`, `packages/pdf/fixtures/ats`).
- **AI writing review:** the optional "Writing" tab (`check/writing-tab.tsx`, `resumeWritingReview` table).
- **Public ATS checker:** reads a PDF in the browser without an account (`apps/web/src/routes/_home/ats-checker.tsx`, `apps/web/src/features/ats-checker`).
- **Not found:** no standalone spellcheck. Grammar is only via the AI review.

## 7. Accounts, auth and self-hosting (V, `packages/auth/src/config.ts`)

- **Methods:** email and password (`FLAG_DISABLE_EMAIL_AUTH` can turn it off), Google, GitHub and LinkedIn social providers (`:1070-1090`), and generic OIDC/OAuth through `genericOAuth` (`:1109`, with `docs/self-hosting/sso.mdx`). Guest login is behind `FLAG_ENABLE_GUEST_LOGIN` (`packages/env/src/server.ts:231`).
- **Plugins:** two-factor (TOTP plus backup codes), passkeys, API keys, `admin`, `username`, and the `oauthProvider` plugin (the app itself can act as an OAuth provider, used by MCP clients).
- **Other flags:** `FLAG_DISABLE_SIGNUPS` and `FLAG_ALLOW_UNSAFE_AI_BASE_URL`.
- **Self-hosting:** Docker, Kubernetes, Vercel (must use the "Services" framework preset), Cloudflare Workers, Hostinger and NAS (`docs/self-hosting/`). It needs Postgres and S3-compatible storage. Redis is optional outside Vercel. Migrations run on startup (`docs/self-hosting/upgrading-to-v6.mdx`).
- **Privacy claims** (README): no tracking, no ads, optional AI only through a provider you connect (`README.md:73`). I did not audit this against the code.

## 8. v5 to v6 and the earlier history (V)

- **v5.0.0** was released 2026-01-19 (`gh release view`).
- **v6.0.0** was released 2026-10-04. The release notes call it "a full redesign" with one Documents library, a Write/Design/Check editor, an assistant whose edits you review, standalone cover letters and an application tracker. A new PDF engine (Forme) makes preview match download (`gh release view v6.0.0`).
- **Migration impact (`docs/self-hosting/upgrading-to-v6.mdx`):**
  - v5 cannot run against a v6-upgraded database.
  - Cover letters embedded in resumes become standalone letters.
  - Old style-editor styles need a one-time manual conversion.
  - The `PRINTER_*`/`BROWSERLESS_*` variables are dropped.
  - Dates were converted to structured month/year.
  - Some API fields and MCP tools were removed.
- **Older versions:** the v4 to v5 move is in `docs/self-hosting/migration.mdx`. The import code can still read v4 JSON (`packages/import/src/reactive-resume-v4-json.tsx`).

## 9. Import details (V)

Formats are detected from file contents (`docs/guides/importing-resumes.mdx`):

| Format | Needs AI? |
|---|---|
| Reactive Resume JSON (v5 and v6) | No |
| Reactive Resume v4 JSON | No |
| JSON Resume | No |
| LinkedIn data export (`.zip`) | No |
| PDF | Optional (local text-layer reading, or AI) |
| Word `.docx` | Yes |

Code is in `packages/import/src/{json-resume,linkedin,pdf-lines,docx-text,plain-text,reactive-resume-json}.*`. A review step shows the sections found and leftover lines before anything is created.

## Summary of what Reactive Resume does best

Reactive Resume is a polished, self-hostable, MIT-licensed document and job-search workspace, not just a resume generator. Its strengths are:

- a pixel-consistent live-preview PDF pipeline (Forme) with 18 templates;
- a deep, typed resume schema with structured dates, custom sections and fine-grained design and style rules;
- a built-in readability and ATS "Check" that pins issues to resume lines and matches a job posting;
- a full application tracker (custom-lane Kanban, interviews, contacts, follow-ups, calendar, CSV, tracker-to-resume/letter version linking) tied to a career workspace of knowledge, fit, practice and offers;
- AI that only proposes reviewable edits through any bring-your-own provider, with the same surface exposed through REST and MCP;
- mature public sharing (password, analytics, feedback links), broad import (JSON Resume, LinkedIn, PDF, DOCX), 55 locale files, and a mobile app.

It is a multi-user hosted web app on Postgres. It has no local-file, git-friendly or CLI-agent workflow, and no markdown-first data layer.

## Not verified

- The Forme engine internals.
- Where `matchScore` is populated.
- The exact MCP tool count. I saw a partial list only.
- The service logic behind Career coach, Offers and Discovery. I read schemas, DB tables and docs for those, not the service code.
- Whether any JSON Resume export exists. I did not find one in the export docs or the files I opened.
