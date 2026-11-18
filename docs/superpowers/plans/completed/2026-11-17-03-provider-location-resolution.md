# Provider location resolution implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make three scanner providers write location facts their APIs already return into each posting's `location` string, so fewer new inbox rows land in the "Review location" tier or are hidden as "Elsewhere" by mistake.

**Architecture:** There is no new design and no schema change. A posting's location is judged from two stored strings, both written from the provider's `location`. The automatic hold reads the `location` column of the posting's last `added` row in `scan-history.tsv` (`heldForLocation`, `web/src/lib/core/evaluate-candidates.mjs:103-108`). The Inbox reads the location in the posting's `pipeline.md` row. Neither file stores `workplaceType` or `isRemote`, so every resolved fact goes into the `location` string, in the forms the gate already reads (`City, State, Country`, a trailing `Remote`, the `' · '` separator). BambooHR and Eightfold change inside the provider. Workday changes in `scan-ats-full.mjs`, which stops withholding the title decision the provider already knows how to use.

**Tech Stack:** Node 24 ESM. Provider tests use the repo's `pass`/`fail` helpers from `tests/helpers.mjs`. New root-level tests use `node:test`.

**Spec:** [`docs/superpowers/research/2026-11-17-location-verdicts/README.md`](../../research/2026-11-17-location-verdicts/README.md), Finding 4. Its "Owner decisions" table is binding.

**Order:** Plan 3 of 4. It lands after plan 2. It reads no name from plan 1 or plan 2 and compiles without them. It lands after plan 2 because the tiers its location strings move rows between ("Review location", "Elsewhere") exist only there. Plan 4 lands after it and needs nothing from it.

## How this plan was checked

One session checked every Finding 4 claim on 2026-11-17 against `main` at `c4b20ee5` and the live public APIs. Line numbers are from `c4b20ee5`. A task that edits a file an earlier plan changed locates the edit by symbol or by quoted text.

What was run:

- **BambooHR.** `GET /careers/list` on 10 tenants drawn from the public slug list `scan-ats-full.mjs` uses. Five had open postings, 11 rows in all. Every row carries `atsLocation` and `locationType`. Nine rows have `locationType: "0"`, a filled `location` and an all-null `atsLocation`. One row (`rlg`, id 79) has `locationType: "1"`, a null `location`, `isRemote: null` and `atsLocation` of Vancouver, British Columbia, Canada. One row (`catboor`, id 30) has `locationType: "2"` and a filled `location`. The public posting pages render these as "Pocomoke City, Maryland", "Vancouver, British Columbia (Remote)" and "Lombard, Illinois (Hybrid)". So `0` is on-site, `1` is remote and `2` is hybrid, each seen on one tenant's page. `parseBambooHRResponse` run on the saved `rlg` response returns `location: ""` for id 79.
- **Eightfold.** One `/api/pcsx/search` page and three `/api/pcsx/position_details` documents from `apply.careers.microsoft.com`. The search rows carry no `efcustomTextWorkSite`. The detail carries it as an array: `["0 days / week in-office – remote"]` on the "Multiple Locations" row and `["3 days / week in-office"]` on a Redmond row and an Atlanta row. `workLocationOption` is `"onsite"` on all three, which confirms the spec's warning. The search response also carries `data.filterDef.smartFilters` with a `work_site` filter that lists the same values. A search with `filter_work_site=0 days / week in-office – remote` returned `count: 361` of 2,355 and `appliedFilters: { workSite: [...] }`. Its first page includes the row whose detail said remote, two rows listed in Redmond and Atlanta, and one in Toronto. `parseEightfoldResponse` run on the saved unfiltered page returns `United States, Washington, Redmond` and `United States, Multiple Locations, Multiple Locations` for two of those remote rows.
- **Eightfold, other tenants.** `netflix.eightfold.ai` and `netapp.eightfold.ai` answer the v2 endpoint and refuse PCSX. Their rows have no `efcustom*` field and no `filterDef`. `work_location_option` is `"onsite"` on NetApp's "Home - United States National" row, so that field is wrong on a second tenant.
- **Workday.** The call path was read. `scan.mjs:5130` passes `titleWanted`. The `ctx` that `scan-ats-full.mjs` builds at line 1944 does not, and `sourceCtx` (line 2318) copies it. Line 1495, which the investigator cited, is the Ashby, Greenhouse and Lever seed fetch and never reaches Workday. Three live list pages from NVIDIA's tenant held 19 placeholders in 60 postings, and none of the 19 passed a stand-in title filter of five sales-engineering phrases.
- **Greenhouse.** Five boards from `templates/portals.example.yml` with `content=true`, 571 postings. See "Left out".
- **Dedupe.** `collectSeenUrls`, `isOfferSeen`, `collectSeenCompanyRoles` and `matchesSeenCompanyRole` were run on a history row and the same URL with a changed location. Results are under "Effect on dedupe".
- **Gate.** `buildWorkplacePolicy` with the pod's hold shape (Atlanta, Alpharetta, Marietta, Johns Creek; remote country United States) was run on every before and after string this plan quotes.

An independent reviewer then exported `c4b20ee5` and built all three tasks in a scratch copy. What the reviewer ran:

- **Task 1.** The new test failed as Step 2 predicts. With the rule built, `providers/bamboohr` passed 30 of 30.
- **Task 3.** The new test failed at import. With the helper built it passed 5 of 5, `scan-ats-full` passed 206 of 206 and `providers/workday` passed 222 of 222.
- **Task 2.** One case failed against a correct build. It passed `undefined` where it meant "no filter definition", and `undefined` takes the helper's default. With `null` the suite passed 73 of 73.
- **Gate.** `buildWorkplacePolicy` with the pod's hold shape, on the strings the built providers produced.
- **Live.** BambooHR `/careers/list` on three tenants, and one Microsoft `/api/pcsx/search` page. Its `work_site` filter lists six values. One says remote and none says hybrid.

A third session fixed this plan from the review and ran these on the reviewer's build, with no network request:

- The reviewer's four counts, again. Same numbers.
- The `undefined` case. It fails with `no filterDef: 3 requests, ["Redmond, WA","Redmond, WA · Remote"]`.
- Task 2's tests as they now read. Against the reviewer's provider two fail, both on the hybrid value. With `/hybrid|partial/i` excluded the suite passes 74 of 74. Changing the provider to treat an unusable body as the end of the walk fails the new unusable-body case. Changing it to tag the board in the pass's `catch` fails all four failure cases.
- Task 2's tests against the provider at `c4b20ee5`. The output is the one Step 2 now quotes.
- The gate, on `Irvine, CA, Remote`, `Irvine, CA · Remote`, `Austin, Texas, Remote` and the Redmond and Vancouver strings. Results are quoted where the plan uses them.
- The reviewer's saved Microsoft page. `locationFlexibility` is `null` on 10 of 10 rows.

