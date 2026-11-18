# Inbox location verdicts implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every pending Inbox row says whether its location fits the owner (Atlanta metro on-site, or remote open to a US resident), the Inbox opens on the rows that fit, the rest stay one click away, and automatic evaluation holds exactly the rows the Inbox does not call a fit.

**Architecture:** One function, `holdVerdict`, turns a stored hold into a verdict with plan 1's `locationVerdict`, and the rank pass and the drain hold every row whose verdict is not `fit`. The pipeline page builds one verdict per scheduled job's hold and gives each pending row the best one, which the Inbox shows as a badge, a four-way tier segment and a note in the Score confirm. The hold gains an optional list of home states, and the ledger-driven `held` flag and its badge are deleted.

**Tech Stack:** Next.js 16.4 and React 19 in `web/`, plain `.mjs` modules tested with `node:test`, `playwright-core` browser suites run by `web/tests/browser-suites.mjs`.

**Spec:** [`docs/superpowers/research/2026-11-17-location-verdicts/README.md`](../research/2026-11-17-location-verdicts/README.md). Read its "Owner decisions" table and "Names shared across the plans" before the first task. This plan covers Finding 3, Finding 6, the documentation line about the CLI and batch paths, and the pod steps under "After plan 2 is deployed".

**Order:** Plan 2 of 4. It lands after plan 1 and needs three things from it, all in `providers/_country.mjs`: `locationVerdict(gate, location, title = '', offer = {})` returning `{ tier: 'fit' | 'review' | 'elsewhere', reason: string }`, `LOCATION_TIERS`, and the optional policy key `home_states` (a list of US state names or USPS codes; an entry that is no state throws `workplace_policy.home_states: "<entry>" is not a US state name or code`). Plans 3 and 4 land after this one.

**What plan 1 returns.** Plan 1 was revised after its own review. This plan's tests rest on these rows of that revision:

- `onsite_in_home_state`, tier `review`, is an on-site place in a home state that is not in the home area. `Kennesaw, GA` with Georgia as a home state is the example.
- With no home state set, `Remote - Georgia`, `Remote, Georgia` and `Georgia (Remote)` are `review` with reason `remote_scoped_to_other_state`. With Georgia set they are `fit`.
- `Remote, CA, USA`, `Remote - IL, USA` and `Remote, CO, US` are `review`.
- `Multiple US Locations`, `US - Multiple`, `Various Locations`, `Nationwide` and `Location TBD` are `review` with reason `location_names_no_place`.

## How this plan was checked

One session wrote this plan on 2026-11-17 by reading the code at `c4b20ee5`. A second session reconciled it with the other three plans the same day and added Tasks 1 and 2. An independent reviewer then read it against the code and ran scratch scripts, and a fourth session checked each of the reviewer's findings against the code and revised the plan. Line numbers are from `c4b20ee5`. Where a task edits a file an earlier task changed, it locates the edit by symbol or quoted text.

Verified by reading or running:

- Every file, symbol and prop named below exists at `c4b20ee5`, except the ones a task creates and the plan 1 exports.
- `job.held` has one reader, `web/src/components/inbox/triage-row.tsx:97`. `markHeld` has one caller, `web/src/app/pipeline/page.tsx:40`. `HELD_REASON` is read only by `web/tests/lib/inbox-held.test.mjs`.
- The freshness segment (`facet-chips.tsx:70-84`) is plain `useState` in `InboxTriage`. So are the source, seniority, location and keyword filters. None persists. Only the shortlist and the skipped rows are in `localStorage`.
- `filtered` (`inbox-triage.tsx:177-190`) feeds `ordered`, then `visible`. "Select all", "Skip selected" and Shift+X all read `visible`, and an effect drops a checked row that leaves it (`inbox-triage.tsx:202-204`).
- The Explore URL codec joins every list with a comma and splits on it (`web/src/lib/explore.ts:183-200`). The scheduled-scan form never uses that codec.
- A scratch script ran `buildLocationFilter({ allow: ['Remote, US', 'Atlanta'] })` from `scan.mjs`. It admits `Remote, US` and rejects `Remote - US` and `Berlin`, so a comma keyword works at scan time.
- The same script ran today's gate with the browser fixture's hold (Springfield, United States). `Springfield` is `onsite_location_allowed`, `Metropolis, NY` is `onsite_outside_allowed_locations`, `Remote` is `remote_eligibility_unconfirmed`, blank is `location_unknown`, `Remote, Canada` is `remote_country_restricted`.
- The three other inbox browser suites (`inbox-keys`, `inbox-undo`, `evaluation-options`) use the `inbox-undo` fixture, which has no `scheduled-jobs.json`. With no hold they get no verdict and no segment.
- The reconciling session read the three callers of the hold. `heldForLocation` has two, `web/scripts/scheduled-jobs-runner.mjs:722` and `web/scripts/evaluate-drain.mjs:99`, and both read the last `added` scan-history row. `holdPolicy` has those two and `holdPolicyProblem`.

The reviewer and the revising session verified, each by a run or a read at `c4b20ee5`:

- **Worldwide regions.** With `remote_regions: ['worldwide', 'global']` in the hold's policy, today's gate admits `Remote - Global (APAC)`, `Remote (Global) - LATAM`, `Remote - EMEA, Global`, `Remote, Europe (Global team)`, `Global HQ - Remote` and `London (Remote - Global)` (reviewer; the revising session re-ran three of the six). So the hold passes no regions. Without them, `Remote, Global`, `Home based - Worldwide` and `Remote - Worldwide` are `remote_eligibility_unconfirmed` and `Remote, Global - Canada` is `remote_country_restricted` (re-run).
- **A merged chip drops postings.** `buildLocationFilter({ allow: ['Atlanta, Alpharetta, Marietta'] })` rejects `Atlanta, GA` and `Marietta, GA` (re-run). So a pasted list still splits at commas.
- **The suite runner takes one name.** `web/tests/browser-suites.mjs:210-211` reads `process.argv[2]` as a substring and ignores later arguments. Each of the six suite names this plan runs matches one suite only.
- **"New scan" is always there.** The button is in the page header (`web/src/components/scheduled-jobs-view.tsx:166-173`), outside the empty state.
- **Releases.** `release-please-config.json` has two packages. The root package excludes only `web`, and every `feat` commit here also edits `.claude/skills/upstream-review/SKILL.md`. This was read from the config and not dry-run.
- **Hidden text.** No inbox component uses `sr-only` today. The app's other components do, for example `web/src/components/foot-section.tsx:32`.
- **A `null` hold.** `buildWorkplacePolicy` with both lists undefined throws `workplace_policy requires onsite_locations and remote_countries lists` (re-run).
- **The capped list.** "See all N in inbox" reads `ordered.length` (`inbox-triage.tsx:506-512`), and the list is capped only while no facet is active (`:197`).

Not verified:

- Plan 1 is not merged. `locationVerdict`, `LOCATION_TIERS` and `home_states` do not exist at `c4b20ee5`. Every tier a test here expects comes from plan 1's rules and the rows under "What plan 1 returns", not from a run.
- No test in this plan was run. No browser suite ran. Each task's first run is its Step 2.
- That Playwright reads the badge's `textContent` with the hidden reason joined to the label as Task 4a's test expects.
- That the synthetic `paste` event in Task 6's browser test reaches React's `onPaste` with its clipboard text. If it does not, drive the paste another way and keep the three assertions.
- Badge contrast in both themes. The tones used are existing `Badge` tones.

## Global Constraints

Every rule in `.claude/rules/dev-workflow.md` applies. These are the ones a task here can break, and the ones this plan adds.

- **Plan 1 must be on `main` first.** From the repo root run `grep -c "export function locationVerdict\|export const LOCATION_TIERS" providers/_country.mjs`. It must print `2`. If it does not, stop.
- Work in a sibling worktree, `../career-ops-inbox-verdicts`, on branch `feat/inbox-location-verdicts` cut from `main`. Give the worktree its own `web/node_modules` with `cp -c -R ../career-ops/web/node_modules web/node_modules`. A symlink breaks the build.
- Do not redefine `locationVerdict` or `LOCATION_TIERS`. Do not edit `providers/_country.mjs` or `lib/evaluate-queue.mjs`. The ledger reason stays `held-location`.
- A test here that expects a tier plan 1 does not return means plan 1 differs from the spec. Stop and report it. Do not change the expectation.
- The Inbox labels are "Fit", "Review location", "Elsewhere" and "All". Never use the word "hidden" for a tier. It already means skipped rows (`career-ops:hidden`).
- Scoring a row that is not `fit` is never blocked and never disabled.
- One commit per task. Merged, the `feat` commits release one web minor and one career-ops minor. Each one edits files under `web/` and the deviations table, which is outside `web/`, so release-please counts it for both packages.
- A new test is its own file under `web/tests/lib/`. Logic under test lives in a plain `.mjs` module, not in a component (`web/AGENTS.md`). A test writes only to a temp directory.
- Run one web unit test from `web/` with `node --experimental-strip-types --import=./tests/helpers/saved-settings-off.mjs --test tests/lib/<file>`. This plan calls that "the unit command".
- Run one browser suite from `web/` with `npm run build && node tests/browser-suites.mjs location-hold`. The runner starts the built app, so build after every source edit. This plan calls that "the browser command".
- The runner reads one suite name and ignores the rest. Run several suites with a loop, from `web/`, after one build: `for s in location-hold inbox-keys; do node tests/browser-suites.mjs "$s" || { echo "FAILED: $s"; break; }; done`. This plan calls that "the browser loop" and names the suites each time. Expected: no `FAILED` line.
- `npm run typecheck` in `web/` can report a stale error in an untouched file on the first run after an edit. Rerun it once.
- Every file a task adds or edits under `web/` or `docs/` must be named, by full path in backticks, in the deviations table of `.claude/skills/upstream-review/SKILL.md`, in the same commit. Use the row that opens "no location hold: `queueCandidates` queues every ranked row" unless a task names another. `tests/fork-deviations-covered.test.mjs` reads `HEAD`, so run `node --test tests/fork-deviations-covered.test.mjs` after each commit.
- After `git add` in a task that adds a file, `node validate-system-paths-coverage.mjs` must print `OK`.

