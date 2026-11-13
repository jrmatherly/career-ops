# Post-deploy follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the items career-ops 2.2.0 left open on the hosted site, in one branch and one PR, so the web UI meets the 24px target rule everywhere and matches the approved mockups' copy.

**Architecture:** Six small, independent changes on one branch, `fix/post-deploy-follow-ups`. The first task makes the existing layout suite render the controls it missed and fail on them. Each later task is a narrow edit with its own test. Nothing changes a data format that another writer reads, except one additive field set on a scheduled run.

**Tech Stack:** Next.js (App Router) and Tailwind in `web/`, Node `.mjs` scripts, `node:test`, Playwright with Chrome for the browser suites.

**Spec:** `docs/superpowers/research/2026-11-11-deployment-config-review/post-deploy-findings.md` (item ids A, B, C, D, E used below) and `mockups.html` beside it. The parent plan is `docs/superpowers/plans/completed/2026-11-11-deployment-config-review.md`.

## Global Constraints

- UI text floor is 12px (`text-xs`). Interactive targets are at least 24px in both dimensions. A link inside a sentence (`<a>` with computed `display: inline`) is exempt, as `web/tests/lib/layout-shell.browser.test.mjs:60` already encodes.
- This repository is public. No tracked file, test fixture or commit message names a company from the tracker or inbox, quotes the CV, or states a salary figure as Jason's. Fixtures use `Fixture Alpha`-style names.
- One branch, one PR. Work in a sibling worktree, never in the shared checkout. Copy `web/node_modules` into it with `cp -c -R`; a symlink breaks Turbopack.
- Every commit is a Conventional Commit with a scope. Task 4 is a `feat(web)`, which makes the next web release 1.3.0. The rest are `fix`.
- Before the first push: `node check-syntax.mjs`, `node test-all.mjs --quick`, `npm run typecheck` in `web/`, `npm run build` in `web/` then `node tests/browser-suites.mjs`, the four pr-review-toolkit reviewers (code, tests, silent failures, comments) on the unpushed branch, then `node .githooks/coderabbit-review.mjs` as its own command. Push once. Never `--no-verify`, never force-push.
- One web unit suite: `cd web && node --experimental-strip-types --import=./tests/helpers/saved-settings-off.mjs --test tests/lib/<name>.test.mjs`. One browser suite: `node tests/browser-suites.mjs <name>` after `npm run build`; it takes a single name filter, so run it once per suite.
- A new test is its own file under `tests/*.test.mjs` or `web/tests/lib/*.test.mjs`. No new section in `test-all.mjs`.
- No merge without Jason's go in the session. `protect-main` requires no status checks, so wait for `gh pr checks <n> --watch` and merge by hand.

## Decisions already made

| Decision | Answer | Source |
|---|---|---|
| One PR or several | One combined branch and PR | Jason, 2026-11-13 |
| Portals "Add company" and "Board type" (B2) | Board type filter only. "Add company" gets its own plan | Jason, 2026-11-13 |
| Text links under 24px (A2 to A5) | Raise to 24px | Jason, 2026-11-13 |
| Logo monogram at 8px (C2) | Leave it | Jason, 2026-11-13 |
| "Resume" replacing "CV" in the UI | Tabled | Jason, earlier |

## What the research found

- **Why the suite passed.** `layout-shell.browser.test.mjs` visits `/explore`, `/pipeline`, `/followups` and `/` and asserts 24px on every `button` and `a`. Its fixture, `pipeline-status`, has three tracker rows and nothing else, so no chip, inbox row, PDF link or follow-up row renders.
- **A1.** `.co-fb__chip button` (`filter-builder.tsx:21`) has no size, so it is the 12px icon. The phone rule at line 28 already gives it 44px.
- **A6** is a link inside a sentence and already exempt. No change.
- **B.** The parent plan says each page task "follows the matching screen in `mockups.html`" (line 333), so the copy differences are misses. Its Portals task (Task 16) never listed "Add company" or "Board type".
- **C1.** Measured in Chromium: an `<img>` whose response is 204 fires `onerror` and logs nothing to the console. A 404 logs one error per image.
- **C4.** A tick that cannot take the runner lock still runs the rank and drain passes (`scheduled-jobs-runner.mjs:575-581`), and the job it could not claim stays due for the next tick. Nothing is lost but up to 15 minutes. Left alone.
- **C5.** `executeJob` reads only `postingsKept` from the sweep's JSON (`:139-150`). The same object carries `postingsDroppedTier`, `postingsDroppedSalary` and `postingsDroppedContent` (`scan-ats-full.mjs:2111-2113`).
- **A5 is one of two links.** The finding could not say which of `today-dashboard.tsx:235` (follow-ups) and `:309` (fresh matches) it measured. Both have the same classes, so Task 2 fixes both and Task 1's guard accepts either.
- **What renders each control.** The PDF link needs a row in `data/pdf-index.tsv` and the file in `output/` (`web/src/app/pipeline/page.tsx:37-51`, `web/src/lib/core/pdf-index.ts`). The Follow-ups link needs an entry with a `reportPath`. The follow-ups "See all" link shows only when `/api/followups` reports more due than it returns. The fresh "See all" link shows when more than six fresh offers exist. Explore chips come from the seeded `filters.positive`.
- **Board type cannot come from the host alone.** A `tracked_companies` entry may name its board in `provider:` (37 entries in the template) or only in `api:` (41), with `careers_url` on the company's own domain. `watchedCompanies` keeps one host, from `careers_url ?? api` (`web/src/lib/portals-config.mjs:325`).
- **The scheduled store keeps unknown run keys.** `readScheduledStore` passes `parsed.runs` through unchanged (`web/src/lib/scheduled-jobs-store.mjs:38`).
- **C6.** The eight rows starting with "; " came from a writer PR 72 already fixed, and were repaired by hand. `set-status.mjs` is not changed. D3 checks the fix on the next evaluation.

