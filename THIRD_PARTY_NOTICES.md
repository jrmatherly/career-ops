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
- `stripHtml` in `lib/resume/schema.mjs` from `packages/utils/src/string.ts` (PR-02)
- `tests/fixtures/resume/sample.json`, the fictional sample resume, from `packages/schema/src/resume/sample.ts` evaluated with `default.ts`, plus two added experience items the tests need (PR-02)

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
