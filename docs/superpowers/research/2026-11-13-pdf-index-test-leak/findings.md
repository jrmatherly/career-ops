# A test suite writes `data/pdf-index.tsv` into the real checkout

Investigated 2026-11-13 on `main` at 401e53e9, Node 24.22.2, macOS. Nothing was changed.

## Summary

`tests/generate-pdf-atomic-write.test.mjs` writes one row to `data/pdf-index.tsv` in the developer's own checkout every time it runs outside `test-all.mjs`. It is the only suite in the repository that does. Inside the runner it is safe, because the runner pins a scratch data root that every child inherits. There is no race in the runner.

The fix is one import in that suite. A small structural test keeps the next rendering suite from repeating it.

## How it was noticed

A `node test-all.mjs --quick` run on a feature branch ended with:

```
❌ the test run changed the real data root (<the worktree>):
     added    data/pdf-index.tsv
```

The file held one row, pointing at `…/T/career-ops-pdf-atomic-5zo0Pf/output/cv.pdf`. The only file that uses the `career-ops-pdf-atomic-` prefix is `tests/generate-pdf-atomic-write.test.mjs`.

## What was run

| # | Check | Result |
|---|-------|--------|
| 1 | The suite alone, with `CAREER_OPS_ROOT`, `CAREER_OPS_DATA_DIR` and `CAREER_OPS_TEST_DATA_ROOT` unset | 2 tests pass. `data/pdf-index.tsv` appears in the checkout, with the same row shape as the failure. Every run. |
| 2 | The suite alone with `CAREER_OPS_ROOT=<temp dir>` | 2 tests pass. The row lands in `<temp dir>/data/pdf-index.tsv`. Nothing in the checkout. |
| 3 | `node test-all.mjs --quick` twice, with a preload that logs the suite's environment and parent processes | Both runs pass, no file. Both times the suite's process had `CAREER_OPS_ROOT` set to the run's `career-ops-test-data-*` scratch root, inherited from `test-all.mjs`. |
| 4 | Every suite outside the runner, in a throwaway clone of `main`: `node --test --test-concurrency=10 "tests/**/*.test.mjs"` with the three variables unset, then `git status --short --ignored` | 5,481 tests ran. Exactly one path was left behind: `data/pdf-index.tsv`, holding one `career-ops-pdf-atomic-*` row. |
| 5 | The suite alone with `tests/helpers.mjs` preloaded (`NODE_OPTIONS="--import …/tests/helpers.mjs"`) | 2 tests pass. No file in the checkout. |
| 6 | An independent review of the plan, in a throwaway clone with the fix and the guard applied: `node test-all.mjs --quick`, then check 4 again | 22,096 passed, 0 failed. Check 4 left no ignored file. Under the runner the suite inherits the scratch root as before, so the helpers import changes nothing there. |

## Cause

Three facts combine.

1. **The index writer uses roots fixed at import.** `generate-pdf.mjs:67` and `:73` compute `trackerPath` and `workspaceRoot` from `getCareerOpsRoot()` when the module loads. `updatePDFManifest` (`:1650`) writes to `resolvePdfIndexPath(trackerPath)` and makes the PDF path relative to that `workspaceRoot`.
2. **Every successful render records a row.** `renderInPage` (`:2471`) calls `updatePDFManifest` after writing the PDF (`:2624`). It does not look at `opts.workspaceRoot` for this. So the `workspaceRoot: workspace` the suite passes changes where the temp HTML goes and nothing about the index.
3. **The suite pins no data root.** It imports `generate-pdf.mjs` directly (`tests/generate-pdf-atomic-write.test.mjs:22`) and does not import `tests/helpers.mjs`, which is what pins `CAREER_OPS_ROOT` to a scratch directory for a suite run on its own (`tests/helpers.mjs:108-128`).

Run alone, `getCareerOpsRoot()` is therefore the checkout, and the first test's successful render writes the row there. The row's PDF path starts with `../../../..` because the PDF is in the OS temp directory, outside the workspace the row is relative to.

Under `test-all.mjs` the same thing happens against the scratch root, so the row goes into the run's shared `career-ops-test-data-*/data/pdf-index.tsv` and is deleted with it.

## Why it looked intermittent

It is not. It depends only on how the suite is started.

The failing quick-suite run overlapped two reviewer agents that were running `node --test` commands in the same worktree between 02:14 and 02:19 UTC. One reported starting a full test run by accident and stopping it. The runner's guard compares the real data root before and after its own run, so a file written by any other process in that window is reported. That one of those agents ran this suite outside the runner is inferred from the timing and the row. Their transcripts do not show the command.