What was not run:

- The reviewer's build is scratch work and is not the implementation. Each Step 2 and Step 4 is a first run for the implementer's code.
- No verdict was run, because `locationVerdict` does not exist at `c4b20ee5`. By plan 1's rules, `United States, Washington, Redmond · Remote` is `review` (remote, and the place is in a state that is not home) where `United States, Washington, Redmond` is `elsewhere`, and `United States, Multiple Locations, Multiple Locations · Remote` is `fit`. Derived, not run. The gate under them was run: the first and third are `remote_region_allowed` and the second is `onsite_outside_allowed_locations`.
- `locationType` was read on 11 rows from 5 tenants. A wider sample was not taken.
- No second PCSX tenant was found, so the `work_site` filter is confirmed on Microsoft only. Task 2 makes no request on a tenant that does not advertise the filter.
- Microsoft's edge answered 429 to three of the seven plain requests the first session sent, including the first. How it treats the 37 extra pages Task 2 adds was not measured.
- The pod was not read. Whether its `portals.yml` sets `scan_history.dedup_include_location` is unknown, and `grep -n dedup_include_location /data/portals.yml` on the pod settles it. Its `location_filter` was not read either, so the size of the first-scan rise under "Effect on dedupe" is a ceiling, not a count.
- The stand-in title filter is not the owner's. The Workday saving on his filter was not measured, and neither was the number of Microsoft postings his title filter keeps.

The saved responses are in the session scratchpad and will not outlive it. The fixture shapes each task needs are written into the task.

## Global Constraints

Every rule in `.claude/rules/dev-workflow.md` and `.claude/rules/providers.md` applies, with the "Providers program" rule in `.claude/skills/upstream-review/SKILL.md`. These are the ones a task here can break, and the ones this plan adds.

- Work in a sibling worktree, `../career-ops-provider-location`, on branch `fix/provider-location-resolution` cut from `main` after plan 2 has merged. Never edit the main checkout.
- One commit per task. One pull request for the branch. All three commits are `fix`, so the branch releases a patch. Never merge without the owner's explicit approval in the session.
- Scans never drop a posting for location (owner decision, 2026-11-17). No task adds a filter. Each task only changes the `location` string a posting carries.
- Remote scoped to another US state is `review`, not `fit` (owner decision). No task writes a bare `Remote` over a place the API names. The place stays in the string.
- No new column in `scan-history.tsv` and no new field on the `Job` type.
- Read `providers/ADDING_A_PROVIDER.md` before editing a provider. Every request stays on the host the provider already pins, behind its existing SSRF guard, with `redirect: 'error'`. No login, no CAPTCHA handling, no bot-check workaround.
- Provider tests use recorded or synthetic fixtures. No test touches the network. New fixtures name `acme` tenants and carry no personal data. The one exception is Task 2, whose cases reuse the `Microsoft` scaffold already in `tests/providers/eightfold.test.mjs` (`TENANT`, `position`, `pcsxPage`, `recording`).
- A new test is its own file under `tests/*.test.mjs`. New cases for an existing provider go in that provider's existing `tests/providers/{name}.test.mjs`.
- Every provider file and root script this branch edits gets a row in the "Deviations decided" section of `.claude/skills/upstream-review/SKILL.md`, under its own sub-heading `### Provider location resolution (2026-11-17)`. Each piece of work there has a dated sub-heading and its own table, and "Providers program (2026-11-08)" belongs to an earlier program. Task 1 adds the sub-heading as the last one in the section, directly above `## Decision log template`, with a line naming this plan and the header rows `| Upstream | Ours | Status | Notes |` and `| --- | --- | --- | --- |`. Tasks 2 and 3 append to that table. The row shape is `| what upstream ships | what the fork does, every changed file in backticks | landed <date> | ADAPT. the hunk rule in a sentence, then the test that pins it |`. Rows are appended and never reordered. Write the landing date as `YYYY-MM-DD` where a task shows `<date>`.
- `tests/fork-deviations-covered.test.mjs` reads `HEAD`. Rerun `node --test tests/fork-deviations-covered.test.mjs` after each commit.
- Before pushing, run `node scripts/check-syntax.mjs`, then `node test-all.mjs --quick`, then `node .githooks/coderabbit-review.mjs` as its own command. The full `node test-all.mjs` is owed before the pull request opens.

## Effect on dedupe

A posting's location string changes for new scans. It cannot add a posting the owner already has. It can add, once, postings a filter used to cut.

- **The first scan after deploy adds more rows than usual.** A title or location cut never pins a URL. `skipped_title` and `skipped_location` are observational statuses (`lib/scan-history-columns.mjs:97-100`), and `shouldDedupScanHistoryRow` returns `false` for them (`scan.mjs:1866`). A posting the pod's `location_filter` cut while it read `…Redmond` is weighed again on every scan. If the filter passes `…Redmond · Remote`, the posting becomes a new `added` row. The ceiling is the 361 Microsoft postings the remote filter returned on 2026-11-17, before the title filter, plus BambooHR rows that gain `Remote` or a place. These are postings the owner has never been shown. None is a second copy of a row he has. The rise happens once, because an `added` row does pin its URL.
- The seen set is keyed by URL (`seenJobKey`, `scan.mjs:2059`) and by listing identity (`listing:<provider>/<board>/<id>`). Neither reads the location. Run on a history row with a blank location and on one with `United States, Washington, Redmond`, `isOfferSeen` returned `true` for the same URLs with `Vancouver, British Columbia, Canada, Remote` and `United States, Washington, Redmond · Remote`.
- The `fingerprint` column hashes the description (`scan.mjs:3500`). It does not read the location.
- `scan-ats-full.mjs` dedupes on `dedupTokenFor` (line 1302), which is the URL key or Workday's requisition key.
- The company and role key includes the location only when `scan_history.dedup_include_location` is true or `location_filter.workplace_policy` is set (`resolveDedupIncludeLocation`, `scan.mjs:1918`). The owner keeps `workplace_policy` off. If the flag is on, a history row with a blank location is a wildcard and still matches a sibling posting whose location is now resolved (run, returned `true`). A history row stored as `…Redmond` does not match a repost of the same role at a new URL that now reads `…Redmond · Remote` (run, returned `false`). That repost would be added once. The same URL is never added twice.
- Rows already in `scan-history.tsv` keep their old strings. The file is append-only and the gate reads the last `added` row, so this plan changes verdicts for postings first seen after it deploys. See "Left out".

