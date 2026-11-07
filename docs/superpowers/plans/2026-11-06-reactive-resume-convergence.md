# Reactive Resume convergence implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Reactive Resume v6's resume model, importers, Check rules, design controls, richer application tracking with a board view, DOCX export, and public share links with reviewer feedback into this career-ops fork, while every agent and script keeps reading the same markdown, TSV and YAML files.

**Architecture:** `cv.md` stays the canonical CV. One new derived file, `data/resume.json` in Reactive Resume v6 JSON, is absorbed from it behind a lossless gate and carries what markdown cannot, and the CV payload is derived from the pair. Tracker detail lives in two append-only TSV sidecars keyed by tracker number, read by a new board page that writes through the existing `/api/status` path. Public sharing is a fork-local `publish/` service with Better Auth that serves pre-rendered, script-free CV HTML and returns view counts and comments into `data/`. Upstream files change only by additive edits.

**Tech Stack:** Node 24 `.mjs` core with `node:sqlite`, `node:test` suites under `tests/`, Next.js 16 and React 19 in `web/`, zod 4, fflate, docx, better-auth 1.7 with `@better-auth/api-key`, Playwright for PDF and visual tests, chrome-devtools MCP for live checks.

**Spec:** `docs/superpowers/specs/2026-11-06-reactive-resume-convergence.md`

## How to read this

One box is one unit of work. Every box names the evidence that checks it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs under `superpowers:subagent-driven-development` or `superpowers:executing-plans`, as the operator chooses. For a jstack-style run it maps onto `<jstack>/skills/j-mode/playbooks/autopilot-full.md`, one owner per PR, the operator merging. PR-06, PR-06b, PR-07, PR-10 and PR-14 change an interaction and stop at merge-ready for the operator's review.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Global Constraints

- Fork-local root scripts and the `lib/resume/`, `lib/application-meta.mjs` and `lib/application-events.mjs` modules are claimed in `config/local-paths.txt`, never in `SYSTEM_PATHS` (`dev-workflow.md`; `SYSTEM_PATHS` names `lib/` files one by one, so nothing new falls under it). New files inside shipped directories (`tests/`, `docs/`, `web/`, `templates/`) are covered by that directory's entry and get a deviations row. `node validate-system-paths-coverage.mjs` must print `OK`.
- Every diverged upstream path gets a row in the deviations table of `.claude/skills/upstream-review/SKILL.md`. `tests/fork-deviations-covered.test.mjs` diffs HEAD, so run it after the commit.
- Shared append-only files. `resume.mjs` (subcommand registration), `docs/SCRIPTS.md`, `THIRD_PARTY_NOTICES.md`, `DATA_CONTRACT.md`, the deviations table, `web/src/lib/nav-items.ts` and `package.json` are edited by several PRs. Owners add lines, never reorder, and rebase on conflict. PR-03, PR-04 and PR-11 land in that order because all three register `resume.mjs` subcommands.
- A new script resolves the data root with `getCareerOpsRoot()` from `path-resolver.mjs`, guards its entry with `isMainModule(import.meta.url)` from `lib/is-main-module.mjs`, and never writes `data/applications.md` except through `merge-tracker.mjs` and `set-status.mjs`. `cv.md` is written only through `replaceUserFile` from `tracker-utils.mjs:823` (core) or `POST /api/cv` (web), both under a lock and with a backup.
- New tests are their own files under `tests/*.test.mjs` with no `process.exit()`. Browser suites declare `toolRequired('browser')`. The visual suite is `npm run test:cv-visual` (Playwright Test, excluded from `test-all.mjs` at line 170); run it in the `career-ops-cv-visual` image as `test.yml` does, or locally and accept font drift as a warning.
- `test-all.mjs --only <substring>` takes one value and matches by substring, so each suite is named with a unique prefix (`resume-`, `appmeta-`, `rrimport-`, `publish-`) and run with its own `--only`.
- Before every push run `node scripts/check-syntax.mjs` and `node test-all.mjs --quick`. `web/` changes also run `npm run typecheck` and `npm test` in `web/`. `publish/` changes run `npm --prefix publish test`.
- Commits follow Conventional Commits with a scope. Each commit is preceded by `/simplify` and reviewed with `/code-review`.
- New dependencies (`zod`, `fflate`, `docx`) go in the root `package.json` because core scripts need them. The publish service has its own `publish/package.json` and its own `node_modules`; nothing under `tests/` imports from it.
- Review screenshots and videos go under `private/review/`, which is gitignored.
- Vendored Reactive Resume code keeps the MIT notice, copyright Amruth Pillai, in `THIRD_PARTY_NOTICES.md` and in a header comment, and records the clone SHA `d065a9f7`.
- No headless worker gains a write tool. AI rewrite features copy the CV Studio rewrite route pattern.
- Imported Reactive Resume knowledge (facts, stories, AI answers) never enters generated content. Only resume JSON and tracker rows cross.
- Node 22.13 or newer. Pin the Node major in any image.
- Fixtures contain no personal data. The operator's own exports are used only in the migration steps, never committed.

## Review Focus

1. A `cv.md` in which an entry's company or dates changed under an existing `resume.json`. `resume.mjs absorb` must report one orphan and one new entry, write nothing, and exit 3. A title change alone is a changed entry and absorbs. Test in PR-02.
2. A hand-written `cv.md` in `examples/cv-example.md` shape (`## Work Experience`, `--` dashes, `**Location:**` lines). `absorb` must accept it without any normalisation of the file, and a file outside the parseable shape must be refused with the unparsed lines listed, so `adopt` can show a diff. Test in PR-02.
3. An RR CSV row whose stage is `closed` with no reason, and one with a blank Application Date. The importer must land the first as Discarded and skip the second as never submitted, and say so in the preview. Test in PR-09.
4. A board drop onto the same column, and a drop answered with HTTP 503 (the route's mapping of exit 4 from `set-status.mjs`). The first is a no-op with no ledger row, the second retries three times and then reverts. Unit-tested in `web/tests/lib/status-save.test.mjs` in PR-10.
5. A visitor rotating `X-Forwarded-For` behind the tunnel. The publish service must take the client key from `cf-connecting-ip` only when the peer is a trusted proxy, and count one view. Test in PR-12.

---

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] Read these from trunk at program start and re-read them at every tick. `git show origin/main:.claude/rules/dev-workflow.md`, `<jstack>/skills/j-mode/playbooks/autopilot-full.md`, `<jstack>/skills/j-mode/playbooks/opening-a-pr.md`, `<jstack>/skills/swarm/SKILL.md`.
- [ ] On the operator's go, arm the audit tick as `/loop 1h`. The tick re-reads the execution playbook, audits every active lane by side effects, replaces a stuck lane, and posts a status message only when something changed (a PR opened, a verdict, a merge, a blocker). Log each tick in `private/decisions-rr-merge.tsv`.
- [ ] On the operator's hold, send every owner a zero-writes order at once.

### Spawn owners

- [ ] One owner per PR, in the order and with the dependencies below. A PR starts only after its parents merge.
- [ ] Hold the file boundaries named in each PR's Files block. Two owners never touch the same file, except the shared append-only files in Global Constraints.
- [ ] Hold the review gate on PR-06, PR-06b, PR-07, PR-10 and PR-14.

| PR | Task | Depends on | Review gate |
| --- | --- | --- | --- |
| PR-01 | Install the fork daily and record the program | none | none |
| PR-02 | Add the resume model absorbed from `cv.md` | PR-01 | none |
| PR-03 | Import Reactive Resume JSON, JSON Resume, LinkedIn and DOCX | PR-02 | none |
| PR-04 | Port the 23 Check rules | PR-03 | none |
| PR-05 | Render a payload deterministically from the web and add design variables | PR-01 | none |
| PR-06 | Build the resume editor core with live preview | PR-02, PR-05 | operator |
| PR-06b | Add the design panel, template picker, pairing and adoption panels | PR-06 | operator |
| PR-07 | Pin Check findings in the preview | PR-04, PR-06b | operator |
| PR-08 | Add tracker sidecars and their writers | PR-01 | none |
| PR-09 | Import a Reactive Resume application export | PR-08 | none |
| PR-10 | Build the board page and the application sheet | PR-08 | operator |
| PR-11 | Export DOCX, Reactive Resume JSON and JSON Resume | PR-04 | none |
| PR-12 | Build the publish service | PR-01 | none |
| PR-12b | Add the share CLI | PR-12, PR-02 | none |
| PR-13 | Add Better Auth to the publish service | PR-12b | none |
| PR-14 | Add the shares page to the web app | PR-12b | operator |
| PR-15 | Package the publish service for deployment | PR-13 | none |

PR-02, PR-05, PR-08 and PR-12 are independent and can start together after PR-01.

### PR mechanics, for every PR

- [ ] Branch from current `main` in a sibling worktree. Open the PR ready, never draft, with `gh pr create --base main`.
- [ ] Run `node scripts/check-syntax.mjs` and `node test-all.mjs --quick` before the PR-facing push. `web/` changes also run `npm run typecheck` and `npm test` there. `publish/` changes run `npm --prefix publish test`.
- [ ] Run `/simplify` before each commit and `/code-review` on the diff. Triage every automated reviewer comment per `<jstack>/skills/j-mode/references/bugbot-triage.md`.
- [ ] Add the deviations row and the `config/local-paths.txt` claim in the same commit as the files they cover, then run `node test-all.mjs --only fork-deviations` after committing.

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
- [ ] Edit `FORK.md` to add the marketplace install step.
- [ ] Edit `.claude/skills/upstream-review/SKILL.md` to add a deviations row for `THIRD_PARTY_NOTICES.md` and one for the shared append-only files rule.
- [ ] Edit `config/local-paths.txt` to add `THIRD_PARTY_NOTICES.md` and `publish/`.

**Interfaces.** Produces the notice file every vendoring PR appends to, and the `publish/` claim PR-12 relies on.

**Build.**

- [ ] **Step 1.** Write `THIRD_PARTY_NOTICES.md` with the Reactive Resume MIT text copied from the clone's `LICENSE`, the clone SHA `d065a9f7`, and an empty "Files" list that later PRs extend.
- [ ] **Step 2.** In `FORK.md`, add a section "Run the fork as your plugin" with `/plugin marketplace add jrmatherly/career-ops` and `/plugin install career-ops@career-ops`, the route `docs/CLAUDE_PLUGIN.md:24` documents for a fork. The plugin then tracks the fork's `main`, not the dev checkout, so a branch checked out here never reaches daily use and user data cannot land in the checkout. `CAREER_OPS_ROOT=~/career-ops-data` stays.
- [ ] **Step 3.** Run `node validate-system-paths-coverage.mjs`. Expect a line starting `OK:`.
- [ ] **Step 4.** Commit `docs(fork): record the Reactive Resume convergence program`. Then run `node test-all.mjs --only fork-deviations`. Expect pass.

**You see.**

