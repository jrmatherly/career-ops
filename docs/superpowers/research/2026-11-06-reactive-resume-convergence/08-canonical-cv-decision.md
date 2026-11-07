# Canonical CV: cv.md vs data/resume.json (design D)

Subagent research report, 2026-11-06. Model output: claims carry file:line evidence or are labelled inference; verify against the code before relying on one.

# Canonical CV: cv.md vs data/resume.json

I could not save `report.md`: the harness refused report files from subagents. The prototype artifacts are saved. They are `absorb.mjs`, `absorb.out`, `sample.json`, `gen-cv.md` and `gen-cv-anchored.md`, all in `/private/tmp/claude-501/-Users-jason-dev-career-ops/9d4e3414-0fa5-470a-ad4f-a6db69a9b9c4/scratchpad/canon/`.

## Overview

My recommendation is design (D). cv.md stays the one canonical fact file. data/resume.json becomes a derived sidecar that holds what cv.md cannot (ids, hidden flags, links, design, structured dates, role grouping). A reverse parser absorbs every cv.md change into resume.json before the editor shows it. The editor never saves resume.json unless a lossless gate passes. Under D, no upstream file has to change. Upstream already uses the same pattern for its own structured CV model: `data/career-profile.yml` is built from cv.md and is explicitly not a primary source (modes/master-profile.md:123). I ran a throwaway prototype on the RR v6 sample. A no-op round trip came back byte-identical. Bullet edits, inserts and deletes, a new job, an `add-entry.mjs` project insert, a hidden-entry edit, a summary reword and a skill edit were all absorbed. The one real failure is a retitled entry. It comes back as a new item plus an orphan, and the gate catches it, as it must.

## Key Concepts

- **Primary file.** AGENTS.md:37-39 lists `cv.md` first among the "ground truth for facts" files. AGENTS.md:507 says "`cv.md` in project root is the canonical CV". The fact gate reads `cv.md` and `article-digest.md` by default (verify-cv-facts.mjs:40).
- **Sanctioned writers.** modes/_shared.md:247 says that "Only `add`, `expand`, `intake` and `interview` write `cv.md`, after the user confirms the exact change". The web editor and onboarding are the other two writers (see the next section).
- **Master Career Profile.** `data/career-profile.yml` is a fact index whose evidence points back at cv.md lines. It is not a CV model.
- **Upstream CAS.** The web save path already refuses a write whose base text does not match disk (web/src/lib/cv-write.mjs:29-38).

## How It Works

### 1. Every writer of cv.md

| Writer | What it writes | How | Gate |
|---|---|---|---|
| `add-entry.mjs` (upstream) | One markdown block under a `## Section`. A missing section is created at the end. | Insertion only (`insertIntoCvSection`, add-entry.mjs:140-152). Whole-file replace through `replaceUserFile` (:369-371) under a dir lock (:347-351). Dedup by key (:129). | The mode confirms first. The script writes on any non-`--dry-run` call. |
| `modes/add.md` | Calls add-entry.mjs. | Insertion | "Confirm before write" (add.md:10). An unattended run writes nothing (:18). |
| `modes/expand.md` | Calls add-entry.mjs (cv entries, digest bullets). | Insertion only. "Under no circumstances should existing CV sections be deleted or overwritten" (expand.md:7). It never edits a cv.md line (:135, :150). | Approval table (:127). |
| `modes/intake.md` | Field edits, including removals as proposals. | Free agent edit: "Apply the confirmed edits ... directly (agent edit ... no script writes them)" (intake.md:122-124). Never a silent overwrite (:104). A removal is a proposal (:109-112). | Explicit confirm (:115-118). `intake.mjs` never writes cv.md (intake.mjs:10). |
| `modes/interview.md` | Rewrites the summary and project bullets, appends skills (interview.md:61). | Free agent edit. The only writer that rewrites existing lines. | Per-file current-vs-new confirm (:59). |
| AGENTS.md onboarding Step 1 | Creates cv.md (AGENTS.md:253). | Whole file, agent. | Conversational |
| Web `POST /api/cv` | Whole file. | `atomicWriteWithBackup` (api/cv/route.ts:44-45). | CAS: `expected.content` must equal disk, else 409 (cv-write.mjs:29-38). Called from cv-editor.tsx:64 and cv-ingest.tsx:239. |
| Web `/api/cv/ingest` | Nothing. It is a proposer. The write then goes through POST /api/cv (ingest/route.ts:20-24). | n/a | Propose, then confirm. |
| `career-profile.mjs` | Writes `data/career-profile.yml` only (career-profile.mjs:299-300). | Additive merge | `--review` |
| `cv-sync-check.mjs`, `github-evidence.mjs`, `scaffolder` | Never write cv.md (cv-sync-check.mjs:4-10, expand.md:116, scaffolder/bin/cli.mjs:5). | | |
| Web CV Studio | Writes `output/*-edited.html` and an edits JSON, not cv.md (cv-studio/server.ts:143, :202). | | |

