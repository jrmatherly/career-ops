# Scheduled scan source groups and location hold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a scheduled scan read only a named group of sources, and let auto-evaluation hold back postings that are not confirmed remote or in the home area, so more sources can be added without a daily scan or the evaluation budget being overwhelmed.

**Architecture:** One bug fix and two independent features on one branch, `feat/scheduled-scan-groups-and-location-hold`. Task 0 fixes the existing workplace policy gate, which reads a US state code as a foreign country. The location hold then reuses the existing workplace policy gate (`buildWorkplacePolicy` in `providers/_country.mjs`) at the queue step: a ranked row the gate rejects is written to the evaluation ledger as `skipped` with reason `held-location`, and the Inbox marks it from the ledger. Source groups add one optional key to a `portals.yml` entry (`group:`) and one field to a job (`sourceGroups`); the runner filters the entries in the temporary portals file it already writes. Neither feature changes `scan.mjs`.

**Tech Stack:** Node `.mjs` scripts, Next.js (App Router) and Tailwind in `web/`, `node:test`, Playwright with Chrome for the browser suites.

**Spec:** `docs/superpowers/research/2026-11-14-scheduled-scan-groups-and-location-hold/findings.md`. It holds the owner's requirements, the code map with line numbers, the measurement of the gate on real scan history, and the hazards. Read it in full before Task 1.

## Global Constraints

- This repository is public. No tracked file, test fixture or commit message names a company from the tracker or inbox, quotes the CV, or names the owner's home area. Fixtures use `Fixture Alpha`-style company names, `Springfield` for a home place and `United States` for a country.
- One branch, one PR. Work in a sibling worktree, never in the shared checkout. Copy `node_modules` and `web/node_modules` into it with `cp -c -R`; a symlink breaks Turbopack.
- Every commit is a Conventional Commit with a scope. The `feat` commits make the next releases career-ops 2.4.0 and web 1.5.0. Task 0 is a `fix(scan)`.
- Behavior with the new settings absent is unchanged: a job with no `evaluate.hold` queues as today, and with no `group:` on any entry and no `sourceGroups` on any job every scan reads every enabled entry and a `file` job still gets no overlay.
- A new test is its own file under `tests/*.test.mjs` or `web/tests/lib/*.test.mjs`. No new section in `test-all.mjs`. The deviations test covers every path where the fork differs from upstream, not only tests: each new file and each upstream file a commit changes for the first time (`providers/_country.mjs`, `lib/evaluate-queue.mjs` and the rest) is named in the fork's deviations table in `.claude/skills/upstream-review/SKILL.md`, and `node --test tests/fork-deviations-covered.test.mjs` is rerun after each commit, because it diffs `HEAD`.
- One web unit suite: `cd web && node --experimental-strip-types --import=./tests/helpers/saved-settings-off.mjs --test tests/lib/<name>.test.mjs`. One browser suite: `cd web && npm run build && node tests/browser-suites.mjs <name>`. The runner is `web/tests/browser-suites.mjs`; there is none at the repo root.
- Before the first push: `node scripts/check-syntax.mjs`, `node test-all.mjs --quick`, `npm run typecheck` and `npm test` in `web/`, `npm run build` in `web/` then `node tests/browser-suites.mjs` from `web/`, the four pr-review-toolkit reviewers (code, tests, silent failures, comments), then `node .githooks/coderabbit-review.mjs` as its own command. Run nothing else in the worktree while `node test-all.mjs --quick` runs.
- No merge without the owner's go in the session. `main` requires no status checks, so GitHub auto-merge lands at once. Wait for the checks to finish and merge by hand.

## Decisions already made

| Decision | Answer | Source |
|---|---|---|
| A held posting | Ranked, written to the ledger as `skipped` / `held-location`, never queued | Owner, 2026-11-14 |
| The location test | The existing workplace policy gate, not a new matcher | Research, measured on 1,514 rows |
| A blank or bare-`Remote` location | Held. The gate already treats it as unconfirmed | Research |
| A US state written directly beside the home place, under a policy that allows the United States | Taken out before the country check, so `GA`, `CA`, `CO`, `IL` and `MA`, for example, are not Gabon, Canada, Colombia, Israel and Morocco there. It is never read as the United States, and a state anywhere else in the location is not read at all (as built, 2026-11-14) | Research, prototype measured |
| How a state is recognized (on-site check only) | By its position: right after the home place name, or right before it when a street address follows (`compileHomeState` in `providers/_country.mjs`). The build first reused the scanner's matcher, which three review rounds showed admits `Vancouver, BC, CA - HQ` and `CA-BC-Richmond`; the scanner keeps that matcher for its own `always_allow` | This plan, 2026-11-14 review |
| A state in a remote location (`Remote, CA`, `Remote - CO`, `Remote - Berlin, DE`) | Not evidence of the United States. The posting stays held unless it names the country. Changed during the build, 2026-11-14: `Berlin, DE` and `Perth, WA` read the same as a US place, and the spec already holds a state-limited remote label. Measured on the 1,514 rows: 268 eligible, against 212 on `main` and 293 under the looser rule, and no row eligible on `main` is held | Build review, 2026-11-14 |
| Where the hold is configured | On the job, under `evaluate.hold`, shown only in Auto mode | This plan |
| How a source joins a scan | `group: <name>` on the entry in `portals.yml`; a job lists the groups it scans | This plan |
| A job with no groups | Scans every enabled entry that has no `group:` | This plan |
| The `full` engine | Ignores groups. It reads no entries from `portals.yml` | Research |
| Auto-evaluation caps | Not changed here. The owner decides after the hold ships | Owner, 2026-11-14 |

