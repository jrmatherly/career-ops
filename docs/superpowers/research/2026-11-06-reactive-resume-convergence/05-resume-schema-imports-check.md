# RR resume schema, importers, Check rules, templates, exports

Subagent research report, 2026-11-06. Model output: claims carry file:line evidence or are labelled inference; verify against the code before relying on one.

# Reactive Resume v6 reuse assessment for career-ops

Paths below are relative to the RR clone (`RR/` = `.../scratchpad/rr/repo`) or to `/Users/jason/dev/career-ops` (`CO/`). RR is MIT, "Copyright (c) 2026 Amruth Pillai" (RR/LICENSE:1-3): vendoring needs the copyright and licence notice kept. Everything labelled (inference) is not directly checked.

## 1. Resume schema

- `RR/packages/schema/src/resume/data.ts` (875 lines) imports only `zod`, `../templates`, `./dates`, `./stylesheet` (data.ts:1-4). `templates.ts` imports only zod (templates.ts:1). `dates.ts` imports `./period`, two JSON label files (`expected-labels.json`, `present-labels.json`) and a type from data (dates.ts:1-6). `slug.ts`, `stylesheet.ts`, `json-schema.ts`, `limits.ts`, `default.ts` import only zod or siblings.
- No `@reactive-resume/utils` import anywhere in `schema/src/resume/*` (grep of the import lines). The utils imports in the schema package live in `career*.ts`, `applications/*`, `application-profile.ts`, which are out of scope.
- So: pure Zod plus 2 JSON files, self-contained. Surface to vendor: `data.ts`, `dates.ts`, `period.ts`, `stylesheet.ts`, `default.ts`, `limits.ts`, `json-schema.ts`, `templates.ts`, the two JSON files (about 2,300 source lines excluding tests/sample).
- Zod version: `^4.6.7`, with an override for `zod@>=4.0.0 <4.6.6` (RR/pnpm-workspace.yaml:42,105). RR imports it as `import z from "zod"` (default import).
- career-ops has no zod: not in `CO/package.json` (deps: `@google/generative-ai`, `dotenv`, `js-yaml`, `playwright`, `undici`, package.json:112-118), not in `CO/web/package.json` (0 grep hits in package.json and package-lock), and no source file imports it. Adding it is a new core dependency.
- TypeScript: all files are `.ts`. Core is plain `.mjs` with no build step. Options: (a) strip types by hand (the files are mostly `z.object` literals plus `z.infer` type aliases, so stripping is mechanical but is a fork that must be re-synced); (b) Node 22.13+ type stripping — `engines` is `^22.13.0 || >=23.4.0` (CO/package.json:6). Node 22.13 needs `--experimental-strip-types`; unflagged strip-types arrived later (inference, verify with `node --version` and a test before relying on it). The `.ts` files use `import ... from "./x"` without extensions, which Node's ESM loader will not resolve, so (b) is not as-is either. (c) Compile once with tsc/esbuild into a generated `lib/resume-schema/*.mjs` checked in.
- Observations on shape: heavy use of `.catch(default)` for self-healing parse; `z.looseObject` at the root (data.ts:777) so unknown keys survive; `describe()` strings are written for LLM tool use (about 40% of the file is description text). `parseResumeData` also runs `upgradeResumeDates`/`syncResumeDates` (data.ts:794-802), so dates are always normalized on parse.
- Top-level resume shape (from data.ts): `picture`, `basics{name,headline,email,phone,location,website{url,label},customFields[{id,icon,text,link}]}`, `summary{title,columns,hidden,content(HTML)}`, `sections{profiles,experience,education,projects,skills,languages,interests,awards,certifications,publications,volunteer,references}` each `{title,columns,hidden,items[]}`, `customSections[]` (discriminated union on `type`, so a custom section holds any built-in item type, data.ts:384-445), `metadata{template,layout{sidebarWidth,pages[{fullWidth,main[],sidebar[]}]},page{format a4|letter|free-form, marginX, marginY, gapX, gapY, locale, dateFormat, hideIcons...},design{level,colors{primary,text,background},entry{layout,lead,accent}},typography{body,heading{fontFamily,fontWeights,fontSize,lineHeight},hyphenation},css/styleRules,stylesheet,notes,web,check{ignored,hiddenTerms}}`.