Out-of-repo writer. `~/dev/job-search/tools/build_cv_md.py` already regenerates cv.md wholesale from the RR export, with no guard. That is design (C) without the hash.

Localized mode dirs carry no add, expand, intake or interview variants (`ls modes/*/` found none), so this writer set is complete. Inference: the web assistant's write workers run these same modes and add no new writer contract.

### 2. Master Career Profile

- **Direction.** It runs cv.md to profile, never the reverse. Each fact carries `evidence: {source, line, quote}` from cv.md (career-profile.mjs:76-79). The validator rejects a fact without a positive line and a quote (lib/career-profile.mjs:20-22).
- **Upstream stance.** "Treat the Profile as a reviewed selection index, not an additional primary source" (master-profile.md:123). Profile text must not be passed as a new source to make a failing fact gate pass (:126). The workflow never discards or rewrites cv.md (:24-25). `prepare-cv` swaps only bullets, with verbatim verified fact text (:87-90).
- **Not an entry model.** It stores `label` plus `facts`, with no company, title, dates, hidden flag or design. Its ids are content hashes of kind, source, parent and text (career-profile.mjs:45-50), so they change whenever the text changes. Its parser also misreads the cv-example layout. Observed: `career-profile.mjs import gen-cv.md` turned the bold title line and the dates line into separate "experiences heading" entities.
- **Answer.** Upstream treats cv.md as the source that structured data is derived from, not as derivable from a structured source. resume.json should not replace or extend career-profile.yml (option E). E would need facts without cv.md evidence, which breaks `validate`. It would also need identity that survives edits, which its hash ids cannot give, and it would contradict the "selection index" design. The two files are siblings, both derived from cv.md. career-profile.yml selects verified facts, and resume.json carries presentation and identity.

### 3. What cv.md can and cannot carry

`lib/cv-markdown.mjs` is the shared reader. doctor.mjs:23, verify-cv-structure.mjs:50, jd-skill-gap.mjs:34, cv-title-check.mjs:66 and web base-cv.mjs all use it.

Recoverable:
- Experience sections by heading name (`EXPERIENCE_HEADING_RE`, `findExperienceSections`).
- `### Company -- Location[ · descriptor]` (`parseCompanyHeading`).
- A whole-bold title line, then a dates line (cv-title-check.mjs:93-136, which already keys entries on company plus dates).
- Bullets and the summary (base-cv.mjs:21-40).
- Skills as `- **Group:** a, b` and projects as `- **Name** (...) -- text` (examples/cv-example.md).
- Bold and links inside bullets. Observed in S2: `**CI**` and `[docs](url)` round-tripped exactly.

Not recoverable:
- Ids, `hidden`, `website` objects.
- Structured `dates`. RR writes `period` from `dates` on every save (rr data.ts:185), and cv.md has only the text.
- `roles[]` grouping, which flattens to repeated `### Company` entries.
- Skill `level`, `proficiency` and `icon`. `customSections` titles and icons. `picture`, `metadata` and design.
- Rich text beyond bold, italic and link. Rewritten bullets become `<li><p>…</p></li>`.
- Cosmetic edits that `normalizeDates` folds away (cv-title-check.mjs:195-202).

