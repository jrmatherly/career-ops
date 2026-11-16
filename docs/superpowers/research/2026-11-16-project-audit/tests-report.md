# Tests audit report

Commit `2edd1b33`, 2026-11-16. Slice 6 of 6: test suite health, the providers and the Go dashboard. Read-only audit. Repro and scan scripts are in `repro/tests/`.

No corrections from the lead. The lead confirmed item 1 by reading `check-jd-archive.mjs:631`. Item 2 is owned by the CI slice.

Later check while planning: item 6's fix sentence ("use `fetchJsonWithRetry` with a policy and keep the 30 s give-up rule") cannot be done as written. The shared helper clamps a long Retry-After instead of giving up, and `tests/providers/workable.test.mjs:363-389` pins the give-up. The problem itself is now measured: an aborted board made 4 widget calls, 4 feed calls and 6 sleeps. Task TEST-5 keeps Workable's loop and adds the shared abort pieces.

ISSUES

1. **The archive check never flags applications in the Assessment stage.** Severity medium, confidence high, measured.
   - Where: `check-jd-archive.mjs:631`. `SUBMITTED_LABELS` lists Applied, Responded, Interview, Offer, Hired and Rejected, but not Assessment. `templates/states.yml:35` defines Assessment.
   - Evidence: `probe.mjs` against a three-row tracker with no reports returned `['1 Applied','3 Interview']`. The Assessment row 2 was missing.
   - Who is affected: a user mid-assessment gets no warning that the job description was never archived.
   - Fix: build the set from states.yml, or add Assessment plus one test. Size S.
   - Context: this is the only hard-coded status list without Assessment (repo-wide grep). The Go side reads states.yml through a parity test that checks both directions.

2. **Every push to a PR branch runs the whole Tests matrix twice.** Severity medium, confidence high, measured.
   - Where: `.github/workflows/test.yml`. It triggers on `push:` with no branch filter and on `pull_request`. The concurrency group is `pull_request.number || github.ref`, so the push run and the PR run never cancel each other.
   - Evidence: in `gh run list --workflow test.yml --limit 40`, 13 commits have both a push and a pull_request run (for example 2fc37427, 67ddd9f6, f8cc9ab4).
   - Who is affected: doubles the macOS and Windows runner minutes on every PR push.
   - Fix: key the concurrency group on `github.head_ref || github.ref_name`. Size S.

3. **The Windows leg sets the 9 to 14 minute wall time.** Severity medium, confidence high, measured.
   - Evidence: CI step times across 8 runs, test-suite step only: Ubuntu 314–485 s, macOS 433–660 s, Windows 664–966 s.
   - The Windows log of run 43775659509 says: "1334 discovered suites in 984s, 4 at a time (3541s of suite time)". That is about 2.65 s per suite. Locally the mean was 0.81 s (30 files, one process each, on a loaded 12-core Mac). So per-process startup on a 4-vCPU Windows runner is the cost.
   - The inline sections are not the bottleneck: they ran 225 s in parallel with the suites.
   - Cheapest fix: split the Windows leg into 2–3 matrix shards. This needs a `--shard i/N` option on discovery (`test-all.mjs:300`). Size M. Fixing item 2 halves the minutes but not the wall time.

4. **All 412 web suites run as one child process with a 180 s kill.** Severity medium, confidence medium, measured.
   - Where: `test-all.mjs:17447`.
   - Evidence: in the same Windows log the step took about 122 s (23:38:54 to 23:40:57), which is 68% of the budget.
   - Who is affected: as suites are added it will hit the kill, and the failure message names roughly 100 files at once.
   - Fix: run these suites through the parallel pool, or scale the timeout with the file count. Size S.

5. **About 25 tests check behaviour by reading source text instead of running the code.** Severity medium, confidence medium, measured by script.
   - Scale: 112 test files read source text. About 25 of them make no behavioural call at all (`srcgrep.mjs` plus a filter for import/spawn).
   - Worst nine, where a behaviour claim rests only on regex or indexOf:
     - `web/tests/lib/apply-checklist-applied.test.mjs:9` and `:37` (asks before writing)
     - `web/tests/lib/explore-discover-abort.test.mjs:39`, `:50`, `:77`, `:89`
     - `tests/set-status-lock-scope.test.mjs:6` (lock taken before read)
     - `web/tests/lib/root-error-pages.test.mjs:21`
     - `web/tests/lib/today-evaluate-stays.test.mjs:9`
     - `tests/browser-launch.test.mjs:27-60` (exact-shape wiring regexes)
   - These pass when strings survive a logic change, and fail on harmless refactors.
   - Legitimate drift guards I left out: `score-action`, `first-run-copy`, `doctor-ready-clis`.
   - Fix: move the UI ones to the existing `*.browser.test.mjs` harness. Size M.

