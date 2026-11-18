# Location gate text fixes and `locationVerdict` implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the workplace gate from rejecting US-remote postings over pay-band labels and four other text patterns, and add `locationVerdict`, which sorts every posting into `fit`, `review` or `elsewhere`.

**Architecture:** Every change but one line is in `providers/_country.mjs`, the module that owns `buildWorkplacePolicy`. Three small fixes change what the gate reads. One optional policy key, `home_states`, tells the gate which US states are home, and the gate function carries that list as a property. `validate-portals.mjs` gains the key in its list check. `locationVerdict` is a pure function that asks the gate and maps its answer to a tier. No caller changes in this plan.

**Tech Stack:** Node 24 ESM, `node:test`, no new dependency.

**Spec:** [`docs/superpowers/research/2026-11-17-location-verdicts/README.md`](../research/2026-11-17-location-verdicts/README.md). Read its "Owner decisions" table and "Names shared across the plans" before the first task. This plan covers Finding 2 and the verdict from Finding 1.

**Order:** Plan 1 of 4. It lands first and needs nothing from another plan. Plan 2 lands after it and reads `locationVerdict`, `LOCATION_TIERS` and the policy key `home_states`, which this plan owns.

## How this plan was checked

Three sessions worked on this plan on 2026-11-17 against `main` at `c4b20ee5`. Line numbers are from that commit. A task that edits a line an earlier task moved locates it by the quoted text. Everything ran in a scratch directory, with the repository untouched.

What the writer ran:

- Every false reject the spec lists, against the current gate under the pod's hold policy. The ones that did not reproduce as a text defect are in "Left out".
- A sketch of every change on a copy of `providers/_country.mjs`, and the corpus check in Task 7 against it. `fetch.mjs` lists 41 boards, where the investigator reported 35. It returned 3,349 jobs from 39 of them (`greenhouse/hightouch` and `lever/wandb` answered 404, and `lever/sophos` returned no jobs). Description rejects of US-remote roles went from 64 to 21. All 43 cleared rows are 1Password roles that carry both a `USA-based roles only:` and a `Canada-based roles only:` pay band.
- A first sketch read a capital "US" everywhere in a description. The corpus run showed it admitting two Semgrep APAC roles located `Remote - International`, through the sentence "For US-based roles open to remote work, we are currently able to hire employees in the following states only". Task 2 is the narrowed design that came out of that, and it pins the sentence.

What the reviewer ran:

- An independent build of the five code tasks from this document on an export of `HEAD`. All 93 tests of the first draft passed, and so did the 466 existing ones.
- Adversarial probes and two mutants against that build. They found ten defects. A label of any shape ending in `only:` was stripped. The wider noun list rejected `USA and Canada roles only.` An inline tag gave an all-capitals sentence its lower-case letter. `Remote - Georgia` was `elsewhere` with no home state. `Remote, CA, USA` was `fit`. `Multiple US Locations` and four like it were `elsewhere`. `Telecommuting not available - Dallas, TX` passed the gate. `home_states: [42, '']` was accepted without a word. The other two were a missing rule and an unclear one.

What the fix session ran:

- Each of the ten findings was reproduced on the reviewer's build before any change. All ten reproduced.
- The reviewer's build was changed to the rules this document now states, and the five test files below were run against it. All 121 tests pass (25, 17, 16, 5 and 58).
- The same files were run against the build as it stands after each task. Before Task 1 the first file has 7 failures of 25. After Task 1 it passes. Before Task 2 the second has 3 of 17. Before Task 3 the third has 6 of 16. Before Task 4 the fourth has 4 of 5. After Task 4 the first four files pass, and the fifth fails to load until Task 5.
- The 466 existing tests pass after every one of the five tasks. They are `tests/workplace-policy*.test.mjs`, `tests/workplace-filter.test.mjs`, `tests/location-filter-*.test.mjs`, `tests/scan-country-eligibility-text.test.mjs`, `tests/linkedin-import.test.mjs`, `tests/providers/jobicy-workplace.test.mjs` and `web/tests/lib/workplace-policy-bridge.test.mjs`. The seven `tests/validate-portals-*.test.mjs` scripts exit 0 with the validator line changed.
- Five mutants of the finished build, each of which the new tests catch. With the capital-letter guard removed, the three `HIRING IN CANADA WITH US` cases fail. With the guard reading tags again, two of them fail. With the confirming checks reading `description`, two "does not confirm" cases fail. With the label's negation check removed, the privacy-policy case fails. With the home-country exemption removed, the two `and Canada` cases fail.
- The corpus check, on the writer's saved copy of the 39 boards. It gives the same numbers as the first sketch: 64 before, 21 after, the same 21 rows, no new reject, all 21 `description_location_restricted`. `probes.mjs` misses 5 of 18, down from 10.
- The reviewer's suggested fix for the noun list, which was to exempt every exclusive-foreign match that follows a home-country name. It broke the existing assertion that `Remote Spain / UK only` is not eligible (`tests/workplace-policy.test.mjs:38`). Task 2 applies the exemption to the four new nouns only.

What did not run:

- `node test-all.mjs --quick`. Task 7 runs it.
- A fresh fetch of the boards. The fix session used the copy the writer fetched the same day.
- Nobody hand-read the 21 remaining corpus rows. The count equals the investigator's 17 true rejects plus 4 false ones, which is consistent and is not proof.
- CodeRabbit did not review anything.
- `scan.mjs` was not run end to end with the changed gate.
- Only the label strip changed a description verdict on the corpus. The capital "US" rule, the wider noun list and every verdict rule changed no corpus row, so their evidence is the tests.

## Global Constraints

Every rule in `.claude/rules/dev-workflow.md` applies. These are the ones a task here can break, and the ones this plan adds.

- Work in a sibling worktree, never in the main checkout. Create it once with `git worktree add ../career-ops-location-gate -b fix/location-gate-and-verdict main`, then run `npm install --ignore-scripts` there, the command CI uses (`.github/workflows/test.yml`). `npm ci` fails, because the root lockfile is gitignored. Commands run from the worktree root.
- One branch, one commit per task, one PR. Tasks 1 to 3 are `fix(scan)`. Tasks 4 and 5 are `feat(scan)`, so the merge releases a career-ops minor version.
- A new test is its own file under `tests/*.test.mjs` and uses `node:test`.
- The gate returns exactly `{ eligible, reason }`. Existing tests compare it with `assert.deepEqual`, so no task adds a key to that object.
- Without `home_states` in a policy, every existing gate verdict stays as it is today, apart from the fixes in Tasks 1 to 3.
- Names from the spec are fixed: `locationVerdict(gate, location, title = '', offer = {})`, `LOCATION_TIERS`, the tiers `fit`, `review`, `elsewhere`, the reasons `location_names_no_place` and `remote_scoped_to_other_state`, and the policy key `home_states`. This plan adds a third reason, `onsite_in_home_state`, as a coordinator default after review. The spec does not list it yet.
- No personal data in code, tests or docs. Test policies use the city names the fork's tests already use (`Atlanta`, `Alpharetta`, `Marietta`, `Johns Creek`).
- Lint is `node scripts/check-syntax.mjs`. `npm run lint` can exit 2 from a wrapper in this environment while that command passes.
- `tests/fork-deviations-covered.test.mjs` reads `HEAD`. Rerun it after each commit.
- Never push with `--no-verify`. Never force-push. Never merge without the owner's approval in the session.