- [ ] `node validate-system-paths-coverage.mjs` prints `OK: <n> tracked files covered` with no orphan listed.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/fork-deviations-covered.test.mjs` passes at HEAD. Run `node test-all.mjs --only fork-deviations`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. On trunk and head run `node doctor.mjs --json` in a scratch root. Save `doctor.txt`. Pass when both print the same keys.
- [ ] Lane 2. Operator step, not a worker. Add `jrmatherly/career-ops` as a marketplace in Claude Code, install, and run `/career-ops` once. Save `menu.png`. Pass when the menu lists the modes.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Suite count and wall time of `node test-all.mjs --quick` at trunk and head.
- [ ] Probe. `time node test-all.mjs --quick`, three runs each, interleaved.
- [ ] Baseline. Record the trunk count and median first.
- [ ] Rule. Same suite count. Head median within 20 percent of trunk.

**Review gate.** None. PR-01 is not review-gated.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Add the resume model absorbed from `cv.md` (PR-02)

**Depends on.** PR-01.

**Files.**

- [ ] Create `lib/resume/schema.mjs` (vendored from the clone's `packages/schema/src/resume/{data,dates,period,stylesheet,default,limits}.ts`, `templates.ts`, the two JSON label files `period.ts` imports, and the `stripHtml` util, converted once with `stripTypeScriptTypes` from `node:module`, renamed to `.mjs` with `.mjs` import specifiers, zod 4).
- [ ] Create `lib/resume/model.mjs`.
- [ ] Create `lib/resume/to-cv-md.mjs` (gen).
- [ ] Create `lib/resume/absorb.mjs` (reverse parse and the lossless gate, over `lib/cv-markdown.mjs`).
- [ ] Create `lib/resume/to-payload.mjs`.
- [ ] Create `resume.mjs`.
- [ ] Create `tests/resume-model.test.mjs`, `tests/resume-gen.test.mjs`, `tests/resume-absorb.test.mjs`, `tests/resume-payload.test.mjs`, `tests/resume-cli.test.mjs`.
- [ ] Create `tests/fixtures/resume/sample.json` (the clone's `packages/schema/src/resume/sample` data with fictional names) and `tests/fixtures/resume/cv-example-shape.md` (a copy of `examples/cv-example.md`).
- [ ] Edit `package.json` to add `zod`.
- [ ] Edit `config/local-paths.txt` to add `resume.mjs` and `lib/resume/`.
- [ ] Edit `DATA_CONTRACT.md` to add `data/resume.json` (derived from `cv.md`, user layer, records `careerOps.cvSha256`).
- [ ] Edit `doctor.mjs` to warn when `data/resume.json` records a hash other than the current `cv.md`.
- [ ] Edit `docs/SCRIPTS.md` to add the `resume.mjs` section.
- [ ] Edit `THIRD_PARTY_NOTICES.md` and the deviations table.

**Interfaces.**

- Produces `parseResume(json: unknown): { ok: true, data: ResumeData } | { ok: false, issues: ZodIssue[] }` in `lib/resume/schema.mjs`. The root is RR's `looseObject`, so career-ops keeps its own fields under one root key `careerOps: { cvSha256, pendingCvSha256?, cvStyle: { experienceHeading, summaryHeading, dash, contactLines }, template, style }`. `template` is a career-ops template name (RR's `metadata.template` is an enum of RR names with `.catch("onyx")` and cannot hold it); `style` holds the `theme-style.mjs` keys.
- Produces `readResume(root)`, `writeResume(root, data)` (atomic, under `lib/dir-lock.mjs`) and `resumePath(root)` in `lib/resume/model.mjs`.
- Produces `absorb(cvMarkdown, prior): { data, report: { kept, changed, added, removed, orphans, newEntries, unparsed }, lossless }` in `lib/resume/absorb.mjs`. Entries match on normalised company plus `normalizeDates(period)`, the key `matchKey` in `cv-title-check.mjs:208` uses; the title is a compared field, so a retitle is a changed entry. An orphan arises only when company or dates change. Bullets align by longest common subsequence and unchanged bullets keep their stored HTML. A new entry gets a uuid and is inserted at its parsed position. The raw period text is kept in `period` when the key matches, so an en dash in a date absorbs. `careerOps.cvStyle` records the source file's experience heading (`## Experience`, `## Work Experience`, and the other names `EXPERIENCE_HEADING_RE` accepts), summary heading, dash style (`--`, en dash or em dash) and the contact-line labels, and gen reproduces them, so a file in `examples/cv-example.md` shape absorbs with no change to it. `lossless` is true only when `gen(data)` equals the input after `normalizePandocLine`. Orphans are never dropped. `pairOrphan(data, orphanId, newId)` keeps the orphan's id, hidden flag, website and structured dates on the new entry.
- Produces `resumeToCvMarkdown(data): string` in `lib/resume/to-cv-md.mjs`. It emits every section the editor can edit (basics, summary, experience with roles flattened, education, projects, skills, certifications, awards, languages, interests, publications, volunteer, references, custom sections) as `## <Section>` blocks in the shapes `examples/cv-example.md` uses, so `doctor.mjs`, `cv-title-check.mjs` and `verify-cv-structure.mjs` parse it and no editable fact lives only in JSON. Hidden sections and items are included, as the operator confirmed, because `cv.md` is the evaluator's full record.
- Produces `resumeToPayload(data, opts: { lang?, page_format?, country?, hide?: string[], hideItems?: string[] }): { payload, unmapped }` in `lib/resume/to-payload.mjs`, emitting only `KNOWN_ROOT_KEYS.html` from `lib/cv-payload-schema.mjs`. Sections and items with `hidden: true`, sections in `hide` and items in `hideItems` are left out of this one render. `experience.roles[]` become one payload entry per role. HTML descriptions become bullets with the `<li>` and `<p>` rule from `build_cv_md.py`. `unmapped` lists sections the payload has no slot for (languages, publications, volunteer, references, interests when the template lacks the slot).
- Produces the CLI `node resume.mjs`
  - `absorb [--json]`. Reads `cv.md`, absorbs into `data/resume.json` (creating it on first run), saves only when `lossless`, else prints the report and exits 3 with nothing written.
  - `adopt [--confirm]`. First adoption for a `cv.md` outside the parseable shape. Absorbs what parses, lists the unparsed lines, prints the diff between `cv.md` and `gen(data)`, and with `--confirm` writes the normalised `cv.md` through `replaceUserFile` (backup kept) and saves the JSON. This is the one path that writes `cv.md` from JSON, and it is interactive.
  - `pair <orphanId> <newId>`.
  - `export cv-md|payload [--in file] [--out file] [--json] [--hide s,...] [--hide-item id,...]`. Without `--in` it absorbs first and refuses (exit 3) while the gate fails. With `--in` it reads a supplied JSON and does not touch the data root, which is how the web previews a draft.
  - `save --in file --expected-cv-sha <sha> [--json]`. Writes `careerOps.pendingCvSha256 = sha256(gen(data))` into `resume.json`, then `cv.md` through `replaceUserFile` only if the current `cv.md` sha equals `--expected-cv-sha` (else exit 4, nothing written), then clears `pending` and sets `cvSha256`. A crash between the writes leaves `pending` set, and the next `absorb` recognises a `cv.md` whose sha equals `pending` as already saved.

**Build.**

- [ ] **Step 1.** Write `tests/resume-model.test.mjs` with cases `parses the sample`, `rejects a non-object root`, `self-heals a missing metadata.page with the default`, and `keeps careerOps on the loose root`.
- [ ] **Step 2.** Run `node --test tests/resume-model.test.mjs`. Expect fail with module not found.
- [ ] **Step 3.** Vendor the schema with `stripTypeScriptTypes`, fix import specifiers, keep the MIT headers, list the files in `THIRD_PARTY_NOTICES.md`. Add `zod` to `package.json`, run `npm install`. Implement `model.mjs`. Run the test. Expect pass.
- [ ] **Step 4.** Write `tests/resume-gen.test.mjs` asserting the sample yields every section heading above, a `### Company -- Location` line, a bold title line, a dates line, and that `cv-title-check.mjs`'s `parseCvExperience` and `lib/cv-markdown.mjs` find the same entry count as the sample's flattened roles. Implement `to-cv-md.mjs`. Run and expect pass.
- [ ] **Step 5.** Write `tests/resume-payload.test.mjs` asserting the result passes `validatePayload` with no warnings, that a two-role experience yields two entries, that a hidden item is absent, that `--hide skills` drops the section, and that `unmapped` lists the slotless sections. Implement `to-payload.mjs`. Run and expect pass.
- [ ] **Step 6.** Write `tests/resume-absorb.test.mjs` with the prototype's scenarios, each asserting `lossless: true` unless noted. No-op is deep-equal. Changed bullet. Added bullet with bold and a link. Deleted bullet. Summary reword. Skill keyword edit. `add-entry.mjs`-shaped project insert. Edit inside a hidden entry keeps `hidden`. Appended job lands at its parsed position. An en-dash date keeps its text. A retitle is one changed entry. A changed company yields one orphan plus one new entry and `lossless: false`, and `pairOrphan` restores the id. `cv-example-shape.md` with no prior absorbs lossless and `careerOps.cvStyle` records `## Work Experience` and `--`. A file with a stray paragraph outside any section is not lossless and `unparsed` names the line. Implement `absorb.mjs`. Run and expect pass.
- [ ] **Step 7.** Write `tests/resume-cli.test.mjs` in a temp root asserting `absorb` creates the JSON on a clean `cv.md`, a second run is a no-op, a changed-company `cv.md` makes `absorb` exit 3 without writing, `pair` then makes it save, `adopt` on a Pandoc-style `cv.md` prints a diff and writes only with `--confirm`, `export payload --in draft.json` reads the draft and leaves the root untouched, `save` refuses with exit 4 on a stale `--expected-cv-sha`, and `save` after a simulated crash (pending set, `cv.md` written) is recognised by the next `absorb`. Implement `resume.mjs`. Add the `doctor.mjs` warning `data/resume.json is behind cv.md; run node resume.mjs absorb`. Run and expect pass.
- [ ] **Step 8.** Update `config/local-paths.txt`, `DATA_CONTRACT.md`, `docs/SCRIPTS.md`, the deviations table. Run `node validate-system-paths-coverage.mjs` and `node test-all.mjs --quick`.
- [ ] **Step 9.** Commit `feat(resume): add the resume model absorbed from cv.md`.

**You see.**

