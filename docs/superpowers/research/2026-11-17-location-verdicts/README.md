# Location verdicts, gate text fixes and no-text evaluations

Research from 2026-11-17, run against `main` at `c4b20ee5` and the deployed pod (career-ops 2.6.1, web 1.7.1). It is the spec for four plans, numbered in the order they land:

1. [`2026-11-17-01-location-gate-and-verdict.md`](../../plans/2026-11-17-01-location-gate-and-verdict.md)
2. [`2026-11-17-02-inbox-location-verdicts.md`](../../plans/2026-11-17-02-inbox-location-verdicts.md)
3. [`2026-11-17-03-provider-location-resolution.md`](../../plans/2026-11-17-03-provider-location-resolution.md)
4. [`2026-11-17-04-no-text-evaluations.md`](../../plans/2026-11-17-04-no-text-evaluations.md)

The spec was revised the same day, after the four plans were drafted, with what their writers measured.

## Goal

The owner looks for on-site or hybrid roles in the Atlanta metro area and remote roles open to a US resident. In his words: "We want to not miss out on opportunities (job postings) however we also don't want to see a bunch of postings for jobs outside of my local area (Atlanta, GA Metro) or 'Remote'."

## Evidence labels

- **Re-run** means the coordinating session ran the check itself after an investigator reported it.
- **Investigator** means one read-only investigator measured it and nobody re-ran it.
- **Plan writer** means the session that wrote one of the four plans measured it while writing. Nobody re-ran it unless the line says so.
- **Inferred** means it was reasoned from code or data and not observed.

Line numbers are from `c4b20ee5`. A plan that edits a file an earlier plan changed locates the edit by symbol or quoted text.

## Owner decisions

A plan line that contradicts a row here is wrong. Check a question against this table before raising it. A row whose source is "Coordinator default" is a call the coordinating session made and reported. The owner can overrule it.

| Decision | Answer | Source |
|---|---|---|
| Dropping postings outside the home area at scan time | No. Missing them is worse than triaging them | Owner, 2026-11-14 ([findings](../2026-11-14-scheduled-scan-groups-and-location-hold/findings.md)) |
| What happens to a held posting | It is ranked and not evaluated automatically | Owner, 2026-11-14 |
| Where off-target postings are removed | In the inbox, by a verdict on every row. Scans stop dropping for location. `workplace_policy` stays off on the pod | Owner, 2026-11-17, from the replay below |
| Pressing Score on a row that is not `fit` | Never blocked. The confirm dialog says how many selected rows are not `fit` and why | Owner, 2026-11-17 |
| Postings skipped for missing posting text | Google fetcher, automatic re-queue once a fetcher exists, and an inbox badge | Owner, 2026-11-17 |
| One PR or several | Four plans, four branches, four PRs, landed in number order | Owner, 2026-11-17 |
| Remote scoped to another US state ("Remote, TN") | `review`, not `fit` | Default stated to the owner 2026-11-17, not objected to |
| Which hold the inbox reads | The union of every job's hold: a row is `fit` when any job's hold admits it | Same |
| CLI and batch evaluation paths | Outside the hold. One documentation line says so | Same |
| One verdict for the hold and the inbox | The automatic hold (rank pass and drain) evaluates a row only when `locationVerdict(...).tier === 'fit'`. So "Remote, TN" is `review` and is not evaluated automatically. Plan 2 makes the change | Coordinator default, 2026-11-17, reported to the owner |
| Home states | Optional. Plan 1 adds the policy key `home_states`. Plan 2 adds a "Home states" field to the hold, stored as `evaluate.hold.homeStates`. With none set, a state-only location and a state-scoped remote role are `review` | Coordinator default, 2026-11-17, reported to the owner |
| An on-site place in a home state that the home-area list does not name | `review`, reason `onsite_in_home_state`. `Kennesaw, GA` and `Savannah, GA` are both `review` when Georgia is a home state. The metro list will never name every town, and the goal is to hide none of them. With no home state set, such a place stays `elsewhere` | Coordinator default, 2026-11-17, from the plan 1 review, reported to the owner |
| Worldwide remote | `review`. `Remote, Global` and `Home based - Worldwide` stay `remote_eligibility_unconfirmed`. An earlier default passed `remote_regions: ['worldwide', 'global']` from the hold. The plan 2 review ran the gate and found that the word "global" also admits `Remote - Global (APAC)` and `London (Remote - Global)`, which would then be evaluated automatically, so the constant was withdrawn. An exact-match upgrade is recorded in plan 2 as offered and not built | Coordinator default, 2026-11-17, changed after review and reported to the owner |
| The ledger-driven "Held: location" badge | Removed in plan 2. The verdict badge replaces it. Holds on paused and non-automatic jobs count toward the inbox verdict. A hold that cannot be built is left out, the inbox still lists every row, and the page reports the hold | Coordinator default, 2026-11-17, reported to the owner |
| Greenhouse office merge, and the Eightfold remote pass | Greenhouse is dropped from plan 3. The Eightfold pass fails safe. A failed, throttled or partial walk changes no location string and logs once | Coordinator default, 2026-11-17, reported to the owner |
| The state Georgia against the country | The gate must tell them apart. A Georgia the location shows to be the country is `elsewhere`, with or without Georgia as a home state. Plan 1's Task 5b builds it (Finding 7) | Owner, 2026-11-17, on reading that `Remote - Tbilisi, Georgia` would be fit: "this is not acceptable - we need to figure out how to identify United States Georgia vs the Country of Georgia" |
| A Georgia the location does not settle | A bare `Remote, Georgia` with no other place is the state when Georgia is a home state. A location that reads two ways is `review`. A bare code that is both a state and a country (`CA`, `CO`, `DE`, `IL`, `IN`) is unclassified, and beside a city it is a US place | Coordinator default, 2026-11-17, from the Task 5b review, reported to the owner |
| Google reader | Text only, no liveness. Adding `google` to `JD_TEXT_API_ATS` makes a `scan.mjs` run with `experience_filter` on read one detail page for each new Google posting. That is accepted | Coordinator default, 2026-11-17, reported to the owner |

