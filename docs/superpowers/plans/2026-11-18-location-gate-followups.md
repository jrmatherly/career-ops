# Location gate follow-ups implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close what PR 107 left open in the workplace gate, where measurement shows it matters: three location shapes that hide real rows, the pay-label rule that review kept beating, a description that shuts the home state out, and a country list with home first.

**Architecture:** Every code change is in `providers/_country.mjs`. Three rules are added to `locationVerdict`, which only ever lift `elsewhere` to `review`. The pay-label lookahead is deleted and replaced by one structural test, whether a sibling label names a home country. One regex, built per policy, reads a sentence that shuts a home state out of hiring. `listBeforeNoun` gains an optional noun group. No caller changes.

**Tech Stack:** Node 24 ESM, `node:test`, no new dependency.

**Spec:** [`docs/superpowers/research/2026-11-18-gate-followups/README.md`](../research/2026-11-18-gate-followups/README.md). Read its "Owner decisions" table and "Left as documented limits" before the first task. The earlier spec, [`2026-11-17-location-verdicts`](../research/2026-11-17-location-verdicts/README.md), still binds: read its "Owner decisions" too.

**Order:** One branch, `fix/location-gate-followups`, one PR, landed before plan 2 (`2026-11-17-02-inbox-location-verdicts.md`). Work in a sibling worktree. Review before the first push, stop at the merge bar, and ask the owner before the merge.

## How this plan was checked

The writer sketched all six changes on a copy of `providers/_country.mjs` (`repro/prototype-patch.mjs` in the spec folder writes that copy) and ran, on 2026-11-18 against `main` at `f9627bac`:

- `repro/probe.mjs` on `main` and on the sketch, and `repro/rows.mjs` on the sketch. Every test row in the tasks below is in `rows.mjs` and holds there.
- `repro/delta.mjs` on a fresh corpus (39 boards, 3,346 postings) and the pod's 27,902 scan-history locations. Gate: 0 postings eligible to not, 0 not to eligible, under both policies. Tiers: 10 corpus postings and 37 pod rows move from `elsewhere` to `review`, none moves any other way.
- The sketch in a scratch worktree of `f9627bac`. The 19 root test files that touch the gate: 996 tests, 973 pass, 23 fail. The 23 are the pinned rows the tasks below change on purpose (6 in Task 1, 11 in Task 2, 4 in Task 3, 2 in Task 4). `node test-all.mjs --quick` on the first sketch: 25,308 passed, 5 failed, and the 5 are the five test files those rows live in. A failure outside those files is a defect.
- A first sketch of Task 3 reused `excludedHome` with the state's name. It refused `Our headquarters is not in Georgia.` and `Applicants from Georgia are not eligible for relocation.`, so Task 3 is the stricter rule that replaced it. The corpus and pod figures above are from the revised sketch.

The sketch is a guide to the regexes, not the code to paste. It has no tests and no comments.

## Global Constraints

- The gate returns exactly `{ eligible, reason }`. `locationVerdict` returns exactly `{ tier, reason }`, tier one of `LOCATION_TIERS`.
- A verdict rule in this plan may only turn `elsewhere` into `review`. It never produces `fit` and never changes the gate's answer.
- The bare-code, bare-timezone and remote-beside-office rules run only where the United States is a home country (`usHome`). The placeholder words apply under every policy, as the rest of `NO_PLACE_WORDS` does. A policy for another country keeps every other answer it has on `main`.
- One new reason code, `home_state_excluded`. No other reason is added or renamed.
- No gate answer changes on the corpus. `repro/delta.mjs` must report 0 and 0 (Task 5).
- A new test is its own file under `tests/*.test.mjs`. No `process.exit()`. Tests import from `../providers/_country.mjs`.
- Comments say why, in one line, and carry no history. Update or delete a comment the change makes false.
- Commits are Conventional Commits with the scope `scan`, one per task. Before pushing: `node scripts/check-syntax.mjs`, `node test-all.mjs --quick`, then `node .githooks/coderabbit-review.mjs` as its own command.
- `HOLD` in every test below is `{ onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] }`, `gate` is `buildWorkplacePolicy({ ...HOLD, home_states: ['Georgia'] })`, `bare` is `buildWorkplacePolicy(HOLD)` and `spain` is `buildWorkplacePolicy({ onsite_locations: ['Barcelona'], remote_countries: ['Spain'], remote_regions: ['Europe'] })`.

