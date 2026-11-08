toolkit pr-test-analyzer, head 5ecd6dc8, mutation-tested (script in that lane's scratchpad; two control mutations failed tests, so the harness is sound)
The four plan-named tests exist and catch their mutations. Gaps, each a surviving mutation:
T1 [7] parseScheduledJobInput filtersFrom (scheduled-jobs.ts:103-104) has no test; the .ts cannot be loaded under strip-types (path alias), so the project pattern is a pure .mjs helper like scheduled-job-input.mjs. A PATCH with an invalid filtersFrom, or an edit body stripped of lists not keeping the base lists, would persist unguarded.
T2 [6] location lists replacing a non-empty file list untested (replacement asserted only for negative, :315-329); mutation "replace only when the file list is empty" survives.
T3 [6] file mode asserts only --since (runner.test.mjs:257); --ats and --limit unchanged is unpinned.
T4 [5] the stderr "portals: <path> (file|overlay)" line has no assertion; deleting it or swapping labels survives. This is also the only way the plan's You-see box can be pinned, since no live lane can see the runner's stderr from the dashboard.
T5 [5] unreadable or missing portals.yml failing once before the loop untested; move-the-read-back mutation survives. Fix: a missing-file test asserting spawned false, attempt 1, /ENOENT/.
T6 [3] missing engine treated as full in scannerTitleKeywords unpinned (hand-edited store only).
Not gaps: structuredClone removal is an equivalent mutation; title_filter_full merge pinned at :138, :149, :326; overlay absence/removal pinned; messages distinguished; legacy jobs load custom.