## Review Focus

- **A fixture that stops rendering a control.** If a later change empties the fixture's inbox or follow-ups, the suite passes blind again. Task 1's presence guards fail instead.
- **A chip with a long label on a narrow field.** The remove button must not push the chip taller or wrap the label. Task 2 measures chip height before and after.
- **A later store change that starts normalizing runs.** The new counts would vanish on the next write. Task 6 tests a round trip through the store.
- **A company with no `provider`, `api` or readable `careers_url`,** and a board the health check found that the list does not hold. Both must land in "Other" and stay visible under "any". Task 4 tests both.
- **A date-relative fixture.** Fresh offers and due follow-ups depend on today's date. A fixture with fixed dates passes this month and fails next. Task 1 writes its dates from `new Date()`.
- **A logo miss on a page that expects a 404.** `discovery-card.tsx` has its own `<img onError>`. Task 5 greps every `/api/logo` caller for a status check.

---

### Task 1: Make the layout suite see the small controls

**Files:**
- Create: `web/tests/fixtures/layout-shell.mjs`
- Modify: `web/tests/browser-suites.mjs:78` (`fixture: "layout-shell"`)
- Modify: `web/tests/lib/layout-shell.browser.test.mjs` (comment at line 15, new guard subtests)

**Interfaces:**
- Produces: a fixture root that renders every control in the table below, and one subtest per row named `` `${route}: renders ${label}` ``.

| Route | Control | Guard selector, inside `main` |
|---|---|---|
| `/explore` | chip remove button | `button[aria-label^="Remove "]` |
| `/pipeline` | "Select all N" | a `button` whose text matches `/^Select all \d+$/` |
| `/pipeline?tab=ALL` | tailored CV link | `a[title="Open the tailored CV PDF"]` |
| `/followups` | company link | `a[href^="/pipeline/"]` |
| `/` | a "See all" link | `a[href="/followups"], a[href="/explore?view=fresh"]` whose text starts `See all` |

- [ ] **Step 1: Read the four file formats the fixture must write.** `web/tests/fixtures/inbox-undo.mjs` for `data/pipeline.md`; `web/src/lib/core/pdf-index.ts` for `data/pdf-index.tsv`; the handler behind the fetch at `home/today-dashboard.tsx:95-105` for what counts as a fresh offer and where it reads them; `web/src/lib/followups.ts` for what makes an entry due and gives it a `reportPath`. Write each format as a one-line comment at the top of the new fixture.
- [ ] **Step 2: Write the fixture.** Same contract as `pipeline-status.mjs`: makes a temp root, prints it, fictional data only, a `.layout-shell-fixture` marker file. It keeps rows 11 to 13 and `cv.md` from `pipeline-status.mjs` unchanged, since the suite's other assertions read them. It adds: three inbox rows in `data/pipeline.md`; one `Applied` row with a report, dated 30 days before today; a `data/pdf-index.tsv` row and a small PDF in `output/` for row 11; seven fresh offers dated today; and a `portals.yml` with two `title_filter.positive` entries. Every date comes from `new Date()`.
- [ ] **Step 3: Add the guard subtests.** After `open(route)`, for each table row: `assert.ok(await page.locator(`main ${selector}`).count() > 0, `${label} did not render, so its size was not checked`)`.
- [ ] **Step 4: Run it and see it fail on size, not on presence.**