## Review Focus

Inputs the spec implies and a reviewer should attack, most likely first. Each has its test in the task named.

1. A foreign place written with a state-like code must stay `elsewhere`: `Remote - Toronto, ON, CA`, `Remote - Bogota, DC, CO`, `Remote - Lisbon (PT)`, `Remote - Tallinn, EST`, `Poland - Remote OR Romania - Remote`. Task 1.
2. A placeholder word beside a real place must not lift it: `Manila (Flexible)`, `Flexible - Italy; Remote`, `Berlin (N/A)`. Task 1.
3. A posting with a home label and a real restriction elsewhere must still be rejected: `USA-based roles only: $1. Canada-based roles only: $2. You must be based in Canada.` Task 2.
4. An ordinary sentence that names the home state beside a negation must stay eligible, because a wrong reject hides a home posting: `Our headquarters is not in Georgia.`, `Applicants from Georgia are not eligible for relocation.`, `Benefits vary by state, except Georgia Power retirees.` So must the 16 real postings whose description lists Georgia among the states hired in, and a Georgia that is the country: `Not available in Georgia, Armenia or Azerbaijan.` Task 3.
5. A foreign list must stay a restriction with every noun: `Canada and Mexico residents only.`, `Belarus and Canada candidates only.` Task 4.

---

### Task 1: Three location shapes are `review`

**Files:**
- Modify: `providers/_country.mjs` (`NO_PLACE_WORDS`, and the end of `locationVerdict`)
- Create: `tests/location-verdict-two-way.test.mjs`
- Modify: `tests/location-verdict.test.mjs:63,85,109`, `tests/location-verdict-gate-agreement.test.mjs:25,31-32,70`

**Interfaces:**
- Consumes: `stateParts`, `namesNoOtherPlace`, `HOME_WORKING_WORDS`, `AMBIGUOUS_STATE_CODES`, `REMOTE`, `NOT_REMOTE`, `places`, `has`, all already in the module.
- Produces: no new name. `locationVerdict` gains three `review` answers with existing reasons.

- [ ] **Step 1: Write the failing tests** in `tests/location-verdict-two-way.test.mjs`, one `test` per row, asserting `assert.deepEqual(locationVerdict(gate, location), { tier, reason })`:

| Location | Tier | Reason |
|---|---|---|
| `N/A`, `na`, `n/a`, `Not specified`, `Unspecified`, `Flexible`, `See description`, `See job description`, `To be determined` | `review` | `location_names_no_place` |
| `Remote, CA`, `Remote - CA`, `CA - Remote`, `Remote CA`, `Remote, CO`, `Remote - DE`, `Remote - IL`, `REMOTE - CA` | `review` | `remote_scoped_to_other_state` |
| `Remote - EST`, `Remote - ET`, `Remote (EST)`, `Remote - PT`, `Remote, PT` | `review` | `remote_eligibility_unconfirmed` |
| `United States - Remote; Preferred: Denver, CO - Hybrid, Hybrid`, `Remote or In-Office in San Francisco · San Francisco · United States`, `Canada (Remote), United States (Remote), United Kingdom (Remote), Mexico City, Mexico (Hybrid)` | `review` | `remote_eligibility_unconfirmed` |
| `Remote - Toronto, ON, CA`, `Remote - Bogota, DC, CO`, `Remote - Lisbon (PT)`, `Remote - Tallinn, EST`, `Poland - Remote OR Romania - Remote`, `Remote, Canada`, `Remote - Estonia`, `Remote, BR; Remote PH` | `elsewhere` | `remote_country_restricted` |
| `Manila (Flexible)`, `Berlin (N/A)`, `Hybrid - London, UK`, `Remote or In-Office in London · London · United Kingdom`, `Tallinn, EST`, `East Coast` | `elsewhere` | `onsite_outside_allowed_locations` |
| `Flexible - Italy; Remote` | `elsewhere` | `remote_country_restricted` |

