# Third-party notices

Code this fork vendors from other projects, with the licence each one carries. Each vendoring PR appends to the Files list of its project; nothing here is reordered. `.claude/skills/upstream-review/SKILL.md` holds the merge rule for this file.

## Reactive Resume

- Source: https://github.com/reactive-resume/reactive-resume
- Clone SHA: `d065a9f76538afda5da5de9374da2ed51f96c1e4`, 16 commits after the v6.1.0 tag
- Licence: MIT, copyright Amruth Pillai. Each vendored file carries this notice in a header comment.

### Files

A vendoring PR adds one line per file: `lib/resume/<file>` from `<path in the clone>`. Each `.mjs` is the clone's TypeScript with types stripped (`stripTypeScriptTypes`, positions kept, so line N upstream is line N+1 here under the header), `.mjs` import specifiers, named `zod` imports, and the two JSON label imports read with `readFileSync`.

- `lib/resume/vendor/period.mjs` from `packages/schema/src/resume/period.ts` (PR-02)
- `lib/resume/vendor/stylesheet.mjs` from `packages/schema/src/resume/stylesheet.ts` (PR-02)
- `lib/resume/vendor/templates.mjs` from `packages/schema/src/templates.ts` (PR-02)
- `lib/resume/vendor/dates.mjs` from `packages/schema/src/resume/dates.ts` (PR-02)
- `lib/resume/vendor/data.mjs` from `packages/schema/src/resume/data.ts` (PR-02)
- `lib/resume/vendor/default.mjs` from `packages/schema/src/resume/default.ts` (PR-02)
- `lib/resume/vendor/present-labels.json` from `packages/schema/src/resume/present-labels.json`, unchanged (PR-02)
- `lib/resume/vendor/expected-labels.json` from `packages/schema/src/resume/expected-labels.json`, unchanged (PR-02)
- `tests/fixtures/resume/sample.json`, the fictional sample resume, from `packages/schema/src/resume/sample.ts` evaluated with `default.ts`, plus two added experience items the tests need (PR-02)
- `lib/resume/import/zip.mjs` from `packages/import/src/zip.ts` (PR-03)
- `lib/resume/import/error.mjs` from `packages/import/src/error.ts`; an `ImportError` class and a one-line issue list (PR-03)
- `lib/resume/import/date.mjs` from `packages/import/src/date.ts` (PR-03)
- `lib/resume/import/html.mjs` from `packages/import/src/html.ts`; descriptions are built with `lib/resume/to-cv-md.mjs`'s `pHtml`/`liHtml` so an import round-trips through `absorb` unchanged (PR-03)
- `lib/resume/import/level.mjs` from `packages/import/src/level.ts` (PR-03)
- `lib/resume/import/plain-text.mjs` from `packages/import/src/plain-text.ts` (PR-03)
- `lib/resume/import/docx-text.mjs` from `packages/import/src/docx-text.ts` (PR-03)
- `lib/resume/import/json-resume.mjs` from `packages/import/src/json-resume.tsx`; the network icon lookup is dropped (PR-03)
- `lib/resume/import/linkedin.mjs` from `packages/import/src/linkedin.ts` (PR-03)
- `lib/resume/import/reactive-resume-json.mjs` from `packages/import/src/reactive-resume-json.tsx` (PR-03)
- `lib/resume/import/detect.mjs` from `apps/web/src/features/resume/import/read-file.ts` lines 32-115 (`detectJsonImportKind` and the magic-byte sniffing), plus the `importResume` dispatcher, which is ours (PR-03)
- `lib/resume/check.mjs` from `packages/resume/src/ats/{rules,catalog,section-aliases,walk,index}.ts`, with `carriesUnmergedFields` from `merge.ts` and the rule messages from `apps/web/src/features/resume/editor/check/issues.ts`; `mergeIntoPreviousEntry`, `atsVerdict` and the PDF heading lookup are not ported (PR-04)
- `lib/resume/template-layouts.mjs` replaces `templateLayouts` from `packages/schema/src/templates.ts` with the career-ops templates (PR-04)

The import files and `lib/resume/check.mjs` are hand-ported JavaScript (types removed, `generateId()` replaced by `crypto.randomUUID()`, `read-file.ts`'s i18n macros removed; `check.mjs` joins several clone files into one), not `stripTypeScriptTypes` output, so their line numbers do not match the clone's.

### Licence text

MIT License

Copyright (c) 2026 Amruth Pillai

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## JetBrains Mono

- Source: https://github.com/JetBrains/JetBrainsMono
- Licence: SIL Open Font License, Version 1.1, copyright 2020 The JetBrains Mono Project Authors.
- Where: `docs/architecture-runtime.svg` embeds six variable WOFF2 subsets (Google Fonts service revision v24) as data URIs, so the diagram renders with its own font anywhere an image does. The SVG's leading comment carries the subset hashes and the full licence text; nothing else in this repository uses the font.
