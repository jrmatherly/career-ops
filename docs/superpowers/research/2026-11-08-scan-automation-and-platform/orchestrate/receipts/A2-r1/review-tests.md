# A2 r1 review-tests (pr-test-analyzer, sonnet), head fdca6aa365af6c3524de00f4f70a6c81285c46f1

Verdict: every assertion the plan's "Verify, unit" block lists exists by name and passes; decisions (a) and (b) pinned; no gap rated 8-10.

Suites run at the head: test-all --only evaluate-queue 29/0; web evaluate-drain 15/15, run-route-kinds 33/33, scheduled-jobs-runner 77/77, claude-invocation 23/23. Not run: repo-wide gates (verifier's).

Plan assertions mapped (all present): header once; last row wins with full history; 859 s running / 860 s failed not final; third failed final; daily cap counts today's running rows whatever followed, not yesterday's; two spellings one key, raw URL returned; formula guard `=`; skip reasons not-pending, already-evaluated, report-exists (report header and tracker-additions TSV), no-api-text, untouched on second drain; null/thrown/blank fetch stays queued; usage-limit and rate-limit stop the batch; rejected/dropped/unfinished POST = dashboard-offline, failures 0; failed probe leaves all queued; gated with reason and count; 409 stays queued as in-flight; running row on disk before POST; POST body exact, Host localhost, no Origin; decision (a) refusal (stderr names the variable, ledger byte-identical, no POST, status refused) and pod branch drains; route 409 before spawn for another spelling and the other evaluate kind, key freed after; new denies by exact string incl. //app/.env* and //app/web/.env*, trailing-slash normalised, throws on missing or relative codeRoot, evaluate-text only; runner auto branch at 3.5 and 4.5, autoQueued 2 and 0, idempotent second pass, review writes no ledger, unranked skipped then queued later, drain only without --job and only with an auto job, failing drain and held lock go to stderr.

Gaps ranked by risk (rating/10):
1. (6) Drain headers never checked against the real origin-guard: Host: localhost with no Origin on POST is pinned against a stand-in server only. One unit test against the guard function would close it.
2. (5) In-flight Set release on the spawn-throw and client-abort/early-close paths untested; a leaked key answers 409 for that URL until restart.
3. (5) autoQueued accumulation across two passes on one run untested (a plain assignment would pass).
4. (4) "rows waiting for a later rank pass are left unqueued" branch (waiting.slice beyond RANK_MAX_PER_PASS) untested.
5. (4) Pod gate edge values ("0", "true", empty) untested; refusal's one-JSON-object stdout not asserted through runnerTick.
6. (4) baseUrl default from CAREER_OPS_WEB_URL and the 127.0.0.1:3000 fallback untested; fallback reads process.env while the gate reads injected env.
7. (4) Limit regex coverage partial (credit balance, invalid api key, /login untested); failed row's reason text never asserted.
8. (3) Multi-job drain untested (stop in A leaves B queued; paused job filtered; two jobs sharing a URL).
9. (3) Unsafe CAREER_OPS_CODE_ROOT path not tested for the shared DENY_SAFE_ROOT check (only unresolvable checkout).
10. (2) Lazy import of evaluate-drain.mjs bypassed by drainFn; concurrent first-append header race not exercised.

Quality: evaluate-drain tests run a real node:http server and assert ledger state; stateAtPost proves running-before-POST; T0+n clocks, no time flake; exact header and quoting pins intended (data contract). No brittleness, no parked item re-raised.