Add one test under `spain`: `Remote, CA` and `Remote - EST` are `elsewhere`, `remote_country_restricted`, and `N/A` is `review`, `location_names_no_place`. Add one test that the gate itself is unchanged: `gate('Remote, CA')` and `gate('Remote - EST')` are `{ eligible: false, reason: 'remote_country_restricted' }`, `gate('N/A')` is `{ eligible: false, reason: 'onsite_outside_allowed_locations' }`.

- [ ] **Step 2: Run it and see it fail.** `node --test tests/location-verdict-two-way.test.mjs`. Expected: the `review` rows fail with `elsewhere`, the `elsewhere` rows pass.

- [ ] **Step 3: Implement.** Three changes.

Placeholders: add `n/a`, `na`, `not specified`, `unspecified`, `flexible`, `see description`, `see job description` and `to be determined` to `NO_PLACE_WORDS`. `n/a` needs its own alternative, because `/` is no word character.

Two rules before the final `return verdict('elsewhere')`, for `reason === 'remote_country_restricted' && usHome`. Take each part of `parts` whose `georgia` is not `'country'`, fold its `place` (the part without timezones), remove `HOME_WORKING_WORDS`, and keep its letters. Call the non-empty results `named`.
- `named` is not empty and every entry is one of `AMBIGUOUS_STATE_CODES`: `verdict('review', 'remote_scoped_to_other_state')`.
- `named` is empty and some part's `place` differs from its `part` (a timezone was stripped): `verdict('review', 'remote_eligibility_unconfirmed')`.

One rule for `reason === 'onsite_outside_allowed_locations' && usHome`: the folded location names the home country (`has(fold(raw), countryNames)`) and one of its `places` matches `REMOTE` and not `NOT_REMOTE`: `verdict('review', 'remote_eligibility_unconfirmed')`.

- [ ] **Step 4: Change the pinned rows that this turns over**, and nothing else in those files:
  - `tests/location-verdict.test.mjs`: `Remote - CA` and `Remote, CA` become `review`, `remote_scoped_to_other_state`. `Flexible` becomes `review`, `location_names_no_place`.
  - `tests/location-verdict-gate-agreement.test.mjs:25`: retitle to "a bare code that is also a country reads two ways" with `OTHER_STATE` and the rows `Remote - CA`, `Remote, CO`, `REMOTE - CA`. Move `Remote, Canada` into the row at line 26.
  - Lines 31-32: keep `Remote - Estonia`, `Remote - Ethiopia`, `Remote (Estonia)`, `Remote - Tallinn, EST`, `Remote - Lisbon (PT)` as `ABROAD`. Add a row "a bare timezone abbreviation in a remote location reads two ways" with `{ tier: 'review', reason: 'remote_eligibility_unconfirmed' }` and `Remote - EST`, `Remote - PT`, `Remote (EST)`.
  - Line 70: `Remote, PT` is that same `review` answer.

- [ ] **Step 5: Run the gate and verdict tests.** `node --test tests/location-verdict*.test.mjs tests/workplace-policy*.test.mjs`. Expected: all pass.

- [ ] **Step 6: Commit.** `fix(scan): send placeholders, bare state-or-country codes and a remote option beside an office word to review`

### Task 2: A scope label is a heading only beside a home label