## What was refuted

Two items from the 2026-11-17 handoff are false and get no plan.

- **Stale `running` rows in the evaluate queue.** `data/evaluate-queue.tsv` is an append-only ledger and the latest row per URL is the state (`lib/evaluate-queue.mjs:44-118`). Folded, the pod's ledger held 180 URLs: 162 skipped, 16 evaluated, 2 gated, none running or queued (re-run). The earlier count of 18 counted history rows.
- **Off-target evaluations of tracker #104, #106, #107 and #34.** Joined by URL, scan history records US locations for all four (re-run for three, investigator for #34). The earlier table joined by company and picked up other postings. No automatic evaluation failed the hold after it went live on 2026-11-15 (investigator).

## Finding 1: the gate cannot tell "not stated" from "somewhere else"

`buildWorkplacePolicy` (`providers/_country.mjs:189`) returns one ineligible verdict for both. With the pod's hold (Atlanta, Alpharetta, Marietta, Johns Creek; remote country United States), re-run:

| Location | Reason |
|---|---|
| `United States`, `USA` | `onsite_outside_allowed_locations` |
| `United States, Multiple Locations, Multiple Locations` | `onsite_outside_allowed_locations` |
| `Georgia, USA` | `onsite_outside_allowed_locations` |
| `5 Locations` | `onsite_outside_allowed_locations` |
| `Remote` | `remote_eligibility_unconfirmed` |
| blank | `location_unknown` |
| `Remote - United States` | `remote_region_allowed` |
| `Sunnyvale, CA, USA; Atlanta, GA, USA` | `onsite_location_allowed` |

Two of the owner's four scored applications would be held today: one whose location was `United States` and one in Santa Clara with a stated remote option (investigator).

### The replay

One investigator labelled every unique posting that passed the title filter in the pod's scan history (1,995 postings, 2026-11-03 to 2026-11-17) as fit, off or ambiguous from the location string, then read 206 of the 271 ambiguous ones against the live posting. Known fit 363, known off 1,507, no answer 125. Each design was replayed with the repo's own `buildLocationFilter` and `buildWorkplacePolicy`. The coordinating session re-ran the summary and got the same table.