## Review Focus

1. **A job edited by hand holds an unusable policy** (an unknown country, an empty list). The owner expects nothing to be auto-evaluated and the run to say why. Pinned in Task 4.
2. **A ranked row has no scan-history row, or a blank location.** The owner expects it held, since its place is not confirmed. Pinned in Task 2.
3. **The first `group:` is added while a `file` job exists.** The owner expects that job to stop scanning grouped sources, the same as a `custom` job. Pinned in Task 6.
4. **A job names a group no enabled entry has** (a typo). The owner expects the run to fail with the group's name, not a green run that found nothing. Pinned in Task 6.
5. **A job is switched from Auto to Review and back.** The owner expects the hold to still be there. Pinned in Task 3.

Task 0 carries its own inputs: a home place written `City, ST`, a multi-office posting that lists the home place beside a foreign office, a non-US policy that must not change, and locations where a state code is also an English word or a country slot (`Remote in Europe`, `Toronto, ON, CA`), which must stay held.

---

### Task 0: The workplace gate reads a US state as the United States

The hold is only as good as the gate. Today, under a policy whose countries are the United States, `Springfield, IL` is rejected with `onsite_country_restricted` because `IL` is also Israel's ISO code, and `Remote - CO` with `remote_country_restricted` (Colombia). On the hosted instance, with the rule below prototyped in front of the unchanged gate, 84 rows moved from held to eligible and none moved the other way, and 87 of the 91 rows that name a home-area city were eligible afterwards (spec, "Measurement: US states").

> **As built, 2026-11-14.** Only the on-site check changed, and it removes a state written directly beside the home place instead of reading it as the United States (`compileHomeState` in `providers/_country.mjs`). The remote check and its `supportsHome` call are as on `main`, and the `Remote - CO` test below was replaced by tests that hold a state-only remote location. The decision table above has the reason and the measurement. The text below is the plan as it was written.

**Files:**
- Modify: `providers/_country.mjs` (`buildWorkplacePolicy`: the on-site check at `:276-280`, the remote check at `:286-287` and the `supportsHome(geoLoc)` call on the remote return at `:292`; add the exported state list and matcher)
- Modify: `scan.mjs:525-632` (import `USPS_STATES`, `US_STATE_NAMES_ALSO_COUNTRIES`, `compileUsStateAbbrev` and `placesWithoutCountryCode` from `providers/_country.mjs` instead of defining them; `scan.mjs` already imports from that module at `:41`)
- Modify: `docs/WORKPLACE_GEOGRAPHY.md` (one bullet)
- Test: `tests/workplace-policy-us-states.test.mjs` (create)

**Interfaces:**
- Produces: `USPS_STATES`, `US_STATE_NAMES_ALSO_COUNTRIES` and `compileUsStateAbbrev` (with its helper `placesWithoutCountryCode`), exported from `providers/_country.mjs` with the values and behavior `scan.mjs` holds today. The scanner's `always_allow` matchers keep working unchanged, which `tests/location-filter-worldwide.test.mjs` and the scanner's own location suites confirm.
- `buildWorkplacePolicy` keeps its signature and its reasons.

The rule, applied only when the United States is an allowed country (`localCodes` has `US` for the on-site check, `homeCodes` has `US` for the remote checks). One helper returns the countries of a location under this rule, and all three places named above call it. The remote return needs it too: without it `Remote - CO` clears the restriction check and then fails `supportsHome`, ending as `remote_eligibility_unconfirmed` (read in the code on `main`, 2026-11-14).

- **A state code.** A two-letter USPS code counts as the United States, and is not read as the ISO country with the same letters, when the scanner's matcher accepts it: after a comma (`Springfield, IL`, `Springfield, MA 01103`) or as the trailing token of a place (`Remote - CO`), and not in the country slot of `City, Region, CC`. One form is added for the gate, because the measured data has it: a code that opens a place and is followed by a hyphen (`GA-SPRINGFIELD, 1 MAIN ST`).
- **A state name.** A name in `US_STATE_NAMES_ALSO_COUNTRIES` that is joined to another place part by a comma, a colon or a hyphen counts as the United States. Alone in its place it is still the country.
- **Not a state.** A code in running text is not one. `in`, `or`, `me`, `ok` and `hi` are English words, and the gate folds the location to lower case before it reads it, so a rule that takes any two-letter token would read `Remote in Europe` as Indiana and make it eligible. That is the one direction the hold must never move in.