**Files:**
- Modify: `providers/_country.mjs` (delete `CURRENCY`, `AMOUNT`, `NOTICE`; rewrite `SCOPE_LABEL` and `withoutScopeLabels`; one call in `gate`)
- Modify: `tests/workplace-policy-scope-labels.test.mjs` (the `ALLOWED` and `REJECTED` lists)

**Interfaces:**
- Produces: `withoutScopeLabels(text, isHome)`, where `isHome(place: string) => boolean` takes a folded place name. It returns `text` unchanged when it is not a string. It is module-private.

- [ ] **Step 1: Rewrite the two lists in `tests/workplace-policy-scope-labels.test.mjs`.** The file's two loops and its last test stay.

`ALLOWED`, each `{ eligible: true, reason: 'remote_region_allowed' }`:
```js
'USA-based roles only: The annual base salary for this role is between $133,000 USD and $180,000 USD. Canada-based roles only: The annual base salary for this role is between $125,000 CAD and $169,000 CAD.',
'<p><strong>USA-based roles only:</strong> $133,000 USD</p><p><strong>Canada-based roles only:</strong> $125,000 CAD</p>',
'<strong>Canada-based roles only</strong>: $140,000 CAD\n<strong>US-based roles only</strong>: $150,000 USD',
'Canada-based roles only: $125,000 CAD. UK-based roles only: £87,000 GBP. United States-based roles only: $133,000 USD.',
'Pay ranges for Mexico only: MXN 900,000. Pay ranges for USA only: $120,000.',
'For US based roles only: Pursuant to the San Francisco Fair Chance Ordinance, all qualified applicants will be considered.',
'UK applicants only: please read our privacy notice. US applicants only: please read our CCPA notice.',
'U.S.-based roles only: $133,000 USD. Canada-based roles only: $125,000 CAD.',
'<li>USA-based roles only: $133,000 USD</li><li>Canada-based roles only: $125,000 CAD</li>',
```

One more allowed row gets its own test, because a reviewer will raise it: `USA-based roles only: $1.\n\nCanada-based candidates only: we cannot hire in the US.` is eligible. With the labels read as headings, what is left is `we cannot hire in the US`, and that sentence alone is eligible on `main` too (`excludedHome` does not read `cannot hire in`). Name the test "a home label beside a foreign one leaves the sentence after it to the other checks" and assert both descriptions give the same answer.

`REJECTED`: keep every row the list has now and add these, each `exclusive_foreign_country` unless marked:
```js
['Canada-based roles only: $140,000 CAD', FOREIGN_ONLY],
['Canada-based candidates only: CAD 120,000 to 150,000.', FOREIGN_ONLY],
['Pay ranges for Mexico only: MXN 900,000 - 1,200,000.', FOREIGN_ONLY],
['UK applicants only: please read our privacy notice', FOREIGN_ONLY],
['<p><strong>Canada-based roles only:</strong> The annual base salary for this role is between $125,000 CAD and $169,000 CAD</p>', FOREIGN_ONLY],
['Canada-based candidates only: Apply by Friday; privacy notice below.', FOREIGN_ONLY],
['Canada-based roles only: $125,000 CAD. UK-based roles only: £87,000 GBP.', FOREIGN_ONLY],
['USA-based roles only: $133,000 USD. Canada-based roles only: $125,000 CAD. You must be based in Canada.', COUNTRY_RESTRICTED],
['USA-based roles only: $133,000 USD. This role is UK only.', FOREIGN_ONLY],
```
Two rows already in `REJECTED` change reason to `FOREIGN_ONLY`, because the label is no longer stripped first: `Canada-based candidates only: you must be located in Canada; salary is $140,000 CAD.` and `Canada-based roles only: $140,000 CAD. You must be based in Canada.`

