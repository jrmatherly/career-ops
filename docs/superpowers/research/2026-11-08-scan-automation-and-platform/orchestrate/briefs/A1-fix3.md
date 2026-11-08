A1 FIX-FORWARD, round 3. Fresh owner. One round, every item, then a new code-ready head.
GOAL  Close the round-2 verification findings on PR 39 (branch claude/a1-evaluate-text, head fa4a6fa2) and bring it to merge-ready.
SCOPE  Only PR 39's files. Local branch: git fetch origin claude/a1-evaluate-text && git checkout -b a1-fix3 FETCH_HEAD; push with git push origin HEAD:claude/a1-evaluate-text, fast-forward only. You are the only writer; the round-2 owner has finished.
CONTEXT  <store> = /Users/jason/dev/career-ops/.claude/worktrees/busy-shannon-d44979/docs/superpowers/research/2026-11-08-scan-automation-and-platform/orchestrate. Read <store>/preferences.md (25 orders, binding), <store>/briefs/A1-fix2.md, then <store>/receipts/A1-r2/ (review-errors.md, review-tests.md, review-comments.md, review-code.md, verifier.md, owner-merge-ready.md). The verifier closed every round-2 item; the verdict at fa4a6fa2 is verifier-failed on the items below.
CODE
1. (review-errors 1, confirmed at route.ts:62, :220-221, report-persist.mjs:275-278, :298) For the evaluate kinds (isEvaluateKind) refuse before any CLI resolution an input that has leading or trailing whitespace, a tab, a CR or LF, or no http(s) scheme, with one 400 message that says the posting URL must be a bare http(s) URL. Today such an input bills a full run and then either fails to persist (newline) or persists a tracker row with no URL and no posted date (leading space). Leave the other kinds' input rules alone. Tests per shape, with the no-spawn hook.
2. (review-errors 2) A cliId that is not a non-empty string (1, {}, true) returns 400 before CLI resolution instead of reaching the substitution fallback; the message names cliId. route.ts:66's "input and cliId required" becomes this message, since input has its own check now (review-comments 4). The substitution of an unknown string id stays parked.
TESTS (web/tests/lib/run-route-kinds.test.mjs)
3. (review-tests 1, verifier mutant m2) An explicit null for jdText, brief and evaluationSections on a non-owning kind returns the field's 400.
4. (review-tests 2) A cover request with a brief is not refused by the field table and reaches the spawn hook.
5. (review-tests 3) With a CLI that does not resolve, a bad input still gets the input 400 and not the CLI error, so the check order is pinned. Find the hook the evaluate-text tests use for an unavailable CLI.
DOCS
6. (review-comments 1, confirmed) .claude/skills/upstream-review/SKILL.md:271 route.ts row: list the input refusals (items 1 and 2), the field table (jdText, brief, evaluationSections), the errno in the realpath 400 and its log line, the "Our hunks" entries for them, and the tests that pin them.
7. (review-comments 2, confirmed) web/README.md:78-81: list the route's refusals, including the new ones.
8. (review-comments 3) PR body: "What changed" and "Blast Radius" name every refusal that reaches kinds other than evaluate-text (unknown kind, NUL, stray brief or evaluationSections, non-string or blank input, malformed cliId, malformed evaluate URL).
9. owners/A1.tsv: append this round's rows.
Parked, not yours: an unknown string cliId substituted by the installed CLI; a bare 500 on spawn failure or on careerOpsRoot() throwing; evaluationSections [] meaning; a second deny rule naming the unresolved symlink spelling (operator gate).
VERIFY  npm install at the root, npm ci in web/. node scripts/check-syntax.mjs; node test-all.mjs --quick; cd web && npm run typecheck && npm test; --only headless-permission-flags; --only fork-deviations-covered after the head commit. Prove items 1-5 with mutants judged by the web suite's exit code (order 23). Re-run the fake-CLI self-proof for items 1 and 2 (no real tokens). /simplify and /code-review before each commit, /no-comments.
TIMEBOX  Ninety minutes to merge-ready.
FORBIDDEN  No gh pr merge, no retarget, rebase or force-push, no edits outside PR 39's files, no write tool or auto-approve flag for any worker, no user-layer files, no reading the operator's data root.
REPORT  Code-ready with the head SHA, per-item file:line, gate outputs and mutant results; then babysit CI (gh pr checks 39 --watch) and report merge-ready with CI state and the PR URL https://github.com/jrmatherly/career-ops/pull/39. Keep outputs in your scratchpad subfolder owner-A1-r4.
STANDING  <store>/preferences.md, binding. Invoke /jstack:j-mode first (order 9).
