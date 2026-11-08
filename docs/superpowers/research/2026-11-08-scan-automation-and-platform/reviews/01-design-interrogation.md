# Adversarial review of the two contested design choices

Three reviewers on different model families read the design memo (`00-design-memo.md` in this folder) and the code it names, 2026-11-08. The lead re-measured every finding it acted on; the Verified column says what was checked and where. Findings are merged where two reviewers raised the same point.

## Intent

Plan, docs only, two enhancements to the career-ops fork. (A) A per-job off, review or auto mode that chains a scheduled scan into `rank-pipeline.mjs` and then into the web's read-only evaluate path, inside the web pod's process tree, with a review queue in the user layer. (B) A way for the operator to manage publish-service API keys from the dashboard without weakening the internet-facing publish service.

## Reviewers

- Reviewer A, Fable 5.1. Findings listed in the section below.
- Reviewer B, Opus. 14 findings.
- Reviewer C, Sonnet. 17 findings.

## Act on

| Finding | Raised by | Verified | What changed in the plan |
| --- | --- | --- | --- |
| `rank-pipeline.mjs` ranks the first N unranked rows in file order and has no URL filter, so a pipeline diff never makes it rank this run's rows and auto mode evaluates nothing while the backlog eats the limit | B1, C1 | `rank-pipeline.mjs:153-168` and `234-238`, `scan.mjs:3787-3791` appends at the end of Pending | A fork-local `--urls-file <path>` flag on `rank-pipeline.mjs`, applied before `selectBatch`, with a test; the runner passes this run's candidate URLs |
| Candidates held only in runner memory are lost on a crash, a timeout after rows were appended, or a retry; the next run's snapshot already contains them | B2, C2 | `scheduled-jobs-runner.mjs:52-66` requeues a stale claim and re-runs the job; `scan.mjs` appends as it goes | Candidates come from durable state. A pending row is a candidate when its `scan-history.tsv` first-seen date is on or after the job's `evaluate.enabledAt` date and the ledger has no row for its URL. Auto mode writes `queued` rows before any evaluation, then drains them |
| No guard against evaluating a URL twice, from the UI and the runner, or after a crash between persist and the ledger row | B3, C3 | `report-persist.mjs:260-345` reserves and merges with no tracker check; `route.ts` takes no per-URL claim | Before each evaluation the drain checks that the pipeline row is still pending and the tracker has no row with that URL; a `running` row with the run id is written before the spawn and a stale `running` row is treated as `failed`; `failed` rows retry at most twice with a cooldown and the batch stops on the first rate-limit or usage-limit error |
| The extraction of `runEvaluate` is far larger than the memo says because the prompt needs `readLanguageConfig`, `readMemory`, `readInbox` and the binary path from TypeScript modules | B4, C4 | `route.ts:40-139` and `156-194`; `web/src/lib/career-ops.ts` and `clis.ts` are TypeScript | The runner reuses the route itself over loopback. It POSTs to `http://127.0.0.1:3000/api/run` with `Host: localhost` and consumes the NDJSON stream. The origin guard admits a loopback host with no browser headers, which the scan tick already relies on (`web/src/lib/origin-guard.mjs` `checkRequest`, home-cluster HelmRelease `Host: localhost`). No refactor of the route. The extraction stays in Appendix B as the fallback |
| A runner-side evaluate would bypass `acquireTrackerWrite`, the only guard that keeps `tracker.mjs delete` from racing `merge-tracker.mjs` | B3, C5 | `web/src/lib/core/run-registry.ts:1-24` says the delete shares no file lock with the merge | Settled by the loopback choice above. The evaluation runs inside the Next process and takes the token |
| `readSidecarRows` requires a positive integer in the first cell, so URL-keyed rows all land in `skipped`; the web never imports root modules | B5, C6 | `lib/application-meta.mjs:57-73`, `web/src/lib/core/application-sidecars.mjs:1-6`, `DATA_CONTRACT.md:66` | A new root module `evaluate-queue.mjs` owns the ledger (append, read, drain state) and reuses only `appendSidecarRow` and the pipeline lock; URLs are normalised with `url-key.mjs`; the web reads it through a core CLI dump, the way `set-status.mjs` is used |
| Review mode rebuilds the Inbox shortlist, which already selects rows and bulk-evaluates them with a cost confirmation through the streaming path, and whose sort has one documented comparator | B6 | `web/src/components/inbox/shortlist-tray.tsx:15`, `inbox-triage.tsx:169-171` and `scoreShortlist` | Review mode writes no ledger. It ranks this run's rows, and the Inbox shows the rank, sorts by it and groups rows by the run that added them; the operator shortlists and presses Score shortlist. The ledger exists for auto mode only |
| Holding the runner lock through evaluations starves other jobs; raising `staleMs` does nothing for a lock with a live pid; `killMsForKind("evaluate")` is 740 s; a manual run would hold a browser request through the gateway for hours | B7, C8 | `lib/dir-lock.mjs:262-285`, `run-cli-support.mjs:443`, `scheduled-jobs/[id]/run/route.ts:13` | The scan step records completion and releases the runner lock as today. The drain is a separate step with its own lock and a per-tick cap. The manual route returns when the scan finishes |
| Auto mode hands an agent with Read, WebFetch and WebSearch to every posting that passes the title filter, so a hostile posting can read `cv.md` or the pod's environment and send it anywhere | B8, C9 | `claude-invocation.mjs` `networkReadOnly`; the prompt tells the agent to WebFetch the posting (`run-prompts.mjs:311`) | Auto mode evaluates only postings whose ATS is in `JD_TEXT_API_ATS`, fetches the JD text first with `fetchJdViaKnownApi` from `browser-extract.mjs`, and runs a new `evaluate-text` kind under `localReadOnly` (no network tool), which closes the exfiltration channel. Postings with no API text fall to review. Stated as a risk in Appendix C |
| No spend ceiling across jobs and days, and no behaviour on a limit error | B9, C10 | `scheduled-jobs.ts` has no budget field; the fatal-stderr regexes exist only per run | A daily cap in `config/profile.yml` under `pipeline.auto_evaluate_daily_cap` read from the ledger; on the cap or a limit error the remaining candidates stay `queued` |
| Option (b) writes a key nothing uses, because `PUBLISH_API_KEY` reaches the pod by env from the Secret and `share.mjs` reads env before `.env`; the account page copy names the wrong destination | B11, C14 | `publish/share.mjs:41-50`, home-cluster `secret.sops.yaml.j2:10` | (b) rejected outright for the cluster. The account page and the pull route's messages name both destinations |
| Option (c) needs a browser-reachable publish URL; in the cluster `PUBLISH_URL` is the public `https://cv.<domain>` | C15 | home-cluster `helmrelease.yaml.j2:33` | The Shares page link reads `PUBLISH_URL` server-side and hides when unset or not `https` |
| Keys never expire (`apiKey()` sets no `expiresIn`), so "once a year" was a guess | C16 | `publish/auth.mjs:46-52` | The report's reasoning for deferring (b) now rests on the env shadowing and the minting credential, not on rotation frequency |

