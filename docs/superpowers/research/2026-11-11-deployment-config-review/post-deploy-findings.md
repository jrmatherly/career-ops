# Post-deploy findings, career-ops 2.2.0

Recorded 2026-11-13 after career-ops 2.2.0 and web 1.2.0 were deployed to `https://career.matherly.net` (home-cluster d021b6e). These are the items the release left open, for a follow-up session. None is fixed. Each says how it was found and where the code is.

The plan is `docs/superpowers/plans/2026-11-11-deployment-config-review.md`. Its rules are a 12px floor for UI text and 24px in both dimensions for interactive targets (plan line 25).

## How the checks were run

- **Local, before the release.** A production build of `main` on a fictional data root: 80 Evaluated rows, the example CV and three portals. It had no inbox rows, scheduled scans, documents, role chips or tailored CVs.
- **Live, after the deploy.** The same measurements on the deployed site with real data: 69 inbox rows and 68 tracked roles. Twelve pages at 1280 by 900, and `/pipeline` (Inbox and All tabs) at 798 by 900.
- **What was measured.** One `h1` in `main`, its size and font; `scrollWidth` against `innerWidth`; the computed font size of every text node in `main`; the box of every `input[type=checkbox]`, `button` and `a` in `main`.

What passed on every page, local and live: one 30px Instrument Serif `h1`, no page overflow, and no visible text under 12px.

## A. Controls under 24px

Found on the live site. The local fixture could not show them, because it had none of the data that renders them.

| # | Page | Control | Size | Code |
|---|------|---------|------|------|
| A1 | Explore | 33 chip remove buttons, the "×" on each role and location chip | 12 by 12 | `web/src/components/explore/filter-builder.tsx:60` |
| A2 | Pipeline, Inbox tab | "Select all 20" text button | 70 by 16 | `web/src/components/inbox/inbox-triage.tsx:438` |
| A3 | Pipeline, All tab | "Open the tailored CV PDF" link in the PDF column | 47 by 20 | `web/src/components/pipeline-view.tsx:977` |
| A4 | Follow-ups | three company links | 122 by 20 | `web/src/components/followups/followups-view.tsx:414` |
| A5 | Today | one text link under a tile | 83 by 20 | `web/src/components/home/today-dashboard.tsx:235` or `:309` |
| A6 | Pipeline, Inbox tab, empty state | "80 tracked roles" inline link | 109 by 17 | seen on the local fixture only |

A1 is the clear miss: an icon-only target at half the minimum in both directions. A2 to A6 are text links or text buttons, wide enough and 16 to 20px tall. Whether an inline text link has to meet the 24px rule is a decision for the owner; WCAG 2.5.8 exempts a link inside a sentence, and the plan's rule does not.

The browser suite that asserts the rule is `web/tests/lib/layout-shell.browser.test.mjs`. It passed on the release while the live site shows A1 to A5, because its fixture, `web/tests/fixtures/pipeline-status.mjs`, has three tracker rows and nothing else, so none of these controls renders (read on 2026-11-13). The suite already exempts a link inside a sentence, which covers A6.

The fixes are planned in `docs/superpowers/plans/2026-11-13-post-deploy-follow-ups.md`, one branch and one PR. Its "Decisions already made" table records the owner's answers on A2 to A5, B2 and C2.

## B. Differences from the mockups

Found on the local run by comparing each page's headings, subtitle, tabs and buttons with `mockups.html`. Not checked again on the live site, except B5.

| # | Page | Mockup | Built |
|---|------|--------|-------|
| B1 | Explore, Scheduled scans, Portals, Documents, Analytics | a short subtitle, for example "The company boards the daily scan reads." | the older, longer subtitle |
| B2 | Portals | an "Add company" button and a "Board type" filter | neither |
| B3 | Analytics | tabs "Progress / Insights / Scan stats" | "Search progress / Insights / Search stats" |
| B4 | Scheduled scans | buttons "Run log" and "New scan" | "Run Logs (N)" and "New Scheduled Scan" |
| B5 | Settings | "Hosted at career.matherly.net. Your data is in /data on this server." | matches, read on the live site |

Whether the plan's phase tasks included these copy changes was not checked against the task list. The plan's "Not in this plan" section lists moving Shares into Documents, which the mockup also shows, as out of scope.

## C. Other things seen

- **C1. Logo misses log console errors.** `/api/logo?company=…` answers 404 for a company with no logo (4 on the live inbox), by design (`web/src/app/api/logo/route.ts:19`). The row falls back to the monogram, and the browser logs one error per miss.
- **C2. The logo monogram is 8px, 10px on Today.** It sits behind the logo image and is `aria-hidden`, so it is not counted as text under 12px. It is what a sighted user sees when the logo is missing.
- **C3. The Pipeline table scrolls sideways inside its box at 798px** (725px of table in 508px). The page itself does not overflow.
- **C4. A manual scan holds the runner lock for its whole run.** During the 15-minute forced sweep, the 20:15Z scan tick logged `scheduled-jobs lock timeout: /data/data/scheduled-jobs.json.runner` and did nothing. Expected, but a tick is lost for every long manual run.
- **C5. The runner does not keep a scan's output.** The sweep ran with `--json`, and its summary, including `postingsDroppedTier` and `postingsDroppedSalary`, was not stored anywhere. The counts could only be read mid-run from `/data/data/cache/ats-full-checkpoint.json`.
- **C6. `set-status.mjs --replace-note` cannot repair a Notes cell that starts with "; ".** It leaves "; Apply; posted: …". The eight affected rows were fixed with a locked line rewrite.

## D. Checks the release left unverified

- **D1. The automatic CV at 4.0 or higher.** The forced sweep found 7 roles and evaluated none: six were under the 3.5 rank line and one was gated as a dealbreaker. No PDF was due. It needs a scheduled evaluation that scores 4.0 or higher.
- **D2. The salary filter's drop count.** The filter was applied (it is in the sweep's filter fingerprint) and `droppedSalary` read 0 mid-run. Zero is inconclusive, because a posting with no stated salary passes.
- **D3. Tracker notes leading with the decision** (PR 72) on a row evaluated after the deploy. No evaluation has run since.
- **D4. The new `cv.md` reader and the paragraph order against the owner's real `cv.md`.** It exists only on the pod. `resume.mjs absorb` writes `data/resume.json`, so it needs the owner's go.
- **D5. A tailored PDF end to end.** `modes/pdf.md` names the `paragraphs` field, and whether the tailoring agent uses it is unknown.
- **D6. The Cloudflare path.** The site was reached through the internal gateway only.
- **D7. Right-to-left and CJK rendering of the `job-note` list item**, and a template pack that draws its bullets with `li::before`.

## E. Known and left alone

All older than this release.

- `resume.mjs absorb` and `pair` read outside the resume lock. Only `data/resume.json` can go stale from that, never `cv.md`.
- The `intake`, `interview` and `expand` modes tell the agent to edit `cv.md` directly, and a prompt cannot take a file lock.
- A resume lock whose holder died, and whose pid was then reused, never goes stale. `POST /api/cv` answers 503 until `data/resume.json.lock` is removed.
- `runCoreCli` kills `resume.mjs` at 30 seconds while the CLI waits 60 for the lock, so a stuck lock shows in the web as "timed out".
- In the web adopt flow, a write between the route's check and the CLI's first read is adopted unseen.
- "Resume" replacing "CV" in the web UI, about 110 visible strings in 45 files, is tabled by the owner.