Add one test under a policy with `remote_regions: ['North America']`: `Canada-based candidates only: candidates must be located in North America; salary is $140,000 CAD.` is `{ eligible: false, reason: 'exclusive_foreign_country' }`. Add one under `spain`: `Spain-based roles only: €50,000. UK-based roles only: £60,000.` with location `Remote - Spain` is eligible, and `UK-based roles only: £60,000.` alone is not.

- [ ] **Step 2: Run it and see it fail.** `node --test tests/workplace-policy-scope-labels.test.mjs`. Expected: the new `REJECTED` rows fail as eligible.

- [ ] **Step 3: Implement.**
  - `SCOPE_LABEL` keeps its opening (`(^|[.!?\n])` and the tags after it) and its label, and ends at the colon. Capture the place in each alternative. Allow an optional `for ` before the first alternative, so `For US based roles only:` is a label. Drop the two lookaheads.
  - `withoutScopeLabels(text, isHome)`: replace `BLOCK_TAG` with a newline as now; if any label's captured place satisfies `isHome`, remove every label; otherwise return the text with only the block tags replaced.
  - In `gate`: `withoutScopeLabels(offer.description, place => has(place, homeAliases) || (usHome && place === 'us'))`. `us` is asked for by name because `homeAliases` leaves out a code that is also a word.
  - `LABEL_PLACE` stays: `ANY_COUNTRY_NAME` reads it.
  - Delete `CURRENCY`, `AMOUNT` and `NOTICE`, after checking nothing else reads them (`grep -n "CURRENCY\|AMOUNT\|NOTICE" providers/_country.mjs`).

- [ ] **Step 4: Run the gate and verdict tests.** Same command as Task 1 Step 5. Expected: all pass.

- [ ] **Step 5: Commit.** `fix(scan): read a country label as a heading only beside a home-country label`

### Task 3: A description that shuts a home state out

**Files:**
- Modify: `providers/_country.mjs` (in `buildWorkplacePolicy`, beside `usHome`, and in `gate` after the `candidate_country_excluded` check)
- Create: `tests/workplace-policy-home-state-excluded.test.mjs`
- Modify: `tests/location-verdict-georgia.test.mjs:258,259,262,294`

**Interfaces:**
- Consumes: `georgiaIsHome`, `otherCountry(sentence)`, `GEORGIA_ABROAD`, `STATES_AND_DC`, `USPS_STATES`, `homeStateCodes`, `escape`.
- Produces: the gate reason `home_state_excluded`. `locationVerdict` maps it to `elsewhere` with no change, since it is none of the reasons it lifts.

`excludedHome` is not reused. Given a state's name it also matches `Our headquarters is not in Georgia.`, `Benefits vary by state, except Georgia Power retirees.` and `Applicants from Georgia are not eligible for relocation.` (measured on a first sketch). A wrong reject hides a home posting, which is the costly side, so the state rule reads only a sentence about hiring and misses the rest.

- [ ] **Step 1: Write the failing tests.** `us = (g, d, location = 'Remote - United States') => g(location, 'Platform Engineer', { description: d })`.

Under `gate`, each `{ eligible: false, reason: 'home_state_excluded' }`:
```js
'Georgia residents are not eligible.', 'Georgia residents are not eligible to apply.', 'Georgia-based applicants are not eligible.',
'Not available in Georgia.', 'This role is not open in Georgia.', 'This role is not available to residents of Georgia.',
'We cannot hire in Georgia.', 'We cannot hire in Alabama, Georgia or Hawaii.',
'We are unable to hire in the following states: Georgia, Hawaii, Alaska.',
'Open to all US states except Georgia.', 'Open to candidates in all states excluding Georgia.', 'Excluding Georgia and Texas.',
```