## 2. Mapping RR -> cv.md -> payload

cv.md conventions: `## Experience`-style heading names (CO/lib/cv-markdown.mjs:112-133), `### Company -- Location`, bold `**Title**` line, dates line, bullets (examples/cv-example.md, lines for TechFin Corp). Education and Skills use bullet lines (`- MS Computer Science, UT Austin (2018)`, `- **ML/AI:** PyTorch, ...`). Header is `**Location:**`, `**Email:**` etc. key lines. HTML payload per `ENTRY_FIELD_SPECS.html` (CO/lib/cv-payload-schema.mjs:22-45), root keys at :58-63.

| RR field | cv.md | HTML payload | Lossy? |
|---|---|---|---|
| `basics.name/email/phone/location` | `# CV -- Name`, `**Email:**`, `**Location:**` | `candidate` (root key; exact subkeys not read) | no |
| `basics.headline` | none (no convention) | `candidate` (inference) | cv.md gap |
| `basics.website`, `profiles[]` (network, username, url) | `**LinkedIn:**`, `**Portfolio:**`, `**GitHub:**` lines | candidate links (inference) | profiles array flattens to fixed key lines |
| `basics.customFields` | none | none | dropped |
| `picture` | none | none (payload has no picture key, :58-63) | dropped |
| `summary.content` (HTML) | `## Professional Summary` paragraph | `summary` | RR rich HTML -> plain text; links/bold lost |
| `experience.items[].company` | `### Company -- Location` | `experience[].company` | RR keeps location as its own field; cv.md merges it into the heading |
| `.position` | `**Title**` | `.role` | no |
| `.location` | in `###` line | `.location` | no |
| `.period` + `.dates{start,end,present,expected,raw}` | dates line (free text) | `.dates` or `.period` | structured -> text; round-trip needs the period parser (section 3) |
| `.description` (HTML) | `-` bullets | `.bullets[]` | lossy both ways: HTML paragraphs vs flat bullets; nested lists, bold, links lost |
| `.roles[]` (period, position, description) | none; would be two `###` blocks or a joined title | none (`ENTRY_FIELD_SPECS` has no roles) | lossy: multiple roles under one company flatten to repeated company entries or are dropped. Also `cv-title-check.mjs` compares exact title strings |
| `.website` | none | none (experience has `context`, no url) | dropped |
| `.hidden` | none | none | dropped (could filter before export) |
| `education.items[]` school, degree, area, grade, location, period, description | `- MS CS, UT Austin (2018)` one line | `education[]` title, org, location, year, description | lossy: cv.md has no structure; RR `area`/`grade` collapse into `title`/`description` |
| `projects.items[]` name, period, description, website | `- **Name** (tag) -- text` | `projects[]` name, badge, description, bullets, tech, url | `tech` has no RR counterpart (RR keeps tech in description HTML or custom field); period dropped by payload |
| `skills.items[]` name, proficiency, level 0-5, keywords[] | `- **Category:** a, b, c` | `skills[]` category, items | lossy: level/proficiency/icon dropped; RR `name`=category, `keywords`=items is the natural map |
| `certifications`, `awards` (title, issuer/awarder, date) | no standard heading in example | `certifications[]`/`awards[]` title, org, year | date -> year only |
| `languages[]` (language, fluency, level 0-5) | none | none | no payload slot; dropped |
| `interests[]` (name, keywords) | none | `interests` (root key present, only cv-template.html has the slot per CO/lib/cv-payload-schema.mjs:99-104 comment) | partial |
| `publications[]`, `volunteer[]`, `references[]` | none | none | dropped; `references` are better left out of a CV anyway |
| `customSections[]` | none | none | dropped; can be mapped onto the closest built-in by `type` |
| `metadata.template/page/typography/design` | none | `lang`, `page_format`, `country` only; design lives in `config/profile.yml` `style:` (CO/theme-style.mjs:12-24) | design is not part of the payload |
| `metadata.layout` (pages/main/sidebar order) | none | `sections` (order) (inference) | RR per-page, per-column placement has no analogue; only a flat order |