- [ ] `node resume.mjs absorb --json` on `examples/cv-example.md` prints `"lossless": true` with `"kept"` equal to the file's entry count, and `node resume.mjs export payload --json` prints a payload that `validatePayload` accepts.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The five suites pass. Run `node test-all.mjs --only resume-model`, then `--only resume-gen`, `--only resume-absorb`, `--only resume-payload`, `--only resume-cli`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Four lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk lacks the feature. In a scratch root with `examples/cv-example.md` as `cv.md`, run `node resume.mjs absorb` then `node doctor.mjs --json`. Save `doctor.json`. Pass when `cv.md` is byte-identical to before, `onboardingNeeded` is false and no warning names `resume`.
- [ ] Lane 2. Run `export payload --out payload.json`, then `node build-cv-html.mjs payload.json out.html` and `node generate-pdf.mjs out.html out.pdf`. Save `out.pdf` and `render.png`. Pass when the PDF shows the example candidate's name and the fact gate passes.
- [ ] Lane 3. Edit one bullet in `cv.md`, run `absorb`. Save `absorb.txt`. Pass when exit is 0, the bullet is in the JSON, and `cv.md` is unchanged. Then change an entry's dates and run `absorb`. Save `orphan.txt`. Pass when exit is 3, the report names the orphan, and nothing was written.
- [ ] Lane 4. Run `node cv-title-check.mjs --summary` and `node verify-cv-structure.mjs` against the exported payload. Save `checks.txt`. Pass when neither reports a mismatch.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of `node resume.mjs export payload` on the example. Trunk lacks the feature, so the budget is absolute.
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
- [ ] Edit `resume.mjs` to add `import <file> [--format rr|json-resume|linkedin|docx] [--confirm] [--replace-cv]`.
- [ ] Edit `package.json` to add `fflate`.
- [ ] Edit `THIRD_PARTY_NOTICES.md`, `docs/SCRIPTS.md`, the deviations table.

**Interfaces.**

- Consumes `parseResume`, `writeResume`, `resumeToCvMarkdown`, `absorb` and `replaceUserFile` from PR-02 and `tracker-utils.mjs`.
- Produces `detectFormat(buffer, filename): 'rr' | 'json-resume' | 'linkedin' | 'docx' | 'unknown'` and `importResume(buffer, format): { data: ResumeData, review: { sections: string[], leftover: string[] } }`.
- The CLI prints the review summary and writes nothing without `--confirm`. When no `cv.md` exists, `--confirm` writes `cv.md` as `gen(imported)` through `replaceUserFile`, then the JSON, then asserts `absorb` is lossless. When a `cv.md` exists it prints the diff between it and `gen(imported)` and refuses unless `--replace-cv` is also given, which keeps the backup `replaceUserFile` writes. It never merges two CVs.

**Build.**

- [ ] **Step 1.** Write `tests/resume-import.test.mjs` with one case per format asserting `detectFormat` and that the result passes `parseResume`, `linkedin maps Positions.csv rows to experience with structured dates`, `confirm with an existing cv.md refuses without --replace-cv`, and `confirm then absorb is lossless`. Run. Expect fail.
- [ ] **Step 2.** Port the importers. Swap `generateId` for `crypto.randomUUID()`, drop the icon lookup, keep the MIT headers. Implement the subcommand. Run. Expect pass.
- [ ] **Step 3.** Commit `feat(resume): import Reactive Resume, JSON Resume, LinkedIn and DOCX`.

**Migration step, operator only, not committed.**

- [ ] In `~/career-ops-data`, back up `cv.md`, then run `node resume.mjs import ~/dev/job-search/matherly-ats.json`, read the review and the diff against the current `cv.md` (which `build_cv_md.py` generated from the same export), then `--confirm --replace-cv`. Expect only formatting differences and `node resume.mjs absorb --json` to report `lossless: true`. The second export, `matherly-resume.json`, is the site master with education hidden and the `azurill` design. It is not imported as a second CV. Its hidden choice becomes a share overlay (`--hide education`) and its template choice a `careerOps.template` value in PR-12b.

**You see.**

