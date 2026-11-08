lane audit-b, head 38e86d5c, ISSUES (none blocking)
PR head moved to 5ecd6dc8 after the swarm started; diff vs 38e86d5c is owners/F1.tsv only (+2 lines), code identical.
Checks passed: WEB_UI.md states the behaviour change; four runner test titles match the plan, assertions behavioural; body test covers carry/drop/default; scheduledJobBody is the single builder (create-job-modal ~44, edit-job-modal ~64, schedule-job-action ~26); card reads "uses portals.yml"; no personal data; PR body states no personal data.
I1 toggle hides the whole FilterBuilder (posted-within, sources, scan depth too) in both modals; create-job-modal ~138-146, edit-job-modal ~153-160. Disclosed deviation.
I2 PR body claims test-all --quick, not the full suite dev-workflow asks the body to state.
I3 a missing or unreadable portals.yml now fails at attempt 1 with no retry (readPortals try/catch in executeJob); trunk retried 3 times; code comment only, not in WEB_UI.md.
I4 custom-mode refusal message still says "in the job or portals.yml title_filter.positive" although the guard now reads title_filter_full.positive for the full engine.
I5 Explore checkbox has no hint that it discards the Explore lists just set (schedule-job-action ~81).
I6 edit-job-modal imports FiltersFromToggle from create-job-modal.
I7 WEB_UI.md double blank line plus --- at ~51-53.
