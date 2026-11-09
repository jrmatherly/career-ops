# audit-A2-r1-plan (plan conformance and honesty), PR 45 head fdca6aa3

Verdict: ISSUES. One must-fix (already fix-forward item 1), three low/medium not in the round-1 brief.

## Findings (worst first)

1. HIGH 97. `web/tests/lib/run-route-kinds.test.mjs:312` "evaluate-text refuses a code checkout it cannot resolve" has no POSIX_ROOT skip; on win32 the data-root check answers 400 first. CI jobs 129001159629 (run 42568787785) and run 42567302135 red; main 4de7f15b green (run 42564400131). Unmentioned in PR body and trail. Fix: add the POSIX_ROOT option.
2. MEDIUM 70. A URL queued by a job that later leaves auto mode is stranded. `queueCandidates` (lib/evaluate-queue.mjs:143) skips any URL with a ledger entry whatever job wrote it; `drainPlan` (:119) filters on the first row's jobId (:67); drain plans per job (evaluate-drain.mjs:152). The trail's code-review row parks this as follow-up, but both files are this PR's and the plan's drainPlan has no jobId; the per-job split is the owner's design.
3. LOW 95. web/README.md:171 drops the plan's "review or" wording. README is the more accurate text, but neither PR body nor trail records the deviation.
4. LOW 85. docs/AUTOMATION.md:248-252 tells the reader to set a job's evaluate mode, but no UI or named JSON path exists until PR-A3. The merged docs leave the reader no way to turn auto mode on.
5. LOW 85. Literal deviations from plan text, each reasonable: transport failure appends a `queued dashboard-offline` row (plan: "appends nothing new"); runDrain signature adds fetchJd and env (named in deviations row, not PR body); ledger append via withPipelineLock+appendLedgerRows not appendSidecarRow (disclosed in Tradeoffs); non-200/non-409 leaves `refused:` and stops (disclosed); a 409 after `running` uses one daily-cap slot (matches "whatever came after").
6. INFO. PR body claims hold: no personal data (fixture hosts example.test, 127.0.0.1, greenhouse board "fictional"); `node test-all.mjs --quick` reproduced 21765/0/15; Browser and LaTeX failures are tectonic HTTP 504; premise corrections true (tsvCell export, origin guard allows no-Origin, pipeline block existed); /tmp/a2-owner self-proof captures match stderr/ledger/reports; A2.tsv timestamps agree with commits, no CI row.

## Plan boxes

All Files, Build, You-see and unit Verify boxes closed by reading the head and running the suites (evaluate-queue 29/0; evaluate-drain + run-route-kinds + scheduled-jobs-runner + claude-invocation 148/0 on darwin; fork-deviations-covered 1/1; validate-system-paths-coverage OK 3908; headless-permission-flags 1/1; profile-schema 1/1). Decisions (a) and (b) from A2.md closed with named tests. Deviations table order 16: extended rows plus new KEEP rows (evaluate-drain.mjs, its test, tests/evaluate-queue.test.mjs) and ADAPT row (profile.example.yml), all in 48bd740f.

Not checked: live lanes, perf, AUDIT-1's security list. No edits, pushes or comments; no read of ~/career-ops-data or any .env.
