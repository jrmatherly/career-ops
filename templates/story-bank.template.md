# Story Bank — Master STAR+R Stories

Your reusable interview stories. Evaluations (Block F), `interview-prep` and `interview/debrief` add to this file; `npm run star`, `negotiation-roi.mjs`, `story-provenance-check.mjs` and `story-coverage.mjs` read it. Aim for 5-10 deep stories you can bend to almost any behavioral question, not 100 shallow ones.

## Entry format

Every story is a `### ` block in exactly this shape. The readers match it literally, so:

- One field per line, each starting with its bold label.
- `**A (Action):**` is required. A block without it is invisible to `npm run star`.
- The `### ` heading and the field labels stay in **English**, whatever language the story itself is written in.
- Never paste Block F table rows here. Turn each row into a block.
- Do not add a `**Provenance:**` line when writing from an evaluation: an evaluation does not get to vouch for its own figures. Without a marker, `story-provenance-check.mjs` sorts each figure by `cv.md`: `existing` when the same number appears there in context, `supportedByResume` when `cv.md` supports the fact but not the number, otherwise `derived-unverified`.
- When the user answers for a story's figures, add `**Provenance:**` followed by exactly one of `source: cv.md`, `user-stated YYYY-MM-DD` or `user-cannot-confirm`, alone on its line. Any text after the value makes the readers ignore the marker.
- A story can be recorded before its result is known. Write `pending` as the Result, and `node story-coverage.mjs` lists it until you fill it in.
- `**Scope:**` is optional. `story-provenance-check.mjs` checks every figure on it against `cv.md`, like any other figure in the story.
- Other single-line `**Label:** value` lines are allowed and ignored by the readers. Keep tables and `#`/`##` headings out of a story, since the readers stop at them, and keep code fences out too, since their content is skipped.

```markdown
### [Theme] Story Title
**Source:** Report #NNN — Company — Role
**S (Situation):** The context, in one line.
**T (Task):** What you were responsible for.
**Scope:** Team size, volume over a stated period, budget or locations, only as cv.md states them.
**A (Action):** What you did, specifically.
**R (Result):** What changed, with figures only if they are in cv.md. Write "pending" when it cannot be measured yet.
**Reflection:** What you learned or would do differently.
**Best for questions about:** leadership, ambiguity, stakeholder conflict
```

## Stories