Under `gate`, each `{ eligible: true, reason: 'remote_region_allowed' }`:
```js
'Not available in Texas.', 'Colorado residents are not eligible.', 'We cannot hire in Alabama, Hawaii or Texas.',
'Our headquarters is not in Georgia.', 'Whether or not Georgia is home, you are welcome.', 'We are not Georgia-Pacific.',
'Benefits vary by state, except Georgia Power retirees.', 'Georgia Tech alumni are not rare here.',
'Applicants from Georgia are not eligible for relocation.', 'Atlanta, Georgia residents are not eligible for relocation assistance.',
'Residents of Georgia are not eligible for the commuter benefit.',
'Not available in Georgia, Armenia or Azerbaijan.', 'Not available in Georgia or elsewhere in the Caucasus.',
'Please Note: For US-based roles open to remote work, we are currently able to hire employees in the following states only: Arizona, California, Colorado, Florida, Georgia, Illinois, New York, Texas.',
```

Four more tests:
- Under `bare`, `Georgia residents are not eligible.` is eligible.
- Under `buildWorkplacePolicy({ ...HOLD, home_states: ['Georgia', 'New York'] })`, `Not available in New York.` and `We cannot hire in New York or Georgia.` are `home_state_excluded`, and `Not available in New York City.` is eligible.
- Under `gate` with location `Remote - Tbilisi, Georgia`, `Not available in Georgia.` is `{ eligible: false, reason: 'remote_country_restricted' }`, since that Georgia is the country.
- `locationVerdict(gate, 'Remote - United States', '', { description: 'Not available in Georgia.' })` is `{ tier: 'elsewhere', reason: 'home_state_excluded' }`.

- [ ] **Step 2: Run it and see it fail.** `node --test tests/workplace-policy-home-state-excluded.test.mjs`. Expected: the twelve exclusion rows fail as eligible, or with the reason `main` gives, and the allowed rows pass.

- [ ] **Step 3: Implement.** Beside `usHome`, build one regex, `shutsOutHomeState`, or `null` when the policy has no home state. It matches a folded sentence in either of two shapes, where HOME is any home state's full name from `STATES_AND_DC`:

1. A hiring negation, then up to a list of other states, then HOME, then the end of the phrase.
   - The negation is one of `not available`, `not eligible`, `not open`, `not supported`, `not hiring`, `unable to hire`, `cannot hire`, `can't hire`, `do not hire`, `does not hire`, followed by at most three words and then `in`, `of` or `from`, with an optional `the following states` or `the following us states` after it. Or it is `excluding`, `except` or `except for`.
   - Between the negation and HOME: spaces or a colon, an optional `the state of`, and any number of other state names from `USPS_STATES` joined by commas, `and` or `or`.
   - After HOME: only spaces and then the end of the sentence, one of `, ; : )`, or the word `and` or `or`. This is what keeps `Georgia Power`, `Georgia-Pacific`, `Georgia Tech` and `New York City` out.
2. HOME, an optional `-based` or ` based`, one of `residents`, `applicants`, `candidates`, then `are` or `is`, then `not eligible`, `ineligible` or `excluded`, and after that only the end of the sentence, one of `, ; )`, `to apply`, or `for this` or `for the` before `role`, `position` or `job`. This is what keeps `not eligible for relocation` out.

In `gate`, right after the `candidate_country_excluded` line, fail with `home_state_excluded` when some sentence of `written` (split on `/[.!?\n]+/`) matches `shutsOutHomeState`, unless that sentence names Georgia and its Georgia is not the home state: `!georgiaIsHome || otherCountry(sentence) || GEORGIA_ABROAD.test(sentence)`. `georgiaIsHome` and `otherCountry` are declared above that line already. State codes are not read: in a description `GA` is Gabon. `repro/prototype-patch.mjs`, section B, has a regex that passes every row above.

- [ ] **Step 4: Change the four pinned rows** in `tests/location-verdict-georgia.test.mjs`. In each, the first answer (the Georgia home policy) becomes `['elsewhere', 'home_state_excluded']` and the second (no home state) stays. Lines 258, 259 and 262 were already refused under another reason. Line 294 was `fit`. Line 260 (`… except Georgia only.`) does not change.

