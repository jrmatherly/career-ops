# verify-A2-r2, PR 45 head 5db651f9

Verdict: PASS. Items 1-15 closed, every gate green (one known section-13 flake passed on rerun), 26/26 CI checks green including both windows-latest jobs, 12/12 mutants killed, worktree clean.

Scope: round diff fdca6aa3...HEAD is 14 files; PR diff origin/main...HEAD is 21 (round 1's 20 plus the plan file, in scope because item 2 ordered the L84 amendment).

Items (proving hunk and pin)
1. run-route-kinds.test.mjs:314 has POSIX_ROOT; both Windows jobs pass (runs 42633333375, 42633338860).
2. `startedToday` counts running rows dated today UTC; plan L84 amended; DATA_CONTRACT:68, profile example, AUTOMATION say "evaluations started (running rows) per UTC day" (README:175 omits the parenthetical, nit). Pin "three for one URL started three times"; n1, m3 killed.
3. fold `outlived`/`died`: running row dead when another running follows, when nothing follows and stale >= 860 s, or when a queued row follows only after stale; `spent` reads failed "N failed attempts" and final holds with a trailing queued row; failed-after-running counts once; non-timestamp `at` is a skipped malformed row. Offline fix lives in fold, not the drain branch. Pins named; n2, n8, m2 killed.
4. Wall-clock setTimeout deadline, idle req.setTimeout gone; RUN_TIMEOUT_MS 900 000 (740 route kill + 60 persist + 100 slack), comment explains it outlasts the 860 s stale mark; runTimeoutMs seam. Deadline cut-off reads as a death (test K rows at t and t+900 s), per the coordinator's ruling. Pin passes; n3 hangs the case (killed).
5. `jd?.text?.replaceAll("\0","")` before the emptiness check; only path to the POST. n4 killed.
6. readDailyCap silent on missing key, one stderr line on an invalid value, both fall back to 10.
7. status "capped" with one log line when every plan is empty but an Infinity-cap plan is not. n5 killed.
8. `no-text: <why>` in tsvCell form, appended once per distinct reason; failures stay 0.
9. malformed rows counted on stderr with first line number.
10. Host and fold comments true; profile example cap under its own heading in one shared pipeline block; deviations row updated.
11. Four tests present (real checkRequest Host-localhost no-Origin; free after throwing spawn; free after client abort; autoQueued 50 then 51).
12. queueCandidates(autoJobIds) re-queues `isWaiting` (queued, or failed and not final) rows whose owner is not an active auto job; fold reads jobId/runId from the LAST row. Probe: B takes C's two orphans, A takes none and keeps its own row, repeat pass appends nothing, failed orphan keeps failures=1. n6, n7 killed. Note: a paused auto job's waiting rows are taken over (matches the drain, which never drains a paused job); a choice, not a defect.
13. AUTOMATION.md names data/scheduled-jobs.json `evaluate` object with an example; path real (scheduled-runner-path.mjs:8), shape matches EvaluateSettings (scheduled-jobs.ts:16-21).
14. PR body Tradeoffs lists the six plan-text departures; Scope lists the parked follow-ups.
15. outcomeOf returns the first limit-matching event's msg as the failed reason; n9 killed.

Gates: check-syntax 2233 OK; test-all --quick 21771/1 (section-13 flake) then 21772/0; evaluate-queue 36/0, headless-permission-flags 1/0, fork-deviations-covered 1/0, profile-schema-validation 1/0; validate-system-paths-coverage OK 3908; web typecheck clean; web npm test 2664 pass / 0 fail / 45 skipped; evaluate-drain 22, run-route-kinds 35, scheduled-jobs-runner 78, claude-invocation 23, all 0 fail. `gh pr checks 45`: 26 pass.

Mutants: n1-n9, m2, m3, m9 all killed (table in the agent report; logs in the verifier's scratchpad verifier-A2-r2/).

Not checked: the 900 s deadline end to end on a real clock (rests on the test row pattern and the 300 ms seam test). No data root or .env read.