## Review Focus

Each line names the task whose tests pin it.

1. A BambooHR row with both `location` and `atsLocation` filled. The office in `location` wins and `atsLocation` is ignored. Task 1.
2. A BambooHR `locationType` that arrives as the number `1`, or as `"2"`. The number reads as remote. Hybrid adds no word. Task 1.
3. An Eightfold PCSX tenant with no `work_site` filter, or one whose options name no remote value. The provider makes no extra request and changes no location. A value that says hybrid or partial is not a remote value, so "hybrid (partially remote)" marks nothing. Task 2.
4. The Eightfold remote pass fails with 429, with a body that is not a PCSX page, or with any other error, on its first page or part-way, or runs out of page budget. The scan returns every posting from the main walk with its listed location, no posting is marked, one line says so, and the board is not tagged partial. Task 2.
5. A `scan-ats-full.mjs` run with `title_filter_overrides` for one company. A title only the override keeps still gets its Workday detail request. Task 3.

---

### Task 1: BambooHR reads `atsLocation` and `locationType`

**Files:**
- Modify: `providers/bamboohr.mjs:221-232` (doc comment) and `:255-258` (the row mapping in `parseBambooHRResponse`)
- Test: `tests/providers/bamboohr.test.mjs` (add cases after the "appends Remote when isRemote is set" assertion)
- Modify: `.claude/skills/upstream-review/SKILL.md` (one deviations row)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `parseBambooHRResponse(json, companyName, origin)` keeps its signature. Only the `location` string of each returned job changes.

The location rule, which the tests below pin:

| Input row | `location` |
|---|---|
| `location.city` or `location.state` is a non-empty string | `city, state` as today |
| both are empty and `atsLocation` has a non-empty string part | `atsLocation.city`, then `atsLocation.state` or else `atsLocation.province`, then `atsLocation.country`, joined with `', '` |
| `isRemote` is truthy, or `String(locationType) === '1'` | the place above with `Remote` appended once, or `Remote` alone when there is no place |
| `locationType` is `0`, `2` or anything else | no word added |

- [ ] **Step 1: Write the failing tests.** Add to `tests/providers/bamboohr.test.mjs`. The fixture is trimmed from live `/careers/list` responses captured 2026-11-17, with the tenant renamed.

```js
  // atsLocation and locationType, as /careers/list returned them on 2026-11-17.
  // BambooHR's own page renders locationType "1" as "(Remote)" and "2" as "(Hybrid)".
  {
    const nulls = { country: null, state: null, province: null, city: null };
    const rows = parseBambooHRResponse({ meta: {}, result: [
      { id: '79', jobOpeningName: 'Remote Role', location: { city: null, state: null }, isRemote: null, locationType: '1', atsLocation: { country: 'Canada', state: 'British Columbia', province: null, city: 'Vancouver' } },
      { id: '30', jobOpeningName: 'Hybrid Role', location: { city: 'Lombard', state: 'Illinois' }, isRemote: null, locationType: '2', atsLocation: nulls },
      { id: '44', jobOpeningName: 'Office Role', location: { city: 'Pocomoke City', state: 'Maryland' }, isRemote: null, locationType: '0', atsLocation: nulls },
      { id: '50', jobOpeningName: 'Both Filled', location: { city: 'Houston', state: 'Texas' }, isRemote: null, locationType: '0', atsLocation: { country: 'Canada', state: null, province: 'Ontario', city: 'Toronto' } },
      { id: '51', jobOpeningName: 'Numeric Type', location: { city: null, state: null }, isRemote: null, locationType: 1, atsLocation: { country: 'United States', state: null, province: null, city: null } },
      { id: '52', jobOpeningName: 'Province Only', location: {}, locationType: '0', atsLocation: { country: 'Canada', state: null, province: 'Ontario', city: null } },
      { id: '53', jobOpeningName: 'Remote Twice', location: { city: 'Austin', state: 'Texas' }, isRemote: 1, locationType: '1', atsLocation: nulls },
      { id: '54', jobOpeningName: 'Junk Parts', location: {}, locationType: '0', atsLocation: { country: {}, state: 7, province: null, city: '' } },
      { id: '55', jobOpeningName: 'No New Fields', location: { city: 'Mayfair', state: 'London, City of' }, isRemote: null },
    ] }, 'Acme', 'https://acme.bamboohr.com');
    const want = [
      'Vancouver, British Columbia, Canada, Remote',
      'Lombard, Illinois',
      'Pocomoke City, Maryland',
      'Houston, Texas',
      'United States, Remote',
      'Ontario, Canada',
      'Austin, Texas, Remote',
      '',
      'Mayfair, London, City of',
    ];
    const got = rows.map((j) => j.location);
    if (JSON.stringify(got) === JSON.stringify(want)) pass('parseBambooHRResponse falls back to atsLocation and reads locationType 1 as Remote');
    else fail(`bamboohr atsLocation/locationType locations were ${JSON.stringify(got)}`);
  }
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `node test-all.mjs --quick --only providers/bamboohr`. Expected: one failure, "bamboohr atsLocation/locationType locations were", with `""` in the first, fifth and sixth positions.

- [ ] **Step 3: Change the row mapping in `parseBambooHRResponse`.** Apply the rule table above in the `.map()` at `providers/bamboohr.mjs:255-258`. Count a part only when it is a non-empty string after trimming. Rewrite the doc comment at lines 223-232 to name `atsLocation{country,state,province,city}` and `locationType` and to say that `locationType` is `"0"` on-site, `"1"` remote, `"2"` hybrid, read from the list API and from BambooHR's own posting pages on 2026-11-17.

- [ ] **Step 4: Run the tests to verify they pass.** Run: `node test-all.mjs --quick --only providers/bamboohr`. Expected: every line passes, including the two location assertions that were there before (`tests/providers/bamboohr.test.mjs:74` and `:77`). The reviewer's build of `c4b20ee5` printed 30 passed.

- [ ] **Step 5: Add the sub-heading and the deviations row.** Add `### Provider location resolution (2026-11-17)` as Global Constraints describes, then this row:

```
| `providers/bamboohr.mjs` builds `location` from `location.city`, `location.state` and `isRemote` | `parseBambooHRResponse` falls back to `atsLocation` (city, state or province, country) when `location` is empty and appends `Remote` when `locationType` is `1`; cases added to `tests/providers/bamboohr.test.mjs` | landed <date> | ADAPT. Keep our location rule in the row mapping and take upstream's other hunks. `tests/providers/bamboohr.test.mjs` pins it |
```

- [ ] **Step 6: Commit.** Run: `git add providers/bamboohr.mjs tests/providers/bamboohr.test.mjs .claude/skills/upstream-review/SKILL.md && git commit -m "fix(bamboohr): read atsLocation and locationType into the location string" && node --test tests/fork-deviations-covered.test.mjs`

---

### Task 2: Eightfold marks postings the tenant's own work-site filter calls remote

**Files:**
- Modify: `providers/eightfold.mjs` (header comment near line 36, constants near line 82, `buildPcsxUrl` at line 207, new helpers after `assembleLocation` at line 265, `fetch` at lines 419-531)
- Test: `tests/providers/eightfold.test.mjs` (add a block after the "zero PCSX requests when the classic endpoint answers" case)
- Modify: `.claude/skills/upstream-review/SKILL.md` (one deviations row)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `export function buildPcsxUrl(tenant, start = 0, workSite = null): string`. With a `workSite` string it also sets the query parameter `filter_work_site` to that value.
  - `export function remoteWorkSiteValues(json: unknown): string[]`. It reads `json.data.filterDef.smartFilters`, finds the entry whose `filterName` is `'work_site'`, and returns each option `value` that is a string matching `/\bremote\b/i` and not matching `/hybrid|partial/i`. Any other shape returns `[]`. Microsoft's remote value, `0 days / week in-office – remote`, contains "in-office" and must be returned, so the exclusion names only those two words.
  - `export function markRemote(jobs: Array<{location: string, externalId?: string}>, remoteIds: Set<string>): number`. For each job whose `externalId` is in the set and whose `location` does not match `/remote/i`, it sets `location` to `` `${location} · Remote` ``, or `'Remote'` when the location is empty. It returns how many it changed.

Why a second search and not a detail request per posting. The fact is in `position_details` only, one request per posting. The filtered search costs one request per ten remote postings whatever the title filter is, which is 37 requests on Microsoft. A detail pass that read `ctx.titleWanted` would cost one request per posting the title filter keeps. That number was not measured on the owner's filter and could be below 37, so neither design is shown to be cheaper. The filtered search was chosen because its cost is known and does not move with the title filter. The search rows carry `locationFlexibility`, but it was `null` on 10 of 10 rows of a live Microsoft page, so it is no shortcut. The filter is the tenant's own, so a tenant that does not define it gets no request and no label. `workLocationOption` and `work_location_option` are not read. They said `onsite` on remote rows at Microsoft and NetApp.

**Extra requests per scan.** `ceil(remote postings / 10)` for each remote value, and none on a tenant without the filter. On Microsoft, measured on 2026-11-17, that is 37 requests (361 remote postings) on top of the 236 the walk already makes (2,355 postings), so 273 in place of 236. At the existing 400 ms spacing the pass adds about 15 seconds of waiting. A request the edge refuses is retried under the existing `PCSX_RETRY_POLICY`, up to five times.

The remote pass, which the tests below pin:

1. It runs only when this fetch switched to PCSX, the main walk was not cut by a 429, and the caller is not probing (`ctx.maxPages` is not a positive number).
2. `remoteWorkSiteValues` reads the first PCSX page, which is `pcsxJson` in the 403 branch at line 457. An empty result ends the pass with no request.
3. For each value it pages `buildPcsxUrl(tenant, start, value)` from `start = 0`, through `assertEightfoldUrl`, `fetchJsonWithRetry` and `PCSX_RETRY_POLICY`, with `sleep(PCSX_INTER_PAGE_DELAY_MS, ctx)` before every request. It collects `coerceId(p.id)` from `normalizePcsxPage`. A value's walk is complete on a short or empty page, or when `start + PAGE_SIZE >= count`. A body for which `normalizePcsxPage` returns `null` is a failure, not an empty page.
4. The pass has no cap of its own. Its budget is the `maxPages` the main walk resolved from the entry's `max_pages` (default 200, ceiling 1,000), counted across all values. The budget is per walk. The main walk and the pass each get `maxPages`, so one fetch can make up to twice `max_pages` requests.
5. The pass is all or nothing. If a request throws, a body is unusable, or the budget runs out before every value's walk is complete, no location changes. It prints one line, `⚠️  eightfold: <name> remote work-site pass stopped after <n> page(s): <message>. No location was changed`, and does not set `eightfoldTruncated`. When the budget ran out, `<message>` is `page budget of <maxPages> reached`.
6. Otherwise `markRemote(all, ids)` runs once. When it changes at least one posting, print `ℹ️  eightfold: <name> marked <n> posting(s) Remote from the tenant's work-site filter`.

- [ ] **Step 1: Write the failing tests.** Add to `tests/providers/eightfold.test.mjs`, inside the PCSX section so that `httpErr`, `pcsxPage`, `position`, `TENANT` and `recording` are in scope. Add `remoteWorkSiteValues`, `markRemote` and `buildPcsxUrl` to the names the file destructures from `mod` (line 41). The `filterDef` shape is trimmed from Microsoft's live `/api/pcsx/search` response of 2026-11-17.