## Decisions

The coordinator made these and reported them to the owner. They are rows in the spec's "Owner decisions" table.

- The automatic hold evaluates a row only when its verdict is `fit`. `Remote, TN` is `review` and is held.
- The hold has an optional "Home states" list, stored as `evaluate.hold.homeStates`.
- `holdPolicy` passes no `remote_regions`. This replaces the spec's "Worldwide remote" row. `Remote, Global` and `Home based - Worldwide` are `review` with reason `remote_eligibility_unconfirmed`, so they are held and stay one click away. See "Offered, not built".
- `markHeld`, `InboxJob.held`, `HELD_REASON` and the "Held: location" badge are deleted. The ledger still records `held-location`.
- The Inbox reads the hold of every job that is not deleted, whatever its mode and whether it is paused.
- In the Inbox, a hold that cannot be built is left out, the rest still judge, and the page shows the reason in its existing alert line. With no hold that builds there is no verdict and no filter. For such a hold the rank pass and the drain keep their rule. Nothing is queued and nothing is evaluated.

This plan made these. The owner can overrule any of them. Each names the other choice.

| # | Decision | Why | The other choice |
| --- | --- | --- | --- |
| P1 | Each reader keeps its location source. The Inbox reads the pipeline row's location and role. The hold reads the last `added` scan-history row (`evaluate-candidates.mjs:105-106`). | It is the smaller change, and a row added by hand has no history row and still gets an Inbox verdict. See "Known limits". | Load scan history on the pipeline page and judge from it. |
| P2 | The tier is not saved. Each visit opens on Fit. | No sibling filter is saved. Counts on the segment show what the other tiers hold. | Save it in `localStorage`. |
| P3 | The Score confirm states the count and the reasons. It offers no "Score only the N fit". | See "Offered, not built". | Add the button. |
| P4 | A typed comma stays inside a chip in the four location lists of the scheduled-scan form only. A paste there still splits at commas. Home area, Remote from and Home states still split on a comma. Explore is unchanged. | Those three want bare names, and the Home area help text says a comma starts a new entry (`create-job-modal.tsx:227`). Explore's URL codec splits on commas. A pasted list kept as one chip matches no posting. | Apply it to the hold fields too. |
| P5 | The pipeline tab count still counts every pending row. | It is the count the header and the tracker tabs already agree on. | Count fit rows only. |
| P6 | The order of rows does not change. A row that is not `fit` keeps its place under "All". | `compareInboxJobs` is the one order point. | Sort by tier first. |
| P7 | A row the ledger already holds is not weighed again when the hold changes. | `queueCandidates` works this way today and `docs/AUTOMATION.md` says so. The row is in the Inbox with its rank and its new verdict. | A pass that queues `held-location` rows whose verdict is now `fit`. |

## Known limits

- **Two location strings.** The scanner writes `offer.location` to scan history as it is, and to `pipeline.md` with `|` rewritten to `/` and `[`, `]` and `\` escaped (`sanitizeMarkdownField`, `scan.mjs:3382`). A location that uses a bar between places can get a different verdict in the Inbox than in the hold.
- **The union.** The Inbox takes the best verdict across every job's hold. The hold uses its own job's. A row one job held can be a fit in the Inbox when another job's hold admits it.
- **Rows held before this plan.** See P7. After the owner adds a home state, a `Remote, GA` row an earlier pass held shows under Fit and is not queued.
- **The gap between the deploy and the home state.** Today's hold evaluates `Remote, GA`. Once this plan is deployed and until Georgia is a home state, that row is `review`, so a scheduled run holds it, and by P7 it is never queued again. The owner sets the home state before the next scheduled run, or pauses the automatic jobs until it is set. See "After this is deployed". A row held in the gap is still in the Inbox under Fit once the state is set, and is scored by hand.
- **Location and title only.** Neither the hold nor the Inbox passes a posting's description or metadata. A `Remote - United States` posting whose text limits it to another country is a fit here. The badge tooltip says what was read.
- **Worldwide remote is held.** `Remote, Global` and `Home based - Worldwide` are `review`. They show under Review location and are not auto-evaluated.
- **The segment needs a matching row.** `tierCounts` is `null` when no row that passes the other filters has a verdict. A keyword that matches nothing removes the segment until the filter is cleared.

## Review Focus

Each line names an input the spec is silent on, what a person would expect, and the task whose test pins it.

1. A stored hold the gate refuses (a store edited by hand, an unknown country, `null`). The Inbox lists every row, judges with the holds that build, and names the scan whose hold it left out. Task 3, `loadHoldVerdicts builds one verdict per hold and names the scan whose hold it cannot build`.
2. A hold stored before this plan, which has no `homeStates`. It still builds, and state-limited rows are `review`. Task 1, `holdPolicy is the gate's policy shape` and `holdVerdict judges with the hold's home states`.
3. A row queued before this plan whose verdict is now `review`. The drain holds it when its turn comes. Task 2, `a queued remote role scoped to another state or open worldwide is held at the drain`.
4. The Inbox opens on Fit and no row fits, or a `?added=` link opens a date whose rows are all in other tiers. The empty state says how many rows sit under each other tier. Task 4b, `tierEmptyState names the tiers that hold the rows`.
5. A reason code this plan has no sentence for, because the gate gained one later. The badge still shows, with a general sentence. Task 3, `a reason with no sentence gets the general one`.

---

### Task 1: The hold's policy, its home states and one verdict builder

**Files:**
- Modify: `web/src/lib/scheduled-job-input.mjs:26-40` (`holdPolicy`, `scheduledHold`, two new exports)
- Modify: `web/src/lib/evaluate-settings.mjs:24-37` (`evaluateBody`) and `:89-95` (`evaluateForm`)
- Modify: `web/src/lib/scheduled-jobs.ts:25` (the `hold` type)
- Modify: `web/src/lib/core/workplace-policy.mjs:47` (the message in `holdPolicyProblem`)
- Modify: `web/src/components/scheduled-scans/create-job-modal.tsx:187` (`EvaluateForm`) and `:223-233` (the hold fields)
- Test: `web/tests/lib/evaluate-hold-settings.test.mjs`, `web/tests/fixtures/location-hold.mjs`, `web/tests/lib/location-hold.browser.test.mjs`

**Interfaces:**
- Consumes from plan 1: the policy key `home_states` and `locationVerdict`, as the header states them.
- Produces, in `scheduled-job-input.mjs`:
  - `holdPolicy(hold)` returns `{ onsite_locations: hold.onsiteLocations, remote_countries: hold.remoteCountries, home_states: hold.homeStates ?? [] }`. It passes no `remote_regions`.
  - `export function holdVerdict(core, hold): (location: string, title: string) => { tier, reason }`. `core` is any object with `buildWorkplacePolicy` and `locationVerdict`, in practice the `providers/_country.mjs` module. It builds `core.buildWorkplacePolicy(holdPolicy(hold ?? {}))` once and returns `(location, title) => core.locationVerdict(gate, location, title)`. It throws what the gate throws.
  - The stored hold is `{ onsiteLocations: string[], remoteCountries: string[], homeStates?: string[] }`. `homeStates` is cleaned with `cleanChips` and stored only when it is not empty.
- Produces, elsewhere: `EvaluateForm.holdStates: string[]`. `evaluateForm(stored).holdStates` is `chipList(stored?.hold?.homeStates)`. The `hold` type in `scheduled-jobs.ts` gains `homeStates?: string[]`.

**Rules for `scheduledHold`.** An absent `homeStates` changes nothing. A `homeStates` that is not an array, or whose entries all clean away, throws "Invalid location hold." Home states with both other lists empty throw "A location hold needs both a home area and a remote country." The web layer does not check that an entry is a state. The gate does, through `holdPolicyProblem`, as it does for a country.

**Rules for `evaluateBody`.** The hold it sends carries `homeStates` when `form.holdStates` is not empty. All three lists empty send `hold: null`. A stored `homeStates` that is present and not a list of strings makes the stored hold unreadable, by the rule the two other lists already follow.

**Exact copy.**

- Field label and `ariaLabel`: "Home states". Placeholder: "Georgia…". It sits after Remote from, in the same grid, and splits on a comma like its neighbours.
- Help text: "Optional. US states you count as home, by name or code. A remote posting limited to one of them is auto-evaluated. With none, a remote posting limited to any one state is held."
- The line above the hold fields (`create-job-modal.tsx:222`), "Leave both empty to auto-evaluate every location.", becomes "Leave all three empty to auto-evaluate every location."
- `holdPolicyProblem` turns a message that starts `workplace_policy.home_states` into `"Home states" must name US states, such as Georgia or GA.`

- [ ] **Step 1: Write the failing tests.** In `web/tests/lib/evaluate-hold-settings.test.mjs`, import `holdVerdict` and `pathToFileURL`, replace the test `holdPolicy is the gate's policy shape`, and append the rest:

```js
const STATES = { ...HOLD, homeStates: ["Georgia"] };

test("holdPolicy is the gate's policy shape", () => {
  assert.deepEqual(holdPolicy(HOLD), { onsite_locations: ["Springfield"], remote_countries: ["United States"], home_states: [] });
  assert.deepEqual(holdPolicy(STATES).home_states, ["Georgia"]);
});
test("home states are optional, cleaned and stored only when given", () => {
  assert.deepEqual(scheduledEvaluate({ mode: "auto", hold: { ...HOLD, homeStates: [" Georgia ", "georgia"] } }, undefined).hold, STATES);
  assert.equal("homeStates" in scheduledEvaluate({ mode: "auto", hold: { ...HOLD, homeStates: [] } }, undefined).hold, false);
  assert.equal("homeStates" in base.hold, false);
});
test("home states that are not a list, clean away, or stand alone are refused", () => {
  for (const homeStates of ["Georgia", ["!!!"], [5]]) assert.throws(() => scheduledEvaluate({ mode: "auto", hold: { ...HOLD, homeStates } }, base), { message: "Invalid location hold." });
  assert.throws(() => scheduledEvaluate({ mode: "auto", hold: { onsiteLocations: [], remoteCountries: [], homeStates: ["Georgia"] } }, base), { message: "A location hold needs both a home area and a remote country." });
});
test("the form shows, sends and clears home states", () => {
  const stored = scheduledEvaluate({ mode: "auto", hold: STATES }, undefined);
  assert.deepEqual(evaluateForm(stored).holdStates, ["Georgia"]);
  assert.deepEqual(evaluateForm().holdStates, []);
  assert.deepEqual(evaluateBody(evaluateForm(stored), stored).hold, STATES);
  assert.deepEqual(evaluateBody({ ...evaluateForm(stored), holdStates: [] }, stored).hold, HOLD);
  assert.equal(evaluateBody({ ...evaluateForm(stored), holdOnsite: [], holdRemote: [], holdStates: [] }, stored).hold, null);
});
test("holdPolicyProblem names a home state the gate does not know", async () => {
  assert.equal(await holdPolicyProblem({ ...HOLD, homeStates: ["Ontario"] }, CODE_ROOT), '"Home states" must name US states, such as Georgia or GA.');
  assert.equal(await holdPolicyProblem(STATES, CODE_ROOT), null);
});
test("holdVerdict judges with the hold's home states", async () => {
  const core = await import(pathToFileURL(path.join(CODE_ROOT, "providers", "_country.mjs")).href);
  const tiers = (judge, ...locations) => locations.map((location) => judge(location, "Engineer").tier);
  const home = holdVerdict(core, STATES);
  const none = holdVerdict(core, HOLD);
  assert.deepEqual(tiers(home, "Remote, GA", "Remote - Georgia", "Remote, Georgia", "Georgia (Remote)", "Remote, TN", "Georgia, USA", "Kennesaw, GA", "Remote, Global - Canada"),
    ["fit", "fit", "fit", "fit", "review", "review", "review", "elsewhere"]);
  assert.equal(home("Kennesaw, GA", "Engineer").reason, "onsite_in_home_state");
  for (const location of ["Remote, GA", "Remote - Georgia", "Remote, Georgia", "Georgia (Remote)", "Georgia, USA", "Remote, CA, USA", "Remote - IL, USA", "Remote, CO, US"]) assert.equal(none(location, "Engineer").tier, "review", location);
  assert.equal(none("Remote - Georgia", "Engineer").reason, "remote_scoped_to_other_state");
  // The hold passes no worldwide regions, so these wait for a person.
  for (const location of ["Remote, Global", "Home based - Worldwide"]) assert.deepEqual(none(location, "Engineer"), { tier: "review", reason: "remote_eligibility_unconfirmed" }, location);
  assert.throws(() => holdVerdict(core, null), /requires onsite_locations and remote_countries/);
});
```

In `web/tests/fixtures/location-hold.mjs`, the job's hold gains `homeStates: ["Illinois"]`. In `web/tests/lib/location-hold.browser.test.mjs`, after the line that waits for `Remove United States`, add:

```js
await dialog.getByText("Home states", { exact: true }).waitFor();
await dialog.getByRole("button", { name: "Remove Illinois" }).waitFor();
```

- [ ] **Step 2: Run them and see them fail.** Run the unit command with `tests/lib/evaluate-hold-settings.test.mjs`. Expected: FAIL at import, `holdVerdict` is not exported. Run from `web/`: `npm run build && node tests/browser-suites.mjs location-hold`. Expected: FAIL, no "Home states" text.

- [ ] **Step 3: Build it.** Follow the Interfaces block, the two rule paragraphs and the copy above.

- [ ] **Step 4: Run and see them pass.** Run from `web/`: `npm run typecheck`, the unit command with `tests/lib/evaluate-hold-settings.test.mjs tests/lib/scheduled-job-store-hold-groups.test.mjs tests/lib/scheduled-location-hold.test.mjs tests/lib/evaluate-drain.test.mjs`, then the browser command. Expected: PASS. The last two unit suites prove the rank pass and the drain still build a hold through the new `holdPolicy`.

- [ ] **Step 5: Commit.** Name every file this task edits in the deviations row, with one sentence: the hold stores optional `homeStates`, and `holdPolicy` passes them as `home_states`.

Run: `git add web/src web/tests .claude/skills/upstream-review/SKILL.md && git commit -m "feat(scheduled-scans): add home states to the location hold" && node --test tests/fork-deviations-covered.test.mjs`

---

### Task 2: The automatic hold reads the verdict

Today the rank pass and the drain hold a row when the gate says it is not eligible. The gate says `Remote, TN` is eligible, so that row is evaluated while the Inbox calls it `review`. After this task both read one verdict.

**Files:**
- Modify: `web/src/lib/core/evaluate-candidates.mjs:93-108` (`heldForLocation` and its comment)
- Modify: `web/scripts/scheduled-jobs-runner.mjs:28` (import) and `:721-722`
- Modify: `web/scripts/evaluate-drain.mjs:16` and `:28` (imports), `:94-99` (`locationHold`)
- Test: `web/tests/lib/evaluate-held.test.mjs`, `web/tests/lib/scheduled-location-hold.test.mjs`, `web/tests/lib/evaluate-drain.test.mjs`

**Interfaces:**
- Consumes: `holdVerdict(core, hold)` from Task 1.
- Produces: `heldForLocation({ rows, scanHistoryRows, added = addedHistory(scanHistoryRows), verdict }): Set<string>`. `verdict` is `(location: string, title: string) => { tier: string }`. A row is held when `verdict(seen?.location || "", seen?.title || "").tier !== "fit"`. The `gate` parameter is gone.

**Behaviour to build.**

- Runner, inside the existing `try`: `held = heldForLocation({ rows, scanHistoryRows, verdict: holdVerdict(await import("../../providers/_country.mjs"), job.evaluate.hold) })`.
- Drain, in `locationHold`: build `holdVerdict({ buildWorkplacePolicy, locationVerdict }, job.evaluate.hold)` where the gate is built today, and pass it as `verdict`. Import `locationVerdict` beside `buildWorkplacePolicy`.
- Both keep reading the last `added` scan-history row (decision P1). The ledger reason stays `held-location`. A hold that cannot be built still queues and evaluates nothing, with today's messages.

- [ ] **Step 1: Write the failing tests.** In `web/tests/lib/evaluate-held.test.mjs`, the stub becomes a verdict, every `gate` argument becomes `verdict`, and the last test's stub returns `{ tier: "fit" }`. Add one test:

```js
const verdict = (location) => ({ tier: /remote, united states|springfield/i.test(location) ? "fit" : "elsewhere" });

test("a review row is held like an elsewhere row", () => {
  const judge = (location) => ({ tier: { "Remote, United States": "fit", "Metropolis, NY": "elsewhere" }[location] ?? "review" });
  assert.deepEqual([...heldForLocation({ rows: urls("a", "b", "c"), scanHistoryRows: history, verdict: judge })], ["https://example.com/b", "https://example.com/c"]);
});
```

In `web/tests/lib/scheduled-location-hold.test.mjs`, give `withRoot` a fourth parameter, `named = ROWS`, used where the body reads `Object.entries(ROWS)`. Add:

```js
test("a remote role in another state, a country-only row and worldwide remote are held", async () => {
  await withRoot({ ...AUTO, hold: HOLD }, ({ root, run }) => {
    assert.deepEqual(ledgerStates(root), { state: "skipped:held-location", country: "skipped:held-location", global: "skipped:held-location", remote: "queued" });
    assert.equal(run.autoQueued, 1);
  }, [], { state: "Remote, TN", country: "United States", global: "Remote, Global", remote: "Remote, United States" });
});
```

In `web/tests/lib/evaluate-drain.test.mjs`, after the test `each job's hold is its own: a job with none evaluates what another job's hold keeps back`, add:

```js
test("a queued remote role scoped to another state or open worldwide is held at the drain", async (t) => {
  const { root, drain, state, posts } = await withDrainRoot(t, { urls: [url(1), url(2), url(3)], evaluate: { ...AUTO, hold: HOLD } });
  historyOf(root, [[url(1), "Remote, TN"], [url(2), "Remote, United States"], [url(3), "Remote, Global"]]);
  await drain();
  assert.deepEqual(posts.map((post) => post.body.input), [url(2)]);
  assert.deepEqual([state(url(1)).reason, state(url(2)).state, state(url(3)).reason], ["held-location", "evaluated", "held-location"]);
});
```

- [ ] **Step 2: Run them and see them fail.** Run the unit command with the three files. Expected: `evaluate-held` fails because the function still calls `gate`. In the other two, the new tests fail because `Remote, TN` is queued or evaluated. `Remote, Global` is held before and after this task.

- [ ] **Step 3: Change `heldForLocation` and its two callers**

- [ ] **Step 4: Run and see them pass.** Run the unit command with the three files, then from the repo root `node --test tests/evaluate-queue-held.test.mjs`. Expected: PASS, every test. The existing rows keep their states: `Remote, United States` and `Springfield, IL` are `fit`, `Metropolis, NY` is `elsewhere`, blank is `review`.