## Review Focus

Inputs the spec does not name that are most likely to hurt a person using this. Each has a test in the task that owns the code.

1. A restriction and a pay amount sit in different HTML paragraphs, or on different lines of a plain-text description, with no full stop between them. The label strip must not reach across the paragraph. Task 1 pins both forms.
2. A description written in capitals says "HIRING IN CANADA WITH US". That "US" is the pronoun and must not cancel the restriction, whether the sentence is plain, sits inside `<strong>` or ends in `&nbsp;`. Task 2 pins the three forms, and a build without the guard fails all three.
3. A capital "US" in a sentence about something else ("For US-based roles open to remote work, ...") must not confirm a posting whose location is a bare `Remote`. Task 2 pins it.
4. A remote location names the country and a timezone code that is also a state code (`Remote - United States (CT)`). The verdict reads `CT` as Connecticut and answers `review`. A person would expect `fit`. Nothing is lost, because `review` is one click away. Task 5 pins the behaviour so a later change is deliberate.
5. A caller passes a gate with no properties, a `null` location, or a description that is not a string. Nothing may throw. Tasks 1 and 5 pin these.

---

### Task 1: Strip a scope label that pay or a privacy notice follows

Finding 2. The checks that misread a label are at `providers/_country.mjs:260`, `:274` and `:280`.

**Files:**
- Modify: `providers/_country.mjs:146` (new constants after `brackets`), `:252` (where `description` is built)
- Test: `tests/workplace-policy-scope-labels.test.mjs`

**Interfaces:**
- Produces: `withoutScopeLabels(text)`, module-private. Task 2 wraps the same expression at line 252.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkplacePolicy } from '../providers/_country.mjs';

const gate = buildWorkplacePolicy({ onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] });
const us = (description) => gate('Remote - United States', 'Platform Engineer', { description, workplaceType: 'Remote' });

const ALLOWED = [
  'USA-based roles only: The annual base salary for this role is between $133,000 USD and $180,000 USD. Canada-based roles only: The annual base salary for this role is between $125,000 CAD and $169,000 CAD.',
  'Canada-based roles only: $140,000 CAD',
  'Canada-based candidates only: CAD 120,000 to 150,000.',
  'Pay ranges for Mexico only: MXN 900,000 - 1,200,000.',
  'UK applicants only: please read our privacy notice',
  '<p><strong>Canada-based roles only:</strong> The annual base salary for this role is between $125,000 CAD and $169,000 CAD</p>',
  'About the team\n\nCanada-based roles only: The annual base salary for this role is between $125,000 CAD and $175,000 CAD, plus benefits.',
];
const REJECTED = [
  'Canada-based candidates only: we cannot hire in the US.',
  'Canada-based candidates only: we cannot hire in the US. The salary is $140,000 CAD.',
  '<p>Canada-based candidates only: we cannot hire in the US</p><p>Salary: $140,000 CAD</p>',
  'Canada-based candidates only: we cannot hire in the US\n$140,000 CAD',
  'Canada-based roles only: $140,000 CAD. You must be based in Canada.',
  'UK applicants only: you must hold a UK passport.',
  'Pay ranges for Mexico only:',
  'You must be based in Canada.',
  'This role is UK only.',
  'Candidates must be located in the United Kingdom.',
  'Canada only.',
  'Hiring in Canada only.',
  'Remote (Canada only): you must live in Canada.',
  'This position is open to residents of Canada only: compensation is $140,000 CAD.',
  'Open to candidates based in Mexico only: MXN 900,000 - 1,200,000.',
  'Canada only: relocation assistance of $10,000 provided.',
  'Canada-based candidates only: please review our privacy policy, we cannot hire in the US',
];
for (const d of ALLOWED) test(`a label before pay or a notice is not a restriction: ${d.slice(0, 60)}`, () => assert.deepEqual(us(d), { eligible: true, reason: 'remote_region_allowed' }));
for (const d of REJECTED) test(`a restriction stays: ${d.slice(0, 60)}`, () => assert.equal(us(d).eligible, false));
test('a description that is not a string does not throw', () => {
  assert.equal(us(12).eligible, true);
  assert.equal(us(['x']).eligible, true);
});
```

- [ ] **Step 2: Run it and confirm the failures.** Run: `node --test tests/workplace-policy-scope-labels.test.mjs`. Expected: the 7 ALLOWED cases fail with reason `description_country_restricted` or `exclusive_foreign_country`. The REJECTED cases and the last test pass.

- [ ] **Step 3: Add `withoutScopeLabels` and apply it to the raw description.** The regexes are the decision, so they are given in full. Add after `brackets` (line 146):

```js
const CURRENCY = 'usd|cad|gbp|eur|aud|mxn';
const AMOUNT = `(?:[$£€]\\s?\\d|\\d[\\d,.]*k?\\s?(?:${CURRENCY})\\b|\\b(?:${CURRENCY})\\s?\\d)`;
const NOTICE = 'privacy\\s+(?:notice|policy|statement)';
const BLOCK_TAG = /<\/?(?:p|div|li|ul|ol|br|h[1-6]|tr|td|th|table|section)\b[^>]*>/gi;
const LABEL_PLACE = `(?:${[...COUNTRY_NAMES, ...COUNTRY_ALIASES].map(c => c.name).concat('us').sort((a, b) => b.length - a.length).map(escape).join('|')})`;
const SCOPE_LABEL = new RegExp(`(^|[.!?\\n])(\\s*(?:<[^>]*>\\s*)*)(?:${LABEL_PLACE}(?:[ -]based)? (?:roles|positions|candidates|applicants|employees|hires)|pay ranges? for ${LABEL_PLACE}) only:(?![^.!?\\n]*\\b(?:not|cannot|can['’]t|unable)\\b)(?=[^.!?\\n]{0,80}?(?:${AMOUNT}|${NOTICE}))`, 'gi');
const withoutScopeLabels = (text) => typeof text === 'string' ? text.replace(BLOCK_TAG, '\n').replace(SCOPE_LABEL, '$1$2') : text;
```

The rule in words. A label starts a sentence, after inline tags at most. It has one of two forms: a country name, an optional `-based`, one of six nouns and `only:`, or `pay range(s) for`, a country name and `only:`. A country name is any name or alias the gate knows, or `us`. The label is removed when an amount of pay or a privacy notice starts within 80 characters after the colon, in the same sentence and the same paragraph, and the rest of that sentence has none of `not`, `cannot`, `can't` and `unable`. A block tag or a newline ends a paragraph. An amount is a currency sign before a digit, or a digit beside one of six currency codes. The word "salary" alone is not an amount.

The longest pinned gap is 59 characters (`</strong> The annual base salary for this role is between `), so the bound is 80. The reviewer suggested about 40. With 40, three ALLOWED cases fail and the corpus stays at 64 rejects (run).

At line 252 change `plain(offer.description)` to `plain(withoutScopeLabels(offer.description))`. The label is removed before `plain` runs, because `plain` turns every tag and newline into a space and the paragraph boundary would be gone.

- [ ] **Step 4: Run the tests.** Run: `node --test tests/workplace-policy-scope-labels.test.mjs tests/workplace-policy*.test.mjs`. Expected: all pass.

