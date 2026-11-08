toolkit pr-test-analyzer on the fix round, head c6464912, mutation-tested; 52/52 pass
Five of the six prior survivors now die (T1 helper, T2, T3, T4, T5). Still open:
G1 [7] parseScheduledJobInput's wiring in scheduled-jobs.ts is untested: bypassing the helper, or replacing `base?.filters || DEFAULT_FILTERS` with DEFAULT_FILTERS (every edit of a file-mode job wipes its saved lists) both survive. The earlier premise that the .ts cannot load under strip-types is false: ten suites use web/tests/helpers/web-ts-alias-loader.mjs; a 20-line probe test passed at head and killed both. Add it.
G2 [5] empty or non-mapping portals.yml untested (runner:176); the YAML-error test at :325 asserts only the `${file}: ` prefix. A scalar file still shows "portals.yml must contain a mapping" with no path.
G3 [4] title_filter_full present but null unpinned (runner:164 `!= null` vs the scanner's truthiness); one fixture.
G4 [4] T6: a job with no engine unpinned in emptyTitleKey; one case.
G5 [3] the job's own lists bypassing cleanChips survives; defence in depth, one fixture.
G6 [4] hideLists prop has no automated pin; the browser suite accessible-names.browser.test.mjs already visits /scheduled-scans and could open the modal. Recorded, not a blocker.