- [ ] **Step 5: Commit.** Add one sentence to the deviations row: the hold holds every row whose `locationVerdict` tier is not `fit` (`holdVerdict`, `heldForLocation`).

Run: `git add web/src/lib/core/evaluate-candidates.mjs web/scripts web/tests/lib .claude/skills/upstream-review/SKILL.md && git commit -m "feat(scheduled-scans): hold automatic evaluation on the location verdict" && node --test tests/fork-deviations-covered.test.mjs`

---

### Task 3: The Inbox verdict, pure and loaded from the holds

**Files:**
- Create: `web/src/lib/inbox-verdict.mjs`
- Modify: `web/src/lib/inbox-pending.mjs` (add `markVerdicts` after `markGated`, line 66)
- Modify: `web/src/lib/scheduled-job-input.mjs` (add `storedHolds` after `holdVerdict`)
- Modify: `web/src/lib/core/workplace-policy.mjs:9-12` (the core import) and the end of the file
- Test: `web/tests/lib/inbox-verdict.test.mjs`

**Interfaces:**
- Consumes: `LOCATION_TIERS` from plan 1. `holdVerdict` from Task 1.
- Produces, in `inbox-verdict.mjs`:
  - `VERDICT_TIERS: ['fit', 'review', 'elsewhere']`, a mirror of `LOCATION_TIERS` behind a parity test. Client code cannot import `providers/`.
  - `bestVerdict(verdicts: Verdict[]): Verdict | undefined`. The verdict whose tier comes first in `VERDICT_TIERS`. The first of equals wins. An empty list gives `undefined`.
  - `VERDICT_FALLBACK: string` and `VERDICT_SOURCE: string`, the two sentences below.
  - `verdictBadge(verdict: Verdict | undefined): { label: 'Review location' | 'Elsewhere', tone: 'warn' | 'muted', reason: string, title: string } | null`. `null` for `fit` and for no verdict. `reason` is the sentence for the code, or `VERDICT_FALLBACK`. `title` is `reason`, a space, then `VERDICT_SOURCE`.
- Produces, elsewhere:
  - `markVerdicts(jobs: T[], verdicts: Array<(location: string, title: string) => Verdict>): (T & { verdict?: Verdict })[]` in `inbox-pending.mjs`. It calls each function with `job.location ?? ""` and `job.role ?? ""` and sets `verdict` to `bestVerdict` of the results. With an empty `verdicts` it returns `jobs` itself. Its JSDoc types `tier` as the three-literal union, so `page.tsx` needs no cast.
  - `storedHolds(jobs): { name: string, hold: unknown }[]` in `scheduled-job-input.mjs`. One entry, with the job's `name` and its `evaluate.hold`, for every job whose `status` is not `"deleted"` and whose `evaluate.hold` is not `undefined`. A `null` hold is kept, so the loader reports it.
  - `loadHoldVerdicts(holds: { name: string, hold: unknown }[], codeRoot = resolveCodeRoot(process.cwd(), process.env)): Promise<{ verdicts: Array<(location: string, title: string) => Verdict>, problems: string[] }>` in `workplace-policy.mjs`. Each entry becomes `holdVerdict(core, entry.hold)`, where `core` is the imported `providers/_country.mjs` module. A hold that throws adds `"<name>": <the error's message>` to `problems`, with the name in double quotes. An empty `holds` imports nothing.

**Exact copy.** Label and tone come from the tier: `review` is "Review location" with tone `warn`, `elsewhere` is "Elsewhere" with tone `muted`.

| Reason code | Sentence |
| --- | --- |
| `location_unknown` | The posting gives no location. |
| `remote_eligibility_unconfirmed` | Remote, and the posting does not say from where. |
| `location_names_no_place` | The location does not name a specific place. |
| `remote_scoped_to_other_state` | Remote, limited to a US state that is not one of your home states. |
| `onsite_in_home_state` | On-site or hybrid in one of your home states, outside your home area. |
| `onsite_outside_allowed_locations` | On-site or hybrid outside your home area. |
| `onsite_country_restricted` | A place with your home area's name, in another country. |
| `remote_country_restricted` | Remote, from a country you did not list. |
| `exclusive_foreign_country` | Open only to people in another country. |
| `candidate_country_excluded` | The posting excludes your country. |
| `home_state_excluded` | The posting text says it is not open in your home state. |
| `metadata_country_restricted` | The posting's own fields limit it to another country. |
| `description_country_restricted` | The posting text limits it to another country. |
| `description_location_restricted` | The posting text requires living somewhere else. |
| `description_locality_restricted` | The posting text limits it to a narrower area. |
| `description_onsite_restricted` | The posting text requires office days somewhere else. |

Since plan 1's review fixes, `onsite_country_restricted` is tier `review`, not `elsewhere`, and its sentence must also cover a home area listed beside another place (`Atlanta, GA or London, UK`).

Since the gate follow-ups, `remote_scoped_to_other_state` also covers a bare `CA`, `CO`, `DE`, `IL` or `IN`, which may be a state or a country.

`VERDICT_FALLBACK` is "Your scheduled scans' location hold does not admit this location." `VERDICT_SOURCE` is "Judged from the row's location and title, not the posting text."

- [ ] **Step 1: Write the failing tests.** Create `web/tests/lib/inbox-verdict.test.mjs`. It imports `LOCATION_TIERS` from `../../../providers/_country.mjs`, the way `inbox-held.test.mjs` imports from `../../../lib/`. `CODE_ROOT` is built as in `evaluate-hold-settings.test.mjs:11`.

```js
const HOME = { onsiteLocations: ["Atlanta"], remoteCountries: ["United States"] };
const OTHER = { onsiteLocations: ["Berlin"], remoteCountries: ["Germany"] };
const fit = { tier: "fit", reason: "onsite_location_allowed" };
const review = { tier: "review", reason: "location_unknown" };
const elsewhere = { tier: "elsewhere", reason: "onsite_outside_allowed_locations" };

test("the web tier order is the core's", () => {
  assert.deepEqual(VERDICT_TIERS, LOCATION_TIERS);
});

test("bestVerdict keeps the best tier and the first of equals", () => {
  assert.equal(bestVerdict([elsewhere, review, fit]), fit);
  assert.equal(bestVerdict([elsewhere, review]), review);
  const first = { tier: "review", reason: "remote_eligibility_unconfirmed" };
  assert.equal(bestVerdict([first, review]), first);
  assert.equal(bestVerdict([]), undefined);
});

test("markVerdicts gives each row the best verdict of the holds, from its own location and role", () => {
  const seen = [];
  const a = (location, title) => { seen.push([location, title]); return location === "Atlanta" ? fit : elsewhere; };
  const b = (location) => (location ? elsewhere : review);
  const jobs = [{ url: "u1", location: "Atlanta", role: "Engineer" }, { url: "u2", role: "Analyst" }, { url: "u3", location: "Lyon", role: "Lead" }];
  assert.deepEqual(markVerdicts(jobs, [a, b]).map((job) => job.verdict), [fit, review, elsewhere]);
  assert.deepEqual(seen, [["Atlanta", "Engineer"], ["", "Analyst"], ["Lyon", "Lead"]]);
});

test("markVerdicts with no hold marks nothing", () => {
  const jobs = [{ url: "u1", location: "Lyon" }];
  assert.equal(markVerdicts(jobs, []), jobs);
});

test("storedHolds takes every job but a deleted one, with its name", () => {
  const job = (name, status, evaluate) => ({ name, status, evaluate });
  assert.deepEqual(storedHolds([
    job("A", "active", { mode: "auto", hold: HOME }), job("B", "paused", { mode: "review", hold: OTHER }),
    job("C", "deleted", { mode: "auto", hold: HOME }), job("D", "active", { mode: "auto" }), job("E", "active", undefined), job("F", "active", { mode: "auto", hold: null }),
  ]), [{ name: "A", hold: HOME }, { name: "B", hold: OTHER }, { name: "F", hold: null }]);
});

test("loadHoldVerdicts builds one verdict per hold and names the scan whose hold it cannot build", async () => {
  const { verdicts, problems } = await loadHoldVerdicts([
    { name: "Home", hold: HOME }, { name: "Lost city", hold: { onsiteLocations: ["Springfield"], remoteCountries: ["Atlantis"] } }, { name: "Edited", hold: null },
  ], CODE_ROOT);
  assert.equal(verdicts.length, 1);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /^"Lost city": .*remote_countries/);
  assert.match(problems[1], /^"Edited": /);
  assert.deepEqual(await loadHoldVerdicts([], CODE_ROOT), { verdicts: [], problems: [] });
});

// The spec's Finding 1 table, its verdict table and plan 1's revised rows, under a hold with no home state.
const ROWS = [
  ["", "review", "location_unknown"],
  ["Remote", "review", "remote_eligibility_unconfirmed"],
  ["Remote, Global", "review", "remote_eligibility_unconfirmed"],
  ["United States", "review", "location_names_no_place"],
  ["5 Locations", "review", "location_names_no_place"],
  ["Multiple US Locations", "review", "location_names_no_place"],
  ["Nationwide", "review", "location_names_no_place"],
  ["Location TBD", "review", "location_names_no_place"],
  ["Remote, TN", "review", "remote_scoped_to_other_state"],
  ["Remote - Georgia", "review", "remote_scoped_to_other_state"],
  ["Remote - United States", "fit", "remote_region_allowed"],
  ["Sunnyvale, CA, USA; Atlanta, GA, USA", "fit", "onsite_location_allowed"],
  ["Metropolis, NY", "elsewhere", "onsite_outside_allowed_locations"],
  ["Remote, Canada", "elsewhere", "remote_country_restricted"],
];

test("the hold reads the spec's rows as the spec does, and each reason has its own sentence", async () => {
  const { verdicts: [verdict] } = await loadHoldVerdicts([{ name: "Home", hold: HOME }], CODE_ROOT);
  for (const [location, tier, reason] of ROWS) {
    const got = verdict(location, "Engineer");
    assert.deepEqual(got, { tier, reason }, location || "(blank)");
    const badge = verdictBadge(got);
    if (tier === "fit") assert.equal(badge, null);
    else assert.notEqual(badge.reason, VERDICT_FALLBACK, reason);
  }
});

test("a row either hold admits is fit", async () => {
  const { verdicts } = await loadHoldVerdicts([{ name: "Home", hold: HOME }, { name: "Other", hold: OTHER }], CODE_ROOT);
  assert.equal(markVerdicts([{ url: "u", location: "Berlin", role: "Engineer" }], verdicts)[0].verdict.tier, "fit");
});

test("the badge names the tier and gives the reason in plain words", () => {
  assert.deepEqual(verdictBadge({ tier: "review", reason: "remote_eligibility_unconfirmed" }), {
    label: "Review location", tone: "warn", reason: "Remote, and the posting does not say from where.",
    title: "Remote, and the posting does not say from where. Judged from the row's location and title, not the posting text.",
  });
  assert.equal(verdictBadge({ tier: "review", reason: "onsite_in_home_state" }).reason, "On-site or hybrid in one of your home states, outside your home area.");
  assert.equal(verdictBadge(elsewhere).label, "Elsewhere");
  assert.equal(verdictBadge(elsewhere).tone, "muted");
  assert.equal(verdictBadge(fit), null);
  assert.equal(verdictBadge(undefined), null);
});

test("a reason with no sentence gets the general one", () => {
  assert.equal(verdictBadge({ tier: "elsewhere", reason: "a_reason_added_later" }).reason, VERDICT_FALLBACK);
});
```