Net: RR -> payload is feasible for the core (basics, summary, experience, education, projects, skills, certs, awards). RR -> cv.md -> RR round-trips lose roles[], languages, volunteer, publications, references, custom sections, skill levels, and the HTML structure of descriptions. (inference) A typed model that must be lossless needs its own store (RR-shaped JSON) with cv.md as a derived view, not the reverse; today cv.md is the source of truth (AGENTS.md "CV Source of Truth"), so this is an architectural decision for the caller.

## 3. Imports (`RR/packages/import/src`)

Package deps: `fflate` (zip), `zod`, `@reactive-resume/{resume,schema,utils}` (RR/packages/import/package.json). No mammoth, no jszip, no pdfjs in this package; docx is read through `fflate` + custom XML text extraction. pdfjs-dist 6.5.438 sits in `packages/pdf`, `packages/api` and `apps/web` (grep of package.json files), not in `import`. There is no single `index.ts`/detect module in the package. Format detection lives in the web app: `RR/apps/web/src/features/resume/import/read-file.ts:32-75` (`detectJsonImportKind`, `detectImportKind`: magic bytes for PDF/ZIP/docx, then JSON shape) and server side in `RR/packages/api/src/features/resume/imports.ts` (not read in detail).

| Importer | Input -> output | Notable deps | Port to a Node script |
|---|---|---|---|
| `json-resume.tsx` (397 lines) | JSON Resume string -> `ResumeData` (`parseJSONResume`, :383) | `getNetworkIcon` from resume/icons, `generateId`, `toHtmlDescription` (escapeHtml), schema defaults | Easy; replace icon lookup and id with `crypto.randomUUID`. Highest value: maps a public standard. |
| `reactive-resume-json.tsx` (31) | RR v5/v6 JSON -> validated `ResumeData` | schema only | Trivial once the schema is vendored |
| `reactive-resume-v4-json.tsx` (552) | RR v4 JSON -> v6 | `parseColorString` from utils/color, templateSchema | Medium; only needed for legacy RR exports |
| `linkedin.ts` (318) | LinkedIn data-export ZIP bytes -> `ResumeData` (`parseLinkedInExport`, :168) | `fflate` via `zip.ts` (streaming unzip with entry-size cap), own CSV parser (:99, handles quotes; BOM stripped by TextDecoder) | Easy; `fflate` is the only dep, `node:zlib`/`unzip` not needed. Expected files (case-insensitive lookup, `findCsv` :154): `Profile.csv`, `Positions.csv`, `Education.csv`, `Skills.csv`, `Languages.csv`, `Certifications.csv` (:13-18, :195-200); needs Profile, Positions or Education to count as a LinkedIn export (:204 error text). |
| `plain-text.ts` (621) | pasted/extracted text -> `ResumeData` (`parseResumeText`, :568) heading-driven segmenter | schema `parsePeriod`/`parseSingleDate`, html helpers | Medium; pure function, no I/O. Closest to a cv.md parser, but RR's heading set is its own (`knownHeading`, :116). |
| `pdf-lines.ts` (2,065 lines, 75 KB) | `ExtractedDocument` (text items with geometry) -> lines -> `ResumeData` (`parsePdfResume`, :1979; `documentToLines`, :1543) | `columnSegments`/`buildExtractedDocument` from `resume/ats-pdf` (extract.ts:339,436), `pdf-geometry.ts` | Hard/large. The parser is pure; the PDF text-item harvesting needs pdfjs-dist (career-ops `web/` already lists `pdfjs-dist ^6.4.299`, CO/web/package.json:24; core does not). Port only if PDF import is a requirement. |
| `docx-text.ts` (135) | docx bytes -> plain text (`extractDocxText`, :129) | `fflate` only | Easy; feeds `plain-text.ts` |
| `review.ts` (204) | `ResumeData` + source lines -> import review, leftover-text section, link targets | zod, html | Optional; useful for "what did the import not place" |
| `job-posting.ts` (186) | job posting text/HTML -> structured posting | unread in detail | Overlaps with career-ops JD handling; skip |
| `zip.ts`, `html.ts`, `date.ts`, `level.ts`, `error.ts` | helpers | fflate / utils/string | Trivial; replace utils imports (`escapeHtml`, `generateId`) with local copies |

