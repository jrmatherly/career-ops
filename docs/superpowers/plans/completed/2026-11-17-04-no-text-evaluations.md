# No-text evaluations implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A posting a scheduled scan ranked is never lost because its text could not be read. Google Careers postings get a text reader, a row skipped for a missing reader is queued again by itself once a reader exists, and the Inbox marks every row that still needs a manual score.

**Architecture:** Google Careers joins the posting-text routing table the way UltiPro did, with one `resolveAtsApi` entry, one id in `JD_TEXT_API_ATS`, one `JD_FETCHERS` row and one pure normalizer. The normalizer reads the positional record the detail page embeds and refuses any record whose shape it does not recognise. The drain gains one pass over its ledger, before it plans, that appends a `queued` row for each `skipped no-api-text` URL whose board now has a reader. The Inbox reads the same ledger and marks rows skipped as `no-api-text` or `no-text`, with a badge and one filter chip.

**Tech Stack:** Node ESM scripts at the repo root tested with `node:test` through `test-all.mjs`. Next.js 16.4 and React 19 in `web/`, plain `.mjs` modules tested with `node:test`, `playwright-core` browser suites run by `web/tests/browser-suites.mjs`.

**Spec:** [`docs/superpowers/research/2026-11-17-location-verdicts/README.md`](../../research/2026-11-17-location-verdicts/README.md). This plan covers Finding 5 and the owner decision "Google fetcher, automatic re-queue once a fetcher exists, and an inbox badge".

**Order:** Plan 4 of 4. It lands last, after plan 3. It needs plan 2, which needs plan 1, and nothing from plan 3. From plan 2 it uses the Inbox's verdict badge, the "Location fit" group, the lists `matched`, `counts` and `filtered` in `inbox-triage.tsx`, `markVerdicts` in `page.tsx`, and the `location-hold` browser suite with its four-row fixture. Task 3's Interfaces block gives each by exact name.

## How this plan was checked

One session wrote this plan on 2026-11-17 by reading the code at `c4b20ee5` and by running prototypes in a scratch directory. An independent reviewer then read it against the code, the live pages and plan 2, and a third session checked each of the reviewer's findings and revised the plan. Line numbers are from `c4b20ee5`. Plans 1 and 2 change some of the same files, so every edit below is located by symbol or quoted text as well.

The writing session ran these, with the result:

- **Four public requests to Google Careers**, with a generic user agent and the search term "program manager". One results page, one live detail page, the same detail page without its slug, and one made-up id (`100000000000000001`). All four answered 200.
- **The field positions in the spec hold.** The live detail page's `ds:0` is an array of one record with 21 fields. `[0]` is the posting id as a string and equals the id in the URL. `[1]` is the title, `[3][1]` responsibilities, `[4][1]` qualifications, `[10][1]` the about text, `[9]` the locations, `[7]` the employer. Each text field is a pair `[null, "<html>"]`. Each location is six values and the first is the display name.
- **Pay is in the about text.** Field `[10]` carried the US base salary range on 35 of the 40 list records read. No other field carried a dollar amount.
- **A missing posting is `ds:0 = []`** on a 200 page. This is a second made-up id beside the investigator's one. A real closed posting was not seen.
- **The detail page also embeds 20 other postings.** Its `ds:1` holds 20 full 21-field records for unrelated postings, and the open posting was not among them. On the results page `ds:0` is the list of Alphabet companies and `ds:1` holds the 20 cards. So "a 21-field record somewhere on the page" is not the posting. Only `ds:0` with the URL's id is.
- **A prototype normalizer** read the live page into 4,497 characters of text with the title "Strategic Negotiator". It returned no text for the made-up id's page, for the live page asked for another posting's id, for the results page, and for the record with a field added, a field inserted, a number for an id, two records, or a short section. It accepted all 40 list records when each was placed in `ds:0`. The shortest section among them was 342 characters after HTML is removed.
- **`node fetch-jd.mjs` on the live Google URL exits 1 today** with nothing on stdout. So the page path reads no text there today and does not call a live Google posting closed.
- **The drain re-queue, test first.** Seven of Task 2's eight tests, written in the style of `web/tests/lib/evaluate-drain.test.mjs`, ran against today's drain. Four failed for the expected reason and three, which pin what must not change, passed. A scratch copy of the drain with the ten-line pass from Task 2 passed all seven, and passed the 68 tests of the existing drain suite.
- `node test-all.mjs --quick --only ultipro-jd-api` runs one discovered suite and passes, so the `--only` commands below have the right form.

The reviewer ran these on a patched copy of the repo at `c4b20ee5`, without plans 1 and 2:

- **The reader on live pages.** Two live detail pages, one asked for with `hl=ja`, read into 3,263 and 3,769 characters, each with its own title. The shape rule returned nothing for three neighbour ids taken from a page's `ds:1`, for a prefix of the page's own id, for a made-up id's page and for the results page. Task 1's eight tests passed against that reader and against fixtures made the way Step 1 says. The two fixture files were 2,935 and 1,600 bytes.
- **The drain tests.** The seven tests of the writing session failed four and passed three on today's drain, and all passed with the pass added, 75 tests in all.
- **The revive attacks.** A job that left auto mode, a rank under the job's threshold, a board with no reader and a `no-text` skip each leave the ledger byte for byte unchanged. They are Task 2's pinning tests.

The revising session verified, each by a run or a read at `c4b20ee5`:

- It ran the reviewer's reader script again on the four saved pages and got the same results.
- **The suite runner takes one name.** `web/tests/browser-suites.mjs:210-211` reads `process.argv[2]` as a substring and ignores later arguments. Each suite name this plan runs matches one suite only.
- **Clear returns to Fit.** Plan 2's Task 4b says so and its browser test asserts it. So Task 3's browser test no longer waits for an `elsewhere` row after Clear.
- **The eighth drain test.** `maxPerRun` is the drain's per-pass limit (`web/scripts/evaluate-drain.mjs:240`). The test `revived rows start no more than the job's limit for one pass` failed on today's drain with the four others, and passed on the reviewer's patched copy, 76 tests in all.
- **Decision D9's numbers.** The Google walk, the unthrottled text path and the page sizes, as D9 now cites them. The three saved detail pages are 1,136,057, 1,164,122 and 1,199,514 bytes.
- **The hold runs before the reader check.** The drain tests the location hold before it looks for a reader (`web/scripts/evaluate-drain.mjs:340-346`). A row skipped as `no-api-text` passed the hold of its day. After plan 2 the hold reads the verdict, so a revived row can be held.
- The one-line ledger reader in "After this is deployed" ran against a sample ledger, with and without a store file beside it.

Not verified:

- **The detail page as served to the repo's own user agent.** The requests used a generic one, because the repo's names the fork. The scanner already reads Google results pages with the repo's agent. Task 1 Step 6 is the live check.
- **A real closed Google posting.** Only made-up ids were tried.
- **The record shape outside this sample.** 41 records, all `en-US`, from two requests on one day, employers Google and YouTube.
- **Plans 1 and 2 are not merged.** The names taken from plan 2 are listed in Task 3 and match plan 2 as reconciled on 2026-11-17. If the merged code differs, the merged code wins.
- **No task in this plan was implemented in the repo.** Tasks 1 and 2 ran on scratch copies. No browser suite ran, and Task 3 has no test run at all.
- **Task 3's browser test against plan 2's code.** Its helpers, labels and counts are read from plan 2's text.
- **Whether the pod has the scan's experience filter on, and how many Google queries and pages its `portals.yml` sets.** See decision D9. `grep -n -A3 "experience_filter\|max_pages\|queries" /data/portals.yml` on the pod settles both.
- **The daily request count in D9.** It is an estimate from the spec's counts, not a measured scan.
- **The pod's ledger today, and where the pod keeps `scheduled-jobs.json`.** The counts in "After this is deployed" are the spec's. The one-liner prints the job's id when it finds no store file.
- **How the hold reads the owner's Google posting.** Nobody ran `locationVerdict` on its stored location.

## Global Constraints

Every rule in `.claude/rules/dev-workflow.md` applies, with `.claude/skills/add-provider/SKILL.md` for Task 1. These are the ones a task here can break, and the ones this plan adds.

- **Plans 1 and 2 must be on `main` first.** From the repo root, `grep -c "export function locationVerdict" providers/_country.mjs` must print `1` and `grep -c "markVerdicts" web/src/lib/inbox-pending.mjs` must print `1` or more. If either does not, stop.
- Work in a sibling worktree, `../career-ops-no-text`, on branch `feat/no-text-evaluations` cut from `main`. Give the worktree its own `web/node_modules` with `cp -c -R ../career-ops/web/node_modules web/node_modules`. A symlink breaks the build.
- The drain reads posting text through `fetchJdViaKnownApi` only. No browser, no page fallback. The unattended `evaluate-text` worker has no network tool (`docs/AUTOMATION.md:262-264`).
- A reader returns the posting's own text or nothing. It never returns text it cannot tie to the posting's id.
- Requests to Google go to the fixed host `www.google.com`, refuse redirects, and send `DEFAULT_USER_AGENT`. No login, no CAPTCHA handling. Tests never touch the network. Fixtures are fictional and carry no personal data.
- The inbox label is "Needs manual score". Never use the word "hidden". It already means skipped rows (`career-ops:hidden`).
- Scoring a row from the Inbox is never blocked.
- Do not edit `providers/google.mjs`, `providers/_country.mjs`, `web/src/lib/inbox-verdict.mjs` or the hold (`holdPolicy`, `holdVerdict`, `heldForLocation`). Plans 1 and 2 own them.
- One commit per task. The `feat` commits release one minor version of each package.
- A new test is its own file under `tests/*.test.mjs` or `web/tests/lib/`. Logic under test in `web/` lives in a plain `.mjs` module, not in a component.
- Every file a task adds or edits must be named, by full path in backticks, in the deviations table of `.claude/skills/upstream-review/SKILL.md`, in the same commit. `tests/fork-deviations-covered.test.mjs` reads `HEAD`, so run `node --test tests/fork-deviations-covered.test.mjs` after each commit.
- After `git add` in a task that adds a file, `node validate-system-paths-coverage.mjs` must print `OK`.
- Run one root suite with `node --test tests/<file>`.
- Run one web unit test from `web/` with `node --experimental-strip-types --import=./tests/helpers/saved-settings-off.mjs --test tests/lib/<file>`. This plan calls that "the unit command".
- Run one browser suite from `web/` with `npm run build && node tests/browser-suites.mjs location-hold`. The runner starts the built app, so build after every source edit. This plan calls that "the browser command".
- The runner reads one suite name and ignores the rest. Run several suites with a loop, from `web/`, after one build: `for s in location-hold inbox-keys; do node tests/browser-suites.mjs "$s" || { echo "FAILED: $s"; break; }; done`. This plan calls that "the browser loop" and names the suites each time. Expected: no `FAILED` line.
- `npm run typecheck` in `web/` can report a stale error in an untouched file on the first run after an edit. Rerun it once.
- Never merge without the owner's explicit approval in the session. Do not touch the pod.

## Decisions made in this plan

The owner can overrule any of these. Each names the other choice.

| # | Decision | Why | The other choice |
| --- | --- | --- | --- |
| D1 | The Google entry is `jdTextOnly: true`. It serves text and says nothing about liveness. | "Missing is `ds:0 = []`" rests on two made-up ids. `fetch-jd.mjs` already reads the page beside a text-only reader and lets a page that says closed win. | Answer liveness too. See "Offered, not built". |
| D2 | The request goes to the posting URL as the scanner wrote it, `results/<id>-<slug>`, with the query dropped. A URL with no slug does not resolve. | It is the link Google's own page carries. The slugless form answered the same record once, which is too little to rely on with `redirect: 'error'`. | Request `results/<id>` alone. |
| D3 | The record must have exactly 21 fields. One more or one fewer returns no text. | The fields are positions. A changed count is the only sign that positions moved. The cost is that an added field stops Google evaluations until the count is updated, and those rows get the badge. | Accept 21 or more. |
| D4 | The text is company, locations, qualifications, about and responsibilities, in the page's order. Fields `[15]` and `[18]` are left out. | The three sections and the locations were confirmed on 41 records. `[15]` and `[18]` are legal notices and a location note by inference only. | Add them under "Notes". |
| D5 | The re-queue runs inside `runDrain`, on the ledger it has already read, before it plans. | `queueCandidates` sees only the current run's candidate window (spec, Finding 5). The drain reads the whole ledger on every tick. `planFor` reads the ledger again, so a revived row is planned in the same pass. | A separate command or a runner step. |
| D6 | A row is revived only when its latest state is `skipped` with reason `no-api-text`, its job is an active Auto job, its rank is at or above that job's threshold today, and its URL resolves to an id in `JD_TEXT_API_ATS`. | The first makes it idempotent. The second and third keep a row from sitting `queued` under a job that will never drain it. | Revive every such row and let the rank pass take over orphans. |
| D7 | A loop is stopped by the reason. The pass matches `no-api-text` only. A revived row whose reader returns nothing takes the drain's existing path, `queued no-text: <why>` and then `skipped no-text` after four tries over a day. `no-text` is never revived. | The give-up rule already exists (`evaluate-drain.mjs:360-369`). A second rule would disagree with it. | A revive counter in the ledger. |
| D8 | The revive row is `queued` with reason `fetcher-added` and source `drain`. It carries the entry's job and run, and no rank. It is logged, and it is not added to the drain's `queued` count. | `fold` keeps the last recorded rank. The count reports what a pass ended with, and the row is usually evaluated in the same pass. | Count it. |
| D9 | Nothing else is done about the scan's experience filter. With `google` in `JD_TEXT_API_ATS`, a `scan.mjs` run that has `experience_filter` on asks for one detail page for each new Google posting that passed every other cut (`jd-years.mjs:649-656`, `scan.mjs:5560`). `scan-ats-full.mjs` has no experience filter and sends none. **The ceiling.** The provider walks every query in the entry, `max_pages` pages each, 20 cards a page (`providers/google.mjs:148-154`). `max_pages` is 10 by default and at most 50 (`:43-44`, `:67-71`). So a first scan can ask for up to queries × `max_pages` × 20 detail pages. That is 1,000 for the five default queries, and 1,000 for each query at `max_pages: 50`. The title filter cuts most of them before the experience filter runs. **The size.** Each detail page measured 1.14 to 1.20 MB, so 1,000 requests is about 1.2 GB. **No throttle.** This path calls `fetchJdViaKnownApi` with no `throttleProviderRequest` and no retry (`jd-years.mjs:653-656`). Only `experience_filter.concurrency` bounds it, 4 at a time by default and 16 at most (`jd-years.mjs:613-614`). **A daily scan.** The pod added 100 Google postings between 2026-11-03 and 2026-11-17 (spec, Finding 5), so a daily scan is estimated at under ten requests. **The switch.** The filter is off unless `portals.yml` has an `experience_filter` block. `enabled: false` in that block turns it off, and so does the Settings switch "Check required years of experience" (`lib/settings-registry.mjs:88`). The coordinator confirmed this decision (spec, owner decisions). | UltiPro and Zoho Recruit already work this way. A posting whose record fails the shape check is labelled from its listing, not dropped. | Keep Google out of the filter with a second set, or throttle the Google reads. |
| D10 | `InboxJob` gets `noTextReason` beside the spec's `noText`. | The two reasons need different advice. `no-text` means the posting may be closed, and saying so can save a paid evaluation. | One tooltip for both. |
| D11 | The filter is one chip, shown when any pending row is marked. It combines with every other filter, plan 2's location tier included. Its count is every marked row that is not skipped, as the source chips count. It is not saved. | It reuses plan 2's `matched` list, so the tier buttons show where the marked rows sit. No sibling filter is saved. | A fifth tier button. |
| D12 | The drain tests are appended to `web/tests/lib/evaluate-drain.test.mjs`. | They need its `withDrainRoot` stand-in dashboard, which is not exported. | A new file with a copy of the harness. |

## Review Focus

Each line is a condition the spec implies and a reader would not think to test. Each is pinned by the named test.

1. **Google adds, removes or moves a field.** The reader returns nothing. It never returns text from the wrong position. Task 1, `a missing posting, a neighbour's id and every broken shape give no text`.
2. **The page holds 20 other postings' records.** A URL whose id matches one of those gets nothing, not the neighbour's text. Same test, the `a neighbour's id` case.
3. **A revived posting is closed or stays unreadable.** It waits as `no-text`, ends `skipped no-text` after a day, is never revived again, and the Inbox says it may be closed. Task 2, `a revived row whose fetcher returns no text waits as no-text, is not revived twice, and ends as no-text`. Task 3, the `no-text` tooltip.
4. **A revived posting is outside the owner's area.** It is held, not evaluated. Task 2, `a revived row still meets the job's location hold`.
5. **Thirteen rows come back at once.** The daily cap and the job's per-pass limit (`maxPerRun`) still bound what starts. Task 2, `a revived row counts toward the daily cap only when it starts` and `revived rows start no more than the job's limit for one pass`.

---

### Task 1: The Google Careers posting-text reader

**Files:**
- Modify: `liveness-api.mjs` (after the `atlassian-icims` entry, lines 462-476; `JD_TEXT_API_ATS` at line 1211 and the comment above it)
- Modify: `browser-extract.mjs` (after `fetchUltiproJd`, line 887; `JD_FETCHERS`, line 1144)
- Modify: `tests/browser-extract.test.mjs:600-613` (`ATS_URL_SHAPES`, whose last row, `atlassian-icims`, is line 612)
- Create: `tests/jd-text-google.test.mjs`, `tests/fixtures/google-detail-open.html`, `tests/fixtures/google-detail-missing.html`

**Interfaces:**
- Consumes: `jdHtmlToText`, `compactText`, `JD_TEXT_CAP`, `rejectPrivateOrInvalid`, `discard` and `DEFAULT_USER_AGENT`, all already in `browser-extract.mjs`.
- Produces:
  - `resolveAtsApi('https://www.google.com/about/careers/applications/jobs/results/<id>-<slug>')` returns `{ ats: 'google', apiUrl: <that URL with no query>, parts: { id, slug }, accept: 'text/html', jdTextOnly: true, ... }`.
  - `normalizeGoogleJob(html: string, id: string, postingUrl: string, textCap = JD_TEXT_CAP): { url: string, title: string, text: string } | null`, exported from `browser-extract.mjs`.
  - `JD_FETCHERS.google`, with the shared `(resolved, url, textCap, timeoutMs)` signature.

**The `resolveAtsApi` entry.** `match(u)` returns `null` unless `u.hostname === 'www.google.com'` and the path matches `/^\/about\/careers\/applications\/jobs\/results\/(\d+)-([a-z0-9-]+)\/?$/`. It returns `{ id, slug }`. `api` builds `https://www.google.com/about/careers/applications/jobs/results/${id}-${slug}`. The entry sets `jdTextOnly: true` and `accept: 'text/html'`, and has no `interpret`. Its comment says what was measured on 2026-11-17: the detail page embeds the posting as a positional record in `AF_initDataCallback` `ds:0`, a made-up id answers 200 with `ds:0 = []`, and liveness stays with the browser.

**The shape rule.** This is the decision, so it is given in full. `normalizeGoogleJob` returns `null` unless every line holds.

```js
const GOOGLE_DS0_RE = /AF_initDataCallback\(\{key: 'ds:0', hash: '[^']*', data:([\s\S]*?), sideChannel: \{\}\}\);<\/script>/;
const GOOGLE_RECORD_FIELDS = 21;
// Measured 2026-11-17 on 41 records: the shortest section was 342 characters of text.
const GOOGLE_SECTION_FLOOR = 100;

// data = JSON.parse(the ds:0 capture); a parse error is a null.
Array.isArray(data) && data.length === 1
Array.isArray(r = data[0]) && r.length === GOOGLE_RECORD_FIELDS
r[0] === id                                  // a string, equal to the id in the URL
typeof r[1] === 'string' && r[1].trim()      // title
typeof r[7] === 'string' && r[7].trim()      // employer
// For i of 3 (responsibilities), 4 (qualifications), 10 (about):
Array.isArray(r[i]) && r[i].length === 2 && typeof r[i][1] === 'string'
jdHtmlToText(r[i][1]).length >= GOOGLE_SECTION_FLOOR
// Locations. An empty list is allowed and prints no Location line.
Array.isArray(r[9]) && r[9].every((l) => Array.isArray(l) && typeof l[0] === 'string' && l[0].trim())
```

**The text.** Blocks joined by a blank line, then `compactText(text, textCap)`. The title is `compactText(r[1], 300)`.

```text
Company: <r[7]>
Location: <each r[9][n][0], joined with " | ">

Qualifications:
<jdHtmlToText(r[4][1])>

About the job:
<jdHtmlToText(r[10][1])>

Responsibilities:
<jdHtmlToText(r[3][1])>
```

**The fetch.** `fetchGoogleJd(apiUrl, id, postingUrl, textCap, timeoutMs)` is `fetchUltiproJd` with `normalizeGoogleJob` in place of `normalizeUltiproJob`. It keeps the private-address guard, `accept: 'text/html'`, `redirect: 'error'`, the abort timer, `discard(res)` on a status that is not ok, and `null` on a throw.

- [ ] **Step 1: Write the fixtures.** The test file builds records with this helper. It is also the fixture's content. Positions 11 to 14, 16, 17 and 20 are copied from the live record as placeholders and nothing reads them.

```js
const ID = '900000000000000001';
const NEIGHBOUR = '900000000000000002';
const DETAIL = `https://www.google.com/about/careers/applications/jobs/results/${ID}-platform-program-manager`;
const list = (word) => `<ul>\n<li>${word} item one for the fixture posting, long enough to pass the floor.</li>\n<li>${word} item two &amp; more.</li>\n</ul>`;
const record = (over = {}) => Object.assign([
  ID, 'Platform Program Manager', 'https://www.google.com/about/careers/applications/signin?jobId=FIXTURE',
  [null, list('Responsibility')], [null, `<h3>Minimum qualifications:</h3>${list('Qualification')}`],
  'projects/fixture/tenants/00000000-0000-0000-0000-000000000000/companies/00000000-0000-0000-0000-000000000001', null, 'Fixture Co', 'en-US',
  [['Springfield, IL, USA', ['Springfield, IL, USA'], 'Springfield', null, 'IL', 'US'], ['Metropolis, NY, USA', ['Metropolis, NY, USA'], 'Metropolis', null, 'NY', 'US']],
  [null, '<p>Fixture Co builds fictional things. This paragraph describes the team and is long enough to pass the floor.</p><p>The US base salary range for this full-time position is $100,000-$150,000.</p>'],
  [2], [1794956915, 0], [1794956915, 0], [1794956915, 0], [null, ''], null, null, [null, 'Note: fixture.'], [null, list('Qualification')], 2,
], over);
const esc = (value) => JSON.stringify(value).replaceAll('<', '\\u003c');
const page = (ds0, ds1 = [[record({ 0: NEIGHBOUR, 1: 'Another Posting' })], null, 1, 20]) =>
  `<html><body><script class="ds:0" nonce="fixture">AF_initDataCallback({key: 'ds:0', hash: '1', data:${esc(ds0)}, sideChannel: {}});</script><script class="ds:1" nonce="fixture">AF_initDataCallback({key: 'ds:1', hash: '2', data:${esc(ds1)}, sideChannel: {}});</script></body></html>`;
```

The two fixture files prove the pattern against Google's own bytes, so make them from a live page and not from `page()`. Download one live detail page into a scratch directory outside the repo. Keep its two `<script class="ds:0" …>` and `<script class="ds:1" …>` elements and delete everything else. In `google-detail-open.html`, replace the `data:` value of `ds:0` with `esc([record()])` and the `data:` value of `ds:1` with `esc([[record({ 0: NEIGHBOUR, 1: 'Another Posting' })], null, 1, 20])`. `google-detail-missing.html` is the same file with `[]` as the `ds:0` value. Set both `nonce` values to `fixture`. Wrap each in `<html><body>` and `</body></html>`. The envelope seen on 2026-11-17 was `<script class="ds:0" nonce="…">AF_initDataCallback({key: 'ds:0', hash: '1', data:[[…]], sideChannel: {}});</script>`. If the live envelope differs from that, stop and report it.

Run: `wc -c tests/fixtures/google-detail-*.html` and `grep -o 'nonce="[^"]*"' tests/fixtures/google-detail-*.html | sort -u`
Expected: each file is under 4,000 bytes, and the only nonce is `nonce="fixture"`. Read both files once. No real posting text, employer, id or sign-in token is in either.

- [ ] **Step 2: Write the failing suite `tests/jd-text-google.test.mjs`.** The file opens with this block, then Step 1's helpers, then the tests. `withFetch` is the helper of `tests/jd-text-eightfold.test.mjs`.

```js
import './helpers.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveAtsApi, checkLivenessViaApi, isAtsPosting, JD_TEXT_API_ATS } from '../liveness-api.mjs';
import { fetchJdViaKnownApi, normalizeGoogleJob, JD_FETCHERS } from '../browser-extract.mjs';
import { fetchJdText } from '../jd-years.mjs';

const TEXT_ONLY = { textOnly: true };
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
async function withFetch(mock, run) {
  const previous = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await run(); } finally { globalThis.fetch = previous; }
}
```

```js
test('a Google Careers posting resolves to its own page, as a text-only board', async () => {
  const resolved = resolveAtsApi(`${DETAIL}?q=program%20manager&sort_by=date`);
  assert.equal(resolved.ats, 'google');
  assert.equal(resolved.apiUrl, DETAIL);
  assert.deepEqual(resolved.parts, { id: ID, slug: 'platform-program-manager' });
  assert.equal(resolved.jdTextOnly, true);
  assert.ok(JD_TEXT_API_ATS.has('google'));
  assert.equal(isAtsPosting(DETAIL), false);
  let sent = 0;
  assert.equal(await withFetch(async () => { sent += 1; return new Response(''); }, () => checkLivenessViaApi(DETAIL)), null);
  assert.equal(sent, 0, 'liveness sends nothing for a text-only board');
});

test('results pages, a posting with no slug, other Google paths and lookalike hosts do not resolve', () => {
  for (const url of [
    'https://www.google.com/about/careers/applications/jobs/results/?q=program%20manager',
    `https://www.google.com/about/careers/applications/jobs/results/${ID}`,
    `https://www.google.com/about/careers/applications/jobs/results/abc-platform-program-manager`,
    `https://www.google.com/about/careers/applications/jobs/results/${ID}-Platform..Manager`,
    `https://www.google.com/search?q=${ID}-platform-program-manager`,
    `https://google.com/about/careers/applications/jobs/results/${ID}-platform-program-manager`,
    `https://www.google.com.evil.test/about/careers/applications/jobs/results/${ID}-platform-program-manager`,
    `http://www.google.com/about/careers/applications/jobs/results/${ID}-platform-program-manager`,
  ]) assert.notEqual(resolveAtsApi(url)?.ats, 'google', url);
});

test('the record reads as company, locations and the three sections, in the page order', () => {
  const jd = normalizeGoogleJob(page([record()]), ID, DETAIL);
  assert.equal(jd.url, DETAIL);
  assert.equal(jd.title, 'Platform Program Manager');
  assert.ok(jd.text.startsWith('Company: Fixture Co\nLocation: Springfield, IL, USA | Metropolis, NY, USA\n\nQualifications:\nMinimum qualifications:'));
  const at = (label) => jd.text.indexOf(`\n\n${label}:\n`);
  assert.ok(at('About the job') > 0 && at('About the job') < at('Responsibilities'));
  assert.match(jd.text, /The US base salary range for this full-time position is \$100,000-\$150,000\./);
  assert.match(jd.text, /- Responsibility item two & more\.$/);
  assert.doesNotMatch(jd.text, /Another Posting|Note: fixture|signin/);
  assert.ok(normalizeGoogleJob(page([record({ 9: [] })]), ID, DETAIL).text.startsWith('Company: Fixture Co\n\nQualifications:'));
});

test("a missing posting, a neighbour's id and every broken shape give no text", () => {
  const shifted = record(); shifted.splice(2, 0, 'inserted'); shifted.pop();
  const cases = {
    'a missing posting': [page([]), ID],
    "a neighbour's id": [page([record()]), NEIGHBOUR],
    'the neighbour moved into ds:0': [page([record({ 0: NEIGHBOUR })]), ID],
    '22 fields': [page([[...record(), null]]), ID],
    '20 fields': [page([record().slice(0, 20)]), ID],
    'a field inserted at 2': [page([shifted]), ID],
    'a number for an id': [page([record({ 0: Number(ID) })]), ID],
    'two records': [page([record(), record()]), ID],
    'a section that is not a pair': [page([record({ 3: 'text' })]), ID],
    'short responsibilities': [page([record({ 3: [null, '<p>TBD</p>'] })]), ID],
    'short qualifications': [page([record({ 4: [null, '<p>TBD</p>'] })]), ID],
    'short about text': [page([record({ 10: [null, '<p>TBD</p>'] })]), ID],
    'no title': [page([record({ 1: ' ' })]), ID],
    'no employer': [page([record({ 7: null })]), ID],
    'a location with no name': [page([record({ 9: [[null]] })]), ID],
    'no ds:0 block': ['<html><body>Sign in</body></html>', ID],
    'a block that is not JSON': [page([record()]).replace("data:[[", "data:[[oops"), ID],
  };
  for (const [name, [html, id]] of Object.entries(cases)) assert.equal(normalizeGoogleJob(html, id, DETAIL), null, name);
});

test('the pages saved from Google read the same as the built ones', () => {
  assert.deepEqual(normalizeGoogleJob(fixture('google-detail-open.html'), ID, DETAIL), normalizeGoogleJob(page([record()]), ID, DETAIL));
  assert.equal(normalizeGoogleJob(fixture('google-detail-open.html'), NEIGHBOUR, DETAIL), null);
  assert.equal(normalizeGoogleJob(fixture('google-detail-missing.html'), ID, DETAIL), null);
});

test('fetchJdViaKnownApi reads it for a text-only caller alone, with one HTML request and no redirect', async () => {
  assert.deepEqual(Object.keys(JD_FETCHERS).sort(), [...JD_TEXT_API_ATS].sort());
  const calls = [];
  const reply = async (url, opts) => { calls.push({ url: String(url), accept: opts.headers.accept, redirect: opts.redirect }); return new Response(page([record()])); };
  assert.equal(await withFetch(reply, () => fetchJdViaKnownApi(DETAIL)), null);
  assert.deepEqual(calls, []);
  const jd = await withFetch(reply, () => fetchJdViaKnownApi(`${DETAIL}?sort_by=date`, undefined, undefined, TEXT_ONLY));
  assert.deepEqual(calls, [{ url: DETAIL, accept: 'text/html', redirect: 'error' }]);
  assert.deepEqual([jd.ats, jd.title, jd.url], ['google', 'Platform Program Manager', `${DETAIL}?sort_by=date`]);
  const short = await withFetch(reply, () => fetchJdViaKnownApi(DETAIL, 60, undefined, TEXT_ONLY));
  assert.equal(short.text.length, 61);
});

test('a failed request or a missing posting is a miss', async () => {
  for (const reply of [
    async () => new Response(page([record()]), { status: 503 }),
    async () => new Response('Not Found', { status: 404 }),
    async () => new Response(page([])),
    async () => { throw new TypeError('fetch failed'); },
  ]) assert.equal(await withFetch(reply, () => fetchJdViaKnownApi(DETAIL, undefined, undefined, TEXT_ONLY)), null);
});

test("the scan's experience filter reads the text, and a missing record throws so the row is labelled from its listing", async () => {
  const text = await withFetch(async () => new Response(page([record()])), () => fetchJdText(DETAIL));
  assert.match(text, /Qualification item one/);
  await assert.rejects(withFetch(async () => new Response(page([])), () => fetchJdText(DETAIL)), /google JD fetch returned nothing/);
});
```

In `tests/browser-extract.test.mjs`, add this row to `ATS_URL_SHAPES` after the `atlassian-icims` row:

```js
['google', 'https://www.google.com/about/careers/applications/jobs/results/900000000000000001-platform-program-manager'],
```

- [ ] **Step 3: Run it and see it fail.** Run: `node --test tests/jd-text-google.test.mjs`. Expected: FAIL. `normalizeGoogleJob` is not exported from `browser-extract.mjs`.

- [ ] **Step 4: Build the entry, the normalizer, the fetcher and the routing row.** Follow "The `resolveAtsApi` entry", "The shape rule", "The text" and "The fetch" above. Add `'google',` to `JD_TEXT_API_ATS` between `'eightfold'` and `'greenhouse'`. Add this sentence to the comment above the set, before "LinkedIn is on ATS_PROVIDERS": "Google Careers has no JSON API; its posting page embeds the record as unnamed positions, which `normalizeGoogleJob` reads only when the shape and the id match." Add the `google` row to `JD_FETCHERS` after `ultipro`, and name Google's `id` in the comment's list of unpacked `parts`.

- [ ] **Step 5: Run the suites this task touches**

Run: `node --test tests/jd-text-google.test.mjs`
Expected: PASS, 8 tests.
Run: `node test-all.mjs --quick --only browser-extract`, then `--only jd-text`, then `--only ultipro`, then `--only liveness-api`
Expected: every run ends "All tests passed". The first proves the routing table and the discard probe accept the new row.
Run: `npm run lint`. If it exits 2 and prints no error, run `node scripts/check-syntax.mjs` and trust its result.

- [ ] **Step 6: Check one live posting.** Open `https://www.google.com/about/careers/applications/jobs/results/?q=program%20manager&location=United%20States&sort_by=date` and copy one posting URL. Run: `node fetch-jd.mjs "<that URL>" | head -20`. Expected: exit 0. The first line is the posting's title and the text starts "Company:". If it exits 1, save the page, compare its `ds:0` with the shape rule, and stop and report the difference. Do not loosen the rule to make it pass.

- [ ] **Step 7: Commit.** In `.claude/skills/upstream-review/SKILL.md`, in the row that opens "`JD_TEXT_API_ATS` has 12 ids", add to the second cell: the `google` entry in `ATS_PROVIDERS` (`jdTextOnly`), `'google'` in `JD_TEXT_API_ATS`, and in `browser-extract.mjs` `normalizeGoogleJob`, `fetchGoogleJd` and the `google` key of `JD_FETCHERS`. In the fourth cell, name the pins, which are `tests/jd-text-google.test.mjs` with `tests/fixtures/google-detail-open.html` and `tests/fixtures/google-detail-missing.html`, and the `google` row of `ATS_URL_SHAPES`. Say there that the record is positional, so a field count other than 21 reads as no text by design.

Run: `git add liveness-api.mjs browser-extract.mjs tests/jd-text-google.test.mjs tests/fixtures/google-detail-open.html tests/fixtures/google-detail-missing.html tests/browser-extract.test.mjs .claude/skills/upstream-review/SKILL.md && node validate-system-paths-coverage.mjs && git commit -m "feat(jd): read Google Careers posting text from the detail page's record" && node --test tests/fork-deviations-covered.test.mjs`

---

### Task 2: The drain queues a skipped row again once its board has a reader

**Files:**
- Modify: `lib/evaluate-queue.mjs:147` (beside `HELD_LOCATION`)
- Modify: `web/scripts/evaluate-drain.mjs` (in `runDrain`, after the line that logs malformed rows, line 234; the literals at lines 345 and 367)
- Test: `web/tests/lib/evaluate-drain.test.mjs` (append)

**Interfaces:**
- Consumes: `JD_TEXT_API_ATS` with `'google'` from Task 1. The pass itself is generic and reads the set.
- Produces, in `lib/evaluate-queue.mjs`: `export const NO_API_TEXT = 'no-api-text'` and `export const NO_TEXT = 'no-text'`, each with a one-line comment naming the drain as the writer. Task 3's test reads both.
- Produces, in the ledger: a row `{ state: 'queued', reason: 'fetcher-added', source: 'drain' }` with the entry's `url`, `jobId` and `runId`, no rank, and `at` from the drain's `now()`.

**Behaviour to build.** In `runDrain`, after the ledger is read and before `dailyCap` is read, walk `ledger` once. For each entry that meets all four conditions of decision D6, append the row above with `appendRow`. After the walk, when any row was appended, log `` `${n} row(s) skipped as no-api-text now have a posting-text reader; queued again` ``. Do not touch `counts` or `touchedRuns`. The rest of the pass is unchanged, so the revived row meets `skipReason`, the location hold, the text fetch, the per-run limit and the daily cap like any queued row. Replace the literals `"no-api-text"` and `"no-text"` in the two `append("skipped", …)` calls with the constants. Leave the `no-text: ` prefix of the waiting reason as it is.

- [ ] **Step 1: Append the failing tests to `web/tests/lib/evaluate-drain.test.mjs`.** `HOLD` and `historyOf` already exist in the file (line 824). Add after the last test:

```js
const UNREADABLE = "https://careers.example.test/job/5";
const skipNoApiText = (root, u) => appendRow(root, { url: u, at: new Date(T0 - 30_000).toISOString(), jobId: JOB, runId: RUN, reason: "no-api-text", state: "skipped", source: "drain" });
const ledgerText = (root) => fs.readFileSync(path.join(root, "data", "evaluate-queue.tsv"), "utf8");

test("a row skipped as no-api-text is queued again once its board has a fetcher, and evaluated in the same pass", async (t) => {
  const { root, drain, state, posts } = await withDrainRoot(t, { urls: [url(1)], answer: () => done(7) });
  await skipNoApiText(root, url(1));
  const result = await drain();
  assert.deepEqual(posts.map((post) => post.body.input), [url(1)]);
  const entry = state(url(1));
  assert.deepEqual(entry.rows.map((row) => [row.state, row.reason, row.source]), [
    ["queued", "", "rank-pass"], ["skipped", "no-api-text", "drain"], ["queued", "fetcher-added", "drain"], ["running", "", "drain"], ["evaluated", "report 7", "drain"],
  ]);
  assert.equal(entry.rank, 5, "the rank the rank pass gave is kept");
  assert.deepEqual([result.status, result.evaluated, result.queued], ["drained", 1, 0]);
});

test("a board that still has no fetcher stays skipped and the pass writes nothing", async (t) => {
  const { root, drain, posts } = await withDrainRoot(t, { urls: [UNREADABLE] });
  await skipNoApiText(root, UNREADABLE);
  const before = ledgerText(root);
  assert.equal((await drain()).status, "idle");
  assert.equal(ledgerText(root), before);
  assert.equal(posts.length, 0);
});

test("a revived row whose fetcher returns no text waits as no-text, is not revived twice, and ends as no-text", async (t) => {
  const { root, drain, state } = await withDrainRoot(t, { urls: [url(1)] });
  await skipNoApiText(root, url(1));
  const empty = (now) => drain({ fetchJd: async () => null, now: () => now });
  await empty(T0);
  await empty(T0 + 60_000);
  assert.deepEqual(state(url(1)).rows.slice(2).map((row) => [row.state, row.reason]), [["queued", "fetcher-added"], ["queued", "no-text: the ATS API returned no text"]]);
  for (const hours of [6, 12, 18, 25]) await empty(T0 + hours * 3_600_000);
  const final = readLedger(root, { now: T0 + 26 * 3_600_000 }).find((entry) => entry.url === url(1));
  assert.deepEqual([final.state, final.reason], ["skipped", "no-text"]);
  const before = ledgerText(root);
  await empty(T0 + 27 * 3_600_000);
  assert.equal(ledgerText(root), before, "a no-text skip is final");
});

test("a revived row still meets the job's location hold", async (t) => {
  const { root, drain, state, posts } = await withDrainRoot(t, { urls: [url(1)], evaluate: { ...AUTO, hold: HOLD } });
  await skipNoApiText(root, url(1));
  historyOf(root, [[url(1), "Metropolis, NY"]]);
  await drain();
  assert.equal(posts.length, 0);
  assert.deepEqual([state(url(1)).state, state(url(1)).reason], ["skipped", "held-location"]);
});

test("a revived row counts toward the daily cap only when it starts", async (t) => {
  const { root, drain, state } = await withDrainRoot(t, { urls: [url(1), url(2)] });
  fs.mkdirSync(path.join(root, "config"));
  fs.writeFileSync(path.join(root, "config", "profile.yml"), "pipeline:\n  auto_evaluate_daily_cap: 1\n");
  await skipNoApiText(root, url(2));
  const result = await drain();
  assert.equal(result.evaluated, 1);
  assert.deepEqual([state(url(1)).state, state(url(2)).state, state(url(2)).reason], ["evaluated", "queued", "fetcher-added"]);
});

test("revived rows start no more than the job's limit for one pass", async (t) => {
  const { root, drain, state, posts } = await withDrainRoot(t, { urls: [url(1), url(2)], evaluate: { ...AUTO, maxPerRun: 1 } });
  await skipNoApiText(root, url(1));
  await skipNoApiText(root, url(2));
  await drain();
  assert.equal(posts.length, 1);
  assert.deepEqual([url(1), url(2)].map((u) => [state(u).state, state(u).reason].join(" ")).sort(), ["evaluated report 1", "queued fetcher-added"]);
});

test("a no-api-text row of a job that left auto mode is left alone", async (t) => {
  const { root, drain, storePath } = await withDrainRoot(t, { urls: [url(1)] });
  await skipNoApiText(root, url(1));
  const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  store.jobs[0].evaluate = { ...AUTO, mode: "manual" };
  fs.writeFileSync(storePath, JSON.stringify(store));
  const before = ledgerText(root);
  await drain();
  assert.equal(ledgerText(root), before);
});

test("a row ranked under its job's threshold today is not revived", async (t) => {
  const { root, drain } = await withDrainRoot(t, { urls: [url(1)], evaluate: { ...AUTO, rankThreshold: 5.5 } });
  await skipNoApiText(root, url(1));
  const before = ledgerText(root);
  await drain();
  assert.equal(ledgerText(root), before);
});
```

`url(n)` is a Greenhouse URL, which already has a reader, so these tests do not depend on Task 1. After plan 2 the hold reads the location verdict, and `Metropolis, NY` is `elsewhere` under `HOLD`, so the fourth test's row is held.

- [ ] **Step 2: Run them and see five fail.** Run the unit command with `tests/lib/evaluate-drain.test.mjs`. Expected: 5 fail and the rest pass. The failing ones are the first, third, fourth, fifth and sixth of the eight. The first reports `posts` as `[]`. The other three new tests pass today, because they pin what must stay unchanged.

- [ ] **Step 3: Add the constants and the pass.** Follow "Behaviour to build". The pass is about ten lines and needs no new import beyond the two constants. The drain already imports `JD_TEXT_API_ATS`, `resolveAtsApi` and `appendRow`.

- [ ] **Step 4: Run the suite**

Run: the unit command with `tests/lib/evaluate-drain.test.mjs`.
Expected: PASS. The suite had 68 tests at `c4b20ee5`, plan 2 adds one and this task adds eight, so 77.
Run from the repo root: `node test-all.mjs --quick --only evaluate-queue`
Expected: "All tests passed".

- [ ] **Step 5: Commit.** In the deviations table, in the row "no `web/scripts/evaluate-drain.mjs`", add this sentence to the second cell. "Before it plans, the drain appends `queued` `fetcher-added` for each `skipped` `no-api-text` row of an active Auto job, ranked at or above the job's threshold, whose URL now resolves to an id in `JD_TEXT_API_ATS`. A `no-text` skip is never revived." In the row "no `web/tests/lib/evaluate-drain.test.mjs`", add "the re-queue of `no-api-text` rows". Name `NO_API_TEXT` and `NO_TEXT` in the row that opens "no location hold", which covers `lib/evaluate-queue.mjs`.

Run: `git add lib/evaluate-queue.mjs web/scripts/evaluate-drain.mjs web/tests/lib/evaluate-drain.test.mjs .claude/skills/upstream-review/SKILL.md && git commit -m "feat(drain): queue a no-api-text row again once its board has a text reader" && node --test tests/fork-deviations-covered.test.mjs`

---

### Task 3: The Inbox marks rows that need a manual score and filters to them

**Files:**
- Create: `web/src/lib/inbox-no-text.mjs`, `web/tests/lib/inbox-no-text.test.mjs`
- Modify: `web/src/lib/career-ops.ts` (the `InboxJob` type, line 115)
- Modify: `web/src/app/pipeline/page.tsx` (the line that calls `markVerdicts`, line 40 before plan 2; the log text in `ledgerEntries`)
- Modify: `web/src/components/inbox/triage-row.tsx` (beside the verdict badge, line 97 before plan 2)
- Modify: `web/src/components/inbox/facet-chips.tsx` (props, the chip row at line 67, `Pill` at line 127)
- Modify: `web/src/components/inbox/inbox-triage.tsx` (the facet state at line 56, the filter predicate at line 177, `anyFacet`, `onClear`)
- Modify: `web/tests/fixtures/location-hold.mjs`, `web/tests/lib/location-hold.browser.test.mjs`

**Interfaces:**
- Consumes from Task 2: `NO_API_TEXT`, `NO_TEXT` in `lib/evaluate-queue.mjs`, read by the test only. `web/src` never imports the repo root.
- Consumes from plan 2. Read the merged files first and use the merged names where they differ.
  - `markVerdicts(markGated(unmarked, ledger), verdicts)` in `page.tsx`.
  - The `Badge` rendered from `verdictBadge(job.verdict)` in `triage-row.tsx`.
  - In `facet-chips.tsx`, the tier segment, a `role="group"` with `aria-label="Location fit"`, first in the chip row. Its buttons read "Fit", "Review location", "Elsewhere" and "All", each with its count.
  - In `inbox-triage.tsx`, the list `matched` (the predicate of every filter but the tier), `counts` (`tierCounts` over `matched`) and `filtered` (`matched` kept by `inTier`). The Inbox opens on Fit. Clear sets the tier back to Fit, so rows that are not a fit leave the view (plan 2, Task 4b).
  - The `location-hold` browser suite (plan 2, Tasks 4a, 4b and 5). Its fixture has one job whose hold is Springfield, United States and `homeStates: ["Illinois"]`, and four pending rows: Fixture Alpha (`Metropolis, NY`, elsewhere, URL `https://example.com/fixture-held`), Fixture Beta (`Springfield`, the one fit row, URL `https://example.com/fixture-plain`), Fixture Gamma (`Remote`) and Fixture Delta (no location), both review. So the segment reads "Fit 1", "Review location 2", "Elsewhere 1" and "All 4". The suite's root variable is `LOCATION_HOLD_TEST_ROOT`.
  - The suite's file-scope helpers, each taking `page` first: `row(page, company)`, `badge(page, company)` and `tierButton(page, name)`. `badge` finds the verdict badge by its title. A verdict badge's text is the label, a colon and the reason, so `getByText("Review location", { exact: true })` finds no badge.
  - The suite's last test, `Select all and Skip selected act on the tier in view`, writes to the fixture and stays last.
- Produces, in `inbox-no-text.mjs`:
  - `NO_TEXT_REASONS: ["no-api-text", "no-text"]`.
  - `markNoText(jobs: T[], ledgerEntries: { url?: string, state?: string, reason?: string }[]): (T & { noText?: true, noTextReason?: "no-api-text" | "no-text" })[]`. It marks a job whose ledger entry has `state === "skipped"` and a reason in `NO_TEXT_REASONS`, joined by `canonicalJobKey` as `markGated` joins. It returns the same array when nothing is marked.
  - `NO_TEXT_LABEL = "Needs manual score"`.
  - `noTextBadge(job: { noText?: boolean, noTextReason?: string }): { label: string, tone: "info", title: string } | null`.
- Produces, in `career-ops.ts`: `noText?: boolean` and `noTextReason?: "no-api-text" | "no-text"` on `InboxJob`, with the comment "A scheduled scan ranked this posting and the drain could not read its text, set by markNoText from the ledger's skipped row."
- Produces, in `facet-chips.tsx`: two props, `noText: { on: boolean; count: number } | null` and `toggleNoText: () => void`.

**Exact copy.**

- Badge label and chip label: "Needs manual score". The chip reads the label, a space and the count, for example "Needs manual score 3".
- Tooltip for `no-api-text`: "Not scored automatically. No posting-text reader covered this job board when the drain tried it. Save it to the shortlist and score it yourself." The past tense is on purpose. A row keeps this reason after its board gets a reader when its job is paused, deleted or manual, or its rank is under the threshold.
- Tooltip for `no-text`, and for a marked job with any other reason: "Not scored automatically. The job board returned no posting text in four tries over a day, so the posting may be closed. Open it before you score it."
- Badge tone: `info`.

**Behaviour to build.**

- `page.tsx`: wrap the marked rows, `markNoText(markVerdicts(markGated(unmarked, ledger), verdicts), ledger)`. The log text in `ledgerEntries` names "gated and no-text rows".
- `triage-row.tsx`: after the verdict badge, render `noTextBadge(job)` as a `Badge` with its `tone` and `title`, showing its `label`. A gated row keeps its gate badge as well.
- `facet-chips.tsx`: when `noText` is not `null`, one `Pill` right after the "Location fit" group, `on={noText.on}`, reading `Needs manual score {noText.count}`. `Pill` gains `aria-pressed={on}`, which every pill then carries.
- `inbox-triage.tsx`: a `needsScore` boolean state that starts `false` and is not saved. The predicate behind `matched` gains `if (needsScore && !e.job.noText) return false;`. The chip's count is the rows in `enriched` that are marked and not in `hidden`. Pass `null` for `noText` when that count is 0 and `needsScore` is `false`. `anyFacet` is also true when `needsScore` is. `onClear` also sets it to `false`.

- [ ] **Step 1: Write the failing unit suite `web/tests/lib/inbox-no-text.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { NO_TEXT_LABEL, NO_TEXT_REASONS, markNoText, noTextBadge } from "../../src/lib/inbox-no-text.mjs";
import { markGated } from "../../src/lib/inbox-pending.mjs";
import { NO_API_TEXT, NO_TEXT } from "../../../lib/evaluate-queue.mjs";

const jobs = [{ url: "https://example.com/a" }, { url: "https://example.com/b" }];
const skipped = (url, reason) => ({ url, state: "skipped", reason });

test("the Inbox reads the two reasons the drain writes", () => {
  assert.deepEqual(NO_TEXT_REASONS, [NO_API_TEXT, NO_TEXT]);
});
test("a row skipped for missing posting text is marked with its reason, by posting identity", () => {
  assert.deepEqual(markNoText(jobs, [skipped("https://example.com/a?utm_source=x", "no-api-text"), skipped("https://example.com/b", "no-text")]), [
    { url: "https://example.com/a", noText: true, noTextReason: "no-api-text" },
    { url: "https://example.com/b", noText: true, noTextReason: "no-text" },
  ]);
});
test("a row skipped for another reason, a row waiting for text and a row queued again are not marked", () => {
  const ledger = [skipped("https://example.com/a", "held-location"), { url: "https://example.com/b", state: "queued", reason: "no-text: the ATS API returned no text" }];
  assert.equal(markNoText(jobs, ledger), jobs);
  assert.equal(markNoText(jobs, [{ url: "https://example.com/a", state: "queued", reason: "fetcher-added" }]), jobs);
  assert.equal(markNoText(jobs, []), jobs);
});
test("a gated row keeps its gate beside the mark", () => {
  const ledger = [{ url: "https://example.com/a", state: "gated", reason: "dealbreaker" }, skipped("https://example.com/b", "no-text")];
  assert.deepEqual(markNoText(markGated(jobs, ledger), ledger), [{ url: "https://example.com/a", gated: "dealbreaker" }, { url: "https://example.com/b", noText: true, noTextReason: "no-text" }]);
});
test("the badge says why, and a job that is not marked has none", () => {
  assert.equal(NO_TEXT_LABEL, "Needs manual score");
  assert.deepEqual(noTextBadge({ noText: true, noTextReason: "no-api-text" }), {
    label: "Needs manual score", tone: "info",
    title: "Not scored automatically. No posting-text reader covered this job board when the drain tried it. Save it to the shortlist and score it yourself.",
  });
  const closed = "Not scored automatically. The job board returned no posting text in four tries over a day, so the posting may be closed. Open it before you score it.";
  assert.equal(noTextBadge({ noText: true, noTextReason: "no-text" }).title, closed);
  assert.equal(noTextBadge({ noText: true }).title, closed);
  assert.equal(noTextBadge({}), null);
});
```

- [ ] **Step 2: Extend the browser fixture and suite.** In `web/tests/fixtures/location-hold.mjs`, add one ledger line for the fit row, `https://example.com/fixture-plain`: same `at`, job and run as the existing line, blank rank, reason `no-api-text`, state `skipped`, source `drain`. No count plan 2 asserts changes, because the row stays pending and stays a fit.

In `web/tests/lib/location-hold.browser.test.mjs`, add the test `a posting with no readable text is marked and the chip filters to it` before `Select all and Skip selected act on the tier in view`, so it reads the fixture before that test skips a row. Same skip guard, browser setup and `settled` helper as its neighbours. It uses plan 2's `row`, `badge` and `tierButton` and defines none of its own. Its body:

```js
await settled(page, () => page.goto(`${url}/pipeline`));
// The Inbox opens on Fit, and the marked row is the one fit row.
await row(page, "Fixture Beta").waitFor();
const chip = page.getByRole("button", { name: "Needs manual score 1", exact: true });
assert.equal(await chip.getAttribute("aria-pressed"), "false");
const mark = (company) => row(page, company).getByTitle(/^Not scored automatically/);
assert.equal(await mark("Fixture Beta").textContent(), "Needs manual score");
assert.equal(await mark("Fixture Beta").getAttribute("title"),
  "Not scored automatically. No posting-text reader covered this job board when the drain tried it. Save it to the shortlist and score it yourself.");
assert.equal(await badge(page, "Fixture Beta").count(), 0, "a fit row has no verdict badge");

await tierButton(page, "All 4").click();
await row(page, "Fixture Alpha").waitFor();
assert.equal(await mark("Fixture Alpha").count(), 0);
assert.equal(await badge(page, "Fixture Alpha").count(), 1, "the verdict badge is still there");

await chip.click();
await tierButton(page, "All 1").waitFor();
assert.equal(await chip.getAttribute("aria-pressed"), "true");
assert.equal(await tierButton(page, "Fit 1").count(), 1, "the counts follow the chip");
assert.equal(await row(page, "Fixture Alpha").count(), 0);
assert.equal(await row(page, "Fixture Beta").count(), 1);

// Clear returns the tier to Fit, so Alpha stays out of view.
await page.getByRole("button", { name: "Clear" }).click();
await tierButton(page, "All 4").waitFor();
await row(page, "Fixture Beta").waitFor();
assert.equal(await chip.getAttribute("aria-pressed"), "false");
assert.equal(await tierButton(page, "Fit 1").getAttribute("aria-pressed"), "true");
assert.equal(await row(page, "Fixture Alpha").count(), 0, "Clear returns to Fit");
assert.deepEqual(errors, []);
```

The segment names, the company names and the helpers are plan 2's. The clear control reads "Clear" at `c4b20ee5` (`facet-chips.tsx:112`). After the chip is pressed the tier is still All, and `counts` is taken over the one marked row, so the segment reads "Fit 1" and "All 1".

- [ ] **Step 3: Run both and see them fail**

Run: the unit command with `tests/lib/inbox-no-text.test.mjs`.
Expected: FAIL. `inbox-no-text.mjs` does not exist.
Run: the browser command.
Expected: FAIL. No button named "Needs manual score 1" exists.

- [ ] **Step 4: Build the behaviour.** Follow "Behaviour to build" and the copy above.

- [ ] **Step 5: Run everything this task touches.** Run from `web/`: `npm run typecheck`, then `npm test`, then `npm run build` and the browser loop over `location-hold inbox-keys inbox-undo evaluation-options accessible-names`. Expected: PASS, with no skipped test. The last four prove an Inbox with no marked row shows no chip, and that `aria-pressed` on every pill broke no name.

- [ ] **Step 6: Commit.** In the deviations table, in the row plan 2 used for the Inbox (it opens "no location hold"), name `web/src/lib/inbox-no-text.mjs`, `web/tests/lib/inbox-no-text.test.mjs` and each file above by full path. Add this sentence. "The Inbox marks a pending row whose ledger entry is `skipped` as `no-api-text` or `no-text` (`markNoText`), shows a 'Needs manual score' badge and filters to those rows with one chip."

Run: `git add web/src/lib/inbox-no-text.mjs web/tests/lib/inbox-no-text.test.mjs web/src/lib/career-ops.ts web/src/app/pipeline/page.tsx web/src/components/inbox web/tests/fixtures/location-hold.mjs web/tests/lib/location-hold.browser.test.mjs .claude/skills/upstream-review/SKILL.md && node validate-system-paths-coverage.mjs && git commit -m "feat(inbox): mark and filter postings that need a manual score" && node --test tests/fork-deviations-covered.test.mjs`

---

### Task 4: Docs, and the checks before the push

**Files:**
- Modify: `docs/AUTOMATION.md:277-279` (the bullet that opens "**Boards with a public API only.**")
- Modify: `docs/WEB_UI.md` (the Inbox paragraph plan 2 wrote, which names the **Fit** button)
- Modify: `docs/SUPPORTED_JOB_BOARDS.md:66` (the Google row)
- Modify: `.claude/skills/upstream-review/SKILL.md`

**Interfaces:** none.

- [ ] **Step 1: Edit the three documents.** In `docs/AUTOMATION.md`, replace the bullet with this, word for word:

> - **Boards with a readable posting text only.** A row on a board whose posting text the runner cannot read is skipped as `no-api-text`, and the Inbox marks it **Needs manual score**. When a later version can read that board, the next tick queues the row again by itself, if its scan is still active and automatic and its rank still clears the threshold. It is then evaluated under the same limits and the same location hold. A posting whose text does not come in four tries over a day is skipped as `no-text`, gets the same mark, and is not tried again.

In `docs/WEB_UI.md`, add after plan 2's Inbox paragraph:

> A posting a scheduled scan ranked and could not read carries a **Needs manual score** badge, and its tooltip says whether the board had no reader or the posting returned no text. The **Needs manual score** button lists only those postings.

In `docs/SUPPORTED_JOB_BOARDS.md`, end the Google row's Notes cell with: "Posting text for evaluation is read from the record the posting's own page embeds, and only when that record has the expected shape and the posting's id."

- [ ] **Step 2: Check the deviations rows and the wording**

Run from the repo root: `grep -c "jd-text-google.test.mjs\|inbox-no-text.mjs\|fetcher-added" .claude/skills/upstream-review/SKILL.md`
Expected: `3` or more.
Run: `grep -rn "Boards with a public API only" docs/`
Expected: no line.

- [ ] **Step 3: Commit.** Run: `git add docs/AUTOMATION.md docs/WEB_UI.md docs/SUPPORTED_JOB_BOARDS.md .claude/skills/upstream-review/SKILL.md && git commit -m "docs(automation): describe the Google text reader, the re-queue and the manual-score mark" && node --test tests/fork-deviations-covered.test.mjs`

- [ ] **Step 4: Run the checks the push needs.** Run from the repo root: `npm run lint`, then `node test-all.mjs --quick`. Run from `web/`: `npm run typecheck`, `npm test`, then `npm run build && npm run test:browser`. That is every browser suite. Expected: all pass, and the browser runner reports no skipped test.

- [ ] **Step 5: Review, then push once.** Run the four pr-review-toolkit reviewers on the unpushed branch and fix what they confirm. Then run `node .githooks/coderabbit-review.mjs` as its own command, never chained with the push. Fix confirmed major findings for at most two passes, then decline the rest with `--decline "<reason>"`. Ask the owner once for the push and the pull request. The PR body opens its `## Why` with the owner's goal, lists the findings below major that were not fixed, and states that no personal data was added and `node test-all.mjs` passed. Merging needs the owner's explicit approval in the session.

## Offered, not built

- **Liveness for Google postings.** A page whose `ds:0` is `[]` could read as expired, which would close a Google posting without a browser. It rests on two made-up ids and no real closed posting. Build it after one real closed posting is saved as a fixture. It is an `interpret` on the entry and the removal of `jdTextOnly`.
- **Structured locations in the scanner.** The results page's `ds:1` carries city, state and country for every card, where `parseResultsPage` reads the card's text line and Google cuts it at "+2 more". Reading it would use the same shape rule. It belongs to location quality (plan 3's subject) and changes `providers/google.mjs`, which this plan leaves alone.
- **The notes fields.** `[15]` and `[18]` hold legal notices, benefits text and a location note. Their meaning is inferred, so they stay out of the text (decision D4).
- **Readers for the other unsupported boards.** Non-Atlassian iCIMS (74 URLs), BambooHR (28), Paylocity (25) and Shopify (8) still skip as `no-api-text` and now carry the badge. None had a posting ranked at or above 3.5 (spec, Finding 5). When one gets a reader, the re-queue brings its rows back with no further work.
- **A browser fallback in the drain.** Ruled out by the spec. The unattended worker has no network tool.
- **The reason on a phone.** The tooltip does not show on a touch screen. Plan 2 has the same limit for its badges.

## After this is deployed

Nothing here is part of the pull request. The check below only reads. Start when the pod runs an image that contains this plan, which the **Needs manual score** badge or chip in the Inbox confirms while any row is still marked.

With the re-queue shipped, the owner's skipped Google posting comes back as `queued` `fetcher-added` on the next drain tick, if its job is still active and automatic and its rank clears the threshold. It is evaluated then unless the hold reads its location as other than fit or the daily cap is spent. Google truncates location lists with "+2 more", and the scanner stores only the places shown, so the hold may read the location as review. Scoring it by hand from the Inbox is the sure route. The spec counted 13 Google URLs ranked at or above 3.5, all skipped as `no-api-text`, the owner's top-ranked posting (rank 3.7, skipped at 2026-11-17T12:05:33Z) among them.

This prints one line for each Google URL: the time, state and reason of its latest ledger row, its last recorded rank, its job and the URL. The job reads as name, status, mode and threshold, or as the job's id when the store file is not beside the ledger. A row is revived only when the job reads `active/auto` and the rank is at or above the threshold.

```bash
KUBECONFIG=~/dev/home-cluster/kubeconfig kubectl -n career-ops exec deploy/career-ops -- node -e 'const fs=require("fs");const d="/data/data/";let jobs=[];try{jobs=JSON.parse(fs.readFileSync(d+"scheduled-jobs.json","utf8")).jobs}catch{}const job=(id)=>{const j=jobs.find((x)=>x.id===id);return j?[j.name,j.status,j.evaluate?.mode??"-",j.evaluate?.rankThreshold??"-"].join("/"):id||"-"};const last=new Map(),rank=new Map();for(const l of fs.readFileSync(d+"evaluate-queue.tsv","utf8").split("\n").slice(1).filter(Boolean)){const r=l.split("\t");if(!r[0].includes("google.com/about/careers"))continue;last.set(r[0],r);if(r[4])rank.set(r[0],r[4])}for(const r of last.values())console.log([r[1],r[6],r[5]||"-",rank.get(r[0])||"-",job(r[2]),r[0]].join("\t"))'
```

What to expect:

- **Before the first tick on the new image.** Every line reads `skipped` `no-api-text`.
- **After the first tick.** No line reads `skipped` `no-api-text` for a posting whose job reads `active/auto` and whose rank is at or above that job's threshold. A line that fails either test stays `skipped` `no-api-text` and keeps its badge. Each revived line reads one of these: `evaluated` with `report N`, `gated`, `running`, `queued` `fetcher-added` (waiting for the per-run limit or the daily cap, default 10 a UTC day), `skipped` `held-location` (the hold reads its location as review or elsewhere), or `skipped` `not-pending`, `already-evaluated` or `report-exists` (handled by hand since).
- **Over the next day or two.** The `queued` lines drain, best rank first. A line that reads `queued` `no-text: …` and then `skipped` `no-text` is a posting Google no longer serves, or a record whose shape changed. Many of those at once means the shape changed. Run Task 1 Step 6 against a live posting.
- **Other boards.** The pass is not specific to Google. A row skipped before the Eightfold or Atlassian readers shipped comes back on the same tick, so the first day can start more evaluations than the Google count. The daily cap still bounds it.

The drain log names the pass once, as "N row(s) skipped as no-api-text now have a posting-text reader; queued again".