A policy that does not allow the United States behaves exactly as today.

The hosted prototype rewrote the location before calling the unchanged gate, and its token rule is not recorded in the spec. The tests below are the contract. If the scanner's matcher cannot satisfy one of them, stop and report which, instead of loosening the rule.

- [ ] **Step 1: Write the failing tests.**

```js
const us = buildWorkplacePolicy({ onsite_locations: ['Springfield'], remote_countries: ['United States'] });
const verdict = (gate, location) => gate(location, 'Platform Lead');

for (const location of ['Springfield, IL', 'Springfield, MA 01103', 'GA-SPRINGFIELD, 1 MAIN ST', 'Springfield, Georgia', 'Springfield, DE', 'USA - Georgia - Springfield - 30005']) {
  test(`${location} is the home place, not a foreign country`, () => assert.deepEqual(verdict(us, location), { eligible: true, reason: 'onsite_location_allowed' }));
}
for (const location of ['Remote in Europe', 'Springfield or Remote', 'Remote (OK to work anywhere)', 'Remote - Toronto, ON, CA', 'Remote, Bengaluru, Karnataka, IN']) {
  test(`${location} is not confirmed as the United States`, () => assert.equal(verdict(us, location).eligible, false));
}
test('a posting listing the home place beside a foreign office is eligible', () => {
  assert.equal(verdict(us, 'Springfield, Georgia · London, United Kingdom · Cincinnati, Ohio').eligible, true);
});
test('remote limited to a state is remote in the United States', () => {
  assert.deepEqual(verdict(us, 'Remote - CO'), { eligible: true, reason: 'remote_region_allowed' });
});
test('a state name alone in its segment is still the country', () => {
  assert.deepEqual(verdict(us, 'Poland · Georgia · Bulgaria · Remote'), { eligible: false, reason: 'remote_country_restricted' });
});
test('a spelled-out foreign country still restricts the home place', () => {
  assert.deepEqual(verdict(us, 'Springfield, Canada'), { eligible: false, reason: 'onsite_country_restricted' });
});
test('a policy without the United States reads CA as Canada, as before', () => {
  const es = buildWorkplacePolicy({ onsite_locations: ['Barcelona'], remote_countries: ['Spain'] });
  assert.deepEqual(verdict(es, 'Barcelona, CA'), { eligible: false, reason: 'onsite_country_restricted' });
});
```

- [ ] **Step 2: Run** `node --test tests/workplace-policy-us-states.test.mjs`. Expected: FAIL on the first five home-place locations, the multi-office test and the `Remote - CO` test. `USA - Georgia - Springfield - 30005` passes before the change, because `USA` is already in the location, and so do the five not-confirmed locations and the last three tests. They guard the change (all run on `main`, 2026-11-14).
- [ ] **Step 3: Implement the rule** in the three places named above, through one helper, and move the state constants and the matcher.
- [ ] **Step 4: Run** `node --test tests/workplace-policy-us-states.test.mjs tests/workplace-policy.test.mjs tests/location-filter-worldwide.test.mjs` and the web suite `workplace-policy-bridge.test.mjs`. Expected: PASS. A failure in an existing suite means the rule reached a non-US policy; fix the rule, not the suite.
- [ ] **Step 5: Add the bullet** to `docs/WORKPLACE_GEOGRAPHY.md`: under a policy that allows the United States, a state code or an attached state name is the United States.
- [ ] **Step 6: Commit** `fix(scan): the workplace policy reads a US state as the United States`.

### Task 1: The queue can hold a row

**Files:**
- Modify: `lib/evaluate-queue.mjs:158-172` (`queueCandidates`) and its doc comment above
- Test: `tests/evaluate-queue-held.test.mjs` (create)

**Interfaces:**
- Produces: `queueCandidates(root, { jobId, runId, rankThreshold, autoJobIds, held }, rows)`. `held` is an optional `Set<string>` of row URLs, default empty. Returns the number queued, as today. Exported constant `HELD_LOCATION = 'held-location'`.

- [ ] **Step 1: Write the failing tests.** Read `tests/evaluate-queue.test.mjs` for how a ledger root is built and read back, and reuse that setup.