| Design | Fit shown | Fit one click away | Fit lost | Off shown |
|---|---|---|---|---|
| A. Scan lists before 2026-11-17 | 347 | 0 | 16 | 1,172 |
| B. Scan lists as tightened on 2026-11-17 | 317 | 0 | 46 | 12 |
| D. `workplace_policy` on at scan | 298 | 0 | 65 | 4 |
| E. Three tiers, off dropped at scan | 298 | 60 | 5 | 4 |
| F. E plus provider resolution | 334 | 23 | 6 | 4 |
| **G. F with off kept, hidden** | 334 | 29 | 0 | 4 |

Design G is the decision. Under it the inbox shows 2 to 3 fit rows a day and about 1 review row a day (investigator; 12 days of data).

What limits the numbers:

- 1,504 of the 1,995 rows come from the 2026-11-03 backfill. After that day, B loses 13 of 61 known fits and E, F and G lose none.
- Design A reproduces the recorded scan status on 1,946 of 1,995 rows, which is the check that the replay runs the real gates.
- Of the ambiguous rows that were read, 38% fit (78 of 206). Country-only rows: 9 fit, 0 off. Microsoft "Multiple Locations": 11 fit, 0 off. Workday "N Locations": 21 fit, 55 off.
- 3 of 25 sampled "off" rows had a remote option on the live posting. The sample is small, so read it as a direction. It is why G keeps off rows recoverable.
- D was replayed without descriptions, because scan history stores none.
- F and G were replayed with four provider fixes. Plan 3 builds three of them and builds Eightfold differently (Finding 4), so the F and G rows are an upper bound for what ships.

### The verdict

A pure function, `locationVerdict`, calls the gate once and maps its result to one of three tiers. The prototype is `tier()` in [`repro/policy-replay/replay.mjs`](repro/policy-replay/replay.mjs). It hard-codes Georgia and has no rule for a state-scoped remote role, so plan 1 states the rules in full.

| Tier | When | Inbox label |
|---|---|---|
| `fit` | The gate says eligible, except the state-scoped remote case below | none |
| `review` | `location_unknown`. `remote_eligibility_unconfirmed`. `onsite_outside_allowed_locations` when the location names no specific place: a home country alone, "N Locations", "Multiple Locations", or one home state with no city (reason `location_names_no_place`). `remote_region_allowed` when the location names US states, none of them a home state, and no part of it is country-wide (reason `remote_scoped_to_other_state`) | Review location |
| `elsewhere` | Every other ineligible reason | Elsewhere |

After the plan 1 review the rules widened. Plan 1 states them in full and is the authority. In short: with no home state set, `Remote - Georgia`, `Remote, Georgia` and `Georgia (Remote)` are `review` (`remote_scoped_to_other_state`), and with Georgia set they are `fit`. `Remote, CA, USA`, `Remote - IL, USA` and `Remote, CO, US` are `review`. `Multiple US Locations`, `US - Multiple`, `Various Locations`, `Nationwide` and `Location TBD` are `review` (`location_names_no_place`). An on-site place in a home state outside the home-area list is `review` (`onsite_in_home_state`). In one case `locationVerdict` asks the gate twice.

What the plan 1 writer found in the gate, each run against `c4b20ee5`:

- **The gate has no home state.** A policy holds cities and a country. Plan 1 adds the optional key `home_states`. With no home state set, the verdict cannot tell whether `Georgia, USA` or `Remote, GA` is home, so any single state counts for both rules and both are `review`.
- **`Remote - Georgia` reads Georgia as the country.** The gate answers `remote_country_restricted`, which maps to `elsewhere`. Under a policy whose `home_states` include Georgia, plan 1 reads the word as the state in a remote location.
- **Worldwide is configuration, not a text defect.** The gate admits `Home based - Worldwide` and `Remote, Global` when the policy lists `remote_regions: [worldwide, global]` (plan writer; the reconciling session ran it again). The hold's policy listed no regions. Plan 2 passes them as a constant. With them, a location that also names a foreign country (`Remote, Global - Canada`) still fails, and so does a posting whose metadata or description restricts it, when the caller passes that evidence. The hold and the inbox pass the location and the title only, so there the location string is what decides.
- The gate and the verdict disagree on `Remote, TN` on purpose. The gate says eligible and the verdict says `review`. That is why the hold reads the verdict (owner decisions table).