- [ ] **Step 5: Commit.** Run: `git add providers/_country.mjs tests/workplace-policy-scope-labels.test.mjs && git commit -m "fix(scan): do not read a pay-band or privacy-notice label as a hiring restriction"`

**Regression risk.** `Canada-based roles only: $120k` with nothing else is now allowed. A posting that restricts hiring says so in a second sentence, and that sentence still rejects (pinned). Every other shape stays rejected as today: a label with words before the country (`Open to candidates based in Mexico only:`), a label with no noun (`Canada only:`), and pay more than 80 characters after the colon.

### Task 2: Read a capital "US" where a clause restricts, never where one confirms

Finding 2, "a bare US in prose". `countries(text)` reads names and aliases only, and after folding "US" is the pronoun "us". So `open to candidates in the US and Canada` names only Canada and fails at line 280.

**Files:**
- Modify: `providers/_country.mjs:146` (new constants), `:248` (`foreignOnly`), `:252`, `:315-318`
- Test: `tests/workplace-policy-capital-us.test.mjs`

**Interfaces:**
- Consumes: `withoutScopeLabels` from Task 1.
- Produces: inside the gate, `description` (labels stripped, capital US read) for every restriction check, and `prose` (labels stripped only) for the three confirming checks.

- [ ] **Step 1: Write the failing test.** Same imports, `gate` and policy as Task 1, plus:

```js
const es = buildWorkplacePolicy({ onsite_locations: ['Barcelona'], remote_countries: ['Spain'], remote_regions: ['Europe'] });
const us = (description, location = 'Remote - United States') => gate(location, 'Platform Engineer', { description, workplaceType: 'Remote' });

for (const d of ['We are open to candidates in the US and Canada.', 'This role is open to candidates in the US and Canada.', 'Open to United States and Canada employees only.', 'USA and Canada roles only.'])
  test(`a capital US beside another country is not a foreign restriction: ${d}`, () => assert.deepEqual(us(d), { eligible: true, reason: 'remote_region_allowed' }));
for (const d of [
  'Canada-based candidates only: we cannot hire in the US.',
  'Canada-based roles only: we cannot hire in the US.',
  'HIRING IN CANADA WITH US',
  '<strong>HIRING IN CANADA WITH US</strong>',
  'HIRING IN CANADA WITH US&nbsp;',
  'Open to candidates in Canada only, join us today.',
]) test(`a restriction stays: ${d}`, () => assert.equal(us(d).eligible, false));
test('under another home country a capital US is a foreign country', () =>
  assert.equal(es('Remote Europe', '', { description: 'This role is open to candidates in the US only.' }).eligible, false));
for (const d of [
  'This is a US national remote role.',
  'US national remote',
  'Open to remote work.',
  'Join us and work remotely.',
  'For US-based roles open to remote work, we are currently able to hire employees in the following states only: Arizona, California.',
]) test(`a capital US does not confirm a bare remote location: ${d.slice(0, 60)}`, () =>
  assert.deepEqual(us(d, 'Remote - International'), { eligible: false, reason: 'remote_eligibility_unconfirmed' }));
test('a spelled-out country still confirms a bare Remote', () => assert.equal(us('You can work remotely from the United States.', 'Remote').eligible, true));
```

- [ ] **Step 2: Run it and confirm the failures.** Run: `node --test tests/workplace-policy-capital-us.test.mjs`. Expected: three failures of 17. The two "in the US and Canada" cases fail with `description_country_restricted`. The Spain case fails because the gate answers eligible. Every other case passes today and must keep passing. The two `and Canada ... only` cases and the three `HIRING IN CANADA WITH US` cases are the ones a careless Step 3 breaks.

- [ ] **Step 3: Add the capital-US reading and split the two uses of the description.** Add beside the Task 1 constants:

```js
// "US" in capitals is the country in a sentence whose own text has a lower-case letter. Tags and entities
// are not its text. Folded, "US" would be the pronoun.
const US_CAPITAL = /(?<![\p{L}\p{N}.])US(?![\p{L}\p{N}])/gu;
const withCapitalUs = (text) => typeof text === 'string' ? text.replace(/[^.!?\n]+/g, s => /\p{Ll}/u.test(s.replace(/<[^>]*>|&#?\w+;/g, '')) ? s.replace(US_CAPITAL, 'USA') : s) : text;
```

At line 252 build two strings where there is one today:

```js
prose = plain(withoutScopeLabels(offer.description)),
description = plain(withCapitalUs(withoutScopeLabels(offer.description)));
```

`description` keeps every use it has today except three. Change these to read `prose`: `remoteDescription` (line 315), `conditionalRegion` (line 316) and the `explicitHomeGeography(description)` call on line 318. Those three grant eligibility, and a capital "US" must not grant it.

In `foreignOnly` (line 248) keep the pattern for `candidates|applicants|residents` exactly as it is, and add a second alternative for four new nouns. Without it, `Canada-based roles only: we cannot hire in the US.` would pass once "US" is read, because the clause would then name the home country. The new alternative needs its noun, and it does not match a foreign country that directly follows a home-country name and a joining word, so `USA and Canada roles only.` stays allowed:

```js
const afterHome = `(?<!(?:${homeAliases.map(escape).join('|')})\\s*(?:and|or|[&/,])\\s*)`;
// per foreign country, inside the existing leading boundary and before the existing `\\s*[- ]?only\\b`:
`(?:${name}(?:[ -]based)?(?:\\s+(?:candidates|applicants|residents))?|${afterHome}${name}(?:[ -]based)?\\s+(?:roles|positions|employees|hires))`
```

`name` is `escape(country.name)`.

- [ ] **Step 4: Run the tests.** Run: `node --test tests/workplace-policy-capital-us.test.mjs tests/workplace-policy*.test.mjs tests/scan-country-eligibility-text.test.mjs`. Expected: all pass.

- [ ] **Step 5: Commit.** Run: `git add providers/_country.mjs tests/workplace-policy-capital-us.test.mjs && git commit -m "fix(scan): read a capital US as the country when a description clause restricts"`

**Regression risk.** A clause that restricts to a foreign country and also mentions "the US" now passes, as it already does when the posting writes "United States" or "USA". `Open to candidates in Canada who can travel to the US` is the example. The change brings "US" level with the other spellings and opens no new kind of hole. Under a non-US policy the same reading adds true rejects (pinned for Spain). The three old nouns keep today's behaviour in full, so `United States and Canada candidates only.` is rejected before and after.

### Task 3: Read "telecommute", "anywhere" and a state code before a home place

Finding 2, the location strings `US Telecommuter`, `Anywhere in the U.S.` and `GA ATL`. The first two are not seen as remote, so they fall to `onsite_outside_allowed_locations`. The third needs two things: "ATL" in the policy's `onsite_locations`, which is the owner's setting, and a gate that does not read its "GA" as Gabon. Today `compileHomeState` accepts a state code before a home place only with a hyphen (`GA-ATLANTA`).

**Files:**
- Modify: `providers/_country.mjs:137` (`HOME_WORDS`), `:140` (`NOT_REMOTE`), `:398` (`before` in `compileHomeState`)
- Test: `tests/workplace-policy-us-location-words.test.mjs`

- [ ] **Step 1: Write the failing test.** Same imports and `gate` as Task 1, plus:

```js
const es = buildWorkplacePolicy({ onsite_locations: ['Barcelona'], remote_countries: ['Spain'], remote_regions: ['Europe'] });
const HOLD = { onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] };
const atl = buildWorkplacePolicy({ ...HOLD, onsite_locations: [...HOLD.onsite_locations, 'ATL', 'Richmond'] });

for (const l of ['US Telecommuter', 'Anywhere in the U.S.', 'Anywhere, US', 'Telecommute - United States'])
  test(`${l} is remote in the United States`, () => assert.deepEqual(gate(l, 'Platform Engineer'), { eligible: true, reason: 'remote_region_allowed' }));
for (const l of ['Anywhere in Canada', 'Canada Telecommuter', 'Not Telecommute - United States', 'Telecommuting not available - Dallas, TX', 'Anywhere'])
  test(`${l} stays out`, () => assert.equal(gate(l, 'Platform Engineer').eligible, false));
test('the new words are read only under a United States policy', () =>
  assert.deepEqual(es('Spain Telecommuter'), { eligible: false, reason: 'onsite_outside_allowed_locations' }));
for (const l of ['GA ATL', 'GA ATLANTA'])
  test(`a state code and a space before a home place: ${l}`, () => assert.deepEqual(atl(l), { eligible: true, reason: 'onsite_location_allowed' }));
for (const l of ['CA Richmond', 'DE Atlanta', 'CA Richmond, BC'])
  test(`a code that is also a country keeps its country: ${l}`, () => assert.deepEqual(atl(l), { eligible: false, reason: 'onsite_country_restricted' }));
test('GA ATL needs ATL in onsite_locations', () => assert.equal(gate('GA ATL').eligible, false));
```

- [ ] **Step 2: Run it and confirm the failures.** Run: `node --test tests/workplace-policy-us-location-words.test.mjs`. Expected: the four "is remote" cases fail with `onsite_outside_allowed_locations`. `GA ATL` and `GA ATLANTA` fail with `onsite_country_restricted`. The rest pass.

- [ ] **Step 3: Make the three edits.** In `HOME_WORDS` (line 137) add `telecommut\\w*` and `anywhere` to the alternation. `NOT_REMOTE` is built from the same string, so "Not Telecommute" is negated with no further change.

`NOT_REMOTE` (line 140) reads a negation before the word only. Add a second alternative for the one after it, `\\b(?:remote|${HOME_WORDS})\\b[^a-z]*not available\\b`. Without it `Telecommuting not available - Dallas, TX` becomes a remote role in Texas once "telecommuting" is a home-working word.

In `compileHomeState` (line 398) the `before` pattern accepts `<code>-` today. Make it accept `<code>-` for every state code, as now, or `<code><space>` for every code except `ca`, `co`, `de`, `il` and `in`, which are the codes `AMBIGUOUS_STATE_CODES` (line 408) already names. The rest of the pattern does not change.

- [ ] **Step 4: Run the tests.** Run: `node --test tests/workplace-policy-us-location-words.test.mjs tests/workplace-policy*.test.mjs`. Expected: all pass.

- [ ] **Step 5: Commit.** Run: `git add providers/_country.mjs tests/workplace-policy-us-location-words.test.mjs && git commit -m "fix(scan): read telecommute, anywhere and a spaced state code in a US location"`

**Regression risk.** `Anywhere` alone moves from `onsite_outside_allowed_locations` to `remote_eligibility_unconfirmed`, which Task 5 maps to `review`. That is the right tier for it. `Remote not available - Dallas, TX` is eligible today and stops being eligible, which is the correct reading. On the corpus the only location verdict that changed was Dialpad's `Anywhere, US`, which became eligible.

### Task 4: `home_states` and the gate's two properties

> Superseded in part by Task 5b. This task reads every `Georgia` as the state when Georgia is a home state. Task 5b replaced that with the state, country and unsure readings. The text below is kept as written.

The verdict's tiers turn on "a home state" twice, and the policy has cities and a country only. This task adds the fact as an optional key and makes the gate carry what `locationVerdict` needs, because `locationVerdict` takes the gate function and nothing else.

Georgia is the one state whose full name the gate reads as a country (line 412). `Remote - Georgia` is `remote_country_restricted` today. So this task reads "Georgia" as a state name, in any letter case, when the policy says Georgia is home. With no home state the gate keeps today's answer and Task 5 turns it into `review`.

**Files:**
- Modify: `providers/_country.mjs:192` (list validation), `:249` and `:321` (the returned function), `:304` (`geoLoc`), `:443` (`withoutUsStates`), plus one module-level table
- Modify: `validate-portals.mjs:422` (the key list)
- Test: `tests/workplace-policy-home-states.test.mjs`

**Interfaces:**
- Produces: policy key `home_states`, an optional list of US state names or USPS codes, read without regard to case. `DC` and `District of Columbia` are accepted and stored as `dc`.
- Produces: `gate.homeStates`, a frozen array of lower-case codes with no repeats, in the order given, `[]` when the key is absent or null.
- Produces: `gate.homeCountryNames`, a frozen array of folded home-country names, aliases and codes, longest first. For the United States it is `['united states of america', 'united states', 'u.s.a.', 'u.s.', 'usa', 'us']`.
- Produces: `STATES_AND_DC`, module-private, which is `[...USPS_STATES, ['district of columbia', 'dc']]`. `USPS_STATES` itself does not change, because `scan.mjs` reads it.
- Produces: `withoutUsStates(place, codes, georgia = false)`. With `georgia` true the word "georgia" is taken out as a state name whether or not `GA` stands in the place. Task 5 calls it the same way.
- The gate built from an absent policy (`buildWorkplacePolicy(undefined)`) has neither property.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkplacePolicy } from '../providers/_country.mjs';
import { validatePortalsConfig } from '../validate-portals.mjs';

const HOLD = { onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] };
const home = buildWorkplacePolicy({ ...HOLD, home_states: ['Georgia'] });
const bare = buildWorkplacePolicy(HOLD);

