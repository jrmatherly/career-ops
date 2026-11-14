# Recruiter Advice Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the CV and interview modes in line with the confirmed findings of the recruiter advice review, and add two zero-LLM checks: a bullet lint and a story-coverage report.

**Architecture:** Most of the work is wording in six English mode files, pinned by one new drift test. The bullet lint is two new rules in the fork's existing resume check catalog, so `resume.mjs check` and the web Check panel show them with no new surface. Story coverage is one new read-only root script that reuses `match-star.mjs`'s scorer, and the story bank gains one optional field.

**Tech Stack:** Node.js `.mjs`, `node:test`, Markdown mode files.

**Spec:** `docs/superpowers/research/2026-11-13-recruiter-advice-review/findings.md`

## Decisions for Jason before execution

Three of the four D findings are recommended against, and two choices below change what gets built. Each is one line to overturn.

| Finding | Recommendation | Why |
|---|---|---|
| D1, outcomes by CV template | Do not build. | The tracker holds about 100 rows and few sent applications, so a per-template rate would be noise. The cost is modest and is not the reason: `data/pdf-index.tsv` is read by position, and a trailing column is the established safe change (`generate-pdf.mjs:1641-1648`), plus a reader in `analyze-patterns.mjs`. |
| D3, single-column detector | Do not build. | Upstream declined it in writing (`templates/ats-rules.yml:48-52`): a heuristic that fires on a correct template teaches people to ignore the lint. All ten shipped templates are declared one column in `lib/resume/template-layouts.mjs`. |
| D4, Core Competencies by default | Leave as built. | It is upstream's deliberate six-second-scan design, and `pdf --ats` already folds it for parsers. Changing the default diverges every rendered CV from upstream's. |
| D2, accomplishment journal | Build, small. | Task 5 lets the story bank hold a story whose result is pending, and Task 6 lists them. No new file or mode. |
| The keyword rule's other copies | Change them too (Task 1, Step 7). | `modes/text.md`, `modes/latex.md`, `modes/latex-tex.md`, `batch/batch-prompt.md`, `openai-tailor.mjs` and the web `pdf` worker prompt each restate "inject keywords". Left alone, the web worker and batch runs would keep the old instruction while `modes/pdf.md` says the new one. Say so to keep the change to `modes/pdf.md` only. |
| The Check score | Accept the drop. | The score is passed rules over applicable rules (`lib/resume/check.mjs:505-511`), whatever the severity. With 25 rules, a CV with one weak bullet scores 96, and with one weak and one long bullet 92. Both rules can be ignored per finding or with `--ignore`. Say so to keep the two rules out of the score. |

## Global Constraints

- One branch, `feat/recruiter-advice-follow-ups`, in a sibling worktree. One PR. No merge without Jason's word in-session.
- English modes only. The translated mode sets under `modes/{lang}/` are not edited. Add no `#` heading to any mode file, since `i18n-drift.mjs` compares heading structure.
- New mode copy matches the punctuation of the lines around it. `modes/interview-prep.md` and `modes/pdf.md` separate a label from its text with ` — `, and `modes/heuristics/recruiter-side.md` uses none.
- `i18n-drift.mjs` is advisory and always exits 0. It compares heading levels only, and only for files the translated sets also hold (here `interview/practice.md` and `interview/plan.md`). Save `node i18n-drift.mjs --summary` before the first mode edit and compare it after each mode task. Identical output proves no heading was added by accident, and nothing more.
- Mode wording never weakens the fact rules: "NEVER invent", the fact gate and the Source-of-Truth Boundary stay word for word.
- No personal data. Test fixtures use fictional people and companies only.
- A new test is its own file under `tests/*.test.mjs`. No `process.exit()` in a discovered suite.
- A script that checks whether it is the entry point uses `isMainModule(import.meta.url)` from `lib/is-main-module.mjs`.
- A new root script resolves user files through `getCareerOpsRoot()` from `path-resolver.mjs`, and is listed in `config/local-paths.txt`.
- Every upstream file this plan edits gets a row in the deviations table in `.claude/skills/upstream-review/SKILL.md`. `tests/fork-deviations-covered.test.mjs` diffs `HEAD`, so run it after committing.
- Conventional Commits with a scope. Before the push: `node scripts/check-syntax.mjs`, `node test-all.mjs --quick`, then `node .githooks/coderabbit-review.mjs` as its own command.

## Review Focus

- **A bullet that opens with a weak phrase inside a sentence that owns the work.** "Responsible for" at the start is flagged. "Led the team responsible for billing" is not. Task 4 tests both.
- **Two weak bullets in one role.** A finding's key is its rule id and pointer, and the web Check panel pins and ignores by key (`web/src/components/resume/check-panel.tsx:76-82`). Two findings with one key would collide, so each rule reports once per description, with a count. Task 4 tests it.
- **A long bullet in a language with no spaces, or a bullet that is one long URL.** The length rule counts characters of visible text, so a CJK bullet trips it sooner than an English one. It is `info` severity and can be ignored per rule with `--ignore`. Task 4 tests that a link's `href` does not count toward the length.
- **A story bank with no tags.** A prompt can then match on title and body words alone, and a title hit plus a body hit scores 3. The report must say "thin" for any score under 3 and must print the score beside "covered", so a covered-by-wording match is visible. Task 6 tests a body-only match.
- **A story whose result reads "pending" in another case or with a trailing note.** "Pending", "pending: Q1 numbers" and "PENDING" all count. "The pending migration shipped" does not. Task 5 tests all four.
- **A user whose `_custom.md` already asks for scripted answers.** `modes/_custom.md` overrides style defaults. The new "prepare, do not memorise" line is a default, so it must be worded as one and not as a rule that outranks house rules. Task 2's copy says "by default".

