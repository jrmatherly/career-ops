# Web browser-suite flakes Implementation Plan

> **Landed:** PR 31 merged as `b49c754f` and its six-suite follow-up PR 32 as `5dcb2364` on 2026-11-07 (trail rows 22:16Z and 23:5xZ in `docs/superpowers/research/2026-11-06-reactive-resume-convergence/decisions.tsv`; failures tabled in `docs/superpowers/research/2026-11-07-web-browser-suite-flakes/REPORT.md`). Boxes ticked at the move to `completed/` from that evidence, not step by step.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every `web/tests/lib/*.browser.test.mjs` suite immune to React 19.2's streaming reveal window, so Web CI stops failing on `back-link-scroll`, `inbox-undo` and their siblings without retries.

**Architecture:** The failures have one cause, recorded in `docs/superpowers/research/2026-11-07-web-browser-suite-flakes/REPORT.md`: for up to 300 ms after `load`, a Next 16 page can hold the server copy of its route segment in `div#S:0[hidden]` next to the hydrated client copy, and `page.goto` resolves before that window closes. The app is correct; the tests assume one copy and a settled layout. The fix is test-only and in two layers: adopt upstream's visible-scoped locators for the three pipeline suites (PR 6641), and add one shared helper that waits for the reveal, used by the inbox suites and available to every other suite. An in-repo delay proxy turns the race into a deterministic reproduction so the fix is verified against the failure, not against luck.

**Tech Stack:** Node 24 test runner, playwright-core driving Google Chrome, `web/tests/browser-suites.mjs` (one built server per suite on a disposable data root).

**Spec:** the research report above. Upstream reference: https://github.com/career-ops-hq/career-ops/pull/6641.

## Global Constraints

- Test-only. No file under `web/src/` changes; the 300 ms reveal throttle is React's, not ours.
- Fork rules from `.claude/rules/dev-workflow.md` and the upstream-review skill: branch in a sibling worktree, Conventional Commits with a scope, `/simplify` then `/code-review` before each commit, `node scripts/check-syntax.mjs` and `node test-all.mjs --quick` before the push, plus `npm run typecheck`, `npm test` and `npm run build` in `web/`.
- Upstream's three test files are taken with `git cherry-pick -x` so the next merge absorbs them by patch id; our own edits avoid those three files.
- Every fork file inside `web/tests/` gets a row in the deviations table of `.claude/skills/upstream-review/SKILL.md` (Notes cell opens with KEEP), including the helper and the proxy.
- No `test.retry`, no sleeps as the fix, no change to the runner's one-retry policy in `web/tests/browser-suites.mjs`.
- App-made worktrees can carry a stale `node_modules`: symlink the main checkout's `node_modules` in and copy `web/node_modules` with `cp -cR` (Turbopack refuses a symlink).

## Review Focus

1. A page whose segment arrives after the first paint (mode B): every locator the suite uses in its first second must ignore `div#S:0[hidden]`, and any height or count read must happen after the reveal. Pinned by Task 3's proxy run.
2. `page.reload()` inside a suite (`resetInbox` in `inbox-undo`): the same window reopens on every reload, so the helper must wrap reloads too. Pinned by Task 2's test of the helper on a reload.
3. A page with no streamed segment at all (mode A, `S:0` already gone at `load`): the helper must return at once rather than wait for an element that never appears. Pinned by Task 2.
4. A suite that navigates with `page.goto` inside a `t.test` subtest, not only at the top: `inbox-undo` has three. Pinned by Task 3's 10-of-10 run through the proxy.
5. Upstream later merging PR 6641 in a different shape: the cherry-pick must stay a pure patch so the merge reports `[picked]` instead of a conflict. Pinned by Task 1's `git cherry-pick -x` and the deviations rows that say ADOPT for those three files.

---

### Task 1: Adopt upstream PR 6641

**Files:**
- Modify (by cherry-pick): `web/tests/lib/back-link-scroll.browser.test.mjs`, `web/tests/lib/pipeline-inline-status.browser.test.mjs`, `web/tests/lib/pipeline-window.browser.test.mjs`
- Modify: `.claude/skills/upstream-review/SKILL.md` (three rows under "Deviations decided")

**Interfaces:**
- Produces: the three suites scoped to visible elements, as upstream will ship them.

- [x] **Step 1: Fetch and cherry-pick**

```bash
git fetch careerops refs/pull/6641/head
git cherry-pick -x FETCH_HEAD
```

Expected: one commit on the branch with upstream's subject `test(web): scope the pipeline browser suites to the visible table` and a `cherry picked from commit dcc65b70…` line. If the PR has merged by then, cherry-pick the merge's squash commit from `careerops/main` instead.

- [x] **Step 2: Syntax check**

Run: `node --check web/tests/lib/back-link-scroll.browser.test.mjs web/tests/lib/pipeline-inline-status.browser.test.mjs web/tests/lib/pipeline-window.browser.test.mjs`
Expected: silent exit 0.

- [x] **Step 3: Deviations rows**

Add one row per file: Upstream column names the file as PR 6641 ships it, Ours says "taken early by cherry-pick", Notes opens with ADOPT ("the merge absorbs the pick; a later upstream change to the file is ADOPT").

- [x] **Step 4: Commit**

The cherry-pick is already a commit. Commit the rows as `docs(upstream-review): record the PR 6641 pick`.

### Task 2: A shared wait for the streaming reveal