Realistic minimum for career-ops: `json-resume` + `reactive-resume-json` + `linkedin` + `plain-text` + `docx-text`, which need `zod` + `fflate` and the vendored schema subset. PDF import is the only heavy item.

## 4. Check mode (`RR/packages/resume/src/ats/`)

Input: the resume JSON (`ResumeData`) only, not the rendered layout. `lintResumeForAts(data, {now})` builds `RuleContext{data, sections: walkSections(data), locale, now}` (index.ts:~96) and runs `ATS_RULES`, a list of 9 pure functions `(context) => AtsRuleFinding[]` (rules.ts:21-26, :318-328). The only impurity is the injected `now`. Output: `AtsReport{findings, ignored, counts, totalRules, passedRules, score(%), categories}` (types.ts). Findings carry a JSON pointer and a stable key (code + pointer with item ids) so authors can ignore them (`metadata.check.ignored`). Score = passed rules / applicable rules (index.ts:~100-125); the English heading rule is dropped for non-`en` locales (rules.ts:~222).

Dependencies: schema (`resumeDatesSchema`, `resumeDatesToPeriod`, `parsePeriod`, `parseSingleDate`, `templateLayouts`) and `utils/string` (`stripHtml`, `escapeHtml`). Size: rules.ts 447, catalog 122, index 133, walk 102, merge 91, section-aliases 127, types 45 = about 1,070 lines. Port to .mjs: about 1-2 days including vendored schema; the logic is small and pure. The catalog codes are `as const`, so porting is type stripping.

Rules (23 in `ATS_RULE_CATALOG_V1`, catalog.ts:7-90):

| id | category | severity | what |
|---|---|---|---|
| MISSING_NAME | contact | error | no `basics.name` |
| MISSING_EMAIL | contact | error | no email |
| MALFORMED_EMAIL | contact | error | email fails `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$` |
| MISSING_PHONE | contact | warning | no phone |
| MISSING_LOCATION | contact | info | no location |
| MALFORMED_URL | contact | warning | website/custom-field/item URL not http/https/mailto/tel |
| PICTURE_PRESENT | contact | info | photo shown |
| EMPTY_PERIOD | dates | warning | experience/education item with no period |
| UNPARSEABLE_PERIOD | dates | error | period text no parser can read |
| UNPARSEABLE_DATE | dates | warning | single date (awards etc.) unreadable |
| REVERSED_PERIOD | dates | error | start after end |
| FUTURE_DATED_PERIOD | dates | warning | start date in the future |
| SECTION_MISSING_FROM_LAYOUT | layout | error | section with items placed on no page |
| NO_VISIBLE_EXPERIENCE | headings | warning | no rendered experience items |
| MISSING_EXPERIENCE_DESCRIPTION | writing | warning | experience entry with no description (and no role description) |
| FRAGMENTED_ENTRY | writing | warning | entry that is a sentence fragment split off the one above (PDF-import artifact) |
| NON_STANDARD_SECTION_TITLE | headings | info | title not in alias list (`section-aliases.ts`), English locales only |
| MULTI_COLUMN_PROSE_SECTION | layout | warning | prose section (summary/experience/education/projects/volunteer) with `columns > 1` |
| PROSE_SECTION_IN_SIDEBAR | layout | warning | prose section placed in the sidebar |
| TWO_COLUMN_LAYOUT | layout | warning | two-column template with sections in the sidebar |
| SMALL_BODY_FONT | layout | warning | body font < 9pt |
| TIGHT_LINE_HEIGHT | layout | warning | line height < 1.15 |
| TIGHT_PAGE_MARGINS | layout | warning | margin < 8pt |