```js
test('a held row at or above the threshold is skipped as held-location, not queued', async () => {
  const queued = await queueCandidates(root, { jobId: 'job-1', runId: 'run-1', rankThreshold: 3.5, held: new Set([A]) }, [{ url: A, rank: 4.2 }, { url: B, rank: 4.0 }]);
  assert.equal(queued, 1);
  assert.deepEqual(states(root), { [A]: ['skipped', 'held-location'], [B]: ['queued', ''] });
});

test('a held row below the threshold keeps the below-threshold reason', async () => {
  await queueCandidates(root, { jobId: 'job-1', runId: 'run-1', rankThreshold: 3.5, held: new Set([A]) }, [{ url: A, rank: 2.0 }]);
  assert.deepEqual(states(root), { [A]: ['skipped', 'below-threshold'] });
});

test('with no held set every row is decided as before', async () => {
  assert.equal(await queueCandidates(root, { jobId: 'job-1', runId: 'run-1', rankThreshold: 3.5 }, [{ url: A, rank: 4.2 }]), 1);
});

test('a held row is never returned by drainPlan', async () => {
  await queueCandidates(root, { jobId: 'job-1', runId: 'run-1', rankThreshold: 3.5, held: new Set([A]) }, [{ url: A, rank: 4.2 }]);
  assert.deepEqual(drainPlan(root, { jobId: 'job-1', rankThreshold: 3.5 }), []);
});
```

`states(root)` is a helper in the test file: URL to `[state, reason]` of its latest ledger row.

- [ ] **Step 2: Run** `node --test tests/evaluate-queue-held.test.mjs`. Expected: FAIL, the first test reports `queued` 2.
- [ ] **Step 3: Implement.** Add `held = new Set()` to the options and `HELD_LOCATION`. A row is held only when it is ranked, at or above the threshold, and its `url` is in `held`. Extend the doc comment with one sentence saying a held row is not weighed again.
- [ ] **Step 4: Run** `node --test tests/evaluate-queue-held.test.mjs tests/evaluate-queue.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(queue): a ranked row can be held instead of queued`.

### Task 2: Decide which rows are held

**Files:**
- Modify: `web/src/lib/core/evaluate-candidates.mjs` (add one export)
- Test: `web/tests/lib/evaluate-held.test.mjs` (create)

**Interfaces:**
- Produces: `heldForLocation({ rows, scanHistoryRows, gate }) => Set<string>`. `rows` is `Array<{ url: string }>`. `scanHistoryRows` is what `parseScanHistoryLine` returns (`url`, `status`, `location`, `title`). `gate` is `(location: string, title: string) => { eligible: boolean }`. The result holds the `url` of every row the gate rejects.

- [ ] **Step 1: Write the failing tests.**

```js
const gate = (location) => ({ eligible: /remote, united states|springfield/i.test(location) });
const history = [
  { url: 'https://example.com/a', status: 'added', location: 'Remote, United States', title: 'Platform Lead' },
  { url: 'https://example.com/b', status: 'added', location: 'Metropolis, NY', title: 'Platform Lead' },
  { url: 'https://example.com/c', status: 'added', location: '', title: 'Platform Lead' },
  { url: 'https://example.com/e', status: 'skipped_title', location: 'Springfield', title: 'x' },
  { url: 'https://example.com/e', status: 'added', location: 'Metropolis, NY', title: 'x' },
];
const urls = (...ids) => ids.map((id) => ({ url: `https://example.com/${id}` }));

