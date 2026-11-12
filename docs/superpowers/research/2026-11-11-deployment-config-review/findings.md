# Deployment configuration review: running list

Started 2026-11-11. Jason and Claude are walking the web UI at `career.matherly.net` page by page to confirm the deployment is configured for real use. Nothing here is applied yet. When the walk is done, this list becomes the input to a plan written with `/superpowers:writing-plans`.

Status words: **decided** (Jason gave the value), **recommend** (research done, needs Jason's yes or no), **fix** (code or docs change), **open** (needs more checking).

Pages walked: Settings (`/config`), Scheduled scans. Not yet walked: Today, Explore, Pipeline, Follow-ups, Portals, Analytics, CV, Documents, Resume, Board, Shares.

## Settings changes on the pod

| # | Item | Status | Detail |
|---|---|---|---|
| S1 | Automatic evaluations per day | decided: 30 | Unset today, so the default of 10 per UTC day applies (`DEFAULT_DAILY_CAP`, `lib/evaluate-queue.mjs:28`). Key: `pipeline.auto_evaluate_daily_cap` in `config/profile.yml`. The 2026-11-12 sweep queued 8 by itself. |
| S2 | Score for an automatic CV | decided: 4.0 | Default is 3 (`lib/settings-registry.mjs:69`, key `auto_pdf_score_threshold`). Setting it changes nothing on the scheduled path today. See C7. |
| S3 | Minimum salary from the profile, in USD | decided: set it | A posting with no salary passes. A posting with no currency passes the currency check. A posting is skipped only when its stated top of range is below the minimum, or when both currencies are stated and differ (`buildSalaryFilter`, `scan.mjs:1326`). See C1 for the limit. |
| S4 | Skip seniority levels | recommend: leave unset | See the research note below. |
| S5 | Follow-up cadence | open: Jason to confirm defaults | Defaults (`followup-cadence.mjs:58`): first follow-up 7 days after applying, 7 days between follow-ups, cold after 2, reply to a company response within 1 day, 3 days between touches while Responded or Assessment, thank-you note within 1 day of Interview. |

### S4 research: skip seniority levels

Measured on the pod on 2026-11-12 by running `classifyTier` over the 1,505 `added` rows in `scan-history.tsv`.

| Tier | Postings | Share |
|---|---|---|
| senior | 998 | 66% |
| mid | 492 | 33% |
| entry | 13 | 0.9% |
| intern | 2 | 0.1% |

- `mid` is what an unmarked title gets. It holds "Software Engineering Manager, AI Observability", "Manager, Applied AI Architecture" and every "Applied AI Architect". Skipping `mid` would drop a third of the pipeline, target roles included. Never add it.
- `entry` and `intern` together are 15 postings, 1% of the total. One of the 13 `entry` titles is "Site Reliability Engineer (Associate, Experienced, or Senior)", a role that is open to seniors and would be dropped.
- The weekly sweep ignores this setting (C1), so the saving would apply to the daily scan only.
- Verdict: the saving is about 1% of ranking calls and it costs at least one wrong drop. It does not earn its place.

## Code and docs fixes in career-ops

| # | Item | Status | Detail |
|---|---|---|---|
| C1 | The weekly sweep ignores salary and seniority settings | decided: fix, the sweep must apply them | `scan-ats-full.mjs` has no reference to `salary_filter`, `skip_tiers` or `classifyTier`. It applies title, location and content filters only. The Settings page says "A scan skips…" for both. Either apply them in the full sweep or say on the page that they cover tracked boards only. |
| C2 | Settings heading is wrong for a hosted deployment | fix | `web/src/components/config-form.tsx:134` says "Run career-ops on your own AI, right on your computer. Your CV and data never leave your machine." The text needs to be true when the app runs on a server. Decide how the page knows (the Deployment rows already show data folder, scheduler and allowed hosts from the environment). |
| C3 | The ranker overrates senior software engineer titles | fix | 2026-11-12 sweep, ranked then evaluated: Company A Lead AI Engineering 4.3 then 4.0, Company B Director of Platform Engineering 3.6 then 3.6, Company E Senior Software Engineer 4.2 then 2.1, Company F Senior Software Engineer 3.8 then 2.0, Company D Senior AI Enablement Software Engineer 3.8 then 2.9, Company C Sr. Software Engineer 3.6 then 3.1. Earlier sample: Company G 3.9 then 2.8. Leadership titles held within 0.3. Individual-contributor software titles fell by 0.5 to 2.1. Read the six reports for the stated reasons before changing the ranking prompt. |
| C4 | `doctor` warns about Playwright MCP on the pod | decided: fix, no warning where it is not needed | Not needed here. Web workers that do not write run with `--strict-mcp-config` and no `--mcp-config`, so they load no MCP servers at all (`web/src/lib/claude-invocation.mjs:175`). The pod's `doctor` reports "Playwright chromium installed", which is what liveness checks and PDF rendering use. The apply flow imports `chromium` from `playwright-core` (`web/src/lib/apply/session.ts:2`), so it drives the browser as a library too. The MCP server matters only to a person running the modes in an interactive CLI. Candidate fix: `doctor` skips the warning when the scheduler is external or the CLI runs under the web. |
| C5 | Scheduled scans card describes the wrong scheduler | decided: fix | The card reads "Linux cron Integration · Task enabled · Next OS check: Not reported". The pod's schedule is a Kubernetes CronJob, and `CAREER_OPS_SCHEDULER_DESCRIPTION` is set to "CronJob career-ops-scan-tick, every 15 minutes" but the page text read on 2026-11-12 does not show it. Open: check whether the description is meant to render here. |
| C6 | Evaluate queue lists raw URLs | decided: fix | Each queue row shows the posting URL, rank and outcome, with no company or role. The pipeline already knows both. |
| C7 | The scheduled drain never makes a CV | needs Jason's decision | No script reads `auto_pdf_score_threshold`. Only agent prompts do (`modes/pipeline.md:63`, `batch/batch-prompt.md:733`). The drain posts `evaluate-text` runs (`web/scripts/evaluate-drain.mjs:297`), which write a report and a tracker row and nothing else. Row 94 scored 4.0 and has no PDF, which matches. `private/review/scan-automation-deferred-checks.md:27` records this as a deferred question: "Should auto render PDFs above auto_pdf_score_threshold? Plan is report-only." The Settings text "The pipeline makes a tailored CV for an offer scoring at least this" is not true for the web. Choice: build CV rendering into the drain at the threshold, or keep it report-only and correct the Settings text. |

## Operations

| # | Item | Status | Detail |
|---|---|---|---|
| O1 | Release and deploy 2.1.1 and web 1.1.3 | waiting on Jason | https://github.com/jrmatherly/career-ops/pull/73 is green and mergeable. The pod runs 2.1.0 and web 1.1.2. Until it deploys, runner stderr is discarded and new tracker notes start with `; posted:`. |
| O2 | Tracker notes on rows 94 to 99, and the Company I row if it lands | after O1 | Same rewrite as rows 53 to 59 and 93, applied 2026-11-12 with a backup at `/data/data/applications.md.bak-notes-20261112T011831Z`. Doing it before O1 means doing it again. |
| O3 | `decisions.tsv` rows for PR 72, the release and the deploy | after O1 | One push, per the no-trunk-pushes rule. |
| O4 | Confirm a career-ops log line reaches VictoriaLogs live | after O1 | The deploy prints startup lines. Query `kubernetes.pod_namespace:career-ops kubernetes.container_name:app` afterwards. |

## Owned by home-cluster

| # | Item | Detail |
|---|---|---|
| H1 | `career-ops-scan-tick` output is not stored | `curl` prints the response with no trailing newline, so the runtime tags it as a partial line. The home-cluster session asked Jason whether to fix the CronJob template. |
| H2 | Grafana Explore path for VictoriaLogs | Nobody has signed in to check it. |

## UI and UX review

Reviewed 2026-11-11 from 14 screenshots Jason took of every page at web 1.1.2, plus the container markup he selected on each page and two measurements run in the live app. Status for all rows: **proposed**, awaiting Jason's pick. "Measured" means read from the live DOM or the selected markup. "Seen" means read from a screenshot only.

### Across every page

| # | Finding | Evidence | Proposed change |
|---|---|---|---|
| U1 | Every page builds its own shell | Measured from the selected markup. Widths: `max-w-2xl` (Settings), `max-w-3xl` (Portals), `max-w-5xl` (Today, Explore, Scheduled scans, Documents), `max-w-6xl` (Pipeline, Analytics, CV, Resume, Board, Shares), `max-w-none` (Follow-ups). Padding differs on almost every page. Documents has no padding at all, so its title sits against the top edge. | One page-shell component with two widths, reading and wide. |
| U2 | Four different page titles | Measured. Display face at `text-3xl` with an icon (Explore, Scheduled scans), display face at `text-2xl` (Pipeline, Follow-ups, Board, Shares, CV, Settings, Resume, Portals), plain sans `font-semibold` (Documents), eyebrow plus a large title (Analytics, Today). | One page-header component: title, one-line description, actions on the right. |
| U3 | The app describes itself as a local tool | Seen. Sidebar footer "local-first · v0". Settings "right on your computer". Shares empty state tells you to run `node publish/share.mjs` in a CLI. Scheduled scans "Linux cron Integration". Portals "edit it directly or ask the assistant". Settings offers "Install" links for ten CLIs that cannot be installed into a pod. | One hosted-or-local signal read from the environment, used by all of these. Covers C2 and C5. |
| U4 | Navigation is a flat list of 13 | Seen. Settings sits in the middle, between Documents and Resume. "CV" and "Resume" are two editors for the same `cv.md`. Board and Pipeline show the same 67 rows. The "NEW" badge on Explore never goes away. | Group as Daily (Today, Pipeline, Board, Follow-ups), Discover (Explore, Scheduled scans, Portals), Profile (CV, Documents, Shares), then Analytics, with Settings pinned at the bottom. Fold Resume into CV as a second tab. |
| U5 | A lot of text is under 12px | Measured on Pipeline at a 798px viewport: 101 text nodes under 12px, some at 9px and 10px. Contrast is fine: faint text 5.87:1, muted 7.72:1, brand 6.31:1 against the page background. | Raise the floor to 12px for anything that carries information. |
| U6 | Small click targets | Measured on Pipeline: 41 controls under 24px in one dimension. Row checkboxes are 16px. Row title links are 17px tall. | Make the whole row the target, or pad checkboxes and links to 24px. |
| U7 | Dates and times have no single format | Seen. "Last run 07:00 AM" with no date or zone, "11/11/2026, 9:00:00 PM", "applied 2026-11-05", "3w ago", "Follow up Nov 12". Today's header says Wednesday Nov 11 while Pipeline chips say "Added 2026-11-12", because rows are stamped in UTC. | One formatter in the viewer's timezone, relative under a week and absolute after. |

### Page by page

| # | Page | Finding | Proposed change |
|---|---|---|---|
| U8 | Pipeline | Seen. The LinkedIn paste box fills the top of the page, so the inbox list starts below the fold. | Collapse it to a button. |
| U9 | Pipeline | Seen. Company names from the sweep show as lowercase slugs beside properly cased names. Location repeats itself ("US - Seattle · Seattle · United States"). | Normalize company display names and collapse repeated location parts when a sweep row is written. |
| U10 | Pipeline | Seen. A row shows "rank 3.7" and "not scored" together. Two different numbers with no explanation. | Label the rank as an estimate, and show the score in the same slot once one exists. |
| U11 | Pipeline | Inferred, not confirmed by URL. The Company H role ranked 3.7 sits first in the inbox, and the queue gated an Company H role ranked 3.7 as a dealbreaker. | Confirm it is the same posting. If so, a gated role should leave the inbox or carry a "gated: dealbreaker" mark. |
| U12 | Pipeline | Seen. Twelve status tabs wrap to two lines, and nine of them show 0. | Hide empty statuses behind "More". |
| U13 | Explore | Seen. 28 role chips and 56 exclude chips fill the first screen. The scan button is below the fold. | Collapse Exclude to "56 exclusions · edit". Keep the scan button in view. |
| U14 | Explore | Seen. "China employer preset" is a top-level choice for a US search. | Move it under "More location controls". |
| U15 | Scheduled scans | Seen. Each card clips its keyword chips at two rows with no count, and both cards carry the same 28 keywords. | Show "28 keywords" with an expand. |
| U16 | Scheduled scans | Covered by C5 and C6: scheduler card wording and raw URLs in the queue. | |
| U17 | Portals | Measured. One list of 197 rows, 9,166px tall, with no search and no way to see only the 72 scanned or the 125 paused. | Add search and Scanned and Paused tabs. Show the last health result on each row. |
| U18 | Follow-ups | Seen. The red banner repeats what the three table rows say. The role column truncates ("Engineering Manager - Netw…") while the last column heading is cut off at the right edge. Today calls the action "Mark followed up" and this page calls it "Log". | Drop the banner when the table fits on screen. Let the role wrap. Use one verb. |
| U19 | Analytics | Seen. The funnel says Applied 9, Responded 3, Interview 3. Pipeline tabs say Applied 3, Responded 0, Interview 0. The funnel is cumulative and says so in small text, but the two pages read as a contradiction. The bars use a blue found nowhere else in the app. | Label the funnel "ever reached", show the current count beside each bar, and use the brand palette. |
| U20 | Documents | Seen. File names are cut off before the company ("cv-{name}-042-…"), which is the only part that differs. Cards are not in date or number order. The "REACTIVE-RESUME" badge is internal jargon. | Title each card with company and role, link it to its tracker row, sort newest first. |
| U21 | Resume editor | Seen. The editor is read-only for this `cv.md` and shows internal UUIDs. It could not read the Education and volunteer sections. The only action is "Adopt the regenerated cv.md", which rewrites the file with no preview. | Fix the reader for those two sections first. Show a diff before adopting. Hide the UUIDs. |
| U22 | CV editor | Measured. The page is 6,380px tall, so the markdown and the preview scroll together with the page and cannot be compared side by side past the first screen. | Give each pane its own scroll at viewport height. |
| U23 | Board | Seen. The Evaluated column holds 28 cards including ones scored 2.0, in arrival order. "0d in stage · Not applied" is on every card in a column that already means not applied. | Sort by score. Hide cards under the apply line behind a count. Drop the redundant line. |
| U24 | Today | Seen. The "Apply next · Company A" button sits directly above a Recommended card for the same role. Open check: the card under "Below the apply line" reads Company G 3.8/5, and tracker row 93 for Company G is 2.8/5. | Keep the card, drop the button. Check which Company G row that card shows. |
| U25 | Settings | Seen. A narrow column with eight sections, a stray "Local-first · on our roadmap" line, two save buttons next to each other ("Save cadence", "Save config") and a save button per section. | Left-hand section list, one sticky save bar that appears when something changed. |
| U26 | Sidebar | Seen. The usage widget shows "5h 6M · 4%" with no units or explanation. The Ask button overlaps the "local-first · v0" line. | Add a tooltip or labels. Remove the footer line (U3). |

### Jason's notes on the mockups, 2026-11-11

All **decided** by Jason from annotated screenshots of `mockups.html`. The mockups are updated to match.

| # | Page | Decision |
|---|---|---|
| M1 | Today | The new-matches and follow-ups counts must stand out. Drawn as stat tiles with large numerals. |
| M2 | Today | The role card needs a badge that shows its state, such as Evaluated. Drawn with Evaluated, CV state and posted date. |
| M3 | Scheduled scans | The totals line (active, runs, roles found) must stand out. Drawn as stat tiles. |
| M4 | Scheduled scans | Each scan's schedule and its last run must be visually distinct from the body text. Drawn as a schedule badge and a separate "Last run" line with the role count. |
| M5 | Scheduled scans | "Report 94" is confusing. Drawn as "View evaluation". |
| M6 | CV | Show the CV as a PDF, with an Export button for download and print. Open: which template renders the master `cv.md`, and whether the existing PDF pipeline can render it on demand. |
| M7 | CV | The tabs are "Preview" and "Edit", replacing "Markdown" and "Sections". |
| M8 | CV | When sections cannot be read, show a banner that opens the editor at the problem lines. Replaces the card with the diff button. |

### Checks closed while planning, 2026-11-11

| Item | Result |
|---|---|
| U11 | Confirmed on the pod. `data/pipeline.md` line 92 is the gated posting (`…/example/1111…`, "Senior Software Engineer, Infrastructure AI") and it is still unchecked. Nothing marks a gated URL in the inbox. Fixed by plan Task 5. |
| U24, Company G | Not a bug. The 3.8/5 card is tracker row 41, "Systems Engineer Senior Principal". Row 93 at 2.8/5 is a different Company G role. Five Company G rows exist. |
| C3, cause | `rank-pipeline.mjs` sends the model only company, title and URL per row plus the first 2,000 characters of `cv.md` (`rank-pipeline.mjs:300,429`). It reads nothing from `config/profile.yml`. Fixed by plan Task 2. |
| C1, expected effect | Only 6 of 166 providers emit a salary (Ashby among them; Greenhouse, Lever and Workday do not), so the minimum salary will drop few sweep rows even once wired. Reported by an explorer, not re-counted. |
| C4 | No web component renders `doctor` warnings, so the fix is in `doctor.mjs` only. Reported by an explorer. |

The plan is `docs/superpowers/plans/2026-11-11-deployment-config-review.md`.