## Consider

| Finding | Raised by | Note |
| --- | --- | --- |
| Take candidates from the scanner's own output instead of any pipeline-side rule, so a row the user adds by hand mid-scan is not auto-evaluated | B10 | The first-seen rule has the same property, since a hand-added row has no scan-history row. Kept as a test case |
| A CLI-only mint and revoke script run with `kubectl exec` in the publish pod as option (e) | C16 | The account page already lists, mints and revokes behind the sign-in (B13), so (e) adds a second path for the same actions. Listed in the report as an alternative, not built |
| Copying token values into the account page drifts; add a parity test that reads both files | C17, B14 | Accepted as a test in the publish PR |
| Rank is a title-and-URL guess on a different scale from the evaluation score | C11 | The Inbox labels the value "rank" with the reason, never "score" |
| `executeJob` is synchronous and tested; `recordCompletion` writes a fixed field list; a `structuredClone`d job snapshot ignores a mode flipped mid-run | C12 | PR-R1 keeps `executeJob` synchronous and adds the rank as a separate step; the drain re-reads each job's mode from the store at drain time, so a job set to off stops being drained |
| Crash-window tests with a fake spawn | C13 | Named in the plan's unit verification |

## Dismissed

- "Option (b) is the only one that finishes the job" is not a finding anyone made; every reviewer agreed (a)+(c) ships first and B11 and C14 made (b) unworkable on the cluster.

