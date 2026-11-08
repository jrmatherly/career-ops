## Show rank and run grouping in the Inbox (PR-R2)

**Depends on.** None.

**Files.**

- [ ] Edit `web/src/lib/pipeline-table.mjs` (`parseInbox` returns `rank` and `rankReason`), `web/src/lib/career-ops.ts` (`InboxJob` gains `rank?: number` and `rankReason?: string`; `readInbox` fills them).
- [ ] Create `web/src/lib/inbox-sort.mjs` (`compareInboxJobs(a, b)`) and `web/tests/lib/inbox-sort.test.mjs`.
- [ ] Edit `web/src/components/inbox/inbox-triage.tsx` (the comparator at its documented single point, an `added` facet keyed on the scan date, read from `?added=YYYY-MM-DD`) and `web/src/components/inbox/triage-row.tsx` (the rank label).
- [ ] Edit `web/tests/lib/inbox-parse.test.mjs`; edit `.claude/skills/upstream-review/SKILL.md` (rows for the five edited files and the two new ones).

**Build.**

- [ ] `parseInbox` parses the `rank:` segment as `<number>/5 — <reason>` into `rank` (a number) and `rankReason` (the text after the dash, trimmed); `readInbox` copies them onto `InboxJob`.
- [ ] `compareInboxJobs` orders ranked rows first by rank descending, then by age as today; the Inbox comparator calls it.
- [ ] The facet chip "Added <date>" groups rows by their scan date from `readScanDates`, selectable from the chip or from `?added=YYYY-MM-DD`, so a run's rows can be selected together and sent to Score shortlist.
- [ ] `triage-row.tsx` shows the rank as "rank 4.2" with the reason as its title text, never the word "score".

**You see.**

- [ ] A pipeline with ranked rows opens sorted by rank, each row labelled "rank N", and the shortlist tray's Score shortlist button evaluates the selected rows as before.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `web/tests/lib/inbox-parse.test.mjs` gains "parseInbox returns rank and reason" and "a row without rank parses as before". Run `cd web && node --experimental-strip-types --test tests/lib/inbox-parse.test.mjs`.
- [ ] `web/tests/lib/inbox-sort.test.mjs` asserts ranked rows first, descending, then age. Run `cd web && node --experimental-strip-types --test tests/lib/inbox-sort.test.mjs`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open the Inbox with an unranked fixture at trunk and head. Save `r2-unranked.png`. Pass when the order and the rows match.
- [ ] Lane 2. Fixture with five ranked and three unranked rows. Save `r2-ranked-order.png`. Pass when ranked rows lead in descending order.
- [ ] Lane 3. Hover a ranked row. Save `r2-reason.png`. Pass when the reason shows.
- [ ] Lane 4. Open `/pipeline?added=<date>`. Save `r2-facet.png`. Pass when only rows with that scan date remain and the chip is selected.
- [ ] Lane 5. Select three ranked rows and press Score shortlist with a fake CLI. Save `r2-score.png`. Pass when three evaluate jobs start and the cost confirmation shows first.
- [ ] Lane 6. A `rank:` segment whose reason the ranker sanitised from a `|`. Save `r2-pipe-reason.png`. Pass when the row's columns are intact.
- [ ] Lane 7. Mobile width. Save `r2-mobile.png`. Pass when the rank label fits without wrapping the company cell.
- [ ] Lane 8. Skip a ranked row. Save `r2-skip.png`. Pass when it flips to done and the order of the rest holds.
- [ ] Lane 9. Dark mode. Save `r2-dark.png`. Pass when the rank label meets contrast in both themes.
- [ ] Lane 10. Keyboard only, tab to a row and open the reason. Save `r2-a11y.png`. Pass when the reason is announced through the row's accessible name.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `parseInbox` time on a 2000-row `pipeline.md`, trunk and head.
- [ ] Probe. `node --input-type=module -e` importing `web/src/lib/pipeline-table.mjs` and timing `parseInbox` ten times each, interleaved.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Head within 10 percent of trunk.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 and lane 4 screenshots into `private/review/r2-review-order.png` and `private/review/r2-review-facet.png`.
- [ ] Record a 30 to 60 second video of sorting, grouping and scoring on a lane VM. Save it as `private/review/r2-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The operator merges.