- [ ] **Step 2: Run the suite and see it fail.** Run the unit command with `tests/lib/inbox-verdict.test.mjs`. Expected: FAIL. `inbox-verdict.mjs` does not exist.

- [ ] **Step 3: Write `inbox-verdict.mjs`, `markVerdicts`, `storedHolds` and `loadHoldVerdicts`.** In `workplace-policy.mjs`, change `coreGateBuilder` to return the imported module, so `holdPolicyProblem`, `loadWorkplacePolicy` and `loadHoldVerdicts` share the one dynamic import. Keep the reason sentences in one object keyed by reason code.

- [ ] **Step 4: Run the suites and see them pass.** Run the unit command with `tests/lib/inbox-verdict.test.mjs`, then with `tests/lib/evaluate-hold-settings.test.mjs tests/lib/workplace-policy-bridge.test.mjs tests/lib/inbox-pending.test.mjs`. Expected: PASS, every test.

- [ ] **Step 5: Commit.** Add `web/src/lib/inbox-verdict.mjs` and `web/tests/lib/inbox-verdict.test.mjs` to the deviations row.

Run: `git add web/src/lib/inbox-verdict.mjs web/src/lib/inbox-pending.mjs web/src/lib/scheduled-job-input.mjs web/src/lib/core/workplace-policy.mjs web/tests/lib/inbox-verdict.test.mjs .claude/skills/upstream-review/SKILL.md && node validate-system-paths-coverage.mjs && git commit -m "feat(inbox): judge every pending row against the scheduled scans' holds" && node --test tests/fork-deviations-covered.test.mjs`

---

### Task 4a: The verdict on every row, and the badge

**Files:**
- Modify: `web/src/lib/inbox-pending.mjs:68-87` (delete `HELD_REASON` and `markHeld`)
- Modify: `web/src/lib/career-ops.ts:126-127`
- Modify: `web/src/app/pipeline/page.tsx:7`, `:25`, `:39-40`, `:65`
- Modify: `web/src/components/inbox/triage-row.tsx:97`
- Delete: `web/tests/lib/inbox-held.test.mjs`
- Modify: `web/tests/fixtures/location-hold.mjs`, `web/tests/browser-suites.mjs:79`
- Test: `web/tests/lib/location-hold.browser.test.mjs`

**Interfaces:**
- Consumes: `markVerdicts`, `storedHolds`, `loadHoldVerdicts`, `verdictBadge` from Task 3. `listScheduledJobs()` from `web/src/lib/scheduled-jobs.ts:153`.
- Produces, in `career-ops.ts`: `export type LocationTier = "fit" | "review" | "elsewhere"`, `export type LocationVerdict = { tier: LocationTier; reason: string }`, and `InboxJob.verdict?: LocationVerdict` with the comment "Where the posting sits against the scheduled scans' location holds, set by markVerdicts. Absent when no scan has a hold." The `held` field and its comment go.
- Produces: the fixture's four pending rows and the helpers `row` and `badge` in the browser test. Tasks 4b, 5 and 6 and plan 4 use them.

**Exact copy.**

- The badge is a `Badge` with the verdict's `tone` and `title`. Its content is the label, then `<span className="sr-only">: {reason}</span>`. So its text is `Review location: The posting gives no location.` and a screen reader hears the reason. `sr-only` is the class the app's other components use (`web/src/components/foot-section.tsx:32`). No inbox component has hidden text today.
- Hold problem, shown in the page's existing alert line: `Location hold: <problems joined with "; ">. The Inbox judged locations without it.` Each problem is `"<scan name>": <message>`, from Task 3.

**Behaviour to build.**

- `page.tsx`: on the Inbox tab only, read `storedHolds(listScheduledJobs().jobs)` and `await loadHoldVerdicts(...)` inside one `try`. A throw becomes the problem message, as `ledgerEntries` does for the ledger. Line 40 becomes `markVerdicts(markGated(unmarked, ledger), verdicts)`. Line 65 passes the fit error and the hold problem joined by a new line, or `null`. The log text at line 25 drops "and held".
- `triage-row.tsx:97`: render `verdictBadge(job.verdict)` as the badge above. Nothing renders for `fit` or for no verdict.
- Delete `markHeld`, `HELD_REASON` and `web/tests/lib/inbox-held.test.mjs`.

- [ ] **Step 1: Change the fixture and write the failing browser test.** In `web/tests/fixtures/location-hold.mjs`, the pending section becomes these four rows. Keep the ledger row for the held URL, so the suite proves the old badge is gone. Write `.inbox-undo-fixture` and copy `pipeline-lock.mjs` and `lib/dir-lock.mjs` into the root, exactly as `web/tests/fixtures/inbox-undo.mjs:9` and `:19-22` do. Task 4b's skip needs them.

```
- [ ] https://example.com/fixture-held | Fixture Alpha | Platform Lead | Metropolis, NY | rank: 4.2/5 — fixture
- [ ] https://example.com/fixture-plain | Fixture Beta | Designer | Springfield
- [ ] https://example.com/fixture-remote | Fixture Gamma | Engineer | Remote
- [ ] https://example.com/fixture-blank | Fixture Delta | Analyst
```

In `web/tests/browser-suites.mjs:79` add `root: "LOCATION_HOLD_TEST_ROOT"` to the `location-hold` entry.

In `web/tests/lib/location-hold.browser.test.mjs`, split the existing test. Its Scheduled scans half stays, renamed `the job form shows the hold and the source groups`, from the `goto` of `/scheduled-scans` on. Its Inbox half is replaced by the test below. Use the helpers the file already has (`settled`, `liveServerSkip` with both variables). Add two helpers at file scope, each taking `page` first: `row(page, company)` is `page.locator("li:visible").filter({ hasText: company })`, and `badge(page, company)` is `row(page, company).getByTitle(/Judged from the row's location and title/)`. The code below writes them without `page` for short.

Test `every row that is not a fit says why` opens `/pipeline` and asserts:

```js
await row("Fixture Beta").waitFor();
assert.equal(await badge("Fixture Beta").count(), 0);
assert.equal(await badge("Fixture Gamma").getAttribute("title"),
  "Remote, and the posting does not say from where. Judged from the row's location and title, not the posting text.");
assert.equal(await badge("Fixture Gamma").textContent(), "Review location: Remote, and the posting does not say from where.");
assert.equal(await badge("Fixture Delta").textContent(), "Review location: The posting gives no location.");
assert.equal(await badge("Fixture Alpha").textContent(), "Elsewhere: On-site or hybrid outside your home area.");
assert.equal(await row("Fixture Alpha").getByText("est. 4.2", { exact: true }).count(), 1, "the row keeps its rank");
assert.equal(await page.getByText("Held: location").count(), 0);
assert.deepEqual(errors, []);
```

- [ ] **Step 2: Run it and see it fail.** Browser command: FAIL, Fixture Gamma has no element with that title.

- [ ] **Step 3: Build the behaviour.** Follow "Behaviour to build" and the copy above.

- [ ] **Step 4: Run everything this task touches.** Run from `web/`: `npm run typecheck`, then `npm test`, then `npm run build` and the browser loop over `location-hold inbox-keys inbox-undo evaluation-options`. Expected: PASS, with no skipped test. The last three prove an Inbox with no hold is unchanged.

- [ ] **Step 5: Commit.** In the deviations row, replace `` `web/src/lib/inbox-pending.mjs` (`markHeld`) `` with `` (`markVerdicts`) `` and drop `web/tests/lib/inbox-held.test.mjs`.

Run: `git add -A web/src web/tests .claude/skills/upstream-review/SKILL.md && git commit -m "feat(inbox): show the location verdict on every pending row" && node --test tests/fork-deviations-covered.test.mjs`

---

### Task 4b: The tier segment, its counts and the empty state