## Prototype (D): observed

`sample.json` was generated from RR `sample.ts` plus `default.ts` by type stripping. Nothing from the clone is imported at runtime. I enriched it with a two-role company (a lead `<p>` and an inline link) and a `hidden:true` entry. The prototype parses with `lib/cv-markdown.mjs`, keys entries on normalized company, title and `normalizeDates(period)`, aligns bullets by LCS and keeps the original `<li>` HTML for unchanged bullets.

| Scenario | Absorbed as | `gen(absorbed) == edited cv.md` |
|---|---|---|
| S0 no edit | nothing. The JSON is deep-equal to the input. | yes |
| S1 change a bullet | `{kept:4, changed:1}`. Only `items.0.description` changed. | yes |
| S2 add a bullet with bold and a link | `{kept:1, added:1}` on role r2 | yes |
| S3 append a new job | ADD with a new id, `hidden:false`, empty website | **no** (the new item lands ahead of the customSection entry) |
| S4 `add-entry.mjs insertIntoCvSection` project | proj ADD | yes |
| S5 retitle "Senior Game Developer" | ADD a new item plus ORPHAN of the old one. The id, website and dates are detached. | **no** (a duplicate entry) |
| S6 edit a bullet of the hidden entry | EDIT. `hidden:true` is preserved. | yes |
| S7 reword the summary | `<p>` rewritten | yes |
| S8 en dash in a date | nothing. The cosmetic edit is lost. | **no** |
| S9 delete a bullet | `{removed:1}` | yes |
| S10 change skill keywords | `keywords.2` changed | yes |

Upstream parsers on the generated cv.md:
- `cv-title-check` found 6 entries and `verify-cv-structure` found 6. That equals the 6 flattened roles.
- With `<!-- rr:id -->` anchor comments, those two still found 6. `career-profile import` grew from 63 to 69 candidates, because each anchor became an "experiences heading". Anchors in cv.md are therefore out. Identity must live in resume.json and be matched by key.

**What round-trips.** Every content edit that keeps an entry's company, title and dates.

**What breaks.** Renames of those three fields, the position of new entries, and cosmetic normalizations. All three show up as `gen(absorbed) != cv.md`, so a gate can detect every one of them. None is silent.

## Where Things Live

| Path | Role |
|---|---|
| `cv.md` | Canonical facts (AGENTS.md:39, :507). |
| `data/career-profile.yml` | Upstream, derived fact index (master-profile.md:123). |
| `data/resume.json` (proposed) | Derived sidecar, user layer. Records `meta.cvSha256` of the cv.md it was absorbed from. |
| `lib/cv-markdown.mjs`, `cv-title-check.mjs` `parseCvExperience` | Parsers to reuse, not fork. |
| `web/src/lib/cv-write.mjs` `decideCvWrite` | The CAS the editor's cv.md save goes through. |
| Proposed fork-local new files | `resume-sync.mjs` (gen, absorb, gate), a web route and the editor page. New files only, with deviation rows for the ones inside shipped dirs. |

## Gotchas

- **Rename is D's fact-loss vector.** S5 duplicates the entry. Auto-deleting orphans would instead drop the entry's id, hidden flag, link and dates. Never auto-delete or auto-pair an orphan.
- **interview mode is the one sanctioned rewriter** (interview.md:61), so it is the likeliest source of S5-type drift.
- **First adoption.** A cv.md not in cv-example shape (Pandoc, extra sections) fails the gate once. The user accepts a normalized cv.md one time, shown as a diff.
- **gen must cover every editable text field.** Phone, headline, certifications, languages and volunteer, if the editor edits them, must be emitted to cv.md. Otherwise they become facts that live only in resume.json, which is (A) by accident. The prototype's gen covers only summary, experience, projects, education and skills.
- **RR "hidden" does not hide from career-ops.** cv.md includes hidden items on purpose (build_cv_md.py:5), so the evaluator and the tailored PDF still see them.
- **Prototype limits.** S3 ordering and S8 period text are fixable: insert at the parsed position, and copy the raw period when the key matches but the text differs.

