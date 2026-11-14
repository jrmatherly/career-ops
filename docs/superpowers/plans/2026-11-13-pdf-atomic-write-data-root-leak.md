# PDF Atomic-Write Test Data-Root Leak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `tests/generate-pdf-atomic-write.test.mjs` from writing `data/pdf-index.tsv` into the developer's checkout when it runs outside `test-all.mjs`, and keep the next rendering suite from doing the same.

**Architecture:** The suite gains the import eight of the other eleven rendering suites already have, `tests/helpers.mjs`, which pins `CAREER_OPS_ROOT` to a scratch directory before `generate-pdf.mjs` is imported. One new structural test fails when a suite that renders in-process has neither that import nor its own root pin. No product file changes.

**Tech Stack:** Node.js `.mjs`, `node:test`.

**Spec:** `docs/superpowers/research/2026-11-13-pdf-index-test-leak/findings.md`

**Dry run:** Task 1 was run on 2026-11-13 in a worktree and reverted, and an independent reviewer then ran both tasks in a throwaway clone. Step 2 fails with exactly `['generate-pdf-atomic-write.test.mjs']`, Step 6 leaves nothing in `data/`, and Step 7 passes. With both tasks applied the reviewer's `node test-all.mjs --quick` gave 22,096 passed, 0 failed, and the clone audit left no ignored file. The first draft of the guard failed `tests/walk-tree.test.mjs`. Step 1 below carries the corrected form. `tests/fork-deviations-covered.test.mjs` has not been run against a commit of this change.

## Decisions for Jason before execution

Each is one line to overturn.

| Decision | Recommendation | Why |
|---|---|---|
| Change `generate-pdf.mjs` so the index writer refuses a PDF outside its workspace | Do not build. | It is an upstream product file, the problem is test-only, and suites that set `CAREER_OPS_PDF_INDEX` and render into their own temp directory would break (`tests/pdf-index-kind.test.mjs:160-190`). |
| Offer the suite fix upstream | Yes, after it lands here, as its own PR. Not part of this plan. | The suite is upstream's (`37cd9ec4`, #5259), and upstream takes bug fixes straight to a PR. |
| The suites that fail outside the runner | Leave for a separate investigation. | Between two and seven fail per run at concurrency 10, mostly the follow-up suites and `cv-visual`. They fail for reasons this leak does not explain, and none leaves a file behind. |
| Scan `tests/` subdirectories in the new guard | Top level only. | All twelve rendering suites are top-level, and `tests/mjs-files.test.mjs` creates and deletes fixture directories under `tests/` during a parallel run, so a recursive walk can read a file that is gone. |

## Global Constraints

- This work lands on the existing branch `feat/recruiter-advice-and-test-leak`, in the sibling worktree `../career-ops-recruiter-advice-and-test-leak`, beside the recruiter advice follow-ups. Jason decided this on 2026-11-13. One PR covers both. Do not cut a new branch or worktree. No merge without Jason's word in-session.
- This plan and its findings file are committed on `main`, and the branch is rebased onto that commit. If the worktree has no findings file, rebase the branch onto `main` first.
- The worktree already has `node_modules` and `web/node_modules`. If either is missing, clone it before running tests: `cp -c -R ../career-ops/node_modules node_modules`.
- No product file changes. `generate-pdf.mjs` is not edited.
- A new test is its own file under `tests/*.test.mjs`. No `process.exit()` or `finish()` in a suite.
- No personal data. Fixtures are inline strings with no names.
- Every upstream file this plan edits gets a row in the deviations table in `.claude/skills/upstream-review/SKILL.md`. `tests/fork-deviations-covered.test.mjs` diffs `HEAD`, so run it after committing.
- Conventional Commits with a scope. Before the push: `node scripts/check-syntax.mjs`, `node test-all.mjs --quick`, then `node .githooks/coderabbit-review.mjs` as its own command.
- Run nothing else that executes tests in this worktree while `node test-all.mjs --quick` is running. The runner's guard reports a file written by any process, which is how this leak was first misread as intermittent.