**Files:**
- Modify: `web/src/lib/inbox-verdict.mjs` (add the tier filter functions)
- Modify: `web/src/components/inbox/facet-chips.tsx:13-47` (props) and `:68-70` (the chip row)
- Modify: `web/src/components/inbox/inbox-triage.tsx:177-190`, `:196`, `:407-424`, `:499-502`, `:506-513`
- Test: `web/tests/lib/inbox-verdict.test.mjs`, `web/tests/lib/location-hold.browser.test.mjs`

**Interfaces:**
- Consumes: `InboxJob.verdict`, the fixture and the test helpers from Task 4a. `VERDICT_TIERS` from Task 3.
- Produces, in `inbox-verdict.mjs`:
  - `TIER_FILTERS: [{ id: 'fit', label: 'Fit' }, { id: 'review', label: 'Review location' }, { id: 'elsewhere', label: 'Elsewhere' }, { id: 'all', label: 'All' }]`.
  - `tierCounts(jobs): { fit: number, review: number, elsewhere: number, all: number } | null`. `null` when no job has a verdict, which means no hold.
  - `inTier(job, tier): boolean`. True when `tier` is `'all'`, when the job has no verdict, or when `job.verdict.tier === tier`. A row with no verdict is never filtered out.
  - `tierEmptyState(tier, counts): { title: string, hint: string } | null`. It reads only the `fit`, `review` and `elsewhere` counts, never `all`. `null` when `counts` is `null`, when `tier` is `'all'`, or when none of the other two of those three tiers holds a row.
- Produces, in `facet-chips.tsx`: two new props, `tiers: { active: TierFilter; counts: Record<TierFilter, number> } | null` and `setTier: (tier: TierFilter) => void`, where `TierFilter` is `LocationTier | "all"`.
- Produces, in `inbox-triage.tsx`: the lists `matched`, `counts` and `filtered` named below. Plan 4 adds a predicate to `matched`.
- **Clear returns to Fit, and non-fit rows leave the view.** Plan 4 depends on this.

**Exact copy.**

- Segment: a `role="group"` with `aria-label="Location fit"`, first in the chip row, styled as the freshness segment. One button per `TIER_FILTERS` entry, with `aria-pressed`. Its content is `{label} {count}` in one text run with a literal space between, so the accessible name is "Fit 12". Two adjacent elements with no space would read "Fit12".
- Empty state titles: "No fit roles" for `fit`, "Nothing to review" for `review`, "Nothing elsewhere" for `elsewhere`.
- Empty state hint: the other tiers among fit, review and elsewhere that hold rows, in `VERDICT_TIERS` order, as `<count> under <label>`, joined with ", " and ended with a period. Example: "2 under Review location, 1 under Elsewhere." It never names All.
- The link under a capped list (`inbox-triage.tsx:512`). When counts exist it reads `See all {ordered.length} fit roles →`. The list is capped only while no facet is active, so the active tier is Fit and the number counts fit rows. With no counts it keeps "See all {ordered.length} in inbox →".

**Behaviour to build.**

- `inbox-triage.tsx`: a `tier` state that starts `null`, meaning the default. The active tier is `tier ?? "fit"` when counts exist, and `"all"` when they do not. Split today's `filtered` in two. `matched` is today's predicate. `counts` is `tierCounts` over `matched`. `filtered` is `matched` filtered by `inTier`. Everything downstream keeps reading `filtered`.
- `anyFacet` (line 196) is also true when counts exist and the active tier is not `"fit"`. `onClear` (line 423) also sets `tier` to `null`.
- The empty state (lines 499-502) reads `tierEmptyState(activeTier, counts)` first, then `addedCopy`, then today's default.

- [ ] **Step 1: Write the failing unit tests.** Append to `web/tests/lib/inbox-verdict.test.mjs`:

```js
const rows = [{ verdict: fit }, { verdict: review }, { verdict: review }, { verdict: elsewhere }];

test("tierCounts counts each tier, and is null when no row has a verdict", () => {
  assert.deepEqual(tierCounts(rows), { fit: 1, review: 2, elsewhere: 1, all: 4 });
  assert.equal(tierCounts([{ url: "u" }]), null);
  assert.equal(tierCounts([]), null);
});

test("inTier never filters out a row with no verdict", () => {
  assert.equal(inTier({ verdict: review }, "review"), true);
  assert.equal(inTier({ verdict: review }, "fit"), false);
  assert.equal(inTier({ verdict: elsewhere }, "all"), true);
  assert.equal(inTier({}, "fit"), true);
});

test("tierEmptyState names the tiers that hold the rows", () => {
  assert.deepEqual(tierEmptyState("fit", { fit: 0, review: 2, elsewhere: 1, all: 3 }), { title: "No fit roles", hint: "2 under Review location, 1 under Elsewhere." });
  assert.deepEqual(tierEmptyState("elsewhere", { fit: 1, review: 0, elsewhere: 0, all: 1 }), { title: "Nothing elsewhere", hint: "1 under Fit." });
  assert.equal(tierEmptyState("review", { fit: 0, review: 0, elsewhere: 0, all: 0 }), null);
  assert.equal(tierEmptyState("all", { fit: 0, review: 0, elsewhere: 0, all: 0 }), null);
  assert.equal(tierEmptyState("fit", null), null);
});

test("the tier labels never say hidden", () => {
  assert.deepEqual(TIER_FILTERS.map((tier) => tier.label), ["Fit", "Review location", "Elsewhere", "All"]);
});
```

- [ ] **Step 2: Write the failing browser tests.** In `web/tests/lib/location-hold.browser.test.mjs`, add the helper `tierButton(page, name)`, which is `page.getByRole("group", { name: "Location fit" }).getByRole("button", { name, exact: true })`. The code writes it without `page` too. In Task 4a's test, add `await tierButton("All 4").click();` as the first line, because the Inbox now opens on Fit.

Test `the Inbox opens on the fit rows, and Clear returns to them` asserts:

```js
await row("Fixture Beta").waitFor();
assert.equal(await tierButton("Fit 1").getAttribute("aria-pressed"), "true");
for (const name of ["Review location 2", "Elsewhere 1", "All 4"]) assert.equal(await tierButton(name).getAttribute("aria-pressed"), "false");
for (const company of ["Fixture Alpha", "Fixture Gamma", "Fixture Delta"]) assert.equal(await row(company).count(), 0, `${company} is not a fit row`);
await page.getByRole("button", { name: "Select all 1", exact: true }).waitFor();

await tierButton("Review location 2").click();
await row("Fixture Gamma").waitFor();
await row("Fixture Delta").waitFor();
assert.equal(await row("Fixture Beta").count(), 0);

await page.getByRole("button", { name: "Clear" }).click();
assert.equal(await tierButton("Fit 1").getAttribute("aria-pressed"), "true");
assert.equal(await row("Fixture Gamma").count(), 0, "Clear returns to Fit");
assert.deepEqual(errors, []);
```

Test `Select all and Skip selected act on the tier in view` goes last in the file and stays last, because it writes. It checks the root is under `os.tmpdir()` and carries `.inbox-undo-fixture`, as `inbox-keys.browser.test.mjs:82-84` does. Then:

```js
await tierButton("Elsewhere 1").click();
await page.getByRole("button", { name: "Select all 1", exact: true }).click();
await page.getByRole("button", { name: "Skip selected", exact: true }).click();
await until(() => fs.readFileSync(pipeline, "utf8").includes("[x] https://example.com/fixture-held"));
const text = fs.readFileSync(pipeline, "utf8");
for (const kept of ["fixture-plain", "fixture-remote", "fixture-blank"]) assert.ok(text.includes(`[ ] https://example.com/${kept}`), `${kept} was skipped`);
await page.getByText("Nothing elsewhere", { exact: true }).waitFor();
await page.getByText("1 under Fit, 2 under Review location.", { exact: true }).waitFor();
```

`until` is the helper at `inbox-keys.browser.test.mjs:93-99`. Copy it into this file.

- [ ] **Step 3: Run both and see them fail.** Unit command: FAIL, `tierCounts` is not exported. Browser command: FAIL, no group named "Location fit" exists.

- [ ] **Step 4: Build the behaviour.** Follow "Behaviour to build" and the copy above. No test pins the capped-list link, because the fixture has fewer fit rows than one batch.

- [ ] **Step 5: Run everything this task touches.** Run from `web/`: `npm run typecheck`, then `npm test`, then `npm run build` and the browser loop over `location-hold inbox-keys inbox-undo evaluation-options`. Expected: PASS, with no skipped test.

- [ ] **Step 6: Commit.** Add `web/src/components/inbox/facet-chips.tsx` and `web/src/components/inbox/inbox-triage.tsx` to the deviations row.

Run: `git add web/src web/tests .claude/skills/upstream-review/SKILL.md && git commit -m "feat(inbox): filter the Inbox by location fit" && node --test tests/fork-deviations-covered.test.mjs`

---

### Task 5: The Score confirm says which rows are not a location fit

**Files:**
- Modify: `web/src/lib/inbox-verdict.mjs` (add `scoreLocationNote`)
- Modify: `web/src/components/inbox/shortlist-tray.tsx:17-35` (props) and `:47-51` (the confirming panel)
- Modify: `web/src/components/inbox/inbox-triage.tsx` (the `<ShortlistTray` element)
- Test: `web/tests/lib/inbox-verdict.test.mjs`, `web/tests/lib/location-hold.browser.test.mjs`

**Interfaces:**
- Consumes: `verdictBadge` from Task 3, `InboxJob.verdict` from Task 4a.
- Produces: `scoreLocationNote(items: { url: string }[], verdictByUrl: Map<string, Verdict>): { summary: string, reasons: string[] } | null` in `inbox-verdict.mjs`. `null` when no item is judged `review` or `elsewhere`. An item whose URL is not in the map is not counted as unfit, and still counts in the total.
- Produces: `ShortlistTray` prop `locationNote: { summary: string; reasons: string[] } | null`.

**Exact copy.** `k` is the number of items judged not fit and `n` is `items.length`.

- Summary when `n` is 1: "This role is not a location fit. You can still score it."
- Summary when `k` is 1 and `n` is more: "1 of `n` is not a location fit. You can still score it."
- Summary otherwise: "`k` of `n` are not a location fit. You can still score them."
- One reason line per distinct reason, most rows first, ties in the order of Task 3's table: `<count> · <label>: <sentence>`. Example: "1 · Elsewhere: On-site or hybrid outside your home area."

**Behaviour to build.** `InboxTriage` builds the map from `inbox` and passes `scoreLocationNote(shortlist, verdictByUrl)`. The tray renders the note at the top of the panel that opens with the confirm (`shortlist-tray.tsx:47-51`), above `EvaluationOptions`. The summary is a plain `<p>` with no `role`, and the reasons are a list under it. The note is on screen when the panel opens, so nothing has to announce it. `ConfirmScore` and its "Score `n` now" button do not change. Nothing is disabled.

- [ ] **Step 1: Write the failing unit test**

```js
test("scoreLocationNote counts only rows judged not fit", () => {
  const byUrl = new Map([["a", fit], ["b", review], ["c", elsewhere], ["d", elsewhere]]);
  const items = (...urls) => urls.map((url) => ({ url }));
  assert.equal(scoreLocationNote(items("a"), byUrl), null);
  assert.equal(scoreLocationNote(items("a", "gone"), byUrl), null);
  assert.deepEqual(scoreLocationNote(items("b"), byUrl), {
    summary: "This role is not a location fit. You can still score it.",
    reasons: ["1 · Review location: The posting gives no location."],
  });
  assert.equal(scoreLocationNote(items("a", "b", "gone"), byUrl).summary, "1 of 3 is not a location fit. You can still score it.");
  assert.deepEqual(scoreLocationNote(items("a", "b", "c", "d"), byUrl), {
    summary: "3 of 4 are not a location fit. You can still score them.",
    reasons: ["2 · Elsewhere: On-site or hybrid outside your home area.", "1 · Review location: The posting gives no location."],
  });
});
```

- [ ] **Step 2: Write the failing browser test.** Add `the Score confirm says which rows are not a location fit and still scores` to `location-hold.browser.test.mjs`, before the test that writes. It sets the CLI as `evaluation-options.browser.test.mjs:20-21` does, so the confirm shows its Score button.

```js
await page.addInitScript(() => localStorage.setItem("career-ops:config", JSON.stringify({ cliId: "fixture-cli" })));
await settled(page, () => page.goto(`${url}/pipeline`));
await tierButton("All 4").click();
for (const company of ["Fixture Alpha", "Fixture Beta", "Fixture Gamma"]) await row(company).getByTitle("Save to shortlist").click();
await page.getByRole("button", { name: /^Score 3/ }).click();
await page.getByText("2 of 3 are not a location fit. You can still score them.", { exact: true }).waitFor();
await page.getByText("1 · Review location: Remote, and the posting does not say from where.", { exact: true }).waitFor();
await page.getByText("1 · Elsewhere: On-site or hybrid outside your home area.", { exact: true }).waitFor();
assert.equal(await page.getByRole("button", { name: "Score 3 now", exact: true }).isEnabled(), true);
await page.getByRole("button", { name: "Cancel", exact: true }).click();
assert.equal(await page.getByText(/not a location fit/).count(), 0, "the note leaves with the confirm");
```

The test never presses "Score 3 now". It must not start a run.

- [ ] **Step 3: Run both and see them fail.** Unit command: FAIL, `scoreLocationNote` is not exported. Browser command: FAIL, the summary text never appears.

- [ ] **Step 4: Write `scoreLocationNote` and render the note**

- [ ] **Step 5: Run and see them pass.** Run from `web/`: `npm run typecheck`, the unit command, then `npm run build` and the browser loop over `location-hold evaluation-options`. Expected: PASS.

- [ ] **Step 6: Commit.** Add `web/src/components/inbox/shortlist-tray.tsx` to the deviations row.

Run: `git add web/src/lib/inbox-verdict.mjs web/src/components/inbox web/tests/lib .claude/skills/upstream-review/SKILL.md && git commit -m "feat(inbox): say in the Score confirm which rows are not a location fit" && node --test tests/fork-deviations-covered.test.mjs`

---

### Task 6: A comma stays inside a location chip in the scheduled-scan form

**Files:**
- Modify: `web/src/lib/clean-chips.mjs` (add two functions)
- Modify: `web/src/components/explore/filter-builder.tsx:32-97` (`KeywordField`), `:108-121` (`FilterBuilder` props), `:161-173` and `:258-267` (the four location lists)
- Modify: the `<FilterBuilder` element in `web/src/components/scheduled-scans/create-job-modal.tsx` and `edit-job-modal.tsx`
- Test: `web/tests/lib/clean-chips.test.mjs`, `web/tests/lib/location-hold.browser.test.mjs`

**Interfaces:**
- Produces, in `clean-chips.mjs`: `splitChips(text: string, keepCommas = false): string[]` and `hasChipSeparator(text: string, keepCommas = false): boolean`. The separators are comma, semicolon, new line, carriage return and tab. With `keepCommas` the comma is not one.
- Produces: `KeywordField` prop `keepCommas?: boolean`, default `false`. `FilterBuilder` prop `commaInLocations?: boolean`, default `false`, which passes `keepCommas` to City or location, Always include, Exclude locations and Never include, and to no other field.

**Behaviour to build.**

- `KeywordField` replaces its three inline patterns (`filter-builder.tsx:50`, `:71`, `:89`) with the two functions. Nothing else in it changes.
- `keepCommas` reaches two places only: the `onChange` check (`:71`) and the split inside `commit` when `commit` is called from `onChange`, Enter or blur. So a typed comma is a character, and Enter, a semicolon or leaving the field ends the entry.
- Paste ignores `keepCommas`. `onPaste` (`:89`) calls `hasChipSeparator(text)` and splits the merged text with `splitChips(merged)`, as today. So `Atlanta, Alpharetta, Marietta` pasted is three entries. One merged entry would match no posting, because `buildLocationFilter({ allow: ['Atlanta, Alpharetta, Marietta'] })` rejects `Atlanta, GA`. The cost is that a pasted `Remote, US` splits in two. Type it.
- Both job modals pass `commaInLocations`. Explore does not, so its fields and its URL keep working as today.
- With `commaInLocations`, the City or location hint reads "Enter adds a place. A typed comma stays in it. A pasted list splits at commas." in place of "matches any city, region, country, or Remote". Its placeholder reads "Toronto; New York; Remote, US…" and the Never include placeholder reads "USA; Brazil…". Without the prop both keep today's text.
- Home area, Remote from, Home states, Source groups, Roles to find and Exclude are not changed.

- [ ] **Step 1: Write the failing unit test.** Append to `web/tests/lib/clean-chips.test.mjs`:

```js
test("splitChips keeps a comma only when asked", () => {
  assert.deepEqual(cleanChips(splitChips("Remote, US; Atlanta\nAustin")), ["Remote", "US", "Atlanta", "Austin"]);
  assert.deepEqual(cleanChips(splitChips("Remote, US; Atlanta\nAustin", true)), ["Remote, US", "Atlanta", "Austin"]);
  // What a paste runs, whatever the field: a pasted list never becomes one chip.
  assert.deepEqual(cleanChips(splitChips("Atlanta, Alpharetta, Marietta")), ["Atlanta", "Alpharetta", "Marietta"]);
});