## Finding 2: pay-range labels read as hiring restrictions

`providers/_country.mjs:274` admits any description clause containing "only", and line 280 fails it when the clause names only a foreign country. `Canada-based roles only: the annual base salary ...` returns `description_country_restricted` on a posting that also gives a US pay band (re-run).

- On the 1Password Ashby board, 48 of 52 remote roles fail on the description (investigator; fetched through `providers/ashby.mjs`).
- The investigator reported 35 boards from `templates/portals.example.yml` (3,352 jobs, 602 US-remote by location), with 64 description rejects of which 47 are false by hand-read. `repro/payrange/fetch.mjs` lists 41 boards. On 2026-11-17 it returned 3,349 jobs from 39 of them, and the unchanged gate again rejected 64 (plan writer).
- The description reaches the gate only at scan time. The hold passes location and title (`web/src/lib/core/evaluate-candidates.mjs:106`), so this affects scans with `workplace_policy` on, which the pod does not use. It is still a defect in shipped code and blocks anyone from turning the key on.

The investigator's fix strips labels of the form `<place>-based (roles|positions|candidates|applicants|employees|hires) only:`. Re-run by the coordinating session, it has a hole:

| Description | Today | With the first fix |
|---|---|---|
| USA and Canada pay bands | rejected | allowed |
| `You must be based in Canada.` | rejected | rejected |
| `This role is UK only.` | rejected | rejected |
| `Canada-based candidates only: we cannot hire in the US.` | rejected | **allowed, wrong** |
| `We are open to candidates in the US and Canada.` | rejected, wrong | rejected, wrong |

The fix must strip a label only when pay text follows it, and both rows in bold must be pinned by tests. A sketch of that narrowed fix took the corpus from 64 description rejects to 21, cleared 43 rows that are all 1Password roles with both pay bands, and made no posting that passed fail (plan writer, on a scratch copy). Nobody hand-read the 21 that remain. Re-running [`repro/payrange/analyze.mjs`](repro/payrange/analyze.mjs) against the real change is a required check in plan 1.

Other false rejects (investigator unless marked):

- A bare "US" in prose is not read as the United States, so `open to candidates in the US and Canada` fails (re-run). Reading a capital "US" everywhere admitted two Semgrep APAC roles on the corpus, so plan 1 reads it where a clause restricts and never where one confirms (plan writer).
- `UK applicants only: please read our privacy notice` and `Pay ranges for Mexico only:` fail as `exclusive_foreign_country` (line 260).
- The gate rejects `US Telecommuter`, `Anywhere in the U.S.` and `GA ATL`. `GA ATL` also needs "ATL" in the hold's home area, which is the owner's setting (plan writer).
- "US national remote" is not read as a remote sentence. No narrow rule separated it from the Semgrep sentence above, so it stays unread and those postings are `review` (plan writer).
- "open to remote work" was reported as a pattern miss and did not reproduce. `remote work` is in the pattern at line 315 and `open to remote work in the US` passes today (plan writer).

## Finding 3: the inbox marks only rows a scheduled job ranked

`markHeld` (`web/src/lib/inbox-pending.mjs:80`) sets `held` from ledger rows with reason `held-location`, and `queueCandidates` (`lib/evaluate-queue.mjs:163-176`) writes that reason only for rows ranked at or above the threshold (re-read). On the pod, 0 of 28 pending rows carried the badge and the gate would hold 6 (investigator).

