# First cross-model review of the decision trail and plan

Reviewer: claude-opus-5-5, 2026-11-06, on the first committed version of the plan (before design D). Model output, reproduced from the session transcript. Every flag was verified against the code before it was acted on; the outcome column was added by the session lead.

| # | Flag | Outcome |
| --- | --- | --- |
| 1 | The biggest decision (resume.json generates cv.md) had no trail row and no prototype; AGENTS.md Source-of-Truth list never updated. Two more spec decisions (ten states plus sidecars; running the fork from the checkout) had no rows. | Led to the canonical-CV research and design D. Rows added. |
| 2 | One click can delete facts: modes add, expand, intake write cv.md directly and the editor's Overwrite button would discard them. | Overwrite button removed; design D's lossless gate and pairing replace it. |
| 3 | PR-06 contradicted itself: payload "re-derived client-side" yet consumed through rootScript (a server-side spawn); the web has no zod. | Server-side preview route via resume.mjs export --in; web never loads zod. |
| 4 | PR-09 needed an interface PR-08 did not provide (ics-interview --write has no tracker number); contacts, follow-ups, salary and offer writers unnamed. | Fork-local writers added (interview-round, salary-observe, offer-terms, followup-pin); contacts reuse appendContact. |
| 5 | ics-interview.mjs --write reversed the file's read-only promise (line 20); about 15 upstream files diverge, contradicting "no upstream file changes its contract". | ics-interview left read-only; divergence accepted and documented per path. |
| 6 | JD capture names by tracker number collide with report-number resolution. | Clarified: the shared allocator guarantees the number; capture named after the merge. |
| 7 | appendLedgerRows is an unlocked appendFileSync (tracker-utils.mjs:870); the backfill helper took a root while the ledger sits beside the tracker. | appendBackfillRows(trackerPath, rows) takes the tracker lock. |
| 8 | test-all --only takes one value; PR-15's --only docker matched nothing. | Commands split; a real publish-image test added. |
| 9 | NavItem.icon is required; the plan's nav entries had no icon. | Icons named and version checked. |
| 10 | Review Focus 3 had no unit test; the retry sees HTTP 503, not exit 4. | status-save unit tests added; wording fixed. |
| 11 | Lane counts followed UI surface, not risk: PR-14 (read-only page) had ten lanes, PR-12 and PR-13 (internet-facing, auth) lacked security lanes; cf-connecting-ip trusted regardless of peer; compose exposed :8080. | PR-12 gained forged-token, enumeration, limiter and CSP lanes; PR-14 cut to six; compose binds loopback; bind rule documented. |
| 12 | writing-plans format in name only: whole features in one step; verification boilerplate repeated 45 times. | PR-06 and PR-10 split into tested helpers plus UI steps; later PR-06 and PR-12 split into two PRs each. |
| 13 | Running the fork in place from the dev checkout would run whatever branch is checked out and could receive user data. | Install from the jrmatherly/career-ops GitHub marketplace instead. |

Questions the reviewer asked the operator to settle before execution: which file is canonical (settled, cv.md); whether add, expand and intake should write resume.json (settled, no, absorb instead); whether hidden sections go into cv.md (settled, yes, hidden per share); committing review videos under docs (settled, private/review); where zod, fflate and docx go (default, root package.json); which better-auth version to pin (default, ~1.7.14); whether the checkout install stands (settled, marketplace).

Checked and found clean by the reviewer: theme-style.mjs:39, cv-templates.mjs:228, generate-pdf.mjs:2330, funnel-velocity.mjs:88, pipeline-view.tsx:66-71, import-tracker.mjs COLUMN_ALIASES and the screening path, PIPELINE_TABS, the status route contract, CLI_EXIT.LOCK_TIMEOUT = 4, the 103 careerOpsRoot call sites, the 23 rule ids, the docs/superpowers deviations row.
