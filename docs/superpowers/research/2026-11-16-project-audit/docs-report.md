# Docs audit report

Commit `2edd1b33`, 2026-11-16. Slice 5 of 6: documentation, agent rules and repo hygiene. Read-only audit. Repro scripts are in `repro/docs/` (rename `.mjs.txt` to `.mjs` and run from the repo root).

Corrections:
- Item 7 was corrected by the lead.
- Item 2 was recounted at the lead's request. The re-check also found that the item's second half was wrong.
- Two smaller fixes came from re-checking during planning: item 1's scope, and the line number in item 6.
- Each is marked where it applies.

ISSUES

1. Shipped scripts import fork files that the updater never ships
- Severity: high, for installs that update with `apply`.
- Confidence: the imports and the crash are measured. The failure through `apply` is inferred from `update-system.mjs`.
- Where:
  - `scan.mjs:122`, `audit-portals.mjs:74` and `verify-portals.mjs:50` import `lib/entry-pacing.mjs`.
  - `add-entry.mjs:59` imports `lib/resume/model.mjs`.
  - `build-cv-html.mjs:46` imports `lib/resume/to-payload.mjs`.
  - `import-tracker.mjs:45` imports `lib/import-rr-applications.mjs`.
  - Every target is listed in `config/local-paths.txt` and none is in SYSTEM_PATHS (`lib/update-manifest.mjs:36`). `apply` delivers only SYSTEM_PATHS and never touches a declared local path (`localUserPaths`, `update-system.mjs:403`).
- Evidence:
  - `repro/docs/closure-test-draft.mjs.txt` lists 74 such loads at HEAD. The rest are shipped `tests/*.test.mjs` suites that load or spawn `resume.mjs`, `lib/resume/*`, the `lib/application-*` modules and the fork CLIs.
  - Copying the tree without `lib/entry-pacing.mjs` and running `node scan.mjs --help` fails with `ERR_MODULE_NOT_FOUND`.
  - `node validate-system-paths-coverage.mjs` still prints "OK: 4663 tracked files covered".
- Wider than first reported (re-check during planning):
  - `lib/import-rr-applications.mjs:325-342` runs `interview-round.mjs`, `followup-pin.mjs`, `salary-observe.mjs` and `offer-terms.mjs` by name.
  - `tests/coderabbit-push-gate.test.mjs:10-11` statically imports `.githooks/`.
- Fix (M):
  - Move the 15 fork code entries and `THIRD_PARTY_NOTICES.md` into SYSTEM_PATHS.
  - Guard the `.githooks/` test.
  - Add an import-closure test and a rule line.

2. `.claude/rules/modes.md` miscounts the market directories
- Severity: medium. Confidence: measured.
- Where: `.claude/rules/modes.md:9` says "Twenty market directories".
- Evidence:
  - `modes/` has 28 subdirectories.
  - The rule used to tell a market directory: it holds its own `_shared.md`. 23 do: ar at da de es fr hi id in it ja ko nb nl pl pt ru sg tr ua vi zh zh-TW.
  - The other five are `heuristics/`, `interview/`, `oferta-signals/`, `pdf/` and `regional/`. They hold shared assets, not a market.
- Recounted at the lead's request.
- Correction on re-check: the second half of this item was wrong.
  - Line 10's "copy that file over the four `*-directory/skills/career-ops/SKILL.md`" is accurate.
  - The six hidden-directory copies (`.claude`, `.opencode`, `.qwen`, `.antigravitycli`, `.grok`, `.kimi`) are tracked symlinks to `.agents/skills/career-ops/SKILL.md` (git mode 120000), and only the four `*-directory` copies are regular files.
  - `test-all.mjs:7145-7160` checks the symlinks separately.
- Fix (S): replace the count.

3. Stale plan path in the deviations skill and the publish README
- Severity: medium. Confidence: measured.
- Where:
  - `.claude/skills/upstream-review/SKILL.md:103` names `docs/superpowers/plans/2026-11-08-scan-automation-and-platform.md`.
  - `publish/README.md:3` names `docs/superpowers/plans/2026-11-06-reactive-resume-convergence.md`.
  - Both now live under `plans/completed/`.
  - The same stale paths appear in `docs/superpowers/plans/completed/2026-11-06-reactive-resume-convergence.md:13,124,125,1480` and `.upstream-review/reviews/2026-11-08-review.md:3,6`. Those are historical records and stay as written.
- Fix (S).