- Scoring from the inbox always passes through `ConfirmScore` (`web/src/components/inbox/shortlist-tray.tsx:119`), which shows the cost and nothing about location. Explore and paste-a-URL have no confirm.
- Ten hand-started web evaluations are logged. Five fail today's hold; they scored 2.0 to 3.0, took five to six minutes each and led to no application. None could have shown a badge (investigator).
- The inbox already filters by keyword, location text, freshness, source and seniority, and "Select all" and Shift+X act on the visible rows (`inbox-triage.tsx`). A tier filter gets bulk skip for free.
- "Hidden" already means skipped rows in the inbox (`career-ops:hidden`). The new filter must not use that word.
- The hold reads the location and title of a URL's last `added` row in `scan-history.tsv`. The inbox row carries the location `pipeline.md` holds. Both come from `offer.location`, and the pipeline copy has `|` rewritten to `/` and brackets escaped (`sanitizeMarkdownField`, `scan.mjs:3382`). Plan 2 leaves each reader on its own source (plan writer, re-read by the reconciling session).
- `queueCandidates` never weighs a `held-location` row again, so a hold the owner changes later does not queue rows it already held (re-read by the reconciling session).
- The evaluation cost the client sends to `/api/runs/save` is dropped by the route's body type, so no cost is recorded anywhere. Out of scope here; noted for a later change.

## Finding 4: providers drop location facts their APIs return

In the replay, four provider fixes shrank the review tier from 193 rows to 82 (investigator). Plan 3 builds three, and nobody re-measured that figure for them.

| Provider | Gap | Evidence |
|---|---|---|
| BambooHR | `providers/bamboohr.mjs:256-258` reads `location.city`, `location.state` and `isRemote`. The list API also returns `atsLocation{country,state,province,city}` and `locationType` | Code re-read. 9 of 12 live rows carried `atsLocation`; 20 of the 30 blank-location rows are BambooHR (investigator). On 11 rows from 5 tenants, `locationType` is `"0"` on-site, `"1"` remote and `"2"` hybrid, each matched against the tenant's own posting page (plan writer) |
| Eightfold | The search rows carry no work-site field. `efcustomTextWorkSite` is in `/api/pcsx/position_details` only, one request per posting. The PCSX search response defines a `work_site` filter, and a search with `filter_work_site=<the remote value>` returned 361 of Microsoft's 2,355 postings. `workLocationOption` says "onsite" on remote rows at Microsoft and NetApp and must not be used | Investigator for the detail field, on 11 of 11 Microsoft rows. Plan writer for the filter, on Microsoft only. No second PCSX tenant was found |
| Workday | The `ctx` that `scan-ats-full.mjs` builds at line 1944 carries no `titleWanted`, so the 200-request detail cap (`providers/workday.mjs:670`) is spent across all titles and "N Locations" stays unresolved. `scan.mjs:5130` does pass it | Plan writer, by reading the call path. Line 1495, cited earlier, is the Ashby, Greenhouse and Lever seed fetch and never reaches Workday |

Greenhouse was a fourth row. `providers/greenhouse.mjs:380-393` merges offices only when the location is a work-model word, and 14 of 571 postings on five live boards had an office named "… Remote" beside a location naming a place. Their descriptions did not support reading them as remote: one of the 14 mentions remote work and two require a Bay Area location (plan writer). Plan 3 leaves Greenhouse as it is.

iCIMS and Shopify blanks cannot be resolved from their pages and stay in review.

## Finding 5: a top-ranked posting was skipped for missing posting text

The drain writes `skipped no-api-text` when a URL's ATS has no posting-text fetcher (`web/scripts/evaluate-drain.mjs:344-346`; `JD_TEXT_API_ATS` at `liveness-api.mjs:1211`). The pod's ledger shows the owner's top-ranked posting (Google, rank 3.7) queued at 2026-11-17T12:02:08Z and skipped at 12:05:33Z (re-run).

