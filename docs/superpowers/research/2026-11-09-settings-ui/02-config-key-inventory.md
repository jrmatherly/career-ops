# Config-file key inventory (settings UI research, 2026-11-09)

Scope: keys the product reads from user-layer config files. Environment variables are covered elsewhere. Evidence is `git grep` plus reading the cited lines in this checkout. Anything marked **inferred** was not read directly. Only shipped examples were read, never a real user file.

Column key: **Freq** is `often` (tuned during a search), `setup` (once at onboarding) or `rare`. **Writer** is the existing script or route that writes the key today. "hand edit" means none. All line numbers are in `/Users/jason/dev/career-ops`.

Legend for writers used below:
- `OW` = `onboard-write.mjs` `buildProfile` (line 240) / `buildPortals` (line 280). Create-time only. Existing files are kept unless `--force`, and `--force` rebuilds the whole file from the template.
- `API-P` = `web/src/app/api/profile/route.ts` POST (line 64), `patchToProfile` at line 46.
- `API-C` = `web/src/app/api/followups/cadence/route.ts` POST (line 138, revision-guarded).
- `API-PT` = `web/src/app/api/portals/route.ts` POST (line 21).
- `PE` = `web/src/lib/profile-yaml-edit.mjs` `patchProfileText` (line 202), the text editor under API-P and API-C.

Counts (table rows, counted with awk): config/profile.yml 103 rows (18 are `style.*` tokens, 4 are undocumented keys: `candidate.credentials`, `candidate.chinese_name`, `rejection_latency.courtesy_days`, `table_freshness.max_age_months`), portals.yml 71 rows (about 85 leaf keys, since `parser.*`, `dayforce_boards[].*`, `seek_searches[].*`, `search_queries[].*` and `by_title_keyword.*` are grouped), config/plugins.yml 7 rows, config/privacy.yml 14 rows (plus open-ended `protected.*`), config/cv-facts.json 4, data/blacklist.md 4 columns, data/scheduled-jobs.json 9 setting rows, templates/states.yml 0 (system file).

---

## 1. config/profile.yml

Example: `config/profile.example.yml`. Validator: `validate-profile.mjs`. Its known-key set is derived from the example, including commented `# key:` lines at column 0 (`knownKeysFromExample`, line 80), plus two undocumented keys (`UNDOCUMENTED_KEYS`, lines 64-67). Unknown top-level keys WARN only. Only `spend_tier`, `language`/`language.output`, `cv`/`cv.output_format` are value-checked (lines 141-204). Nested unknown keys are never checked.

### 1.1 candidate

