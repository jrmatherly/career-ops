# Recruiter advice review: findings

Recorded 2026-11-13. Read-only review. Nothing was changed.

## What was compared

Five articles by one recruiter, saved locally under `private/soor_blog/` (gitignored, not reproduced here), against career-ops at `main` 4ecadba7. The articles cover resume structure, resume bullets, five common recruiter-screen questions, behavioural questions, and the "tell me about yourself" opening.

The articles are one experienced opinion, and they also market a competing product. A finding below is a place where career-ops differs from that advice. It is not proof that career-ops is wrong.

## How it was checked

Three read-only explorers compared the project to the advice, one each for resume structure, bullets and interview prep. Every finding marked **confirmed** was then re-read at the cited line in the main session. Findings marked **reported** rest on an explorer's reading only.

Not inspected: the web resume editor, any rendered PDF, and `modes/interview-redflag.md` in full.

## A. Instructions that push against the advice

| # | Finding | Evidence | Status |
|---|---------|----------|--------|
| A1 | The CV mode asks for a keyword-dense summary and spreads JD keywords across the summary, the first bullet of each role and Skills. The advice is that keywords never replace qualifications and a resume is not built around ATS tricks. The fact gate still stops invented claims, so this is a tone problem, not a fabrication one. | `modes/pdf.md:56`, `:60`, `:137`, `:170`, `:384` | confirmed |
| A2 | Interview prep drafts a full answer for every question, and no interview mode tells the candidate not to memorise one. The advice's main message is to prepare points and evidence, never a script. | `modes/interview-prep.md:196`. The only counterweight is `:265`, for panels. | confirmed |
| A3 | Two answer shapes are taught for spoken answers: Headline, Effect, Rationale, Operations in interview prep, and STAR plus Reflection in the story bank and practice. The advice is to use one framework. | `modes/interview-prep.md:200-207`, `templates/story-bank.template.md`, `modes/interview/practice.md:97` | confirmed |
| A4 | The cover-letter mode picks bullets "with at least one metric per bullet", and the CV payload example labels a bullet "quantified-impact". The advice is never to add a number just to have one. | `modes/cover.md:206`, `modes/pdf.md:243` | confirmed |

## B. Bullet gaps

| # | Finding | Evidence | Status |
|---|---------|----------|--------|
| B1 | Nothing flags a duty-only bullet, a weak opening or an overlong bullet. The weak-start list is advice to the agent. The check rules only flag a role with no description at all. | `modes/heuristics/recruiter-side.md:51-52`, `lib/resume/check.mjs:32` | confirmed |
| B2 | No rule covers a true number that is ambiguous: a volume with no time period, percent against percentage points, a team's output against the whole site's, or a shared result stated as the candidate's own. The fact gate only tests that a number appears in the sources. | No hit in `modes/` for the terms searched | confirmed |
| B3 | Scope (team size, volume, budget, locations) is never asked for apart from results. The story bank has no scope field. | `modes/interview.md:23`, `lib/story-bank.mjs:41-49` | confirmed |
| B4 | No instruction to spell out an internal acronym, or to give an abbreviation with its full term. | No hit in the CV modes | confirmed |

## C. Interview gaps

| # | Finding | Evidence | Status |
|---|---------|----------|--------|
| C1 | Practice feedback does not name the common behavioural mistakes: "we" hiding the candidate's part, a hypothetical answer, an answer to a different question, oversharing. It checks length, Reflection and unverified claims. | `modes/interview/practice.md:66-101` | confirmed |
| C2 | Nothing reports which common behavioural prompts have no story. `match-star.mjs` scores stories against one question at a time. | `match-star.mjs:104-138` | confirmed |
| C3 | "Why did you leave" has no answer of its own, no guidance for a layoff, and no comparison of the candidate's reasons with this role's known downsides. | Merged into the walk-through at `modes/interview-prep.md:213`. "Laid off" appears nowhere in the prep modes. | confirmed |
| C4 | The opening answer has a length and nothing else: no shape, no guidance for a career changer. | `modes/interview-prep.md:213` | confirmed |
| C5 | Questions to ask the interviewer are tied to what the team shipped, not to the candidate's own deal-breakers. | `modes/interview-prep.md:229` | confirmed |
| C6 | "What are you looking for in your next job" has no answer of its own. The recruiter pack flags deal-breakers for routing, and nothing checks that the answer states the candidate's real preferences where the role does not meet them. | `modes/interview-prep.md:211-219` | confirmed |

## D. Smaller opportunities

| # | Finding | Evidence | Status |
|---|---------|----------|--------|
| D1 | Outcomes are reported by archetype and ATS vendor, never by CV template or tailoring choice. | `analyze-patterns.mjs`, `stats.mjs`; `data/pdf-index.tsv` has no template column. It is read by position, and a trailing column is the safe way to add one (`generate-pdf.mjs:1641-1648`). | confirmed |
| D2 | Nothing captures an accomplishment outside an application, or marks a result as not yet measurable. The "journal" in `calibrate.mjs` is the application-outcome log. | `calibrate.mjs:63`, `modes/outcome.md:67` | confirmed |
| D3 | The single-column lint rule has no detector. Upstream left it out on purpose and wrote down why: a heuristic that fires on a correct template teaches people to ignore the lint. | `templates/ats-rules.yml:42-52` | confirmed |
| D4 | The default template emits a Core Competencies section that the project's own `--ats` path folds into Skills. | `modes/pdf.md:104`, `:171` | reported |

