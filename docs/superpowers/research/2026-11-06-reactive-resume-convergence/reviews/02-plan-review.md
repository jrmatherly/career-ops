# Second independent review of the revised plan (33 findings)

Subagent research report, 2026-11-06. Model output: claims carry file:line evidence or are labelled inference; verify against the code before relying on one.

Review of the plan at `/Users/jason/dev/career-ops-rr-plan/docs/superpowers/plans/2026-11-06-reactive-resume-convergence.md`. I checked every claim below against the files cited. Findings are ordered by severity.

**Blocking**

1. **A hand-written cv.md has no way to pass the gate the first time.** The boot recipe and PR-02 lane 1 copy `examples/cv-example.md` in and expect `absorb` to succeed. That file uses `# CV -- Alex Chen`, `**Location:**` lines, `## Professional Summary`, `## Work Experience` and `### TechFin Corp -- Austin, TX` (examples/cv-example.md:1-15). Step 5 makes the generator emit `## Experience` and `### Company — Location` (plan:197). `normalizePandocLine` turns `--` into an en dash, not an em dash (lib/cv-markdown.mjs:56), and heading text is not normalised at all. The prototype only tested JSON to markdown and back (canon/absorb.out S0). The research says such a cv.md "fails the gate once. The user accepts a normalized cv.md one time, shown as a diff" (canon/report.md:110). No step, command or UI in the plan does that, and plan:189 rules out writing cv.md from JSON. The prototype also failed S3, a new job appended, and S8, an en-dash date (report.md:78,83). Step 7 tests S3 without saying it must be lossless.

2. **The generator drops sections the editor lets you edit.** Step 5 asserts `unmapped` lists languages, publications and references (plan:197). The prototype's generator covered only summary, experience, projects, education and skills, and it did not carry phone or headline (absorb.out tail; report.md:111). The editor is a form "over the twelve sections and basics" (plan:436), and the sample fills all twelve. This breaks spec rule 4 (spec:42) and is the risk Appendix C names (plan:1077). A cv.md that contains a Languages section can never pass the gate.

3. **PR-06 depends on CLI features PR-02 never builds.**
   - The preview route writes a draft to a temp file and runs `export payload --out -` (plan:425). But `export` reads `data/resume.json` after absorbing cv.md. It has no input flag and no `-` for stdout (plan:189).
   - `PUT /api/resume` writes resume.json "with the new hash" (plan:435), but no subcommand writes resume.json from supplied data, and the web must not load zod.
   - PR-02 needs `render --in <file>` and `save --in <file> --expected-cv-sha`.

4. **Parallel owners would edit the same files.** The plan says "Two owners never touch the same file" (plan:60), but the dependency table breaks that rule.
   - PR-03, PR-04 and PR-11 run in parallel and all edit `resume.mjs`, `docs/SCRIPTS.md`, `THIRD_PARTY_NOTICES.md` and the deviations table. PR-03 and PR-11 both edit `package.json`.
   - PR-06, PR-10 and PR-14 all edit `nav-items.ts`. PR-02, PR-08 and PR-12 all edit `DATA_CONTRACT.md`.
   - Either run these in sequence, or declare these files append-only and rebase on conflict.

**Wrong**

5. **The template choice is stored in RR's `metadata.template`, which can't hold it.** That field is `templateSchema.catch("onyx")`, an enum of RR template names (rr/repo/packages/schema/src/resume/data.ts:763-765, templates.ts:3). PR-06 lane 3 expects `metadata.template: "compact"` (plan:458), which parses to `onyx`. The operator's exports use `scizor` and `azurill`. The root is a `looseObject` (data.ts:816), so a root-level key would survive.

6. **The style settings never reach the renderer.** `build-cv-html.mjs` reads style only from the profile (build-cv-html.mjs:58, theme-style.mjs:79). Its third argument is a template file path, not a template name (build-cv-html.mjs:1106-1112).
   - The `{ template?, style? }` body in PR-05 (plan:371) therefore has no way in. The route has to resolve the name through `cv-templates.mjs` and point `CAREER_OPS_PROFILE` at a temp copy of the user's profile, which also carries section order, locked sections and the page budget.
   - Nothing maps resume.json design fields to style for pdf mode or `share --from-resume`, so the design editor changes only the preview.