test("hasChipSeparator treats a comma as text when commas are kept", () => {
  assert.equal(hasChipSeparator("Remote,"), true);
  assert.equal(hasChipSeparator("Remote,", true), false);
  assert.equal(hasChipSeparator("Remote;", true), true);
  assert.equal(hasChipSeparator("Remote\tUS", true), true);
  assert.equal(hasChipSeparator("New York"), false);
});
```

- [ ] **Step 2: Write the failing browser test.** Add `a scheduled scan keeps a comma inside a location entry` to `location-hold.browser.test.mjs`, before the test that writes:

```js
await settled(page, () => page.goto(`${url}/scheduled-scans`));
await page.getByRole("button", { name: "New scan" }).first().click();
const dialog = page.getByRole("dialog");
const place = dialog.getByRole("textbox", { name: "City or location" });
await place.fill("Remote, US");
await place.press("Enter");
assert.equal(await dialog.getByRole("button", { name: "Remove Remote, US", exact: true }).count(), 1);
await place.evaluate((input) => {
  const clipboardData = new DataTransfer();
  clipboardData.setData("text", "Atlanta, Alpharetta, Marietta");
  input.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
});
for (const chip of ["Atlanta", "Alpharetta", "Marietta"]) assert.equal(await dialog.getByRole("button", { name: `Remove ${chip}`, exact: true }).count(), 1, `a pasted list still splits: ${chip}`);
const roles = dialog.getByRole("textbox", { name: "Roles to find" });
await roles.fill("staff engineer, platform");
await roles.press("Enter");
for (const chip of ["staff engineer", "platform"]) assert.equal(await dialog.getByRole("button", { name: `Remove ${chip}`, exact: true }).count(), 1, `a title comma still splits: ${chip}`);
await dialog.getByRole("button", { name: "Close", exact: true }).click();
```

"New scan" is in the page header whether or not a job exists (`web/src/components/scheduled-jobs-view.tsx:166-173`).

- [ ] **Step 3: Run both and see them fail.** Unit command with `tests/lib/clean-chips.test.mjs`: FAIL, `splitChips` is not exported. Browser command: FAIL, no "Remove Remote, US" button, because the entry split in two. The paste lines pass before and after. They guard the paste path.

- [ ] **Step 4: Write the two functions and the two props**

- [ ] **Step 5: Run and see them pass.** Run from `web/`: `npm run typecheck`, the unit command, then `npm run build` and the browser loop over `location-hold employer-preset accessible-names`. Expected: PASS. The last two drive Explore's and the job form's chip fields.

- [ ] **Step 6: Commit.** In the deviations table, the row that opens "`FilterBuilder` in `web/src/components/explore/filter-builder.tsx` always shows the six title and location lists" gains one sentence: an optional `commaInLocations` prop, `KeywordField`'s `keepCommas`, and `splitChips` and `hasChipSeparator` in `web/src/lib/clean-chips.mjs`, pinned by `web/tests/lib/clean-chips.test.mjs`. Name `web/src/components/scheduled-scans/edit-job-modal.tsx` there too.

Run: `git add web/src/lib/clean-chips.mjs web/src/components/explore/filter-builder.tsx web/src/components/scheduled-scans web/tests/lib .claude/skills/upstream-review/SKILL.md && git commit -m "feat(scheduled-scans): keep a comma inside a location chip" && node --test tests/fork-deviations-covered.test.mjs`

---

### Task 7: Docs, the deviations row, and the checks before the push

**Files:**
- Modify: `docs/AUTOMATION.md:298-329` (the "Location hold" section)
- Modify: `docs/WEB_UI.md:66`
- Modify: `docs/WORKPLACE_GEOGRAPHY.md:139-145`
- Modify: `.claude/skills/upstream-review/SKILL.md` (the "no location hold" row)

- [ ] **Step 1: Edit `docs/AUTOMATION.md`.** The first paragraph's last sentence, "Fill both to turn the hold on, and leave both empty to evaluate every location.", becomes "Fill both to turn the hold on." After that paragraph, add these two, word for word:

> A third field, **Home states**, is optional. List the US states you count as home, by name or code. Leave all three fields empty to evaluate every location.
>
> The location hold limits automatic evaluation only. Score in the web app, the CLI and batch runs evaluate whatever you give them.

In the bullet "**What is held.**", the first two sentences become: "A ranked row at or above the threshold whose location verdict is not a fit. The verdict is `locationVerdict` in [WORKPLACE_GEOGRAPHY.md](WORKPLACE_GEOGRAPHY.md), given the location and title from the row's scan history." Replace everything from "When **Remote from** includes the United States" to the end of the bullet with:

> A remote posting limited to a US state is held unless that state is one of the job's **Home states**. `Remote, TN` is held, and `Remote, GA` and `Remote - Georgia` are evaluated when Georgia is a home state. With no home state set, every remote posting limited to one state is held. So is a posting that names no specific place (`United States`, `5 Locations`, `Multiple US Locations`, `Nationwide`), an on-site posting in a home state outside the home area (`Kennesaw, GA`), and a posting open worldwide (`Remote, Global`, `Home based - Worldwide`). [WORKPLACE_GEOGRAPHY.md](WORKPLACE_GEOGRAPHY.md) says how a state code that is also a country code is read.

Replace the bullet "**A held row is not dropped.**" with:

> - **A held row is not dropped.** It stays in the Inbox with its rank, and the ledger records it as `skipped` with the reason `held-location`. Evaluate it from the Inbox when you want it.
> - **The Inbox judges every pending row with the same verdict.** A row that any scan's hold admits is a fit. Each other row carries a **Review location** or **Elsewhere** badge, and the badge's tooltip gives the reason. The Inbox opens on the fit rows. The **Review location**, **Elsewhere** and **All** buttons show the rest. The Inbox takes the best verdict across every scan's hold, paused scans included, so a row one scan held can be a fit under another scan's hold. Pressing Score on a row that is not a fit is never blocked. The confirm says how many of the rows are not a fit and why.

- [ ] **Step 2: Edit `docs/WEB_UI.md` and `docs/WORKPLACE_GEOGRAPHY.md`.** In `docs/WEB_UI.md:66`, "the form shows **Home area** and **Remote from**. With both filled" becomes "the form shows **Home area**, **Remote from** and the optional **Home states**. With the first two filled". "Leave both empty to evaluate every location." becomes "Leave all three empty to evaluate every location." "they stay in the Inbox with their rank and a **Held: location** badge" becomes "they stay in the Inbox with their rank". Add after that paragraph:

> When any scheduled scan has a hold, the Inbox opens on the rows whose location fits it and adds four buttons: **Fit**, **Review location**, **Elsewhere** and **All**, each with its count. "Select all" and Shift+X act on the rows in view. In a scheduled scan's four location lists, Enter adds an entry and a typed comma stays inside it, so `Remote, US` typed is one entry. A pasted list still splits at each comma. Home area, Remote from and Home states start a new entry at a comma, typed or pasted.

In `docs/WORKPLACE_GEOGRAPHY.md`, "ranked and marked **Held: location**" becomes "ranked and marked **Review location** or **Elsewhere**". "The hold has its own two lists (home area and remote countries)" becomes "The hold has its own lists (home area, remote countries and optional home states), lists no remote regions, holds every posting whose `locationVerdict` is not `fit`,".

- [ ] **Step 3: Finish the deviations row.** In the "no location hold" row, the second cell ends with one new sentence: the Inbox gives every pending row a `verdict` from the union of the jobs' holds (`storedHolds`, `loadHoldVerdicts`, `markVerdicts`, `web/src/lib/inbox-verdict.mjs`), shows it as a badge, a tier segment and a note in the Score confirm, and no longer reads `held-location`. The fourth cell names `web/tests/lib/inbox-verdict.test.mjs` among the pins. Check that every file a task's Files block names is in the row or in the `FilterBuilder` row.

- [ ] **Step 4: Check no stale wording is left.** Run from the repo root: `grep -rn "Held: location\|markHeld\|HELD_REASON" web/src web/tests docs/*.md .claude/skills/upstream-review/SKILL.md`. Expected: one line, the assertion in `web/tests/lib/location-hold.browser.test.mjs` that no "Held: location" text is on the page.

- [ ] **Step 5: Commit.** Run: `git add docs/AUTOMATION.md docs/WEB_UI.md docs/WORKPLACE_GEOGRAPHY.md .claude/skills/upstream-review/SKILL.md && git commit -m "docs(inbox): describe the Inbox location verdict and what the hold limits" && node --test tests/fork-deviations-covered.test.mjs`

- [ ] **Step 6: Run the checks the push needs.** Run from the repo root: `npm run lint`, then `node test-all.mjs --quick`. If `npm run lint` exits 2 and prints no error, run `node scripts/check-syntax.mjs` and trust its result. Run from `web/`: `npm run typecheck`, `npm test`, then `npm run build && npm run test:browser`. That is every browser suite, not only the ones this plan touches. Expected: all pass, and the browser runner reports no skipped test.

- [ ] **Step 7: Review, then push once.** Run the four pr-review-toolkit reviewers on the unpushed branch and fix what they confirm. Then run `node .githooks/coderabbit-review.mjs` as its own command, never chained with the push. Fix confirmed major findings for at most two passes, then decline the rest with `--decline "<reason>"`. Ask the owner once for the push and the pull request. The PR body opens its `## Why` with the owner's goal, lists "Known limits" and the findings below major that were not fixed, and states that no personal data was added and `node test-all.mjs` passed. Merging needs the owner's explicit approval in the session.

## Offered, not built

- **"Score only the N fit" in the confirm.** This plan states the count and the reasons, and leaves the choice of rows with the owner. Adding it later is one button in the confirming panel that calls `onRemove` for each row that is not a fit.
- **Worldwide remote as a fit.** An exact-match rule that upgrades a location made only of a remote word plus `worldwide`, `global` or `anywhere`, such as `Remote, Global`. Listing `global` as a remote region was tried and dropped, because it also admits `Remote - Global (APAC)` and `London (Remote - Global)`. Until the rule exists these rows are `review`.
- **Queueing rows an earlier pass held.** See decision P7. It would be a pass like the one plan 4 adds for `no-api-text` rows.
- **The reason on a phone.** The reason is in the badge's tooltip, which a touch screen does not show. The confirm note does show it. A tap target on the badge is a later change.
- **A confirm on Explore and on paste-a-URL.** Neither has one today (spec, Finding 3). They stay as they are.
- **Saving the evaluation cost.** The route drops it (spec, Finding 3). Out of scope.

## After this is deployed

None of these is part of the pull request. Each one changes the pod, and each needs the owner's yes at the time it is done. Start only when the pod runs a web build that contains this plan, which the "Location fit" buttons in the Inbox confirm.

- [ ] **Owner step 1, before the next scheduled run.** Add Georgia as a home state in each job's Home states. Until then `Remote, GA` and `Remote - Georgia` are `review`, a scheduled run holds them, and a held row is never queued again ("Known limits"). If the home state cannot be set before the next run, pause the automatic jobs before the deploy and resume them once it is set.
- [ ] **Owner step 2.** In Scheduled scans, in both jobs, put `United States`, `USA` and `US` back in "City or location" and in "Always include", so scans stop dropping listings that name only the country. Type each one and press Enter. Keep the block list.
- [ ] **Owner step 3.** Add the other metro towns the owner wants to each job's Home area. Covington was missing from the hold in the replay. Home area takes the town's name without the state, one per entry. Add `ATL` if postings located `GA ATL` should read as Atlanta.
- [ ] **Owner step 4.** Leave `location_filter.workplace_policy` out of `/data/portals.yml`. Check with a read of the file. Change nothing.

After step 2 the Inbox receives the country-only rows again. They arrive under **Review location**, which is where the owner decides on them.