- 85.5% of the 1,662 added URLs resolve to a fetcher. Unsupported by volume: Google 100, non-Atlassian iCIMS 74, BambooHR 28, Paylocity 25, Shopify 8 (investigator).
- Of 40 ledger URLs ranked at or above 3.5, 13 are unsupported and all 13 are Google (investigator).
- The skip is final. `queueCandidates` revisits only orphaned or `unranked` rows. Four earlier skips came back because someone ran `evaluate-queue.mjs add` by hand after their fetchers shipped (inferred from identical timestamps).
- The drain uses API text only on purpose: the unattended `evaluate-text` worker has no network tool (`docs/AUTOMATION.md:262-264`). A browser fallback would gain no ranked posting today, so it is out.
- Google embeds each posting as a 21-field record in an `AF_initDataCallback` block, with responsibilities, qualifications, the about text and structured locations. The fields are positional and unnamed, which is the fragility. On the results page, `ds:1` holds the 20 cards (re-run on one page) and `ds:0` is the list of Alphabet companies (plan writer). On a posting's own page, `ds:0` is an array of that one record and `ds:1` holds 20 full records for unrelated postings. So only `ds:0`, with the id in the URL, is the posting (plan writer, on one live page). A made-up id returns 200 with `ds:0 = []` (investigator and plan writer, one id each). No real closed posting was seen.
- The closest existing fetcher is UltiPro: `fetchUltiproJd` at `browser-extract.mjs:887`, its entry at `liveness-api.mjs:381`, tests `tests/ultipro-jd-api.test.mjs` and `tests/liveness-api-ultipro.test.mjs`. `tests/browser-extract.test.mjs` asserts the `JD_FETCHERS` keys equal `JD_TEXT_API_ATS`.
- An id in `JD_TEXT_API_ATS` is also read by the scan's experience filter (`fetchJdText`, `jd-years.mjs:649`). That filter runs in `scan.mjs` only, on new postings after every other cut, and is off unless `portals.yml` has an `experience_filter` block that is not `enabled: false` (re-read by the reconciling session).

## Finding 6: location chips split on commas

`KeywordField` (`web/src/components/explore/filter-builder.tsx:50`) splits on comma, newline, semicolon and tab, on typing and on paste (re-read). `Remote, US` cannot be entered as one chip in the scheduled-scan location fields. Storage is a JSON array and does not split, so only the input blocks it.

## Finding 7: boards write the state Georgia and the country the same way

Plan 1 first accepted that, with Georgia as a home state, `Remote - Tbilisi, Georgia` reads as US remote. The owner overruled it (owner decisions table). The pod's scan history shows how each one is written.

- The history holds 27,166 rows. 134 distinct location strings name Georgia, on 417 rows (re-run).
- The country Georgia is on 14 rows. Each is `Georgia` or `Remote - Georgia` with nothing else in its place, inside a list of foreign countries (re-run).
- The state Georgia with no `GA` code and no US word is on 3 rows, all from US employers: `Remote, Georgia` twice and `Georgia` once (re-run).
- Every other row carries a US city, the code `GA` or a list of US states (re-run).

Tiers of the 417 rows under the hold of Finding 1 with Georgia added as a home state (re-run at each commit):

| Commit | Fit | Review | Elsewhere | The 14 country rows |
|---|---|---|---|---|
| `fd734bfa`, before Task 5b | 400 | 17 | 0 | Not `elsewhere` |
| `9eb9952b`, Task 5b after its third fix round | 386 | 18 | 13 | 13 `elsewhere`, 1 `review`, none `fit` |

Nobody re-ran the count at `cd1be822`, the last commit of Task 5b.

Task 5b gives each Georgia one of three readings: state, country or unsure. The gate reads the word as the home state only for the state reading. The verdict maps the country reading to `elsewhere` and the unsure reading to `review`. [`docs/WORKPLACE_GEOGRAPHY.md`](../../../WORKPLACE_GEOGRAPHY.md) states the rule and its known limits.

## Names shared across the plans

Plans are implemented by different people. These names are fixed here so they agree. Each is owned by the plan that produces it, and no later plan redefines it.

Plan 1 produces, in `providers/_country.mjs`:

- `locationVerdict(gate, location, title = '', offer = {})`. `gate` is the function `buildWorkplacePolicy` returns. It returns `{ tier: 'fit' | 'review' | 'elsewhere', reason: string }`. `reason` is the gate's own reason, or one of the three reason codes below for the cases the gate does not name. Plan 2 consumes it.
- `LOCATION_TIERS`, exported beside it: `['fit', 'review', 'elsewhere']`.
- The optional policy key `home_states`, a list of US state names or USPS codes. The gate function carries `gate.homeStates` and `gate.homeCountryNames`.
- Two more gate properties, added by Task 5b so that the verdict reads a place as the gate does: `gate.geographyText`, a function that takes one place and returns it without timezone phrases and US timezone abbreviations, and `gate.homePlaces`, the policy's `onsite_locations` folded to lower case. `locationVerdict` reads all four properties. A gate built by hand without them still gets an answer.
- The reason codes `location_names_no_place`, `remote_scoped_to_other_state` and `onsite_in_home_state`, all tier `review`. Plan 2 gives each one badge copy. `remote_scoped_to_other_state` is also the reason an unsure Georgia gets, and the reason for a state code in a place written all in capitals (`REMOTE, TN`). In both cases the gate says not eligible, so the badge copy has to fit a posting the gate refused as well as one it admitted.

Plan 2 produces:

- `holdPolicy(hold)` in `web/src/lib/scheduled-job-input.mjs` returns `{ onsite_locations, remote_countries, home_states }`. `home_states` is `hold.homeStates ?? []`. It passes no `remote_regions`.
- `holdVerdict(core, hold)` beside it. `core` is the `providers/_country.mjs` module. It returns `(location, title) => { tier, reason }`. The inbox, the rank pass and the drain all build their verdict with it.
- `storedHolds(jobs)` returns `{ name, hold }[]`, so a hold that cannot be built is reported with its scan's name.
- `heldForLocation({ rows, scanHistoryRows, added, verdict })` in `web/src/lib/core/evaluate-candidates.mjs` holds a row whose verdict tier is not `fit`.
- The stored hold is `{ onsiteLocations: string[], remoteCountries: string[], homeStates?: string[] }`.
- `InboxJob.verdict?: { tier, reason }` in `web/src/lib/career-ops.ts`, set by `markVerdicts` in `web/src/lib/inbox-pending.mjs`. `InboxJob.held` is removed.
- Inbox labels: "Fit", "Review location", "Elsewhere" and "All", in a group named "Location fit". Never "hidden".
- The browser suite `web/tests/lib/location-hold.browser.test.mjs` and its fixture `web/tests/fixtures/location-hold.mjs`, with four pending rows.

Plan 4 produces:

- `NO_API_TEXT = 'no-api-text'` and `NO_TEXT = 'no-text'` in `lib/evaluate-queue.mjs`, and the ledger reason `fetcher-added`.
- `InboxJob.noText?: boolean` and `InboxJob.noTextReason?: 'no-api-text' | 'no-text'`, set by `markNoText` from a ledger row `skipped` with one of those reasons. It reuses plan 2's badge and filter pattern.
- Inbox label: "Needs manual score".

Plan 3 produces no name another plan reads.

## The four plans

| # | Plan | Branch | Depends on | Why this position |
|---|---|---|---|---|
| 1 | Gate text fixes, `home_states` and `locationVerdict` | `fix/location-gate-and-verdict` | none | Pure library change with the largest test surface. Everything else reads its verdict |
| 2 | Inbox verdict on every row, tier filter, confirm dialog, the hold on the verdict, the Home states field, comma chips | `feat/inbox-location-verdicts` | 1 | Makes it safe to stop dropping at scan. Ends with the pod settings change |
| 3 | Provider location resolution (BambooHR, Eightfold, Workday) | `fix/provider-location-resolution` | none in code; lands after 2 so the review tier it shrinks exists | Three independent provider fixes |
| 4 | Google posting-text fetcher, drain re-queue, no-text badge | `feat/no-text-evaluations` | 1 and 2 | Reuses plan 2's badge and filter |

## After plan 2 is deployed

Each step changes the pod and needs the owner's yes at the time. None is part of a PR.