---

### Task 1: CV and cover wording (A1, A4, B2, B3, B4)

**Files:**
- Modify: `modes/pdf.md:56`, `:60`, `:137`, `:140`, `:154`, `:170`, `:234`, `:243`, `:381`, `:384`
- Modify: `modes/cover.md:206`, `:210`, `:239-242`, `:276`
- Modify (the rule's other copies, Step 7): `modes/text.md:20`, `:23`, `modes/latex.md:16`, `:19`, `:65`, `modes/latex-tex.md:46`, `batch/batch-prompt.md:753`, `openai-tailor.mjs:240`, `web/src/lib/run-prompts.mjs:252`
- Modify: `modes/heuristics/recruiter-side.md:51-52` (append after the weak-starts sentence)
- Modify: `modes/add.md:49-50`
- Modify: `modes/interview.md:23`
- Test: `tests/recruiter-advice-wording.test.mjs` (create)

**Interfaces:**
- Produces: `tests/recruiter-advice-wording.test.mjs` with a helper `mode(rel)` that returns the file's text, reused by Tasks 2 and 3.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mode = (rel) => readFileSync(fileURLToPath(new URL(`../modes/${rel}`, import.meta.url)), 'utf-8');

test('the CV mode asks for a relevant summary, not a keyword-dense one', () => {
  const pdf = mode('pdf.md');
  assert.ok(!pdf.includes('keyword-dense'));
  assert.ok(!pdf.includes('Distributed JD keywords'));
  assert.ok(pdf.includes('Use the JD\'s own term where it truthfully names what the candidate did'));
  assert.ok(pdf.includes('NEVER invent'));
});

test('no mode asks for a metric in every bullet', () => {
  const cover = mode('cover.md');
  assert.ok(!cover.includes('at least one metric per bullet'));
  assert.ok(!/impact( sentence)? with metric/.test(cover));
  assert.ok(!mode('pdf.md').includes('Another quantified-impact bullet'));
});

test('no copy of the CV rules still says to inject keywords', () => {
  const root = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf-8');
  const copies = ['modes/pdf.md', 'modes/text.md', 'modes/latex.md', 'modes/latex-tex.md', 'batch/batch-prompt.md', 'openai-tailor.mjs', 'web/src/lib/run-prompts.mjs'];
  for (const rel of copies) assert.ok(!/inject(ing|ed)?\b[^.\n]{0,24}keywords|keywords injected/i.test(root(rel)), rel);
});

test('the bullet heuristics cover plain words, number hygiene, scope and acronyms', () => {
  const h = mode('heuristics/recruiter-side.md');
  for (const phrase of [
    'say what changed in plain words',
    'percentage points',
    'the period it covers',
    'Scope is not a result',
    'Spell out an acronym',
  ]) assert.ok(h.includes(phrase), phrase);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test tests/recruiter-advice-wording.test.mjs`
Expected: four failures, the first on `keyword-dense`.

- [ ] **Step 3: Edit `modes/pdf.md`**

| Line | Now | Becomes |
|---|---|---|
| 56 | "Rewrite Professional Summary by injecting JD keywords + the candidate's exit narrative…" | "Rewrite Professional Summary around the role this JD describes, using the JD's own terms where they truthfully name what the candidate did, + the candidate's exit narrative…" (rest of the line unchanged) |
| 60 and 384 | "Inject keywords naturally into existing achievements (NEVER invent)" and "Inject keywords naturally (NEVER invent)" | "Use the JD's own term where it truthfully names what the candidate did (NEVER invent). A keyword is not a qualification: never add one the achievement does not support." |
| 137 | "Distributed JD keywords: Summary (top 5), first bullet of each role, Skills section" | "JD terms appear where the matching work is described: the summary, the bullets that did that work, and Skills. Never repeat a term to raise a count." |
| 140 | "(not the optional-sections or distributed-keywords bullets)" | "(not the optional-sections or JD-terms bullets)" |
| 154 | "Bullets should emphasize outcomes, systems, users, or business effects rather than task history." | Keep, and append: "A bullet says what the candidate did, how, and what happened as a result. See `modes/heuristics/recruiter-side.md`." |
| 170 | "Professional Summary (3-4 lines, keyword-dense)" | "Professional Summary (3-4 lines: what kind of professional this is and why this role)" |
| 234 | `"summary": "Personalized summary with JD keywords injected (honest vs cv.md).",` | `"summary": "Personalized summary in the JD's own terms (honest vs cv.md).",` |
| 243 | `"bullets": ["Achievement bullet with JD keywords injected", "Another quantified-impact bullet"]` | `"bullets": ["Achievement bullet in the JD's own terms", "Another bullet: what was done, how, and the result"]` |
| 381 | "Rewrite Professional Summary with JD keywords + exit narrative" | "Rewrite Professional Summary around the role, in the JD's own terms + exit narrative" |

- [ ] **Step 4: Edit `modes/cover.md`**

Line 206: "Pick the 4-5 highest-scoring, with at least one metric per bullet" becomes "Pick the 4-5 highest-scoring. Prefer a bullet whose result is stated, with its metric when cv.md has one".

Lines 210 and 276 still require a metric in every bullet and would contradict line 206. "one sentence of impact with metric" becomes "one sentence of impact, with its metric when cv.md has one". "impact sentence with metric" at 276 becomes "impact sentence, with its metric when cv.md has one". In the four example lines at 239-242, "impact sentence with metric." becomes "impact sentence." on the last two, so the example shows both shapes.

- [ ] **Step 5: Append to `modes/heuristics/recruiter-side.md` after line 52**

```markdown
When there is no reliable number, say what changed in plain words. Never add a
percentage to have one.

A true number still has to be clear:

- a volume states the period it covers ("120,000 units a month", not "120,000 units")
- a percentage states what it measures, and percent is not percentage points
- a figure for the whole site or company is not written as the candidate's own team's
- a shared result names the candidate's part in it

Scope is not a result. Team size, volume, budget and locations show the level of
the work, and they belong in a bullet even when no outcome was measured.

Spell out an acronym the reader's company would not know. Where an abbreviation
and its full term are both accurate, give both once.

If a bullet in `cv.md` lacks the period, the measure or the candidate's part,
ask the user. Never fill it in.
```

- [ ] **Step 6: Edit `modes/add.md:49-50` and `modes/interview.md:23`**

`add.md`: after "quantified-where-the-source-supports-it bullets", add "and in plain words where it does not, following the number rules in `modes/heuristics/recruiter-side.md`".

`interview.md`: "…and most importantly, **measurable outcomes** (percentages, revenue, performance gains, team size, cost savings)." becomes "…**scope** (team size, volume over a stated period, budget, locations) and, apart from it, **measurable outcomes** (percentages, revenue, performance gains, cost savings). When there was no measured outcome, record the scope and what changed in plain words."

- [ ] **Step 7: Bring the rule's other copies into line.** Each keeps its own surrounding words and its "NEVER invent" clause.

| File and line | Now | Becomes |
|---|---|---|
| `modes/text.md:20`, `modes/latex.md:16` | "Rewrite Professional Summary injecting JD keywords (same rules as `pdf` mode — NEVER invent skills)" | "Rewrite Professional Summary around the role, in the JD's own terms (same rules as `pdf` mode — NEVER invent skills)" |
| `modes/text.md:23` | "Inject keywords naturally into existing achievements (NEVER invent)" | "Use the JD's own term where it truthfully names what the candidate did (NEVER invent)" |
| `modes/latex.md:19` | "Inject keywords naturally into existing achievements" | "Use the JD's own term where it truthfully names what the candidate did (NEVER invent)" |
| `modes/latex.md:65` | "Achievement bullet with JD keywords injected" | "Achievement bullet in the JD's own terms" |
| `modes/latex-tex.md:46` | "Inject keywords into existing achievements — **NEVER invent skills**" | "Use the JD's own terms in existing achievements where they truthfully apply — **NEVER invent skills**" |
| `batch/batch-prompt.md:753` | "Inject keywords ethically into existing achievements; never invent skills or metrics." | "Use the JD's own terms in existing achievements where they truthfully apply; never invent skills or metrics." |
| `openai-tailor.mjs:240` | "Inject keywords naturally by reformulating the real experience using JD vocabulary." | "Reformulate the real experience in JD vocabulary where it truthfully applies. A keyword is not a qualification." |
| `web/src/lib/run-prompts.mjs:252` | "inject the JD's keywords into the summary + first bullets" | "use the JD's own terms in the summary and bullets where they truthfully name the work" |

The heading "## Keyword Injection Strategy" at `modes/latex.md:182` stays. Its body already says to reformulate existing experience only, and renaming a heading is out of bounds here.

- [ ] **Step 8: Run the test**

Run: `node --test tests/recruiter-advice-wording.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 9: Check nothing else pinned the old wording**

Run: `grep -rnE "keyword-dense|Distributed JD keywords|at least one metric per bullet|with metric|[Ii]nject(ing)? (the JD's )?keywords" tests web/tests batch docs modes web/src .agents .claude/skills --include='*.md' --include='*.mjs' --include='*.ts' --include='*.tsx' | grep -vE "^docs/superpowers/|^modes/[a-z]{2}(-[A-Z]{2})?/|^tests/recruiter-advice-wording"`
Expected: no output. The filter drops this plan and its findings, the translated mode sets, and the new test. A hit under `tests/` or `web/tests/` is a drift guard to update in this commit.

- [ ] **Step 10: Run the suites that read the changed prompts**

Run: `node --test tests/*batch*.test.mjs`, and in `web/`: `node --experimental-strip-types --import=./tests/helpers/saved-settings-off.mjs --test tests/lib/run-prompts*.test.mjs` if such a file exists.
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add modes/pdf.md modes/cover.md modes/text.md modes/latex.md modes/latex-tex.md modes/heuristics/recruiter-side.md modes/add.md modes/interview.md batch/batch-prompt.md openai-tailor.mjs web/src/lib/run-prompts.mjs tests/recruiter-advice-wording.test.mjs
git commit -m "docs(modes): CV bullets say what was done, how and the result, not a keyword count"
```

### Task 2: Interview prep prepares points, not scripts (A2, A3, C3, C4, C5, C6)

**Files:**
- Modify: `modes/interview-prep.md:196`, `:200-208`, `:213`, `:229`
- Test: `tests/recruiter-advice-wording.test.mjs` (extend)

**Interfaces:**
- Consumes: `mode(rel)` from Task 1.

- [ ] **Step 1: Add the failing test**

```js
test('interview prep gives points and evidence, and one shape per kind of answer', () => {
  const prep = mode('interview-prep.md');
  assert.ok(!prep.includes('draft candidate-specific answers'));
  for (const phrase of [
    'By default, give the candidate points and evidence, not a script',
    'A behavioural question takes a story in STAR order',
    'Where the candidate is now',
    'If the candidate was laid off, say so in one sentence',
    'one question that tests each deal-breaker',
  ]) assert.ok(prep.includes(phrase), phrase);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test tests/recruiter-advice-wording.test.mjs`
Expected: FAIL on `draft candidate-specific answers`.

- [ ] **Step 3: Edit line 196**

"draft candidate-specific answers using" becomes "prepare candidate-specific answers using". Then add one paragraph after that paragraph:

```markdown
By default, give the candidate points and evidence, not a script. For each question write the point to land, the one or two proof points that carry it, and the role's need it speaks to. Write full sentences only for a figure, a name or a phrase that has to be exact. Tell the candidate to practise saying the points several ways, since a memorised answer breaks on the first follow-up.
```

One line, like the paragraphs around it.

- [ ] **Step 4: Edit lines 200-208**

Keep the four-part list. Replace the lead-in "For every answer, use result-first framing:" with:

```markdown
One shape per kind of answer. A behavioural question takes a story in STAR order, with its Reflection when the story has one, as the story bank holds it. Lead with the Result in one sentence, then tell it. Every other answer (a motivation, a design choice, an opinion) uses result-first framing:
```

Write it as one line, as shown. The test matches a phrase that a hard wrap would split.

- [ ] **Step 5: Replace the first bullet at line 213 with three**

```markdown
- **"Tell me about yourself" / "Walk me through your CV"** — 60–90s, built from four points: Where the candidate is now. The progression or specialty most relevant to this role. One or two experiences that support it. Why this role is a sensible next step. Start where the relevant story starts, not at the first job. For a walk-through, go in order but give the relevant roles the time. For a career change, lead with what transfers and name the gap plainly.
- **"Why are you looking?" / "Why did you leave?"** — the decision and what the candidate wants more of, from `modes/_profile.md`, with no complaint about a past employer. If the candidate was laid off, say so in one sentence and move on. Then compare the reason with this role: if the evaluation or the JD shows the same condition here (limited growth, on-call load, travel), flag it to the candidate before the call.
- **"What are you looking for?"** — the candidate's real preferences from `config/profile.yml` and `modes/_profile.md`, and where this role meets them. Where it does not, say so to the candidate. Never write an answer that claims a preference they did not state.
```

- [ ] **Step 6: Edit line 229**

"**Sharp questions to ask back** — 2–3 tied to a specific recent thing the team shipped or wrote about, not generic "what's the team like"." gains a second sentence: "Add one question that tests each deal-breaker in `modes/_profile.md` the JD leaves open, worded as a neutral question about how the team works."

- [ ] **Step 7: Run the test and the drift check**

Run: `node --test tests/recruiter-advice-wording.test.mjs && node i18n-drift.mjs --summary`
Expected: PASS, 5 tests. The drift summary is identical to the one saved before the first mode edit.

- [ ] **Step 8: Commit**

```bash
git add modes/interview-prep.md tests/recruiter-advice-wording.test.mjs
git commit -m "docs(interview-prep): prepare points and evidence, one answer shape per kind of question"
```

### Task 3: Practice feedback names the common mistakes (C1)

**Files:**
- Modify: `modes/interview/practice.md` (one paragraph, inserted before "**The Reflection check.**" at line 97)
- Test: `tests/recruiter-advice-wording.test.mjs` (extend)

- [ ] **Step 1: Add the failing test**

```js
test('practice feedback checks the common behavioural mistakes by name', () => {
  const practice = mode('interview/practice.md');
  for (const phrase of [
    '**The behavioural checks.**',
    'what they would do, not what they did',
    'every sentence says "we"',
    'answered a different question',
    'background that raises a new concern',
  ]) assert.ok(practice.includes(phrase), phrase);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test tests/recruiter-advice-wording.test.mjs`
Expected: FAIL on `**The behavioural checks.**`.

- [ ] **Step 3: Insert the paragraph**

```markdown
**The behavioural checks.** For a "tell me about a time" question, check these before the feedback, and put the one or two that matter most under "What to sharpen": the candidate said what they would do, not what they did. Their own part is unclear because every sentence says "we". They told a strong story that answered a different question. They gave so little detail that the problem or the reasoning cannot be seen. They added background that raises a new concern and was not asked for. Quote the sentence that shows it. If none applies, say nothing about them.
```

The cap matches `modes/interview/practice.md:84`, which allows one or two things to sharpen per answer.

- [ ] **Step 4: Run the test and the drift check**

Run: `node --test tests/recruiter-advice-wording.test.mjs && node i18n-drift.mjs --summary`
Expected: PASS, 6 tests, and the same drift summary as before.

- [ ] **Step 5: Commit**

```bash
git add modes/interview/practice.md tests/recruiter-advice-wording.test.mjs
git commit -m "docs(interview): practice feedback names the common behavioural mistakes"
```

### Task 4: Bullet lint rules (B1)

**Files:**
- Modify: `lib/resume/check.mjs` (two `CATALOG` rows after `FRAGMENTED_ENTRY`, the comment at line 14, one rule function, one call in the experience walk near line 345)
- Modify: `tests/resume-check.test.mjs` (two new tests, and the rule count at lines 573, 582 and 611)
- Modify: `docs/SCRIPTS.md:33`, `docs/MIGRATING_FROM_REACTIVE_RESUME.md:42`, `.claude/skills/upstream-review/SKILL.md:163` (rule count)

**Interfaces:**
- Produces: rule ids `WEAK_BULLET_START` and `LONG_BULLET`, both `severity: 'info'`, `category: 'writing'`. Each rule reports at most once per description: `params: { text, count }`, where `text` is the first offending bullet cut to 60 characters and `count` is how many bullets in that description offend. `LONG_BULLET` adds `params.length`, the first offender's length.
- Pointer: `${item.pointer}/description` for the entry's own description, and `${item.pointer}/roles/${index}/description` for a role's. One finding per rule per pointer keeps `findingKey` unique, which the web Check panel needs to pin and ignore one finding at a time.
- A description is linted when it holds at least one `<li>`. A paragraph-only description is skipped, since it is not a bullet.
- Constants: `MAX_BULLET_LENGTH = 240`. `WEAK_BULLET_START = /^(responsible for|helped|assisted|worked on|participated in)\b/i`, the list at `modes/heuristics/recruiter-side.md:51-52`.

- [ ] **Step 1: Write the failing tests** in `tests/resume-check.test.mjs`, using the file's existing `parsed` (line 23), `sample` (line 28) and `lint` (line 58) helpers. Go through `lint`, since the last test in the file requires every catalog id to have been produced by a fixture. The sample's descriptions are `<ul><li><p>…</p></li></ul>`, and the tests below replace item 0's:

```js
test('a bullet that opens with a duty phrase is flagged, and the same words mid-sentence are not', () => {
  const data = parsed(sample());
  data.sections.experience.items[0].description =
    '<ul><li>Responsible for billing disputes.</li><li>Led the team responsible for billing.</li></ul>';
  const found = lint(data).findings.filter((f) => f.id === 'WEAK_BULLET_START');
  assert.equal(found.length, 1);
  assert.equal(found[0].params.text, 'Responsible for billing disputes.');
  assert.equal(found[0].params.count, 1);
  assert.equal(found[0].severity, 'info');
});

test('two weak bullets in one role are one finding with a count, and a lone bullet is still checked', () => {
  const data = parsed(sample());
  data.sections.experience.items[0].description = '<ul><li>Helped with releases.</li><li>Worked on billing.</li></ul>';
  data.sections.experience.items[1].description = '<ul><li>Assisted the support team.</li></ul>';
  const found = lint(data).findings.filter((f) => f.id === 'WEAK_BULLET_START');
  assert.deepEqual(found.map((f) => f.params.count), [2, 1]);
  assert.equal(new Set(found.map((f) => f.key)).size, 2);
});

test('a description written as a paragraph is not linted as a bullet', () => {
  const data = parsed(sample());
  data.sections.experience.items[0].description = '<p>Responsible for the billing platform.</p>';
  assert.deepEqual(lint(data).findings.filter((f) => f.id === 'WEAK_BULLET_START'), []);
});

test('a bullet over 240 characters is flagged, and a link target does not count', () => {
  const data = parsed(sample());
  const long = `Consolidated ${'vendor approvals and '.repeat(12)}one intake form.`;
  const linked = `<a href="https://example.com/${'x'.repeat(300)}">Shipped the intake form</a>`;
  data.sections.experience.items[0].description = `<ul><li>${long}</li><li>${linked}</li></ul>`;
  const found = lint(data).findings.filter((f) => f.id === 'LONG_BULLET');
  assert.equal(found.length, 1);
  assert.equal(found[0].params.count, 1);
  assert.equal(found[0].params.length, long.length);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `node --test tests/resume-check.test.mjs`
Expected: the weak-start, count and long-bullet tests fail with 0 findings, and the paragraph test passes already. If the sample has no second experience item, the count test adds one with the file's existing helpers.

- [ ] **Step 3: Add the two `CATALOG` rows**

```js
WEAK_BULLET_START: { severity: 'info', category: 'writing', message: (p) => `"${p.text}" opens with a duty, not an action${p.count > 1 ? `, and so do ${p.count - 1} more in this entry` : ''}. Say what you did, how, and what happened as a result.`, fix: 'Rewrite the bullet' },
LONG_BULLET: { severity: 'info', category: 'writing', message: (p) => `"${p.text}" runs to ${p.length} characters${p.count > 1 ? `, and ${p.count - 1} more in this entry are over ${MAX_BULLET_LENGTH}` : ''}. A bullet past about two lines usually holds two accomplishments.`, fix: 'Split the bullet' },
```

Also change the comment above `CATALOG` at line 14 from "One row per rule, in RR's catalog order." to "One row per rule, in RR's catalog order. WEAK_BULLET_START and LONG_BULLET are career-ops's own."

- [ ] **Step 4: Implement `bulletFindings(description, pointer) -> finding[]`** in `lib/resume/check.mjs`. Call it for each visible experience item's description and for each of its roles' descriptions, with the pointers named under Interfaces. It returns nothing unless the description holds an `<li>`. It reads `linesOf(description)`, which returns each bullet's visible text and drops a link's `href`.

- [ ] **Step 5: Update the three rule-count assertions.** `tests/resume-check.test.mjs:573` and `:611` assert `report.totalRules` is 23, and `:582` matches "of 23 rules pass". All three become 25.

- [ ] **Step 6: Run the suite**

Run: `node --test tests/resume-check.test.mjs`
Expected: PASS. The fixtures' longest bullet is 150 characters and none opens with a duty phrase (measured 2026-11-13), so the zero-finding assertions at lines 68 and 101 hold.

- [ ] **Step 7: Update the rule count in three docs**

- `docs/SCRIPTS.md:33`: "Report the 23 Reactive Resume Check rules" becomes "Report the 23 Reactive Resume Check rules and two of career-ops's own for bullets (`WEAK_BULLET_START`, `LONG_BULLET`)".
- `docs/MIGRATING_FROM_REACTIVE_RESUME.md:42`: "lists the 23 Reactive Resume Check rules" gains "and two career-ops bullet rules".
- `.claude/skills/upstream-review/SKILL.md:163`: after "Reactive Resume's 23 Check rules", add "plus `WEAK_BULLET_START` and `LONG_BULLET`, which are ours and have no Reactive Resume source".

- [ ] **Step 8: Check the web panel.** In `web/`, run `npm run build` and the browser suite that covers the resume Check panel (`node tests/browser-suites.mjs <name>`, where the name is the suite that opens the CV page). Expected: PASS, with no duplicate-key warning in its console output.

- [ ] **Step 9: Commit**

```bash
git add lib/resume/check.mjs tests/resume-check.test.mjs docs/SCRIPTS.md docs/MIGRATING_FROM_REACTIVE_RESUME.md .claude/skills/upstream-review/SKILL.md
git commit -m "feat(resume): the check flags a bullet that opens with a duty or runs past two lines"
```

### Task 5: The story bank holds scope and a pending result (B3, D2)

**Files:**
- Modify: `lib/story-bank.mjs:41-49` (`STORY_FIELDS`), `:260-276` (`parseStories`)
- Modify: `templates/story-bank.template.md` (entry format block and its rules list)
- Test: `tests/story-bank-contract.test.mjs`

**Interfaces:**
- Produces: `STORY_FIELDS.scope = ['Scope']`. `parseStories()` entries gain `scope: string` (empty when absent) and `resultPending: boolean`.
- Produces: `export function isResultPending(result: string): boolean` in `lib/story-bank.mjs`. True when the trimmed result matches `/^pending(\s*[:(].*)?$/i`: the word alone, or followed by a colon or an opening bracket with optional space before it.

- [ ] **Step 1: Write the failing tests**

```js
test('a story may carry a Scope line, and a story without one parses as before', () => {
  const [withScope, without] = parseStories([
    '### [Ops] Evening shift', '**Scope:** 8 associates, 120,000 units a month', '**A (Action):** Led the shift.', '**R (Result):** Zero missed handoffs.',
    '### [Ops] Intake form', '**A (Action):** Built one form.', '**R (Result):** A week faster.',
  ].join('\n'));
  assert.equal(withScope.scope, '8 associates, 120,000 units a month');
  assert.equal(without.scope, '');
});

test('a result is pending only when the field says so', () => {
  for (const r of ['pending', 'Pending', 'PENDING: Q1 numbers', 'pending (ask finance)']) assert.equal(isResultPending(r), true, r);
  for (const r of ['The pending migration shipped', '', 'Shipped']) assert.equal(isResultPending(r), false, r);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `node --test tests/story-bank-contract.test.mjs`
Expected: FAIL, `scope` is `undefined` and `isResultPending` is not exported.

- [ ] **Step 3: Implement** `STORY_FIELDS.scope`, the two new `parseStories` fields, and `isResultPending`.

- [ ] **Step 4: Edit the template.** In the entry block, add `**Scope:** Team size, volume over a stated period, budget or locations, only as cv.md states them. Optional.` between Task and Action. The limit matters: `story-provenance-check.mjs` classifies figures it recognises ("15-person", "40%", "500+ customers") but returned no claim for "8 associates, 120,000 units a month, $2M budget, 3 sites" when run on 2026-11-13, so the template line is what keeps an unbacked scope figure out. Also reword rule line 15, "Other single-line `**Label:** value` lines are allowed and ignored by the readers", to "Other single-line `**Label:** value` lines are allowed. The readers use `**Scope:**` and ignore the rest". Change the Result line to `**R (Result):** What changed, with figures only if they are in cv.md. Write "pending" when it cannot be measured yet.` Add one rule to the list above it: "A story can be recorded before its result is known. Write `pending` as the Result, and `node story-coverage.mjs` lists it until you fill it in."

- [ ] **Step 5: Run the story suites**

Run: `node --test tests/story-bank-contract.test.mjs tests/story-provenance-gates.test.mjs tests/match-star-flags.test.mjs`
Expected: PASS. A `pending` result holds no figure, so the provenance checker has nothing to classify. The three modes that write stories (`modes/interview-prep.md:286`, `modes/interview/debrief.md:141`, and Block F of `modes/oferta.md`) all point at the template for the format, so they pick up `Scope` and `pending` without an edit.

- [ ] **Step 6: Commit**

```bash
git add lib/story-bank.mjs templates/story-bank.template.md tests/story-bank-contract.test.mjs
git commit -m "feat(story-bank): a story can carry its scope and a result that is still pending"
```

### Task 6: Story coverage report (C2, D2)

**Files:**
- Create: `story-coverage.mjs`
- Create: `tests/story-coverage.test.mjs`
- Modify: `config/local-paths.txt` (add `story-coverage.mjs`), `docs/SCRIPTS.md` (one row beside `story-provenance-check.mjs` at line 1927), `modes/interview/plan.md` (one sentence where it picks stories)

**Interfaces:**
- Consumes: `parseStories`, `isResultPending` from `lib/story-bank.mjs`. `tokenize`, `score` from `match-star.mjs`. `getCareerOpsRoot` from `path-resolver.mjs`.
- Produces: `export const COMMON_PROMPTS: { id: string, prompt: string }[]`, twelve entries. `export function coverage(stories) -> { id, prompt, best: { title, score } | null, status: 'covered' | 'thin' | 'none' }[]`. `export function pendingStories(stories) -> { title, line }[]`.
- CLI: `node story-coverage.mjs [--json] [--story-bank <path>]`. Read-only. Exit 0 with a report. Exit 1 with match-star's message when the bank is missing.

The twelve prompts, as `id` and `prompt`:

| id | prompt |
|---|---|
| `difficult-problem` | solving a difficult problem |
| `changed-priorities` | priorities changed unexpectedly |
| `disagreement` | disagreement conflict with a coworker or stakeholder |
| `mistake` | a mistake you made and fixed |
| `hard-feedback` | receiving difficult feedback |
| `influence` | influence without formal authority |
| `initiative` | taking initiative without being asked |
| `deadline` | a tight deadline under pressure |
| `process-improvement` | improving a process |
| `ambiguity` | a decision with incomplete information ambiguity |
| `working-style` | working with a different working style |
| `missed-goal` | a goal you failed to achieve failure |

Status rule: `best.score >= 3` is `covered`, `1` or `2` is `thin`, and no story scoring above 0 is `none` with `best: null`. A tag hit scores 3, a title hit 2 and a body hit 1 (`match-star.mjs:104-126`), so a story with no tags can still reach `covered` on a title hit plus a body hit. The report prints the score beside every `covered` and `thin` row so the reader can tell.

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStories } from '../lib/story-bank.mjs';
import { COMMON_PROMPTS, coverage, pendingStories } from '../story-coverage.mjs';

const bank = (lines) => parseStories(lines.join('\n'));

test('there are twelve prompts with unique ids', () => {
  assert.equal(COMMON_PROMPTS.length, 12);
  assert.equal(new Set(COMMON_PROMPTS.map((p) => p.id)).size, 12);
});

test('a tagged story covers its prompt, and an empty bank covers none', () => {
  const stories = bank(['### [Team] The vendor dispute', '**A (Action):** Mediated.', '**R (Result):** Resolved.', '**Best for questions about:** conflict, stakeholder']);
  const row = coverage(stories).find((r) => r.id === 'disagreement');
  assert.equal(row.status, 'covered');
  assert.equal(row.best.title, 'The vendor dispute');
  assert.ok(coverage([]).every((r) => r.status === 'none' && r.best === null));
});

test('a body-only match is thin, and a title plus body match is covered with its score', () => {
  const thin = coverage(bank(['### [Ops] Shift work', '**A (Action):** Fixed a process.', '**R (Result):** Faster.']))
    .find((r) => r.id === 'process-improvement');
  assert.equal(thin.status, 'thin');
  assert.equal(thin.best.score, 1);
  const covered = coverage(bank(['### [Ops] Process cleanup', '**A (Action):** Rebuilt the intake process.', '**R (Result):** Faster.']))
    .find((r) => r.id === 'process-improvement');
  assert.equal(covered.status, 'covered');
  assert.equal(covered.best.score, 3);
});

test('stories with a pending result are listed by title and line', () => {
  const stories = bank(['### [Ops] Intake form', '**A (Action):** Built it.', '**R (Result):** pending']);
  assert.deepEqual(pendingStories(stories), [{ title: 'Intake form', line: 1 }]);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `node --test tests/story-coverage.test.mjs`
Expected: FAIL, cannot find module `../story-coverage.mjs`.

- [ ] **Step 3: Implement `story-coverage.mjs`.** `coverage` scores every story with `score(story, tokenize(prompt), [])` and keeps the highest. The CLI prints one line per prompt (`covered`, `thin` or `none`, with the best story's title), then the pending list, then a count line. `--json` prints `{ prompts: [...], pending: [...] }`. The entry-point guard is `isMainModule(import.meta.url)`. Flags go through `validateFlags` from `lib/cli-flags.mjs` with `{ valueFlags: ['--story-bank'], requireOperand: true }`. `tests/validate-flags-value-operand.test.mjs` fails a caller that declares `valueFlags` without that option or an entry in its own-guard list. Importing `match-star.mjs` reads `process.argv` and calls `getCareerOpsRoot()` at load but runs no CLI, so the import is safe.

- [ ] **Step 4: Add a CLI test** to the same file: write a two-story bank to a temp dir, run `node story-coverage.mjs --json --story-bank <path>` with `spawnSync`, and assert exit 0, 12 prompt rows and the pending title. Run a second time with a missing path and assert exit 1.

- [ ] **Step 5: Run the tests and the coverage check**

Run: `node --test tests/story-coverage.test.mjs && node validate-system-paths-coverage.mjs`
Expected: PASS, and no orphan reported once `story-coverage.mjs` is in `config/local-paths.txt`.

- [ ] **Step 6: Document it.** `docs/SCRIPTS.md`: `| node story-coverage.mjs [--json] [--story-bank <path>] | Which of twelve common behavioural prompts your story bank covers, covers thinly or misses, and which stories still have a pending result. Read-only. |`. `modes/interview/plan.md`: at the end of the "Research check — before drafting Block 4" paragraph (line 78), add "Also run `node story-coverage.mjs`, and put any prompt it reports as `none` in Block 4 as a story to draft with the user." Line 107 is inside the fenced output template at lines 91-128, so an instruction there would print in the user's plan."

- [ ] **Step 7: Commit**

```bash
git add story-coverage.mjs tests/story-coverage.test.mjs config/local-paths.txt docs/SCRIPTS.md modes/interview/plan.md
git commit -m "feat(interview): story-coverage reports which common behavioural prompts have no story"
```

### Task 7: Deviations, outcomes and the gate

**Files:**
- Modify: `.claude/skills/upstream-review/SKILL.md` (deviations table)
- Modify: `docs/superpowers/research/2026-11-13-recruiter-advice-review/findings.md` (Outcomes)

- [ ] **Step 1: Add the deviations rows.** One row for the mode and prompt hunks (`modes/pdf.md`, `modes/cover.md`, `modes/text.md`, `modes/latex.md`, `modes/latex-tex.md`, `modes/heuristics/recruiter-side.md`, `modes/add.md`, `modes/interview.md`, `modes/interview-prep.md`, `modes/interview/practice.md`, `modes/interview/plan.md`, `batch/batch-prompt.md`, `openai-tailor.mjs`): ADAPT, keep our hunks, pinned by `tests/recruiter-advice-wording.test.mjs`. One row for `templates/story-bank.template.md` and `lib/story-bank.mjs` (the `Scope` field and the pending result): ADAPT, pinned by `tests/story-bank-contract.test.mjs`.

`tests/fork-deviations-covered.test.mjs` will only demand the `templates/story-bank.template.md` row. `modes/`, `tests/`, `lib/` and `docs/` are already named in the table as directory tokens, so a forgotten modes row passes the test. Check the modes row by eye.

- [ ] **Step 2: Fill in Outcomes** in the findings file: one row per finding, with "fixed in this branch" and its test, "not built" with the reason from the decisions table, or "advice not taken up". Commit `docs(research): record the outcome of each recruiter-advice finding`.

- [ ] **Step 3: Run the full gate**

Run: `node scripts/check-syntax.mjs && node test-all.mjs --quick && node --test tests/fork-deviations-covered.test.mjs`, then `node i18n-drift.mjs --summary`
Expected: all pass, and the drift summary matches the saved one. The deviations test runs after the commit in Step 2, since it diffs `HEAD`.

- [ ] **Step 4: Read each edited mode once, end to end,** as the agent that will follow it. Check that the new copy does not contradict a neighbouring line, that "NEVER invent" still appears wherever it did, and that `modes/_custom.md` can still override the new defaults.

- [ ] **Step 5: Review, then CodeRabbit, then one push and the PR.** `node .githooks/coderabbit-review.mjs` as its own command. The PR body states that no personal data was added and that `node test-all.mjs` passed. Merge only on Jason's go.

## Not in this plan

- D1, D3 and D4, unless Jason overturns the recommendation above.
- A lint for bullets per role. The advice calls seven to ten a judgment call, and a count rule would fire on honest CVs.
- A lint for ambiguous numbers. Telling a volume with no period from one with a period is a heuristic. Task 1 makes it an instruction to ask the user.
- The translated mode sets. They keep their current wording until a translation pass.
- Teaching `story-provenance-check.mjs` to classify scope figures such as "8 associates" or "3 sites". Task 5's template line carries the rule for now. It is worth its own change, since AGENTS.md asks that a scope claim from the story bank trace to a primary file.
- A lint for a role described in one duty-only paragraph. Task 4 lints bullets only.
- A live check that a rendered CV reads differently. Mode wording changes what an agent writes, and this plan's tests pin the wording, not the agent's output. The first CV generated after the merge is the real check.