## Review Focus

- **A suite that names the renderer only in a comment.** It does not render, so the guard must not select it. Comments are stripped before matching. Task 1 tests it.
- **A suite whose only mention of `CAREER_OPS_ROOT` is in a comment.** That is not a pin. Task 1 tests it.
- **A suite under `tests/providers/` importing `'../helpers.mjs'`.** The guard does not scan subdirectories, but its pin check is also the documented rule, so it must accept that spelling. Task 1 tests it.
- **The renderer is renamed, or the guard's pattern stops matching.** The guard would pass with nothing selected. It asserts it selected at least ten suites. Task 1 tests it.
- **A suite that statically imports `generate-pdf.mjs` above its helpers import.** The guard passes it and it still leaks, because the renderer reads the data root first. No suite does this today: every rendering suite loads the renderer with `await import()`. Check it by eye in review.
- **A suite whose only mention of `CAREER_OPS_ROOT` blanks it**, such as `CAREER_OPS_ROOT: ''` or `ownRootEnv()` in a child's environment. The guard counts any mention as a pin. No rendering suite passes that way today while rendering in its own process.
- **A developer already has a real `data/pdf-index.tsv`.** The suite run alone must leave its content unchanged, not only avoid creating the file. Task 1's verification step compares a checksum.

---

### Task 1: The rendering suites pin a data root, and a guard keeps it so

**Files:**
- Create: `tests/rendering-suites-pin-data-root.test.mjs`
- Modify: `tests/generate-pdf-atomic-write.test.mjs:14-22` (one import and its comment)

**Interfaces:**
- Consumes: `ROOT` and `stripJsComments(source: string) -> string` from `tests/helpers.mjs`.
- Produces: nothing other tasks use.

- [ ] **Step 1: Write the failing test**

```js
// tests/rendering-suites-pin-data-root.test.mjs — a suite that renders in-process pins a data root.
//
// generate-pdf.mjs resolves its data root when it is imported, and every
// successful render appends a row to that root's data/pdf-index.tsv. A suite
// that imports it without tests/helpers.mjs, and without setting
// CAREER_OPS_ROOT itself, writes that row into the developer's checkout
// whenever it runs outside test-all.mjs.
//
// Top-level suites only: tests/mjs-files.test.mjs creates and deletes fixture
// directories under tests/ while suites run in parallel.
//
// Run:  node --test tests/rendering-suites-pin-data-root.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, stripJsComments } from './helpers.mjs';

const SELF = 'rendering-suites-pin-data-root.test.mjs';
const namesRenderer = (source) => {
  return /\b(?:renderHtmlToPdf|renderBatch)\s*\(/.test(stripJsComments(source));
};
const pinsDataRoot = (source) => {
  const code = stripJsComments(source);
  return /['"](?:\.\.?\/)+helpers\.mjs['"]/.test(code) || /\bCAREER_OPS_ROOT\b/.test(code);
};

test('the two checks read code, not comments', () => {
  assert.equal(namesRenderer('await renderHtmlToPdf(html, out, {});'), true);
  assert.equal(namesRenderer('// see renderHtmlToPdf(html) in generate-pdf.mjs\nconst x = 1;'), false);
  assert.equal(pinsDataRoot("import { rmSync } from './helpers.mjs';"), true);
  assert.equal(pinsDataRoot("import '../helpers.mjs';"), true);
  assert.equal(pinsDataRoot('const env = { ...process.env, CAREER_OPS_ROOT: dir };'), true);
  assert.equal(pinsDataRoot('// CAREER_OPS_ROOT is inherited from the runner\nconst x = 1;'), false);
});

test('every suite that renders in-process pins a data root', () => {
  const dir = join(ROOT, 'tests');
  const rendering = readdirSync(dir)
    .filter((name) => name.endsWith('.test.mjs') && name !== SELF)
    .filter((name) => namesRenderer(readFileSync(join(dir, name), 'utf-8')));
  assert.ok(rendering.length >= 10, `only ${rendering.length} rendering suites found: the pattern has gone blind`);
  const unpinned = rendering.filter((name) => !pinsDataRoot(readFileSync(join(dir, name), 'utf-8')));
  assert.deepEqual(unpinned, [], 'import ./helpers.mjs before importing the renderer');
});
```

