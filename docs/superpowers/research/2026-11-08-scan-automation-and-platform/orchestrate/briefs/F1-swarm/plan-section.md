## Let a scheduled job use the file's filters (PR-F1)

**Depends on.** None.

**Files.**

- [ ] Edit `web/src/lib/scheduled-jobs.ts` (`ScheduledJob`, `JobFields`, `parseScheduledJobInput`).
- [ ] Edit `web/scripts/scheduled-jobs-runner.mjs` (`writeJobPortals`, `executeJob`).
- [ ] Create `web/src/lib/scheduled-job-body.mjs` (pure builder of the create and edit request bodies) and `web/tests/lib/scheduled-job-body.test.mjs`.
- [ ] Edit `web/src/components/scheduled-scans/create-job-modal.tsx`, `edit-job-modal.tsx`, `job-card.tsx` and `web/src/components/explore/schedule-job-action.tsx` to call the builder.
- [ ] Edit `web/tests/lib/scheduled-jobs-runner.test.mjs`.
- [ ] Edit `docs/WEB_UI.md` (the scheduled scans section, including the behaviour change below) and `.claude/skills/upstream-review/SKILL.md` (the new sub-heading and Rules entry, rows for `scheduled-jobs.ts`, the runner, the four components, the two tests and the new helper).

**Build.**

- [ ] Add `filtersFrom: "custom" | "file"` to `ScheduledJob` and `JobFields`; `parseScheduledJobInput` accepts `"file"` or `"custom"`, defaults to the base job's value, else `"custom"`.
- [ ] In `executeJob`, when `job.filtersFrom === "file"` skip `writeJobPortals`, resolve the base file as the runner's own `portalsPath(root, env)` (the absolute path of `CAREER_OPS_PORTALS` when set, resolved against the data root, else `<root>/portals.yml`; the web's `portalsConfigPath` is TypeScript and cannot be imported), read it once, refuse an empty `title_filter.positive` with the message "Scheduled scans require title keywords in portals.yml when a job uses the file's filters", and otherwise pass that absolute path as `CAREER_OPS_PORTALS` to the scanner with `--since`, `--ats` and `--limit` unchanged. Write one stderr line `portals: <path> (file)` or `(overlay)`.
- [ ] In `writeJobPortals`, apply one rule to all six lists. A job list that is empty inherits the file's list (`positive`, `negative`, `allow`, `block`, `block_hard`, `always_allow`); a non-empty job list replaces it. `title_filter_full`, when present in the file, is merged only from the job's non-empty title lists. This changes stored custom jobs whose lists are empty, which today wipe the file's lists; `docs/WEB_UI.md` states it.
- [ ] The body builder `scheduledJobBody({ name, engine, filtersFrom, filters, every, unit, timezone, startAt })` returns the JSON the routes accept; the modals and the Explore action call it, with a "Use portals.yml filters" toggle that hides the title and location lists when on. `job-card.tsx` shows "uses portals.yml" instead of the positive list.

**You see.**

- [ ] A job saved with the toggle on runs, stderr reads `portals: <root>/portals.yml (file)`, and no `data/tmp/scheduled-*.yml` is written.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `web/tests/lib/scheduled-jobs-runner.test.mjs` gains "file filters skip the overlay and pass the absolute portals path", "file filters refuse an empty positive list with the runner's message", "custom job with empty lists inherits all six from the file" and "custom job with a non-empty negative list replaces the file's". Run `cd web && node --experimental-strip-types --test tests/lib/scheduled-jobs-runner.test.mjs`.
- [ ] `web/tests/lib/scheduled-job-body.test.mjs` asserts the body carries `filtersFrom` and drops the lists when it is `"file"`. Run `cd web && node --experimental-strip-types --test tests/lib/scheduled-job-body.test.mjs`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Two fresh data roots with the same fixture board, a custom-filter job with non-empty lists at trunk and at head, one run each. Save `f1-custom-run.png`. Pass when both runs record `success` and the same `rolesFound`.
- [ ] Lane 2. Create a job with the toggle on and run it. Save `f1-file-run.png`. Pass when the run is `success` and `data/tmp/` holds no `scheduled-*.yml` during the run.
- [ ] Lane 3. Edit an existing custom job, turn the toggle on, save, reload. Save `f1-edit-toggle.png`. Pass when the card reads "uses portals.yml".
- [ ] Lane 4. Explore, set filters, press Schedule with the toggle on. Save `f1-explore-schedule.png`. Pass when the created job has `filtersFrom: "file"` in `data/scheduled-jobs.json`.
- [ ] Lane 5. Custom job with an empty negative list against a `portals.yml` whose negative list holds `intern`. Save `f1-negative-inherit.png`. Pass when the overlay written during the run carries `intern` under `title_filter.negative`.
- [ ] Lane 6. Set `CAREER_OPS_PORTALS` to a relative path and run a file-filter job. Save `f1-env-portals.png`. Pass when the stderr line names the absolute path under the data root.
- [ ] Lane 7. A file-filter job against a `portals.yml` with an empty positive list. Save `f1-empty-positive.png`. Pass when the run fails with the runner's message and the scanner never starts.
- [ ] Lane 8. Mobile width, create modal with the toggle. Save `f1-mobile-modal.png`. Pass when the toggle and the hidden lists render without horizontal scroll.
- [ ] Lane 9. Run history drawer after lanes 2 and 5. Save `f1-history.png`. Pass when both runs appear with their states.
- [ ] Lane 10. A stored job from before this PR, with no `filtersFrom` and empty lists, against a `portals.yml` whose lists are also empty. Save `f1-legacy-job.png`. Pass when it loads as custom and the overlay equals the one trunk wrote.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of `executeJob` with a fake `spawnFn` that exits at once, trunk and head in custom mode, and head in file mode, so the measured work is the overlay write or its skip.
- [ ] Probe. `node --input-type=module -e` that imports the runner and times `executeJob` ten times each, interleaved trunk and head.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Head custom mode within 5 percent of trunk; head file mode no slower than head custom mode.

**Review gate.** None. PR-F1 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The operator merges.