- [ ] **Step 5: Run the gate and verdict tests.** Expected: all pass.

- [ ] **Step 6: Commit.** `fix(scan): refuse a posting whose description shuts a home state out`

### Task 4: A country list that names home is home before "only"

**Files:**
- Modify: `providers/_country.mjs` (`listBeforeNoun`)
- Modify: `tests/workplace-policy-capital-us.test.mjs:8-16`

- [ ] **Step 1: Change the tests.** Move `USA, Canada and Mexico candidates only.` and `United States and Canada candidates only.` from the rejected loop to the allowed loop at line 11, and add to it: `United States and Canada residents only.`, `This position is open to candidates in the US and Canada only.`, `US and Canada only.`, `USA, Canada or Mexico applicants only.` Add to the rejected loop: `Canada and Mexico residents only.`, `Belarus and Canada candidates only.`, `Canada and Mexico only.`, `Cyprus or Canada only.` Retitle the rejected loop "a foreign country list stays a restriction". Add one test under `spain` with location `Remote - Spain`: `Spain and Portugal residents only.` is eligible and `Portugal and France residents only.` is not.

- [ ] **Step 2: Run it and see it fail.** `node --test tests/workplace-policy-capital-us.test.mjs`. Expected: the six moved or added allowed rows fail with `exclusive_foreign_country`.

- [ ] **Step 3: Implement.** In `listBeforeNoun`'s lookahead, make the noun optional and add `candidates`, `applicants` and `residents` to it, so the list is followed by an optional `-based`, an optional one of the seven nouns, then `only`. `withHomeList` is unchanged: it already writes the list as the home country only when the list names it.

- [ ] **Step 4: Run the gate and verdict tests.** Expected: all pass.

- [ ] **Step 5: Commit.** `fix(scan): read a country list that names home as home with any noun before "only"`

### Task 5: Documents, and the measurement on the real change

**Files:**
- Modify: `docs/WORKPLACE_GEOGRAPHY.md` (the pay-label section, the restriction sections, the verdict table, "Known limits")
- Modify: `docs/superpowers/research/2026-11-17-location-verdicts/README.md` ("Owner decisions", "Names shared across the plans")
- Modify: `docs/superpowers/plans/2026-11-17-02-inbox-location-verdicts.md` (the reason-to-copy table near line 317)
- Modify: `.claude/skills/upstream-review/SKILL.md` (the deviations row for `providers/_country.mjs`, near line 540)
- Modify: `docs/superpowers/research/2026-11-18-gate-followups/README.md` ("Not checked")

- [ ] **Step 1: `docs/WORKPLACE_GEOGRAPHY.md`.** Run every sentence and location you write against the gate before writing its answer.
  - Replace the description of the pay-label rule with the sibling rule: what a label is, that a home label beside it makes all of them headings, and that a lone foreign label is a restriction.
  - Add `home_state_excluded` where the reasons are listed, with its guard for the country Georgia.
  - In the verdict section add the three `review` shapes with one example each.
  - In "Known limits" delete the lines this plan fixes: the description that shuts Georgia out; `Remote, CA`, `Remote, DE`, `Remote - IL`; `Remote - EST` and `Remote - ET`; the placeholders (`East Coast` stays `elsewhere`, keep that half); the plain `only` list with home first. Add: a lone foreign label before pay is a restriction; a list of states that omits the home state is not read; a shut-out the rule does not know is `fit` (`Georgia is excluded.`, `Residents of Georgia are not eligible.`, `Not eligible in: CA, CO, GA, NY.`); `cannot hire in the US` is not read as shutting the home country out; a remote option beside an office word with no home country named stays `elsewhere` (`Remote/Hybrid - Denver, CO`); `Poland - Remote OR Romania - Remote` and `Remote - Toronto, ON, CA` stay `elsewhere`.