## Recommendation

| | A: json canonical | B: cv.md only, json export | C: dual with hash guard and Overwrite | D: cv.md canonical, json absorbed | E: extend career-profile.yml |
|---|---|---|---|---|---|
| Agent contract | Changes. Agents edit JSON with HTML strings, then regenerate cv.md for the fact gate (verify-cv-facts.mjs:40). | Unchanged | Unchanged | Unchanged | Breaks the "selection index" rule (master-profile.md:123) |
| Upstream files changed | At least 11: modes add, expand, intake, interview and _shared; AGENTS.md; DATA_CONTRACT.md; add-entry.mjs; api/cv/route.ts; cv-editor.tsx; cv-ingest.tsx. Each is a deviations row, and expand.md (21K) is a hot conflict file. | 0 | 0 to 1 | **0** (new fork files only) | 3 or more: career-profile.mjs, lib/career-profile.mjs, master-profile.md |
| What the user loses | Hand edits to cv.md get overwritten. | The structured editor, plus persisted ids and design | Facts, when Overwrite is clicked | One confirm click per rename. cv.md formatting is normalized. | Design, ids, hidden flags |
| Silent fact-loss risk | High and ongoing. Any future upstream mode that writes cv.md writes a derived file that the next regen overwrites. | None | High | Low. The gate refuses before any save. | Medium |
| Size | Editor, a generator and 11 rewrites | About 50 lines | Editor plus a guard | Editor plus about 250 lines of gen, absorb and gate, plus tests | Schema migration plus editor |

**Build D.** It is the only option that keeps the agent contract and the fact gate untouched, costs zero upstream edits, and turns every lossy case into a visible refusal instead of a deletion. It also follows upstream's own precedent of a structured model derived from cv.md.

**Drift rule, the same in the editor and in a CLI `node resume-sync.mjs check|absorb`:**

1. resume.json is valid only for the cv.md whose sha256 it records. Every read for editing, rendering or sharing absorbs the current cv.md first.
2. **Lossless gate.** An absorb is saved only if `gen(absorbed)` equals cv.md after `normalizePandocLine` and `normalizeDates` normalization. On failure nothing is written. The editor goes read-only on the failing entries and lists the unparsed lines, orphans, new entries and reorders. The user edits cv.md, or confirms "same entry, renamed", which pairs the orphan with the new entry and keeps its id. Orphans are never deleted without that explicit confirm. There is no Overwrite button.
3. **Save order.** First write cv.md = `gen(json)` through upstream `POST /api/cv`, with `expected` set to the absorbed text. A 409 means re-absorb. Then write resume.json with the new sha. A crash between the two leaves a stale sha, and the next load re-absorbs, so the sequence is idempotent.
4. Every editable text field is emitted to cv.md. Only presentation fields (ids, hidden, website, design, levels, icons, structured dates that match `period`) live solely in resume.json.

**Per-share hiding in D.** cv.md keeps every section and item. resume.json's own `hidden` (item or section) is the default for public renders. Each share record in the fork-local publish service stores an overlay, `hide: { sections: ["projects", "<customSection id>"], items: ["<item id>"] }`. The overlay is applied to a copy at render time and never written back. Prefer section keys, which are stable across absorbs. Item ids survive absorbs (S0, S6) but not unpaired renames (S5). So publish must refuse to render while resume.json's sha does not match cv.md, or while an orphan is unresolved. Otherwise a renamed item hidden by id could reappear in a public share.

Not checked: I did not run `verify-cv-facts.mjs` or `doctor.mjs` on the generated cv.md. I did not read RR's `dates.ts` or `period.ts` behaviour beyond data.ts:185. The upstream-file count for A counts writers only, not docs that mention cv.md (193 files reference it). Risk: D's safety rests entirely on the gate. A gen that omits a section the editor exposes reintroduces silent loss, so the gate test must cover every field the editor can edit.