```js
  // ── PCSX work-site filter: the tenant's own "remote" facet ────────────────
  const REMOTE_VALUE = '0 days / week in-office – remote';
  const FILTER_DEF = { facets: {}, smartFilters: [
    { type: 'multi_select', filterName: 'work_site', title: 'Work site', options: [
      { label: '3 DAYS / WEEK IN-OFFICE', value: '3 days / week in-office' },
      { label: '0 DAYS / WEEK IN-OFFICE – REMOTE', value: REMOTE_VALUE },
      { label: 'FULLY ON-SITE', value: 'fully on-site' },
      { label: 'HYBRID (PARTIALLY REMOTE)', value: 'hybrid (partially remote)' },
    ] },
    { type: 'multi_select', filterName: 'seniority', title: 'Experience level', options: [{ label: 'SENIOR', value: 'Senior' }] },
  ] };
  // null stands for a tenant with no filterDef. undefined would take the default.
  const withFilters = (page, filterDef = FILTER_DEF) => (filterDef === null ? page : { data: { ...page.data, filterDef } });
  const filterOf = (c) => new URL(c.url).searchParams.get('filter_work_site');
  // Unfiltered: ids 1 and 2. Filtered by the remote value: id 2 only.
  const remoteTenant = (onFiltered = () => pcsxPage([position('2', 'Remote Role')], 1), filterDef = FILTER_DEF) => recording((c) => {
    if (c.url.includes('/api/apply/v2/jobs')) throw httpErr(403, 'Not authorized for PCSX');
    if (filterOf(c) !== null) return onFiltered(c);
    return withFilters(pcsxPage([position('1', 'Office Role'), position('2', 'Remote Role')], 2), filterDef);
  });

  JSON.stringify(remoteWorkSiteValues({ data: { filterDef: FILTER_DEF } })) === JSON.stringify([REMOTE_VALUE])
    && [null, {}, { data: {} }, { data: { filterDef: { smartFilters: 'x' } } }, { data: { filterDef: { smartFilters: [{ filterName: 'work_site', options: [{ value: 7 }, null] }] } } }]
      .every((body) => remoteWorkSiteValues(body).length === 0)
    ? pass('remoteWorkSiteValues returns the work_site values that say remote and not hybrid, and [] for any other shape')
    : fail(`remoteWorkSiteValues: ${JSON.stringify(remoteWorkSiteValues({ data: { filterDef: FILTER_DEF } }))}`);

  new URL(buildPcsxUrl({ host: 'acme.eightfold.ai', domain: 'acme.com' }, 10, REMOTE_VALUE)).searchParams.get('filter_work_site') === REMOTE_VALUE
    && !buildPcsxUrl({ host: 'acme.eightfold.ai' }, 0).includes('filter_work_site')
    ? pass('buildPcsxUrl adds filter_work_site only when a value is given')
    : fail(`buildPcsxUrl filter: ${buildPcsxUrl({ host: 'acme.eightfold.ai' }, 10, REMOTE_VALUE)}`);

  {
    const jobs = [{ location: 'Redmond, WA', externalId: '1' }, { location: 'Remote, United States', externalId: '2' }, { location: '', externalId: '3' }, { location: 'Austin, TX', externalId: '4' }];
    const changed = markRemote(jobs, new Set(['1', '2', '3']));
    changed === 2 && JSON.stringify(jobs.map((j) => j.location)) === JSON.stringify(['Redmond, WA · Remote', 'Remote, United States', 'Remote', 'Austin, TX'])
      ? pass('markRemote appends " · Remote" once, to listed ids only')
      : fail(`markRemote: ${changed} ${JSON.stringify(jobs)}`);
  }

  {
    const { ctx, calls } = remoteTenant();
    const jobs = await ef.fetch(TENANT, ctx);
    const filtered = calls.filter((c) => filterOf(c) !== null);
    jobs.length === 2 && jobs[0].location === 'Redmond, WA' && jobs[1].location === 'Redmond, WA · Remote'
      ? pass('eightfold marks the postings the remote work-site search returns, and no others')
      : fail(`remote pass locations: ${JSON.stringify(jobs.map((j) => j.location))}`);
    filtered.length === 1 && filterOf(filtered[0]) === REMOTE_VALUE
      && new URL(filtered[0].url).hostname === 'microsoft.eightfold.ai' && new URL(filtered[0].url).pathname === '/api/pcsx/search' && filtered[0].opts?.redirect === 'error'
      ? pass('eightfold remote pass is one filtered /api/pcsx/search request on the pinned host with redirect:"error"')
      : fail(`remote pass requests: ${JSON.stringify(filtered.map((c) => [c.url, c.opts?.redirect]))}`);
  }

  for (const [label, filterDef] of [['no filterDef', null], ['no remote option', { smartFilters: [{ filterName: 'work_site', options: [{ label: 'FULLY ON-SITE', value: 'fully on-site' }] }] }]]) {
    const { ctx, calls } = remoteTenant(undefined, filterDef);
    const jobs = await ef.fetch(TENANT, ctx);
    calls.every((c) => filterOf(c) === null) && jobs.every((j) => j.location === 'Redmond, WA')
      ? pass(`eightfold makes no filtered request and changes no location for a tenant with ${label}`)
      : fail(`${label}: ${calls.length} requests, ${JSON.stringify(jobs.map((j) => j.location))}`);
  }

  {
    const { ctx } = remoteTenant(() => { throw httpErr(429, 'Please try again later'); });
    const { result, errors } = await captureConsoleErrors(() => ef.fetch(TENANT, ctx));
    result.length === 2 && result.every((j) => j.location === 'Redmond, WA') && result.eightfoldTruncated !== true
      && errors.some((line) => /remote work-site pass stopped/.test(String(line)))
      ? pass('eightfold keeps the whole board, untagged, and warns when the remote pass is refused')
      : fail(`remote pass 429: ${JSON.stringify(result.map((j) => j.location))} ${JSON.stringify(errors)}`);
  }

  {
    // A 200 with a body that is not a PCSX page is a failure, not the end of the walk.
    const { ctx } = remoteTenant(() => ({}));
    const { result, errors } = await captureConsoleErrors(() => ef.fetch(TENANT, ctx));
    result.length === 2 && result.every((j) => j.location === 'Redmond, WA') && result.eightfoldTruncated !== true
      && errors.filter((line) => /remote work-site pass stopped/.test(String(line))).length === 1
      ? pass('eightfold changes no location, untagged, and warns once when the remote pass gets an unusable body')
      : fail(`remote pass unusable body: ${JSON.stringify(result.map((j) => j.location))} ${JSON.stringify(errors)}`);
  }

  const tenRemote = (count) => pcsxPage(Array.from({ length: 10 }, (_, i) => position(String(i + 2), `Remote ${i}`)), count);

  {
    // Posting 2 is on the first filtered page, and the second page is refused: nothing is marked.
    const { ctx } = remoteTenant((c) => {
      if (Number(new URL(c.url).searchParams.get('start') || 0) > 0) throw httpErr(429, 'Please try again later');
      return tenRemote(30);
    });
    const { result, errors } = await captureConsoleErrors(() => ef.fetch(TENANT, ctx));
    result.every((j) => j.location === 'Redmond, WA') && result.eightfoldTruncated !== true && errors.filter((line) => /remote work-site pass stopped/.test(String(line))).length === 1
      ? pass('eightfold changes no location, untagged, and warns once, when the remote pass fails part-way')
      : fail(`partial remote pass: ${JSON.stringify(result.map((j) => j.location))} ${JSON.stringify(errors)}`);
  }

  {
    // max_pages: 1 is the pass's budget too, and the filter has three pages.
    const { ctx, calls } = remoteTenant(() => tenRemote(30));
    const { result, errors } = await captureConsoleErrors(() => ef.fetch({ ...TENANT, max_pages: 1 }, ctx));
    const filtered = calls.filter((c) => filterOf(c) !== null).length;
    filtered === 1 && result.every((j) => j.location === 'Redmond, WA') && result.eightfoldTruncated !== true && errors.some((line) => /remote work-site pass stopped.*page budget of 1 reached/.test(String(line)))
      ? pass('eightfold keeps the remote pass inside max_pages and changes no location, untagged, when the budget cuts it')
      : fail(`remote pass budget: ${filtered} filtered requests, ${JSON.stringify(result.map((j) => j.location))} ${JSON.stringify(errors)}`);
  }

  {
    const { ctx, calls } = remoteTenant();
    await ef.fetch(TENANT, { ...ctx, maxPages: 1 });
    calls.every((c) => filterOf(c) === null)
      ? pass('eightfold skips the remote pass for a probe (ctx.maxPages)')
      : fail(`probe made a filtered request: ${calls.map((c) => c.url).join(' ')}`);
  }

  {
    // The main walk is cut by a 429 on its second page: no remote pass after it.
    const { ctx, calls } = recording((c) => {
      if (c.url.includes('/api/apply/v2/jobs')) throw httpErr(403, 'Not authorized for PCSX');
      if (filterOf(c) !== null) return pcsxPage([position('0', 'Role 0')], 1);
      if (Number(new URL(c.url).searchParams.get('start') || 0) > 0) throw httpErr(429, 'Please try again later');
      return withFilters(pcsxPage(Array.from({ length: 10 }, (_, i) => position(String(i), `Role ${i}`)), 30));
    });
    const { result } = await captureConsoleErrors(() => ef.fetch(TENANT, ctx));
    result.eightfoldTruncated === true && calls.every((c) => filterOf(c) === null)
      ? pass('eightfold sends no filtered request after a walk the edge rate-limited')
      : fail(`rate-limited walk: truncated=${result.eightfoldTruncated}, filtered=${calls.filter((c) => filterOf(c) !== null).length}`);
  }
```