test('the gate carries its home states and home country names', () => {
  assert.deepEqual(home.homeStates, ['ga']);
  assert.deepEqual(buildWorkplacePolicy({ ...HOLD, home_states: ['ga', 'New York', 'GA', 'DC', 'District of Columbia'] }).homeStates, ['ga', 'ny', 'dc']);
  assert.deepEqual(bare.homeStates, []);
  assert.deepEqual(buildWorkplacePolicy({ ...HOLD, home_states: null }).homeStates, []);
  assert.deepEqual(home.homeCountryNames, ['united states of america', 'united states', 'u.s.a.', 'u.s.', 'usa', 'us']);
  assert.ok(Object.isFrozen(home.homeStates) && Object.isFrozen(home.homeCountryNames));
  assert.equal(buildWorkplacePolicy(undefined).homeStates, undefined);
});
test('home_states must be a list of US states', () => {
  assert.throws(() => buildWorkplacePolicy({ ...HOLD, home_states: 'GA' }), /workplace_policy\.home_states must be a list/);
  assert.throws(() => buildWorkplacePolicy({ ...HOLD, home_states: ['Ontario'] }), /workplace_policy\.home_states: "ontario" is not a US state name or code/);
});
test('validate-portals reports a home_states entry that is not text', async () => {
  const { errors } = await validatePortalsConfig({ location_filter: { workplace_policy: { ...HOLD, home_states: [42, ''] } } });
  assert.deepEqual(errors.filter(e => e.path.includes('home_states')).map(e => e.path), ['location_filter.workplace_policy.home_states[0]', 'location_filter.workplace_policy.home_states[1]']);
});
test('the gate result keeps its two keys', () => assert.deepEqual(home('Remote - United States'), { eligible: true, reason: 'remote_region_allowed' }));
test('Georgia is the state under a policy whose home states include it', () => {
  assert.deepEqual(home('Remote - Georgia'), { eligible: true, reason: 'remote_region_allowed' });
  assert.deepEqual(home('Georgia - Remote; Tennessee - Remote'), { eligible: true, reason: 'remote_region_allowed' });
  assert.deepEqual(home('GEORGIA - REMOTE'), { eligible: true, reason: 'remote_region_allowed' });
  assert.deepEqual(home('Remote - Georgia, Canada'), { eligible: false, reason: 'remote_country_restricted' });
  assert.deepEqual(bare('Remote - Georgia'), { eligible: false, reason: 'remote_country_restricted' });
  assert.deepEqual(home('Tbilisi, Georgia'), { eligible: false, reason: 'onsite_outside_allowed_locations' });
});
```

- [ ] **Step 2: Run it and confirm the failures.** Run: `node --test tests/workplace-policy-home-states.test.mjs`. Expected: four of the five tests fail (`undefined` properties, "Missing expected exception", an empty error list from the validator, and `remote_country_restricted` for `Remote - Georgia`). "The gate result keeps its two keys" passes.

- [ ] **Step 3: Implement**

- Add `'home_states'` to the key list that line 192 checks, so a non-list throws `workplace_policy.home_states must be a list`.
- Add `'home_states'` to the key list at `validate-portals.mjs:422`. `list()` drops an entry that is not text or is blank before the gate sees it, so without this line `[42, '']` is accepted without a word.
- Resolve each folded entry against `STATES_AND_DC` by name or code, and drop repeats. An entry that matches nothing throws `workplace_policy.home_states: "<entry>" is not a US state name or code`.
- The local variable `homeStates` on line 199 already holds the readers `compileHomeState` builds. Leave it. Name the new list something else inside the closure.
- Return the gate with `Object.assign(fn, { homeStates, homeCountryNames })`. `homeCountryNames` is the existing `homeAliases` (line 247), de-duplicated, sorted longest first and frozen.
- Give `withoutUsStates` its third parameter. Its first line removes "georgia" when `GEORGIA_CODE` matches the place. Make it remove it when `georgia` is true as well.
- On line 304, pass `homeStateCodes.includes('ga')` as that third argument (with whatever name the new list has). That is the only place the gate reads "Georgia" differently. The on-site branch does not change.

- [ ] **Step 4: Run the tests.** Run: `node --test tests/workplace-policy-home-states.test.mjs tests/workplace-policy*.test.mjs tests/location-filter-georgia-country.test.mjs`. Then, from `web/`: `node --experimental-strip-types --import=./tests/helpers/saved-settings-off.mjs --test tests/lib/workplace-policy-bridge.test.mjs`. Expected: all pass.

- [ ] **Step 5: Commit.** Run: `git add providers/_country.mjs validate-portals.mjs tests/workplace-policy-home-states.test.mjs && git commit -m "feat(scan): let a workplace policy name its home states"`

**Regression risk.** None without the key, apart from the validator now reporting a `home_states` entry that is not text. With Georgia as a home state, this task alone read a remote posting in the country Georgia (`Remote - Tbilisi, Georgia`) as US remote. The owner rejected that, and Task 5b removed it: at the end of the branch that posting is not eligible and its verdict is `elsewhere`. `Tbilisi, Georgia` on-site stays out of the gate (pinned) and is `elsewhere` too. A Georgia the location does not settle is not eligible at the gate and `review` in the verdict.

### Task 5: `locationVerdict` and `LOCATION_TIERS`

Finding 1. The prototype is `tier()` in `repro/policy-replay/replay.mjs`. The rules below replace it.

**Files:**
- Modify: `providers/_country.mjs` (append after `withoutAddressWords`)
- Test: `tests/location-verdict.test.mjs`

**Interfaces:**
- Consumes: `gate.homeStates`, `gate.homeCountryNames`, `STATES_AND_DC` and the three-argument `withoutUsStates` from Task 4. Module helpers `fold`, `word`, `has`, `escape`, `places`, `US_DOTTED`, `AMBIGUOUS_STATE_CODE`.
- Produces: `export const LOCATION_TIERS = Object.freeze(['fit', 'review', 'elsewhere'])`.
- Produces: `export function locationVerdict(gate, location, title = '', offer = {})` returning `{ tier, reason }`. `tier` is one of `LOCATION_TIERS`. `reason` is the gate's reason, or `location_names_no_place`, `remote_scoped_to_other_state` or `onsite_in_home_state`. Plan 2 imports both names.
- Plan 2 must give inbox and confirm-dialog copy for all three added reasons. `onsite_in_home_state` is new after review and means "on-site in a home state, in a town the home area does not list". It is a `review` reason only.

**The rules.** `locationVerdict` calls `gate(location, title, offer)` once, and a second time in rule 6 only. A missing property on the gate reads as an empty list. A location that is not a string reads as `''`. The first rule that applies decides.

1. The gate says eligible with a reason other than `remote_region_allowed`. The tier is `fit` with the gate's reason.
2. The gate says eligible with `remote_region_allowed`. The tier is `review` with `remote_scoped_to_other_state` when the location is *scoped to another state*, defined below. Otherwise it is `fit` with the gate's reason.
3. The gate's reason is `location_unknown` or `remote_eligibility_unconfirmed`. The tier is `review` with the gate's reason.
4. The gate's reason is `onsite_outside_allowed_locations` and the location *names no specific place*. The tier is `review` with `location_names_no_place`.
5. The gate's reason is `onsite_outside_allowed_locations` and the location *names a home state*. The tier is `review` with `onsite_in_home_state`.
6. The gate's reason is `remote_country_restricted` and the location has the whole word "georgia" in any letter case. Ask the gate again with each such word replaced by `Tennessee`. When that answer is eligible, the tier is `review` with `remote_scoped_to_other_state`.
7. Anything else is `elsewhere` with the gate's reason.

**"Scoped to another state", exactly.** Split the location into parts the way the gate does: `US_DOTTED` to `usa`, then `places()`, then each place on a bar or a spaced slash. For one raw part, `lower` is `/\p{Ll}/u.test(part)`.

- A part *names a state* when `withoutUsStates(part, lower, gate.homeStates.includes('ga'))` is not null. It also names a state when `lower` is true and a match of `AMBIGUOUS_STATE_CODE` (a capital `CA`, `CO`, `DE`, `IL` or `IN`) is followed directly by a comma and a name from `gate.homeCountryNames`, as in `Remote, CA, USA`. The second form is why that string is California and `Remote - US/CA` is still the two countries.
- The *states* of a part that names one are every name in `STATES_AND_DC` that is a whole word of the folded part, plus, when `lower` is true, every code in `STATES_AND_DC` that stands in capitals as a whole word of the raw part. All 51 codes count in that second set, the five ambiguous ones included, because the part is already known to name a state.
- A part is *country-wide* when it names no state and contains a name from `gate.homeCountryNames`.

The location is scoped to another state when at least one part names a state, no part is country-wide, and no state of any part is in `gate.homeStates`.

**"Names no specific place", exactly.** Fold the location and split it on `·`, `;` and `|`. On each part, in this order: replace every name in `gate.homeCountryNames` that is a whole word with a space; collapse each run of whitespace to one space; remove the words matched by `/\b(?:locations?|multiple|various|cities|any|nationwide|tbd|hybrid|on[ -]?site|in[ -]?office|in|the|and|or)\b/g`; remove every character that is not `a` to `z`. The location names no specific place when every part is then either empty, or exactly one entry of `STATES_AND_DC` (its name with the spaces removed, or its code) that is a home state. When `gate.homeStates` is empty, any single state counts.

**"Names a home state", exactly.** For some code in `gate.homeStates`, the raw location has that code in capitals as a whole word, or the folded location has that state's name as a whole word. Letter case of the rest does not matter here, so `KENNESAW, GA` counts. With an empty `gate.homeStates` nothing does, and rule 5 never applies.

**Why rule 5.** The owner's goal is to miss nothing in the Atlanta metro, and `onsite_locations` will never list every town in it. With Georgia as a home state, an on-site posting anywhere in Georgia is one click away and never hidden. The cost is that `Savannah, GA` and `Tbilisi, Georgia` are `review` too. The verdict has no list of towns, so it cannot tell them from `Kennesaw, GA`.

**Why rule 6 asks with "Tennessee".** The gate reads every state's full name as a state in any letter case, except Georgia's, which it reads as the country unless Georgia is a home state. Asking again with another state's name is asking "would this pass if Georgia were the state". A location that also names a real foreign country (`Remote - Georgia, Canada`) still fails the second time and stays `elsewhere`. Under a policy whose home country is not the United States the second answer is not eligible either.

**Why an empty `home_states` sends states to `review`.** With no home state configured the verdict cannot know whether `Georgia, USA`, `Remote, GA` or `Remote - Georgia` is home. Rules 2, 4 and 6 then answer `review`, never `elsewhere` and never `fit`. So the owner decision "a state-scoped remote role is review when no home state is set" holds with or without the key, and the key only sharpens the answer.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkplacePolicy, locationVerdict, LOCATION_TIERS } from '../providers/_country.mjs';

const HOLD = { onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] };
const gate = buildWorkplacePolicy({ ...HOLD, home_states: ['Georgia'] });
const bare = buildWorkplacePolicy(HOLD);

test('LOCATION_TIERS', () => assert.deepEqual(LOCATION_TIERS, ['fit', 'review', 'elsewhere']));

const TABLE = [
  // The spec's Finding 1 table.
  ['United States', 'review', 'location_names_no_place'],
  ['USA', 'review', 'location_names_no_place'],
  ['United States, Multiple Locations, Multiple Locations', 'review', 'location_names_no_place'],
  ['Georgia, USA', 'review', 'location_names_no_place'],
  ['5 Locations', 'review', 'location_names_no_place'],
  ['Remote', 'review', 'remote_eligibility_unconfirmed'],
  ['', 'review', 'location_unknown'],
  ['Remote - United States', 'fit', 'remote_region_allowed'],
  ['Sunnyvale, CA, USA; Atlanta, GA, USA', 'fit', 'onsite_location_allowed'],
  // Named in the brief for this plan.
  ['Remote, TN', 'review', 'remote_scoped_to_other_state'],
  ['Atlanta, GA', 'fit', 'onsite_location_allowed'],
  ['London, UK', 'elsewhere', 'onsite_outside_allowed_locations'],
  // No specific place.
  ['United States of America', 'review', 'location_names_no_place'],
  ['Hybrid - United States', 'review', 'location_names_no_place'],
  ['Hybrid in the United States', 'review', 'location_names_no_place'],
  ['US · 3 Locations', 'review', 'location_names_no_place'],
  ['Multiple US Locations', 'review', 'location_names_no_place'],
  ['US - Multiple', 'review', 'location_names_no_place'],
  ['Various Locations', 'review', 'location_names_no_place'],
  ['Nationwide', 'review', 'location_names_no_place'],
  ['Location TBD', 'review', 'location_names_no_place'],
  ['Tennessee, USA', 'elsewhere', 'onsite_outside_allowed_locations'],
  ['New York · United States', 'elsewhere', 'onsite_outside_allowed_locations'],
  ['Nashville, TN', 'elsewhere', 'onsite_outside_allowed_locations'],
  ['Canada', 'elsewhere', 'onsite_outside_allowed_locations'],
  ['Toronto · Canada', 'elsewhere', 'onsite_outside_allowed_locations'],
  ['Dallas, TX', 'elsewhere', 'onsite_outside_allowed_locations'],
  ['Telecommuting not available - Dallas, TX', 'elsewhere', 'onsite_outside_allowed_locations'],
  // On-site in a home state, outside onsite_locations.
  ['Kennesaw, GA', 'review', 'onsite_in_home_state'],
  ['Sandy Springs, GA', 'review', 'onsite_in_home_state'],
  ['Savannah, GA', 'review', 'onsite_in_home_state'],
  ['KENNESAW, GA', 'review', 'onsite_in_home_state'],
  ['Tbilisi, Georgia', 'review', 'onsite_in_home_state'],
  // Remote scoped to a state.
  ['Remote - Tennessee', 'review', 'remote_scoped_to_other_state'],
  ['Remote, TN, USA', 'review', 'remote_scoped_to_other_state'],
  ['Remote; Orem, UT', 'review', 'remote_scoped_to_other_state'],
  ['Remote - TX, FL, NC', 'review', 'remote_scoped_to_other_state'],
  ['Remote, DC', 'review', 'remote_scoped_to_other_state'],
  ['Remote - United States (CT)', 'review', 'remote_scoped_to_other_state'],
  ['Remote, CA, USA', 'review', 'remote_scoped_to_other_state'],
  ['Remote - IL, USA', 'review', 'remote_scoped_to_other_state'],
  ['Remote, CO, US', 'review', 'remote_scoped_to_other_state'],
  ['Remote - US/CA', 'fit', 'remote_region_allowed'],
  ['Remote - CA', 'elsewhere', 'remote_country_restricted'],
  ['Remote, GA', 'fit', 'remote_region_allowed'],
  ['Remote - Georgia', 'fit', 'remote_region_allowed'],
  ['GEORGIA - REMOTE', 'fit', 'remote_region_allowed'],
  ['Remote - TX, GA, NC', 'fit', 'remote_region_allowed'],
  ['Georgia - Remote; Tennessee - Remote', 'fit', 'remote_region_allowed'],
  ['Remote - United States; Remote, TN', 'fit', 'remote_region_allowed'],
  ['Remote - Canada', 'elsewhere', 'remote_country_restricted'],
  ['Remote - Georgia, Canada', 'elsewhere', 'remote_country_restricted'],
];
for (const [location, tier, reason] of TABLE)
  test(`${JSON.stringify(location)} is ${tier} (${reason})`, () => assert.deepEqual(locationVerdict(gate, location, 'Platform Engineer'), { tier, reason }));

test('without home_states no state is known to be home', () => {
  assert.deepEqual(locationVerdict(bare, 'Remote, GA'), { tier: 'review', reason: 'remote_scoped_to_other_state' });
  assert.deepEqual(locationVerdict(bare, 'Georgia, USA'), { tier: 'review', reason: 'location_names_no_place' });
  assert.deepEqual(locationVerdict(bare, 'Tennessee, USA'), { tier: 'review', reason: 'location_names_no_place' });
  for (const l of ['Remote - Georgia', 'Remote, Georgia', 'Georgia (Remote)', 'Remote - Georgia, Tennessee', 'GEORGIA - REMOTE'])
    assert.deepEqual(locationVerdict(bare, l), { tier: 'review', reason: 'remote_scoped_to_other_state' }, l);
  assert.deepEqual(locationVerdict(bare, 'Remote - Georgia, Canada'), { tier: 'elsewhere', reason: 'remote_country_restricted' });
  for (const l of ['Nashville, TN', 'Kennesaw, GA', 'Dallas, TX'])
    assert.deepEqual(locationVerdict(bare, l), { tier: 'elsewhere', reason: 'onsite_outside_allowed_locations' }, l);
});
test('a description restriction is elsewhere, with the gate reason', () =>
  assert.deepEqual(locationVerdict(gate, 'Remote - United States', '', { description: 'You must be based in Canada.' }), { tier: 'elsewhere', reason: 'description_country_restricted' }));
test('a location that is not a string is unknown', () => {
  assert.deepEqual(locationVerdict(gate, null), { tier: 'review', reason: 'location_unknown' });
  assert.deepEqual(locationVerdict(gate, 42), { tier: 'review', reason: 'location_unknown' });
});
test('an absent policy is always fit', () =>
  assert.deepEqual(locationVerdict(buildWorkplacePolicy(undefined), 'Remote, TN'), { tier: 'fit', reason: 'policy_absent' }));
test('a gate with no properties does not throw', () =>
  assert.deepEqual(locationVerdict(() => ({ eligible: false, reason: 'onsite_outside_allowed_locations' }), 'United States'), { tier: 'elsewhere', reason: 'onsite_outside_allowed_locations' }));
```

