# Making a generated CV fit two pages

Research from 2026-11-19, run against `main` at `1abc6d1a` and the pod on v2.7.1. The plan that came out of it is [`2026-11-19-cv-two-page-ats-fit.md`](../../plans/completed/2026-11-19-cv-two-page-ats-fit.md). Sections are in the order the work happened, and later sections correct earlier ones: where they disagree, the later section and the Decisions table at the end hold.

## Goal

A CV the web app generates must come out at two pages or fewer. The owner ruled out raising `cv.max_pages` as the fix. The tailored CV for tracker row 120 failed the page budget on two runs in a row with "CV is 3 pages; the allowed maximum is 2 pages", and a rerun cannot fix it.

## Evidence labels

- **Measured** means this session ran it and read the output.
- **Inferred** means reasoned from code or data and not observed.

## What the rejected draft looks like (measured)

The two overflow drafts on the pod hold 1,187 and 1,194 words on 3 pages. Page 3 carries 8 and 9 lines, all of it the tail of Skills. One of the owner's finished two-page resumes (Reactive Resume) holds 1,112 words. The content is about 7% longer than a layout that fits, and the base template is looser than that layout.

Where the base template spends lines on this CV:

| Cost | Lines | Cause |
|---|---|---|
| Company and location repeated per role | about 9 | Five roles at one employer each print the company line and the location line. The payload schema has no way to group roles under one employer. |
| Core Competencies grid | about 6 | Tailoring adds it. `cv.md` has no such section. |
| An added skills row | 1 | The writer added "Open Source (production adoption)", which `cv.md` does not have. |
| Body type | whole document | `templates/cv-template.html` sets 11px at line-height 1.5, the loosest of the shipped templates. |

The draft also drops the Volunteer section. `build-cv-html.mjs`, `modes/pdf.md` and the base template have no volunteer slot (measured by grep), so it disappears without a warning.

## Why a rerun cannot fix it

