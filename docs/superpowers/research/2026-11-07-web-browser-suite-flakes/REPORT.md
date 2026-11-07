# Two flaky Web CI browser suites: one root cause

Reproduction by a read-only worker on 2026-11-07 against the production build of `web/` at `main` `5c0cfc88` (Next 16.4.1, react-dom 19.2.8), with the unmodified test files. Scripts: `probe.mjs` (time-series DOM probe) and `delay-proxy.mjs` (holds back the streamed segment by N ms) in this directory. The raw probe data and HTML dumps stayed in the session scratchpad; the tables below carry the numbers.

## The mechanism

1. The route segment streams into `<div hidden id="S:0">` at the end of `<body>`.
2. If a frame painted before that segment arrived, React's `$RC` does not move it into place right away. It sets the boundary marker to `$~` and schedules the move (`$RV`) for `$RT + 300 ms` (`node_modules/next/dist/compiled/react-dom/cjs/react-dom-server.node.production.js`, the `$RT+300` expression; verified by grep).
3. `load` fires during that wait. `page.goto` resolves on `load`, so the test starts while the content is hidden in `S:0` and the visible page is one viewport tall (`scrollHeight` 900).
4. About 25-35 ms after `load`, hydration renders a second, client copy inside `main#main-content`. `S:0` still holds the server copy.
5. Both copies stay until `$RV` runs, at about 300-320 ms page time. No console message or page error marks any of this.

| Mode | When it happens | DOM at `load` | After `load` |
|---|---|---|---|
| A, fast path | segment arrives before the first paint | content already revealed, `S:0` gone at 11-49 ms | one copy |
| B, throttled reveal | a frame painted before the segment arrived | content only in `div#S:0[hidden]`, body 900 px | client copy from ~75-140 ms, plus the hidden `S:0` copy until ~300-320 ms |

The long tracker page (146 KB of HTML) lands in mode B on its own, in 15 of 20 probe loads locally. The inbox fixture page (71 KB) never did on its own (0 of 88 loads across baseline, CPU 6x, CPU burners and network throttling) and lands in mode B 10 of 10 times when its segment arrives 30 ms late. A slower server render, as on a CI runner, produces that delay (inferred, not measured on CI).

Two earlier hypotheses did not hold: the streamed HTML carries no `loading.tsx` skeleton (the fallback is the page's own `<Suspense>` with no fallback), and `tbody[hidden]` (`isPending`) was false in every sample. The copy is also not a Next router Activity boundary: a fresh `goto` has no previous segment to keep.

## Failure 1: `back-link-scroll`, line 42

First broken assumption: `document.body.scrollHeight`, read once right after `page.goto` returns, measures the full list. In mode B `goto` returns before hydration, the read sees the 900 px shell, the loop scrolls to y = 0, 400 and 800 only (800 ms wait each) and never reaches row 60 at about 2700 px. It fails in about 3 s, which matches every CI occurrence (3.4-3.6 s, both attempts).

| Condition | Runs | Failed at :42 |
|---|---|---|
| unmodified test, direct | 6 | 0 (the read happens at 114-159 ms, after hydration) |
| instrumented copy, direct | 10 | 0 (every read 4867-4899 px) |
| copy, CPU 4x (CDP `Emulation.setCPUThrottlingRate`) | 8 | 0 |
| copy, CPU 6x | 8 | 1 (read `scrollHeight` 900 with `S:0` present, failed in 4 s) |
| unmodified test, 100 ms segment delay through `delay-proxy.mjs` | 6 | 3 (each at `:42:10` in 3 s) |
| copy, 100 ms delay | 4 | 1 (read 900, then 38 `tbody tr`, two copies, at t 151) |

Baseline probe with no load: 13 of 20 loads read below 2000 px, every one of them 900 px; `load` at 41-52 ms; `scrollHeight` passed 4000 px at 73-83 ms. Where the two copies sit during the overlap:

```
19 rows in tbody<table<div<div<main#main-content<div
19 rows in tbody<table<div<div<div#S:0[hidden]
```

Why it passes locally: a freshly launched browser is cold, so `goto` resolves at 115-160 ms page time, after the client render at about 75-85 ms. The read wins the race only when the gap between `load` and hydration grows.

## Failure 2: `inbox-undo`, line 55

First broken assumption: `/pipeline` holds one copy of each inbox row once `goto` returns. In mode B it holds two, a client copy under `main#main-content` and the server copy under `div#S:0[hidden]`. Playwright's strict-mode count includes hidden elements, so `locator('li').filter({ hasText: 'Fixture Alpha' }).getByTitle(...)` resolves to two buttons. Reproduced with the exact CI error at `inbox-undo.browser.test.mjs:55:71`.

| Condition | Loads / runs | Two copies seen | Real test failed |
|---|---|---|---|
| probe, direct | 30 | 0 | |
| probe, CPU 6x | 20 | 0 | |
| probe, 11 CPU burners on 12 cores | 30 | 0 | |
| probe, network 100 KB/s | 8 | 0 (everything slowed together) | |
| probe, segment delayed 30 ms | 10 | 10 | |
| probe, segment delayed 100 ms | 10 | 10 | |
| unmodified test, direct | 4 | | 0 |
| unmodified test, 30 ms delay | 4 | | 4 (three at `:55:71`, one at `:95`, the `resetInbox` reload) |
| unmodified test, 100 ms delay | 4 | | 4 (all at `:55:71`) |

Parent chains of the two buttons at t 137 (100 ms delay):

```
button<div<li<ul<div<div<div<main#main-content<div
button<div<li<ul<div<div<div<div#S:0[hidden]
```

The duplicate is not app markup: `inbox-triage.tsx` renders one `<ul>`, `pipeline-view.tsx` mounts `InboxTriage` once, and the two warm-up POSTs are `page.request` calls made before `goto`.

## `goto` and streaming

Every suite calls `page.goto(url)` with no `waitUntil`, so it waits for `load` only. Next keeps streaming past `load`. Hydration lands 25-35 ms after `load` without throttling; React's batched reveal removes `S:0` at about 300-320 ms page time, 250 ms or more after `load` in mode B.

## Not verified

- Why hydration client-renders the `$~` boundary instead of waiting for `_reactRetry` (a parent update before the boundary finished hydrating is the guess).
- That CI's inbox failures come from a slow server render; the proxy shows a 30 ms late segment is enough, CI's server timing was not measured.
- The sibling suites `pipeline-inline-status`, `pipeline-window` and `evaluation-options` show the same two-copies shape on CI and were not run.

## Upstream

`career-ops-hq/career-ops` PR 6641 (open, green, awaiting review, head `dcc65b70`) reached the same diagnosis for `back-link-scroll`, `pipeline-inline-status` and `pipeline-window` and fixed the tests only (visible-scoped locators, re-read height per step, poll for counts). It does not cover `inbox-undo` or `inbox-keys`, and leaves the "why a hidden copy" question open; this report answers it.