An earlier quick-suite run the same evening also reported one failure. Its log was not kept, so its cause is unknown. I had counted it as a second occurrence of this leak, and that was not established.

## Scope

- Twelve suites name `renderHtmlToPdf(` or `renderBatch(` in their code. Nine render in their own process and three only in a child script they spawn. Eight import `tests/helpers.mjs`, three set `CAREER_OPS_ROOT` for their child, and `tests/generate-pdf-atomic-write.test.mjs` does neither.
- No suite reaches the index writer without naming the renderer: `generate-cover-letter.mjs` renders only inside its own `main`, and `lib/pdf-server.mjs` takes the render function as an argument.
- Check 4 covers every suite, not only the rendering ones: nothing else is left in a checkout by running suites outside the runner.
- 118 of the 989 top-level suites import a root script in-process without importing the helpers or pinning a root. Only one of them writes anything, so a rule of that shape would flag 117 suites that are fine.

## Other things seen, not part of this fix

- **A row for a PDF outside the workspace.** `renderInPage` records a manifest row even when the PDF is outside the workspace the manifest belongs to. The CLI and batch paths refuse such an output earlier (`generate-pdf.mjs:1984`, `:2221`), so only a caller of `renderHtmlToPdf` can reach it, and today only tests do. Refusing the row in the writer would break suites that render into their own temp directory with `CAREER_OPS_PDF_INDEX` set (`tests/pdf-index-kind.test.mjs:160-190`), so it is not a simple guard.
- **Import has a side effect.** `generate-pdf.mjs:216` creates `<data root>/output/` when the module loads. A checkout already has `output/.gitkeep`, so the guard sees no change.
- **A varying handful of suites fail when run outside the runner at concurrency 10.** Three runs failed six, seven and two suites. The first failed `tests/cv-visual/cv-visual.test.mjs`, `tests/doctor-billing-source.test.mjs`, `tests/followup-seed.test.mjs`, `tests/followup-sweep-off.test.mjs`, `tests/followups-off-reports.test.mjs` and `tests/followups-toggle.test.mjs`. A later one failed only `cv-visual` and `tests/plugins-split-root-config.test.mjs`. The follow-up suites print lock timeouts, so they look timing-dependent. Not investigated.
- **`tests/README.md` overstates the default.** "The suite's data root" says a new test is safe by default because `helpers.mjs` pins the root. That holds only for a suite that imports `helpers.mjs`.
- The handoff's note that `tests/batch-dealbreaker-skip.test.mjs` flaked once on 2026-11-13 is still unexplained and may be the unknown failure above.

## Options weighed

| Option | Verdict |
|--------|---------|
| Import `tests/helpers.mjs` in the suite | Chosen. It is the house mechanism, 665 of the 989 top-level suites already import it, and check 5 shows it works. Run alone, the helpers also fingerprint the real root at exit and fail the run if anything changed. |
| Set `CAREER_OPS_ROOT` in the suite before importing the renderer | Works (check 2), and three rendering suites do it. It needs its own cleanup and gives no exit check, so it is more code for less. |
| Make `updatePDFManifest` refuse a PDF outside its workspace | Not chosen. It changes an upstream product file for a test-only problem, and it breaks suites that set `CAREER_OPS_PDF_INDEX` and render elsewhere. |
| A lint over every suite that imports a root script without the helpers | Not chosen. 117 false positives. |
| A lint over the suites that render in-process | Chosen as the guard. Twelve files today, and the index writer is reached only through a render. |
| Run every suite outside the runner in CI and diff the checkout | Not chosen as a gate. It takes about two and a half minutes and a varying handful of suites fail that way for other reasons. The command is worth writing down. |

## Outcomes

Plan: `docs/superpowers/plans/2026-11-13-pdf-atomic-write-data-root-leak.md`. Branch: `feat/recruiter-advice-and-test-leak`.

| Finding | Outcome |
|---------|---------|
| `tests/generate-pdf-atomic-write.test.mjs` writes `data/pdf-index.tsv` into the checkout | Fixed in this branch. The suite imports `tests/helpers.mjs`, and `tests/rendering-suites-pin-data-root.test.mjs` fails when a rendering suite pins no data root. |
| `tests/README.md` overstates the default | Fixed in this branch, with the in-process import rule and the clone audit command. |
| The index writer records a row for a PDF outside its workspace | Not built. `generate-pdf.mjs` is an upstream product file, the problem is test-only, and suites that set `CAREER_OPS_PDF_INDEX` and render into their own temp directory would break. |
| Suites that fail outside the runner | Not investigated. |
