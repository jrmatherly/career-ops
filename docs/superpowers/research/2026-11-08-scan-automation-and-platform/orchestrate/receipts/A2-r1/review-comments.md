# A2 r1 review-comments (comment-analyzer, sonnet), head fdca6aa365af6c3524de00f4f70a6c81285c46f1

Verdict: no critical issues; no comment or doc states something false about behaviour. One misleading comment, four wording or placement nits.

Checked accurate: DATA_CONTRACT evaluate-queue.tsv row (columns, six states, 860 s stale rule, running-then-running counts failed, third failure final, `'` prefix); docs/SCRIPTS.md row; AUTOMATION.md and web/README.md (pod-only default, CAREER_OPS_AUTO_EVALUATE_LOCAL=1, cap 10, CAREER_OPS_WEB_URL default, no-api-text, "Read, Glob and Grep only" = localReadOnly); every SKILL.md deviations row names existing tests and matching hunks ("thirteen rules" = 7+6; run-cli-support two exports; route EVALUATIONS_IN_FLIGHT cleared in spawn catch and finalizer); code comments in lib header, queueCandidates, rankJob auto block, DRAIN_LOCK/drainPass, route in-flight, codeRoot, DENY_SAFE_ROOT, claude-invocation JSDoc, runDrain header, persistedKeys, planFor.

Findings:
1. MEDIUM misleading. web/scripts/evaluate-drain.mjs:78 says the guard serves loopback hosts only and 127.0.0.1 is for the socket; origin-guard.mjs:59-64 isLoopbackHost accepts 127.0.0.0/8 too. Real reason for Host: localhost: CAREER_OPS_WEB_URL can name a non-loopback service host in a pod. Suggested rewrite given.
2. LOW placement. config/profile.example.yml:426-430 puts auto_evaluate_daily_cap inside the "Two-pass triage gate" block (header "Used by /career-ops pipeline"); opening words "not the triage gate:" are narration. Move under its own heading; tests/profile-schema-validation.test.mjs forbids a second `pipeline:` key; update the deviations row if moved.
3. LOW wording. lib/evaluate-queue.mjs:57 "a running row the next row does not resolve" vs code counting only running-then-running; running-then-queued (409, dashboard-offline) is deliberately not a failure.
4. LOW constant. evaluate-drain.mjs:26-27 comment says 740 s + 60 s but RUN_TIMEOUT_MS = 900_000; RUNNING_STALE_MS is 860 s, so between 860 and 900 s a live row reads failed to another reader. Suggested comment names the slack and the gap.
5. NIT. web/README.md says "unless a job's evaluate mode is auto"; plan L387 said "review or auto"; README is the accurate one (review only ranks). Optional line break at "It never applies".

Not raised: DATA_CONTRACT "under the sidecar lock" is accurate (withPipelineLock + appendLedgerRows = the lock appendSidecarRow takes).
Not run: tests, live runner, PR body.