6. **The Workable provider's own retry loop has drifted from the shared helper.** Severity low-medium, confidence medium, inferred from reading the code.
   - Where: `providers/workable.mjs:80-95` versus `providers/_http.mjs` `withRetry`.
   - What it misses: the shared helper's abort check (`currentAbortSignal`, `abortableSleep`, #5570) and `err.attempts`.
   - Effect: an aborted request has no status, which `isRetryableError` treats as retryable. So it is retried up to 3 times with plain sleeps after the scan was stopped.
   - Every other provider with retry uses the helper; only `_http.mjs` and `_connection-scope.mjs` reference the abort signal.
   - Fix: use `fetchJsonWithRetry` with a policy and keep the 30 s give-up rule. Size S.

7. **CI never runs `go vet` or a linter on the dashboard.** Severity low, confidence high, measured.
   - CI runs only `go test ./...`. There is no golangci or staticcheck config.
   - `go vet ./...` is clean.
   - `golangci-lint run` (defaults) finds:
     - two unused functions in the lock path: `internal/data/tracker_lock.go:299` `writeFileAtomic` and `tracker_replace_unix.go:7`
     - an unchecked `Close` on an append writer, `career.go:1368` (`reported-hires.tsv`)
   - `internal/model` has no `_test.go` (139 lines).
   - Fix: add a `go vet` and golangci step. Size S.

8. **`tests/split-root.test.mjs` failed once with exit 139 (segfault).** Severity low, confidence low on cause, measured.
   - It failed in 1 of 10 local runs under load average about 19. Test at line 315 got "batch-runner exited 139" after the Batch Summary. The other 9 runs passed.
   - Which child process crashed is not established.

9. **Two tests count any error at all as a pass.** Severity low, confidence high.
   - Where: `tests/providers/jazzhr.test.mjs:162` and `:170`, `tests/providers/neogov.test.mjs:189`.
   - Each is `try { …; fail() } catch { pass() }`, so a TypeError bug would also pass.
   - Fix: assert on the error. Size S.

10. **Some tests have wall-clock upper bounds.** Severity low, confidence low, inferred.
    - Where: `tests/pipeline-lock.test.mjs:625` (`elapsed < 300`), `:187`, `:575`, and `tests/providers/http-timeout.test.mjs`.
    - This is the same pattern as the one recorded CI failure: Windows run 43775659509, `scan-entry-pacing.test.mjs:64`, real timers. That was fixed in 2fc37427.
    - `pipeline-lock` passed 3 of 3 runs locally.

## Checked and found sound

- **Skips:** 245 skip-marker lines (a wider regex than the 144). None is plainly disabled: no `skip: true`, `.skip(`, `.todo(` or `.only(`.
  - By category: about 100 platform, 44 tool, and the rest dependency, fixture or sqlite presence.
  - The tool-gated suites run in test.yml `tool-suites` (`--needs browser,latex` turns a skip into a failure). The browser suites run in the web-ci "Browser suites" step, where a skip is a failure.
  - Minor gap: `apply-login-wall` and `apply-own-label` skip if Chrome fails to launch.
- **Tests that cannot fail:** no test file has zero assertions (1748 files). The 69 assertion-free node:test blocks I read delegate to helpers that assert.
- **Timezones:** 16 date-heavy suites pass under `TZ=Pacific/Kiritimati` and `TZ=America/Los_Angeles`, and 7 of them also under Pago_Pago.
- **Ports and temp paths:** no fixed listening ports. Fixed temp names are only "does-not-exist" paths. No lingering suites.
- **Providers:** all 151 have `tests/providers/{name}.test.mjs`. No bare `fetch`.
- **Go and Node tracker parsing:** they share fixtures (`test-fixtures/*parity*.json`, read by `career_test.go`).
- **Flakiness history:** 37 of 40 Tests runs succeeded. The single failure is the fixed flake in item 10.

## Not checked

- Assertions on mocks the test just set (no reliable static signal).
- Per-file times across all suites, and Ubuntu/macOS suite timing lines.
- The coverage of web suites that are gated on web dependencies.
- What caused the exit 139 in item 8.

The local timings were taken while another full run loaded the machine, so treat them as relative only.

## Watch items, not planned

- Item 8, the one-off exit 139 in `tests/split-root.test.mjs`.
- Item 10, the wall-clock upper bounds.