`namesRenderer` has a braced body on purpose. The walker ban in `tests/walk-tree.test.mjs` misreads a brace-less arrow function in a file that calls `readdirSync` as a hand-rolled directory walker, and fails.

The guard selects a suite that names the renderer anywhere in its code. Today that is twelve suites: nine render in their own process and three only inside a child script they spawn. The three are pinned too, so selecting them costs nothing.

- [ ] **Step 2: Run it and see it fail**

Run: `node --test tests/rendering-suites-pin-data-root.test.mjs`
Expected: the first test passes. The second fails with `['generate-pdf-atomic-write.test.mjs']` as the actual value, and nothing else in the list.

- [ ] **Step 3: Record the leak before the fix**

Run, from the worktree root:

```bash
shasum data/pdf-index.tsv 2>/dev/null; env -u CAREER_OPS_ROOT -u CAREER_OPS_DATA_DIR -u CAREER_OPS_TEST_DATA_ROOT node --test tests/generate-pdf-atomic-write.test.mjs; git status --short --ignored data/
```

Expected: 2 tests pass and `!! data/pdf-index.tsv` is listed. If the `shasum` line printed nothing, the file is the leak: remove it with `rm data/pdf-index.tsv`. If it printed a checksum, a real index was there first, so leave the file and delete only the row whose path contains `career-ops-pdf-atomic-`.

- [ ] **Step 4: Pin the suite's data root**

In `tests/generate-pdf-atomic-write.test.mjs`, add this import after the `node:url` import and before the `const ROOT` line. It must stay a static import, so it runs before the `await import()` of `generate-pdf.mjs` below it.

```js
// Loaded for its side effect: it pins CAREER_OPS_ROOT to a scratch directory.
// generate-pdf.mjs reads the data root when it is imported, and a successful
// render records a row in that root's data/pdf-index.tsv.
import './helpers.mjs';
```

Change nothing else in the file. The `workspaceRoot: workspace` option stays: it places the temp HTML, and the index row goes to the scratch root.

- [ ] **Step 5: Run the guard and the suite**

Run: `node --test tests/rendering-suites-pin-data-root.test.mjs tests/generate-pdf-atomic-write.test.mjs tests/walk-tree.test.mjs`
Expected: PASS, 24 tests, 0 failures.

- [ ] **Step 6: Run the suite alone and check the checkout**

Run the command from Step 3 again.
Expected: 2 tests pass, and `git status --short --ignored data/` prints nothing. If a real `data/pdf-index.tsv` existed before Step 3, its `shasum` is unchanged.

- [ ] **Step 7: Run the suite under the runner**

Run: `node test-all.mjs --quick --only generate-pdf-atomic-write`
Expected: the suite passes and the run does not print "the test run changed the real data root".

- [ ] **Step 8: Commit**

```bash
git add tests/rendering-suites-pin-data-root.test.mjs tests/generate-pdf-atomic-write.test.mjs
git commit -m "test(generate-pdf): the atomic-write suite pins its data root when run alone"
```

### Task 2: Say it where a test author looks, and record it

**Files:**
- Modify: `tests/README.md` ("The suite's data root", lines 176-201, the end of the file)
- Modify: `.claude/skills/upstream-review/SKILL.md` (deviations table)
- Modify: `docs/superpowers/research/2026-11-13-pdf-index-test-leak/findings.md` (Outcomes)

- [ ] **Step 1: Correct the README's opening claim**

In "The suite's data root", the sentence "Every script a test spawns inherits that, so the default for a new test is already safe." wraps across lines 181-182, so search for its second half. It becomes:

```markdown
Every script a test spawns inherits that. A suite is covered when it is run by
`test-all.mjs`, or when it imports `helpers.mjs` itself.
```

- [ ] **Step 2: Add the rule as the first bullet of that section's list**