## What the project already does well

No invented facts, with a hard fact gate. Newest-first experience, enforced. A page budget that warns before it fails. A ban on hidden text, with a working detector. Prep that differs by audience, including a recruiter-screen pack whose question list matches the articles'. A salary answer that defers to the band and never volunteers the floor.

## Advice not taken up

- Stacked contact lines, and Skills ahead of Certifications. One recruiter's preference against a deliberate order.
- STAR without Reflection. Reflection is one line and a fair seniority signal.
- Several wordings per bullet. A product feature of the articles' sponsor, not advice.

## Copies of the keyword rule

Found in the plan's review on 2026-11-13. The instruction A1 names in `modes/pdf.md` is restated in `modes/text.md:20` and `:23`, `modes/latex.md:16`, `:19` and `:65`, `modes/latex-tex.md:46`, `batch/batch-prompt.md:753`, `openai-tailor.mjs:240` and the web `pdf` worker prompt at `web/src/lib/run-prompts.mjs:252`. `modes/cover.md:210`, `:239-242` and `:276` also require a metric in every bullet, beside the line A4 names.

## Outcomes

Recorded 2026-11-13 from the branch `feat/recruiter-advice-and-test-leak` (first named `feat/recruiter-advice-follow-ups`), plan `docs/superpowers/plans/2026-11-13-recruiter-advice-follow-ups.md`. Jason confirmed the four decisions in session on 2026-11-13: D1, D3 and D4 are not built, every copy of the keyword rule changes, the two bullet rules count toward the Check score, and the cover draft in `modes/oferta.md` is aligned with `modes/cover.md`.

| # | Outcome | Pinned by |
|---|---------|-----------|
| A1 | Fixed in this branch, in `modes/pdf.md` and every copy of the rule, including `modes/pdf.md:64` and `modes/text.md:60`, which the plan had missed. | `tests/recruiter-advice-wording.test.mjs`: "the CV mode asks for a relevant summary", "no copy of the CV rules still says to inject keywords" |
| A2 | Fixed in this branch. Interview prep gives points and evidence by default. | `tests/recruiter-advice-wording.test.mjs`: "interview prep gives points and evidence" |
| A3 | Fixed in this branch. STAR for a behavioural question, result-first for the rest. | same test |
| A4 | Fixed in this branch, in `modes/cover.md`, `modes/pdf.md` and the cover draft in `modes/oferta.md`. | `tests/recruiter-advice-wording.test.mjs`: "no mode asks for a metric in every bullet" |
| B1 | Fixed in this branch. `WEAK_BULLET_START` and `LONG_BULLET` in `lib/resume/check.mjs`, info severity, one finding per description with a count. | `tests/resume-check.test.mjs`, the bullet tests |
| B2 | Fixed in this branch as an instruction to ask the user. No lint, since telling a clear number from an ambiguous one is a heuristic. | `tests/recruiter-advice-wording.test.mjs`: "the bullet heuristics cover plain words, number hygiene, scope and acronyms" |
| B3 | Fixed in this branch. `modes/interview.md` asks for scope apart from outcomes, and the story bank has an optional `**Scope:**` field. | `tests/recruiter-advice-wording.test.mjs`: "the English cover and evaluation modes do not ask for a metric in every bullet" pins the `modes/interview.md` and `modes/add.md` lines, and `tests/story-bank-contract.test.mjs` the field |
| B3, follow-up | Added on 2026-11-13 after the contract review: `story-provenance-check.mjs` classifies every figure on a `**Scope:**` line against `cv.md`, so an unbacked scope number is reported instead of passing as clean. | `tests/story-provenance-scope.test.mjs` |
| B4 | Fixed in this branch. | `tests/recruiter-advice-wording.test.mjs`, same test as B2 |
| C1 | Fixed in this branch. "The behavioural checks" in `modes/interview/practice.md`. | `tests/recruiter-advice-wording.test.mjs`: "practice feedback checks the common behavioural mistakes by name" |
| C2 | Fixed in this branch. `node story-coverage.mjs`, run by `modes/interview/plan.md` step 5. | `tests/story-coverage.test.mjs` |
| C3, C4, C5, C6 | Fixed in this branch, in the recruiter-screen pack of `modes/interview-prep.md`. | `tests/recruiter-advice-wording.test.mjs`: "interview prep gives points and evidence" |
| D1 | Not built. About 100 tracker rows and few sent applications would make a per-template rate noise. | none |
| D2 | Fixed in this branch, small. A story's Result can be "pending", and `story-coverage.mjs` lists those stories. No new file or mode. | `tests/story-bank-contract.test.mjs`, `tests/story-coverage.test.mjs` |
| D3 | Not built. Upstream declined it in writing (`templates/ats-rules.yml`). | none |
| D4 | Left as built. It is upstream's design, and `pdf --ats` already folds it for parsers. | none |

Not verified by this branch: that a CV or prep document an agent writes from the new wording reads differently. The tests pin the wording, not the agent's output. The first CV generated after the merge is that check.