Run: `cd web && npm run build && node tests/browser-suites.mjs layout-shell`
Expected: every `renders …` subtest passes. The `at least 24px both ways` subtests fail on `/explore` (12x12), `/pipeline`, `/pipeline?tab=ALL`, `/followups` and `/`, naming A1 to A5.

- [ ] **Step 5: Commit** `test(web): the layout suite renders the controls it measures`. The suite is red on purpose until Task 2. Do not push between these two tasks.

### Task 2: Bring A1 to A5 up to 24px

**Files:**
- Modify: `web/src/components/explore/filter-builder.tsx:21`
- Modify: `web/src/components/inbox/inbox-triage.tsx:437,442`
- Modify: `web/src/components/pipeline-view.tsx:973-979`
- Modify: `web/src/components/followups/followups-view.tsx:414`
- Modify: `web/src/components/home/today-dashboard.tsx:235,309`

- [ ] **Step 1: Measure the chip before changing it.** On `/explore` at 1280 by 900, record `getBoundingClientRect().height` of one `.co-fb__chip`.
- [ ] **Step 2: A1.** In the desktop rule for `.co-fb__chip button`, add `min-width:24px;min-height:24px;align-items:center;justify-content:center` and negative margins that cancel the growth. The chip's height stays within 1px of Step 1 and its label does not move. Leave the phone rule at line 28 as it is.
- [ ] **Step 3: A2 to A5.** Add `inline-flex min-h-6 items-center` to the two inbox text buttons, and `min-h-6` to the PDF link, the Follow-ups company `Link` and both Today links. Keep every existing class, including `max-sm:min-h-[44px]`.
- [ ] **Step 4: Run** `node tests/browser-suites.mjs layout-shell` after a rebuild. Expected: PASS, all subtests.
- [ ] **Step 5: Run** `node tests/browser-suites.mjs`. Expected: PASS. A suite that fails here is reading a height this task changed. Fix the component, not the suite.
- [ ] **Step 6: Commit** `fix(web): every chip button and text control is at least 24px tall`.

### Task 3: Match the mockups' copy (B1, B3, B4)

**Files:**
- Modify: `web/src/components/explore/explorer-view.tsx:131` (the last branch only)
- Modify: `web/src/components/scheduled-jobs-view.tsx:164,172,180,296`
- Modify: `web/src/app/portals/page.tsx:51`
- Modify: `web/src/app/documents/page.tsx:60`
- Modify: `web/src/components/analytics-view.tsx:33-58`, and its caller in `web/src/app/analytics/page.tsx`
- Test: `web/tests/lib/page-copy.test.mjs` (create)

**Interfaces:**
- Produces, in `web/src/lib/analytics/view-model.mjs`: `analyticsSummary(applications) -> string`, the description line. `AnalyticsShell({ summary, view, children })` takes it in place of `total`, and `web/src/app/analytics/page.tsx:23` passes `analyticsSummary(applications)`.

Exact copy:

| Page | Element | Text |
|---|---|---|
| Explore, scan mode, no employer | description | `Scan public job boards for fresh postings. Free until you evaluate one.` |
| Scheduled scans | description | `Scans that run on a schedule and evaluate what they find.` |
| Scheduled scans | buttons | `Run log`, `New scan` (both places) |
| Portals | description | `The company boards the daily scan reads.` |
| Documents | description | `Tailored CVs and cover letters.` |
| Analytics | tabs | `Progress`, `Insights`, `Scan stats` |
| Analytics | description | `{total} tracked · average score {x.x} · {active} active application(s)` |

Explore's AI-search and employer descriptions are unchanged. The header's "N tracked evaluations" badge is removed, since the description now says it. The average is over rows with a numeric score, to one decimal, and its part is dropped when no row has one. `active` counts rows whose status is Applied, Responded, Assessment, Interview or Offer.

