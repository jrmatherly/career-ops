# Web audit report

Commit `2edd1b33`, 2026-11-16. Slice 3 of 6: correctness, reliability, maintainability and user experience of the Next.js web app (`web/`), read from the code. API-route security is another slice. Read-only audit. Repro and scan scripts are in `repro/web/`. Rename `.mjs.txt` (or `.cjs.txt`) to drop the `.txt`, and run them as each header says.

No corrections from the lead. The lead confirmed items 1 and 2 by reading the code. Items 3 to 10 were checked again while drafting the plan, and the corrections that check found are marked "Corrected on re-check".

Commands run: `npx tsc --noEmit` in `web/` (clean, no output), `node scripts/check-syntax.mjs` (2640 .mjs passed), and the scanners in `repro/web/`.

ISSUES

1. Dismissing a running worker does not stop it
- Severity: medium-high. Confidence: measured.
- Where: `web/src/components/jobs/worker-pills.tsx:52-56`, `web/src/components/jobs/job-store.tsx:212,263`.
- Evidence: the X button shows on running jobs too. `removeJob` only filters the job out of the list. The `/api/run` fetch has no AbortController, and no stop control exists anywhere.
- Impact: the user thinks the run is cancelled. The CLI keeps going for up to 780 s, spends tokens, and still writes the report and tracker row.
- Fix: an AbortController per job, aborted on remove. Size S.