test('a row the gate rejects is held and one it accepts is not', () => {
  assert.deepEqual([...heldForLocation({ rows: urls('a', 'b'), scanHistoryRows: history, gate })], ['https://example.com/b']);
});
test('a blank location and a row with no scan history are held', () => {
  assert.deepEqual([...heldForLocation({ rows: urls('c', 'd'), scanHistoryRows: history, gate })].sort(), ['https://example.com/c', 'https://example.com/d']);
});
test('the last added row for a URL decides', () => {
  assert.equal(heldForLocation({ rows: urls('e'), scanHistoryRows: history, gate }).has('https://example.com/e'), true);
});
test('a tracking parameter on the pending URL still finds its history row', () => {
  assert.equal(heldForLocation({ rows: [{ url: 'https://example.com/a?utm_source=x' }], scanHistoryRows: history, gate }).size, 0);
});
```

- [ ] **Step 2: Run** the suite. Expected: FAIL, `heldForLocation` is not exported.
- [ ] **Step 3: Implement `heldForLocation`.** Join by `normalizeUrl`, the way `candidatesFor` in the same file does, keeping the last `added` row per key. A row with no history row is passed to the gate as `gate('', '')`.
- [ ] **Step 4: Run** the suite and `web/tests/lib/evaluate-candidates.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): pick the rows a location hold keeps back`.

### Task 3: A job stores a hold

**Files:**
- Modify: `web/src/lib/scheduled-job-input.mjs:31-43` (`scheduledEvaluate`)
- Modify: `web/src/lib/evaluate-settings.mjs` (`clampEvaluate`, `evaluateBody`, `evaluateForm`, `evaluateModeLabel`)
- Modify: `web/src/lib/scheduled-jobs.ts:17-22` (`EvaluateSettings`), and `createScheduledJob` and `patchScheduledJob`
- Modify: `web/src/lib/core/workplace-policy.mjs` (add one export)
- Test: `web/tests/lib/evaluate-hold-settings.test.mjs` (create)

**Interfaces:**
- Produces: `EvaluateSettings.hold?: { onsiteLocations: string[]; remoteCountries: string[] }`.
- Produces: `holdPolicy(hold) => { onsite_locations: string[], remote_countries: string[] }`, exported from `web/src/lib/scheduled-job-input.mjs`. Task 4 uses it.
- Produces: `holdPolicyProblem(hold, codeRoot?) => Promise<string | null>`, exported from `web/src/lib/core/workplace-policy.mjs`. It builds the core gate through the same dynamic import `loadWorkplacePolicy` uses and returns the error message, or `null`.
- Produces: `EvaluateForm` gains `holdOnsite: string[]` and `holdRemote: string[]`. Task 5 renders them.

Rules for `scheduledEvaluate(value, base)`:

| `value.hold` | Stored `hold` |
|---|---|
| absent | `base?.hold`, unchanged |
| `null` | removed |
| both lists empty after `cleanChips` | removed |
| exactly one list empty | throws `A location hold needs both a home area and a remote country.` |
| not an object, or a list that is not an array | throws `Invalid location hold.` |
| both lists nonempty | `{ onsiteLocations, remoteCountries }`, cleaned with `cleanChips` |

The returned object carries a `hold` key only when one is stored, so a job with none serializes as it does today.

- [ ] **Step 1: Write the failing tests.** One test per row of the table above, plus:

```js
test('Review sends the mode alone, so a stored hold survives Auto to Review to Auto', () => {
  const stored = scheduledEvaluate({ mode: 'auto', hold: { onsiteLocations: ['Springfield'], remoteCountries: ['United States'] } }, undefined);
  const review = scheduledEvaluate(evaluateBody({ ...evaluateForm(stored), mode: 'review' }, stored), stored);
  const auto = scheduledEvaluate(evaluateBody({ ...evaluateForm(review), mode: 'auto' }, review), review);
  assert.deepEqual(auto.hold, { onsiteLocations: ['Springfield'], remoteCountries: ['United States'] });
});
test('clearing both chip lists in Auto removes the hold', () => {
  const stored = scheduledEvaluate({ mode: 'auto', hold: { onsiteLocations: ['Springfield'], remoteCountries: ['United States'] } }, undefined);
  const next = scheduledEvaluate(evaluateBody({ ...evaluateForm(stored), holdOnsite: [], holdRemote: [] }, stored), stored);
  assert.equal('hold' in next, false);
});
test('the card badge names the hold', () => {
  assert.equal(evaluateModeLabel({ mode: 'auto', rankThreshold: 3.5, maxPerRun: 5, hold: { onsiteLocations: ['Springfield'], remoteCountries: ['United States'] } }), 'Auto, rank 3.5 and above, 5 per run, other locations held');
});
test('holdPolicyProblem names an unknown country and accepts a known one', async () => {
  assert.match(await holdPolicyProblem({ onsiteLocations: ['Springfield'], remoteCountries: ['Atlantis'] }), /Atlantis|country/i);
  assert.equal(await holdPolicyProblem({ onsiteLocations: ['Springfield'], remoteCountries: ['United States'] }), null);
});
```

- [ ] **Step 2: Run** the suite. Expected: FAIL.
- [ ] **Step 3: Implement.** In Auto mode `evaluateBody` always sends `hold` (the two form lists, or `null` when both are empty), so clearing works. In Off and Review it still sends the mode alone. `holdPolicyProblem(undefined)` resolves to `null`. `createScheduledJob` awaits `holdPolicyProblem(fields.evaluate?.hold)` before it takes the store lock (the route has already parsed the body). `patchScheduledJob` awaits it inside its `withScheduledStore` callback, right after `parseScheduledJobInput`; the callback may be async, since `withScheduledStore` awaits it. Both throw `ScheduledJobValidationError` with the message, which both routes already turn into a 400. `updateScheduledJob` has no caller in `web/src` and is left alone. When the gate's message starts with `workplace_policy.remote_countries`, `holdPolicyProblem` returns `"Remote from" must name a country, such as United States.` instead, so the form does not show a config key the owner never typed.
- [ ] **Step 4: Run** the suite, plus `evaluate-settings.test.mjs`, `scheduled-job-body.test.mjs` and `scheduled-jobs-runner.test.mjs`. Expected: PASS. Then `npm run typecheck` in `web/`. Expected: no errors.
- [ ] **Step 5: Commit** `feat(web): a scheduled scan can store a location hold`.

### Task 4: The rank pass applies the hold

**Files:**
- Modify: `web/scripts/scheduled-jobs-runner.mjs:506-517` (the `auto` branch of `rankJob`)
- Test: `web/tests/lib/scheduled-location-hold.test.mjs` (create)

**Interfaces:**
- Consumes: `heldForLocation` (Task 2), `holdPolicy` (Task 3), `queueCandidates` with `held` (Task 1), `buildWorkplacePolicy` from `../../providers/_country.mjs` as Task 0 leaves it. The `Springfield, IL` row below is eligible only after Task 0.

- [ ] **Step 1: Write the failing tests.** Read the `rankPass` tests at `web/tests/lib/scheduled-jobs-runner.test.mjs:1184-1340` and reuse their fixture root, fake `spawnFn` ranker and ledger reader. The store's job is in `auto` mode with `hold: { onsiteLocations: ['Springfield'], remoteCountries: ['United States'] }` and `rankThreshold: 3.5`. Scan history has four `added` rows, all ranked 4.0 by the fake ranker: `Remote, United States`, `Springfield, IL`, `Metropolis, NY`, and a blank location.

```js
test('auto mode queues the remote and home rows and holds the rest', async () => {
  await rankPass(root, storePath, { spawnFn });
  assert.deepEqual(ledgerStates(root), { remote: 'queued', home: 'queued', elsewhere: 'skipped:held-location', blank: 'skipped:held-location' });
  assert.equal(readScheduledStore(storePath).runs[0].autoQueued, 2);
});
test('a job with no hold queues all four', async () => { /* same store without hold */ assert.equal(run.autoQueued, 4); });
test('a hold that cannot be built queues nothing and says why on the run', async () => {
  /* store edited by hand: remoteCountries: ['Atlantis'] */
  await rankPass(root, storePath, { spawnFn });
  assert.deepEqual(ledgerStates(root), {});
  assert.match(readScheduledStore(storePath).runs[0].evalMessage, /^Location hold: .*\. Nothing was queued\.$/);
});
test('a hold that cannot be built keeps the waiting message, so the run stays due', async () => {
  /* same store, with more unranked candidates than RANK_MAX_PER_PASS */
  assert.match(readScheduledStore(storePath).runs[0].evalMessage, /^Location hold: .*Nothing was queued\. \d+ rows wait for the next rank pass\.$/);
});
test('review mode with a hold writes no ledger row and no message', async () => { /* mode: review */ assert.deepEqual(ledgerStates(root), {}); assert.equal(run.evalMessage, undefined); });
```

- [ ] **Step 2: Run** the suite. Expected: FAIL, the first test shows four `queued`.
- [ ] **Step 3: Implement.** Build the gate once per `rankJob` call from `holdPolicy(job.evaluate.hold)`. On a throw, skip `queueCandidates` for this pass and put `Location hold: ${error.message}. Nothing was queued.` in front of any message the pass already holds, joined by one space. It must not replace that message: `runToRank` keeps a run due only while its `evalMessage` ends with the waiting text (`RANK_WAITING`, `:426-434`), so a replaced message would stop the remaining rows from being ranked until the job's next run, and would hide a ranker failure.
- [ ] **Step 4: Run** the suite and `scheduled-jobs-runner.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): auto-evaluation holds postings outside the job's locations`.