```markdown
- **A test that imports a script in-process**, rather than spawning it, imports
  `helpers.mjs` first, even when it uses nothing from it. A script reads the
  data root when it is imported, so a suite without that import resolves to the
  developer's checkout whenever it is run on its own.
  `rendering-suites-pin-data-root.test.mjs` enforces this for the suites that
  render a PDF.
```

- [ ] **Step 3: Add the audit command at the end of the file, after the section's last paragraph**

````markdown
To check that no suite leaves a file behind when it runs outside the runner,
run every suite that way in a throwaway clone and list what changed:

```bash
audit=$(mktemp -d) && git clone -q --local . "$audit" && cd "$audit" \
  && cp -c -R "$OLDPWD/node_modules" node_modules \
  && { env -u CAREER_OPS_ROOT -u CAREER_OPS_DATA_DIR -u CAREER_OPS_TEST_DATA_ROOT \
       node --test --test-concurrency=10 "tests/**/*.test.mjs" > /dev/null 2>&1; \
       git status --short --ignored | grep -v node_modules; }
```

An empty list is a pass. The exit status is not: a few suites fail outside the
runner for reasons of their own. The clone holds committed files only, so
commit first. Every step is chained, so a failed clone never runs the suites
in the checkout you are standing in. It takes about two and a half minutes.
````

On Linux, `cp -c` is `cp --reflink=auto`. Say so in one line under the block.

- [ ] **Step 4: Add the deviations rows**

Under a new heading `### PDF atomic-write test data-root leak (2026-11-13)` before `## Decision log template`, with the plan and findings paths on the line below it and the same four-column table as the sections above:

| Upstream | Ours | Status | Notes |
| --- | --- | --- | --- |
| `tests/generate-pdf-atomic-write.test.mjs` imports `generate-pdf.mjs` with no data-root pin | `import './helpers.mjs'` before the renderer is imported | ADAPT | Keep our hunk until upstream has it. Pinned by `tests/rendering-suites-pin-data-root.test.mjs`, a fork test: KEEP. Offer it upstream as a bug fix. |
| `tests/README.md` says a new test is safe by default | "The suite's data root" says a suite is covered under the runner or when it imports `helpers.mjs`, adds the in-process import rule, and gives the clone audit command | ADAPT | Keep our hunks. |

- [ ] **Step 5: Fill in Outcomes in the findings file**

Replace the "To be filled in" line with: the branch name `feat/recruiter-advice-and-test-leak`, "fixed in this branch" for the leak with the guard test's name, "not built" for the index-writer guard with the reason from the decisions table, and "not investigated" for the suites that fail outside the runner.

- [ ] **Step 6: Commit**

```bash
git add tests/README.md .claude/skills/upstream-review/SKILL.md docs/superpowers/research/2026-11-13-pdf-index-test-leak/findings.md
git commit -m "docs(tests): a suite that imports a script in-process loads the helpers first"
```

- [ ] **Step 7: Run the full gate**

Run: `node scripts/check-syntax.mjs && node test-all.mjs --quick && node --test tests/fork-deviations-covered.test.mjs`
Expected: all pass, and `git status --short --ignored data/` prints nothing afterwards.

- [ ] **Step 8: Run the clone audit once**

Run the block from Step 3 against the branch.
Expected: an empty list. This is the check that found the leak, and the one that proves it closed.

- [ ] **Step 9: Review, then CodeRabbit, then one push and the PR**

`node .githooks/coderabbit-review.mjs` as its own command. The PR body states that no personal data was added and that `node test-all.mjs` passed. Merge only on Jason's go.

## Not in this plan

- Any change to `generate-pdf.mjs`: the index writer's import-time roots, the row it records for a PDF outside its workspace, and the `output/` directory it creates on import.
- The suites that fail outside the runner.
- The unexplained single failure in an earlier quick-suite run, and the `tests/batch-dealbreaker-skip.test.mjs` flake the handoff notes.
- A guard for suites in `tests/` subdirectories, or for in-process importers that do not render. The clone audit covers both by hand.
- The upstream PR.