- [ ] **Step 1: Write the failing tests.** `page-copy.test.mjs` reads each source file and asserts it contains the new string and none of: `Persistent, automated crawler jobs`, `New Scheduled Scan`, `Run Logs (`, `quietly broken`, `Browse your generated`, `Search progress`, `Search stats`, `Scan the public ATS network`. In `analytics-view-model.test.mjs`: three rows scored 4.0, 3.0 and `N/A` with statuses Applied, Evaluated and Interview give `3 tracked · average score 3.5 · 2 active applications`; one unscored Applied row gives `1 tracked · 1 active application`; no rows gives `0 tracked · 0 active applications`.
- [ ] **Step 2: Run it** with the unit command from Global Constraints. Expected: FAIL on every old string.
- [ ] **Step 3: Make the edits.**
- [ ] **Step 4: Update the five suites that quote old copy.** `analytics-report-lookup-once`, `analytics-views.browser`, `accessible-names.browser`, `analytics-metrics`, `analytics-data` under `web/tests/lib/`. Change the quoted strings only.
- [ ] **Step 5: Run** the copy test, those five suites and `npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `fix(web): page subtitles, tab names and scan buttons match the mockups`.

### Task 4: Board type filter on Portals (B2)

**Files:**
- Modify: `web/src/lib/portals-view-model.mjs`
- Modify: `web/src/lib/portals-config.mjs:303,325` (`watchedCompanies` and its typedef)
- Modify: `web/src/components/portals-view.tsx:47,68,190-197`
- Test: `web/tests/lib/portals-view-model.test.mjs`, `web/tests/lib/portals-config.test.mjs`

**Interfaces:**
- Produces: `boardType({ provider, api, careers_url }) -> string` in `portals-view-model.mjs`. `WatchedCompany` gains `board: string`, set by `watchedCompanies`. `boardTypes(companies) -> string[]`, the distinct boards present, sorted, with `Other` last. `filterPortals(companies, { query, tab, health, board })`, where `board` is `''` for any.

`boardType` answers in this order: a non-empty `provider` string, with its first letter capitalized; else the first of `api` and `careers_url` whose host is, or ends with a dot and, one of `greenhouse.io` Greenhouse, `lever.co` Lever, `ashbyhq.com` Ashby, `myworkdayjobs.com` Workday, `workable.com` Workable; else `Other`. The dot-boundary match is the one `sourceFromUrl` uses in `web/src/lib/inbox.ts:19`, so `notlever.co` is `Other`. A row that `withUnlisted` adds gets `board: 'Other'`.

- [ ] **Step 1: Write the failing tests.** `boardType({ careers_url: 'https://jobs.ashbyhq.com/acme' })` is `Ashby`. `{ careers_url: 'https://acme.example/careers', api: 'https://boards-api.greenhouse.io/v1/boards/acme/jobs' }` is `Greenhouse`. `{ provider: 'smartrecruiters', careers_url: 'https://acme.example' }` is `Smartrecruiters`. `{ careers_url: 'https://notlever.co/x' }`, `{ careers_url: 'not a url' }` and `{}` are `Other`. `watchedCompanies` returns `board` on every row. From boards Greenhouse, Greenhouse, Lever, Other, Other, `boardTypes` is `['Greenhouse', 'Lever', 'Other']`. `filterPortals(…, { board: 'Lever' })` returns one; `board: ''` returns what it returned before this change; `board` combines with `tab` and `query`; an unlisted health row shows under `''` and `Other` only.
- [ ] **Step 2: Run** both suites. Expected: FAIL, `boardType is not a function`.
- [ ] **Step 3: Implement.** Update any `watchedCompanies` assertion in `portals-config.test.mjs` that compares whole rows.
- [ ] **Step 4: Add the control.** A `<select aria-label="Board type">` beside the search field, first option `Board type: any` with value `''`, then `boardTypes(companies)`. It sits in one row with the search input, which keeps its full width on phones (`flex-col sm:flex-row`). The select is at least 24px tall, 44px on phones.
- [ ] **Step 5: Run** the unit suite, `portals-route`, `portals-empty-copy`, and the `layout-shell` and `accessible-names` browser suites. Expected: PASS.
- [ ] **Step 6: Commit** `feat(web): Portals can be filtered by board type`.

### Task 5: A missing logo no longer logs a console error (C1)

**Files:**
- Modify: `web/src/app/api/logo/route.ts:19,50,66,77`
- Test: `web/tests/lib/logo-route.test.mjs` (create, in the style of `portals-route.test.mjs`)

**Interfaces:**
- Produces: `GET /api/logo` answers `204` with an empty body for a miss (no candidate domain, a cached empty sentinel, an unresolved lookup). `400` for bad input and `200 image/png` for a hit are unchanged.

- [ ] **Step 1: Write the failing test.** Import the route through `../helpers/web-ts-alias-loader.mjs` with a temp data root, as `portals-route.test.mjs` does, and stub `globalThis.fetch` as `logo-fetch.test.mjs` does, so no test reaches the network. A zero-byte cache file for `?domain=fixture.example` gets 204 and an empty body. A lookup that the stub answers with Google's 404 gets 204 and leaves a zero-byte cache file. A cached PNG gets 200 and `image/png`. `?domain=..bad` gets 400.
- [ ] **Step 2: Run it.** Expected: FAIL, 404 where 204 is expected.
- [ ] **Step 3: Change the three miss responses** to `new Response(null, { status: 204 })` and the comment at line 19 to say 204.
- [ ] **Step 4: Check the callers.** `grep -rn "api/logo" web/src` and confirm none reads the status. `company-logo.tsx` and `explore/discovery-card.tsx` use `<img onError>`, which a 204 triggers.
- [ ] **Step 5: Run** the new test, `logo-fetch`, `logo-cache-key`. Expected: PASS.
- [ ] **Step 6: Commit** `fix(web): a company with no logo answers 204, so the console stays clean`.

### Task 6: The runner keeps a sweep's drop counts (C5)

**Files:**
- Modify: `web/scripts/scheduled-jobs-runner.mjs:139-150,279-287,334-335`
- Test: `web/tests/lib/scheduled-jobs-runner.test.mjs`

**Interfaces:**
- Produces: `extractScanCounts(engine: string, stdout: string) -> { droppedTier?: number, droppedSalary?: number, droppedContent?: number }`. A successful `executeJob` result carries it as `counts`, and `recordCompletion` spreads it onto the run. A key is present only when the sweep printed a finite number for it.

- [ ] **Step 1: Write the failing tests.** For engine `full` and stdout `{"postingsKept":7,"postingsDroppedTier":12,"postingsDroppedSalary":0,"postingsDroppedContent":3}`, `extractScanCounts` is `{ droppedTier: 12, droppedSalary: 0, droppedContent: 3 }`. A zero is kept, since zero is the answer D2 needs. Stdout that is not JSON gives `{}`. Engine `portals` gives `{}`. A run recorded through `recordCompletion` and read back with `readScheduledStore` still has `droppedSalary: 0`. A failed run has none of the three keys.
- [ ] **Step 2: Run** the suite. Expected: FAIL, `extractScanCounts is not a function`.
- [ ] **Step 3: Implement.** Parse the JSON once and derive `rolesFound` and the counts from the same object. `extractRolesFound` keeps its signature.
- [ ] **Step 4: Run** the suite and `scheduled-job-body`, `scheduled-job-client`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(web): a scheduled run records what its sweep dropped by tier, salary and content`.