Separate, larger analyzer `RR/packages/resume/src/ats-pdf/` (about 3,100 lines): works on a rendered PDF (`analyzePdf`, index.ts), catalog of about 70 codes (NO_TEXT_LAYER, IMAGE_ONLY_DOCUMENT, GARBLED_TEXT, MULTI_COLUMN_LAYOUT, READING_ORDER_INVERSION, TABLE_LIKE_LAYOUT, NO_QUANTIFIED_IMPACT, WEAK_ACTION_VERBS, FIRST_PERSON_PRONOUNS, LONG_BULLETS, EMPLOYMENT_GAP, MIXED_DATE_FORMATS, ...), plus `jd/` keyword matching (Porter2 stemmer `wink-porter2-stemmer`, ngrams, aliases). Needs pdfjs-dist to produce `RawExtraction`. The `jd/` match is interesting for career-ops (keyword coverage vs a JD), but career-ops already has `keyword-match.mjs` (AGENTS.md table).

Comparison with career-ops (`CO/verify-ats.mjs`, 1,419 lines, input = rendered HTML; `CO/templates/ats-rules.yml`, 218 lines, input = template markup):

- verify-ats ids (verify-ats.mjs:525-539): text-layer, section-headings, email-in-header-footer, email-missing, phone-missing, layout-tables, multi-column, absolute-positioning, images-text-baked, images-non-photo, fonts, charset, hidden-text. ats-rules.yml ids (:42-205): single-column-layout, standard-section-headers, no-image-text, no-critical-info-in-page-furniture, selectable-text, no-nested-tables, no-hidden-text, css-generated-content-positioned, glyph-run-fragmentation.
- RR has, career-ops lacks (data-level checks): name present; email format validity; URL validity; date parseability, reversed and future periods; empty periods; missing experience / missing descriptions; fragmented entries; section not placed in layout; section-title alias check (career-ops has a heading check, different list); font-size / line-height / margin minimums; per-rule `ignored` keys with stable ids; per-category score. In ats-pdf: reading-order inversion, employment gap, mixed date formats, bullet length/quality, quantified-impact and action-verb hints, JD keyword coverage by stemmed ngram.
- career-ops has, RR (JSON check) lacks (markup-level checks): charset declaration, font family allow-list, hidden-text / keyword-stuffing, absolute positioning, nested tables / table layout, text baked into images, email in `<header>`/`<footer>`, CSS generated content, glyph-run fragmentation, multi-language heading terms (13 languages per verify-ats.mjs comment :573-579). RR's JSON check cannot see these because it never sees the rendered output.
- Two checks are complementary, not redundant: RR's operates on the model before render, career-ops's on the rendered HTML. (inference) A career-ops "Check mode" would run RR-style data rules on the payload (cheap, language-neutral for the structural ones) and keep verify-ats.mjs for the HTML.
- Note RR's heading and font-size rules are English / pt-specific (rules.ts:~222 skips non-English); career-ops's heading check is already multi-language, which is a reason not to replace it.

## 5. Design / templates