**Files:**
- Create: `web/tests/helpers/streaming.mjs`
- Modify: `web/tests/lib/inbox-undo.browser.test.mjs` (every `page.goto` and `page.reload`, 5 sites), `web/tests/lib/inbox-keys.browser.test.mjs` (every `page.goto`)
- Test: `web/tests/lib/streaming-helper.test.mjs`

**Interfaces:**
- Produces: `export async function settled(page, action)`: runs `action()` (a `goto` or `reload` promise), then waits until `document.querySelector('body > div[hidden][id^="S:"]')` is null and `document.readyState === "complete"`, with a 10 s timeout that throws naming the ids still hidden. Returns what `action()` resolved to.
- Consumes: nothing from other tasks.

- [x] **Step 1: Write the failing unit test**

`web/tests/lib/streaming-helper.test.mjs` (plain node:test, no server): build a page object stub whose `waitForFunction` records the predicate, and assert (a) `settled` calls the action before waiting, (b) the predicate returns true for a document with no hidden `S:` div and false for one with `<div hidden id="S:0">`, evaluated against a tiny JSDOM-free fake `document` (`querySelector` and `readyState` only), (c) a rejected action rejects `settled`.

Run: `cd web && node --test tests/lib/streaming-helper.test.mjs`
Expected: FAIL, module not found.

- [x] **Step 2: Implement the helper**

One exported function, a header comment of three lines naming the mechanism ("React's streaming reveal keeps a server copy in `div#S:0[hidden]` for up to 300 ms after `load`; Playwright's strict mode counts hidden elements; see the research report path"). Keep the predicate a single `page.waitForFunction` so it survives a `reload`.

Run the unit test. Expected: PASS.

- [x] **Step 3: Use it in the two inbox suites**

Replace `await page.goto(x)` with `await settled(page, () => page.goto(x))` and `await page.reload()` with `await settled(page, () => page.reload())`. Leave the `row()` locators as they are: once the reveal has happened there is one copy, and an unscoped locator keeps catching a real duplicate render.

Run: `cd web && npm run build && node tests/browser-suites.mjs inbox`
Expected: `inbox-keys` and `inbox-undo` pass on the first attempt.

- [x] **Step 4: Deviations rows and commit**

Rows for `web/tests/helpers/streaming.mjs`, `web/tests/lib/streaming-helper.test.mjs` (KEEP) and the two suites (ADAPT: "our hunk is the `settled(...)` wrapper on each navigation; an upstream hunk elsewhere is ADOPT"). Commit `test(web): wait for the streaming reveal in the inbox suites`.

### Task 3: A deterministic reproduction and the proof

**Files:**
- Create: `web/tests/helpers/delay-proxy.mjs` (from `docs/superpowers/research/2026-11-07-web-browser-suite-flakes/delay-proxy.mjs`, with a usage header and an argument check)
- Modify: `web/tests/browser-suites.mjs` (one optional env var, `BROWSER_SUITES_SEGMENT_DELAY_MS`: when set, the runner starts the proxy in front of each suite's server and hands the suite the proxy's URL)

**Interfaces:**
- Consumes: the runner's `startServer`/`freePort`.
- Produces: `node tests/browser-suites.mjs <name>` under `BROWSER_SUITES_SEGMENT_DELAY_MS=100` reproduces mode B on every load.

- [x] **Step 1: Prove the reproduction reproduces**

Before touching the suites' fix, check out the parent of Task 2's commit and run:

```bash
cd web && BROWSER_SUITES_SEGMENT_DELAY_MS=100 node tests/browser-suites.mjs inbox-undo
```

Expected: fails at `inbox-undo.browser.test.mjs:55` with the strict-mode message (the CI failure). Save the output under `/tmp/swarm-web-flakes/repro-before.txt`.

- [x] **Step 2: Prove the fix**

On the branch head, 10 runs each:

```bash
for i in $(seq 10); do BROWSER_SUITES_SEGMENT_DELAY_MS=100 node tests/browser-suites.mjs inbox-undo || echo FAIL $i; done
for i in $(seq 10); do BROWSER_SUITES_SEGMENT_DELAY_MS=100 node tests/browser-suites.mjs back-link-scroll || echo FAIL $i; done
for i in $(seq 10); do BROWSER_SUITES_SEGMENT_DELAY_MS=100 node tests/browser-suites.mjs inbox-keys || echo FAIL $i; done
```

Expected: no `FAIL` line and no "passed only on a second run" warning. Save under `/tmp/swarm-web-flakes/`.

- [x] **Step 3: The whole runner once, with and without the delay**

Run: `node tests/browser-suites.mjs` and `BROWSER_SUITES_SEGMENT_DELAY_MS=100 node tests/browser-suites.mjs`
Expected: the undelayed run is green. The delayed run names which of the other 33 suites also sit on the race; list them in the PR body as follow-ups (each is a one-line `settled` wrap) and fix none here.

- [x] **Step 4: Deviations row and commit**

Row for the proxy (KEEP) and the runner hunk (ADAPT: "our hunk is the `BROWSER_SUITES_SEGMENT_DELAY_MS` block; the rest of the runner is ADOPT"). Commit `test(web): reproduce the streaming reveal race on demand`.

### Task 4: PR

- [x] Pre-push checks from Global Constraints.
- [x] `gh pr create --base main` with a body that names the race in one sentence per fixed suite, the 10-of-10 evidence paths, the list from Task 3 Step 3, and the standard lines (no personal data added, `node test-all.mjs` passed).
- [x] `/pr-review-toolkit:review-pr`; triage per `references/bugbot-triage.md`.
- [x] Web CI green without the "Flaky browser suite" warning, then raise `gh pr merge <n> --merge --delete-branch` for the operator.