1. Add Georgia as a home state on both jobs' holds. Do this first, before the next scheduled run. Until it is set, `Remote, GA` reads as `review` and is held, and a held row is never weighed again. Pausing the automatic jobs until it is set is the safe alternative.
2. In Scheduled scans, both jobs: put `United States`, `USA` and `US` back in "City or location" and "Always include", so scans stop dropping country-only listings. Keep the block list.
3. Add the other metro towns the owner wants to the hold's home area (Covington GA was missing from the hold list in the replay). Add `ATL` if `GA ATL` postings should read as Atlanta. Towns left off the list still reach the Review tier through the home state.
4. Leave `location_filter.workplace_policy` out of `/data/portals.yml`.

## Not checked

- The narrowed pay-range fix as implemented. A sketch was measured on 39 boards. The 21 rejects it leaves were not hand-read.
- Token cost per evaluation. Nothing records it.
- The Eightfold `work_site` filter on any tenant but Microsoft, and how Microsoft's edge treats the 37 extra pages.
- BambooHR `locationType` beyond 11 rows on 5 tenants.
- The review-tier size with the three provider fixes that ship.
- 65 ambiguous postings that were gone or unreadable.
- The shape of a closed Google posting beyond two made-up ids, and the Google record outside 41 `en-US` records from one day.
- The off-row error rate outside Workday, Greenhouse, Lever and Ashby.
- Whether the pod's `portals.yml` has `experience_filter` on or sets `scan_history.dedup_include_location`.
- The size of the one-time rise in new rows on the first scan after plan 3. Up to about 361 Microsoft remote postings before the title filter is a ceiling, since the pod's `location_filter` was not read.
- What per-posting Eightfold detail requests would cost under the owner's title filter, against the 37 extra pages of the filtered search.
- No plan has been implemented. Each plan lists what its writer ran. (Written 2026-11-17. Plan 1 has since been implemented on `fix/location-gate-and-verdict`.)
- No browser suite in plans 2 and 4 has run, since those tests need the code the plans describe.

Not checked while plan 1 was implemented, as of `cd1be822`:

- The Georgia tiers on the pod's 417 rows at `cd1be822`. The last count is from `9eb9952b`, one fix round earlier.
- The public-board corpus against the finished gate. Task 5b added country spellings that apply under every policy and in description text. Plan 1's Task 7 runs the corpus and had not run.
- The differentials the Task 5b implementers reported: 126 gate changes from `fd734bfa` to `9eb9952b`, and 35 from `9eb9952b` to `cd1be822`. The reports give counts and tables. No reviewer re-ran the scripts.
- A Georgian city other than Tbilisi, Batumi, Kutaisi and Rustavi. The gate has no list of cities, so `Remote - Georgia · Remote - Warsaw` is `fit`.
- The country Georgia outside a list of foreign countries. All 14 real rows have that shape.
- A scan with `workplace_policy` on and `home_states` set, end to end. No shipped code calls `locationVerdict` yet, and the gate drops an unsure Georgia that the verdict would keep.
- The removed-guard mutants of plan 1's Task 2, which the reviewer did not re-run.

## Scripts

[`repro/`](repro/) holds the investigators' scripts. They read copies of the pod's `scan-history.tsv`, `evaluate-queue.tsv`, `pipeline.md` and `scheduled-jobs.json`, which are the owner's personal data and are not in the repository. Pull fresh copies read-only before running one, and point its input paths at them.

- `repro/payrange/`: `fetch.mjs` downloads the public boards, `analyze.mjs` runs the gate and lists the flips, `probes.mjs` runs synthetic sentences, `mycheck.mjs` prints the seven-row table above when given two module paths (`node mycheck.mjs <current _country.mjs> <patched copy>`).
- `repro/policy-replay/`: `build-set.mjs`, `label.mjs`, `truth.mjs`, `replay.mjs`, `summary.mjs`.
- `repro/no-text/`: `measure.mjs` and `m2.mjs` measure fetcher coverage, `ds.mjs` and `ds2.mjs` read the Google data blocks.