- [ ] **Step 2: Run it and confirm the failure.** Run: `node --test tests/location-verdict.test.mjs`. Expected: the file fails to load with `SyntaxError: The requested module '../providers/_country.mjs' does not provide an export named 'LOCATION_TIERS'` (or `'locationVerdict'`).

- [ ] **Step 3: Implement `LOCATION_TIERS` and `locationVerdict` by the rules above.** Add a JSDoc block on `locationVerdict` that gives the return type and one sentence per tier. Keep the three definitions ("scoped to another state", "names no specific place", "names a home state") as module-private functions.

- [ ] **Step 4: Run the tests.** Run: `node --test tests/location-verdict.test.mjs tests/workplace-policy*.test.mjs`. Expected: all pass.

- [ ] **Step 5: Commit.** Run: `git add providers/_country.mjs tests/location-verdict.test.mjs && git commit -m "feat(scan): add locationVerdict, a fit, review or elsewhere tier for every location"`

**What this leaves as it is.** The gate and the verdict disagree on purpose for one case. The gate says `Remote, TN` is eligible and the verdict says `review`. Until plan 2 lands, the automatic-evaluation hold in `web/src/lib/core/evaluate-candidates.mjs` reads the gate and still evaluates that row. Plan 2 moves the hold onto the verdict (spec, owner decisions).