4. Broken relative link in a product mode
- Severity: low. Confidence: measured.
- Where: `modes/tr/scan.md:125` links `../docs/SUPPORTED_JOB_BOARDS.md`, which resolves to `modes/docs/`. Upstream has the same line, so the bug is upstream's too.
- Evidence:
  - `repro/docs/links.mjs.txt` scanned 457 tracked `.md` files outside `docs/superpowers/research` and 1,840 relative links. 46 did not resolve.
  - 45 of those are intentional placeholders, such as `../interview-prep/{company-slug}-redflags.md` (22) and `reports/001-company-2026-01-01.md` (16).
- Fix (S).

5. `discover-ats.mjs` probes 11 slug vendors, while the registry admits 25
- Severity: medium. Confidence: measured.
- Where:
  - `discover-ats.mjs:104-117` (VENDORS) and `:128` (VENDOR_ORDER).
  - `lib/ats-board-url.mjs:33-59` (BOARD_URL_BUILDERS) and `employers/README.md:29`.
- Evidence:
  - The 14 missing vendors each have a provider and a provider test: applicantpro, hibob, hirehive, homerun, jazzhr, keka, personio, prevueaps, schoolspring, taleez, teamtailor, trakstar, turbohire and zoho-recruit.
  - Each provider's `detect()` accepts its builder's URL for slug `acme`.
  - The file is identical to upstream's.
- Fix (M). The owner should first measure how each vendor answers for a tenant that does not exist (see DOCS-5).

6. `/pr-ready` skips the CodeRabbit gate
- Severity: low. Confidence: measured.
- Where: `.claude/skills/pr-ready/SKILL.md:10-19` has no CodeRabbit step.
- The rule is at `.claude/rules/dev-workflow.md:5`, not `:4` as first cited (corrected on re-check). It says `.githooks/pre-push` refuses a push without a review.
- Fix (S).

7. Stale memory note on `npm run lint`: REFUTED (corrected by the lead)
- The lead ran `npm run lint` on 2026-11-16 and it exits 2, as the memory note says.
- A shell wrapper adds the failure; `node scripts/check-syntax.mjs` exits 0.
- My own run printed exit 0. I did not find out why the two runs differ. The note stays.

8. Repo hygiene (low, measured, not planned)
- Tracked files over 1 MB: `docs/demo.gif` (4.8 MB) and `test-all.mjs` (1.0 MB, 19,943 lines).
- `demo.gif` is used by the 18 translated READMEs but not by the English `README.md`.
- Of 311 tracked top-level entries, only `.all-contributorsrc` and `.codexignore` are referenced nowhere. `.all-contributorsrc` feeds upstream's contributor bot, which the fork removed.
- `docs/REVIEWING.md` is referenced only by the upstream-review skill.

Checked and found accurate

`.claude/rules/dev-workflow.md`:
- "seven token files": five distinct extra files plus `web/package.json` and its lockfile.
- "10 local reviews per rolling hour": `coderabbit review --usage` shows "10 of 10, rolling 1 hour".
- `coderabbit-review.mjs` uses `--gate info`, `--decline` and `--skip`, and exits 2 on findings.
- The `.githooks/` hooks, `lib/is-main-module.mjs`, `scripts/stamp-version.mjs` and both `CHANGELOG.fork.md` files exist.
- The SessionStart hook sets `core.hooksPath`.
- `update-system.mjs check` reads the fork's releases.
- The `.claude/` path classes match the code.

Providers and skills:
- `.claude/rules/providers.md`: every named file exists, and all 171 providers have `tests/providers/{name}.test.mjs`.
- The `add-provider` and `pr-ready` skills name test files and an `--only` flag that all exist.

Coverage and earlier leads:
- All 25 `config/local-paths.txt` entries match tracked files.
- `docs/SUPPORTED_JOB_BOARDS.md:187` (Authentic Jobs) was re-measured 2026-11-15.
- `private/plans/` is empty, and the providers plan is tracked under `plans/completed/`.

Docs against code:
- Every `npm run <x>` in the docs exists.
- DOCKER.md's `./cops` subcommands and its forwarded API keys match `cops` and `docker-compose.yml`.
- The `CAREER_OPS_*` overrides in DATA_CONTRACT.md exist.
- The test files ARCHITECTURE.md names exist.
- README's "100+ companies" holds: there are 262.
- README's "no mail transport" holds.

Refuted leads:
- `data/blacklist.md` is opt-in by design (`AGENTS.md:130`) and is read by `scan.mjs`, `discover-ats.mjs`, `discover-new-companies.mjs` and `scan-ats-full.mjs`. The phrase "not yet created" does not exist anywhere.
- `sponsor-check.mjs` is documented as a standalone CLI.

Not checked
- `node test-all.mjs`.
- A real `update-system.mjs apply`.
- CONTRIBUTING.md's policy prose.
- `web/README.md` beyond its commands and paths.
- The unticked boxes in completed plans, beyond one sample.
- Docs under `docs/superpowers/research`.
