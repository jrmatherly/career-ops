# Reactive Resume convergence implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Reactive Resume v6's resume model, importers, Check rules, design controls, richer application tracking with a board view, DOCX export, and public share links with reviewer feedback into this career-ops fork, while every agent and script keeps reading the same markdown, TSV and YAML files.

**Architecture:** `cv.md` stays the canonical CV. One new derived file, `data/resume.json` in Reactive Resume v6 JSON, is absorbed from it behind a lossless gate and carries what markdown cannot, and the CV payload is derived from the pair. Tracker detail lives in two append-only TSV sidecars keyed by tracker number, read by a new board page that writes through the existing `/api/status` path. Public sharing is a fork-local `publish/` service with Better Auth that serves pre-rendered, script-free CV HTML and returns view counts and comments into `data/`. No upstream file changes its contract.

**Tech Stack:** Node 24 `.mjs` core with `node:sqlite`, `node:test` suites under `tests/`, Next.js 16 and React 19 in `web/`, zod 4, fflate, docx, better-auth 1.7 with `@better-auth/api-key`, Playwright for PDF and visual tests, chrome-devtools MCP for live checks.

**Spec:** `docs/superpowers/specs/2026-11-06-reactive-resume-convergence.md`

## How to read this

One box is one unit of work. Every box names the evidence that checks it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs under `superpowers:subagent-driven-development` or `superpowers:executing-plans`, as the operator chooses. For a jstack-style run it maps onto `<jstack>/skills/j-mode/playbooks/autopilot-full.md`, one owner per PR, the operator merging. PR-06, PR-07, PR-10 and PR-14 change an interaction and stop at merge-ready for the operator's review.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.


## Global Constraints

- Every new tracked file is claimed by `SYSTEM_PATHS` in `lib/update-manifest.mjs`, by `USER_PATHS`, or by `config/local-paths.txt`, or `node validate-system-paths-coverage.mjs` fails.
- Every diverged upstream path gets a row in the deviations table of `.claude/skills/upstream-review/SKILL.md`. `tests/fork-deviations-covered.test.mjs` diffs HEAD, so run it after the commit.
- A new script resolves the data root with `getCareerOpsRoot()` from `path-resolver.mjs`, guards its entry with `isMainModule(import.meta.url)` from `lib/is-main-module.mjs`, and never writes `data/applications.md` except through `merge-tracker.mjs` and `set-status.mjs`.
- New tests are their own files under `tests/*.test.mjs` with no `process.exit()`. Browser suites declare `toolRequired('browser')`.
- Before every push run `node scripts/check-syntax.mjs` and `node test-all.mjs --quick`. `web/` changes also run `npm run typecheck` and `npm test` in `web/`.
- Commits follow Conventional Commits with a scope. Each commit is preceded by `/simplify` and reviewed with `/code-review`.
- New dependencies (`zod`, `fflate`, `docx`) go in the root `package.json` because core scripts need them; a plugin install re-runs `npm install` on update, which is the normal path. The publish service has its own `publish/package.json`.
- Review screenshots and videos go under `private/review/`, which is gitignored, never under `docs/`.
- Vendored Reactive Resume code keeps the MIT notice, copyright Amruth Pillai, in `THIRD_PARTY_NOTICES.md` and in a header comment.
- No headless worker gains a write tool. AI rewrite features copy the CV Studio rewrite route pattern.
- Imported Reactive Resume knowledge (facts, stories, AI answers) never enters generated content. Only resume JSON and tracker rows cross.
- Node 22.13 or newer. Pin the Node major in any image.
- Fixtures contain no personal data. The operator's own exports are used only in the migration steps, never committed.

## Review Focus

1. A `cv.md` edited so an entry's title changed. `resume.mjs absorb` must report an orphan and a new entry, write nothing, and exit 3. Test in PR-02.
2. An RR CSV row whose stage is `closed` with no reason, and one with a blank Application Date. The importer must land the first as Discarded and skip the second as never submitted, and say so in the preview. Test in PR-09.
3. A board drop onto the same column, and a drop while the tracker lock is held (HTTP 503, the route's mapping of exit 4 from `set-status.mjs`). The first is a no-op with no ledger row, the second retries three times and then reverts. Unit-tested in `web/tests/lib/status-save.test.mjs` in PR-10.
4. A visitor rotating `X-Forwarded-For` behind the tunnel. The publish service must take the client key from `cf-connecting-ip` only and count one view. Test in PR-12.
5. A `resume.json` with a section the payload cannot carry (languages, publications, references). Export must keep the file intact, render without those sections, and list them in the `--json` report as `unmapped`. Test in PR-02.

---

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] Read these from trunk at program start and re-read them at every tick. `git show origin/main:.claude/rules/dev-workflow.md`, `<jstack>/skills/j-mode/playbooks/autopilot-full.md`, `<jstack>/skills/j-mode/playbooks/opening-a-pr.md`, `<jstack>/skills/swarm/SKILL.md`.
- [ ] On the operator's go, arm the audit tick as `/loop 1h`. The tick re-reads the execution playbook, audits every active lane by side effects, replaces a stuck lane, and posts a status message only when something changed (a PR opened, a verdict, a merge, a blocker). Log each tick in `private/decisions-rr-merge.tsv`.
- [ ] On the operator's hold, send every owner a zero-writes order at once.

### Spawn owners

- [ ] One owner per PR, in the order and with the dependencies below. A PR starts only after its parents merge.
- [ ] Hold the file boundaries named in each PR's Files block. Two owners never touch the same file.
- [ ] Hold the review gate on PR-06, PR-07, PR-10 and PR-14.


| PR | Task | Depends on | Review gate |
| --- | --- | --- | --- |
| PR-01 | Install the fork daily and record the program | none | none |
| PR-02 | Add the typed resume model and derive `cv.md` and the payload | PR-01 | none |
| PR-03 | Import Reactive Resume JSON, JSON Resume, LinkedIn and DOCX | PR-02 | none |
| PR-04 | Port the 23 Check rules | PR-02 | none |
| PR-05 | Render a payload deterministically from the web and add design variables | PR-01 | none |
| PR-06 | Build the resume editor page with live preview | PR-02, PR-05 | operator |
| PR-07 | Pin Check findings in the preview | PR-04, PR-06 | operator |
| PR-08 | Add tracker sidecars and their writers | PR-01 | none |
| PR-09 | Import a Reactive Resume application export | PR-08 | none |
| PR-10 | Build the board page and the application sheet | PR-08 | operator |
| PR-11 | Export DOCX, Reactive Resume JSON and JSON Resume | PR-02 | none |
| PR-12 | Build the publish service and the share CLI | PR-01 | none |
| PR-13 | Add Better Auth to the publish service | PR-12 | none |
| PR-14 | Add the shares page to the web app | PR-12 | operator |
| PR-15 | Package the publish service for deployment | PR-13 | none |

PR-02, PR-05, PR-08 and PR-12 are independent and can start together after PR-01.

### PR mechanics, for every PR

- [ ] Branch from current `main` in a sibling worktree. Open the PR ready, never draft, with `gh pr create --base main`.
- [ ] Run `node scripts/check-syntax.mjs` and `node test-all.mjs --quick` before the PR-facing push. `web/` changes also run `npm run typecheck` and `npm test` there.
- [ ] Run `/simplify` before each commit and `/code-review` on the diff. Triage every automated reviewer comment per `<jstack>/skills/j-mode/references/bugbot-triage.md`.
- [ ] Add the deviations row and the `SYSTEM_PATHS` or `config/local-paths.txt` claim in the same commit as the files they cover, then run `node test-all.mjs --only fork-deviations` after committing.

### Verdict and merge, for every PR

- [ ] The verification lanes in the PR's Verify blocks run once at the code-ready head. A rebase or a small fix gets one verifier at the new head.
- [ ] Clean only when every lane passes. Findings go back to the owner.
- [ ] The operator merges with `gh pr merge N --merge --delete-branch`, then `git pull --ff-only` on `main`.

### Boot recipe, for every live lane

Each live lane runs in its own worktree at the PR head. CLI lanes drive through the `run` skill. Web lanes drive through the `chrome-devtools-mcp:chrome-devtools` skill.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`, then `ln -s ../career-ops/node_modules node_modules` and the same for `web/node_modules`.
- [ ] Create a scratch data root under the session scratchpad and export `CAREER_OPS_ROOT` to it. Copy `examples/cv-example.md` in as `cv.md` when a CV is needed.
- [ ] For web lanes, `cd web && npm run dev`, wait for the ready line, open `http://127.0.0.1:3000`.
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

---

## Install the fork daily and record the program (PR-01)

**Depends on.** None.

**Files.**