### Task 5b (added during implementation)

The coordinator added this task after Task 5. It is one commit to `providers/_country.mjs` with two new test files, `tests/location-verdict-georgia.test.mjs` and `tests/location-verdict-gate-agreement.test.mjs`. It has two causes: the owner rejected Task 4's reading of the country Georgia as US remote, and the Task 5 review found the verdict and the gate reading the same place differently (`Remote | TN` was `fit` and `REMOTE, TN` was `elsewhere`). The task gives each Georgia one of three readings (state, country or unsure), makes the verdict read a place through the gate's own split, case rule and timezone stripper, and adds country spellings, US territories and US timezone abbreviations. The spec records the owner's decision and the defaults that followed in "Owner decisions", the evidence in "Finding 7", and the two gate properties the task added in "Names shared across the plans".

### Task 6: Document the changes and add the deviations row

**Files:**
- Modify: `docs/WORKPLACE_GEOGRAPHY.md`
- Modify: `.claude/skills/upstream-review/SKILL.md` (new section before "## Decision log template")

- [ ] **Step 1: Edit `docs/WORKPLACE_GEOGRAPHY.md`**

- In the paragraph that lists the policy fields (line 39), add `home_states` to the optional fields. Say it is a list of US state names or USPS codes and that an entry that is no state is an error.
- The bullet that ends "Ordinary words such as `us` or `by` cannot establish remote-country eligibility" stays true. Add one sentence after it. A capital `US` in a sentence that has a lower-case letter is read as the United States where a clause restricts eligibility, and never as evidence that a remote role is open to it.
- Add one bullet for scope labels. A sentence that opens with a country, one of the six nouns and `only:`, or with `pay ranges for <country> only:`, is not a restriction when an amount of pay or a privacy notice follows within 80 characters. Give `Canada-based roles only: $140,000 CAD` as the example and `Canada-based candidates only: we cannot hire in the US.` and `Canada only: relocation assistance of $10,000 provided.` as the counter-examples.
- Where the doc describes the exclusive-foreign rule, add `roles`, `positions`, `employees` and `hires`, and say that for those four a foreign country joined to a home-country name (`USA and Canada roles only`) is not exclusive.
- In the bullet on home-working words, add `telecommute` and `anywhere`, and say that `not available` after a remote word negates it. In the bullet on a state beside an onsite location, add the spaced form `GA ATLANTA` and say that `CA`, `CO`, `DE`, `IL` and `IN` need the hyphen.
- Add one bullet for `home_states`. It accepts `DC`. With Georgia listed, the word "Georgia" in a remote location is the state. Then one short paragraph on `locationVerdict`: the three tiers, the three reasons it adds, that with no `home_states` a state-only location and a state-scoped remote role are both `review`, and that with one an on-site place in that state is `review`.

- [ ] **Step 2: Add the deviations section.** Add `### Location gate text and verdict (2026-11-17)` with the plan and spec paths and one table row in the house shape:

| Upstream | Ours | Status | Notes |
| --- | --- | --- | --- |
| `providers/_country.mjs` fails any description clause that has "only" and names a foreign country, reads no capital "US" in prose, has no `home_states` and no verdict | The fork strips a scope label that pay or a privacy notice follows (`withoutScopeLabels`), reads a capital "US" in restriction clauses only (`withCapitalUs`, `prose`), reads four more nouns in the exclusive-foreign rule, reads `telecommute`, `anywhere`, `not available` and a spaced state code before a home place, accepts `home_states` (checked in `validate-portals.mjs` too), carries `homeStates` and `homeCountryNames` on the gate, and exports `locationVerdict` and `LOCATION_TIERS`. `docs/WORKPLACE_GEOGRAPHY.md` documents each | ADAPT | Keep our hunks. Pinned by `tests/workplace-policy-scope-labels.test.mjs`, `tests/workplace-policy-capital-us.test.mjs`, `tests/workplace-policy-us-location-words.test.mjs`, `tests/workplace-policy-home-states.test.mjs` and `tests/location-verdict.test.mjs`, fork tests: KEEP. The pay-label and capital-US fixes are upstream bugs, not offered yet: offer them as their own PR. |

