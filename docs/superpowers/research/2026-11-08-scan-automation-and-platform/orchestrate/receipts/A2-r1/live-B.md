# live-A2-r1-B (lanes 6-11 and perf), PR 45 head fdca6aa3

Verdict: PASS, all six lanes and perf.

Setup: dashboard `node server.mjs dev -p 3102` with CAREER_OPS_ROOT at scratch root /tmp/swarm-A2/worker-B/root; fake `claude` first on PATH (stream-json `<<report-md>>` envelope, delay from a file, every call logged); fake ranker 4.2; `globalThis.fetch` stubbed via `NODE_OPTIONS=--import` for boards-api.greenhouse.io/v1/boards/fictional (so the scan child sees it too); runner with CAREER_OPS_AUTO_EVALUATE_LOCAL=1, CAREER_OPS_WEB_URL=http://127.0.0.1:3102. Text captures under /tmp/swarm-A2/worker-B/ (scratch, not copied).

| Lane | Result | Evidence |
|---|---|---|
| 6 a2-stale-running | PASS | SIGKILL mid-evaluation left `queued>running`; a tick at +0 reclaimed the dead drain lock and left the row; at +5 min `running failures=0 planned=0`; at +15 min `failed "running row went stale" failures=1 planned=1`; retry evaluated it: rows `queued>running>running>evaluated(report 1)`, report 001, tracker row, pipeline `[x]` |
| 7 a2-daily-cap | PASS | cap 2, five candidates: tick 1 `2 evaluated`; tick 2 same day idle with no drain line; jobs/3-5 still `queued`, pipeline `[ ]` |
| 8 a2-report-exists | PASS | hand-written reports/001 with `**URL:** …/jobs/1`, no tracker row: next tick `1 evaluated … 1 skipped`, jobs/1 `skipped(report-exists)`, fake called once for id 2, which got report 002; no sentinel left |
| 9 a2-tick-during-drain | PASS | tick A draining (fake 40 s); tick B 19 s later ran its due scan (`status success, rolesFound 2`) and printed `another runner is draining; this tick leaves the queue to it`; A finished 1 evaluated; both runs in the store. Deviation: first attempt used engine `full` (real ATS sweep), stopped by pid after ~3 min and rerun with engine `portals` |
| 10 a2-offline | PASS | dashboard stopped: `did not answer /api/healthz (ECONNREFUSED); queued rows wait`, `offline: … 3 queued`; each row `queued>queued(dashboard-offline)`, no `running` row; tick 2 appended nothing (summary reads `0 queued`, counts cover this tick's rows only) |
| 11 a2-pod-only | PASS | `env -u CAREER_OPS_AUTO_EVALUATE_LOCAL -u KUBERNETES_SERVICE_HOST`: ledger sha1 bcf49d97… unchanged; stderr exactly the one refusal line; stdout one JSON object `{"status":"idle"}`; fake never called |

## Perf

Drain, 20 candidates, 5 rounds after a warm-up, fake at 100 ms: 6725 / 6783 / 6798 / 6739 / 6797 ms, about 338 ms per candidate, about 238 ms excluding the fake (rule: under 500 ms). running→evaluated averages 338 ms (min 312, max 355): POST, fake spawn, dashboard persist and merge. Drain-side gap between rows about 1 ms.

Idle tick, 30 runs after 2 warm-ups, trunk 4de7f15b vs head (same worktree, checked out and returned):

| Store | Trunk median | Head median |
|---|---|---|
| one mode-off job | 42.3 ms | 42.4 ms |
| one auto job, empty ledger | 42.9 ms | 66.1 ms |

Mode-off within 5%. The auto-job head cost (+23 ms) is drainPass loading evaluate-drain.mjs, which imports browser-extract.mjs, liveness-api and tracker-parse at module top, then reading the plan; paid only when an auto job exists. Load average during runs 4-8 (1 min).

Cleanup: dashboard pids and an orphaned `generate-pdf.mjs --pdf-server` child stopped; port 3102 free; worktree clean at fdca6aa3. No edits, pushes or comments; no read of ~/career-ops-data or any .env. Not checked: lanes 1-5; no screenshots.