- [ ] Create `THIRD_PARTY_NOTICES.md`.
- [ ] Create `docs/superpowers/specs/2026-11-06-reactive-resume-convergence.md` (this program's spec, already drafted).
- [ ] Create `docs/superpowers/plans/2026-11-06-reactive-resume-convergence.md` (this file).
- [ ] Edit `FORK.md` to add the local-marketplace install step.
- [ ] Edit `.claude/skills/upstream-review/SKILL.md` to add a deviations row for `THIRD_PARTY_NOTICES.md`.
- [ ] Edit `config/local-paths.txt` to add `THIRD_PARTY_NOTICES.md` and `publish/`.

**Interfaces.** Produces the notice file every vendoring PR appends to, and the `publish/` claim PR-12 relies on.

**Build.**

- [ ] **Step 1.** Write `THIRD_PARTY_NOTICES.md` with the Reactive Resume MIT text copied from the clone's `LICENSE` and an empty "Files" list that later PRs extend.
- [ ] **Step 2.** In `FORK.md`, add a section "Run the fork as your plugin" with `/plugin marketplace add jrmatherly/career-ops` and `/plugin install career-ops@career-ops`, the route `docs/CLAUDE_PLUGIN.md:24` documents for a fork. The plugin then tracks the fork's `main`, not the dev checkout, so a branch checked out here never reaches daily use and user data cannot land in the checkout. `CAREER_OPS_ROOT=~/career-ops-data` stays.
- [ ] **Step 3.** Run `node validate-system-paths-coverage.mjs`. Expect `OK`.
- [ ] **Step 4.** Commit `docs(fork): record the Reactive Resume convergence program`. Then run `node test-all.mjs --only fork-deviations`. Expect pass.

**You see.**

- [ ] `node validate-system-paths-coverage.mjs` prints `OK` and lists the two new paths as claimed.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/fork-deviations-covered.test.mjs` passes at HEAD. Run `node test-all.mjs --only fork-deviations`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. On trunk and head run `node doctor.mjs --json` in a scratch root. Save `doctor.txt`. Pass when both print the same keys.
- [ ] Lane 2. Operator step, not a worker. Add `jrmatherly/career-ops` as a marketplace in Claude Code, install, and run `/career-ops` once. Save `menu.png`. Pass when the menu lists the modes.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of `node test-all.mjs --quick` at trunk and head.
- [ ] Probe. `time node test-all.mjs --quick`, interleaved twice each.
- [ ] Baseline. Record the trunk time first.
- [ ] Rule. Head is within 5 percent of trunk.

**Review gate.** None. PR-01 is not review-gated.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Add the typed resume model and derive `cv.md` and the payload (PR-02)

**Depends on.** PR-01.

**Files.**

- [ ] Create `lib/resume/schema.mjs` (vendored from the clone's `packages/schema/src/resume/{data,dates,period,stylesheet,default,limits}.ts` and `templates.ts`, compiled once to ESM with `.mjs` import specifiers, zod 4).
- [ ] Create `lib/resume/model.mjs`.
- [ ] Create `lib/resume/to-cv-md.mjs` (gen).
- [ ] Create `lib/resume/absorb.mjs` (reverse parse and the lossless gate, over `lib/cv-markdown.mjs`).
- [ ] Create `lib/resume/to-payload.mjs`.
- [ ] Create `resume.mjs`.
- [ ] Create `tests/resume-model.test.mjs`, `tests/resume-to-cv-md.test.mjs`, `tests/resume-absorb.test.mjs`, `tests/resume-to-payload.test.mjs`, `tests/resume-cli.test.mjs`.
- [ ] Create `tests/fixtures/resume/sample.json` (the clone's `packages/schema/src/resume/sample` data with fictional names).
- [ ] Edit `package.json` to add `zod`.
- [ ] Edit `lib/update-manifest.mjs` `SYSTEM_PATHS` to add `lib/resume/` and `resume.mjs`.
- [ ] Edit `DATA_CONTRACT.md` to add `data/resume.json` (derived from `cv.md`, user layer, records `meta.cvSha256`).
- [ ] Edit `doctor.mjs` to warn when `data/resume.json` records a hash other than the current `cv.md`.
- [ ] Edit `docs/SCRIPTS.md` to add the `resume.mjs` section.
- [ ] Edit `THIRD_PARTY_NOTICES.md` and the deviations table.

**Interfaces.**

- Produces `parseResume(json: unknown): { ok: true, data: ResumeData } | { ok: false, issues: ZodIssue[] }` in `lib/resume/schema.mjs`.
- Produces `readResume(root: string): ResumeData | null`, `writeResume(root: string, data: ResumeData): void` (atomic, under `lib/dir-lock.mjs`, stamps `meta.cvSha256`), and `resumePath(root)` in `lib/resume/model.mjs`.
- Produces `absorb(cvMarkdown: string, prior: ResumeData | null): { data: ResumeData, report: { kept, changed, added, removed, orphans: Entry[], newEntries: Entry[], unparsed: string[] }, lossless: boolean }` in `lib/resume/absorb.mjs`. Entries match on normalised company, title and `normalizeDates(period)` (the key `cv-title-check.mjs:93-136` already uses), bullets align by longest common subsequence, unchanged bullets keep their stored HTML, new entries get a uuid, and `lossless` is true only when `resumeToCvMarkdown(data).markdown` equals the input after `normalizePandocLine` and `normalizeDates`. Orphans are never dropped; `pairOrphan(data, orphanId, newId)` keeps the orphan's id, hidden flag, website and structured dates on the renamed entry.
- Produces `resumeToCvMarkdown(data: ResumeData): { markdown: string, unmapped: string[] }` in `lib/resume/to-cv-md.mjs`. The markdown follows `examples/cv-example.md` headings so `doctor.mjs`, `cv-title-check.mjs` and `verify-cv-structure.mjs` parse it. Hidden sections are included, as the operator confirmed and as `build_cv_md.py` does, because `cv.md` is the evaluator's full record. Hiding is a render-time choice (`hide`) for a share.
- Produces `resumeToPayload(data: ResumeData, opts: { lang?: string, page_format?: string, country?: string, hide?: string[] }): { payload: object, unmapped: string[] }` where `hide` names section keys to leave out of this one render (the per-share hiding the operator asked for; the JSON and `cv.md` keep them) in `lib/resume/to-payload.mjs`, emitting only `KNOWN_ROOT_KEYS.html` from `lib/cv-payload-schema.mjs`. `experience.roles[]` become one payload entry per role with the company repeated. HTML descriptions become bullets with the same `<li>` and `<p>` rule as `build_cv_md.py`.
- Produces the CLI `node resume.mjs validate | export cv-md|payload [--out file] [--json] [--hide section,...] | absorb [--json] | pair <orphanId> <newId>`. `absorb` reads `cv.md`, absorbs it into `data/resume.json` and saves only when `lossless`; otherwise it prints the report and exits 3 with nothing written. `export` always absorbs first and refuses (exit 3) while the gate fails. There is no `sync` that writes `cv.md` from JSON and no `--force`.

**Build.**

- [ ] **Step 1.** Write `tests/resume-model.test.mjs` with cases `parses the sample`, `rejects a section item with no id`, and `self-heals a missing metadata.page with the default` (the schema uses `.catch(default)`).
- [ ] **Step 2.** Run `node --test tests/resume-model.test.mjs`. Expect fail with module not found.
- [ ] **Step 3.** Vendor the schema. Strip types with `node --experimental-strip-types` once or by hand, rename to `.mjs`, add `.mjs` to every relative import, keep the MIT header, add the file list to `THIRD_PARTY_NOTICES.md`. Add `zod` to `package.json` and run `npm install`.
- [ ] **Step 4.** Implement `lib/resume/model.mjs`. Run the test. Expect pass.
- [ ] **Step 5.** Write `tests/resume-to-cv-md.test.mjs` asserting the sample yields `## Experience`, a `### Company — Location` line, a bold title line, a dates line, `## Education`, a heading containing `Skills`, and that `unmapped` lists `languages`, `publications` and `references` when they hold items. Implement `to-cv-md.mjs`. Run and expect pass.
- [ ] **Step 6.** Write `tests/resume-to-payload.test.mjs` asserting the result passes `validatePayload` from `lib/cv-payload-schema.mjs` with no warnings, that a two-role experience yields two entries, and that `unmapped` matches Step 5. Implement `to-payload.mjs`. Run and expect pass.
- [ ] **Step 7.** Write `tests/resume-absorb.test.mjs` with the prototype's scenarios as cases. No-op is deep-equal and lossless, changed bullet, added bullet with bold and a link, deleted bullet, summary reword, skill keyword edit, `add-entry.mjs`-shaped project insert, edit inside a hidden entry keeps `hidden`, appended job lands at the parsed position, a retitle yields one orphan plus one new entry and `lossless` false, and `pairOrphan` restores the id. Implement `absorb.mjs`. Run and expect pass.
- [ ] **Step 8.** Write `tests/resume-cli.test.mjs` in a temp root asserting `absorb` saves on a clean `cv.md`, a second run is a no-op, a retitled `cv.md` makes `absorb` exit 3 without writing, `pair` then makes it save, and `export payload` refuses while the gate fails. Implement `resume.mjs`. Add the `doctor.mjs` warning `data/resume.json is behind cv.md; run node resume.mjs absorb`. Run and expect pass.
- [ ] **Step 9.** Update `SYSTEM_PATHS`, `DATA_CONTRACT.md`, `docs/SCRIPTS.md`, the deviations table. Run `node validate-system-paths-coverage.mjs` and `node test-all.mjs --quick`.
- [ ] **Step 10.** Commit `feat(resume): add the typed resume model and derive cv.md and the payload`.

**You see.**

- [ ] `node resume.mjs absorb --json` on a clean `cv.md` prints `{ "lossless": true, "kept": N }` and `node resume.mjs export payload --json` prints a payload with `"valid": true` and an `unmapped` array.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The five new suites pass. Run `node test-all.mjs --only resume-`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Four lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk lacks the feature. Gate the diff-added work. In a scratch root with `examples/cv-example.md` as `cv.md`, run `node resume.mjs absorb` then `node doctor.mjs --json`. Save `doctor.json`. Pass when `onboardingNeeded` is false and no warning names `resume`.
- [ ] Lane 2. Run `absorb`, then `export payload`, then `node build-cv-html.mjs payload.json out.html` on the exported payload and `node generate-pdf.mjs out.html out.pdf`. Save `out.pdf` and `render.png`. Pass when the PDF has the sample's name and the fact gate passes.
- [ ] Lane 3. Edit one bullet in `cv.md`, run `absorb`. Save `absorb.txt`. Pass when exit is 0, the bullet is in the JSON, and `cv.md` is unchanged. Then retitle an entry and run `absorb`. Save `orphan.txt`. Pass when exit is 3, the report names the orphan, and nothing was written.
- [ ] Lane 4. Run `node cv-title-check.mjs --summary` and `node verify-cv-structure.mjs` against the exported payload. Save `checks.txt`. Pass when neither reports a mismatch.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of `node resume.mjs export payload` on the sample. Trunk lacks the feature, so the budget is absolute.
- [ ] Probe. `time node resume.mjs export payload --out /dev/null`, five runs.
- [ ] Baseline. Record `node build-cv-html.mjs` on the same payload (about 113 ms measured in the prototype).
- [ ] Rule. Median under 300 ms.

**Review gate.** None. PR-02 is not review-gated.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Import Reactive Resume JSON, JSON Resume, LinkedIn and DOCX (PR-03)

**Depends on.** PR-02.

**Files.**

- [ ] Create `lib/resume/import/reactive-resume-json.mjs`, `json-resume.mjs`, `linkedin.mjs`, `docx-text.mjs`, `detect.mjs` (ported from the clone's `packages/import/src/*` and `apps/web/src/features/resume/import/read-file.ts:32-75`).
- [ ] Create `tests/resume-import.test.mjs` and fixtures under `tests/fixtures/resume/` (a JSON Resume sample, a LinkedIn zip with the six CSVs, a one-page DOCX, all fictional).
- [ ] Edit `resume.mjs` to add `import <file> [--format rr|json-resume|linkedin|docx] [--confirm]`.
- [ ] Edit `package.json` to add `fflate`.
- [ ] Edit `THIRD_PARTY_NOTICES.md`, `docs/SCRIPTS.md`, the deviations table.

**Interfaces.**

- Consumes `parseResume` and `writeResume` from PR-02.
- Produces `detectFormat(buffer: Buffer, filename: string): 'rr' | 'json-resume' | 'linkedin' | 'docx' | 'unknown'` and `importResume(buffer, format): { data: ResumeData, review: { sections: string[], leftover: string[] } }`.
- The CLI prints the review summary and writes nothing without `--confirm`. With `--confirm` it writes `cv.md` as `resumeToCvMarkdown(imported)` (a backup beside it when one exists, as `atomicWriteWithBackup` does), then writes `data/resume.json` from the import so ids, hidden flags, links and design survive, then runs `absorb` and asserts the gate passes.

**Build.**

- [ ] **Step 1.** Write `tests/resume-import.test.mjs` with one case per format asserting `detectFormat` and that the result passes `parseResume`, plus `linkedin maps Positions.csv rows to experience with structured dates`.
- [ ] **Step 2.** Run it. Expect fail.
- [ ] **Step 3.** Port the importers. Swap `generateId` for `crypto.randomUUID()`, drop the icon lookup, keep the MIT headers.
- [ ] **Step 4.** Run the test. Expect pass. Then the dry run in a temp root. Expect no file written.
- [ ] **Step 5.** Commit `feat(resume): import Reactive Resume, JSON Resume, LinkedIn and DOCX`.

**Migration step, operator only, not committed.**

- [ ] Run `node resume.mjs import ~/dev/job-search/matherly-ats.json` in `~/career-ops-data`, read the review, then `--confirm`. Diff the new `cv.md` against the previous one. Expect only formatting differences from `build_cv_md.py`, and `node resume.mjs absorb --json` to report `lossless: true`.

**You see.**

- [ ] `node resume.mjs import sample.json` prints `Found sections: basics, experience (1), education (1), skills (7)` and `Nothing written. Add --confirm`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/resume-import.test.mjs` passes. Run `node test-all.mjs --only resume-import`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Three lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk lacks the feature. Import each fixture into a scratch root and run `node doctor.mjs --json`. Save `doctor-<format>.json`. Pass when all four roots report no warning.
- [ ] Lane 2. Import the JSON Resume fixture, export it back with PR-11 absent, so check `node resume.mjs export cv-md`. Save `cv.md`. Pass when every experience entry in the fixture appears.
- [ ] Lane 3. Import a corrupted zip. Save `error.txt`. Pass when the CLI exits 2 with a one-line reason and writes nothing.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time to import the LinkedIn fixture.
- [ ] Probe. `time node resume.mjs import linkedin.zip`, five runs.
- [ ] Baseline. Absolute, trunk lacks the feature.
- [ ] Rule. Median under 500 ms.

**Review gate.** None. PR-03 is not review-gated.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Port the 23 Check rules (PR-04)

**Depends on.** PR-02.

**Files.**

- [ ] Create `lib/resume/check.mjs` (ported from the clone's `packages/resume/src/ats/{rules,catalog,section-aliases,types,walk,merge,index}.ts`).
- [ ] Create `tests/resume-check.test.mjs` (ported cases from `rules.test.ts`).
- [ ] Edit `resume.mjs` to add `check [--json] [--ignore RULE_ID]`.
- [ ] Edit `modes/pdf.md` step 17b to run `node resume.mjs check --json` when `data/resume.json` exists and report findings as advisory.
- [ ] Edit `THIRD_PARTY_NOTICES.md`, `docs/SCRIPTS.md`, the deviations table (a `modes/pdf.md` row marked `~`, keep ours on upstream hunks).

**Interfaces.**

- Consumes `ResumeData` from PR-02.
- Produces `checkResume(data: ResumeData, opts: { now?: Date, locale?: string }): { score: number, findings: Finding[] }` where `Finding = { id, category, severity, path, message, fix?: string }` and `id` is one of the 23 rule ids listed in Appendix D. Ignored ids come from `data.metadata.check.ignored`, Reactive Resume's own field.

**Build.**

- [ ] **Step 1.** Port `rules.test.ts` cases to `node:test`. Run. Expect fail.
- [ ] **Step 2.** Port the rules as pure functions with `now` injected. Run. Expect pass.
- [ ] **Step 3.** Add the CLI subcommand and the `modes/pdf.md` line.
- [ ] **Step 4.** Commit `feat(resume): port the Reactive Resume Check rules`.

**You see.**

- [ ] `node resume.mjs check` on the sample with its email removed prints `score 95` and one line `MISSING_EMAIL contact basics.email`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/resume-check.test.mjs` passes with one case per rule id. Run `node test-all.mjs --only resume-check`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk lacks the feature. Run `check` on the sample and on the sample with reversed dates. Save `check.txt`. Pass when the second run reports `REVERSED_PERIOD` and the first does not.
- [ ] Lane 2. Run `node verify-ats.mjs` on a render of the same sample. Save `ats.txt`. Pass when no id appears in both outputs, confirming the two layers do not overlap.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of `check` on the sample.
- [ ] Probe. `time node resume.mjs check --json`, five runs.
- [ ] Baseline. Absolute, trunk lacks the feature.
- [ ] Rule. Median under 200 ms.

**Review gate.** None. PR-04 is not review-gated.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Render a payload deterministically from the web and add design variables (PR-05)

**Depends on.** PR-01.

**Files.**

- [ ] Edit `theme-style.mjs` `STYLE_VAR_MAP` to add `heading_font_family`, `heading_font_size`, `line_height`, `section_gap`, `item_gap`, `text_color`, `background_color`, `sidebar_width`.
- [ ] Edit the eight `templates/cv-template*.html` files so each new token is read with `var(--x, <that template's current value>)`.
- [ ] Edit `config/profile.example.yml` `style:` comments to list the new keys.
- [ ] Create `web/src/app/api/cv-render/route.ts`.
- [ ] Create `web/src/lib/cv-render.ts`.
- [ ] Create `web/tests/lib/cv-render.test.mjs` and `tests/theme-style-tokens.test.mjs`.
- [ ] Edit `tests/cv-visual/baselines.json` only if a pixel changes, which it must not.
- [ ] Edit `docs/SCRIPTS.md`, the deviations table.

**Interfaces.**

- Produces `POST /api/cv-render` with body `{ payload: object, template?: string, style?: Record<string,string> }` returning `{ html: string, warnings: string[] }` or 400 with `validatePayload` issues. It writes the payload to a temp file and runs `build-cv-html.mjs <in> <out> [template]` through `runCoreCli` from `web/src/lib/core-cli.ts`, then reads the HTML back.
- Produces `renderCv(payload, template, style): Promise<{ html, warnings }>` in `web/src/lib/cv-render.ts`, debounced by callers, not here.
- Consumes `listTemplates(kind, { dir, format, userDir })` from `cv-templates.mjs:228` for the template picker data; nothing new is needed there.

**Build.**

- [ ] **Step 1.** Write `tests/theme-style-tokens.test.mjs` asserting the eight new keys map to CSS variables and that rendering the example payload with an empty `style:` is byte-identical before and after the template edits (snapshot the trunk output in the test setup by checking out `templates/` from `origin/main` into a temp dir).
- [ ] **Step 2.** Run. Expect fail on the missing keys.
- [ ] **Step 3.** Extend `STYLE_VAR_MAP` and the templates. Run. Expect pass, and run `node test-all.mjs --only cv-visual --needs browser`. Expect no baseline change.
- [ ] **Step 4.** Write `web/tests/lib/cv-render.test.mjs` asserting a valid payload returns HTML containing the candidate name and an invalid one returns the validator issues. Implement the route and lib. Run `cd web && npm test`. Expect pass.
- [ ] **Step 5.** Commit `feat(web): render a CV payload deterministically and add design variables`.

**You see.**

- [ ] `curl -X POST localhost:3000/api/cv-render -d @payload.json` returns HTML in under 300 ms with `"warnings": []`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Both new suites pass and the visual suite is unchanged. Run `node test-all.mjs --only theme-style`, `cd web && npm test`, and `node test-all.mjs --only cv-visual --needs browser`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Three lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Render the example payload with the default template at trunk (via `build-cv-html.mjs`) and at head (via the route). Save `trunk.png` and `head.png` through Chrome. Pass when a pixel diff is 0.
- [ ] Lane 2. Render with `style: { line_height: "1.6", text_color: "#223" }`. Save `styled.png`. Pass when the computed line height of `.job` is 1.6 and the colour matches.
- [ ] Lane 3. Post a payload with a misspelled section. Save `invalid.json`. Pass when the response is 400 and names the key.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Route latency for the example payload, p50 over 20 requests.
- [ ] Probe. A 20-request loop with `curl -w %{time_total}` at head. Trunk lacks the route, so the baseline is `build-cv-html.mjs` wall time at trunk.
- [ ] Baseline. Record the trunk CLI time first.
- [ ] Rule. Route p50 under trunk CLI time plus 150 ms.

**Review gate.** None. PR-05 is not review-gated.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Build the resume editor page with live preview (PR-06)

**Depends on.** PR-02, PR-05.

**Files.**

- [ ] Create `web/src/app/resume/page.tsx`, `loading.tsx`.
- [ ] Create `web/src/components/resume/resume-editor.tsx`, `section-form.tsx`, `design-panel.tsx`, `template-picker.tsx`.
- [ ] Create `web/src/app/api/resume/route.ts` (GET and PUT with compare-and-swap on the file hash, mirroring `POST /api/cv`).
- [ ] Create `web/src/app/api/resume/absorb/route.ts` (runs `node resume.mjs absorb --json` and returns the report) and `web/src/app/api/resume/pair/route.ts`.
- [ ] Create `web/src/app/api/resume/preview/route.ts` (writes the draft JSON to a temp file, runs `node resume.mjs export payload --out -`, then `renderCv`; the web app never loads zod).
- [ ] Create `web/src/lib/resume-form.mjs` (pure helpers `addItem`, `removeItem`, `moveItem`, `setField`, `toggleHidden` over `ResumeData`) and `web/tests/lib/resume-form.test.mjs`.
- [ ] Edit `web/src/lib/nav-items.ts` to add `{ href: "/resume", label: "Resume", icon: IdCard }` (`NavItem.icon` is required; confirm the icon name exists in the installed `lucide-react` 1.8 before using it).
- [ ] Reuse `web/src/components/cv-studio/cv-preview.tsx` for the preview iframe.
- [ ] Create `web/tests/lib/resume-route.test.mjs`.
- [ ] Edit the deviations table.

**Interfaces.**

- Consumes `readResume`, `writeResume` and `resumeToPayload` from PR-02 only through spawned `resume.mjs` commands (`rootScript` is a server-side spawn), and `renderCv` from PR-05.
- Produces `GET /api/resume`, which absorbs first and returns `{ data, cvMdText, report, lossless }`, and `PUT /api/resume` with `{ data, expectedCvMd }`, which writes `cv.md` as `resumeToCvMarkdown(data)` through the same compare-and-swap `decideCvWrite` in `web/src/lib/cv-write.mjs` that `POST /api/cv` uses (409 when `cv.md` moved), then writes `resume.json` with the new hash.
- The editor is a form over the twelve sections and basics, hand-rolled with the components in `web/src/components/ui/`. Every edit posts the draft to `/api/resume/preview` after a 300 ms debounce and shows the returned HTML. The design panel edits `metadata` fields that map onto the eight style tokens plus template choice. When `GET` returns `lossless: false`, the failing entries are read-only and a panel lists unparsed lines, orphans and new entries with a "Same entry, renamed" pairing action per orphan that calls `/api/resume/pair`. There is no Overwrite button. Save writes `cv.md` first, then the JSON.

**Build.**

- [ ] **Step 1.** Write `web/tests/lib/resume-route.test.mjs` for the compare-and-swap. Run. Expect fail.
- [ ] **Step 2.** Implement the routes. Run. Expect pass.
- [ ] **Step 3.** Write `web/tests/lib/resume-form.test.mjs` for the five helpers (add, remove, move, set, toggle hidden). Run. Expect fail. Implement `resume-form.mjs`. Expect pass.
- [ ] **Step 4.** Build `section-form.tsx` over the helpers, then `design-panel.tsx` and `template-picker.tsx` (reads `listTemplates`), then `resume-editor.tsx` wiring preview and save. Run `npm run typecheck` after each.
- [ ] **Step 5.** Commit `feat(web): add the resume editor with live preview`.

**You see.**

- [ ] Typing in a bullet updates the preview within half a second and Save shows `cv.md updated`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `web/tests/lib/resume-route.test.mjs` passes. Run `cd web && npm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has `/cv` only. On trunk open `/cv`, on head open `/cv` and `/resume`. Save `cv-trunk.png`, `cv-head.png`, `resume.png`. Pass when `/cv` is unchanged and `/resume` lists the sample's sections.
- [ ] Lane 2. Edit a bullet, wait, screenshot the preview. Save `edit.png`. Pass when the new text appears in the iframe.
- [ ] Lane 3. Switch template to `compact`. Save `compact.png`. Pass when the iframe layout changes and the saved JSON has `metadata.template: "compact"`.
- [ ] Lane 4. Set line height 1.6 in the design panel. Save `design.png`. Pass when the iframe's `.job` computed line-height is 1.6.
- [ ] Lane 5. Retitle an entry in `cv.md` on disk, reload the editor. Save `orphan.png`. Pass when that entry is read-only, the panel lists one orphan and one new entry, and pairing them makes the editor writable with the old id kept.
- [ ] Lane 6. Two tabs, save in both. Save `conflict.png`. Pass when the second gets a 409 message.
- [ ] Lane 7. Add a custom section of type `projects`. Save `custom.png`. Pass when it renders in the preview and survives reload.
- [ ] Lane 8. Phone width 390 through `emulate`. Save `mobile.png`. Pass when no horizontal scroll and the preview stacks below the form.
- [ ] Lane 9. Keyboard only. Tab through the form and trigger Save with Enter. Save `keyboard.png`. Pass when focus rings are visible and Save fires.
- [ ] Lane 10. Dark mode class on `html`. Save `dark.png`. Pass when form contrast is readable and the preview iframe stays light.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Keystroke-to-preview latency, p50 over 20 edits, measured from the devtools trace.
- [ ] Probe. `performance_start_trace`, type 20 characters, `performance_stop_trace`. Trunk lacks the feature.
- [ ] Baseline. Absolute budget.
- [ ] Rule. p50 under 600 ms including the 300 ms debounce.

**Review gate.** The operator reviews before merge.

- [ ] Copy lanes 2, 3 and 5 screenshots into `private/review/pr-06-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of an edit, a template switch and a drift save. Save it as `private/review/pr-06-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Pin Check findings in the preview (PR-07)

**Depends on.** PR-04, PR-06.

**Files.**

- [ ] Create `web/src/app/api/resume/check/route.ts` (runs `node resume.mjs check --json`).
- [ ] Create `web/src/components/resume/check-panel.tsx`.
- [ ] Edit `web/src/components/cv-studio/cv-preview.tsx` to accept `markers: { blockId: string, severity: string }[]` and overlay them by id.
- [ ] Edit `lib/resume/to-payload.mjs` so each payload entry carries `data-resume-path` from the source JSON path, and `build-cv-html.mjs` keeps it on the rendered block (one attribute, no layout change).
- [ ] Create `web/tests/lib/check-route.test.mjs`.
- [ ] Edit the deviations table (a `build-cv-html.mjs` row).

**Interfaces.**

- Consumes `checkResume` findings with `path` from PR-04.
- Produces a panel listing findings by category with the score, an Ignore button that writes `metadata.check.ignored`, and a click that scrolls the preview to the block whose `data-resume-path` matches.

**Build.**

- [ ] **Step 1.** Test the route with the sample minus email. Expect `MISSING_EMAIL`. Implement.
- [ ] **Step 2.** Add the path attribute and the marker overlay. Run the visual suite. Expect no baseline change (the attribute is invisible).
- [ ] **Step 3.** Commit `feat(web): pin Check findings in the resume preview`.

**You see.**

- [ ] A finding row, clicked, scrolls the preview to the outlined block.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `web/tests/lib/check-route.test.mjs` and `tests/cv-visual` pass.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk lacks the panel. Open `/resume` at head with the sample minus email. Save `panel.png`. Pass when the panel shows `MISSING_EMAIL` and the score.
- [ ] Lane 2. Click the finding. Save `pinned.png`. Pass when the contact block is outlined and in view.
- [ ] Lane 3. Ignore it. Save `ignored.png`. Pass when the finding disappears and the JSON has the id in `metadata.check.ignored`.
- [ ] Lane 4. Reverse two dates. Save `dates.png`. Pass when `REVERSED_PERIOD` appears with the right entry pinned.
- [ ] Lane 5. Remove the experience section from the layout. Save `layout.png`. Pass when `SECTION_MISSING_FROM_LAYOUT` appears.
- [ ] Lane 6. Set body font to 8 pt. Save `font.png`. Pass when `SMALL_BODY_FONT` appears.
- [ ] Lane 7. Fix the email. Save `fixed.png`. Pass when the finding clears within one debounce.
- [ ] Lane 8. Phone width. Save `mobile.png`. Pass when the panel is a collapsible drawer.
- [ ] Lane 9. Keyboard. Save `keyboard.png`. Pass when findings are focusable and Enter pins.
- [ ] Lane 10. A resume with every rule clean. Save `clean.png`. Pass when the score is 100 and the panel says so.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Check route latency p50 over 20 calls.
- [ ] Probe. `curl -w %{time_total}` loop. Absolute budget.
- [ ] Baseline. Record `node resume.mjs check` CLI time.
- [ ] Rule. Route p50 under CLI time plus 150 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy lanes 2 and 3 screenshots into `private/review/pr-07-review-<slug>.png`.
- [ ] Record a 30 second video of pin and ignore. Save it as `private/review/pr-07-review.mp4`.
- [ ] Post them in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Add tracker sidecars and their writers (PR-08)

**Depends on.** PR-01.

**Files.**

- [ ] Create `lib/application-meta.mjs`, `lib/application-events.mjs`.
- [ ] Create `app-meta.mjs` and `app-events.mjs` CLIs.
- [ ] Create `interview-round.mjs` (fork-local writer for `data/active-interviews.md`; `ics-interview.mjs` stays read-only as its header at line 20 promises).
- [ ] Create `contact-add.mjs` (appends or updates a `data/contacts.tsv` row in the format `contacts.mjs` reads; `contacts.mjs` stays an exporter).
- [ ] Create `salary-observe.mjs` (appends one `data/salary-observations.tsv` row).
- [ ] Create `offer-terms.mjs` (writes `data/offers/{num}-terms.md` from flags, one key per line).
- [ ] Edit `tracker-utils.mjs` to export `appendBackfillRows(trackerPath, rows)`, which derives the ledger path beside the tracker the way `set-status.mjs` does, takes `acquireTrackerLock(trackerLockDirFor(trackerPath))`, and then calls `appendLedgerRows` (which is a bare `appendFileSync` at line 870 and must not be called unlocked).
- [ ] Create `tests/application-meta.test.mjs`, `tests/application-events.test.mjs`, `tests/interview-round.test.mjs`, `tests/contact-add.test.mjs`, `tests/salary-observe.test.mjs`, `tests/offer-terms.test.mjs`, `tests/backfill-ledger.test.mjs`.
- [ ] Edit `DATA_CONTRACT.md`, `docs/SCRIPTS.md`, `lib/update-manifest.mjs`, the deviations table.

**Interfaces.**

- Produces `readMeta(root): Map<num, Record<key, { value, date, source }>>` (latest per key wins, `tag` collects into an array) and `setMeta(root, num, key, value, source)` appending `{num}\t{date}\t{key}\t{value}\t{source}` to `data/application-meta.tsv`. Keys are the closed set `lane`, `tag`, `closed_reason`, `source`, `closed_at`; others throw.
- Produces `readEvents(root, num?)` and `addEvent(root, num, kind, text, source, at?)` appending `{num}\t{datetime}\t{kind}\t{text}\t{source}` to `data/application-events.tsv`. Kinds are `note`, `contact`, `import`.
- Produces `appendBackfillRows(trackerPath, rows: { num, date, from, to, note }[])`, locked.
- Produces `node interview-round.mjs add --num N --kind screening|technical|behavioral|onsite|other --at <ISO> --tz <IANA> [--duration 60] [--participants "Name (role); ..."] [--notes text] [--ics file]`, which appends one row under `lib/dir-lock.mjs` with `#N in tracker` in Notes so `tracker-sync-check.mjs` matches it.
- Produces `node contact-add.mjs --name --company --type --title --phone --email --linkedin --num N [--notes]`, `node salary-observe.mjs --num N --kind desired|advertised|actual --amount --currency --source [--note]`, and `node offer-terms.mjs --num N --base --currency --period --variable --equity --respond-by --start-date [...]`. Each writes one file, under `dir-lock`, and prints the row it wrote.
- `DATA_CONTRACT.md` gains a row for `data/offers/{num}-terms.md`.
- The `active-interviews.md` row format stays `| Company | Role | Round | Date/Time | Interviewer | Status | Notes |` with `Date/Time` as `YYYY-MM-DD HH:MM <IANA tz> (<n>m)` so every existing reader still takes the leading date.

**Build.**

- [ ] **Step 1.** Write the seven suites in temp roots. Run `node --test tests/application-meta.test.mjs` and the others. Expect fail.
- [ ] **Step 2.** Implement the two libs, the six CLIs, and the locked backfill export. Run. Expect pass.
- [ ] **Step 3.** Run `node rejection-latency.mjs --summary` and `node process-quality.mjs --summary` on a root with the new row format. Expect both parse the date.
- [ ] **Step 4.** Commit `feat(tracker): add application sidecars and fork-local writers`.

**You see.**

- [ ] `node app-meta.mjs get 12` prints `lane=Phone screen tag=remote,ai closed_reason=`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The seven suites pass. `--only` takes one value, so run `node test-all.mjs --only application-`, then `--only interview-round`, `--only contact-add`, `--only salary-observe`, `--only offer-terms`, `--only backfill`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Three lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run `node verify-pipeline.mjs` on a scratch tracker at trunk and head with the two new files present at head. Save `verify.txt`. Pass when head reports no new error.
- [ ] Lane 2. Run `node interview-round.mjs add --num 3 --kind technical --at 2026-12-01T14:00 --tz America/New_York --ics sample.ics` then `node tracker-sync-check.mjs`. Save `sync.txt`. Pass when the row matches its tracker number.
- [ ] Lane 3. Append a backfill row and run `node funnel-velocity.mjs --summary`. Save `funnel.txt`. Pass when the row is parsed and excluded from day math.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `readMeta` on 10,000 rows.
- [ ] Probe. A generated TSV, timed in a test. Absolute budget.
- [ ] Baseline. Record `parseStatusLog` on the same row count.
- [ ] Rule. Under 2x that time.

**Review gate.** None. PR-08 is not review-gated.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Import a Reactive Resume application export (PR-09)

**Depends on.** PR-08.

**Files.**

- [ ] Edit `import-tracker.mjs` to add an RR profile and `--rr-zip <file>`.
- [ ] Create `lib/import-rr-applications.mjs`.
- [ ] Create `tests/import-tracker-rr.test.mjs` and fixtures `tests/fixtures/rr/applications.csv` (the 22 RR headers), `tests/fixtures/rr/applications.json`, `application-stages.json`, `career.json` (fictional).
- [ ] Edit `docs/SCRIPTS.md`, the deviations table.

**Interfaces.**

- Consumes `setMeta`, `addEvent`, `appendBackfillRows`, and the `interview-round.mjs`, `contact-add.mjs`, `salary-observe.mjs` and `offer-terms.mjs` CLIs from PR-08, plus `followup-seed.mjs <num> --date` for follow-up pins.
- Produces `detectRrExport(headers: string[]): boolean` (true when `Lane Category`, `Stage History`, `Timeline` and `Posting Source` are all present) and `planRrImport(rows, tracker): Plan` where each item is `{ outcome: 'import' | 'tracked' | 'saved' | 'never-submitted', state, closedReason?, sidecars: {...} }`.
- Stage mapping is fixed by the spec. `screening` maps to Responded, overriding `resolveCanonicalState`. Rows with no submission (`submittedAt` null in JSON, or blank Application Date in CSV) are listed as `never-submitted` and skipped. `saved` rows are appended to `data/pipeline.md` Pending as `- [ ] {url} | {company} | {role}`.
- Sidecar writes per imported row are `lane`, `tag`, `closed_reason`, `source` to meta, note and interview timeline entries to events and `active-interviews.md`, contacts through `contact-add.mjs`, `followUpAt` through `followup-seed.mjs`, offer terms through `offer-terms.mjs` and `salary-observe.mjs`, and stage history to `status-log.tsv` through `appendBackfillRows`. A `jobDescription` becomes a `jds/{num}-{date}_{company}_{role}.md` capture, where `num` is the number `reserveReportNumbers` handed the row. That allocator is shared by tracker rows and reports, so no report can hold the same number and `jd-capture.mjs` resolves the capture by it; the test asserts that resolution.

**Build.**

- [ ] **Step 1.** Write `tests/import-tracker-rr.test.mjs` cases `detects an RR CSV`, `closed with no reason lands Discarded`, `blank application date is never-submitted`, `screening lands Responded`, `saved goes to pipeline.md`, `zip import writes every sidecar`, `second run adds nothing`. Run. Expect fail.
- [ ] **Step 2.** Implement. Run. Expect pass.
- [ ] **Step 3.** Commit `feat(tracker): import a Reactive Resume application export`.

**Migration step, operator only, not committed.**

- [ ] Export "everything" from `resume.matherly.net` to a zip. Run `node import-tracker.mjs --rr-zip <zip>` in `~/career-ops-data`, read the preview against the 58 existing rows, then `--confirm`. Expect the 8 rows from `jobs/applications.csv` to show as `tracked` or `import`, none duplicated.

**You see.**

- [ ] The preview prints one line per row with its outcome and the sidecar fields it will write, and `Nothing written. Add --confirm`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/import-tracker-rr.test.mjs` passes. Run `node test-all.mjs --only import-tracker`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Three lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run `node import-tracker.mjs tests/fixtures/rr/applications.csv` at trunk and head. Save `preview-trunk.txt`, `preview-head.txt`. Pass when trunk reports `unknown-status` for closed rows and head does not.
- [ ] Lane 2. Import the zip fixture with `--confirm`, then `node verify-pipeline.mjs`. Save `verify.txt`. Pass when no error.
- [ ] Lane 3. Run it again. Save `second.txt`. Pass when zero rows import.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of a 500-row CSV preview, RR's own import cap.
- [ ] Probe. A generated CSV, `time node import-tracker.mjs big.csv`. Trunk has the script, so measure trunk on the same file with a Teal header.
- [ ] Baseline. Record trunk first.
- [ ] Rule. Head within 1.5x trunk.

**Review gate.** None. PR-09 is not review-gated.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Build the board page and the application sheet (PR-10)

**Depends on.** PR-08.

**Files.**

- [ ] Create `web/src/app/board/page.tsx`, `loading.tsx`.
- [ ] Create `web/src/components/board/board.tsx`, `column.tsx`, `card.tsx`, `application-sheet.tsx`.
- [ ] Create `web/src/lib/next-step.mjs` (ported from the clone's `packages/schema/src/applications/next-step.ts`).
- [ ] Create `web/src/lib/application-detail.ts` (joins the sidecars by number through `rootScript` reads).
- [ ] Create `web/src/app/api/app-meta/route.ts` (POST lane or tag, runs `app-meta.mjs set`).
- [ ] Edit `web/src/lib/nav-items.ts` to add `{ href: "/board", label: "Board", icon: SquareKanban }` (confirm the icon name in the installed `lucide-react` first).
- [ ] Create `web/src/lib/board.mjs` (pure `groupByColumn(rows, meta)` and `nextStepLabel`) and `web/tests/lib/board.test.mjs`.
- [ ] Extract `useOptimistic` and `heldSaves` from `web/src/components/pipeline-view.tsx:66-71` into `web/src/lib/status-save.ts` and use it from both views.
- [ ] Create `web/tests/lib/next-step.test.mjs`, `web/tests/lib/application-detail.test.mjs`, `web/tests/lib/status-save.test.mjs`.
- [ ] Edit the deviations table (a `pipeline-view.tsx` row).

**Interfaces.**

- Consumes `readMeta`, `readEvents` from PR-08, `PIPELINE_TABS` and `rowOnPipelineTab` from `web/src/lib/pipeline-navigation.mjs`, and `POST /api/status` with `{ n, status }`.
- Produces columns for the ten stage tabs (not INBOX, ALL, OTHER), each card showing company, role, score, days in stage, and the next-step label from `nextStep(app, events, interviews, now)`. Drag uses native HTML5 `draggable` with `dragstart` and `drop`, and a keyboard path (focus a card, press `m`, choose a column). A drop onto the same column does nothing and writes nothing. A drop onto another posts `/api/status`; a 503 (the route's mapping of `set-status.mjs` exit 4, lock held) retries three times at 250 ms and then reverts with a toast. Both rules live in `status-save.ts` and are unit-tested with a stubbed `fetch`. Lane is a sub-heading inside a column when `application-meta.tsv` has lanes.
- The sheet opens on card click and shows the status-log timeline merged with events, interviews from `active-interviews.md`, contacts, follow-up pin, offer terms if any, and the report link.

**Build.**

- [ ] **Step 1.** Port `next-step.ts` cases to `web/tests/lib/next-step.test.mjs`. Run. Expect fail. Implement. Expect pass.
- [ ] **Step 2.** Write `application-detail.test.mjs` on a fixture root. Implement. Expect pass.
- [ ] **Step 3.** Write `web/tests/lib/status-save.test.mjs` for `same column is a no-op` and `503 retries three times then reverts`. Extract the save hook into `status-save.ts`, implement both rules, run it and the existing pipeline tests. Expect pass.
- [ ] **Step 4.** Write `web/tests/lib/board.test.mjs` for `groupByColumn` (ten columns, lane sub-groups, OTHER rows excluded). Implement `board.mjs`. Expect pass.
- [ ] **Step 5.** Build `column.tsx` and `card.tsx` over `board.mjs`, then `board.tsx` with the drag and keyboard paths, then `application-sheet.tsx` over `application-detail.ts`. Run `npm run typecheck` after each.
- [ ] **Step 6.** Commit `feat(web): add the application board and detail sheet`.

**You see.**

- [ ] Dragging a card from Applied to Responded moves it and `data/status-log.tsv` gains one `web` row.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The four suites and the existing pipeline suites pass. Run `cd web && npm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. On trunk and head change a status from `/pipeline`. Save `pipeline-trunk.png`, `pipeline-head.png`, `ledger.txt`. Pass when both write one ledger row and the table looks the same.
- [ ] Lane 2. Drag a card between columns. Save `drag.png`. Pass when the card moves and the ledger row has source `web`.
- [ ] Lane 3. Drop onto the same column. Save `same.png`. Pass when no ledger row is written.
- [ ] Lane 4. Hold the tracker lock with a sleeping `set-status.mjs`, then drop. Save `locked.png`. Pass when the card reverts with a toast after the retries.
- [ ] Lane 5. Keyboard move. Save `keyboard.png`. Pass when `m` then a column choice moves the card.
- [ ] Lane 6. Open the sheet on a row with interviews and contacts. Save `sheet.png`. Pass when both lists show.
- [ ] Lane 7. Set a lane. Save `lane.png`. Pass when the card regroups and `application-meta.tsv` gains a row.
- [ ] Lane 8. A row 11 days in Applied with no reply. Save `noreply.png`. Pass when the card says `No reply`.
- [ ] Lane 9. Phone width. Save `mobile.png`. Pass when columns scroll horizontally and cards stay tappable.
- [ ] Lane 10. 300 rows. Save `many.png`. Pass when the board renders and scroll is smooth (no long task over 100 ms in a trace).

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time to interactive of `/board` with 300 rows, and of `/pipeline` at trunk and head.
- [ ] Probe. `performance_start_trace` on navigation, both pages, interleaved.
- [ ] Baseline. Record `/pipeline` at trunk first.
- [ ] Rule. `/pipeline` at head within 5 percent of trunk. `/board` under 1.5 s.

**Review gate.** The operator reviews before merge.

- [ ] Copy lanes 2, 4 and 6 screenshots into `private/review/pr-10-review-<slug>.png`.
- [ ] Record a 60 second video of drag, lock retry and the sheet. Save it as `private/review/pr-10-review.mp4`.
- [ ] Post them in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Export DOCX, Reactive Resume JSON and JSON Resume (PR-11)

**Depends on.** PR-02.

**Files.**

- [ ] Create `lib/resume/export/docx.mjs`, `json-resume.mjs`.
- [ ] Edit `resume.mjs` to add `export docx|rr-json|json-resume [--out file]`.
- [ ] Edit `package.json` to add `docx`.
- [ ] Create `tests/resume-export.test.mjs`.
- [ ] Edit `docs/SCRIPTS.md`, the deviations table.

**Interfaces.**

- Consumes `resumeToPayload` from PR-02.
- Produces `payloadToDocx(payload): Promise<Buffer>` as a single-column document with the payload's section order, and `resumeToJsonResume(data): object` (the inverse of PR-03's importer, round-trips the fixture). `rr-json` is `JSON.stringify(data, null, 2)`.

**Build.**

- [ ] **Step 1.** Write tests asserting the DOCX unzips with `fflate` and its `word/document.xml` contains the name and every company, and that JSON Resume round-trips. Run. Expect fail.
- [ ] **Step 2.** Implement. Run. Expect pass.
- [ ] **Step 3.** Commit `feat(resume): export DOCX, Reactive Resume JSON and JSON Resume`.

**You see.**

- [ ] `node resume.mjs export docx --out cv.docx` writes a file Word opens with the sections in order.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/resume-export.test.mjs` passes.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk lacks the feature. Export the sample to DOCX and convert with `soffice --headless --convert-to pdf` if LibreOffice is present, else open in Pages through computer-use. Save `docx.png`. Pass when every section heading is visible.
- [ ] Lane 2. Export JSON Resume, import it back, diff. Save `roundtrip.txt`. Pass when the diff is empty.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. DOCX export wall time.
- [ ] Probe. `time node resume.mjs export docx`, five runs. Absolute budget.
- [ ] Baseline. Record `generate-pdf.mjs` time on the same resume for scale.
- [ ] Rule. Median under 1 s.

**Review gate.** None. PR-11 is not review-gated.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Build the publish service and the share CLI (PR-12)

**Depends on.** PR-01.

**Files.**

- [ ] Create `publish/server.mjs`, `publish/db.mjs`, `publish/pages.mjs` (hardened from the prototype at the session scratchpad `arch/proto/`).
- [ ] Create `publish/share.mjs` (the CLI, `publish | stats | pull | delete`).
- [ ] Create `publish/README.md`.
- [ ] Create `tests/publish-service.test.mjs`, `tests/publish-share-cli.test.mjs`.
- [ ] Edit `DATA_CONTRACT.md` to add `data/shares.json` and `data/share-feedback/`.
- [ ] Edit `AGENTS.md` "Untrusted External Content" to name `data/share-feedback/*.md` as data, never instructions.
- [ ] Edit the deviations table (`AGENTS.md` row, `tests/publish-*` row).

**Interfaces.**

- Produces the HTTP contract `PUT /api/shares/:slug` (owner token for now, API key after PR-13) with `{ html, password?, hideContacts? }`, `GET and POST /s/:slug`, `GET /api/shares/:slug/stats`, `POST /api/shares/:slug/feedback-links` returning `{ token }`, `GET and POST /f/:token`, `GET /api/shares/:slug/feedback`, `DELETE /api/shares/:slug`.
- Share pages carry `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`.
- The client key for view dedup comes from `PUBLISH_CLIENT_IP_HEADER` (default `cf-connecting-ip`) only when the socket peer is in `PUBLISH_TRUSTED_PROXIES`, else the socket address. Passwords use `scrypt` with a dummy hash on unknown slugs and a limiter of 5 attempts per 10 minutes per client key, RR's figure. Feedback snapshots are stored by sha256; tokens are `<id>~<hmac>` and never stored.
- The CLI resolves the root through `getCareerOpsRoot()`, inlines fonts with `inlineLocalFonts` from `generate-pdf.mjs:2330`, inlines a local photo path to a data URL, removes `.contact-row` and `mailto:` and `tel:` links for `--hide-contacts`, and writes `data/shares.json` under `lib/dir-lock.mjs` and `data/share-feedback/{slug}.md`. `--from-studio <n>` publishes the CV Studio edited output for report `n` when it exists, else the `output/` HTML. `--from-resume [--hide section,...] [--hide-item id,...] [--template name]` renders through `resume.mjs export payload --hide` and `build-cv-html.mjs`, which is how a share leaves out sections and items that stay in `cv.md`; the overlay is stored on the share record in `data/shares.json` so `republish` reapplies it. It needs PR-02, and it refuses while `absorb` reports the gate failing, so a renamed item hidden by id cannot reappear in public.

**Build.**

- [ ] **Step 1.** Move the prototype's `selfcheck.mjs` cases into `tests/publish-service.test.mjs` as `node:test` cases against an in-process server on an ephemeral port, adding `rotating X-Forwarded-For from an untrusted peer counts one view` and `six wrong passwords in ten minutes returns 429`. Run. Expect fail on the new cases.
- [ ] **Step 2.** Build the service with the hardening. Run. Expect pass.
- [ ] **Step 3.** Write `tests/publish-share-cli.test.mjs` in a temp root asserting `publish` then `pull` change only the two data files. Implement. Expect pass.
- [ ] **Step 4.** Commit `feat(publish): add the publish service and the share CLI`.
- [ ] **Step 5.** Note in `publish/README.md` that the service binds `127.0.0.1` by default (`PUBLISH_BIND`) and must sit behind the tunnel or an in-cluster Service, because both its own client-IP header trust and Better Auth's `ipAddressHeaders` assume the proxy is the only peer.

**You see.**

- [ ] `node publish/share.mjs publish --html output/cv.html --slug jason --password x` prints the URL and `node publish/share.mjs pull` prints `views 0 comments 0`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Both suites pass. Run `node test-all.mjs --only publish`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk lacks the feature. Publish a render of the example CV and open `/s/<slug>` in Chrome. Save `share.png`, `console.txt`, `network.txt`. Pass when zero failed requests and zero console errors under the CSP.
- [ ] Lane 2. Password flow in Chrome. Save `password.png`. Pass when 401, then 303 and 200.
- [ ] Lane 3. Feedback link in Chrome, post a comment, `pull`. Save `feedback.png`, `open.md`. Pass when the comment lands in `data/share-feedback/<slug>.md`.
- [ ] Lane 4. Hide contacts. Save `hidden.png`. Pass when no email, phone or LinkedIn text is on the page.
- [ ] Lane 5. Republish with a different CV. Save `frozen.png`. Pass when the old feedback link still shows the old HTML.
- [ ] Lane 6. Delete the share. Save `deleted.txt`. Pass when `/s/<slug>` is 404 and `shares.json` drops the entry.
- [ ] Lane 7. Forged feedback token (valid id, wrong HMAC) and a random token. Save `forged.txt`. Pass when both are 404 with identical bodies.
- [ ] Lane 8. Slug enumeration. Request an unknown slug and a known slug with a wrong password. Save `enum.txt`. Pass when both are 401 with the same body and response times within 20 percent.
- [ ] Lane 9. Six wrong passwords in ten minutes from one client. Save `limiter.txt`. Pass when the sixth is 429 and a different client key is still 401.
- [ ] Lane 10. Upload HTML containing an inline `<script>` and an external image. Save `csp.png`, `console.txt`. Pass when the script does not run and the image request is blocked by the CSP.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. p50 and p99 of `GET /s/:slug` over 200 requests from 20 client keys.
- [ ] Probe. `autocannon`-free loop with `curl -w`, or a 20-line node script. Absolute budget.
- [ ] Baseline. Record the prototype's numbers first.
- [ ] Rule. p99 under 50 ms on loopback.

**Review gate.** None. PR-12 is not review-gated.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Add Better Auth to the publish service (PR-13)

**Depends on.** PR-12.

**Files.**

- [ ] Create `publish/auth.mjs`, `publish/package.json` (`better-auth` and `@better-auth/api-key` pinned `~1.7.14`, the newest npm's 7-day release-age policy allowed on 2026-11-06; bump when a newer 1.7 clears it), `publish/.env.example`.
- [ ] Edit `publish/server.mjs` to mount `toNodeHandler(auth)` under `/api/auth/` before any body parsing, to verify `x-api-key` with `verifyApiKey({ body: { key, permissions: { share: ["upload"] } } })` on upload routes and strip the header before any cookie lookup, and to require a cookie session plus `isTrustedOrigin` on owner routes.
- [ ] Create `publish/pages/account.mjs` (sign in with Pocket ID, create a key, list and revoke keys, requires a session under 24 hours old to create a key).
- [ ] Edit `publish/share.mjs` to read `PUBLISH_API_KEY` from the data root's `.env`, never from argv.
- [ ] Create `tests/publish-auth.test.mjs`.
- [ ] Edit `publish/README.md`, the deviations table.

**Interfaces.**

- Produces `createAuth({ db: DatabaseSync, baseURL, secret, pocketId: { clientId, clientSecret, discoveryUrl }, allowedEmails: string[] })` returning the Better Auth instance with `genericOAuth` (`providerId: "pocket-id"`, `disableSignUp: true`), `apiKey` (session mocking off, `rateLimitMax: 1000`, `rateLimitTimeWindow: 3600000`, key prefix `cops_`), `user.validateUserInfo` rejecting emails outside `allowedEmails`, `emailAndPassword` unset, `telemetry.enabled: false`, `account.encryptOAuthTokens: true`, rate limiting enabled with `storage: "database"`, `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip"]`, `trustedOrigins: [baseURL]`.
- The migration command is `npx auth migrate --config publish/auth.mjs --yes`, documented in the README and run on container start.

**Build.**

- [ ] **Step 1.** Write `tests/publish-auth.test.mjs` with cases `upload without a key is 401`, `a key with share:upload uploads`, `a key without the permission is 401`, `a bad key does not crash the server`, `x-api-key alone cannot create another key`, `owner route without a session is 401`, `validateUserInfo rejects an email outside the allow-list and accepts one inside`. Run. Expect fail.
- [ ] **Step 2.** Implement. Run. Expect pass.
- [ ] **Step 3.** Commit `feat(publish): add Better Auth with Pocket ID and API keys`.

**You see.**

- [ ] `curl -H "x-api-key: cops_..." -X PUT .../api/shares/me` returns 201 and the same without the header returns 401.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/publish-auth.test.mjs` passes.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Four lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Rerun PR-12 lane 1 at head with a key. Save `share.png`. Pass when identical.
- [ ] Lane 2. Operator step. Sign in through the real Pocket ID client, create a key, paste it into `.env`, publish. Save `account.png`. Pass when the key works and a second account email is refused.
- [ ] Lane 3. 1001 uploads with one key in an hour. Save `budget.txt`. Pass when the last is 429.
- [ ] Lane 4. Boot with Pocket ID unreachable. Save `boot.txt`. Pass when the service serves shares and sign-in reports the provider unavailable.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Upload latency with key verification, p50 over 50 uploads, against PR-12's token path.
- [ ] Probe. The same loop at PR-12 head and PR-13 head.
- [ ] Baseline. Record PR-12 first.
- [ ] Rule. Within 30 ms of PR-12.

**Review gate.** None. PR-13 is not review-gated.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Add the shares page to the web app (PR-14)

**Depends on.** PR-12.

**Files.**

- [ ] Create `web/src/app/shares/page.tsx`, `loading.tsx`.
- [ ] Create `web/src/components/shares/shares-view.tsx`.
- [ ] Create `web/src/app/api/shares/pull/route.ts` (runs `node publish/share.mjs pull`).
- [ ] Edit `web/src/lib/nav-items.ts` to add `{ href: "/shares", label: "Shares", icon: Share2 }` (confirm the icon name in the installed `lucide-react` first).
- [ ] Create `web/tests/lib/shares.test.mjs`.
- [ ] Edit the deviations table.

**Interfaces.**

- Reads `data/shares.json` and `data/share-feedback/*.md` through `careerOpsRoot()`. Shows slug, URL, password set or not, views, comments, last pulled, and a Pull button. Publishing stays in the CLI, because the API key never enters the web process.

**Build.**

- [ ] **Step 1.** Test the pull route in a temp root. Implement. Expect pass.
- [ ] **Step 2.** Build the page. `npm run typecheck`.
- [ ] **Step 3.** Commit `feat(web): add the shares page`.

**You see.**

- [ ] The page lists each share with its counts and Pull refreshes them.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `web/tests/lib/shares.test.mjs` passes.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Six lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk lacks the page. Open `/shares` with two shares. Save `shares.png`. Pass when both rows show.
- [ ] Lane 2. Click Pull after a view. Save `pulled.png`. Pass when the count updates.
- [ ] Lane 3. A share with comments. Save `comments.png`. Pass when the markdown renders as text, not HTML.
- [ ] Lane 4. No `shares.json`. Save `empty.png`. Pass when the empty state names the CLI command.
- [ ] Lane 5. Service down, Pull. Save `down.png`. Pass when an error toast appears and the page stays.
- [ ] Lane 6. A comment containing `<script>`. Save `xss.png`. Pass when it renders inert.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `/shares` time to interactive with 50 shares.
- [ ] Probe. `performance_start_trace` on navigation. Absolute budget.
- [ ] Baseline. Record `/documents` at trunk for scale.
- [ ] Rule. Under 1 s.

**Review gate.** The operator reviews before merge.

- [ ] Copy lanes 2 and 3 screenshots into `private/review/pr-14-review-<slug>.png`.
- [ ] Record a 30 second video of a pull. Save it as `private/review/pr-14-review.mp4`.
- [ ] Post them in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Package the publish service for deployment (PR-15)

**Depends on.** PR-13.

**Files.**

- [ ] Create `publish/Dockerfile` (Node 24 pinned by digest, `npm ci --omit=dev` in `publish/`, runs the migration then the server, one volume for the sqlite file).
- [ ] Create `publish/compose.yml` (publishes `127.0.0.1:8080:8080` only; the tunnel or cluster Service is the only public path).
- [ ] Create `tests/publish-image.test.mjs`.
- [ ] Edit `.github/workflows/docker-image.yml` to also build and push `ghcr.io/jrmatherly/career-ops-publish`.
- [ ] Edit `publish/README.md` with the environment variables and the Pocket ID callback `https://<host>/api/auth/callback/pocket-id`.
- [ ] Edit the deviations table.

**Interfaces.** Produces the image the home-cluster manifests reference. The manifests themselves are a follow-up in `~/dev/home-cluster`, outside this plan.

**Build.**

- [ ] **Step 1.** Build the image locally, run with compose, run PR-12's lane 1 against it. Save the log.
- [ ] **Step 2.** Commit `build(publish): package the publish service`.

**You see.**

- [ ] `docker compose -f publish/compose.yml up` prints the migration summary and `listening on :8080`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/publish-image.test.mjs` passes. It asserts the Dockerfile `FROM` carries an `@sha256:` digest, the image runs the migration before the server, and the compose file binds only `127.0.0.1`. Run `node test-all.mjs --only publish-image`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk lacks the image. Run the compose stack and PR-12's lanes 1 and 2 against it. Save `compose.txt`. Pass when both pass.
- [ ] Lane 2. Restart the container. Save `restart.txt`. Pass when shares and views survive.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Image size and cold start to `listening`.
- [ ] Probe. `docker images` and the container log timestamps. Absolute budget.
- [ ] Baseline. Record the root `career-ops` image size for scale.
- [ ] Rule. Under 250 MB and under 3 s.

**Review gate.** None. PR-15 is not review-gated.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Run the two migration steps and retire `~/dev/job-search/tools/build_cv_md.py`, `push_tailored.py` and `rebuild_career.py` (a note in that repo's README, outside this plan).
- [ ] Move this plan and the spec to their `completed/` folders.
- [ ] Reply to the operator with what landed, what the lanes proved, and what stays deferred.

## Appendix A. Prototype evidence

Two throwaway prototypes under the session scratchpad settled the architecture before this plan was written. Neither is committed.

**Publish service** (`arch/proto/`, `server.mjs` 120 lines, `share.mjs` 61 lines, `selfcheck.mjs` 99 lines, run 2026-11-06). All five claims passed. A render of the example CV through `build-cv-html.mjs` (113 ms, positional arguments `<input.json> <output.html> [template]`) with fonts inlined loaded in Chrome under `default-src 'none'` with zero failed requests and an empty console. Wrong password 401, right password 303 with an HMAC cookie, cookie 200, password change invalidated the cookie, unknown slug 401 through a dummy scrypt hash. Two clients at 10 requests each counted 2 views, owner and Googlebot counted 0, 50 parallel distinct keys counted exactly 50 more. A feedback link rendered a frozen snapshot, took a comment, survived a republish byte-identical, and `pull` changed only `data/shares.json` and `data/share-feedback/open.md`. Hide-contacts removed `.contact-row`, `mailto:` and `tel:`. Unproven and carried into PR-12 as requirements. Views across several processes (run one process), proxy-only trust of the client IP header, a rate limit on the password form, `dir-lock` on `shares.json`, and which artifact (Studio edit or `output/`) is published. Found in passing, the default template writes `{{PHOTO}}` into two CSS comments, so a photo is duplicated. That is an upstream bug to report separately.

**Better Auth** (`auth/proto/`, better-auth 1.7.14 and `@better-auth/api-key` 1.7.14 on Node 24.22.2, run 2026-11-06). `npx auth migrate` created the five tables on `node:sqlite`. `/api/auth/ok` returned `{"ok":true}`. `auth.api.createApiKey` made a key, `x-api-key` and a signed cookie both resolved through `getSession`, and a `/forward-auth` route returned 200 with user headers for a valid cookie and 401 for a tampered one. Three findings changed the design. An invalid key makes `getSession` throw and crashed the first server. With session mocking on, a bare key created another key. The default key budget is 10 requests per day. Unproven. A real Pocket ID round trip, 2FA and passkeys, and any gateway configuration. npm's `min-release-age=7` policy kept the prototype on 1.7.14 while 1.7.18 was latest.

## Appendix B. Alternatives rejected

- **Postgres as the store, as Reactive Resume does.** Two write paths, every writer script mirrored, and "markdown is the source of truth" stops being true. Rejected in the first question round.
- **Request-scoped data roots inside the Next.js app for multi-user.** 103 `careerOpsRoot()` call sites in 49 files, process-global write token and headed browser, agent tool grants by name not path, and 411 web commits upstream in 90 days. Not a security boundary and a permanent merge conflict.
- **Publishing through the operator's Reactive Resume instance.** Smallest build, but sharing stays in a second product. Rejected by the operator.
- **A Better Auth forward-auth service for container-per-user.** No prior art, you own the tenant check, Envoy drops cookies by default. Envoy Gateway's native OIDC against Pocket ID is the path if a second hosted user ever appears.
- **Porting Reactive Resume's 18 templates.** They are React components on the Forme engine with `react-reconciler` and `harfbuzzjs`. career-ops's eight HTML templates gain the design vocabulary instead.
- **Adding states or columns to `applications.md` for lanes and closed reasons.** About ten pinned test files, two web lists, the Go parity tests and the funnel definitions. Sidecars cost none of that.
- **Adding `--write` to `ics-interview.mjs`.** Its header promises it never writes `data/active-interviews.md`. A fork-local `interview-round.mjs` keeps that promise and costs no deviation row on the upstream file.
- **A drag-and-drop dependency for the board.** Native HTML5 drag with a keyboard path covers the one interaction.
- **ODT export, PDF import, account trash, the AI coach and discovery scheduler, the mobile app.** Out of scope, each a possible later program.

## Appendix C. Risks

- **`cv.md` drift** (PR-02). A mode such as `add`, `expand`, `intake` or `interview` writes `cv.md` directly, as upstream intends. The next `absorb` folds the change into `resume.json`, and a rename that breaks the key stops the editor and every export until the user pairs or edits. The gate is the whole safety story, so `tests/resume-absorb.test.mjs` must cover every field the editor can edit; a field the generator omits would become a fact that lives only in JSON.
- **Vendored TypeScript** (PR-02, PR-03, PR-04). The port is a one-time compile, so upstream Reactive Resume fixes do not flow in. The owner records the clone SHA `d065a9f7` in `THIRD_PARTY_NOTICES.md` so a re-port has a base.
- **Template edits and the visual suite** (PR-05). Eight templates change. The byte-identical test and the Playwright baselines guard it. The owner runs the visual suite with `--needs browser` before pushing.
- **Upstream files this program edits** (every PR). About fifteen upstream files diverge over the program, among them `AGENTS.md`, `DATA_CONTRACT.md`, `doctor.mjs`, `tracker-utils.mjs`, `import-tracker.mjs`, `theme-style.mjs`, `build-cv-html.mjs`, eight templates, `modes/pdf.md`, `package.json`, `pipeline-view.tsx` and `nav-items.ts`. Each gets a deviations row the day it lands, and the owner keeps every edit additive (new keys, new rows, new attributes) so upstream hunks merge as `~`, keep ours.
- **Upstream churn in `web/`** (PR-06, PR-10, PR-14). New pages are additive, but `pipeline-view.tsx` is edited to extract the save hook. The owner keeps that extraction minimal and names it in the deviations row.
- **The publish service is internet-facing** (PR-12, PR-13, PR-15). The public surface is script-free HTML, a password form and a comment form. The owner keeps the CSP, the proxy-only IP trust, the limiters and the untrusted-feedback rule, and never routes the dashboard through it.
- **Secrets** (PR-13). `BETTER_AUTH_SECRET`, the Pocket ID client secret and API keys live only in `.env` files and Kubernetes Secrets. The pre-commit hook refuses new gitignored files, and `no-user-data.yml` runs on push.
- **Migration against real data** (PR-03, PR-09). Both steps are dry-run first and never committed. The owner diffs the generated `cv.md` before `--confirm`.
- **Node version** (PR-12, PR-15). `node:sqlite` is Release Candidate. The image pins Node 24 by digest.

## Appendix D. Links and reading list

Read before editing.

- `docs/superpowers/specs/2026-11-06-reactive-resume-convergence.md`, the spec.
- `AGENTS.md` Data Contract, Source-of-Truth Boundary, Untrusted External Content, Pipeline Integrity, TSV Format.
- `DATA_CONTRACT.md`, `.claude/rules/dev-workflow.md`, `.claude/skills/upstream-review/SKILL.md` Deviations decided.
- `lib/cv-payload-schema.mjs`, `build-cv-html.mjs`, `theme-style.mjs:39-71`, `cv-templates.mjs`, `generate-pdf.mjs:2330` (`inlineLocalFonts`).
- `import-tracker.mjs`, `set-status.mjs`, `merge-tracker.mjs`, `tracker-utils.mjs` (`appendLedgerRows`), `funnel-velocity.mjs:88` (`VALID_SOURCES`), `templates/states.yml`.
- `web/src/lib/career-ops.ts`, `web/src/lib/core-cli.ts`, `web/src/lib/claude-invocation.mjs`, `web/src/lib/pipeline-navigation.mjs`, `web/src/app/api/status/route.ts`, `web/src/components/cv-studio/cv-preview.tsx`, `web/src/lib/nav-items.ts`, `web/src/proxy.ts`, `web/src/lib/origin-guard.mjs`.
- Reactive Resume clone at `d065a9f7`. `packages/schema/src/resume/data.ts`, `packages/import/src/`, `packages/resume/src/ats/rules.ts`, `packages/schema/src/applications/{data,lanes,next-step,csv}.ts`, `packages/db/src/schema/applications.ts`, `packages/auth/src/config.ts:699-1198`, `packages/api/src/context.ts:62-104`.
- Better Auth. https://better-auth.com/docs/adapters/sqlite, https://better-auth.com/docs/plugins/generic-oauth, https://better-auth.com/docs/plugins/api-key/advanced, https://better-auth.com/docs/reference/security, https://better-auth.com/docs/concepts/rate-limit.
- The 23 Check rule ids. Contact `MISSING_NAME`, `MISSING_EMAIL`, `MALFORMED_EMAIL`, `MISSING_PHONE`, `MISSING_LOCATION`, `MALFORMED_URL`, `PICTURE_PRESENT`. Dates `EMPTY_PERIOD`, `UNPARSEABLE_PERIOD`, `UNPARSEABLE_DATE`, `REVERSED_PERIOD`, `FUTURE_DATED_PERIOD`. Layout `SECTION_MISSING_FROM_LAYOUT`, `MULTI_COLUMN_PROSE_SECTION`, `PROSE_SECTION_IN_SIDEBAR`, `TWO_COLUMN_LAYOUT`, `SMALL_BODY_FONT`, `TIGHT_LINE_HEIGHT`, `TIGHT_PAGE_MARGINS`. Headings `NO_VISIBLE_EXPERIENCE`, `NON_STANDARD_SECTION_TITLE`. Writing `MISSING_EXPERIENCE_DESCRIPTION`, `FRAGMENTED_ENTRY`.
- PR-02, PR-10 and PR-12 get `<jstack>/skills/how/SKILL.md` grounding before code. PR-12 and PR-13 get `<jstack>/skills/interrogate/SKILL.md` on the security design. The decision trail for this program is `private/decisions-rr-merge.tsv`, kept per `<jstack>/skills/show-me-your-work/SKILL.md`.