## Agreement map

B and C agreed independently on nine points, the rank limit bug, the lost candidates, the double evaluation, the extraction size, the sidecar reader, the lock and timing facts, the auto-mode exposure, the spend cap, and the env shadowing that kills option (b). That agreement, from two model families reading the same code, is the strongest signal in this review and reshaped thread 1 from a snapshot-and-extract design into a durable ledger drained over the existing route. Where they differed, B proposed reusing the Inbox shortlist for review mode and C proposed loopback reuse of the route; the lead took both.

## Reviewer A

Reviewer A returned 16 findings after the table above was drafted from B and C. It raised the same seven shared points (the rank limit, the lost candidates, the delete race, the double evaluation, the TypeScript inputs of the prompt, the sidecar reader, the lock and timing facts), which makes each of them a three-model agreement. Its additions and what the lead did:

| Finding | Verified | What changed |
| --- | --- | --- |
| Rows that come back unranked (partial batch failure exits 0) have no defined fate and would vanish in auto mode | `rank-pipeline.mjs:462-466` | Auto mode queues them with an empty rank and the reason `unranked`, so they stay visible and never evaluate on their own |
| `evaluate.cli` is dead config while evaluation is Claude only, and the ranker picks its CLI from `CAREER_OPS_CLI` independently | `rank-pipeline.mjs:388-392` | The field is dropped. The plan documents that rank follows `CAREER_OPS_CLI` and evaluate runs on Claude |
| Keys are minted on `POST /account/keys`, not on `GET /account`; the memo's "Today" misstated it | `publish/server.mjs:266-296` | Report 03 corrected |
| The web pod already holds the publish key (the share CLI is its child and reads it), so "the dashboard now holds the key" was not a new cost of option (b) | `publish/share.mjs:41-50` | Report 03 reasons from the minting credential and the env shadowing instead |
| A server-side revoke needs no direct database write; `auth.api.updateApiKey({ userId, keyId, enabled: false })` is server-only and unaffected by the HTTP `disabledPaths` | Better Auth plugin docs, `updateApiKey` accepts `userId` and `enabled` | Report 03 corrected for the record; (b) stays rejected on the cluster |
| An in-cluster call to the publish Service would loosen the NetworkPolicy that makes `cf-connecting-ip` trustworthy | home-cluster `publish/app/networkpolicy.yaml.j2` admits the `network` namespace only | Added to the reasons (b) is rejected |
| Option (c) is not zero change, since the Next process never reads `PUBLISH_URL` today | grep of `web/src` | The plan's publish PR reads that one value from the environment, hides the link when unset, and uses `rel="noopener"` |
| The theming in (a) is cosmetic and only worth doing with a parity test against `globals.css`; no publish test asserts the pages are script-free today | `grep '<script' publish/tests` finds nothing | (a) stays in the plan as the smaller half of one PR, with the parity test and a script-free assertion |
| Documentation drift, since the web README's "zero-token scheduled scans" promise changes once a job can evaluate | `web/README.md:121` | The plan's docs step updates the README and `DATA_CONTRACT.md` |

Verdict after all three. The thread 1 design changed from a memory snapshot plus a route extraction to a durable auto-mode ledger drained over the existing route by loopback, with review mode served by the Inbox shortlist. The thread 3 recommendation held, with (b) now rejected on evidence rather than deferred on a guess.