- [ ] **Step 2: The earlier spec.** Add three rows to its "Owner decisions" table, each pointing at the new spec: the sibling label rule (Owner, 2026-11-18), the three two-way shapes are `review` (Coordinator default, 2026-11-18), a shut-out home state is `elsewhere` (Coordinator default, 2026-11-18). Under "Names shared across the plans", plan 1's list: add the gate reason `home_state_excluded`, tier `elsewhere`, and note that `remote_eligibility_unconfirmed` can now come with a gate reason of `remote_country_restricted` or `onsite_outside_allowed_locations` underneath, so plan 2's copy for it must fit a location the gate refused.

- [ ] **Step 3: Plan 2.** In its reason-to-copy table add `home_state_excluded` with the copy "The posting text says it is not open in your home state." Add one line under the table: `remote_scoped_to_other_state` now also covers a bare `CA`, `CO`, `DE`, `IL` or `IN`, which may be a state or a country.

- [ ] **Step 4: The deviations row.** Add one sentence naming the sibling label rule, `home_state_excluded` and the two new test files.

- [ ] **Step 5: Measure the real change.** Fetch a corpus and pull the pod's location column as the spec's "Scripts" section says (the pod read is read-only and needs no ask). Run `node docs/superpowers/research/2026-11-18-gate-followups/repro/delta.mjs <main's _country.mjs> <the branch's> <corpusDir> <pod-loc.tsv>`, taking `main`'s module from `git show main:providers/_country.mjs > <scratch>/main.mjs`.
  Bar: under both policies, corpus gate changes are 0 eligible to not and 0 not to eligible; every tier change on both data sets is `elsewhere->review`; the pod's three groups are the 27 placeholder rows, the 7 remote-beside-office rows and the 3 bare-code rows. A different count is explained row by row or fixed. Write the numbers into the new spec's "Not checked" section in place of the line about the sketch.

- [ ] **Step 6: Whole-suite gates.** `node scripts/check-syntax.mjs`, `node test-all.mjs --quick`, `node validate-system-paths-coverage.mjs`, and after the commit `node --test tests/fork-deviations-covered.test.mjs`. Expected: all clean. The quick suite printed 25,313 passed and 12 warnings on `main`.

- [ ] **Step 7: Commit.** `docs(scan): record the gate follow-ups and what was measured`

## Landing

- [ ] **Worktree.** From the main checkout: `git worktree add ../career-ops-gate-followups -b fix/location-gate-followups main`, then in it `npm install --ignore-scripts` (`npm ci` fails here, the root lockfile is git-ignored).
- [ ] **Review before the first push.** Four reviewers on the unpushed branch (code, tests, silent failures, comments), one fix wave for what they confirm.
- [ ] **Local CodeRabbit.** `node .githooks/coderabbit-review.mjs` as its own command. Fix a confirmed blocking finding for at most two passes, then `--decline "<reason>"`. A finding on a sentence that is in "Left out" or in the spec's limits is declined with that reference, not patched.
- [ ] **Push and open the PR.** The body opens `## Why` with the owner's goal, gives the Task 5 measurement, lists the pinned rows that changed answer and why, and states that no personal data was added and `node test-all.mjs` passed.
- [ ] **Merge only on the owner's yes**, with `gh pr merge <n> --merge --match-head-commit <sha>`.

## Left out

The spec's "Left as documented limits" section is the list, with the reason for each. Two the reviewers will raise:

- **Timezone residency.** Two real postings are wrongly rejected. The owner left it out of this PR. It needs a state-to-timezone table and a rule for states in two zones.
- **The verdict's second-ask devices.** A refactor with no change in any answer. It does not ride with a PR whose point is changed answers.

## What this plan does not change on the pod

Nothing until plan 2 ships: no shipped caller reads `locationVerdict`, and the pod keeps `workplace_policy` off. After plan 2, the 37 rows of Finding 1 show under "Review location" where they would have shown under "Elsewhere".
