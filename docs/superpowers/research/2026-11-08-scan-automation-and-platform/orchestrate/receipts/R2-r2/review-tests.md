pr-test-analyzer, R2 round 2, head 8669fdd4 vs main 6983ec4f (sonnet, coordinator-written from the agent's returned text). Verdict: no gap above low severity. npm test in web/: 2575 tests, 2526 pass, 0 fail, 49 skipped (existing browser-only skips; scan-added-dates.test.mjs not skipped). Counts read, not the exit code (order 23).

Mutations, each restored:
1. Status filter dropped in readScanIndex (added.add with no status check): scan-added-dates.test.mjs fails (the skipped_title row on 2026-11-06 leaks in).
2. Blank-counts rule removed (cols[4]?.trim() === "added"): scan-added-dates.test.mjs fails (the blank-status row on 2026-11-07 drops out). Pin holds both ways; the single-read assertion and the filtered-row-still-dates-its-URL check are in the same test.
3. Round-1 survivor (heading expression replaced by a literal "No matches"): inbox-sort.test.mjs fails (12 pass, 1 fail) via the source-text test matching the addedEmptyState call, title and hint expressions.

addedEmptyState (inbox-sort.mjs) pinned for: null when the date is null or a pending row carries it; "No roles were added on …" when absent from scan dates; "Every role added on … has been skipped or tracked" when present with no pending row; the same copy when the only row is hidden. Hint asserted in the no-roles case only (cosmetic).

Low, optional: inbox-triage.tsx:165-181 and :405 component wiring untested (conf 70, same by-design gap as round 1); page.tsx scanDates prop reaching InboxTriage unpinned (conf 60; a missing prop is a typecheck error); the source-regex test is brittle to reformatting (conf 50) but is what kills the survivor. Round-1 parked items not re-raised; parse tests for "rank: pending" in the company cell and the case-insensitive label were added. Not checked: the 49 skips individually.