Add `captureConsoleErrors` to the file's import from `../helpers.mjs`. It returns `{ result, errors }` and records the first argument of each `console.error` call (`tests/helpers.mjs:1608`). The warning in rule 5 must therefore be one string. The two cases that mark postings also print the `ℹ️` line, which is expected output.

- [ ] **Step 2: Run the tests to verify they fail.** Run: `node test-all.mjs --quick --only providers/eightfold`. Expected, as run against `c4b20ee5`: 43 passed and 1 failed. The failure is `❌ eightfold provider tests crashed: remoteWorkSiteValues is not a function`. The file loads the provider with a dynamic `import()` and destructures `mod`, so a missing export is `undefined` and the first call throws inside the file's `try`. The 13 new assertions and the 18 that follow them in the file do not run.

- [ ] **Step 3: Implement the helpers and the remote pass.** Add the `workSite` parameter of `buildPcsxUrl`, `remoteWorkSiteValues` and `markRemote` with the signatures in the Interfaces block. Keep the first PCSX page's raw JSON in a variable declared beside `api` at line 419. Add the pass between the end of the paging loop (line 515) and the `rateLimited` warning (line 517), following the six numbered rules above. Extend the header comment's PCSX paragraph (line 36) with the `filterDef.smartFilters` shape, the `filter_work_site` parameter, the date it was observed and the sentence that `workLocationOption` is not read because it said `onsite` on remote rows.

- [ ] **Step 4: Run the tests to verify they pass.** Run: `node test-all.mjs --quick --only providers/eightfold`. Expected: every line passes. On `c4b20ee5` that is 74 passed. The earlier case "switches to /api/pcsx/search after one 403 and pages there (1 v2 + 2 pcsx requests, 11 jobs)" still counts two PCSX requests, because its pages carry no `filterDef`.

Run: `node test-all.mjs --quick --only providers/ats-ssrf`
Expected: PASS.

- [ ] **Step 5: Add the deviations row**

```
| `providers/eightfold.mjs` takes `location` and `locations[]` from the search rows and reads no work-site field | on a PCSX tenant whose `filterDef.smartFilters` has a `work_site` option that says remote, `fetch` walks `/api/pcsx/search` once more with `filter_work_site` and `markRemote` appends ` · Remote` to those postings, or changes nothing when that walk fails or is cut short; `remoteWorkSiteValues`, `markRemote` and the third parameter of `buildPcsxUrl` are ours; cases added to `tests/providers/eightfold.test.mjs` | landed <date> | ADAPT. Keep the remote pass and its helpers and take upstream's other hunks. `tests/providers/eightfold.test.mjs` pins it |
```

- [ ] **Step 6: Commit.** Run: `git add providers/eightfold.mjs tests/providers/eightfold.test.mjs .claude/skills/upstream-review/SKILL.md && git commit -m "fix(eightfold): mark postings the tenant's work-site filter calls remote" && node --test tests/fork-deviations-covered.test.mjs`

---

### Task 3: `scan-ats-full.mjs` passes the title decision to providers

**Files:**
- Modify: `scan-ats-full.mjs` (new export after `withIdCache` at line 371, and the three provider `fetch` calls at lines 1600, 2400 and 2494)
- Modify: `providers/_types.js:308` (the `titleWanted` typedef text)
- Create: `tests/scan-ats-full-title-wanted.test.mjs`
- Modify: `.claude/skills/upstream-review/SKILL.md` (one deviations row)

**Interfaces:**
- Consumes: `ctx.titleWanted`, which `providers/workday.mjs:1153` already reads.
- Produces: `export function withTitleWanted(ctx, titleFilter, companySlug)`. It returns `{ ...ctx, titleWanted: (title) => titleFilter(title, companySlug) }`, or `ctx` unchanged when `titleFilter` is not a function.

What changes. `providers/workday.mjs` resolves "N Locations" placeholders with one detail request each, capped at 200 requests per tenant (`MAX_DETAIL_REQUESTS`, line 670). With `ctx.titleWanted` it spends them only on titles the scan keeps. `scan.mjs:5130` passes it. `scan-ats-full.mjs` does not. Scheduled scans run `scan-ats-full.mjs` for every job whose engine is not `portals` (`buildScanCommand`, `web/scripts/scheduled-jobs-runner.mjs:131-136`). Its default ATS list there is `greenhouse,lever,ashby,workday`. Explore runs the same script with `--dry-run` (`web/src/lib/core/scan.ts:22-23`). So this task changes Workday in full scans and in Explore.

