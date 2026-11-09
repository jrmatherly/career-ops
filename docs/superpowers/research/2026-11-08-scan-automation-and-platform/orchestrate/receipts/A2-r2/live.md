# live-A2-r2 (lanes L5' L7' L10' L12' L4' L11'), PR 45 head 5db651f9

Verdict: PASS on all six. L4' passes on the cut-off (the behaviour round 1 changed); its second half ran on a different, safe path than the brief assumed.

Setup as round 1 (fake `claude` with usage-limit, fail-first-N and delay knobs; fake ranker 4.2; fetch stub for the fictional Greenhouse board; dashboard `node server.mjs dev -p 3103`; runner opt-in and web URL set; auto job engine `portals`, nextRunAt 2099 so no scan ran). Rows queued by a real rank pass with the opt-in withheld. Captures under /tmp/swarm-A2/worker-r2/ (scratch).

| Lane | Result | Proving lines |
|---|---|---|
| L5' limit reason | PASS | stderr `stopped at …/jobs/2: Claude AI usage limit reached; the rest stay queued`; dump `jobs/2 failed "Claude AI usage limit reached" failures=1`; jobs/1 report 001, jobs/3 queued |
| L7' cap counts starts | PASS | cap 2, one candidate failing twice: t1, t2 `1 failed`; t3 `daily cap 2 reached, 2 started today; queued rows wait for the next UTC day`; `drain-plan --json` today `[]`; runDrain with now +1440 min `drained, evaluated 1`; final `failures=2 final=true`, running rows dated 11-09, 11-09, 11-10 |
| L10' offline keeps failure | PASS | backdated running row reads `failed "running row went stale" failures=1`; dashboard down: `queued "dashboard-offline" failures=1`; dashboard up: `evaluated "report 1" failures=1 final=true` |
| L12' handoff | PASS | A (1111…) queued two, set off; B (4444…) added: `rank: job 4444… 2 ranked`, `drained: 2 evaluated`; rows `queued@1111>queued@4444>running@4444>evaluated@4444`, jobId 4444 both; reports 001-002 only, one queued@4444 row per URL |
| L4' deadline | PASS (cut-off) | runDrain with runTimeoutMs 5000, fake delay 30 s: `status offline, queued 1`, stderr `no answer within 5 s; the rest stay queued`; dump `queued "dashboard-offline" failures=0`; unit test passes, evaluate-drain 22/22 |
| L11' pod-only | PASS | ledger sha1 unchanged; one stderr refusal line; one JSON object on stdout; fake never called |

L4' second half: the brief expected the dashboard run to finish after the cut-off and the next tick to skip as report-exists. False at this head: the route's `cancel()` (route.ts L764-768) SIGTERMs the agent child when the client disconnects, so no report is written and the next tick re-evaluates (`queued>running>queued(dashboard-offline)>running>evaluated`, failures=0). One report per URL, no duplicate. In production the route's own 740 s kill fires before the drain's 900 s deadline, so this path needs a hung dashboard. Noted for the owner; not a defect.

Deviations: no runner clock seam and no `drain-plan --now`, so the next-day proof called runDrain with `now`; `add` has no `--at`, so the stale row was backdated by script on the scratch ledger; RUN_TIMEOUT_MS is a module constant, proved via a direct runDrain call and the unit test; job B was given one finished run so its rank pass had something to rank. The runner's stdout says `idle` on every tick (it reports the scan tick); "capped" appears only on the drain's stderr.

Cleanup: both dashboards and two orphaned `generate-pdf.mjs --pdf-server` children stopped by pid (the orphan on dashboard SIGTERM recurs; outside this PR); port 3103 free; worktree clean. No branch edits, pushes, comments; no read of ~/career-ops-data or any .env. Not checked: run-record counts in scheduled-jobs.json.