### Task 5: The Inbox and the job form show the hold

**Files:**
- Modify: `web/src/lib/inbox-pending.mjs` (add `markHeld` beside `markGated`), `web/src/app/pipeline/page.tsx:35`, `web/src/lib/career-ops.ts:106-114` (`InboxJob.held?: boolean`; there is no `PendingJob` type), `web/src/components/inbox/triage-row.tsx:91-103`
- Modify: `web/src/components/explore/filter-builder.tsx:32` (export `KeywordField`), `web/src/components/scheduled-scans/create-job-modal.tsx:176-214` (`EvaluateFields`), `web/src/components/scheduled-scans/edit-job-modal.tsx`
- Test: `web/tests/lib/inbox-held.test.mjs` (create); extend the `evaluation-options` browser suite and its fixture (`web/tests/browser-suites.mjs:74`)

**Interfaces:**
- Consumes: `HELD_LOCATION` (Task 1), `EvaluateForm.holdOnsite` and `holdRemote` (Task 3).
- Produces: `markHeld(jobs, ledgerEntries) => jobs`, setting `held: true` on a pending job whose ledger entry is `skipped` with reason `held-location`, matched by `canonicalJobKey` as `markGated` does.

Exact copy:

| Place | Text |
|---|---|
| Inbox badge | `Held: location` |
| Badge `title` | `Ranked, not auto-evaluated. Its location is not confirmed remote or in your home area.` |
| First field label, Auto mode | `Home area` |
| Its helper | `Places you would work on-site or hybrid, one per entry and without the state: a comma starts a new entry. A posting there is auto-evaluated.` |
| Second field label | `Remote from` |
| Its helper | `Countries you can work remotely from. A posting that says only "Remote" is held.` |
| Line above both fields | `Leave both empty to auto-evaluate every location.` |

