# live-A2-r1-A (lanes 1-5), PR 45 head fdca6aa3

Verdict: PASS, all five lanes. Lane 4 passes by the plan's wording with a different skip reason than the brief named.

Setup: dashboard `node server.mjs dev -p 3101`; scratch root /tmp/swarm-A2/worker-A/root seeded from examples/ and templates/; fake `claude` first on PATH recording argv and emitting a `<<report-md>>` envelope (Nth call fails with "Claude AI usage limit reached", exit 1); fake ranker scoring 4.2; `globalThis.fetch` stubbed for boards-api.greenhouse.io/v1/boards/fictional/jobs/<id>; runner with CAREER_OPS_AUTO_EVALUATE_LOCAL=1 and CAREER_OPS_WEB_URL=http://127.0.0.1:3101. Captures under /tmp/swarm-A2/worker-A/ (not copied; scratch).

| Lane | Result | Evidence |
|---|---|---|
| 1 a2-off | PASS | trunk 4de7f15b has no drain or ledger module; at head with mode off: stdout `{"status":"idle"}`, empty stderr, no ledger file |
| 2 a2-three-evaluated | PASS | `3 ranked, 3 sent`; `drained: 3 evaluated`; ledger queued→running→evaluated per URL; reports 001-003; tracker #1-#3 Evaluated; pipeline rows `[x]` |
| 3 a2-no-api-text | PASS | off-API URL `no-api-text skipped`; Greenhouse control evaluated; second tick idle, ledger byte-identical (5 rows), pipeline row still `[ ]` |
| 4 a2-ui-first | PASS (plan wording) | opt-in off tick queued both and printed the refusal line; UI "Score 1 now" made report 001; next tick `not-pending skipped` (brief expected `already-evaluated`; not-pending is checked first, matching the plan's Build text); one report per URL; fake-claude called once by UI, once by drain |
| 5 a2-limit-stop | PASS | jobs/1 evaluated, jobs/2 running→failed, jobs/3 still queued; only report 001; stderr `stopped at …/jobs/2 … the rest stay queued`; stream shows the limit error then the no-report terminal |

Observation (forwarded to owner, not a failure): the failed row's reason and the "stopped at" line carry the generic no-report message, not the usage-limit text, so the ledger never says why the batch stopped. The summary's "0 queued" counts only rows written this tick.

Notes: Config "Save config" stores the CLI choice in browser localStorage (not checked whether it also wrote to the scratch root). Dashboard stopped, port 3101 free, chrome-devtools page closed. No branch edits, pushes, comments; no read of ~/career-ops-data or any .env. Not checked: lanes 6-11, perf, run-record counts in scheduled-jobs.json.