It does not carry Tasks 1 and 2 into full scans. Eightfold is not a `scan-ats-full.mjs` source (`SOURCES`, line 569), so Microsoft comes only through `scan.mjs`, which a scheduled job runs when its engine is `portals` (runner line 126). BambooHR is a source (line 634) but is not in the default list, so Task 1 reaches a full scan only when the job's `filters.ats` lists `bamboohr`.

Before, a tenant costs `min(200, placeholders)` detail requests and the cap is spent in board order. On NVIDIA's board (2,000 postings listed, 19 placeholders in a 60-posting sample) that is 200 requests, with about two thirds of the placeholders left as "N Locations". After, a tenant costs `min(200, placeholders whose title the filter keeps)`, which was 0 of the 19 sampled under a stand-in filter. The list requests do not change.

The second argument matters. `titleFilter` in this script takes `(title, companySlug)` so `title_filter_overrides` can keep a title for one company (`buildTitleFilterWithOverrides`, `scan.mjs:382`). Every `processJobs` call passes `entry.name`, and the helper must pass the same value.

Other providers that read `ctx.titleWanted` were checked. `greenhouse.mjs:318` uses it only when the entry sets `fetchDetails`, which the dataset entries this script builds never do. `sitemap.mjs` and `dynamitejobs.mjs` are not sources of this script.

- [ ] **Step 1: Write the failing test.** Create `tests/scan-ats-full-title-wanted.test.mjs`. It drives the real Workday provider with a recording `ctx`, so it fails if either the helper or the provider's use of it breaks.

```js
// tests/scan-ats-full-title-wanted.test.mjs: scan-ats-full.mjs hands each
// provider this scan's title decision, so Workday's 200-request detail budget
// goes to postings the title filter keeps.
// Run: node --test tests/scan-ats-full-title-wanted.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTitleWanted } from '../scan-ats-full.mjs';
import { buildTitleFilterOverrides, buildTitleFilterWithOverrides } from '../scan.mjs';
import workday from '../providers/workday.mjs';

const ENTRY = { name: 'acme', careers_url: 'https://acme.wd5.myworkdayjobs.com/acmecareers' };
const CXS = 'https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/acmecareers';
const PAGE = { total: 3, jobPostings: [
  { title: 'Platform Engineer', externalPath: '/job/USA---Austin-TX/Platform-Engineer_R1', locationsText: '3 Locations', postedOn: 'Posted Today' },
  { title: 'Staff Accountant', externalPath: '/job/USA---Austin-TX/Staff-Accountant_R2', locationsText: '2 Locations', postedOn: 'Posted Today' },
  { title: 'Payroll Specialist', externalPath: '/job/USA---Austin-TX/Payroll-Specialist_R3', locationsText: '4 Locations', postedOn: 'Posted Today' },
] };
const DETAIL = { jobPostingInfo: { location: 'USA - Austin, TX', additionalLocations: ['USA - Atlanta, GA'], startDate: '2026-10-15' } };

function recordingCtx() {
  const details = [];
  return { details, ctx: { transport: 'http', sleep: async () => {}, includeUndated: true, fetchText: async () => '',
    fetchJson: async (url) => { if (url.startsWith(`${CXS}/job/`)) { details.push(url.slice(CXS.length)); return DETAIL; } return PAGE; } } };
}
const filterFor = (overrides) => buildTitleFilterWithOverrides({ positive: ['Engineer'] }, buildTitleFilterOverrides(overrides));

test('withTitleWanted passes the company slug as the second argument', () => {
  const seen = [];
  const ctx = withTitleWanted({ a: 1 }, (title, slug) => { seen.push([title, slug]); return true; }, 'acme');
  assert.equal(ctx.a, 1);
  assert.equal(ctx.titleWanted('X'), true);
  assert.deepEqual(seen, [['X', 'acme']]);
});

test('withTitleWanted returns ctx unchanged when there is no title filter', () => {
  const ctx = { a: 1 };
  assert.equal(withTitleWanted(ctx, undefined, 'acme'), ctx);
});

test('Workday spends detail requests only on titles the sweep keeps', async () => {
  const { ctx, details } = recordingCtx();
  const jobs = await workday.fetch(ENTRY, withTitleWanted(ctx, filterFor(undefined), ENTRY.name));
  assert.deepEqual(details, ['/job/USA---Austin-TX/Platform-Engineer_R1']);
  assert.equal(jobs.find((j) => j.title === 'Platform Engineer').location, 'USA - Austin, TX · USA - Atlanta, GA');
  assert.equal(jobs.find((j) => j.title === 'Staff Accountant').location, '2 Locations');
});

test('a title kept only by this company\'s override still gets its detail request', async () => {
  const { ctx, details } = recordingCtx();
  await workday.fetch(ENTRY, withTitleWanted(ctx, filterFor([{ companies: ['acme'], positive_extra: ['Accountant'] }]), ENTRY.name));
  assert.deepEqual(details.sort(), ['/job/USA---Austin-TX/Platform-Engineer_R1', '/job/USA---Austin-TX/Staff-Accountant_R2']);
});

test('without the helper every placeholder costs a request', async () => {
  const { ctx, details } = recordingCtx();
  await workday.fetch(ENTRY, ctx);
  assert.equal(details.length, 3);
});
```

The three provider cases were run against `c4b20ee5` with the helper written inline and passed. The provider prints one `ℹ️  workday:` line per fetch to stderr, which is expected output.

- [ ] **Step 2: Run the test to verify it fails.** Run: `node --test tests/scan-ats-full-title-wanted.test.mjs`. Expected: FAIL at import with "does not provide an export named 'withTitleWanted'".

- [ ] **Step 3: Add `withTitleWanted` and use it at the three fetch sites.** Add the export after `withIdCache`. Wrap the `ctx` argument at these call sites and nowhere else:

- `source.provider.fetch(entry, sourceCtx)` in the parallel sweep (line 2400) and in the truncated-board retry (line 2494), with `titleFilter` and `entry.name`.
- `provider.fetch(entry, withIdCache(ctx, idCaches, provider))` in `runHistorySeedScan` (line 1600), with `opts.titleFilter` and `entry.name`.

Leave `fetchListing` (line 2392), `enrichDate` and the seed fetch at line 1495 as they are. Change the `titleWanted` text in `providers/_types.js:308` from "Present only in scan.mjs runs whose entry filters on title" to say that `scan.mjs` passes it when the entry filters on title and `scan-ats-full.mjs` passes it for every board.