- [ ] **Step 1: Write the failing unit tests** for `markHeld`: a `held-location` entry marks its job; a `below-threshold` entry does not; a job already `gated` keeps `gated` and also gets `held`; with no ledger entries the same array is returned.
- [ ] **Step 2: Run** the suite. Expected: FAIL.
- [ ] **Step 3: Implement `markHeld` and the badge.** The badge uses the same `Badge` component as the `Gated` one in `triage-row.tsx` and sits beside the rank label, not in its place. Today that spot shows the gated badge or the rank, never both, and a held row must keep its rank visible, because the owner decides on it by hand.
- [ ] **Step 4: Add the two chip fields** to `EvaluateFields`, shown only when the mode is Auto, using the exported `KeywordField`. Both modals pass `holdOnsite` and `holdRemote` through `evaluateForm` and `evaluateBody`. A 400 from the route shows in the modal's existing error line.
- [ ] **Step 5: Extend the browser suite.** In the `evaluation-options` fixture add one pending row and one ledger row `skipped` / `held-location` for it. Assert the row shows `Held: location` and its rank label, that the badge is at least 24px tall, and that opening the edit modal for an Auto job shows both field labels. The fixture is `inbox-undo`, which the `inbox-keys` and `inbox-undo` suites share (`web/tests/browser-suites.mjs:74-77`), so a new pending row can shift their row counts and keyboard order.
- [ ] **Step 6: Run** the unit suite, `npm run typecheck`, then `npm run build` and, from `web/`, `node tests/browser-suites.mjs evaluation-options`, `node tests/browser-suites.mjs inbox-keys` and `node tests/browser-suites.mjs inbox-undo`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(web): show held postings in the Inbox and the hold in the job form`.

### Task 6: Source groups

**Files:**
- Modify: `web/scripts/scheduled-jobs-runner.mjs` (`executeJob` at `:255-300`, add one export)
- Modify: `web/src/lib/scheduled-jobs.ts` (`ScheduledJob`, `JobFields` at `:65`, `parseScheduledJobInput` at `:106-137`), `web/src/lib/scheduled-job-body.mjs:12-17`
- Modify: `web/src/components/scheduled-scans/create-job-modal.tsx`, `edit-job-modal.tsx`, `job-card.tsx`
- Modify: `templates/portals.example.yml` (document `group:` in the `tracked_companies` entry comment block)
- Test: `web/tests/lib/scheduled-source-groups.test.mjs` (create), `web/tests/lib/portals-group-preserved.test.mjs` (create)

**Interfaces:**
- Produces: `ScheduledJob.sourceGroups: string[]` (absent on a stored job reads as `[]`).
- Produces: `selectSourceGroups(config, groups) => config`, exported from the runner. It returns `config` itself when nothing changes, else a copy whose `tracked_companies` and `job_boards` keep only the selected entries. An entry is selected when `groups` is empty and the entry has no `group` (absent, empty or not a string), or when `groups` is nonempty and the entry's trimmed, case-folded `group` is in it. A list that is not an array is left as it is.

Rules for `executeJob`, `portals` engine only (the `full` engine never calls `selectSourceGroups`):

| Case | Result |
|---|---|
| No entry has a `group`, job has no `sourceGroups` | Unchanged. A `file` job writes no overlay |
| Selection removed at least one entry | The overlay file is written, for a `file` job too (the `if (!fromFile)` before `writeJobPortals` gains this case) |
| `sourceGroups` nonempty and no enabled entry (one without `enabled: false`, the scanner's rule) is selected | The run fails, not retried, with `No enabled source is in ${groups.map((g) => `"${g}"`).join(', ')}. Tag an entry with group: in portals.yml.` |

`parseScheduledJobInput`: `sourceGroups` absent keeps `base?.sourceGroups ?? []`; an array is cleaned with `cleanChips`; anything else throws `ScheduledJobValidationError('Invalid source groups.')`.

Exact copy:

| Place | Text |
|---|---|
| Field label, shown when the engine is Portals | `Source groups` |
| Helper | `Leave empty to scan every source that has no group. To move a source to another scan, add group: <name> to its entry in portals.yml and name that group here.` |
| Job card line, when nonempty | `Groups: ${sourceGroups.join(', ')}` |

- [ ] **Step 1: Write the failing tests.**

```js
const config = { title_filter: { positive: ['x'] }, tracked_companies: [{ name: 'Fixture Alpha' }, { name: 'Fixture Beta', group: 'weekly' }, { name: 'Fixture Gamma', group: ' Weekly ' }], job_boards: [{ name: 'Fixture Board', group: 'heavy' }] };
const names = (c) => [...c.tracked_companies, ...c.job_boards].map((e) => e.name);