- The pdf prompt (`web/src/lib/run-prompts.mjs:283-287`) never states a page limit. `modes/pdf.md:103-106` names the budget only inside step 21, a shell step the prompt tells the writer to skip (measured).
- The writer gets one attempt and no feedback. `web/src/lib/cv-from-json.mjs:245` deletes the JSON payload once the HTML is built (measured), so nothing can re-render or trim without a new agent run.
- A warn-only overflow writes no PDF, only the `.overflow.pdf` draft (upstream #6377). The run therefore fails either way.

## Prototype (measured)

`repro/fit.mjs` rebuilds the rejected draft as a payload from a `cv.md`, renders variants through `build-cv-html.mjs` and `generate-pdf.mjs`, and counts pages. Run it with `node repro/fit.mjs <repo> <cv.md> <empty work dir>`. Variant A reproduced the pod result exactly (3 pages, 8 lines on page 3), so the local render is a fair stand-in for the pod.

| Variant | Pages | Lines on last page |
|---|---|---|
| A. Base template, as drafted | 3 | 8 |
| B. Location printed on the first role only | 3 | 3 |
| C. No competencies grid | 2 | 44 |
| D. `compact` template | 2 | 26 |
| E. `jake` template | 2 | 24 |
| F. `modern` template | 2 | 45 |
| G. Base, line-height 1.4 | 2 | 48 |
| H. Base, line-height 1.42 and 10.5px | 2 | 46 |

A full page is about 45 to 48 lines. C, F, G and H fit with nothing to spare. D and E leave about half a page.

## Upstream (read 2026-11-19)

- No issue or PR tells the writer the limit, groups roles by employer, or re-renders on overflow.
- Issue 4854 proposes an auto-fit engine that searches line spacing to hit the page budget. It is routed to a plugin (PR 4855), which is waiting on changes.
- Issues 6325, 6377 and 6493 are the history of the budget, the overflow draft and the exit code.

## Outside practice (web search, 2026-11-19, unverified sources)

Tools that solve this render the document, count pages on the PDF, then either adjust spacing by rule or hand the model a targeted trim instruction. None trusts the model to count pages. Two pages is the common expectation for senior candidates in the surveys found, which come mostly from resume vendors.

## Options

| # | Option | New code | Paid run per try | Evidence |
|---|---|---|---|---|
| 1 | Set `cv.template` to `compact` in Settings | none | no | Variant D |
| 2 | Fit step: on overflow, re-render the kept payload down a fixed ladder (tighter line-height, then a denser template), report what was applied, fail only when the ladder is spent | small, in the web render path | no | Variants D, G, H |
| 3 | State the limit and a trim order in the pdf prompt | a few lines | yes | Untested |
| 4 | Group consecutive roles at one employer in the schema and builder | medium, touches upstream-owned files | no | Variant B, about 9 lines |
| 5 | Keep the payload after an overflow so a re-render or re-gate needs no new run | small | no | Enables 2 |
| 6 | Add a volunteer slot, or warn when a `cv.md` section has no slot | small | no | Grep above |

## Follow-up, 2026-11-19 (measured)

The owner ruled that the Volunteer section must not be dropped. That makes option 6 required, and it changes which layouts fit.

**Volunteer slot.** `lib/resume/to-payload.mjs:5` lists `volunteer` as slotless, with `languages`, `publications` and `references`. The only optional extra section the builder renders is `interests`, and only the base template has it. Keeping Volunteer needs a payload key, a builder function and a slot in each template.

**Fit with Volunteer added** (a Volunteer block injected into the built HTML, rendered locally):

| Variant | Pages | Lines on last page |
|---|---|---|
| Base | 3 | 11 |
| `compact` | 2 | 29 |
| `jake` | 2 | 27 |
| `modern` | 3 | 3 |
| Base, line-height 1.4 | 3 | 3 |

Only `compact` and `jake` still fit.

**Pod render.** The same HTML rendered on the pod (v2.7.1, Liberation Sans) in a temp folder that was removed afterwards: base 3 pages with 9 lines over, `compact` with Volunteer 2 pages (30 lines on page 2), `jake` with Volunteer 2 pages (28 lines). The local result holds on the pod.

**Type size.** Chromium prints 1 CSS px as 0.75pt, so the templates print smaller than their px values suggest:

| PDF | Body type | Line pitch |
|---|---|---|
| Base template | 7.9pt | 11.8pt |
| `compact` | 7.5pt | 10.5pt |
| `jake` | 7.9pt | |
| Owner's Reactive Resume PDF | 9.5pt | 11.9pt |

The base template spends the same height per line as the owner's resume while printing type 17% smaller. Its lines run to about 135 characters against 116. `compact` fits by going smaller still. The owner's layout fits 1,112 words in two pages at 9.5pt. Whether the 1,194-word draft plus Volunteer fits at that size is measured in "Dense layout prototype" below (it does, with no cut).

**Writer probe (one run).** The real pdf prompt plus a stated budget ("fit 2 pages, 1,000 words, cut in this order") ran once locally through `claude -p` with the web app's tool scope. The writer returned 949 words. It kept all 17 bullets nearly verbatim (686 of 701 words) and cut the summary and skills items (130 of 173 skills words). Rendered: base 3 pages with 5 lines over, `compact` 2 pages. The writer obeys a word budget, but a word budget does not predict pages, and it will not cut bullets unless told how many. A prompt rule alone does not guarantee the limit.

## The earlier pipeline in `~/dev/job-search` (read 2026-11-19)

Every finished resume so far came from the owner's Reactive Resume instance, driven by scripts in `~/dev/job-search/tools`. Its settings are the working two-page layout:

| Setting | Reactive Resume (`scizor`, ATS master) | career-ops base template |
|---|---|---|
| Body type | IBM Plex Serif 9.5pt | Liberation Sans 7.9pt |
| Line height | 1.15 | 1.5 |
| Page margins | 40pt sides, 36pt top and bottom | 43pt (0.6in) all round |
| Headings | Fira Sans Condensed 12pt | 9pt uppercase |
| Experience | one company entry holding five roles | five entries, company and location repeated |
| Volunteer | a section in the layout | no slot |
| Page breaks | bullets and short entries never split | sections may split |

It also had the loop this research recommends. `tools/trial_render.py` renders a patch on a throwaway copy, counts pages with `pdfinfo` and reports the spare lines on each page before anything is pushed.

What career-ops already holds from the convergence program: the resume model (`data/resume.json`) keeps `roles` under one company and has a `volunteer` section, and both are flattened or dropped on the way to the render payload (`lib/resume/to-payload.mjs:5`, `lib/resume/to-cv-md.mjs:232`). Porting Reactive Resume's templates was ruled out on 2026-11-06 because they are React components on the Forme PDF engine, not HTML and CSS (`../2026-11-06-reactive-resume-convergence/05-resume-schema-imports-check.md`, lines 119 to 124).

So the target is a career-ops HTML template that reproduces the `scizor` type and spacing settings above, with a Volunteer slot. Its grouped roles are not copied: see "How our PDFs read to a parser" below. The numbers are known and proven on the 11 submit PDFs under `jobs/`, every one of them 2 pages (`pdfinfo`, 2026-11-19).

## How our PDFs read to a parser (measured 2026-11-19)

The owner reports that portal autofill misplaces roles and dates from the Reactive Resume PDFs. `pdftotext -raw` prints text in content-stream order, which is the order a text-based parser receives.

Both excerpts keep the real line structure; the employer, titles and city are replaced with placeholders.

Reactive Resume PDF (`scizor`, grouped roles):

```
EXPERIENCE
Example Retail Group Springfield, ST (Remote since 2020)
Senior Manager, Platform Jul 2021 - Present
...
Senior Engineer Apr 2015 - Jul 2021
```

The employer appears once, on a line with its location and no dates. Each later role is a title and a date range with no employer near it. A parser that builds one job per employer line gets one job; one that builds a job per date range gets five jobs, four with no employer. Either way a person corrects it by hand.

career-ops base template (one entry per role):

```
WORK EXPERIENCE
Example Retail Group Jul 2021 - Present
Senior Manager, Platform
Springfield, ST (Remote since 2020)
...
Example Retail Group Apr 2015 - Jul 2021
Senior Engineer
```

Every role carries employer, dates, title and location on adjacent lines. The repetition this page counted as wasted lines above is what makes each role a complete record. Grouping roles under one employer (option 4) is withdrawn.

Other measured differences:

- `compact` breaks its headings across lines in extraction ("PROFESSIONAL" then "SUMMARY", "WORK" then "EXPERIENCE") because the label sits in a narrow rail. A heading split in two is harder to match.
- career-ops PDFs are untagged (`pdfinfo`: `Tagged: no`, Skia/PDF). `generate-pdf.mjs:2660` calls `page.pdf()` without `tagged` or `outline`. The Reactive Resume PDFs are tagged.
- The templates already forbid web fonts and ligatures for extraction reasons (the header comment of `templates/cv-template.compact.html`). The pod has Liberation Sans, Serif, Mono and Sans Narrow only (`fc-list`), so a new template uses those.
- `verify-ats.mjs` and `templates/ats-rules.yml` audit the HTML. Nothing reads the rendered PDF back to check the order a parser sees.

## Dense layout prototype (measured 2026-11-19)

`repro/dense.mjs` applies the Reactive Resume metrics to the career-ops HTML and keeps the employer on every role, with the location line removed (it moves onto the employer line in the real template). Content is the full 1,194-word draft plus Volunteer and the competencies grid.

| Font | Size | Line height | Pages | Lines on page 2 |
|---|---|---|---|---|
| Liberation Sans | 9.5pt | 1.15 | 2 | 43 local, 44 pod |
| Liberation Sans | 10pt | 1.15 | 2 | 47 |
| Liberation Serif | 9.5pt | 1.15 | 2 | 39 local, 40 pod |
| Liberation Serif | 10pt | 1.15 | 2 | 46 |

At this size a page holds about 60 lines, so the 9.5pt variants leave a quarter to a third of page 2 free. `repro/sizes.py` confirms 9.49pt body type in the pod renders. No content has to be cut.

The existing `style:` block in `config/profile.yml` (`font_size`, `line_height`, `margin`, `section_gap`, `item_gap`) gets the base template to 2 pages with no code, but `font_size` does not reach bullets, summary or skills, which are fixed at 10.5px in `templates/cv-template.html`. Measured: 6,267 characters stayed at 7.88pt with `font_size: 9.5pt` set.

## What parser vendors require (read 2026-11-19)

A research agent collected sources; the three that drive the design were then fetched and read again in this session. No applicant tracking system publishes layout rules. The parser vendors do. No independent, method-stated test of stacked roles on a named system was found, so the stacked-role question rests on the extraction test above and on the owner's own uploads.

| Rule | Source |
|---|---|
| Parsers convert the file to plain text first, and most failures come from that conversion. PDF is the riskier input; Word is preferred. | [Textkernel getting started](https://developer.textkernel.com/tx-platform/v10/resume-parser/overview/getting-started/), [RChilli tips](https://www.rchilli.com/tips-for-electronic-resume-writing) |
| Every job is written in the same order, with dates, title, company and city adjacent. The parser reads from the left first. | RChilli tips |
| A date range stays on one line. A job with no dates is not parsed in full. | RChilli tips; Textkernel quality codes 418 and 419 |
| Every section has a common heading alone on its own line. No combined, unusual or nested headings. | Textkernel quality code 151; RChilli tips |
| No columns or tables. | Textkernel quality code 433; RChilli tips |
| Contact details at the top, in the body, not a page header or footer. | Textkernel quality code 311; RChilli tips |
| A wide visual gap can be read as a column separator and split a label from its value. | [Textkernel on column resumes](https://textkernel.com/learn-support/blog/improving-extraction-from-column-resumes) |
| No letter-spaced text; system fonts. | [DaXtra](https://info.daxtra.com/blog/resume-secrets) (agent-read, not re-read here) |

Quality codes are from [Textkernel parser output](https://developer.textkernel.com/tx-platform/v10/resume-parser/overview/parser-output).

Known parser assignments with a primary source: Oracle Recruiting uses RChilli; SAP SuccessFactors and SmartRecruiters use Textkernel (agent-read). Workday names no vendor and says only that results vary with "resume format and order of words". Nothing authoritative was found for Greenhouse, Lever, iCIMS or Ashby.

Without a primary source, so not relied on: that repeating the employer on every role is required, that dates belong on their own line, that a hyphen beats an en dash, that tagged PDFs parse better, that page count or font size affects a parser.

What this means for the template:

1. One entry per role, each with title, employer, location and dates, in the same order every time. This is what career-ops does today and what the Reactive Resume layout does not.
2. No right-aligned date across a wide gap. The date sits in running text on the employer line.
3. Plain headings on their own line, from the common set, with no letter-spacing and no label rail.
4. The competencies grid has no delimiters in extracted text and sits under a heading parsers do not list. Fold it into Skills, as `ats-payload.mjs` already does for the ATS variant.
5. Liberation fonts only, ligatures off, as the shipped templates already require.

## Decisions (2026-11-19)

| # | Decision | By | Evidence |
|---|---|---|---|
| 1 | The page limit stays at 2. Raising `cv.max_pages` is not the fix. | Owner | Handoff of 2026-11-19 00:06 EST |
| 2 | The Volunteer section is never dropped. | Owner | This session |
| 3 | Type does not shrink to make a page count. The floor is 9.5pt, the size of the owner's own resumes. | Session, from decision 1 and the type-size table | "Type size" |
| 4 | One experience entry per role, employer on each. Grouping roles (option 4) is withdrawn. | Session | "How our PDFs read to a parser" |
| 5 | Reactive Resume's templates are not ported. | Convergence program, 2026-11-06 | `05-resume-schema-imports-check.md` |
| 6 | Options 1 (`compact`) and 5 (keep the payload on disk) are not built. `compact` prints 7.5pt and splits its headings; the envelope stays in memory, so the fallback needs no file. | Session | "Type size", plan Task 4 |
| 7 | Options 2, 3 and 6 are built, with a `dense` template in place of a spacing ladder. | Session, pending the owner's go-ahead on the plan | Plan |

## Not tested

- More than one writer run. The probe above is a single sample.
- A real parser. No layout here has been run through Textkernel, RChilli or a Workday upload. The plan ends with that check, run by the owner.
- DOCX output. Both vendors prefer it and `lib/resume/export/docx.mjs` exists, but how its layout parses is untested.
- Whether ATS parsers read `compact`'s two-column label layout as well as the base layout.

## Outcome (2026-11-19)

Built on branch `feat/cv-dense-template` from the plan, all six tasks.

What shipped:

- A `volunteer[]` payload section, rendered after Skills in every shipped CV template.
- A template with no competencies slot gets the competencies as a Skills row, in the HTML and the markdown build.
- `templates/dense/`: 9.5pt body type, line height 1.15, 0.5in margins, one entry per role with the title on one line and employer, location and dates on the next.
- The web run counts the pages of the built CV in an isolated render. Over the limit, it rebuilds once in `dense` and says so. When the count or the rebuild fails, it keeps the first build and warns.
- The pdf prompt states the page limit and the keep-every-section rule.

Measured on `tests/fixtures/cv-long-single-employer.json` (1,195 words, five roles at one employer, Volunteer and eight competencies):

| Where | Base | `dense` | Lines on page 2 in `dense` |
|---|---|---|---|
| macOS, local fonts | 3 pages | 2 pages | 44 |
| `career-ops-server` image with the branch's code, Liberation Sans | 3 pages | 2 pages | 45 |

`dense` body text computes to 12.667px in Chromium, which is 9.5pt. The type size in the server-image PDF itself was not measured.

Review before the push found three defects, all fixed on the branch: a profile with `cv.locked_sections` made the page count fail, because the isolated render had no `cv.md`; a failed count looked the same as a CV that fits; and three behaviors had no test that failed when they broke.

PR review found more, all fixed on the branch. A locked Skills section no longer takes the competencies fold, so `dense` builds with `cv.locked_sections: [skills]`. The ATS variant is built in `dense` when the styled CV falls back, and the long fixture's ATS variant went from 3 pages to 2. The dense build is counted once, and a count still over the limit is reported with its likely cause, a profile `style.font_size` above 9.5pt. `dense` gained the Interests section, and a fallback with a photo says the photo was left out. A failed page count now logs the renderer's reason. New tests cover the profile's page limit reaching the fit step and the prompt, and Volunteer in the DOCX and markdown exports. A locked Volunteer section now builds, because the entry renders in the order cv.md writes it. The six templates that had no Volunteer slot now carry one after Skills, so a payload with Volunteer keeps it in any shipped template, and their output without Volunteer is unchanged byte for byte.

Not known yet:

- What a real parser makes of the `dense` layout. The owner's check (one Workday upload, the Textkernel and Affinda demos) comes after the deploy. Its result belongs here.
- Whether the writer follows the new prompt rule. One probe run, before this work, kept every bullet.

Left as it is: a Volunteer item with no organization in the resume model is dropped from the payload without a report, as an award, certification or education item missing its required field already is.