- [ ] `node resume.mjs import sample.json` prints the sections found with item counts and `Nothing written. Add --confirm`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/resume-import.test.mjs` passes. Run `node test-all.mjs --only resume-import`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Three lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk lacks the feature. Import each fixture into its own empty scratch root and run `node doctor.mjs --json`. Save `doctor-<format>.json`. Pass when all four roots report no warning.
- [ ] Lane 2. Import the JSON Resume fixture, then run `node resume.mjs export cv-md`. Save `cv.md`. Pass when every experience entry in the fixture appears.
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

**Depends on.** PR-03.

**Files.**

- [ ] Create `lib/resume/check.mjs` (ported from the clone's `packages/resume/src/ats/{rules,catalog,section-aliases,types,walk,merge,index}.ts`).
- [ ] Create `lib/resume/template-layouts.mjs` (a table of the eight career-ops templates and the ATS template with `columns`, `sidebar` and `atsSafe`, replacing RR's `templateLayouts` import at `rules.ts:12`).
- [ ] Create `tests/resume-check.test.mjs` (ported cases from `rules.test.ts`).
- [ ] Edit `resume.mjs` to add `check [--json] [--ignore RULE_ID]`.
- [ ] Edit `modes/pdf.md` step 17b to run `node resume.mjs check --json` when `data/resume.json` exists and report findings as advisory.
- [ ] Edit `THIRD_PARTY_NOTICES.md`, `docs/SCRIPTS.md`, the deviations table (a `modes/pdf.md` row marked `~`, keep ours on upstream hunks).

**Interfaces.**

- Consumes `ResumeData` and `careerOps.template` from PR-02.
- Produces `checkResume(data, opts: { now?: Date, locale?: string }): { score: number, findings: Finding[] }` where `Finding = { id, category, severity, path, message, fix? }`, `id` is one of the 23 rule ids in Appendix D, the layout rules read `template-layouts.mjs` for `careerOps.template`, and ignored ids come from `data.metadata.check.ignored`, RR's own field. The score is passed checks over applicable checks times 100, rounded, as RR's `index.ts:123` computes it.

**Build.**

- [ ] **Step 1.** Port `rules.test.ts` cases to `node:test`, adding one case per career-ops template for the layout rules. Run. Expect fail.
- [ ] **Step 2.** Port the rules as pure functions with `now` injected and the layout table swapped in. Run. Expect pass.
- [ ] **Step 3.** Add the CLI subcommand and the `modes/pdf.md` line.
- [ ] **Step 4.** Commit `feat(resume): port the Reactive Resume Check rules`.

**You see.**

- [ ] `node resume.mjs check` on the sample with its email removed prints a score below 100 and one line `MISSING_EMAIL contact basics.email`.

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
- [ ] Edit the eight `templates/cv-template*.html` files and `templates/ats/cv-template.ats.html` so each new token is read with `var(--x, <that template's current value>)`.
- [ ] Edit `config/profile.example.yml` `style:` comments to list the new keys.
- [ ] Create `web/src/app/api/cv-render/route.ts`.
- [ ] Create `web/src/lib/cv-render.ts`.
- [ ] Create `web/tests/lib/cv-render.test.mjs`, `tests/theme-style-tokens.test.mjs` and the golden fixture `tests/fixtures/theme-style/example-default.html` (the trunk render of the example payload, committed once).
- [ ] Edit `docs/SCRIPTS.md`, the deviations table.

**Interfaces.**

- `build-cv-html.mjs` reads style only from the profile `getProfilePath()` resolves (`build-cv-html.mjs:58`, `theme-style.mjs:79`) and takes a template file path, not a name, as its third argument (`build-cv-html.mjs:1106`). So the route resolves the name with `resolveTemplate('cv', name)` from `cv-templates.mjs:755`, writes a temp profile that copies the user's `config/profile.yml` with the request's `style` merged under `style:`, and spawns with `CAREER_OPS_PROFILE` pointing at it through `runCoreCli` from `web/src/lib/core-cli.ts`. The temp profile keeps the user's section order, locked sections and page budget.
- Produces `POST /api/cv-render` with body `{ payload, template?, style? }` returning `{ html, warnings }` or 400 with `validatePayload` issues, and `renderCv(payload, template, style)` in `web/src/lib/cv-render.ts`, debounced by callers.
- Consumes `listTemplates('cv', { format: 'html' })` from `cv-templates.mjs:228` for picker data; nothing new is needed there.

**Build.**

- [ ] **Step 1.** Render the example payload with the default template at trunk and commit it as the golden fixture. Write `tests/theme-style-tokens.test.mjs` asserting the eight new keys map to CSS variables and that a render with an empty `style:` equals the golden fixture byte for byte. Run. Expect fail on the missing keys.
- [ ] **Step 2.** Extend `STYLE_VAR_MAP` and the nine templates. Run. Expect pass. Run `npm run test:cv-visual` (in the cv-visual image when available). Expect no baseline change.
- [ ] **Step 3.** Write `web/tests/lib/cv-render.test.mjs` asserting a valid payload returns HTML containing the candidate name, a `style` value reaches the HTML as its CSS variable, a template name resolves, and an invalid payload returns the validator issues. Implement the route and lib. Run `cd web && npm test`. Expect pass.
- [ ] **Step 4.** Commit `feat(web): render a CV payload deterministically and add design variables`.

**You see.**

- [ ] `curl -X POST localhost:3000/api/cv-render -d @body.json` returns HTML in under 300 ms with `"warnings": []`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Both new suites pass and the visual suite is unchanged. Run `node test-all.mjs --only theme-style`, `cd web && npm test`, and `npm run test:cv-visual`.

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

## Build the resume editor core with live preview (PR-06)

**Depends on.** PR-02, PR-05.

**Files.**

- [ ] Create `web/src/app/resume/page.tsx`, `loading.tsx`.
- [ ] Create `web/src/components/resume/resume-editor.tsx`, `section-form.tsx`.
- [ ] Create `web/src/app/api/resume/route.ts` (GET runs `node resume.mjs absorb --json` then reads the JSON and `cv.md`; PUT runs `node resume.mjs save --in <tmp> --expected-cv-sha <sha> --json`).
- [ ] Create `web/src/app/api/resume/preview/route.ts` (writes the draft to a temp file, runs `node resume.mjs export payload --in <tmp> --out -`, then `renderCv`; the web app never loads zod).
- [ ] Create `web/src/lib/resume-form.mjs` (pure helpers `addItem`, `removeItem`, `moveItem`, `setField`, `toggleHidden` over `ResumeData`) and `web/tests/lib/resume-form.test.mjs`.
- [ ] Edit `web/src/lib/nav-items.ts` to add `{ href: "/resume", label: "Resume", icon: IdCard }` (`lucide-react` 1.27.0 is installed and exports it).
- [ ] Reuse `web/src/components/cv-studio/cv-preview.tsx` for the preview iframe.
- [ ] Create `web/tests/lib/resume-route.test.mjs`.
- [ ] Edit the deviations table.

**Interfaces.**

- Consumes `resume.mjs absorb`, `export payload --in`, `save --in --expected-cv-sha` from PR-02 as spawned commands through `runCoreCli`, and `renderCv` from PR-05.
- Produces `GET /api/resume` returning `{ data, cvMdSha, report, lossless }` and `PUT /api/resume` with `{ data, expectedCvSha }` returning 409 when `save` exits 4.
- The editor is a form over basics and the twelve sections plus custom sections, hand-rolled with `web/src/components/ui/`. Every edit posts the draft to `/api/resume/preview` after a 300 ms debounce and marks `performance.mark('resume-edit')` and `performance.mark('resume-preview')` around it. Save calls `PUT`. When `GET` returns `lossless: false` the editor is read-only and shows the report; the pairing and adoption actions arrive in PR-06b. There is no Overwrite button.

**Build.**

- [ ] **Step 1.** Write `web/tests/lib/resume-route.test.mjs` for the three routes with `runCoreCli` stubbed (GET passes the report through, PUT maps exit 4 to 409, preview rejects an invalid draft with 400). Run. Expect fail.
- [ ] **Step 2.** Implement the routes. Run. Expect pass.
- [ ] **Step 3.** Write `web/tests/lib/resume-form.test.mjs` for the five helpers. Run. Expect fail. Implement `resume-form.mjs`. Expect pass.
- [ ] **Step 4.** Build `section-form.tsx` over the helpers, then `resume-editor.tsx` wiring preview and save. Run `npm run typecheck` after each.
- [ ] **Step 5.** Commit `feat(web): add the resume editor core with live preview`.

**You see.**

- [ ] Typing in a bullet updates the preview within half a second and Save shows `cv.md updated`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `web/tests/lib/resume-route.test.mjs` and `web/tests/lib/resume-form.test.mjs` pass. Run `cd web && npm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has `/cv` only. On trunk open `/cv`, on head open `/cv` and `/resume`. Save `cv-trunk.png`, `cv-head.png`, `resume.png`. Pass when `/cv` is unchanged and `/resume` lists the example's sections.
- [ ] Lane 2. Edit a bullet, wait, screenshot the preview. Save `edit.png`. Pass when the new text appears in the iframe.
- [ ] Lane 3. Save, then read `cv.md`. Save `saved.txt`. Pass when the bullet is in `cv.md` and `node resume.mjs absorb --json` reports `lossless: true`.
- [ ] Lane 4. Add a job entry. Save `newjob.png`. Pass when it renders and `cv.md` gains the entry at the right position after Save.
- [ ] Lane 5. Change an entry's dates in `cv.md` on disk, reload. Save `readonly.png`. Pass when the editor is read-only and the report names one orphan.
- [ ] Lane 6. Two tabs, save in both. Save `conflict.png`. Pass when the second gets a 409 message and `cv.md` holds the first save.
- [ ] Lane 7. Add a custom section of type `projects`. Save `custom.png`. Pass when it renders in the preview and survives reload.
- [ ] Lane 8. Phone width 390 through `emulate`. Save `mobile.png`. Pass when no horizontal scroll and the preview stacks below the form.
- [ ] Lane 9. Keyboard only. Tab through the form and trigger Save with Enter. Save `keyboard.png`. Pass when focus rings are visible and Save fires.
- [ ] Lane 10. Dark mode class on `html`. Save `dark.png`. Pass when form contrast is readable and the preview iframe stays light.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `resume-edit` to `resume-preview` duration, p50 over 20 edits, read from the `performance.measure` entries in the trace.
- [ ] Probe. `performance_start_trace`, type 20 characters, `performance_stop_trace`, read the user timing track. Trunk lacks the feature.
- [ ] Baseline. Absolute budget.
- [ ] Rule. p50 under 600 ms including the 300 ms debounce.

**Review gate.** The operator reviews before merge.

- [ ] Copy lanes 2, 3 and 5 screenshots into `private/review/pr-06-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of an edit, a save and the read-only state. Save it as `private/review/pr-06-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Add the design panel, template picker, pairing and adoption panels (PR-06b)

**Depends on.** PR-06.

**Files.**

- [ ] Create `web/src/components/resume/design-panel.tsx`, `template-picker.tsx`, `gate-panel.tsx`.
- [ ] Create `web/src/app/api/resume/pair/route.ts` (runs `node resume.mjs pair`) and `web/src/app/api/resume/adopt/route.ts` (runs `node resume.mjs adopt`, and with `{ confirm: true }` `adopt --confirm`).
- [ ] Create `web/tests/lib/resume-gate-routes.test.mjs`.
- [ ] Edit the deviations table.

**Interfaces.**

- The design panel edits `careerOps.style` for every `STYLE_VAR_MAP` key, the eight new ones and the existing `font_size`, `font_family`, `accent_color`, `margin`, and `careerOps.template` from `listTemplates`. Preview passes both to `/api/cv-render`. Save persists them in `resume.json` through `PUT /api/resume`; `cv.md` does not change for a design-only edit.
- The gate panel shows the absorb report when `lossless` is false. Each orphan offers "Same entry, renamed" against a new entry, calling `/api/resume/pair`. When `unparsed` is non-empty it offers "Adopt", which shows the `adopt` diff and on confirm calls `/api/resume/adopt` with `{ confirm: true }`. Nothing else writes `cv.md` from JSON.

**Build.**

- [ ] **Step 1.** Write `web/tests/lib/resume-gate-routes.test.mjs` with `runCoreCli` stubbed (pair passes ids through, adopt without confirm returns the diff and writes nothing, adopt with confirm passes `--confirm`). Run. Expect fail. Implement. Expect pass.
- [ ] **Step 2.** Build `design-panel.tsx`, `template-picker.tsx` and `gate-panel.tsx`, wire them into `resume-editor.tsx`. Run `npm run typecheck`.
- [ ] **Step 3.** Commit `feat(web): add design, template, pairing and adoption panels to the resume editor`.

**You see.**

- [ ] Switching template or line height re-renders the preview, and a changed-company `cv.md` shows the gate panel with one pairing action.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `web/tests/lib/resume-gate-routes.test.mjs` passes. Run `cd web && npm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk (PR-06 head) lacks the panels. Open `/resume` at both. Save `trunk.png`, `head.png`. Pass when the editor core is unchanged and the panels appear only at head.
- [ ] Lane 2. Switch template to `compact`. Save `compact.png`. Pass when the iframe layout changes and the saved JSON has `careerOps.template: "compact"`.
- [ ] Lane 3. Set line height 1.6. Save `design.png`. Pass when the iframe's `.job` computed line-height is 1.6 and `cv.md` is unchanged after Save.
- [ ] Lane 4. Set body font size 8 pt. Save `font.png`. Pass when the preview shrinks and the JSON holds `font_size: "8pt"`.
- [ ] Lane 5. Change an entry's company in `cv.md`, reload. Save `orphan.png`. Pass when the gate panel lists one orphan and one new entry.
- [ ] Lane 6. Pair them. Save `paired.png`. Pass when the editor becomes writable and the entry keeps its old id.
- [ ] Lane 7. Replace `cv.md` with a Pandoc-style export. Save `adopt.png`. Pass when the panel offers Adopt with a diff and nothing is written until confirm.
- [ ] Lane 8. Confirm Adopt. Save `adopted.png`. Pass when `cv.md` is normalised, a backup exists, and `absorb` is lossless.
- [ ] Lane 9. Phone width. Save `mobile.png`. Pass when the panels collapse into drawers.
- [ ] Lane 10. Keyboard. Save `keyboard.png`. Pass when the template picker and pairing action are reachable by Tab and Enter.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Template switch to preview, p50 over 10 switches, from the `performance.measure` entries.
- [ ] Probe. Trace a loop of switches. Trunk (PR-06) lacks the picker.
- [ ] Baseline. Absolute budget.
- [ ] Rule. p50 under 800 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy lanes 2, 5 and 7 screenshots into `private/review/pr-06b-review-<slug>.png`.
- [ ] Record a 60 second video of a template switch, a pairing and an adoption. Save it as `private/review/pr-06b-review.mp4`.
- [ ] Post them in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Pin Check findings in the preview (PR-07)

**Depends on.** PR-04, PR-06b.

**Files.**

- [ ] Create `web/src/app/api/resume/check/route.ts` (runs `node resume.mjs check --json`).
- [ ] Create `web/src/components/resume/check-panel.tsx`.
- [ ] Edit `web/src/components/cv-studio/cv-preview.tsx` to accept `markers: { path: string, severity: string }[]` and overlay them by `data-resume-path`.
- [ ] Edit `lib/resume/to-payload.mjs` so each payload entry carries `path` (its JSON path), `lib/cv-payload-schema.mjs` to add `path` to every section's `known` list (unknown keys are refused), and `build-cv-html.mjs` to emit it as `data-resume-path` on the rendered block (one attribute, no layout change).
- [ ] Create `web/tests/lib/check-route.test.mjs`.
- [ ] Edit the deviations table (`build-cv-html.mjs` and `lib/cv-payload-schema.mjs` rows).

**Interfaces.**

- Consumes `checkResume` findings with `path` from PR-04 and the design panel from PR-06b.
- Produces a panel listing findings by category with the score, an Ignore button that writes `metadata.check.ignored` through `PUT /api/resume`, and a click that scrolls the preview to the block whose `data-resume-path` matches.

**Build.**

- [ ] **Step 1.** Write `web/tests/lib/check-route.test.mjs` with the sample minus email. Expect `MISSING_EMAIL`. Implement the route.
- [ ] **Step 2.** Add `path` to the payload and schema and the attribute to the renderer. Run `node test-all.mjs --only resume-payload` and `npm run test:cv-visual`. Expect pass and no baseline change (the attribute is invisible).
- [ ] **Step 3.** Build the panel and the marker overlay. `npm run typecheck`.
- [ ] **Step 4.** Commit `feat(web): pin Check findings in the resume preview`.

**You see.**

- [ ] A finding row, clicked, scrolls the preview to the outlined block.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `web/tests/lib/check-route.test.mjs`, `tests/resume-payload.test.mjs` and the visual suite pass.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk lacks the panel. Open `/resume` at head with the sample minus email. Save `panel.png`. Pass when the panel shows `MISSING_EMAIL` and the score.
- [ ] Lane 2. Click the finding. Save `pinned.png`. Pass when the contact block is outlined and in view.
- [ ] Lane 3. Ignore it. Save `ignored.png`. Pass when the finding disappears and the JSON has the id in `metadata.check.ignored`.
- [ ] Lane 4. Reverse two dates. Save `dates.png`. Pass when `REVERSED_PERIOD` appears with the right entry pinned.
- [ ] Lane 5. Hide the experience section. Save `noexp.png`. Pass when `NO_VISIBLE_EXPERIENCE` appears.
- [ ] Lane 6. Set body font size 8 pt in the design panel. Save `font.png`. Pass when `SMALL_BODY_FONT` appears.
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
- [ ] Create `salary-observe.mjs` (appends one `data/salary-observations.tsv` row).
- [ ] Create `offer-terms.mjs` (writes `data/offers/{company-slug}/terms.md`, the directory `offer-prep` already uses, so `DATA_CONTRACT.md:59` already covers it).
- [ ] Create `followup-pin.mjs` (appends a `- next #<num> <YYYY-MM-DD> (set <today>) — <note>` pin line to `data/follow-ups.md`, the grammar `followup-cadence.mjs` `OVERRIDE_RE` reads; `followup-seed.mjs` is not reused because its `--date` is the apply date the cadence counts from).
- [ ] Edit `tracker-utils.mjs` to export `appendBackfillRows(trackerPath, rows)`.
- [ ] Create `tests/appmeta-meta.test.mjs`, `tests/appmeta-events.test.mjs`, `tests/appmeta-interview-round.test.mjs`, `tests/appmeta-salary-observe.test.mjs`, `tests/appmeta-offer-terms.test.mjs`, `tests/appmeta-followup-pin.test.mjs`, `tests/appmeta-backfill-ledger.test.mjs`.
- [ ] Edit `config/local-paths.txt` (the six scripts and two libs), `DATA_CONTRACT.md` (two sidecars), `docs/SCRIPTS.md`, the deviations table (`tracker-utils.mjs` row).

**Interfaces.**

- Produces `readMeta(root): Map<num, Record<key, { value, date, source }>>` (latest per key wins, `tag` collects into an array) and `setMeta(root, num, key, value, source)` appending `{num}\t{date}\t{key}\t{value}\t{source}` to `data/application-meta.tsv`. Keys are the closed set `lane`, `tag`, `closed_reason`, `source`, `closed_at`; others throw.
- Produces `readEvents(root, num?)` and `addEvent(root, num, kind, text, source, at?)` appending `{num}\t{datetime}\t{kind}\t{text}\t{source}` to `data/application-events.tsv`. Kinds are `note`, `contact`, `import`.
- Produces `node app-meta.mjs get <num> | set <num> <key> <value> [--source s] | dump --json` and `node app-events.mjs add <num> <kind> <text> | list [<num>] --json`. The `--json` dumps are how the web reads the sidecars (the web keeps its own parsers under `web/src/lib/core/` and never imports root modules).
- Produces `appendBackfillRows(trackerPath, rows: { num, date, from, to, note }[])`, which derives the ledger path beside the tracker the way `set-status.mjs` does, holds `acquireTrackerLock(trackerLockDirFor(trackerPath))`, and then calls `appendLedgerRows` (a bare `appendFileSync` at line 870 that must not run unlocked), with source `backfill`.
- Produces `node interview-round.mjs add --num N --kind screening|technical|behavioral|onsite|other --at <ISO> --tz <IANA> [--duration 60] [--participants "Name (role); ..."] [--notes text] [--ics file]` (one of `--at` or `--ics`), appending one row under `lib/dir-lock.mjs` with `#N in tracker` in Notes so `tracker-sync-check.mjs` matches it, with `Date/Time` as `YYYY-MM-DD HH:MM <IANA tz> (<n>m)` so every existing reader still takes the leading date.
- Produces `node salary-observe.mjs --num N --kind desired|advertised|actual --amount --currency --source [--note]`, `node offer-terms.mjs --company <slug> --num N --base --currency --period --variable --equity --respond-by --start-date [...]`, and `node followup-pin.mjs --num N --date YYYY-MM-DD [--note]`. Each writes one file under `dir-lock` and prints the row it wrote. Contacts reuse `appendContact(contact, contactsPath)` from `contact-extract.mjs:153`.

**Build.**

- [ ] **Step 1.** Write the seven suites in temp roots. Run each with `node --test`. Expect fail.
- [ ] **Step 2.** Implement the two libs, the six CLIs and the locked backfill export. Run. Expect pass.
- [ ] **Step 3.** Run `node rejection-latency.mjs --summary`, `node process-quality.mjs --summary`, `node close-stale.mjs --dry-run`, `node verify-pipeline.mjs` and `node tracker-sync-check.mjs` on a root with the new row format. Expect all five parse the date and report nothing new.
- [ ] **Step 4.** Commit `feat(tracker): add application sidecars and fork-local writers`.

**You see.**

- [ ] `node app-meta.mjs get 12` prints `lane=Phone screen tag=remote,ai closed_reason=`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The seven suites pass. Run `node test-all.mjs --only appmeta-`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Three lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run `node verify-pipeline.mjs` on a scratch tracker at trunk and head with the two new files present at head. Save `verify.txt`. Pass when head reports no new error.
- [ ] Lane 2. Run `node interview-round.mjs add --num 3 --kind technical --at 2026-12-01T14:00 --tz America/New_York` then `node tracker-sync-check.mjs`. Save `sync.txt`. Pass when the row matches its tracker number.
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
- [ ] Create `tests/rrimport-tracker.test.mjs` and fixtures `tests/fixtures/rr/applications.csv` (the 22 RR headers), `tests/fixtures/rr/applications.json`, `application-stages.json`, `career.json` (fictional).
- [ ] Edit `config/local-paths.txt` (`lib/import-rr-applications.mjs`), `docs/SCRIPTS.md`, the deviations table (`import-tracker.mjs` row).

**Interfaces.**

- Consumes `setMeta`, `addEvent`, `appendBackfillRows`, `interview-round.mjs`, `salary-observe.mjs`, `offer-terms.mjs`, `followup-pin.mjs` from PR-08, `appendContact` from `contact-extract.mjs`, `withPipelineLock` from `pipeline-lock.mjs` and the URL dedup `import-tracker.mjs` already does with `normalizeUrl` (lines 222 and 236).
- Produces `detectRrExport(headers): boolean` (true when `Lane Category`, `Stage History`, `Timeline` and `Posting Source` are all present) and `planRrImport(rows, tracker): Plan` where each item is `{ outcome: 'import' | 'tracked' | 'saved' | 'never-submitted', state, closedReason?, sidecars }`.
- Stage mapping is fixed by the spec. `screening` maps to Responded, overriding `resolveCanonicalState`. Rows with no submission (`submittedAt` null in JSON, blank Application Date in CSV) are `never-submitted` and skipped. `saved` rows are appended to `data/pipeline.md` Pending as `- [ ] {url} | {company} | {role}` under `withPipelineLock`, skipping URLs already in `data/scan-history.tsv` or the inbox.
- Sidecars are written after `merge-tracker.mjs` returns, keyed by the number the row holds in the tracker after the merge (read back by URL, else by reserved number), because the merge can fold a row into an existing one or refuse it. Each completed row gets an `import` event `rr-export <exportDate>`; a rerun writes sidecars only for rows without that event, so a failed sidecar write is completed next time. Writes are `lane`, `tag`, `closed_reason`, `source` to meta, note timeline entries to events, interviews through `interview-round.mjs`, contacts through `appendContact`, `followUpAt` through `followup-pin.mjs`, offer terms through `offer-terms.mjs` and `salary-observe.mjs`, and stage history through `appendBackfillRows`. A `jobDescription` becomes a `jds/{num}-{date}_{company}_{role}.md` capture named with the post-merge number; the test asserts `jd-capture.mjs` resolves it.

**Build.**

- [ ] **Step 1.** Write `tests/rrimport-tracker.test.mjs` cases `detects an RR CSV`, `closed with no reason lands Discarded`, `blank application date is never-submitted`, `screening lands Responded`, `saved goes to pipeline.md under the lock and skips a scan-history URL`, `zip import writes every sidecar under the merged number`, `a row folded into an existing one keys sidecars by the existing number`, `second run adds nothing`, `a rerun after a failed sidecar write completes it`, `jd capture resolves by number`. Run. Expect fail.
- [ ] **Step 2.** Implement. Run. Expect pass.
- [ ] **Step 3.** Commit `feat(tracker): import a Reactive Resume application export`.

**Migration step, operator only, not committed.**

- [ ] Export "everything" from `resume.matherly.net` to a zip. Run `node import-tracker.mjs --rr-zip <zip>` in `~/career-ops-data`, read the preview against the 58 existing rows, then `--confirm`. Expect the 8 rows from `jobs/applications.csv` to show as `tracked` or `import`, none duplicated.

**You see.**

- [ ] The preview prints one line per row with its outcome and the sidecar fields it will write, and `Nothing written. Add --confirm`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/rrimport-tracker.test.mjs` passes. Run `node test-all.mjs --only rrimport`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Three lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run `node import-tracker.mjs tests/fixtures/rr/applications.csv` at trunk and head. Save `preview-trunk.txt`, `preview-head.txt`. Pass when trunk reports `unknown-status` for closed rows and head does not.
- [ ] Lane 2. Import the zip fixture with `--confirm`, then `node verify-pipeline.mjs`. Save `verify.txt`. Pass when no error.
- [ ] Lane 3. Run it again. Save `second.txt`. Pass when zero rows import and zero sidecar rows are added.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of a 500-row CSV preview, RR's own import cap.
- [ ] Probe. A generated CSV, `time node import-tracker.mjs big.csv`. Trunk has the script, so measure trunk on the same rows with a Teal header.
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
- [ ] Create `web/src/lib/core/application-sidecars.mjs` (parsers for the two TSVs and `active-interviews.md`, the web's own copies in the `web/src/lib/core/` convention) and `web/src/lib/application-detail.ts` (joins them with `parseStatusLog`, contacts and follow-ups by number).
- [ ] Create `web/src/lib/board.mjs` (pure `groupByColumn(rows, meta)` and `nextStepLabel`).
- [ ] Create `web/src/lib/status-save.ts` (the drop rules over the existing `reduceHeldSave` from `web/src/lib/status-save-hold.mjs:11` and `applySavedStatus` from `web/src/lib/pipeline-status.mjs:15`; `pipeline-view.tsx` is not edited).
- [ ] Create `web/src/app/api/app-meta/route.ts` (POST lane or tag, runs `app-meta.mjs set`).
- [ ] Edit `web/src/lib/nav-items.ts` to add `{ href: "/board", label: "Board", icon: SquareKanban }`.
- [ ] Create `web/tests/lib/next-step.test.mjs`, `web/tests/lib/application-sidecars.test.mjs`, `web/tests/lib/board.test.mjs`, `web/tests/lib/status-save.test.mjs`.
- [ ] Edit the deviations table.

**Interfaces.**

- Consumes the two TSV formats from PR-08, `PIPELINE_TABS` and `rowOnPipelineTab` from `web/src/lib/pipeline-navigation.mjs`, and `POST /api/status` with `{ n, status }`.
- Produces columns for the ten stage tabs (not INBOX, ALL, OTHER), each card showing company, role, score, days in stage, and the next-step label from `nextStep(app, events, interviews, now)`. Drag uses native HTML5 `draggable` with `dragstart` and `drop`, and a keyboard path (focus a card, press `m`, choose a column). A drop onto the same column does nothing and writes nothing. A drop onto another posts `/api/status`; a 503 (the route's mapping of `set-status.mjs` exit 4) retries three times at 250 ms and then reverts with a toast. Both rules live in `status-save.ts`, unit-tested with a stubbed `fetch`. Lane is a sub-heading inside a column when the meta file has lanes.
- The sheet opens on card click and shows the status-log timeline merged with events, interviews, contacts, the follow-up pin, offer terms if any, and the report link.

**Build.**

- [ ] **Step 1.** Port `next-step.ts` cases to `web/tests/lib/next-step.test.mjs`. Run. Expect fail. Implement. Expect pass.
- [ ] **Step 2.** Write `application-sidecars.test.mjs` on fixture files. Implement the parsers and `application-detail.ts`. Expect pass.
- [ ] **Step 3.** Write `status-save.test.mjs` for `same column is a no-op` and `503 retries three times then reverts`. Implement `status-save.ts`. Expect pass.
- [ ] **Step 4.** Write `board.test.mjs` for `groupByColumn` (ten columns, lane sub-groups, OTHER rows excluded). Implement `board.mjs`. Expect pass.
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
- [ ] Lane 10. 300 rows. Save `many.png`. Pass when the board renders and a trace shows no long task over 100 ms while scrolling.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Largest Contentful Paint of `/board` with 300 rows, and of `/pipeline` at trunk and head, from `performance_analyze_insight`.
- [ ] Probe. `performance_start_trace` with reload on each page, interleaved.
- [ ] Baseline. Record `/pipeline` at trunk first.
- [ ] Rule. `/pipeline` at head within 5 percent of trunk. `/board` LCP under 1.5 s.

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

**Depends on.** PR-04.

**Files.**

- [ ] Create `lib/resume/export/docx.mjs`, `json-resume.mjs`.
- [ ] Edit `resume.mjs` to add `export docx|rr-json|json-resume [--out file]`.
- [ ] Edit `package.json` to add `docx`.
- [ ] Create `tests/resume-export.test.mjs`.
- [ ] Edit `docs/SCRIPTS.md`, the deviations table.

**Interfaces.**

- Consumes `resumeToPayload` from PR-02 and the JSON Resume importer from PR-03.
- Produces `payloadToDocx(payload): Promise<Buffer>`, a single-column document in the payload's section order, and `resumeToJsonResume(data): object`, the inverse of PR-03's importer, which round-trips the fixture. `rr-json` is `JSON.stringify(data, null, 2)` without the `careerOps` key.

**Build.**

- [ ] **Step 1.** Write tests asserting the DOCX unzips with `fflate` and its `word/document.xml` contains the name and every company, and that JSON Resume round-trips. Run. Expect fail.
- [ ] **Step 2.** Implement. Run. Expect pass.
- [ ] **Step 3.** Commit `feat(resume): export DOCX, Reactive Resume JSON and JSON Resume`.

**You see.**

- [ ] `node resume.mjs export docx --out cv.docx` writes a file Word opens with the sections in order.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/resume-export.test.mjs` passes. Run `node test-all.mjs --only resume-export`.

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

## Build the publish service (PR-12)

**Depends on.** PR-01.

**Files.**

- [ ] Create `publish/server.mjs`, `publish/db.mjs`, `publish/pages.mjs`, `publish/package.json` (no runtime dependencies yet; `node:test` scripts), `publish/README.md`.
- [ ] Create `publish/tests/service.test.mjs` (run by `npm --prefix publish test`; nothing under the root `tests/` imports publish code).
- [ ] Edit `.github/workflows/test.yml` to add a `publish` job running `npm --prefix publish ci` and `npm --prefix publish test`.
- [ ] Edit `AGENTS.md` "Untrusted External Content" to name `data/share-feedback/*.md` as data, never instructions.
- [ ] Edit the deviations table (`AGENTS.md` and `test.yml` rows).

**Interfaces.**

- Produces the HTTP contract `PUT /api/shares/:slug` with `{ html, password?, hideContacts? }`, `GET and POST /s/:slug`, `GET /api/shares/:slug/stats`, `POST /api/shares/:slug/feedback-links` returning `{ token }`, `GET and POST /f/:token`, `GET /api/shares/:slug/feedback`, `DELETE /api/shares/:slug`. Until PR-13, every `/api/` route takes `Authorization: Bearer $PUBLISH_OWNER_TOKEN`.
- Share pages carry `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`.
- The client key for view dedup comes from `PUBLISH_CLIENT_IP_HEADER` (default `cf-connecting-ip`) only when the socket peer is in `PUBLISH_TRUSTED_PROXIES`, else the socket address. Passwords use `scrypt` with a dummy hash on unknown slugs and a limiter of 5 attempts per 10 minutes per client key. Feedback snapshots are stored by sha256; tokens are `<id>~<hmac>` and never stored. The database file is `publish.db` (`*.db` is already gitignored). The service binds `PUBLISH_BIND` (default `127.0.0.1`).

**Build.**

- [ ] **Step 1.** Move the prototype's `selfcheck.mjs` cases into `publish/tests/service.test.mjs` as `node:test` cases against an in-process server on an ephemeral port, adding `rotating X-Forwarded-For from an untrusted peer counts one view`, `cf-connecting-ip from a trusted peer is the client key`, `six wrong passwords in ten minutes returns 429`, `a forged token and a random token both return 404 with identical bodies`, `an unknown slug and a wrong password return identical 401 bodies`. Run. Expect fail on the new cases.
- [ ] **Step 2.** Build the service with the hardening. Run. Expect pass.
- [ ] **Step 3.** Write `publish/README.md` (routes, env vars, the loopback default and why the proxy must be the only peer). Add the CI job.
- [ ] **Step 4.** Commit `feat(publish): add the publish service`.

**You see.**

- [ ] `npm --prefix publish test` prints every case passing, and `curl -i http://127.0.0.1:8080/s/missing` returns 401 with the password form.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `publish/tests/service.test.mjs` passes. Run `npm --prefix publish test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk lacks the feature. Upload a render of the example CV with curl and open `/s/<slug>` in Chrome. Save `share.png`, `console.txt`, `network.txt`. Pass when zero failed requests and zero console errors under the CSP.
- [ ] Lane 2. Password flow in Chrome. Save `password.png`. Pass when 401, then 303 and 200.
- [ ] Lane 3. Create a feedback link, open it in Chrome, post a comment, read `/api/shares/<slug>/feedback`. Save `feedback.png`, `feedback.json`. Pass when the comment is returned.
- [ ] Lane 4. Upload with `hideContacts: true`. Save `hidden.png`. Pass when no email, phone or LinkedIn text is on the page.
- [ ] Lane 5. Upload a different CV to the same slug. Save `frozen.png`. Pass when the old feedback link still shows the old HTML.
- [ ] Lane 6. Delete the share. Save `deleted.txt`. Pass when `/s/<slug>` is 404.
- [ ] Lane 7. Forged feedback token (valid id, wrong HMAC) and a random token. Save `forged.txt`. Pass when both are 404 with identical bodies.
- [ ] Lane 8. Slug enumeration. Request an unknown slug and a known slug with a wrong password. Save `enum.txt`. Pass when both are 401 with the same body and response times within 20 percent.
- [ ] Lane 9. Six wrong passwords in ten minutes from one client. Save `limiter.txt`. Pass when the sixth is 429 and a different client key is still 401.
- [ ] Lane 10. Upload HTML containing an inline `<script>` and an external image. Save `csp.png`, `console.txt`. Pass when the script does not run and the image request is blocked by the CSP.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. p50 and p99 of `GET /s/:slug` over 200 requests from 20 client keys.
- [ ] Probe. A 20-line node script with `fetch` and timing. Absolute budget.
- [ ] Baseline. Record the prototype's numbers first.
- [ ] Rule. p99 under 50 ms on loopback.

**Review gate.** None. PR-12 is not review-gated.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Add the share CLI (PR-12b)

**Depends on.** PR-12, PR-02.

**Files.**

- [ ] Create `publish/share.mjs` (the CLI, `publish | republish | stats | pull | delete`).
- [ ] Create `publish/tests/share-cli.test.mjs`.
- [ ] Edit `DATA_CONTRACT.md` to add `data/shares.json` and `data/share-feedback/`.
- [ ] Edit `publish/README.md`, the deviations table.

**Interfaces.**

- Consumes `inlineLocalFonts(html)` from `generate-pdf.mjs:2330`, `getCareerOpsRoot()` from `path-resolver.mjs`, `lib/dir-lock.mjs`, and `resume.mjs export payload --hide --hide-item` from PR-02.
- Produces `node publish/share.mjs publish --slug <s> (--html <file> | --from-studio <n> | --from-resume [--template name] [--hide section,...] [--hide-item id,...]) [--password p] [--hide-contacts]`, `republish --slug <s>` (re-renders from the stored source and overlay), `stats`, `pull` (writes `data/shares.json` and `data/share-feedback/{slug}.md`) and `delete --slug <s>`. The share record in `data/shares.json` stores slug, URL, source kind and reference, the hide overlay, whether a password is set, and the last pulled counters. `--from-resume` renders through `resume.mjs export payload` and `build-cv-html.mjs` with the template resolved by `cv-templates.mjs` and the style from `careerOps.style` through a temp profile, the way PR-05's route does. It refuses while `absorb` reports the gate failing, so a renamed item hidden by id cannot reappear in public. `--from-studio <n>` publishes the CV Studio edited output for report `n` when it exists, else the `output/` HTML. `--hide-contacts` removes `.contact-row` and `mailto:` and `tel:` links. A local photo path is inlined to a data URL. Until PR-13 the CLI sends `PUBLISH_OWNER_TOKEN`; after it, `PUBLISH_API_KEY`, both read from the data root's `.env`, never argv.

**Build.**

- [ ] **Step 1.** Write `publish/tests/share-cli.test.mjs` in a temp root against an in-process server asserting `publish --html` then `pull` change only the two data files, `--from-resume --hide education` produces HTML without the education section, `--from-resume` refuses when the gate fails, `republish` reapplies the overlay, and `delete` removes the record. Run. Expect fail.
- [ ] **Step 2.** Implement. Run. Expect pass.
- [ ] **Step 3.** Commit `feat(publish): add the share CLI`.

**You see.**

- [ ] `node publish/share.mjs publish --slug jason --from-resume --hide education --password x` prints the URL and `node publish/share.mjs pull` prints `views 0 comments 0`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `publish/tests/share-cli.test.mjs` passes. Run `npm --prefix publish test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Four lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk (PR-12 head) has curl uploads only. Publish the example with `--html` and open it. Save `share.png`. Pass when identical to PR-12 lane 1.
- [ ] Lane 2. Publish `--from-resume --hide education` and open it. Save `hidden-section.png`. Pass when education is absent on the page and present in `cv.md`.
- [ ] Lane 3. Change an entry's company in `cv.md`, run `republish`. Save `refused.txt`. Pass when the CLI exits 3 and the page is unchanged.
- [ ] Lane 4. Post a comment on a feedback link, run `pull`. Save `open.md`. Pass when the comment lands in `data/share-feedback/<slug>.md` and nothing else in the root changed.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of `publish --from-resume` end to end.
- [ ] Probe. `time node publish/share.mjs publish --slug t --from-resume`, five runs. Absolute budget.
- [ ] Baseline. Record `resume.mjs export payload` plus `build-cv-html.mjs` times.
- [ ] Rule. Median under their sum plus 500 ms.

**Review gate.** None. PR-12b is not review-gated.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Add Better Auth to the publish service (PR-13)

**Depends on.** PR-12b.

**Files.**

- [ ] Create `publish/auth.mjs`, `publish/.env.example`.
- [ ] Edit `publish/package.json` to add `better-auth` and `@better-auth/api-key` pinned `~1.7.14` (the newest npm's 7-day release-age policy allowed on 2026-11-06; bump when a newer 1.7 clears it) and the `auth` CLI as a dependency so `npx auth migrate` works offline in the image.
- [ ] Edit `publish/server.mjs` to mount `toNodeHandler(auth)` under `/api/auth/` before any body parsing; to verify `x-api-key` with `verifyApiKey({ body: { key, permissions } })` on every `/api/` route, requiring `share: ["upload"]` for `PUT` and `share: ["manage"]` for stats, feedback, feedback-links and delete, and stripping the header before any cookie lookup; and to require a cookie session plus `isTrustedOrigin` on the account page only.
- [ ] Create `publish/pages/account.mjs` (sign in with Pocket ID, create a key with both permissions, list and revoke keys; key creation requires a session under 24 hours old).
- [ ] Edit `publish/share.mjs` to send `x-api-key` from `PUBLISH_API_KEY`.
- [ ] Create `publish/tests/auth.test.mjs`.
- [ ] Edit `publish/README.md`, the deviations table.

**Interfaces.**

- Produces `createAuth({ db: DatabaseSync, baseURL, secret, pocketId: { clientId, clientSecret, discoveryUrl }, allowedEmails: string[] })` returning the Better Auth instance with `genericOAuth` (`providerId: "pocket-id"`, `disableSignUp: true`), `apiKey` (session mocking off, `rateLimitMax: 1000`, `rateLimitTimeWindow: 3600000`, key prefix `cops_`), `user.validateUserInfo` rejecting emails outside `allowedEmails`, `emailAndPassword` unset, `telemetry.enabled: false`, `account.encryptOAuthTokens: true`, rate limiting enabled with `storage: "database"`, `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip"]`, `trustedOrigins: [baseURL]`.
- The migration command is `npx auth migrate --config publish/auth.mjs --yes`, documented in the README and run on container start.

**Build.**

- [ ] **Step 1.** Write `publish/tests/auth.test.mjs` with cases `upload without a key is 401`, `a key with share:upload uploads`, `a key with only share:upload cannot pull stats`, `a key with share:manage pulls, lists feedback and deletes`, `a bad key does not crash the server`, `x-api-key alone cannot create another key`, `the account page without a session is 401`, `validateUserInfo rejects an email outside the allow-list and accepts one inside`. Run. Expect fail.
- [ ] **Step 2.** Implement. Run. Expect pass. Run `publish/tests/share-cli.test.mjs` with a key. Expect pass.
- [ ] **Step 3.** Commit `feat(publish): add Better Auth with Pocket ID and API keys`.

**You see.**

- [ ] `curl -H "x-api-key: cops_..." -X PUT .../api/shares/me` returns 201 and the same without the header returns 401.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `publish/tests/auth.test.mjs` and `publish/tests/share-cli.test.mjs` pass. Run `npm --prefix publish test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Four lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Rerun PR-12b lane 1 at head with a key. Save `share.png`. Pass when identical.
- [ ] Lane 2. Operator step. Sign in through the real Pocket ID client, create a key, paste it into `.env`, publish and pull. Save `account.png`. Pass when both work and a second account email is refused.
- [ ] Lane 3. 1001 uploads with one key in an hour. Save `budget.txt`. Pass when the last is 429.
- [ ] Lane 4. Boot with Pocket ID unreachable. Save `boot.txt`. Pass when the service serves shares and sign-in reports the provider unavailable.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Upload latency with key verification, p50 over 50 uploads, against PR-12b's token path.
- [ ] Probe. The same loop at PR-12b head and PR-13 head.
- [ ] Baseline. Record PR-12b first.
- [ ] Rule. Within 30 ms of PR-12b.

**Review gate.** None. PR-13 is not review-gated.

**Merge.**

- [ ] Every Verify box above checked with its evidence at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current `main` after verification.
- [ ] The operator merges.

---

## Add the shares page to the web app (PR-14)

**Depends on.** PR-12b.

**Files.**

- [ ] Create `web/src/app/shares/page.tsx`, `loading.tsx`.
- [ ] Create `web/src/components/shares/shares-view.tsx`.
- [ ] Create `web/src/app/api/shares/pull/route.ts` (runs `node publish/share.mjs pull`).
- [ ] Edit `web/src/lib/nav-items.ts` to add `{ href: "/shares", label: "Shares", icon: Share2 }`.
- [ ] Create `web/tests/lib/shares.test.mjs`.
- [ ] Edit the deviations table.

**Interfaces.**

- Reads `data/shares.json` and `data/share-feedback/*.md` through `careerOpsRoot()`. Shows slug, URL, source, overlay, password set or not, views, comments, last pulled, and a Pull button. Publishing stays in the CLI, because the API key never enters the web process. Comment markdown renders as text.

**Build.**

- [ ] **Step 1.** Write `web/tests/lib/shares.test.mjs` for the `shares.json` reader and the pull route with `runCoreCli` stubbed. Implement. Expect pass.
- [ ] **Step 2.** Build the page. `npm run typecheck`.
- [ ] **Step 3.** Commit `feat(web): add the shares page`.

**You see.**

- [ ] The page lists each share with its counts and Pull refreshes them.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `web/tests/lib/shares.test.mjs` passes. Run `cd web && npm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Six lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk lacks the page. Open `/shares` with two shares. Save `shares.png`. Pass when both rows show.
- [ ] Lane 2. Click Pull after a view. Save `pulled.png`. Pass when the count updates.
- [ ] Lane 3. A share with comments. Save `comments.png`. Pass when the markdown renders as text, not HTML.
- [ ] Lane 4. No `shares.json`. Save `empty.png`. Pass when the empty state names the CLI command.
- [ ] Lane 5. Service down, Pull. Save `down.png`. Pass when an error toast appears and the page stays.
- [ ] Lane 6. A comment containing `<script>`. Save `xss.png`. Pass when it renders inert.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Largest Contentful Paint of `/shares` with 50 shares, from `performance_analyze_insight`.
- [ ] Probe. `performance_start_trace` with reload. Absolute budget.
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

- [ ] Create `publish/Dockerfile` (Node 24 pinned by digest, `npm ci --omit=dev` in `publish/` with the `auth` CLI among the runtime dependencies, runs the migration then the server, one volume for `publish.db`).
- [ ] Create `publish/compose.yml` (publishes `127.0.0.1:8080:8080` only; the tunnel or cluster Service is the only public path).
- [ ] Create `tests/publish-image.test.mjs` (reads the Dockerfile and compose file only, no publish dependencies).
- [ ] Edit `.github/workflows/docker-image.yml` to also build and push `ghcr.io/jrmatherly/career-ops-publish`.
- [ ] Edit `publish/README.md` with the environment variables and the Pocket ID callback `https://<host>/api/auth/callback/pocket-id`.
- [ ] Edit the deviations table.

**Interfaces.** Produces the image the home-cluster manifests reference. The manifests themselves are a follow-up in `~/dev/home-cluster`, outside this plan.

**Build.**

- [ ] **Step 1.** Write `tests/publish-image.test.mjs` asserting the Dockerfile `FROM` carries an `@sha256:` digest, the entrypoint runs the migration before the server, and the compose file binds only `127.0.0.1`. Run. Expect fail. Write the files. Expect pass.
- [ ] **Step 2.** Build the image locally, run with compose, run PR-12 lanes 1 and 2 against it. Save the log.
- [ ] **Step 3.** Commit `build(publish): package the publish service`.

**You see.**

- [ ] `docker compose -f publish/compose.yml up` prints the migration summary and `listening on 127.0.0.1:8080`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/publish-image.test.mjs` passes. Run `node test-all.mjs --only publish-image`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk lacks the image. Run the compose stack and PR-12 lanes 1 and 2 against it. Save `compose.txt`. Pass when both pass.
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

Three throwaway prototypes under the session scratchpad settled the architecture before this plan was written. None is committed.

**Publish service** (`arch/proto/`, `server.mjs` 120 lines, `share.mjs` 61 lines, `selfcheck.mjs` 99 lines, run 2026-11-06). All five claims passed. A render of the example CV through `build-cv-html.mjs` (113 ms, positional arguments `<input.json> <output.html> [template.html]`) with fonts inlined loaded in Chrome under `default-src 'none'` with zero failed requests and an empty console. Wrong password 401, right password 303 with an HMAC cookie, cookie 200, password change invalidated the cookie, unknown slug 401 through a dummy scrypt hash. Two clients at 10 requests each counted 2 views, owner and Googlebot counted 0, 50 parallel distinct keys counted exactly 50 more. A feedback link rendered a frozen snapshot, took a comment, survived a republish byte-identical, and `pull` changed only `data/shares.json` and `data/share-feedback/open.md`. Hide-contacts removed `.contact-row`, `mailto:` and `tel:`. Unproven and carried into PR-12 as requirements. Views across several processes (run one process), proxy-only trust of the client IP header, a rate limit on the password form, `dir-lock` on `shares.json`, and which artifact is published. Found in passing, the default template writes `{{PHOTO}}` into two CSS comments, so a photo is duplicated. That is an upstream bug to report separately.

**Better Auth** (`auth/proto/`, better-auth 1.7.14 and `@better-auth/api-key` 1.7.14 on Node 24.22.2, run 2026-11-06). `npx auth migrate` created the five tables on `node:sqlite`. `/api/auth/ok` returned `{"ok":true}`. `auth.api.createApiKey` made a key, `x-api-key` and a signed cookie both resolved through `getSession`, and a `/forward-auth` route returned 200 with user headers for a valid cookie and 401 for a tampered one. Three findings changed the design. An invalid key makes `getSession` throw and crashed the first server. With session mocking on, a bare key created another key. The default key budget is 10 requests per day. Unproven. A real Pocket ID round trip, 2FA and passkeys, and any gateway configuration. npm's `min-release-age=7` policy kept the prototype on 1.7.14 while 1.7.18 was latest.

**Absorb** (`canon/absorb.mjs`, run 2026-11-06 on Reactive Resume's sample with a two-role company and a hidden entry added). A no-op round trip was deep-equal and byte-identical. A changed bullet, an added bullet with bold and a link, a deleted bullet, a summary reword, a skill keyword edit, an `add-entry.mjs`-shaped project insert and an edit inside a hidden entry all absorbed and regenerated byte-identical. Three cases did not, and each became a PR-02 requirement. An appended job landed before a custom section (insert at the parsed position). A retitled entry became an orphan plus a new entry under the prototype's company-plus-title-plus-dates key (the plan uses `cv-title-check.mjs`'s company-plus-dates key, so a retitle is a changed entry). An en dash typed into a date was lost (keep the raw period text). The upstream parsers found the same six entries in the generated `cv.md`, and anchor comments were rejected because `career-profile.mjs import` reads them as headings. Unproven. Absorbing a hand-written `cv.md` in `examples/cv-example.md` shape with no prior JSON, which PR-02's `cvStyle` record and `adopt` command are designed for, and generation of the sections the prototype's generator omitted (contact lines, certifications, languages, interests, publications, volunteer, references).

## Appendix B. Alternatives rejected

- **Postgres as the store, as Reactive Resume does.** Two write paths, every writer script mirrored, and "markdown is the source of truth" stops being true. Rejected in the first question round.
- **`resume.json` as the canonical file with the modes redirected.** At least eleven upstream files change, among them `modes/expand.md`, and every future upstream writer of `cv.md` reintroduces silent loss. The absorb design costs zero upstream writers and turns every lossy case into a visible refusal.
- **A dual model with a hash guard and an Overwrite button.** One click deletes facts a mode added.
- **Extending `career-profile.yml` into the model.** Its facts need `cv.md` line evidence and its ids are content hashes that change on every edit.
- **Request-scoped data roots inside the Next.js app for multi-user.** 103 `careerOpsRoot()` call sites in 49 files, process-global write token and headed browser, agent tool grants by name not path, and 411 web commits upstream in 90 days. Not a security boundary and a permanent merge conflict.
- **Publishing through the operator's Reactive Resume instance.** Smallest build, but sharing stays in a second product. Rejected by the operator.
- **A Better Auth forward-auth service for container-per-user.** No prior art, you own the tenant check, Envoy drops cookies by default. Envoy Gateway's native OIDC against Pocket ID is the path if a second hosted user ever appears.
- **Porting Reactive Resume's 18 templates.** They are React components on the Forme engine with `react-reconciler` and `harfbuzzjs`. career-ops's eight HTML templates gain the design vocabulary instead.
- **Storing the template name in RR's `metadata.template`.** It is an enum of RR template names with `.catch("onyx")`, so a career-ops name would parse back to `onyx`. The root is a loose object, so `careerOps.template` holds it.
- **Adding states or columns to `applications.md` for lanes and closed reasons.** About ten pinned test files, two web lists, the Go parity tests and the funnel definitions. Sidecars cost none of that.
- **Adding `--write` to `ics-interview.mjs`.** Its header promises it never writes `data/active-interviews.md`. A fork-local `interview-round.mjs` keeps that promise.
- **Reusing `followup-seed.mjs` for RR follow-up dates.** Its `--date` is the apply date the cadence counts from, and it refuses rows that are not Applied. A pin-line writer is the right shape.
- **Editing `pipeline-view.tsx` to extract the save hook.** `reduceHeldSave` and `applySavedStatus` are already separate modules, so the board reuses them and the 1050-line view stays untouched.
- **A drag-and-drop dependency for the board.** Native HTML5 drag with a keyboard path covers the one interaction.
- **Running publish tests from the root `tests/`.** They would import `publish/node_modules`, which the root install does not have, and fail CI. They live in `publish/tests/` with their own job.
- **ODT export, PDF import, account trash, the AI coach and discovery scheduler, the mobile app, CSV export of the board, `.ics` export per interview.** Out of scope, each a possible later program.

## Appendix C. Risks

- **The gate is the whole safety story** (PR-02). A section the generator omits becomes a fact that lives only in JSON, which is the canonical-JSON design by accident. `tests/resume-gen.test.mjs` asserts every editor-editable section is emitted, and the owner adds a case whenever the editor gains a field.
- **First adoption** (PR-02, PR-06b). A `cv.md` outside the parseable shape fails the gate until the user confirms `adopt`. The diff is shown first, a backup is kept, and nothing else writes `cv.md` from JSON.
- **`cv.md` drift** (PR-02). A mode such as `add`, `expand`, `intake` or `interview` writes `cv.md` directly, as upstream intends. The next `absorb` folds the change into `resume.json`. A changed company or date stops the editor and every export until the user pairs or edits.
- **Vendored TypeScript** (PR-02, PR-03, PR-04). The port is a one-time conversion, so upstream Reactive Resume fixes do not flow in. `THIRD_PARTY_NOTICES.md` records the clone SHA so a re-port has a base.
- **Template edits and the visual suite** (PR-05). Nine templates change. The golden fixture test and the Playwright baselines guard it. The suite runs in the cv-visual image; a local run can differ by fonts and is a warning, not a verdict.
- **Upstream files this program edits.** About fifteen upstream files diverge over the program, among them `AGENTS.md`, `DATA_CONTRACT.md`, `doctor.mjs`, `tracker-utils.mjs`, `import-tracker.mjs`, `theme-style.mjs`, `build-cv-html.mjs`, `lib/cv-payload-schema.mjs`, nine templates, `modes/pdf.md`, `package.json`, `nav-items.ts`, `test.yml` and `docker-image.yml`. Each gets a deviations row the day it lands, and the owner keeps every edit additive (new keys, new rows, new attributes) so upstream hunks merge as `~`, keep ours.
- **Shared append-only files** (every PR). Several owners add lines to the same files. Owners rebase on conflict and never reorder.
- **The publish service is internet-facing** (PR-12 to PR-15). The public surface is script-free HTML, a password form and a comment form. The owner keeps the CSP, the proxy-only IP trust, the limiters, the loopback bind and the untrusted-feedback rule, and never routes the dashboard through it. Better Auth's `ipAddressHeaders` trusts the header whatever the peer, so the bind and the tunnel are what make it safe.
- **Secrets** (PR-13). `BETTER_AUTH_SECRET`, the Pocket ID client secret and API keys live only in `.env` files and Kubernetes Secrets. The pre-commit hook refuses new gitignored files, and `no-user-data.yml` runs on push.
- **Migration against real data** (PR-03, PR-09). Both steps are dry-run first and never committed. The owner diffs the generated `cv.md` before `--confirm --replace-cv`.
- **Node version** (PR-12, PR-15). `node:sqlite` is Release Candidate. The image pins Node 24 by digest.

## Appendix D. Links and reading list

Read before editing.

- `docs/superpowers/specs/2026-11-06-reactive-resume-convergence.md`, the spec.
- `AGENTS.md` Data Contract, Source-of-Truth Boundary, Untrusted External Content, Pipeline Integrity, TSV Format.
- `DATA_CONTRACT.md`, `.claude/rules/dev-workflow.md`, `.claude/skills/upstream-review/SKILL.md` Deviations decided.
- `lib/cv-markdown.mjs` (`normalizePandocLine` at line 56, `EXPERIENCE_HEADING_RE`), `cv-title-check.mjs` (`matchKey` at line 208, `parseCvExperience`), `examples/cv-example.md`, `tracker-utils.mjs` (`replaceUserFile` at 823, `appendLedgerRows` at 870, `acquireTrackerLock`, `trackerLockDirFor`).
- `lib/cv-payload-schema.mjs`, `build-cv-html.mjs` (usage at 1106, `PROFILE_PATH` at 58), `theme-style.mjs:39-71`, `cv-templates.mjs` (`listTemplates` at 228, `resolveTemplate` at 755), `generate-pdf.mjs:2330` (`inlineLocalFonts`), `path-resolver.mjs` (`CAREER_OPS_PROFILE`).
- `import-tracker.mjs` (`COLUMN_ALIASES` at 59, `normalizeUrl` dedup at 222 and 236, merge at 345-370), `set-status.mjs`, `merge-tracker.mjs`, `pipeline-lock.mjs` (`withPipelineLock`), `contact-extract.mjs:153` (`appendContact`), `followup-cadence.mjs` (`OVERRIDE_RE`), `funnel-velocity.mjs:88` (`VALID_SOURCES`), `templates/states.yml`, `modes/offer-prep.md:65`.
- `web/src/lib/career-ops.ts`, `web/src/lib/core-cli.ts`, `web/src/lib/core/` (the web's own parser copies), `web/src/lib/cv-write.mjs` (`decideCvWrite`), `web/src/lib/claude-invocation.mjs`, `web/src/lib/pipeline-navigation.mjs`, `web/src/lib/status-save-hold.mjs`, `web/src/lib/pipeline-status.mjs`, `web/src/app/api/status/route.ts`, `web/src/app/api/cv/route.ts`, `web/src/components/cv-studio/cv-preview.tsx`, `web/src/lib/nav-items.ts`, `web/src/proxy.ts`, `web/src/lib/origin-guard.mjs`.
- `test-all.mjs` (`--only` at 714, the cv-visual exclusion at 170), `package.json` (`test:cv-visual`), `.github/workflows/test.yml`.
- Reactive Resume clone at `d065a9f7`. `packages/schema/src/resume/data.ts` (`metadata.template` catch at 763, loose root at 816), `packages/import/src/`, `packages/resume/src/ats/rules.ts` (`templateLayouts` import at 12, score at `index.ts:123`), `packages/schema/src/applications/{data,lanes,next-step,csv}.ts`, `packages/db/src/schema/applications.ts`, `packages/auth/src/config.ts:699-1198`, `packages/api/src/context.ts:62-104`.
- Better Auth. https://better-auth.com/docs/adapters/sqlite, https://better-auth.com/docs/plugins/generic-oauth, https://better-auth.com/docs/plugins/api-key/advanced, https://better-auth.com/docs/reference/security, https://better-auth.com/docs/concepts/rate-limit.
- The 23 Check rule ids. Contact `MISSING_NAME`, `MISSING_EMAIL`, `MALFORMED_EMAIL`, `MISSING_PHONE`, `MISSING_LOCATION`, `MALFORMED_URL`, `PICTURE_PRESENT`. Dates `EMPTY_PERIOD`, `UNPARSEABLE_PERIOD`, `UNPARSEABLE_DATE`, `REVERSED_PERIOD`, `FUTURE_DATED_PERIOD`. Layout `SECTION_MISSING_FROM_LAYOUT`, `MULTI_COLUMN_PROSE_SECTION`, `PROSE_SECTION_IN_SIDEBAR`, `TWO_COLUMN_LAYOUT`, `SMALL_BODY_FONT`, `TIGHT_LINE_HEIGHT`, `TIGHT_PAGE_MARGINS`. Headings `NO_VISIBLE_EXPERIENCE`, `NON_STANDARD_SECTION_TITLE`. Writing `MISSING_EXPERIENCE_DESCRIPTION`, `FRAGMENTED_ENTRY`.
- PR-02, PR-10 and PR-12 get `<jstack>/skills/how/SKILL.md` grounding before code. PR-12 and PR-13 get `<jstack>/skills/interrogate/SKILL.md` on the security design. The decision trail for this program is `private/decisions-rr-merge.tsv`, kept per `<jstack>/skills/show-me-your-work/SKILL.md`.