2. Child-process output is decoded one chunk at a time, which corrupts non-ASCII text
- Severity: medium. Confidence: measured.
- Evidence: each handler does `buf += d.toString()` (or `output += data`) on Buffer chunks. `utf8split.mjs` printed `"caf�� — 日本" CORRUPTED` when a chunk boundary split the é. `web/src/app/api/run/route.ts:429-437` already fixed the same bug (#2185) with `setEncoding("utf8")`.
- Impact: CV rewrites, apply-form answers, assistant text and scan or discovery JSON can end up with U+FFFD characters (accents, em dashes, CJK).
- Fix: `setEncoding("utf8")` on each stream. Size S.
- Corrected on re-check: the first list named 8 files. The full list is 29 handlers in 16 files:
  - `lib/report-persist.mjs:221-222`
  - `lib/cli-fencing-probe.mjs:91,94`
  - `lib/pdf-render.mjs:262-263`
  - `lib/cv-from-json.mjs:63-64`
  - `lib/apply/drive.ts:117`
  - `lib/apply/agent-interpret.ts:105`
  - `lib/apply/planner.ts:115,122`
  - `lib/core/employer-discovery.mjs:46,51`
  - `lib/core/scan.ts:337,347`
  - `lib/core/pipeline.ts:112-113`
  - `lib/cv-studio/rewrite-run.ts:36-37`
  - `app/api/scheduled-jobs/[id]/run/route.ts:50-51`
  - `app/api/assistant/route.ts:192,216`
  - `app/api/linkedin-import/route.ts:43,46`
  - `app/api/tracker/delete/route.ts:65`
  - `app/api/explore/ai/route.ts:307,335`

  All paths are under `web/src/`. Already sound: `lib/pdf-render.mjs:162,198`, `lib/core/pipeline.ts:76`, and `app/api/cv/ingest/route.ts:227-228`, which decodes through `lib/cv/ingest-output.mjs`.

3. Apply browser sessions leak
- Severity: medium. Confidence: measured.
- Where: `web/src/lib/apply/session.ts:210-212,235,238-403`, `web/src/components/apply/apply-provider.tsx:55,178,433`.
- Evidence: `prune()` (15-minute expiry) is only called from `openSession`. The provider releases a session only on open or reset, and has no pagehide handler. A tab closed mid-session leaves its BrowserContext and the headed Chrome open until another apply is opened.
- Corrected on re-check: the second half was inferred and is now measured. `apply-session-leak.test.mjs.txt` drives `openSession` with the house Playwright stub. When `page.waitForTimeout` throws, the call rejects and `context.close` is never called (`closed` stays `[]`).
- Fix: release on pagehide, and close the context on any throw in openSession. Size S.

4. Lint and type coverage is narrower than it looks
- Severity: medium-low. Confidence: measured.
- Evidence: `web/package.json` has no lint script, and no eslint binary is installed. The 8 `eslint-disable` comments (5 `@next/next/no-img-element`, 3 `no-var` at `lib/apply/session.ts:168-172`) are dead. `allowJs` without `checkJs` means the 254 `.mjs` files are not type-checked.
- Counts: 4 real `any` (`lib/documents.ts:35,72`, `components/resume/gate-panel.tsx:21`, `components/resume/resume-editor.tsx:49`). 0 `@ts-ignore` or `@ts-expect-error`.
- Fix: `// @ts-check` on the high-risk `.mjs` files, or `checkJs` turned on gradually. Size M.

5. Scheduled-scan modals have controls with no accessible name
- Severity: medium. Confidence: measured.
- Close buttons with no name (icon only, no aria-label): `components/scheduled-scans/create-job-modal.tsx:74`, `edit-job-modal.tsx:93`, `run-history-drawer.tsx:31`.
- Fields whose visible `<label>` has no `htmlFor`: create-job-modal.tsx 89, 103, 117, 124 and edit-job-modal.tsx 108, 122, 135, 142.
- Corrected on re-check:
  - create-job-modal.tsx 199, 210 and 214 are labelled. The scanner missed their template-literal ids.
  - The three "other controls" are labelled too: `portals-view.tsx:323`, `resume/section-form.tsx:76` and `resume/gate-panel.tsx:113`.
  - `accessible-names.browser.test.mjs` does open the create modal (the "New scan" step). It asserts none of these names, and it opens neither the edit modal nor the drawer.
- Fix: add the names. Size S.

6. Work after the agent finishes has no timeout and ignores client cancel
- Severity: low-medium. Confidence: inferred hang, measured missing bound.
- Where: `web/src/lib/pdf-render.mjs:142,187,255`, `web/src/lib/report-persist.mjs:218`, `web/src/app/api/run/route.ts:885-899`.
- Evidence: generate-pdf, mark-pdf-ready and the persist scripts are spawned with no timeout. `cancel()` waits for them before calling `finishRun`. The route's own comment (488-494) says the render "has no timeout of its own".
- Corrected on re-check (settled): `generate-pdf.mjs` sets no timeout of its own. Playwright's defaults bound `chromium.launch` (180 s, line 2453) and `page.goto` (30 s, line 2653). They do not bound `page.evaluate(() => document.fonts.ready)` (line 2658) or `page.pdf` (line 2661, whose options take no timeout).
- Impact: a hang there holds the tracker-write guard and the URL's in-flight key until the process restarts.
- Fix: a Node `timeout` on these spawns. Size S.

7. `/api/apply/prefill` and `/api/apply/drive` streams have no `cancel()`
- Severity: low. Confidence: measured.
- Evidence: `app/api/apply/prefill/route.ts:44`, `app/api/apply/drive/route.ts:28`. The planner runs to its kill timer (150 to 300 s), and the drive loop runs up to 16 turns of 90 s after the user leaves.
- Fix: abort on cancel. Size S.

8. PipelineProvider swallows failures
- Severity: low. Confidence: measured.
- Where: `web/src/components/pipeline/pipeline-provider.tsx:30-40`.
- Evidence: `.catch(() => {})` with no `r.ok` check. A 500 body sets inbox and applications to `[]`. Every focus event refetches, and responses that arrive out of order are not discarded.
- Fix: check ok, keep the previous data, use a generation counter. Size S.

9. Failed runs leave no saved log
- Severity: low. Confidence: measured.
- Evidence: `web/src/components/jobs/job-store.tsx:197` saves only done or gated runs, and `web/src/app/api/runs/save/route.ts:31` refuses any other status with 400.
- Fix: accept and send `error`. Size S.

10. Test gaps
- Severity: medium. Confidence: measured.
- Untested lib modules: 27 of 314 have no test file that imports or names them. The five riskiest are `lib/core/states.ts`, `lib/inbox.ts`, `lib/cv-studio/rewrite-run.ts`, `lib/run-core-script.ts` and `lib/title-fit.mjs`. `states.ts` mirrors the core's `foldStatusInput` behind POST /api/status with no parity test, which web/AGENTS.md rule 1 requires.
- Untested API routes: 33 of 72 are not imported by any test. The riskiest are `cv/ingest`, `linkedin-import`, `templates/file`, `cover-pdf` and `scheduled-jobs/[id]`.
- Corrected on re-check: the parity holds today. `status-parity.mjs.txt` found 0 disagreements across 423 inputs built from `templates/states.yml`. The implementations still differ in shape: the core lowercases labels and aliases without folding them, while the web folds both sides. An alias holding `İ` would diverge.

11. Oversized modules
- Severity: low. Confidence: measured.
- `components/pipeline-view.tsx` 1281 lines: one component of about 1150 lines with 19 useState and 10 useEffect.
- `components/assistant-console.tsx` 1142 lines.
- `lib/core/dir-lock.mjs` 980 lines: a deliberate byte-for-byte copy of the core file, guarded by a test.
- `app/api/run/route.ts` 909 lines: `POST` runs from line 67 to 909.
- `lib/career-ops.ts` 908 lines.
- The clear split candidates are PipelineView and the run route.

## Checked and found sound

- Run route: SIGTERM is escalated to SIGKILL on the process group (`lib/spawn-cli.mjs:87-140`), timers are cleared on cancel and close, and the guard is released on spawn refusal.
- Scheduler: a detached runner with file locks for rank, drain and tick.
- Explore and scan: an abort signal plus a hard-kill timer.
- Jobs interrupted by a reload are marked as such.
- Inbox skip and undo roll back on failure.
- The shared Modal, mobile-nav and first-score dialogs trap focus, close on Escape and restore focus.
- error.tsx and loading.tsx cover every page. The root layout's file reads are guarded. The `retry` prop matches the Next 16.3+ docs.

## Not checked

- API route security.
- Runtime and browser behaviour.
- explore-provider and assistant-console effect logic beyond the scan.
- Most forms for lost input.
- `npm test`.
- `.mjs` files under `checkJs`.
