R2 FIX-FORWARD, round 1. One round, every item, then a new code-ready head.

Context you inherit: the original owner brief <store>/briefs/R2.md with the standing orders at its end (binding, 19 lines), the previous owner's code-ready report (PR 40, branch claude/r2-inbox-rank, head a64d71af on trunk d2fea890; trunk is now 66bb4d54 and merge-tree says your branch merges clean), the review set in that owner's worktree private/review/ (<repo>/.claude/worktrees/agent-ae173d0b26b99fb55), and the receipts under <store>/receipts/R2/ (read perf.md, review-tests.md, review-comments.md, review-errors.md, review-code.md, audit.md; all ten live lanes passed). The verdict at a64d71af is verifier-failed on the items below. Same branch, fast-forward push with a local branch name, no rebase. R2 is review-gated: the operator reviews screenshots and the video before merge, so refresh the review set for the new head if the rendered rows change.

CODE
1. (perf) parseInbox on a 2000-row file with 1000 ranked rows is 26 percent slower than trunk (50 interleaved runs, 2.25 vs 2.84 ms, distributions separate); the plan allows 10. Add a cheap fast path (a substring check for "rank:" before the rank regex, and no extra work on rows without a label) and re-measure with the lane's bench (/tmp/swarm-r2/worker-11/bench.mjs, 50 runs) on two fixtures, half ranked and none ranked; report all medians. If the ranked fixture still exceeds 10 percent after the fast path, report the number and the per-row cost and stop there; the coordinator decides.
2. (review-code and audit note) the early-cell gate `seg.startsWith("rank:")` (pipeline-table.mjs:67) is case-sensitive while the label grammar is case-insensitive; make it match the grammar.
3. (review-tests T3) drop the dead .trim() at pipeline-table.mjs:88.
4. (review-errors E6) a ?added= date that matches no row (no scan that day, a calendar-invalid date, or rows whose URL spelling differs from scan-history) shows a pressed chip and a generic empty state; make the empty-state copy say "No roles were added on <date>" when the Added filter is the reason, and reject calendar-invalid dates in addedParam.
TESTS
5. (T1 [8]) boundary cases: `rank: 5/5 — top` and `rank: 5.0/5 — top` parse as rank 5; `rank: 0/5 — low` parses as 0.
6. (T2) a company cell literally "rank: pending" stays the company with no rank key.
7. latestAddedDates default max of 5 (a sixth date in the fixture returns five).
8. The case-insensitive gate and the invalid-date rejection from items 2 and 4.
DOCS, COMMENTS, ROWS
9. SKILL.md: :269 four appended tests, not three; :267 add the edited header comment at inbox-triage.tsx:32 and the ?added= date prepended outside the latest five; :104 mark the Rules list as examples or name the five files this PR edits; :268 say "no behaviour test for the rank span; typecheck only" or add a source-regex pin in the house pattern of web/tests/lib/decision-card-cta.test.mjs; :266 and career-ops.ts:107 say "scan date", not "scan run" (two runs a day share a chip).
10. triage-row.tsx:100 point the comment at what renders (the N/5 Badge is the evaluation score; this is the ranker's cheap prior); inbox-triage.tsx:30 "a small capped batch".
11. owners/R2.tsv: add a row that supersedes the first design row's replaceState claim (append-only, never edit).
Noted, no change: the light-theme rank label contrast is 4.64 against an AA floor of 4.5; say so in the PR body for the operator's review. The facet reads ?added= only in the useState initializer (a soft navigation to a new value keeps the old filter); nothing links to it yet; follow-up for A3.
Process: /simplify, /no-comments, Conventional Commits with a scope, the pre-push gates (check-syntax, test-all --quick, web typecheck and npm test, fork-deviations-covered after the commit), re-run the You-see self-proof at the new head. Report code-ready with the head SHA and the two perf medians in one message, then babysit to green and report merge-ready with a per-item line for 1-11 and the review-set paths.
Timebox: two hours of agent time to the new code-ready head.
