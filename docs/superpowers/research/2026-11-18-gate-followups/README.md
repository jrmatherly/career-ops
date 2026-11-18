# Location gate follow-ups after PR 107

Research from 2026-11-18, run against `main` at `f9627bac` (the merge of [PR 107](https://github.com/jrmatherly/career-ops/pull/107)). It is the spec for one plan, [`2026-11-18-location-gate-followups.md`](../../plans/completed/2026-11-18-location-gate-followups.md), which lands before plan 2 of [the location-verdicts spec](../2026-11-17-location-verdicts/README.md). That spec's goal and its "Owner decisions" table still bind. This page adds to them and replaces nothing.

## Goal

The owner looks for on-site or hybrid roles in the Atlanta metro area and remote roles open to a US resident, and wants to miss none of them. PR 107 left three groups of items open: two declined review findings on the pay-label rule, that rule's design, and the limits listed in `docs/WORKPLACE_GEOGRAPHY.md`. The question here is which of them cost real postings, and what the smallest sound fix for each is.

## Evidence labels

- **Measured** means this session ran it and read the output.
- **Inferred** means reasoned from code or data and not observed.

Two data sets, both read on 2026-11-18:

- **Corpus.** `repro/payrange/fetch.mjs` from the earlier spec, 39 public boards, 3,346 postings, each with its description.
- **Pod history.** The location column of the pod's `scan-history.tsv`, 27,902 rows and 5,784 distinct location strings. No description is stored there.

Both ran under the pod's hold (Atlanta, Alpharetta, Marietta, Johns Creek; remote country United States) with Georgia as a home state.

## Owner decisions

| Decision | Answer | Source |
|---|---|---|
| Scope of the one PR | The six changes in "What the plan builds". Everything in "Left as documented limits" stays out | Owner, 2026-11-18 |
| The pay-label rule | Sibling labels. A scope label is a heading only when one label in the posting names a home country. The pay, currency, notice and 80-character lookahead is deleted. A lone foreign label is a restriction, as it was before PR 107 | Owner, 2026-11-18, from Finding 2 |
| A location that reads two ways | `review`, as the earlier spec already says. A bare `CA`, `CO`, `DE`, `IL` or `IN` in a remote location, a bare US timezone abbreviation, a placeholder and a remote option beside an office word all get it. This replaces the Known-limits answers `elsewhere` for those shapes | Coordinator default, 2026-11-18, from Finding 1. The owner can overrule it |
| A description that shuts a home state out | Not eligible at the gate, new reason `home_state_excluded`, tier `review`. The owner chose `review` over `elsewhere` on 2026-11-18, after review found the rule refusing benefit sentences in four rounds: a sentence it misreads must not hide a home posting. Only a sentence about hiring counts. One the rule does not know stays `fit` | Owner, 2026-11-18 |

## Finding 1: three location shapes hide real rows from the inbox

Plan 2's inbox and hold read the location and the title only, so the location side is the part of the gate the owner will see. Measured over the pod history, the verdict on `main` answers `elsewhere` for 37 rows that name no foreign place:

| Shape | Rows | Examples | Should be |
|---|---|---|---|
| Placeholder | 27 | `N/A` (24), `na` (3) | `review`, `location_names_no_place` |
| A remote option beside an office word, with the home country named | 7 | `United States - Remote; Preferred: Denver, CO - Hybrid, Hybrid`, `Remote or In-Office in San Francisco · San Francisco · United States`, `Canada (Remote), United States (Remote), United Kingdom (Remote) …` | `review`, `remote_eligibility_unconfirmed` |
| A bare code that is a state and a country | 3 | `CA - Remote` (2), `Remote CA` (1) | `review`, `remote_scoped_to_other_state` |

On the corpus the same three rules move 10 postings from `elsewhere` to `review`, all of the second shape.

The other location limits PR 107 listed do not occur in either data set (measured): no bare timezone (`Remote - EST`), no `Atlanta (Georgia)` or `Atlanta - Georgia`, no `Remote - Georgia · Toronto, CA`. A bare timezone is included anyway because it falls out of the same rule as the bare code. The rest stay documented.

A wider rule was tried and dropped. Lifting every place that `placeSide` calls `maybe` also lifted `Remote - Toronto, ON, CA`, `Remote - Bogota, DC, CO` and `Poland - Remote OR Romania - Remote` (measured), so the rule reads the part's own letters instead.

## Finding 2: the pay-label rule guesses at pay text, and real labels come in pairs

The rule PR 107 shipped strips a label such as `Canada-based roles only:` when pay or a privacy notice follows within 80 characters and no negation word stands between. Review found a new sentence that beats it in four rounds. Both declined findings still reproduce on `main` (measured):

- `Canada-based candidates only: Apply by Friday; privacy notice below.` passes.
- Under a policy with `remote_regions: ['North America']`, `Canada-based candidates only: candidates must be located in North America; salary is $140,000 CAD.` passes.

What real labels look like (measured, corpus):

- One board uses them, on 71 postings. 48 carry both `USA-based roles only:` and `Canada-based roles only:`. Every posting the rule exists for is one of these.
- 12 carry a lone foreign label (8 `UK-based`, 4 `Canada-based`). All 12 are located in that country (`London, UK …`, `United Kingdom · UK · Remote`, `Toronto, ON · Toronto · Canada`). A lone foreign label is evidence of a foreign role.
- 11 carry a lone `USA-based roles only:`, which is home and was never a problem.
- One other board writes `For US based roles only: Pursuant to the San Francisco Fair Chance Ordinance …` on 12 postings. It names home.

So the structural signal is the sibling: a posting written for several countries labels each one, and the home country is among them. The sketch of that rule gave the same gate answer as `main` on all 3,346 postings under both policies (measured: 0 eligible to not, 0 not to eligible), and rejects both declined sentences. It deletes `CURRENCY`, `AMOUNT`, `NOTICE` and the lookahead.

What it costs: nine synthetic rows that `tests/workplace-policy-scope-labels.test.mjs` pins as allowed go back to rejected, the answer `main` gave before PR 107. They are a lone foreign label before pay or a notice (`Canada-based roles only: $140,000 CAD`, `UK applicants only: please read our privacy notice`, `Pay ranges for Mexico only: MXN 900,000 - 1,200,000.`). No posting in the corpus has that shape on a US-eligible role. PR 107 is not in a release yet, so no released answer changes.

## Finding 3: nobody writes "Georgia residents are not eligible"

No description in the corpus shuts out a US state by name (measured: 0 of 3,346, with two searches, one for an exclusion phrase beside a state and one for any negation beside a hiring word and a state). Employers state it the other way, as a list of states they hire in:

- `… we are currently able to hire employees in the following states only: Arizona, California, … Georgia, …` on 16 postings of one board. Georgia is in the list and the gate passes them, which is right and must stay.
- `Must be based in Washington, D.C., Maryland, or Virginia` on one posting, already rejected.

The exclusion sentences PR 107 listed still read as `fit` on `main` (measured). Reusing `excludedHome` with the state's name was sketched and dropped: it also refused `Our headquarters is not in Georgia.`, `Benefits vary by state, except Georgia Power retirees.` and `Applicants from Georgia are not eligible for relocation.` (measured). A wrong reject hides a home posting, and no real posting has the sentence the rule is for, so the rule that replaced it reads only a sentence about hiring (a hiring negation or `except`, then the state, then the end of the phrase) and lets the rest through as `fit`. It sits under the guard that already decides whether a sentence's Georgia is the state, and changes no corpus posting (measured). A list of states that omits the home state is a different rule and is left out: the one real list includes Georgia, and a wrong reading of such a list drops 16 real postings.

## Finding 4: a country list with home first is refused, with home second it passes

`Canada and US only.` passes. `United States and Canada residents only.` and `This position is open to candidates in the US and Canada only.` fail as `exclusive_foreign_country` (measured). PR 107 admitted a list before `roles`, `positions`, `employees` and `hires` and left the other nouns and the bare list out. No corpus posting has the shape (measured), so this is consistency, and the fix is one optional group in `listBeforeNoun`.

## Finding 5: timezone and region clauses reject a few real postings, and stay out

All 21 corpus postings that are eligible by location and rejected by description are `description_location_restricted` (measured, each read). Seventeen are right for an Atlanta resident (New York metro, Bay Area, `MST or PST`, Central region). Four are wrong or arguable:

| Sentence | Postings | Reading |
|---|---|---|
| `Must reside in the Eastern Time Zone.` and `Must be based in the EST time zone.` | 2 | Georgia is Eastern. Wrong reject |
| `Candidates must be based in North America.` | 1 | Passes when the policy lists `remote_regions: ['North America']` (measured). Configuration, not a defect |
| `Must reside on the East Coast` | 1 | Arguable |

Reading a timezone as home needs a table from state to timezone and a rule for states in two zones. The owner chose to leave it out of this PR. These clauses reach the gate only in a scan with `workplace_policy` on, which the pod keeps off.

## Who is affected

- **The owner's inbox after plan 2:** Finding 1 only. The hold and the inbox pass no description (plan 2, "Location and title only").
- **A scan with `location_filter.workplace_policy` on:** Findings 2, 3 and 4. `scan.mjs` is the one caller that passes a description. The pod's `/data/portals.yml` has no `workplace_policy` (measured, 2026-11-18).

## What the plan builds

1. Placeholders are `review`.
2. A remote location whose only place is a bare `CA`, `CO`, `DE`, `IL` or `IN`, or a bare US timezone abbreviation, is `review`.
3. A location the gate reads as an office role, which names the home country and has a remote place of its own, is `review`.
4. The sibling label rule replaces the pay lookahead.
5. A description that shuts a home state out is not eligible, `home_state_excluded`, and `review` in the verdict.
6. A country list that names home is home before `only`, with any of the seven nouns or none.

## Left as documented limits

Each still reproduces on `main` (measured) and stays in `docs/WORKPLACE_GEOGRAPHY.md`.

- Timezone residency, distance from a home place, a region inside the United States, a list of states that omits the home state (Finding 5 and Finding 3).
- `Atlanta (Georgia)`, `Atlanta - Georgia` and `Atlanta (ET)` are `review`, which hides nothing.
- No city list: `Remote - Georgia · Toronto, CA` and `Remote - Georgia · Remote - Warsaw` are `fit`. Holland, Wales, Scotland and Palestine are not countries.
- A description naming a Georgian city makes a bare `Remote, Georgia` `elsewhere`.
- `turkey` in lower case in a restriction clause (`cold turkey`) and `to work with US.` Fixing one word leaves Jordan, Chad and Guinea, which are words and names too.
- A negated place that still supplies geography, the spaced slash before `Remote not available`, `Remote - US , CA`.
- The verdict's three second-ask string devices and the three state-name matchers. A refactor with no change in any answer does not belong in a PR that changes answers.
- The validator reporting a scalar policy field one field at a time.
- `policy_absent` is `fit`. Plan 2's `holdPolicy` always builds a policy, so no hold reaches it (inferred from plan 2's text).

## Not checked

- Boards outside the 39. The label finding rests on one employer's template.
- Descriptions on the pod. Scan history stores none, so Findings 2 to 4 were measured on the corpus only.
- Measured on the real change, 2026-11-18, `repro/delta.mjs` with `main` at `7fb91d47` against the branch, on a fresh corpus (39 boards, 3,348 postings) and the pod's 27,902 scan-history rows (5,784 distinct locations). Under both policies the corpus gate changes are 0 eligible to not and 0 not to eligible. Every tier change is `elsewhere` to `review`: 10 corpus postings, and on the pod 27 placeholder rows, 7 remote-beside-office rows and 3 bare-code rows.
- The live postings behind the 37 pod rows. Their tiers were judged from the location string.

## Scripts

[`repro/`](repro/) holds this session's scripts. The corpus comes from `../2026-11-17-location-verdicts/repro/payrange/fetch.mjs <dir>`. The pod file is the owner's data and is not in the repository: `kubectl -n career-ops exec deploy/career-ops -- sh -c "cut -f6,7 /data/data/scan-history.tsv" > pod-loc.tsv`.

- `probe.mjs <module>` prints the gate and the verdict for every deferred sentence and location.
- `measure.mjs <module> <corpusDir>` lists the postings a description rejects with the sentence that does it, state-exclusion sentences, `only:` labels and residency clauses.
- `states.mjs <module> <corpusDir>` lists sentences naming three or more US states, and negations beside a state.
- `prototype-patch.mjs <providers/_country.mjs> <out.mjs>` writes the module with the six sketched changes.
- `rows.mjs <module>` checks every test row of the plan against a module and prints the ones that differ.
- `delta.mjs <moduleA> <moduleB> <corpusDir> <pod-loc.tsv>` counts gate and tier changes between two modules on both data sets.