7. **The visual-suite command does not run the visual suite.** `test-all.mjs:170` filters out `tests/cv-visual/cv-visual.test.mjs`. That suite is Playwright Test (`npm run test:cv-visual`, package.json:30) and runs in the Linux cv-visual image (test.yml:131). This affects plan:379, 389 and 519.

8. **The absorb key is misquoted.** The plan says absorb matches on company, title and dates, "the key cv-title-check.mjs:93-136 already uses" (plan:186). The real key is company plus dates (cv-title-check.mjs:209), and the title is the field it compares. Using the real key turns a retitle into a changed entry, which removes S5 and most of the pairing UI.

9. **The "idempotent save order" claim is false** (spec:41, plan:436). If the process crashes after cv.md is written with a title, company or date edit, the next load absorbs the new cv.md against the old JSON. That produces an orphan and the gate refuses. Store the target hash in resume.json before writing cv.md.

10. **PR-09 calls `followup-seed.mjs` wrongly.** It passes RR's `followUpAt` as `--date` (plan:634,637). `--date` is the apply date the cadence counts from. A row that is not Applied exits 1 unless `--force` is passed (followup-seed.mjs:21-23,38-43).

11. **PR-09 keys the sidecars by the reserved number, which may not be the tracker number.** `import-tracker.mjs:349` reserves one number per TSV, but `merge-tracker` can fold the row into an existing one or refuse it (lines 359-368). The sidecars, ledger rows and `jds/` name must use the number after the merge. If the merge lands and a sidecar write then fails, the next run sees the row as `tracked` and never adds its sidecars.

12. **SYSTEM_PATHS is the wrong claim for new root scripts.** Plan:24, plan:176 and spec:109 put the new root scripts and `lib/resume/` in SYSTEM_PATHS. `dev-workflow.md` says fork-local root files go in `config/local-paths.txt`. SYSTEM_PATHS names `lib/` files one by one (update-manifest.mjs:159-177), so there is no `lib/` entry to fall under. Following the plan also makes every PR edit upstream's `update-manifest.mjs`.

13. **PR-13 breaks PR-12's CLI and the CI run.**
   - Owner routes require a cookie session (plan:885), but `share.mjs pull`, `stats` and `delete`, and PR-14's Pull button, all use the API key. The tests cover upload only.
   - The image runs `npx auth migrate` after `npm ci --omit=dev` (plan:894,1003), but the `auth` package is not a dependency. The prototype downloaded it with `npx --yes auth@1.7.14` (auth/RESULTS.md:21).
   - The root `test-all` picks up `tests/publish-auth.test.mjs`, but its dependencies live only in `publish/node_modules`. CI fails on the import.

14. **The layout Check rules judge the wrong template.** They import RR's `templateLayouts` (rules.ts:12), so they describe RR's template, not the career-ops template that is actually rendered.

**Gaps**

15. **Missing dependencies.**
   - PR-11's JSON Resume round trip needs PR-03 (plan:771,790).
   - PR-12 says `--from-resume` "needs PR-02" (plan:829), but its row lists only PR-01.
   - PR-07 lanes 5 and 6 need layout and body-font editing. PR-06's design panel covers only the eight new tokens, and `font_size` is an existing key (theme-style.mjs:46).

16. **Item hiding has no producer.** PR-12 has `--hide-item` (plan:829), but `resumeToPayload` hides sections only (plan:188). How `hidden` flags affect the payload is not specified, yet spec:91 relies on it. The CLI list (plan:817) has no `republish`.

17. **PR-03 `--confirm` overwrites an existing cv.md wholesale** (plan:253). That is the overwrite risk spec:48 rejected. The operator also has two RR resumes (spec:12), and the plan imports only one.

18. **PR-09 writes to `data/pipeline.md` without `pipeline-lock.mjs`**, which `scan.mjs:156` uses, and without deduplicating against the scan history.

19. **Existing code the plan should reuse.**
   - `contact-extract.mjs:153` already exports `appendContact`.
   - Offers already live under `data/offers/{company-slug}/` (modes/offer-prep.md:65), and DATA_CONTRACT.md:59 already covers `data/offers/*`.
   - `reduceHeldSave` and `applySavedStatus` are already extracted, so the board can avoid editing the 1050-line `pipeline-view.tsx` (plan:694).

20. **The web app cannot import `readMeta` or `readEvents`.** It keeps its own copies of root libraries in `src/lib/core`. PR-08 also has no CLI that dumps every row as JSON.