- [ ] **Step 4: Run the tests to verify they pass.** Run: `node --test tests/scan-ats-full-title-wanted.test.mjs`. Expected: 5 pass.

Run: `node test-all.mjs --quick --only scan-ats-full` and `node test-all.mjs --quick --only providers/workday`
Expected: PASS.

Run: `git add tests/scan-ats-full-title-wanted.test.mjs && node validate-system-paths-coverage.mjs`
Expected: `OK`.

- [ ] **Step 5: Add the deviations row**

```
| `scan-ats-full.mjs` builds one `ctx` with no `titleWanted`, so a provider that pays per posting cannot skip titles the sweep drops | exports `withTitleWanted(ctx, titleFilter, companySlug)` and wraps the `ctx` of the three provider `fetch` calls (parallel sweep, truncated retry, `runHistorySeedScan`) with it; `providers/_types.js` says both scanners pass `titleWanted`; adds `tests/scan-ats-full-title-wanted.test.mjs` | landed <date> | ADAPT. Keep `withTitleWanted` and its three call sites and take upstream's other hunks. `tests/scan-ats-full-title-wanted.test.mjs` pins it |
```

- [ ] **Step 6: Commit.** Run: `git add scan-ats-full.mjs providers/_types.js tests/scan-ats-full-title-wanted.test.mjs .claude/skills/upstream-review/SKILL.md && git commit -m "fix(scan): pass the title decision to providers in scan-ats-full" && node --test tests/fork-deviations-covered.test.mjs`

---

### Task 4: Branch checks and the pull request

- [ ] **Step 1: Run the full checks.** Run: `node scripts/check-syntax.mjs`, then `node test-all.mjs --quick`, then `node test-all.mjs`. Expected: all pass.

- [ ] **Step 2: Run the local review as its own command.** Run: `node .githooks/coderabbit-review.mjs`. Expected: exit 0. On exit 2, check each blocking finding against the code, fix the confirmed ones in a new commit and rerun. Stop after two passes, per `.claude/rules/dev-workflow.md`.

- [ ] **Step 3: Push and open the pull request.** The body opens with `## Why` and the owner's goal from the spec. It states that no personal data was added and that `node test-all.mjs` passed. It lists, from this plan, what was left out and what was not verified. It carries this section as written:

```
## What the owner will see

- The first scan after deploy adds more Microsoft and BambooHR rows than usual, once. They are remote postings a location filter used to cut. None is a second copy of a row already in the Inbox.
- Rows already in the Inbox keep their old location and verdict. Two groups stay under Elsewhere although they are remote: Microsoft remote postings listed under a city outside the home area, and BambooHR postings marked remote that also name a city.
- To find the Microsoft ones, choose Elsewhere under "Location fit" and type Microsoft in the keyword box. The Source chips cover Greenhouse, Lever, Ashby and Workday only, so no filter picks out BambooHR rows. Their links are on `<tenant>.bamboohr.com`.
```

Do not merge. Ask the owner.

- [ ] **Step 4: After deploy, check one scan (owner step).** The first scheduled `portals` scan after deploy should print `ℹ️  eightfold: Microsoft marked <n> posting(s) Remote`. A full scan prints, per Workday tenant, `resolved <a> of <b> multi-location placeholder(s) … <c> skipped by the title filter`. Expect a one-time rise in new Microsoft and BambooHR rows on that first scan, as "Effect on dedupe" describes. A rise that repeats on later scans is a defect. If the Eightfold line is a `remote work-site pass stopped` warning on every scan, the edge refuses the extra pages and the pass needs a wider spacing.

## Left out

- **Greenhouse office merge.** Dropped by a coordinator decision in the spec, on this evidence. The mechanism is real. `providers/greenhouse.mjs:386` appends offices only when the location is a bare work-model word, and on five live boards 14 of 571 postings had an office named "… Remote" beside a location naming a place. The evidence that those postings are remote did not hold. Their descriptions were in the same response. One of the 14 mentions remote work. Two (Abnormal Security, "Hybrid - San Francisco" with office "Remote - USA") say a Bay Area location is required. Most of the rest pair one city with a state-scoped office ("Denver, CO" with "US - Remote - Colorado"), which reads as a remote worker based in that place. Appending the office would move rows like `Chicago, Illinois · US - Remote` from `elsewhere` to `fit` on a label the posting text does not support. Those rows stay `elsewhere` and stay recoverable under design G. Revisit if plan 2's inbox shows the owner restoring Greenhouse rows of this kind.
- **Rewriting rows already in `scan-history.tsv`.** The gate reads each posting's last `added` row, so postings seen before this branch deploys keep their old verdict. Two groups stay hidden as `elsewhere` although they are remote. One is Microsoft remote postings listed under a city outside the home area (`United States, Washington, Redmond`). The other is BambooHR rows with `locationType` `"1"` and a city (`Austin, Texas`). Rows whose stored location is blank or names no place are `review` and are not hidden. The owner finds the Microsoft rows with the Elsewhere filter and the keyword `Microsoft`, which matches the company. No Inbox filter isolates BambooHR rows, because the Source chips cover Greenhouse, Lever, Ashby and Workday only (`sourceFromUrl`, `web/src/lib/inbox.ts:12`). Searching the pod's `pipeline.md` for `bamboohr.com` would list them, and that was not run. A backfill would write to the owner's data on the pod and is a separate decision.
- **BambooHR hybrid.** `locationType: "2"` adds no word. The office city is already in the string and decides the verdict.
- **A detail request per Eightfold posting.** Not built. Its cost under the owner's title filter is unmeasured, so the plan does not claim the filtered search is cheaper. See Task 2.
- **State codes that are also country codes.** `Irvine, CA, Remote` and `Irvine, CA · Remote` return `remote_country_restricted`, because the gate reads `CA` as Canada. `Irvine, CA` alone returns `onsite_outside_allowed_locations`. All three are `elsewhere`, so appending `Remote` to such a string is no regression and no gain. Reading a state code that collides with a country code is the gate's work and belongs to plan 1.
- **Eightfold v2 tenants.** Their rows have no work-site field. Netflix writes "Remote, United States" into `location` itself.
- **Raising Workday's 200-request cap.** Spending it on wanted titles comes first. The scan's own log line reports how many placeholders the cap still leaves.
- **iCIMS and Shopify blanks.** The spec says their pages do not carry the fact.