- Template ids: 18 (`azurill, bronzor, chikorita, ditgar, ditto, gengar, glalie, kakuna, lapras, leafish, meowth, onyx, persian, pikachu, porygon, rhyhorn, scizor, smeargle`, RR/packages/schema/src/templates.ts:3-22) with a `templateLayouts` table (columns 1|2, sidebarSide, headerPlacement, `atsSafe`, :27-60; 12 single-column marked ATS-safe).
- Rendering: React components on the Forme PDF engine, not HTML/CSS. `RR/packages/pdf/src/templates/onyx/OnyxPage.tsx` (168 lines) imports `Page, StyleSheet` from `#react-pdf-renderer` which maps to `./src/forme/primitives.tsx` (pdf/package.json `imports`); deps: `@formepdf/core 0.31.0`, `@formepdf/react 0.31.0`, `react-reconciler`, `harfbuzzjs`, `fast-png`, `node-html-parser`, `react` (RR/packages/pdf/package.json). Shared styling in `templates/shared/*` (about 40 files: `base-template-styles.ts`, `metrics.ts` (gapX/gapY/marginX/marginY), `entry-header.ts`, `level-display.tsx`, `rich-text-html.ts` etc.). `packages/pdf/src/html/web-page.tsx` renders a web page from the same templates (inference: React, not static HTML).
- Portability: not portable as HTML/CSS. A port means adopting React + Forme + wasm layout, i.e. a TypeScript build and a different PDF path than career-ops's Playwright HTML->PDF (`generate-pdf.mjs`, `lib/pdf-server.mjs`). Not realistic for the 18 templates; the cost is the whole `packages/pdf` (about 100 files) plus fonts package.
- RR design controls available as pure data, which are reusable as a *vocabulary*: `page.{marginX,marginY,gapX,gapY,format,locale}`, `typography.{body,heading}.{fontFamily,fontWeights,fontSize,lineHeight}`, `design.colors.{primary,text,background}`, `design.level.type` (hidden|circle|square|rectangle|rectangle-full|progress-bar|icon), `design.entry.{layout,lead,accent}` (stacked|inline|compact|date-column|eyebrow x none|rule|bar|band, data.ts:551-552), `layout.sidebarWidth` and per-page main/sidebar section lists.
- career-ops today: 8 HTML templates (`cv-template.html`, `.compact`, `.executive`, `.jake`, `.leadership`, `.modern`, `.zh-minimal`, `ats/cv-template.ats.html`) plus 2 TeX. Controls are CSS custom properties read via `var(--x, default)`, set from `config/profile.yml` `style:` (CO/theme-style.mjs:12-24, STYLE_VAR_MAP :39-71): accent_color, secondary_color, tag_color/bg/border, font_family, font_size, margin, job_break_inside, project_break_inside. Section order via `cv.sections`.
- What adding RR-style controls takes (inference from those two files): extend `STYLE_VAR_MAP` with `--body-line-height`, `--heading-font`, `--heading-size`, `--section-gap`, `--item-gap`, `--column-gap`, `--sidebar-width`, `--text-color`, `--bg-color`, and make each template read them with fallbacks (so unset = byte-identical, as the existing contract requires, theme-style.mjs:17-19). Column/sidebar choice cannot be a variable on single-column templates; it needs a template switch or a second two-column template with a `--sidebar-width` var and a `sidebar_sections` list. A picker UI in `web/` writes `style:` into profile.yml; `entry` layout variants would be CSS classes on the `.job` block. The RR `ResumeData.metadata` block is a good schema for the stored settings, but unit conversions are needed (RR uses pt for margins/gaps, career-ops uses in/px).
- Recommendation: expose career-ops's own 8 templates through a picker with RR-like controls; do not port RR templates.

## 6. Exports