21. **PR-08 step 3 checks only two readers of active-interviews.md.** `close-stale.mjs`, `verify-pipeline.mjs` check 13 and `tracker-sync-check.mjs` also read it.

22. **Some perf gates cannot be measured as written.**
   - PR-06 keystroke-to-preview has no `performance.mark` to find in the trace.
   - PR-10 and PR-14 ask for time to interactive, which DevTools traces do not report.
   - PR-01's 5 percent bound on two runs of the quick suite is inside the noise.
   - PR-05 step 1 checks out `origin/main` at test time. That fails in a shallow clone and proves nothing after merge.

23. **The spec and plan disagree on the install path.** The spec says a local marketplace from the checkout (spec:105). Plan:126 says the GitHub marketplace.

24. **PR-06 and PR-12 are too big for one owner and one review.**
   - PR-06 has four routes, a twelve-section form, design, templates, pairing and ten lanes.
   - PR-12 has the service, the CLI, two render sources and ten lanes.
   - Each splits cleanly.

**Nits**

25. Leftover "derive `cv.md`" wording in the PR-02 title (plan:67,161).
26. PR-03 lane 2 is garbled (plan:278).
27. The template glob misses `templates/ats/cv-template.ats.html` (plan:361).
28. The installed `lucide-react` is 1.27.0, not 1.8.
29. Several "You see" lines are guesses.
   - The validator prints only `OK: 3224 tracked files covered`.
   - The Check score is passed over applicable times 100 (rr index.ts:123), so the expected number is likely 96, not 95.
   - The sample has 6 skills, not 7.
   - `valid` is a `build-cv-html` key, not an export key.
30. The vendor list omits `expected-labels.json` and `present-labels.json` (period.ts imports them) and the `utils` `stripHtml`. Use `stripTypeScriptTypes` from `node:module`, because `--experimental-strip-types` does not write stripped files.
31. `--only application-`, `--only backfill` and `--only resume-` also match existing unrelated suites.
32. `*.sqlite` is not gitignored (.gitignore:223 covers only `*.db`).
33. PR-12 step 5 edits the README after the step 4 commit.

**Opportunities**

- **An `.ics` export per interview.** RR has `applications/calendar.ts`, and it is a small flag on `interview-round.mjs`. It is mildly justified by the rich-record goal. Optional.
- **Duplicate detection by canonical URL for RR imports.** `import-tracker` already does it (`normalizeUrl`, lines 222 and 236). Add a test, not code.
- **CSV export, `resume.mjs doctor`, and expand-style prompts.** Not justified. The tracker is already markdown, and `doctor.mjs` already covers the self-check.
- **A first-adoption command.** It is required by finding 1, not optional.

**Checked and clean**

- `KNOWN_ROOT_KEYS.html`. The new keys do not collide with `STYLE_VAR_MAP`.
- `listTemplates(kind, { dir, format, userDir })` at cv-templates.mjs:228.
- `decideCvWrite(disk, body)` and `POST /api/cv`, `runCoreCli`, and `rootScript`.
- The status route maps exit 4 to HTTP 503 and passes `--source web`.
- `PIPELINE_TABS` has exactly ten stage tabs.
- `acquireTrackerLock`, `trackerLockDirFor`, and `appendLedgerRows` at line 870 as a bare append.
- The ledger sits beside the tracker.
- `VALID_SOURCES` includes `backfill` and `web`, and day math excludes `backfill`. `parseStatusLog` is exported.
- The `ics-interview.mjs` header promises read-only. `#N in tracker` is matched.
- `jd-capture` resolves an unpadded `.md` capture.
- `reserveReportNumbers` and `CAREER_OPS_ADDITIONS`.
- `inlineLocalFonts(html)` at generate-pdf.mjs:2330.
- The `normalizePandocLine` and `normalizeDates` exports.
- The 23 rule ids. `metadata.check.ignored` exists.
- The `.job` and `.contact-row` classes.
- The `pipeline.md` entry format.
- `private/` is ignored. The commit-msg hook format.
- The `docs/superpowers` deviations row exists. `web/` is excluded from the coverage check.
- Web tests use `node:test`. All three icons exist.
- The Go dashboard is untouched, because no states change and it does not read active-interviews.md.

I did not check the Better Auth option names against live docs. `validateUserInfo` and the `verifyApiKey` body shape rest on the research report and the prototype. The biggest risk is findings 1 and 2: as written, the gate would refuse the operator's real cv.md on day one.