| Key | Read at | Type / default / bad value | Controls | Writer | Freq | Notes |
|---|---|---|---|---|---|---|
| candidate.full_name | web/src/lib/pdf-paths.mjs:78; web/src/lib/apply/cv.ts:100; prepare-application.mjs:~170 (+3); scripts/export-ats-text.mjs:173; agent prompt: modes/pdf.md:62, modes/cover.md:31, modes/email.md:122 | string; absent gives empty name; no validation | Your name on CVs, filenames, application forms | OW (line 242), API-P (line 49) | setup | Required by OW (`required`, line 148). Example value is a placeholder person; `firstProfileText` blanks it on first web seed (profile-yaml-edit.mjs:220). |
| candidate.title | agent prompt: modes/pdf.md:273 then payload to build-cv-html.mjs:789 | string; blank means no title element | Headline under your name on the CV | hand edit | rare | Commented out in example (line 11). OW does not write it. |
| candidate.email | followup-cadence.mjs:691; utils/privacy-filter.mjs:104; scripts/export-ats-text.mjs:174; agent prompt: modes/email.md, modes/cover.md:31 | string; no validation | Contact email; also marks "your own address" so follow-ups do not chase you | OW (242), API-P (50) | setup | Required by OW. |
| candidate.years_of_experience | scan.mjs:1558-1569 (`loadCandidateYears`); jd-years.mjs:461-466 | number 0-60; absent leaves `experience_filter` off with a warning; non-number warns and is ignored | Your years, for the JD experience filter | OW (254-258, uncomments line) | setup | Commented out in example. OW validates 0-60 (113-115). Writing it needs to uncomment or add a key. |
| candidate.alternate_emails | followup-cadence.mjs:697; utils/privacy-filter.mjs:101 | list of strings (mapping tolerated in privacy-filter); non-array ignored in followup-cadence | Other addresses that are also you | hand edit | rare | Commented out in example. |
| candidate.phone | prepare-application.mjs:174 region; scripts/export-ats-text.mjs:175; agent prompt: modes/cover.md:31, modes/email.md | string, may be empty | Contact phone | OW (CONTACT_KEYS, line 19), not API-P | setup | |
| candidate.wechat | agent prompt: modes/email.md:126,138 | string, blank omitted | WeChat line in email contact blocks | hand edit | rare | No code reader (git grep). |
| candidate.location | salary-gap.mjs:1536; scripts/export-ats-text.mjs:176; agent prompt: modes/cover.md:31 | string | Free-text home location on CVs, and salary-gap geography | OW (242), API-P (51) | setup | Distinct from `location.*` block. |
| candidate.linkedin | scripts/export-ats-text.mjs:177; prepare-application.mjs:176 region; utils/privacy-filter.mjs:32; agent prompt: modes/cover.md:31 | string | LinkedIn URL | OW (CONTACT_KEYS) | setup | |
| candidate.portfolio_url | prepare-application.mjs:178; utils/privacy-filter.mjs:27,32 | string | Portfolio link used when filling forms | OW (CONTACT_KEYS), profile-yaml-edit.mjs:220 lists it as example-person | setup | |
| candidate.github | github-evidence.mjs:971; utils/privacy-filter.mjs:32; agent prompt: modes/cover.md:31 | string, normalized to a username (`normalizeGithubUser`, line ~118) | Which GitHub account `expand` mode collects evidence for | OW (CONTACT_KEYS) | setup | |
| candidate.twitter | utils/privacy-filter.mjs:32 (redaction only) | string | Social URL | OW (CONTACT_KEYS) | rare | No mode or other code reads it (git grep of modes/pdf, cover, email, apply). |
| candidate.photo | build-cv-html.mjs:148 (`profilePhotoValue`) | string path or data URL; non-string gives empty (no photo) | Opt-in CV photo | hand edit | rare | Only the profile value may be a local path (#5094), so it must stay in profile.yml, not the payload. |
| candidate.photo_style | build-cv-html.mjs:173,780 | `rounded` (default) / `circle` / `square`; other values fall back to `rounded` (line 780) | Photo framing | hand edit | rare | |
| candidate.credentials | agent prompt: modes/cover.md:32 | free value; absent derives from cv.md | Credentials line in cover letters | hand edit | rare | **Read, absent from example.** |
| candidate.chinese_name | agent prompt: modes/email.md:123 | string | Chinese name in email drafts | hand edit | rare | **Read, absent from example** (mode file says so itself). |

### 1.2 target_roles, narrative, compensation, location, disability, sg

| Key | Read at | Type / default / bad value | Controls | Writer | Freq | Notes |
|---|---|---|---|---|---|---|
| target_roles.primary | providers/_profile-keywords.mjs:53; web/src/lib/profile-keywords.mjs (mirror); agent prompt: modes/project.md:5 | list of strings; non-array yields `[]`, never throws | Search keyword seeds and the evaluation North Star | OW (243), API-P (53, first 6 only) | often | List writes are supported by PE. |
| target_roles.archetypes | providers/_profile-keywords.mjs:54 (reads `[].name` only); agent prompt via modes/_profile.md | list of `{name, level, fit}`; `fit` primary/secondary/adjacent (OW coerces others to primary, line 105) | Archetype fit scoring | OW (244, inline flow maps) | setup | PE cannot place a list of mappings (strings only, profile-yaml-edit.mjs:155). |
| narrative.headline | scripts/export-ats-text.mjs:179 only | string | ATS text summary fallback | OW (245) | setup | No English mode reads it from profile.yml; modes/_profile.md is the live home (git grep). |
| narrative.exit_story | agent prompt: modes/pdf.md:56; scripts/export-ats-text.mjs:180; localized modes/*/_shared.md:85 | string | Narrative injected into CV summary | OW (246) | setup | |
| narrative.superpowers | none found | list of strings | (nothing reads it) | OW (247) | setup | **Example key with no reader** (git grep of code and modes). |
| narrative.proof_points | localized modes/*/_shared.md:111 (comment only) | list of `{name, url, hero_metric}` | (no active reader) | OW (248) | setup | **Example key with no active reader.** |
| narrative.dashboard | localized modes/*/_shared.md:111 (comment only) | `{url, password}`; commented in example | Demo link | hand edit | rare | **No active reader.** Holds a password field, treat as sensitive. |
| compensation.target_range | salary-gap.mjs:1519; agent prompt: modes/interview-prep.md:214 | string; absent gives no default desired | Target comp, for salary-gap | OW (249), API-P (55, writes `${min}-${max}` with no currency symbol) | setup | |
| compensation.currency | salary-gap.mjs:1520 | string | Currency for the target | OW, API-P (56) | setup | |
| compensation.minimum | agent prompt: batch/batch-prompt.md:155; batch/README.md:114 | string; walk-away number that can stop an evaluation | Hard comp floor | OW (249) | setup | Not in `EXAMPLE_PERSON` write list for API-P. |
| compensation.location_flexibility | no code reader | string | Free-text remote/on-site preference | OW, API-P (57) | setup | Only written, never read by code (git grep). |
| location.country | scan.mjs:1542-1550 (`loadCandidateCountry`); company-history.mjs:742; agent prompt: modes/oferta.md:439 | string; non-string gives empty | Your country (country-eligibility filter no-ops for "United States", scan.mjs:1195) | OW (250) | setup | |
| location.city | none found | string | (nothing reads it) | OW | setup | **Example key with no reader.** |
| location.timezone | assessment-log.mjs:256; ics-interview.mjs:552 | string | Deadline display and interview invite times | OW | setup | |
| location.visa_status | agent prompt: batch/batch-prompt.md:221, modes/oferta.md:140 | string | Free-text work-authorization fallback | OW | setup | |
| location.authorized_in | agent prompt: batch/batch-prompt.md:214, modes/oferta.md:140 | list of strings | Countries where you can work without sponsorship | OW (252) | setup | PE supports it (list). |
| location.needs_sponsorship | agent prompt: batch/batch-prompt.md:214 | bool; absent treated false | Whether sponsorship is a blocker | OW (253) | setup | PE does not list it (booleans are supported, but it is not in `EXAMPLE_PERSON`). |
| location.onsite_availability | none found | string; commented in example | (nothing reads it) | hand edit | rare | **Example key with no reader.** |
| sg.work_status | agent prompt: modes/sg/offer.md:30,65; modes/sg/apply.md:20 | citizen/pr/pass-holder/foreign; absent treated foreign | Singapore work status | hand edit | rare | Commented in example. |
| disability.br_pcd_quota_eligible | agent prompt: modes/oferta.md:161 | bool | Lets evaluation notice Brazil PcD quota openings | hand edit | rare | Never auto-discloses. Commented in example. |

### 1.3 language, follow-ups, session, GitHub, spend, privacy

| Key | Read at | Type / default / bad value | Controls | Writer | Freq | Notes |
|---|---|---|---|---|---|---|
| language.output | profile-language.mjs:40; validate-profile.mjs:164; agent prompt: modes/_shared.md:265 (+75 refs) | one-line string up to 64 chars; default `en`; bad value is an **error** in validate-profile.mjs:164-177 and is normalized to `en` by readers | Language of reports, CVs, letters | hand edit (OW does not write it) | setup | Also drives zh-CN PDF typography (example comment). |
| language.modes_dir | gemini-eval.mjs:146; agent prompt: AGENTS.md "Output Language vs Market Modes" | string or list of dirs; path escaping the root or missing dir is skipped with a warning (gemini-eval.mjs:126-139) | Market vocabulary pack (modes/de etc.) | hand edit | setup | Commented in example; a list is allowed. Must stay inside project root. |
| follow_ups.enabled | followup-cadence.mjs:108; followup-seed.mjs:728; web/src/lib/followups-setting.mjs; agent prompt: modes/apply.md:424 | bool; only an explicit `false` turns off | Turns follow-up scheduling and the web page off | API-C (line 212 region) | rare | Commented in example. PE adds the section if absent. |
| followup_cadence.applied_first_days | followup-cadence.mjs:93-100 | integer >= 0 (strings of digits accepted); default 7 (line 59); bad value silently dropped to default | Days after applying to first follow up | API-C | often | Web route also re-parses with `Number.parseInt` (cadence/route.ts:130). |
| followup_cadence.applied_subsequent_days | followup-cadence.mjs:93 | integer >= 0; default 7 | Gap between later follow-ups | API-C | often | |
| followup_cadence.applied_max_followups | followup-cadence.mjs:93 | integer >= 0; default 2 | Max follow-ups per application | API-C | often | Key has no `_days` suffix (cadence/route.ts maps it). |
| followup_cadence.responded_initial_days | followup-cadence.mjs:93 | integer >= 0; default 1 | After a company responds | API-C | often | |
| followup_cadence.responded_subsequent_days | followup-cadence.mjs:93 | integer >= 0; default 3 | | API-C | often | |
| followup_cadence.interview_thankyou_days | followup-cadence.mjs:93 | integer >= 0; default 1 | Thank-you timing after interviews | API-C | rare | |
| session_title | agent prompt: .agents/skills/career-ops/SKILL.md:145 (also tests/session-title-rule.test.mjs:144) | `auto` (default) / `off`; commented in example | Whether the agent renames the host session | hand edit | rare | Top-level scalar: PE cannot edit it (see section 7). |
| github_evidence.private_allowlist | github-evidence.mjs:131 (`readPrivateAllowlist`); 990 | list of `owner/repo`; invalid entries dropped and reported (978) | Private repos usable as evidence | hand edit | rare | |
| github_evidence.read_readmes | github-evidence.mjs:990 | bool; only `true` enables | Read allowlisted READMEs | hand edit | rare | |
| spend_tier | batch-evaluate-gemini.mjs:91 (regex); batch/batch-runner.sh:661 (shell regex); agent prompt: modes/_shared.md:57-59 | `economy` / `standard` (default) / `premium`; **bad value is an error** (validate-profile.mjs:141-152); batch-runner falls back to standard with a WARN (batch-runner.sh:693) | Model tier for evaluations | OW (259-261) | often | **Read by regex line match in two places**, so keep it a one-line top-level `spend_tier: value`. PE cannot edit top-level scalars. |
| privacy.redact_contact_info | utils/privacy-filter.mjs:60 (via 53-61) | bool; absent or non-bool means off | Swap your name and contact for placeholders in hosted-model prompts | hand edit | setup | Different file from config/privacy.yml. |

### 1.4 Layout, CV, theme

| Key | Read at | Type / default / bad value | Controls | Writer | Freq | Notes |
|---|---|---|---|---|---|---|
| page_format | lib/page-format.mjs:133-163 | `letter` (default) / `a4` / `auto` (country-based); case-insensitive; bad value falls back to letter silently | Paper size for CV and cover letter | hand edit | setup | Top-level scalar. |
| cv.output_format | modes/auto-pipeline.md:69 (agent prompt); validate-profile.mjs:191-203 | `html` (default) / `latex` / `text`; **bad value is an error** in the validator | Which CV artifact the pipeline produces | hand edit | setup | |
| cv.canva_resume_design_id | agent prompt: modes/pdf.md:353; modes/_shared.md:282 | string starting with D, 11 chars | Optional Canva path | hand edit | rare | Commented in example. |
| cv.template | cv-templates.mjs:40,751 | kebab-case name; resolves to templates/ or data/templates/; unknown name throws or falls back (inferred, not read to the end) | Default CV template | hand edit | setup | Commented in example. Choices come from `cv-templates.mjs` listing. |
| cv.sections | theme-style.mjs:165-190 (`readCvSectionOrder`); generate-pdf.mjs:1234-1291 | list of section names (summary, competencies, experience, projects, education, certifications, awards, skills); unknown names warn and are ignored; one name warns and does nothing | Section order in HTML CVs | hand edit | rare | HTML output only. |
| cv.max_pages | theme-style.mjs:206-235; generate-pdf.mjs:1364 (default 2), 1875, 2066-2092 | positive integer (digit strings accepted); **set-but-bad value stops a CV render** with a message | CV page budget | OW (263-269 uncomments) | setup | Commented in example. |
| cv.strict_pages | theme-style.mjs:226; generate-pdf.mjs:1378 | bool; bad value stops the render | Overflow fails instead of warns | OW | setup | |
| cv.locked_sections | theme-style.mjs:113-134 | string or list of non-empty strings; **other types throw `TypeError`** | Sections the AI may not edit | hand edit | rare | Enforced for HTML/PDF only. |
| style.accent_color | theme-style.mjs:47-86,143-151 | non-empty string or finite number; else ignored silently | CSS token for headings and tags | hand edit | rare | All 18 `style.*` keys share one reader and rule (theme-style.mjs:143-151). Block commented in example. |
| style.secondary_color | theme-style.mjs:49 | as above | | hand edit | rare | |
| style.tag_color | theme-style.mjs:50 | as above | | hand edit | rare | |
| style.tag_bg | theme-style.mjs:51 | as above | | hand edit | rare | |
| style.tag_border | theme-style.mjs:52 | as above | | hand edit | rare | |
| style.font_family | theme-style.mjs:53 | as above | | hand edit | rare | |
| style.font_size | theme-style.mjs:54 | as above | | hand edit | rare | |
| style.margin | theme-style.mjs:55 | as above | | hand edit | rare | |
| style.job_break_inside | theme-style.mjs:64 | `avoid` / `auto` (break-inside keyword) | Keep roles whole across pages | hand edit | rare | |
| style.project_break_inside | theme-style.mjs:78 | as above | | hand edit | rare | |
| style.heading_font_family | theme-style.mjs:79 | as above | | hand edit | rare | |
| style.heading_font_size | theme-style.mjs:80 | as above | | hand edit | rare | |
| style.line_height | theme-style.mjs:81 | string or bare number | | hand edit | rare | |
| style.section_gap | theme-style.mjs:82 | as above | | hand edit | rare | |
| style.item_gap | theme-style.mjs:83 | as above | | hand edit | rare | |
| style.text_color | theme-style.mjs:84 | as above | | hand edit | rare | |
| style.background_color | theme-style.mjs:85 | as above | | hand edit | rare | |
| style.sidebar_width | theme-style.mjs:86 | as above; compact template only | | hand edit | rare | |
| latex.source | agent prompt: modes/latex-tex.md:23; lib/latex-content.mjs:327 (hint text only) | path string | Your own .tex for `latex-tex` mode | hand edit | rare | Commented in example. No code reads it (git grep). |
| culture_screen.require | agent prompt: modes/_shared.md:124 | list of strings; absent or empty skips the cap | Culture criteria that cap the "Cultural signals" score | hand edit | rare | Commented in example. PE supports string lists. |
| culture_screen.deprioritize_if_absent | agent prompt: modes/_shared.md:129 | bool; default false (neutral 3/5) | Cap at 2/5 when no evidence | hand edit | rare | |

### 1.5 Cover letter, outreach, email

| Key | Read at | Type / default / bad value | Controls | Writer | Freq | Notes |
|---|---|---|---|---|---|---|
| cover_letter.notice_period_days | agent prompt: modes/cover.md:33,147 | integer days; absent omitted | Prompt default for immediate-start JDs | hand edit | rare | Active (not commented) in example. |
| cover_letter.template | cv-templates.mjs:45,751; generate-cover-letter.mjs:315 | kebab-case name of cover-letter-template.<name>.html | Default cover letter template | hand edit | rare | Commented in example. |
| cover_letter.primary_domain | agent prompt: modes/cover.md:34,59,140 | string; absent infers from cv.md | Domain-gap detection | hand edit | rare | |
| cover_letter.language_learning | agent prompt: modes/cover.md:35,153 | list of `{language, current_level, target_level, target_date, sentence, countries[]}`; absent means empty | Optional closing sentence in another language | hand edit | rare | List of mappings, so PE cannot write it. |
| contact_preferences.preferred_channel | agent prompt: modes/contacto.md:154; modes/email.md:135 | `email` / `phone` / `either` (default) | Steers outreach CTAs | hand edit | rare | Commented in example. |
| contact_preferences.note | agent prompt: modes/contacto.md:163; modes/email.md:136 | one-line string | Contact note in drafts | hand edit | rare | |
| outreach.greeting_max_chars | agent prompt: modes/contacto.md:198,215 | integer; default 150 | Character budget for first-touch messages | hand edit | rare | |
| application_email.include_contact_block | agent prompt: modes/email.md:132 | bool | Email draft contact block | hand edit | rare | |
| application_email.include_attachment_checklist | agent prompt: modes/email.md:133 | bool | Attachment checklist in drafts | hand edit | rare | |
| application_email.default_sender_note | agent prompt: modes/email.md:131,493 | string | Replaces printing your address | hand edit | rare | |
| application_email.signature_name | agent prompt: modes/email.md:134 | string | Signature name | hand edit | rare | |

### 1.6 Scan and pipeline

| Key | Read at | Type / default / bad value | Controls | Writer | Freq | Notes |
|---|---|---|---|---|---|---|
| scan.extractor | browser-extract.mjs:92-107; doctor.mjs:1217; agent prompt: modes/auto-pipeline.md:18 | `mcp` (default) / `cli`; anything else gives `mcp` | How SPA job pages are read | hand edit | rare | Commented in example. |
| scan.timeout_seconds | web/src/lib/core/scan-timeout.mjs:19-26; scan.ts:163 | positive number or numeric string; default 230 (`DEFAULT_SCAN_TIMEOUT_MS`, line 10); bad value gives default | Web Explore scan time budget | hand edit | rare | Web error text tells user to edit this by hand (scan-merge.mjs:58). |
| auto_pdf_score_threshold | agent prompt: modes/pipeline.md:63; batch/batch-prompt.md:733 | number; default 3.0; 0 means PDF for everything | Score needed to auto-generate a PDF | hand edit | often | Top-level scalar. Commented in example. |
| pipeline.triage_threshold | agent prompt: modes/triage.md:116 only | number; default 3.5 | Triage pass cutoff | hand edit | rare | **Example text says `/career-ops pipeline` uses it, but modes/pipeline.md never references triage** (git grep). Only the standalone triage mode reads it. |
| pipeline.triage_min_urls | **none** (git grep finds only the example and a skill note) | number; default 5 per example | (documented, nothing reads it) | hand edit | rare | **Example key that nothing reads.** |
| pipeline.auto_evaluate_daily_cap | lib/evaluate-queue.mjs:28,172-185 (`readDailyCap`) | integer >= 0; default 10; bad value warns on stderr and uses 10; non-ENOENT read errors throw | Max auto evaluations started per UTC day | hand edit | often | Commented in example. Absent section is appended by PE. |
| re_apply_windows.<Company> | scan.mjs:1572-1601 (`loadReApplyWindows`); 1616 | mapping per company; entries with bad shape are **silently skipped** | Skip new postings at a company during a cooldown | hand edit | rare | Three levels deep, so PE cannot write it. Commented in example. |
| re_apply_windows.<Company>.same_role_days | scan.mjs:1586,1616 | integer >= 0 | Same-role cooldown | hand edit | rare | |
| re_apply_windows.<Company>.cross_role_bucket | scan.mjs:1597 | string | Cross-role grouping label | hand edit | rare | |
| re_apply_windows.<Company>.applied_to | scan.mjs:1595-1596 | list of strings | Roles already applied to | hand edit | rare | |
| re_apply_windows.<Company>.last_apply_date | scan.mjs:1583 | `YYYY-MM-DD` string; bad value skips the entry | Start of the window | hand edit | rare | |
| rejection_latency.courtesy_days | rejection-latency.mjs:690 | integer; default 30 per file header (line 23) | Days of silence before flagging a company | hand edit | rare | **Read, absent from example** (validate-profile.mjs:65). |
| table_freshness.max_age_months | check-table-freshness.mjs:281-292 | integer; invalid value reported as a warning, falls back | Review-due age for jurisdiction tables | hand edit | rare | **Read, absent from example** (validate-profile.mjs:66). |

---

## 2. portals.yml

Template: `templates/portals.example.yml` (about 3,800 lines; 183 tracked_companies entries, 32 job_boards entries, 43 search_queries). Authoritative top-level key list: `PORTAL_TOP_LEVEL_KEYS` in `validate-portals.mjs:214-240`. `scan.mjs` **exits with an error** on a top-level key within edit distance 2 of a known key (scan.mjs:4655-4666), and ignores other unknown keys. `validate-portals.mjs` is the shape validator (errors and warnings). It is shape-checking only; `scan.mjs` re-checks at startup for the numeric/boolean items marked.

Existing writers: `OW buildPortals` (positive/negative titles, `max_posting_age_days`, `experience_filter`, `location_filter.always_allow/allow`, create-time only); `API-PT` (only `title_filter.positive` and `location_filter.allow`, via `patchPortalFiltersText`); `fix-slugs.mjs` (rewrites a failing company's ATS slug as text, dry-run by default); `discover-ats.mjs --write` (appends resolved companies to `tracked_companies`, line 1104). Everything else is hand edit.

### 2.1 Filters (apply to every scan)

| Key | Read at | Type / default / bad value | Controls | Writer | Freq | Notes |
|---|---|---|---|---|---|---|
| title_filter.positive | title-keywords.mjs:400; scan.mjs:4667; web/src/lib/core/portals.ts:89 | list of strings, `word:`/`stem:` prefixes allowed; empty means "no positive constraint"; non-list is a validate error | Titles you want | OW, API-PT (text edit), web Explore seed | often | Comments inside the list survive API-PT. Tuned often. |
| title_filter.negative | title-keywords.mjs:400 | list; template ships many | Titles you reject | OW (adds, drops conflicting shipped ones, 283-303) | often | OW refuses a negative that rejects one of your positives (144). API-PT does not touch it. |
| title_filter.seniority_boost | agent prompt: modes/scan.md:31,232 | list | Manual-pass ordering hint | hand edit | rare | **Read by an agent running modes/scan.md only.** scan.mjs and scan-ats-full.mjs ignore it (template comment, lines 739-741). |
| title_filter_full.positive | scan-ats-full.mjs:196,706; coverage-check.mjs:200 | list; overrides title_filter for the reverse sweep | Wider net for `scan:full` | hand edit | rare | **Not in the example** (validate-portals.mjs:217,291). Misspelled fields are errors (299). |
| title_filter_full.negative | scan-ats-full.mjs:196 | list | | hand edit | rare | |
| title_filter_full.seniority_boost | validate-portals.mjs:219 | list | none | hand edit | rare | Validated, no reader of values. |
| title_filter_overrides[].companies | scan.mjs:344 (`buildTitleFilterOverrides`); scan-ats-full.mjs:1290 | list of slugs | Companies given a wider title net | hand edit | rare | Commented in example. |
| title_filter_overrides[].positive_extra | scan.mjs:344 | list | Extra positives for those companies | hand edit | rare | |
| skip_tiers | scan.mjs:4673; classify-tier.mjs:24 | list from intern/entry/mid/senior; non-list ignored; per-entry `skip_tiers` replaces it, `[]` disables | Skip by seniority tier | hand edit | often | Commented in example. Top-level list: supported by neither API-PT nor PE. |
| location_filter.always_allow | scan.mjs:723-806 (`buildLocationFilter`); scan-ats-full.mjs:1292 | list; `"United States"` also admits "City, ST" | Home-region rescue list | OW (331) | often | |
| location_filter.allow | scan.mjs:723-806; web/src/lib/core/portals.ts:91 | list; empty means pass | Places you want | OW (332), API-PT | often | |
| location_filter.block | scan.mjs:723-806 | list | Places you reject | hand edit | often | |
| location_filter.block_hard | scan.mjs:723-806 | list; cannot be overridden by always_allow | Countries never wanted | hand edit | rare | |
| location_filter.strict | scan.mjs:752; validate-portals.mjs:421 | bool; **non-bool is a validate error**; only acts when a restricting tier exists | Reject postings with no location | hand edit | rare | |
| location_filter.remote_title_fallback | scan.mjs:792; validate-portals.mjs:424 | bool; default true; non-bool is a validate error | Explicit "Remote" title can admit a posting | hand edit | rare | |
| location_filter.workplace_policy.onsite_locations | providers/_country.mjs:180-190; validate-portals.mjs:407-415 | list; **both onsite_locations and remote_countries required or the scan throws** | Conditional office/remote geography | hand edit | rare | Malformed policy aborts the scan (`workplacePolicyFromConfig`, providers/_country.mjs:164-178). Web copies it into ad-hoc Explore scans (web/src/lib/core/portals.ts:48-56). |
| location_filter.workplace_policy.onsite_countries | providers/_country.mjs:186,244 | list; default is remote_countries | | hand edit | rare | |
| location_filter.workplace_policy.remote_countries | providers/_country.mjs:187 | list of countries or ISO codes | | hand edit | rare | |
| location_filter.workplace_policy.remote_regions | providers/_country.mjs:187 | list | | hand edit | rare | |
| country_eligibility_filter.exclusionary | scan.mjs:1183-1210 | list of substrings; no-op when `location.country` is United States | Drop remote roles restricted to other countries | hand edit | rare | Reads `location.country` from profile.yml. |
| country_eligibility_filter.inclusive | scan.mjs:1183-1210 | list | Phrases that rescue | hand edit | rare | |
| salary_filter.min | scan.mjs:1325-1345 (`buildSalaryFilter`) | number >= 0; negative or non-finite gives a warning and the filter is **disabled** | Annual comp floor | hand edit | often | Commented in example. |
| salary_filter.max | scan.mjs:1325-1345 | number >= 0; 0 means no cap; min > max disables the filter | Annual comp ceiling | hand edit | rare | |
| salary_filter.currency | scan.mjs:1325-1345 | string; mismatched currencies reject | Currency of the bounds | hand edit | rare | |
| max_posting_age_days | scan.mjs:807-815, 4679; scan-ats-full (inferred) | positive integer; absent, 0 or non-integer disables | Freshness cutoff | OW (314-318, template ships it commented) | often | OW default 45 (line 18). |
| experience_filter.enabled | jd-years.mjs:456-473 (`resolveExperienceFilter`); scan.mjs:4698-4707 | bool; non-bool turns the filter **off** with a reason | Turn the JD-years filter on | OW (323) | setup | Needs `candidate.years_of_experience` or `.years`. |
| experience_filter.stretch_years | jd-years.mjs:456-473 | number 0-60; default 1; bad value falls back to 1 at runtime but is a validate error | Allowed gap above your years | OW | setup | |
| experience_filter.action | jd-years.mjs:456-473 | `label` (default) / `drop` | Mark or remove above-band postings | OW | setup | |
| experience_filter.years | jd-years.mjs:456-473 | number 0-60 | Overrides profile years for scanning | hand edit | rare | |
| experience_filter.concurrency | jd-years.mjs:456-473 | integer 1-16; default 4 | Parallel JD requests | hand edit | rare | |
| trust_filter.enabled | providers/_trust-validator.mjs:186-190 | bool; absent or false gives every job score 100 | Annotate jobs with a trust score (never drops) | hand edit | rare | Commented in example. |
| trust_filter.suspicious_domains | providers/_trust-validator.mjs:192 | list; default built-in list | Flag link shorteners etc. | hand edit | rare | |
| trust_filter.ats_allowlist | providers/_trust-validator.mjs:198 | list; default built-in | Domains skipping the mismatch check | hand edit | rare | |
| content_filter.positive | scan.mjs:1063-1111 (`buildContentFilter`) | list, `word:`/`stem:` prefixes, ` | ` joins spellings; empty passes | JD must mention one | hand edit | often | |
| content_filter.negative | scan.mjs:1063-1111 | list | JD must not mention | hand edit | often | |
| content_filter.min_match | validate-portals.mjs:137-144; scan.mjs:965-990 (`compileContentRule`) | integer 1..N distinct positives; **scan.mjs exits at startup otherwise** (`buildContentFilterOrExit`, scan.mjs:1113) | Require several positive traits | hand edit | rare | |
| content_filter.rescue_title_misses | scan.mjs:1063-1111 | bool; true needs non-empty positive or the scan exits | Keep a title miss when the JD matches | hand edit | rare | |
| content_filter.by_title_keyword.<kw>.{positive,negative,min_match} | scan.mjs:1063-1111 | mapping keyed by a title_filter.positive keyword | Stricter JD rule for one title keyword | hand edit | rare | Counted as 1 key group (3 leaves). Mismatching key is a validate warning. |
| visa_filter.enabled | scan.mjs:1294-1311, 4696; validate-portals.mjs:474-487 | bool; non-bool is a validate error | Sponsorship filter on/off | hand edit | setup | Commented in example. |
| visa_filter.require_mention | scan.mjs:1294-1311 | bool; default false | Only roles advertising sponsorship | hand edit | rare | |
| visa_filter.positive | scan.mjs:1294-1311 | list; default curated vocabulary | | hand edit | rare | |
| visa_filter.negative | scan.mjs:1294-1311 | list; default curated vocabulary | | hand edit | rare | |
| domain_filter | scan-ats-full.mjs:1306-1311; validate-portals.mjs:321-336 | **bare list** of keywords (not an object); bare `word:`/`stem:` is an error | Skip whole boards outside your industry (reverse sweep only) | hand edit | rare | Commented in example. |
| field_filters.<field>.positive | scan.mjs:4803-4843; validate-portals.mjs:358-400 | list; block with no keyword is a validate error (matches everything) | Whitelist on a declared field (e.g. `noc`) | hand edit | rare | Counted as a group (2 leaves). `title` key is rejected. |
| field_filters.<field>.negative | as above | list | | hand edit | rare | |

### 2.2 History, languages, housekeeping

| Key | Read at | Type / default / bad value | Controls | Writer | Freq | Notes |
|---|---|---|---|---|---|---|
| scan_history.recheck_after_days | scan.mjs:1873 (`scanHistoryPolicy`) | integer >= 0 via `parseInt`; else null (deduped forever) | Let old URLs be rescanned after N days | hand edit | rare | Commented in example. |
| scan_history.dedup_include_location | scan.mjs:1911 | **strictly `true`**; any other value means off | Keep city in company+role dedup | hand edit | rare | |
| scan_history.dedup_include_language | scan.mjs:1933 | strictly `true` | Keep language versions apart | hand edit | rare | |
| preferred_languages | scan.mjs:1949 | list of language codes or one string; non-string entries skipped; validate errors on non-list | Preferred posting language order | hand edit | rare | Commented in example. |
| company_aliases | scan.mjs:2509, 4898; discover-new-companies.mjs:129 | mapping `Canonical: [aliases]` | Dedup brand vs ATS org names | hand edit | rare | Commented in example. |
| portal_prune_quiet_days | stats.mjs:405 | positive number; default 30 | `stats.mjs --prune` threshold | hand edit | rare | |
| portal_health_threshold | scan.mjs:5693; stats.mjs:374,406 | number; default 3 | Failed scans before a board is escalated | hand edit | rare | Value is `||`-defaulted, so 0 also becomes 3. |
| portal_health_stale_days | stats.mjs:373 | number; default 14 | Staleness of health evidence | hand edit | rare | **Read, absent from example** (in PORTAL_TOP_LEVEL_KEYS, validate-portals.mjs:239). |

### 2.3 Sources

| Key | Read at | Type / default / bad value | Controls | Writer | Freq | Notes |
|---|---|---|---|---|---|---|
| tracked_companies[] (list) | scan.mjs:4665; web/src/lib/portals-config.mjs:191 (`watchedCompanies`) | array; non-array is a validate error | Companies the scanner polls | discover-ats.mjs --write (append); fix-slugs.mjs (slug edit) | often | 183 entries ship. The web Portals page only lists them (portals-view.tsx, "edit it directly or ask the assistant"). |
| tracked_companies[].name | scan.mjs:4729; validate-portals.mjs:541 | non-empty string for enabled entries; dup warns | Company label and dedup key | hand edit | often | Entry schema shared with job_boards. |
| tracked_companies[].careers_url | scan.mjs provider detect; validate-portals.mjs:552 | URL; validated | Board to scan | fix-slugs.mjs (ATS slug only) | often | |
| tracked_companies[].api | validate-portals.mjs:553 | URL | Direct JSON API | hand edit | rare | |
| tracked_companies[].provider | validate-portals.mjs:555-565 | id of a loaded provider (providers/ or enabled plugin); unknown is an error | Force a provider | hand edit | rare | |
| tracked_companies[].enabled | scan.mjs:4747-4756; validate-portals.mjs:536 | bool; **only boolean `false` disables** (`no`, `"false"` stay enabled, warned) | Per-company on/off | hand edit | often | The most obvious Settings toggle. 215 `enabled` keys ship in the template (counted). |
| tracked_companies[].scan_method | scan.mjs:4762 | `playwright` (default) / `websearch` / `local_parser` | How an entry is read | hand edit | rare | 69 entries set it. |
| tracked_companies[].scan_query | scan.mjs:4766 | string (websearch entries) | WebSearch query | hand edit | rare | |
| tracked_companies[].notes | none | free string | Human notes | hand edit | rare | No reader (git grep). |
| tracked_companies[].parser.{command,script,args,format,timeout_ms,max_buffer_bytes} | validate-portals.mjs:148-168; scan.mjs local-parser | command required; script/args/timeouts typed | Local parser script | hand edit | rare | Counted as a group (6 leaves). Runs a local command, so a UI must not write it casually. |
| tracked_companies[].filter_on | scan.mjs:283-293 (`normalizeFilterOn`); validate-portals.mjs:581-600 | string or list; must name a `field_filters` block | Gate a target on a declared field | hand edit | rare | |
| tracked_companies[].skip_tiers | scan.mjs:4673-4676 | list; `[]` disables | Per-entry tier skip | hand edit | rare | |
| tracked_companies[].aggregator | scan.mjs:5249 | `true` only | Entry's postings are other employers' | hand edit | rare | |
| job_boards[] (list) | scan.mjs:4666 | array of entries with the same schema plus provider blocks (e.g. `channel`, `since_days`) | Multi-employer boards | hand edit | rare | 32 ship. Provider-specific blocks (amazon, telegram, apify actor/field_map) are per-provider and not inventoried here. |
| search_queries[].name / .query / .enabled | agent prompt: modes/scan.md:28,176,220; coverage-check.mjs:165 | list of `{name, query, enabled}`; validate only checks it is an array | WebSearch discovery queries | hand edit | rare | **No script reads it for scanning.** Only an agent following modes/scan.md does. |
| interamt_searches[].was | scan-interamt.mjs:107-111 | list; absent uses generic German IT keywords | Interamt keyword searches | hand edit | rare | Commented in example. |
| seek_searches[].keyword / .location | scan-seek.mjs:72-75 | list of `{keyword, location?}` or strings | SEEK NZ searches | hand edit | rare | **Read, but not in `PORTAL_TOP_LEVEL_KEYS`**, so a typo of it is not caught. |
| dayforce_boards[].name / .tenant / .board / .culture / .jobBoardId | scan-dayforce.mjs:206-230, 378 | name and tenant required; board default `CANDIDATEPORTAL`, culture `en-US`, jobBoardId `1`; bad entries skipped and counted | Dayforce career sites | hand edit | rare | Group of 5. |

---

## 3. config/plugins.yml

Example: `config/plugins.example.yml`. Loader: `plugins/_engine.mjs` (`pluginStatus` line 441, `pluginSettings` line 449). Writer: `plugins.mjs setPluginEnabled` (line 462) via `enable <id> --confirm` (line 540), which also writes `plugins.lock` (consent card and integrity hash, plugins.mjs:552-562). A plugin loads only if enabled here **and** every `requiredEnv` is present **and** the lock check passes (_engine.mjs:681-691). No web code touches plugins (git grep of `web/src`).

| Key | Read at | Type / default / bad value | Controls | Writer | Freq | Notes |
|---|---|---|---|---|---|---|
| plugins.apify.enabled | plugins/_engine.mjs:441-446 | bool, only `true` counts; requires env `APIFY_TOKEN` (manifest) | Apify job source | `plugins.mjs enable` | setup | Actor and field_map live on a portals.yml entry, not here. |
| plugins.notion.enabled | _engine.mjs:441 | bool; env `NOTION_ACCESS_TOKEN`, `NOTION_PARENT_PAGE_ID` | Tracker export to Notion | `plugins.mjs enable` | setup | |
| plugins.gmail.enabled | _engine.mjs:441 | bool; env `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | Gmail ingest | `plugins.mjs enable` | setup | |
| plugins.gmail.label | plugins/gmail/index.mjs:102 | string; default `Job Leads` | Label to scan | hand edit (or `setEnabled` settings arg, plugins.mjs:462) | rare | Commented in example. |
| plugins.gmail.days_back | plugins/gmail/index.mjs:103-106 | positive integer; default 7; **bad value throws** | Look-back window | hand edit | rare | |
| plugins.h1b-sponsor.enabled | _engine.mjs:441 | bool; no required env (optional `H1B_API_TOKEN`, `H1B_API_BASE`, `H1B_INDEX_PATH`) | H-1B sponsor lookup | `plugins.mjs enable` | setup | Needs a local index install first (plugins/h1b-sponsor/install-h1b-index.mjs). |
| plugins.usajobs.enabled | _engine.mjs:441 | bool; env `USAJOBS_API_KEY`, `USAJOBS_USER_AGENT` | USAJOBS provider | `plugins.mjs enable` | setup | Keywords and location live on the portals.yml entry. |

Only gmail declares settings in code. Other plugins read no `ctx.settings` (git grep over plugins/). Community or `plugins.local/` plugins can add more.

---

## 4. config/privacy.yml

Example: `config/privacy.example.yml`. Reader: `lib/privacy-guard.mjs` `readPrivacyConfig` (line 660). Not read by the web. **No existing writer.** An unparseable or non-mapping file throws `PrivacyConfigError` and the guard **fails closed** (lines 669-692), so a writer must never produce a half-written file.

| Key | Read at | Type / default / bad value | Controls | Writer | Freq | Notes |
|---|---|---|---|---|---|---|
| enabled | lib/privacy-guard.mjs:743 | bool; default true (`!== false`) | Master switch for the guard | hand edit | rare | Turning it off is deliberately awkward. |
| auto_detect.email | lib/privacy-guard.mjs:744; DEFAULT_AUTO_DETECT at 272 | bool; omitted means off (example sets true) | Block any email address in outbound prompts | hand edit | setup | With no privacy.yml, all detection is off (header comment, lines 21-23). |
| auto_detect.phone | privacy-guard.mjs:744 | bool | Block phone-like numbers | hand edit | setup | Loosest pattern. |
| auto_detect.profile_url | privacy-guard.mjs:744 | bool | Block profile URLs | hand edit | setup | |
| protected.full_name | privacy-guard.mjs:688-740 (generic leaf walk) | string; values under 5 chars (or 5 digits) are ignored | Never send this to a model | hand edit | setup | `protected.*` is **open-ended**: any scalar leaf or list item is guarded. The names below are only the example's. |
| protected.email | same | string | | hand edit | setup | |
| protected.phone | same | string, digits-only match | | hand edit | setup | |
| protected.address | same | string | | hand edit | setup | |
| protected.linkedin | same | URL; bare handle also guarded | | hand edit | setup | |
| protected.github | same | URL | | hand edit | setup | |
| protected.portfolio | same | URL | | hand edit | setup | |
| protected.salary.current_base | same | absolute annual number | | hand edit | setup | Short forms are not guarded. |
| protected.salary.target_floor | same | number | | hand edit | setup | |
| protected.custom | same | list of strings | Any other sensitive string | hand edit | setup | Block errors name the YAML key path, not the value (privacy-guard.mjs:617-626). |

---

## 5. Other files that carry settings

| Key / file | Read at | Type / default / bad value | Controls | Writer | Freq | Notes |
|---|---|---|---|---|---|---|
| config/cv-facts.json `allow_metrics` | verify-cv-facts.mjs:2222-2230; web/src/lib/cv-studio/server.ts:170 | array of strings; null becomes `[]`; **non-array throws**; invalid JSON throws (JSON.parse) | Numeric claims the fact gate accepts | hand edit | rare | File absent is a normal state but `missing: true` is surfaced (verify-cv-facts.mjs:2208-2218). cv-voice.mjs:130-140 ignores a broken file. |
| config/cv-facts.json `allow_facts` | verify-cv-facts.mjs:2375 | array | Verified exceptions the gate accepts | hand edit | rare | The gate's error text tells the user to add entries here (2146, 2539). |
| config/cv-facts.json `forbidden_phrases` | verify-cv-facts.mjs:2199,2401 | array | Phrases that fail a CV | hand edit | rare | |
| config/cv-facts.json `warn_phrases` | verify-cv-facts.mjs:2404 | array | Phrases that warn | hand edit | rare | |
| data/blacklist.md (table cols `Company`, `Since`, `Scope`, `Reason`) | scan.mjs:3979 (`loadBlacklist`, `parseBlacklist`); discover-ats.mjs:62; discover-new-companies.mjs:47 | markdown table, every row is live; `Scope` `company` (default) or `domain`; absent file means no filtering | Do-not-apply companies | hand edit (the quiet-companies route only returns a paste-ready row, web/src/app/api/quiet-companies/route.ts:14-15) | rare | Template: `templates/blacklist.example.md`. Shipped example rows are live if copied unedited. |
| data/scheduled-jobs.json `name` | web/src/lib/scheduled-jobs.ts:105-118 | string, trimmed, max 80 | Scheduled scan label | web scheduled-jobs routes | often | Already managed by the web UI (create-job-modal, job-card). |
| ... `status` | scheduled-jobs-store.mjs:61 | `active` / `paused` / `deleted` | Pause or resume | web routes | often | |
| ... `engine` | scheduled-jobs.ts:112 | `full` / `portals`; default `full` | Which scanner | web routes | rare | |
| ... `filtersFrom` | scheduled-job-input.mjs:10 | `custom` / `file` | Own filters or portals.yml's | web routes | rare | |
| ... `evaluate.mode` | scheduled-job-input.mjs:33 | `off` / `review` / `auto` | Auto-evaluate new finds | web routes | often | |
| ... `evaluate.rankThreshold` | scheduled-job-input.mjs:40 | number clamped 1-5, step 0.1; default 3.5 | Minimum rank | web routes | often | |
| ... `evaluate.maxPerRun` | scheduled-job-input.mjs:41 | integer clamped 1-20; default 5 | Evaluations per run | web routes | often | Combines with `pipeline.auto_evaluate_daily_cap` in profile.yml. |
| ... `every` + `unit` | scheduled-jobs.ts:79-92 | `unit` minutes/hours/days (default hours); `every` rounded, min 15 for minutes else 1, max 10,000 | Cadence | web routes | often | Counted as 2 fields. |
| ... `timezone`, `startAt` | scheduled-jobs.ts:93-103,119 | IANA zone validated; ISO timestamp | Schedule anchor | web routes | rare | |
| templates/states.yml | analyze-patterns.mjs:121-124 (read from the code root) | n/a | Canonical tracker states | none (system file) | rare | **Not a user setting.** It ships with the code and `update-system` replaces it. Dashboard Go tests pin it (canonical_states_test.go). |
| config/benchmarks.yml | funnel-velocity.mjs:286 | file path override of templates/benchmarks.yml | Funnel benchmark values | hand edit | rare | Gitignored. Internal keys not inventoried. |
| config/panelist-roles.yml | panelist-roles.mjs:40,373 | only used with explicit `--table` | Panelist role table | hand edit | rare | Never implicit. |
| data/career-profile.yml | career-profile.mjs:26,32 | written only after per-item approval | Source-backed master profile | `career-profile.mjs` | rare | Own review flow, not a settings candidate. |
| modes/_profile.md sections | web/src/lib/personalization-file.mjs (`mergeSections`); api/personalization/route.ts:60 | Markdown sections | Archetypes, narrative, location policy for the agent | `/api/personalization` (section-safe, atomic with .bak) | setup | Markdown, not keys. Listed because the web already has a merge-safe writer for it. |

---

## 6. Summary lists

### (a) Read by code, hand edit only, sorted by how often a user would change them

**often**
1. portals.yml `tracked_companies[].enabled` (per-company on/off).
2. portals.yml `location_filter.block`, `location_filter.always_allow` (OW seeds once, nothing edits later), `title_filter.negative`.
3. portals.yml `skip_tiers`, `salary_filter.min/max/currency`, `max_posting_age_days` (OW sets once at create; no editor).
4. portals.yml `content_filter.positive/negative`.
5. profile.yml `auto_pdf_score_threshold` and `pipeline.auto_evaluate_daily_cap` (both commented out in example).
6. profile.yml `spend_tier` (OW only at create).
7. profile.yml `target_roles.primary` has API-P, but only the first 6 and not the archetypes.

**setup**
8. profile.yml `language.output`, `language.modes_dir`, `page_format`, `cv.output_format`, `cv.template`, `cv.max_pages`, `cv.strict_pages` (OW covers only the last two, create-time).
9. profile.yml `privacy.redact_contact_info`.
10. portals.yml `visa_filter.enabled`, `experience_filter.*` (OW create-time only).
11. config/privacy.yml `enabled`, `auto_detect.*`, `protected.*` (no writer at all).
12. config/plugins.yml `enabled` flags (CLI only, consent and lock required).

**rare**
13. Everything else: `candidate.title/photo/photo_style/alternate_emails`, `style.*` (18), `cv.sections`, `cv.locked_sections`, `culture_screen.*`, `cover_letter.*`, `contact_preferences.*`, `outreach.*`, `application_email.*`, `scan.extractor`, `scan.timeout_seconds`, `re_apply_windows.*`, `github_evidence.*`, `rejection_latency.courtesy_days`, `table_freshness.max_age_months`, `session_title`, every other portals.yml filter and source key, `config/cv-facts.json`, `data/blacklist.md`.

### (b) In examples but read by nothing (or only a comment)

- profile.yml `pipeline.triage_min_urls` (no reader anywhere).
- profile.yml `pipeline.triage_threshold`: read only by modes/triage.md:116. `modes/pipeline.md` has no triage step, although the example says `pipeline` uses it.
- profile.yml `narrative.superpowers` (no reader), `narrative.proof_points` and `narrative.dashboard` (only comment lines in localized modes/*/_shared.md:111), `narrative.headline` (only scripts/export-ats-text.mjs:179).
- profile.yml `location.city`, `location.onsite_availability`, `compensation.location_flexibility` (no reader in code or modes found).
- profile.yml `candidate.twitter` (redaction only), `candidate.wechat` (agent prompt only).
- profile.yml `latex.source`: read by agent prompt modes/latex-tex.md:23 only; no code reads it.
- portals.yml `title_filter.seniority_boost`: read only by a hand-run agent pass (modes/scan.md:232); both scanners ignore it. `title_filter_full.seniority_boost` has no reader.
- portals.yml `tracked_companies[].notes` (no reader), and `search_queries[]` (only an agent following modes/scan.md reads it; no script scans from it).
- Reverse (read, absent from example): profile.yml `candidate.credentials`, `candidate.chinese_name`, `rejection_latency.courtesy_days`, `table_freshness.max_age_months`; portals.yml `title_filter_full`, `portal_health_stale_days`, `seek_searches` (the last is also absent from `PORTAL_TOP_LEVEL_KEYS`); `scan_history.dedup_include_*` are in the template as comments only.