### Task 7: Record, review, push once

**Files:**
- Modify: `docs/superpowers/research/2026-11-11-deployment-config-review/post-deploy-findings.md`

- [ ] **Step 1: Mark each finding** in the findings file with its outcome: fixed in this branch (A1 to A5, B1, B3, B4, B2 board type, C1, C5), exempt (A6), left by decision (C2, B2 "Add company"), left with the reason from this plan (C3, C4, C6). Replace the inferred sentence about the fixture with what Task 1 found. Commit `docs(research): record the outcome of each post-deploy finding`.
- [ ] **Step 2: Run the full gate** from Global Constraints. Expected: all pass.
- [ ] **Step 3: Check the pages by eye.** Production build on the Task 1 fixture root, 1280 by 900 and 390 by 844: Explore chips, Pipeline inbox and All, Follow-ups, Today, Portals with the filter open, Analytics, Scheduled scans. Console shows no `/api/logo` error.
- [ ] **Step 4: Reviews, then CodeRabbit,** then one push and the PR. The PR body states that no personal data was added and that `node test-all.mjs` passed.
- [ ] **Step 5: After CI,** read the PR comments and the review body. Merge only on Jason's go.

## After the merge

These need an event or Jason's go. None is a code change.

| Check | Trigger |
|---|---|
| D1, automatic CV at 4.0 or higher | A scheduled evaluation that scores 4.0. Then look for a new PDF in `/data/output/` |
| D2, salary drop count | The next sweep after deploy (weekly sweep runs 04:18Z Sundays). Read `droppedSalary` on the run in `/data/data/scheduled-jobs.json` |
| D3, notes lead with the decision | The first evaluation after the 2.2.0 deploy |
| D4, `cv.md` reader on the real CV | Jason's go, since `resume.mjs absorb` writes `data/resume.json` on the pod |
| D5, a tailored PDF end to end | The same run as D1 |
| D6, the Cloudflare path | Open the site from outside the network |
| D7, right-to-left and CJK `job-note` | A fixture, when a non-Latin CV is in scope |
| Live re-measure | After the next release is deployed: the Task 1 table on the live site |

## Not in this plan

- Portals "Add company": its own plan. It needs a new write path into `portals.yml`.
- C2, the 8px monogram, and C3, the Pipeline table scrolling inside its box at 798px: left as built.
- C4, the tick lost to a long manual run: nothing is lost but time.
- C6, `set-status.mjs --replace-note` on a cell starting with "; ": the writer that made such cells is fixed.
- Section E, including the resume lock items and "Resume" replacing "CV".