- `RR/packages/docx` uses the `docx` npm library (`^9.15.2`) plus `node-html-parser` (docx/package.json:15-21). Entry `buildDocx(data, resolveTitle?, options?) => Promise<Blob>` (docx/src/index.ts) via `Packer.toBlob(buildDocument(parseResumeData(data), ...))`. Core: `builder.ts` (about 14 KB; planPageColumns uses `templateLayouts`), `section-renderers.ts` (13 KB), `html-to-docx.ts` (about 10 KB converts RR's rich-text HTML to docx runs). Input is the full `ResumeData`, plus workspace imports `resume/export-sections`, `schema/resume/limits`, `utils/{color,link,locale}`.
- `RR/packages/odt` has no library: it hand-builds ODF XML (`builder.ts` 18 KB, `sections.ts`, `html-to-odt.ts`, `xml.ts`) and zips with `fflate`, mimetype first and stored (odt/src/index.ts). Input is `ResumeData`.
- Portability: both are Node-safe (docx runs in Node; `Blob` is global in Node 18+). Neither consumes career-ops's payload; both need `ResumeData`. Two routes: (a) payload -> `ResumeData` adapter (the inverse of section 2: bullets -> `<ul><li>` HTML, dates -> text period) then vendor the two packages; (b) write a small docx builder directly against the payload using the `docx` npm package. (inference) (a) preserves RR's rich-text and column handling, (b) is smaller if only a single-column ATS DOCX is wanted. New deps either way: `docx`, `node-html-parser`, `fflate`. career-ops has `generate-latex.mjs`/TeX and PDF but no DOCX/ODT today (inference from the AGENTS.md table; not grepped for docx).

## Ranking

1. **Port as-is (mechanical, type-strip + resolve imports)**
   - `schema/src/resume/{data,dates,period,stylesheet,default,limits,json-schema}.ts` + `templates.ts` + 2 JSON files: self-contained zod. Adds one dependency (`zod ^4.6.7`). Keep MIT notice.
   - `import/src/{linkedin,zip,docx-text,json-resume,reactive-resume-json,html,date,level,error}.*`: only `fflate` + local helper swaps (`generateId`, `escapeHtml`, `getNetworkIcon`).
2. **Port with adaptation**
   - `resume/src/ats/*` (the 23-rule JSON linter): needs the vendored schema + `stripHtml`; wire as a Check mode on the RR-shaped model or on a payload->model adapter; keep `verify-ats.mjs` for rendered HTML. Drop or replace `templateLayouts` use with career-ops template metadata.
   - `import/src/plain-text.ts` (+ `review.ts`): a cv.md/pasted-text importer, but headings are RR's; map to career-ops's multi-language heading list in `lib/cv-markdown.mjs`.
   - `docx` and `odt` builders: viable behind a payload->`ResumeData` adapter; adds `docx`/`node-html-parser`/`fflate`.
   - RR design vocabulary (typography/colors/gaps/sidebar/entry-header) into `theme-style.mjs` + template CSS variables, not RR's code.
   - `resume/src/ats-pdf/jd` keyword matcher (stemmer + ngrams), only if `keyword-match.mjs` is judged weak (not compared).
3. **Reimplement**
   - The typed model in career-ops terms: a data model whose canonical form is decided first (cv.md stays source of truth vs RR JSON). The mapping in section 2 shows cv.md cannot hold roles[], languages, custom sections or structured dates without extending its convention, so the model is a design decision before any port.
   - Templates/picker: career-ops's own 8 HTML templates with a controls panel.
4. **Skip**
   - `packages/pdf` templates and Forme (React + wasm; incompatible with the Playwright HTML->PDF path).
   - `import/pdf-lines.ts` unless PDF import is a hard requirement (2,065 lines, depends on pdfjs-dist geometry extraction).
   - `reactive-resume-v4-json` (legacy RR), `job-posting.ts` (overlaps career-ops JD pipeline), RR `ats-pdf` rendered-PDF checks (career-ops has its own HTML/PDF verification).

Not verified: I did not run any RR code (as instructed), did not read `packages/api/src/features/resume/imports.ts` or `apps/web` PDF harvesting in detail, did not read the body of every importer beyond signatures and imports, and did not test whether Node's current type-stripping can load the `.ts` files.