### (c) Existing merge-safe writers

| Writer | Main function (file:line) | Can edit | Cannot edit / limits |
|---|---|---|---|
| `patchProfileText` | web/src/lib/profile-yaml-edit.mjs:202 | `section.key` scalars, booleans and string lists **one level under an existing or new top-level block mapping**, keeping all other lines and trailing comments. Verified by running it against the example: `cv.max_pages`, new `pipeline` and `scan` blocks, and `candidate.alternate_emails` all keep every comment. Result must `isDeepStrictEqual` the caller's merge, or it returns null. | **Top-level scalars** (`spend_tier`, `page_format`, `session_title`, `auto_pdf_score_threshold`) return null (verified), so the callers fall back to `yaml.dump`, which **drops every comment**. Also null for 3-level paths (`re_apply_windows.<Co>.*`, verified), lists of mappings (`archetypes`, `proof_points`, `language_learning`), flow `section: {}`, block scalars and anchors. Cannot delete or comment out a key. Does not uncomment the example's `# key:` lines, it appends a new key at the end of the section (so a placeholder comment stays). |
| `firstProfileText` | web/src/lib/profile-yaml-edit.mjs:236 | Seeds a first profile from the example with the example person blanked (EXAMPLE_PERSON, line 219) | First create only. |
| `/api/profile` POST | web/src/app/api/profile/route.ts:64 | candidate.full_name/email/location, target_roles.primary (max 6), compensation.target_range/currency/location_flexibility. Refuses invalid YAML or a non-mapping file with 409 (lines 99-105). Atomic write with backup (`atomicWriteWithBackup`). | Hard-wired field list (`patchToProfile`, line 46); everything else needs a new route or generalization. No revision guard (the cadence route has one). |
| `/api/followups/cadence` POST | web/src/app/api/followups/cadence/route.ts:138 | `followup_cadence.*` (6) and `follow_ups.enabled`. Revision hash guard against stale tabs (`textRevision`, line 31; 409 on mismatch). Same malformed-file refusal and atomic backup write. | Only those 7 keys. Best template for a generic writer. |
| `loadPortalsDocument` / `patchPortalFiltersText` | web/src/lib/portals-config.mjs:37 / :165 | Text-level replace of `title_filter.positive` and `location_filter.allow`, with comments and commented-out companies preserved. Refuses invalid YAML with kind `invalid-user-config` (409). Seeds from the template when the file is absent. | Only those two lists (`setListInText`, line 116). Returns null for flow or scalar shapes, then `yaml.dump` fallback drops comments. No other portals key and no company edits. |
| `/api/portals` POST | web/src/app/api/portals/route.ts:21 | Wraps the above. Max 24 roles. Atomic write with backup. | Same limits. |
| `serializePortals` | web/src/lib/core/portals-serialize.mjs:31 | Builds an **ephemeral temp file** for web Explore scans (`writeTempPortals`, web/src/lib/core/portals.ts:42), never the user's portals.yml. | Not a settings writer. Do not reuse for the real file. |
| `loadYaml` / `hasYamlContent` | lib/yaml-document.mjs:25 / :9 | Parse only (no writer). Empty or comment-only text gives null, malformed throws. | Read helper used by every script reader and by OW. |
| `buildProfile` / `buildPortals` (`onboard-write.mjs`) | onboard-write.mjs:240 / :280; `main` at :371 | Create from template line by line with every comment kept. Verifies its own output (`checkProfile` 338, `checkPortals` 349). Atomic write (`writeFileAtomic`, line 410). | **Never merges into an existing file**: existing files are kept unless `--force`, and `--force` replaces the whole file from the template. Throws if a template anchor line is missing (e.g. `# years_of_experience:`, `# max_posting_age_days:`), so it depends on the example's exact text. |
| `setPluginEnabled` | plugins.mjs:462 | Merges `enabled` and settings into config/plugins.yml; refuses an unparseable or non-mapping file (`parsePluginConfig`, line 401). | Writes with `yaml.dump` and plain `writeFileSync`: comments dropped, no backup, not atomic. Enabling also needs the `plugins.lock` consent step. |
| `savePersonalization` | web/src/lib/personalization-file.mjs (`mergeSections`) | Section-bounded replace in modes/_profile.md, atomic with backup, refuses ambiguous headings. | Markdown file, not YAML keys. |
| `withScheduledStore` | web/src/lib/scheduled-jobs-store.mjs:131 | Locked read-validate-mutate-validate-atomic-rename of data/scheduled-jobs.json. | JSON store, already has a full UI. |

### Merge-safety rules every existing writer follows (a new writer must also)

1. Refuse, do not overwrite, when the file exists but does not parse or is not a mapping (profile/route.ts:99-105, portals-config.mjs:60-72, plugins.mjs:401-430).
2. Edit as text so comments and commented-out opt-in keys survive, and verify the edited text parses to the same document the merge produced (profile-yaml-edit.mjs:210, portals-config.mjs:173).
3. Write atomically with a backup (`atomicWriteWithBackup`, web/src/lib/core/safe-write).
4. Seed from the shipped example only when the file is absent, and blank the example person (profile-yaml-edit.mjs:236).
5. Preserve CRLF vs LF line endings (profile-yaml-edit.mjs:203, portals-config.mjs:166).
6. Optionally guard against stale tabs with a content hash (cadence/route.ts:31).
7. After writing profile.yml, run `validateProfile` (validate-profile.mjs:212). After portals.yml, run `validatePortalsConfig` (validate-portals.mjs:257). Both catch the bad-value cases scripts otherwise swallow silently.