test('no groups selects the entries with no group', () => assert.deepEqual(names(selectSourceGroups(config, [])), ['Fixture Alpha']));
test('a named group selects its entries, ignoring case and spaces', () => assert.deepEqual(names(selectSourceGroups(config, ['weekly'])), ['Fixture Beta', 'Fixture Gamma']));
test('two groups select both', () => assert.deepEqual(names(selectSourceGroups(config, ['weekly', 'heavy'])), ['Fixture Beta', 'Fixture Gamma', 'Fixture Board']));
test('a config with no group anywhere is returned as is', () => { const plain = { tracked_companies: [{ name: 'Fixture Alpha' }] }; assert.equal(selectSourceGroups(plain, []), plain); });
```

Then three `executeJob` tests with a fake `spawnFn` that records `env.CAREER_OPS_PORTALS` and reads that file, following `web/tests/lib/scheduled-jobs-runner.test.mjs:267`:
  - a `file` job, base file with one grouped entry: the scanner is given an overlay path, and the overlay lacks the grouped entry;
  - a `file` job, base file with no group: the scanner is given the base path (today's behavior);
  - a job with `sourceGroups: ['wekly']`: `state` is `failed`, `attempt` is 1, the message names `"wekly"`, and `spawnFn` was not called.

`portals-group-preserved.test.mjs`: toggle `enabled` on an entry that has `group: weekly` through `setCompanyEnabledText(source, name, enabled)` in `web/src/lib/portals-config.mjs`, the function the Portals page writes an entry with, and assert the written text still contains `group: weekly`.

- [ ] **Step 2: Run** both suites. Expected: FAIL.
- [ ] **Step 3: Implement `selectSourceGroups` and the `executeJob` rules.**
- [ ] **Step 4: Add `sourceGroups`** to the type, `JobFields`, `parseScheduledJobInput`, `scheduledJobBody`, both modals (a `KeywordField`, hidden for the Full engine) and the job card.
- [ ] **Step 5: Document `group:`** in `templates/portals.example.yml`, as its own `── group (optional, per entry) ──` comment block after the `timeout_ms` one and in the same shape: what it does, that an entry with none belongs to every scan that names no group, and that `node scan.mjs` run by hand reads every group.
- [ ] **Step 6: Run** both suites, `scheduled-jobs-runner.test.mjs`, `scheduled-job-body.test.mjs`, `npm run typecheck`, and `node validate-portals.mjs --file templates/portals.example.yml`. Expected: PASS and 0 errors. If the portals-preserved test fails, fix the writer, not the test.
- [ ] **Step 7: Commit** `feat(web): a scheduled scan can read only named source groups`.

### Task 7: Document, review, push once

**Files:**
- Modify: `docs/AUTOMATION.md` (the auto mode section near `:246`), `docs/WEB_UI.md:57-61`, `docs/WORKPLACE_GEOGRAPHY.md` (one section), `.claude/skills/upstream-review/SKILL.md` (deviations rows for the new test files, the two features and every upstream file they change)

- [ ] **Step 1: Write the docs.** `AUTOMATION.md`: a "Location hold" subsection (what is held, that a bare `Remote` is held, that a held row is not weighed again and is evaluated by hand from the Inbox, the ledger reason `held-location`) and a "Source groups" subsection (the `group:` key, the rule for a job with no groups, that the Full engine ignores groups). `WORKPLACE_GEOGRAPHY.md`: a short section "Holding instead of dropping" that points to the job setting. `WEB_UI.md`: the two new fields and the Inbox badge, and the sentence that says a job using the file's filters passes `portals.yml` to the scanner unchanged, which stops being true once an entry has a group.
- [ ] **Step 2: Run** the full pre-push list from Global Constraints. Expected: every command passes.
- [ ] **Step 3: Run the four reviewers** on the unpushed branch. Give each the spec path and this plan's Review Focus. Check each finding against the code, fix the confirmed ones, rerun the affected suites.
- [ ] **Step 4: Run** `node .githooks/coderabbit-review.mjs`, then push and open the PR. The body opens with the owner's goal, states no personal data was added, and lists what was verified.
- [ ] **Step 5: After CI,** read the PR comments and the review body. Merge only on the owner's go.

## After the merge

These are the owner's settings on the hosted instance. None is a code change, and each needs the owner's go.

| Step | Where |
|---|---|
| Release and deploy | Merge the release PR, then confirm `/app/VERSION` on the pod |
| Set the hold on both scheduled scans | Scheduled scans page, Edit, Auto mode: the home area and the remote country |
| Switch both scans from Review back to Auto | Same form. They were set to Review on 2026-11-14 until the hold exists |
| Check the first run | The Inbox shows `Held: location` rows, and the run's counts show fewer queued than ranked |
| Tag the heavy sources and add a weekly Portals scan for them | `group:` in `portals.yml`, then a new job naming that group |
| Decide the caps | Per run on each job (1 to 20) and the daily cap in Settings |

## Not in this plan

- A run count for held rows on the job card. The Inbox badge shows them.
- Releasing older held rows when a hold changes. They are evaluated by hand.
- A group picker on the Portals page. Groups are set in `portals.yml`.
- Groups for the Full engine, which reads no entries from `portals.yml`.
- The trimmed `Java` and `SAP` title chips on the hosted jobs, and any change to `cleanChips`.
- Raising the 20 per run limit in `scheduledEvaluate`.
- Offering Task 0 upstream. It is an upstream bug fix and goes there as its own PR after this one lands.