- [ ] **Step 3: Check and commit.** Run: `node scripts/check-syntax.mjs`. Expected: it reports every `.mjs` file passed.

Run: `git add docs/WORKPLACE_GEOGRAPHY.md .claude/skills/upstream-review/SKILL.md && git commit -m "docs(scan): document scope labels, home_states and locationVerdict"`

Run: `node --test tests/fork-deviations-covered.test.mjs`
Expected: pass.

### Task 7: Corpus check, branch gates and the pull request

This task is required. The spec's "Not checked" list names it. It makes no code change unless the check fails.

- [ ] **Step 1: Fetch the boards and run the gate before and after.** The repro scripts live on `main` once the spec is committed. Run them from the worktree. The corpus is public job data and stays outside the repository.

```bash
C=$(mktemp -d) && mkdir "$C/boards" "$C/before"
git show main:providers/_country.mjs > "$C/before/_country.mjs"
R=docs/superpowers/research/2026-11-17-location-verdicts/repro/payrange
node $R/fetch.mjs "$C/boards"
node $R/analyze.mjs "$C/before/_country.mjs" "$C/boards" --dump "$C/before.json"
node $R/analyze.mjs "$PWD/providers/_country.mjs" "$C/boards" --dump "$C/after.json"
node $R/probes.mjs "$PWD/providers/_country.mjs" | tail -1
```

`providers/_country.mjs` imports nothing, so the copy from `main` loads on its own. `fetch.mjs` makes about 40 requests to public Ashby, Greenhouse and Lever boards. A board that answers 404 is skipped.

- [ ] **Step 2: Judge the result against the pass bar.** Read `remoteFlipped` from each `analyze.mjs` line. Compare `before.json` and `after.json` by `url`.

The bar has three parts, and all three must hold:

1. No posting that is eligible before is ineligible after. No `url` is in `after.json` and absent from `before.json`.
2. No true reject is lost. Every row in `before.json` that is absent from `after.json` carries a pay amount after an `only:` label for the home country and for another country. Hand-read any cleared row that does not, and treat a real restriction among them as a failure.
3. False rejects are at or below the investigator's 4. The investigator counted 64 flips, 47 of them false, so 17 are true. `remoteFlipped` after must be at most 21 on a corpus of the same size. If the boards have drifted and it is higher, hand-read every remaining row whose reason is not `description_location_restricted` and count the false ones.

The sketch for this plan measured 64 before and 21 after, with 43 cleared rows that all met part 2, and probes at 5 misses of 18. A different number is a finding to explain before the PR opens, not a number to record and move on from.

- [ ] **Step 3: Run the branch gates.** Run: `node scripts/check-syntax.mjs`. Run: `node test-all.mjs --quick`. Expected: both pass. No `dashboard/` file and no `templates/states.yml` change is in this branch, so `go test` is not needed.

- [ ] **Step 4: Review, push and open the PR.** Run `node .githooks/coderabbit-review.mjs` as its own command and handle its findings as `.claude/rules/dev-workflow.md` says: at most two fix passes, then `--decline "<reason>"`.

Then push `fix/location-gate-and-verdict` and open one PR. The body has:

- `## Why`, opening with the owner's goal from the spec in one sentence.
- The corpus table: jobs, US-remote by location, description flips before and after, cleared count, new rejects, probe misses before and after.
- The "Left out" list below, and the non-blocking CodeRabbit findings not fixed.
- The two statements upstream asks for: no personal data was added, and `node test-all.mjs` passed.
- One line saying no caller passes `home_states` yet, so no verdict on the pod changes with this PR.

Do not merge. Merging needs the owner's approval in the session.

## Left out

Each of these was reproduced or tested and deliberately gets no change here.

- **`Home based - Worldwide` and `Remote, Global`.** Not a text defect. The gate admits both when the policy lists `remote_regions: [Worldwide, Global]` (run and confirmed). The hold's policy lists no regions, because `holdPolicy` passes only `onsite_locations` and `remote_countries`. Under this plan both strings are `review`, not `elsewhere`. Plan 2 owns `holdPolicy` and passes no regions, because the word "global" also admits strings like `Remote - Global (APAC)` (spec, owner decisions, "Worldwide remote"). Both strings stay `review`.
- **"US national remote" as a remote sentence.** Making a capital "US" confirm a bare `Remote` admitted two Semgrep APAC roles on the corpus. No narrow rule separated "This is a US national remote role" from "For US-based roles open to remote work, ...". These postings are `review` under Task 5, so none is hidden.
- **"open to remote work".** It did not reproduce as a pattern miss. `remote work` is already in the pattern on line 315, and `open to remote work in the US` passes today. Without a country the sentence names no place and must not confirm one.
- **`Pay ranges for Mexico only:` with nothing after the colon.** It stays rejected. The rule needs an amount, and the spec's rule is "only when pay text follows".
- **Four probe sentences that still miss.** "For candidates based in Canada only, the pay range is ..." (a comma, not a colon), "Hiring in India? Visit our India careers page.", "We sponsor visas only in the UK." and "Hybrid work applies only to employees near an office." Each would need its own rule, none appeared in the 64 corpus rejects, and loosening the "only" test for them risks real restrictions.
- **"Open to Canadian residents only."** The gate admits this today because it knows country names and not demonyms. It is a miss in the other direction and is not in the spec.
- **The exemption for a home country beside a foreign one, on the three old nouns.** `United States and Canada candidates only.` and `We hire in the US and Canada only.` are rejected today and stay rejected. Applying the exemption to the whole rule broke the existing assertion on `Remote Spain / UK only`. The four new nouns have it, so this plan adds no reject of that kind.
- **`Remote - CA` and `Remote, CO` with no country beside them.** The gate reads them as Canada and Colombia, as it does today, and they are `elsewhere`. `Remote, Canada` is `elsewhere` too. A code with the home country beside it is read as the state, on either side: `Remote, CA, USA`, `Remote - US, CA` and `REMOTE - UNITED STATES (CT)` are `review`. Task 5b added the forms with the country first. A slash keeps two countries: `Remote - US/CA` is `fit`.
- **A state code in a remote location written all in capitals.** The gate reads no state code there, so `REMOTE, TN` is `remote_country_restricted` at the gate, today and after this plan. Task 5b changed its verdict from `elsewhere` to `review`: the verdict asks the gate again with the place in mixed case. A home-state code gets the same answer, so `REMOTE, GA` is `review` and not `fit` with Georgia as a home state. `REMOTE - TENNESSEE` is `review`. Rule 5 does read a home-state code in capitals (`KENNESAW, GA` is `review`).

## What this plan does not change on the pod

- `GA ATL` passes only once "ATL" is in the hold's home area. That is a pod setting, listed in the spec under "After plan 2 is deployed". With Georgia as a home state and no "ATL" it is `review`, not `elsewhere`.
- `home_states` does nothing until a caller passes it. Until then `Remote, GA`, `Georgia, USA` and `Remote - Georgia` are `review`, and `Kennesaw, GA` is `elsewhere`.
