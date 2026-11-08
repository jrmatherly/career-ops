# Review of the implementation plan

Three reviewers on different model families read the plan at commit `dc5abc78` and the code it names, each through one lens, 2026-11-08. Reviewer A (Opus) asked whether an engineer new to the repo could implement each PR from the plan alone, 32 findings. Reviewer B (Sonnet) checked the plan against the repository's own rules and mechanics, 14 findings. Reviewer C (Fable) looked for design and risk gaps the interrogation round had not settled, 25 findings. The lead verified the load-bearing claims against the code before changing the plan; where two or three reviewers raised one point independently it is listed once with every source. Every finding below is applied in the plan at the next commit unless the Disposition says otherwise.

## Blocking, all applied

| Finding | Raised by | Verified | Disposition |
| --- | --- | --- | --- |
| The `evaluate-text` POST had no `cliId`, and the route keys at least seven branches on the literal `"evaluate"` (options, `cv.md` check, `needsScript`, `postedAt`, the tracker write token, the envelope filter, the persist branch), so a new kind would persist nothing and skip the token that blocks a tracker delete | A2, A3, B1, C10, C11 | `route.ts:36-41, 66, 121, 162, 219, 379, 393, 615` | `isEvaluateKind` used at every site; body carries `cliId: "claude"` and the route refuses other CLIs for the kind; `killMsForKind("evaluate-text")` 740 s; a route test asserts the token |
| `Read(/proc/**)` anchors at the settings source; only `//` is absolute | A4, C1, lead's own check | permissions reference, path patterns table | All deny rules written `Read(//...)`; the gate tests Grep as well as Read |
| `claudeCliArgs({ kind, prompt })` has no root for a `.env` rule | A5 | `claude-invocation.mjs:156` | Signature gains `dataRoot`; the route passes `careerOpsRoot()` |
| The drain and the rank inside the runner's lock starve every tick for the duration and make the manual route wait | A6, A7, B4, C6 | `scheduled-jobs-runner.mjs:296-327`, `[id]/run/route.ts:13` | Both run after `withResourceLock(runnerResource)` returns, never on `--job`; the drain under its own `.drain` lock; lanes rewritten |
| Crash recovery assumed a tick that claims nothing still ranks, which `main` did not do | A7 | `scheduled-jobs-runner.mjs:284-319` | The rank pass runs on every tick without `--job`, so no run-scoped memory is needed |
| `recordCompletion` returns early once its queue item is gone and cannot be called a second time for counts | A8, B6 | `scheduled-jobs-runner.mjs:257-282` | New `recordStepCounts(storePath, runId, counts)`; tolerates a trimmed run |
| File-mode lane 7 expected a scanner message that does not exist; an empty positive list passes every title | A9, C4 | `title-keywords.mjs:414-418`, `scan.mjs:927` | The runner refuses an empty positive list in file mode with its own message; review focus 5 and lane 7 rewritten |
| `portalsConfigPath` is TypeScript and the runner cannot import it; the runner has no debug line and its stdout must stay one JSON object; a relative `CAREER_OPS_PORTALS` resolves against the code root | A10 | `career-ops.ts:333`, `[id]/run/route.ts:100-104`, runner line 204 | The runner resolves the absolute path itself and writes its line to stderr |
| `claude_oauth_token = ""` fails home-cluster validation because the token sits in the `_all_or_none` tuple; `cluster.schema.json` is generated | A11, C2, C3 | `validate.py:818-829`, `test_validate.py:559` | PR-P2 removes the token from the tuple, adds an exactly-one rule with three invalid fixtures, and regenerates the schema with `just template schema` |
| `npm test -- --test-name-pattern` filters nothing and matches titles, not files | A1 | `web/package.json` test script; reproduced by the reviewer | Every web test command names the file with `node --experimental-strip-types --test` |
| Root suites built on the `pass`/`fail` helpers exit 0 on failure under `node --test` | A29 | `tests/helpers.mjs:180-188, 256` | Root suites run through `node test-all.mjs --quick --only <file>` |

## Should-fix, applied

| Finding | Raised by | Disposition |
| --- | --- | --- |
| `readScanDates` keeps the first row per URL while the scanner appends a row per status and re-adds released URLs | C7, A16 | The candidate rule reads the latest `added` row, joins by normalised URL, returns the raw URL, and dates in `job.timezone` |
| No in-flight guard against a dashboard evaluate started while the drain runs; a crash between the report write and the merge leaves an orphan the pre-check misses | C8, C9, A4 | The route gains a per-URL in-flight set answering 409; the drain also checks `reports/` headers and `batch/tracker-additions/` |
| Below-threshold and unranked rows would sit `queued` forever; `no-api-text` rows were refetched every tick | A20, C(interrogation) | Terminal `skipped` with a reason for each; `resolveAtsApi` separates "not an API ATS" from a transient null fetch |
| The daily cap counted `running` plus `evaluated`, double-counting one evaluation and missing `failed` and `gated`; the day boundary was undefined | A20, C13, C14 | Counts URLs whose `running` row carries today's UTC date, whatever followed; ledger `at` is ISO UTC |
| Transport failures on the POST were `failed` and consumed a retry | C15 | Any transport failure or a stream with no terminal event is `dashboard-offline` |
| The deny list missed the CLI's home PVC, the service-account token and the two third-party PII files | B11, C12 | Seven deny rules per Data shapes |
| `jdText` cap of 200 kB risks the argv limit and is far above `fetchJdViaKnownApi`'s 12 kB | B2, C20 | 16 kB cap; the JD is wrapped in a delimited untrusted block |
| The ledger header, `source` column, `at` format, per-URL history for the retry count, `maxPerRun` scope and the `add` argv were undefined; `appendSidecarRow` already locks the sidecar | A20, B9 | Data shapes defines each |
| Placement of the ledger logic and how the drain reaches it | B8, A17 | `lib/evaluate-queue.mjs` plus the root CLI, both in `config/local-paths.txt`; the drain lives in `web/scripts/` and imports root modules like the runner does |
| `enabledAt` never reset after off-then-on; a PUT that omits `evaluate` would clobber it | B5 | Rewritten on every transition; the parser returns `base.evaluate` when the body omits it |
| Lanes that pointed `CAREER_OPS_CLI` at a script, expected exit 2, or ran `--dry-run` with no CLI | A12, A13, B7 | `CAREER_OPS_RANK_CLI`, exit 1, fake CLI in the test |
| `--limit 0` is a usage error | A14 | The pass skips the spawn with no candidates |
| Two jobs sharing a URL cannot both report the ranker's count | A15, C18 | `ranked` is read from `pipeline.md` after the pass |
| PR-F1 inheritance rule named three of six lists and silently changed stored jobs | A24, C5 | One rule for all six lists, the behaviour change stated in `docs/WEB_UI.md`, lane 10 pins the unchanged case |
| Perf and regression lanes measured live scans or reused one data root | C17 | Fake `spawnFn`, two data roots |
| `pipeline-table.test.mjs` does not exist; no inbox sort test exists; the row component is `triage-row.tsx`; the facet had no URL parameter | A25, B12 | `inbox-parse.test.mjs`, new `inbox-sort.mjs` and test, `triage-row.tsx`, `?added=` |
| `.tsx` cannot be tested in web tests | A23 | Pure `.mjs` helpers for the job body, the evaluate settings and the publish URL |
| `--brand` does not exist; `PUBLISH_URL` lives in the data root `.env` on a Mac, and the Next process never read it | A26, A27, B14, C25 | `--brand-text` and `--color-brand`; a helper that reads env then `.env` like `share.mjs`; the `/shares` deviations row extended |
| The deviations convention needs a program sub-heading, rows for every edited upstream file and every new file in a shipped directory, and no row for `publish/` or `deploy/` | A28, B13 | Global constraint rewritten; each PR's Files box lists its rows |
| `cli-fencing.mjs` names flags to refuse them; the bugbot reference path; `queued` collided as a run count and a state | A32 | Corrected; the count is `autoQueued` |
| Liveness, aggregator and blacklist checks before an auto evaluation | B10 | Not applied. `fetchJdViaKnownApi` succeeds only on an ATS API, which excludes aggregators and dead postings in practice; the blacklist is applied by the scanners before a row reaches the pipeline. Recorded here as the reasoning; the owner of PR-A2 revisits if a lane shows a dead posting evaluated |
| Clamp or reject out-of-range evaluate values | A30 | Clamp, matching `cleanEvery` |
| `CAREER_OPS_AUTO_EVALUATE` left two designs | A21 | Dropped; the gate decides before PR-A2 starts |
| PR-A1 was two PRs | C21 | Split into PR-A1 (the kind and its gate) and PR-A2 (the ledger and drain) |
| Appendix D held items the code or the house pattern settles | C23 | D5, D7, D8 and D10 settled in the plan; seven decisions remain |
| PR-P2 Files missed the docs page and the fixture matrix line | C24 | Added |
| The proxy's limit error text is unknown, so the batch-stop rule is unverified behind it | C16 | PR-P2 forces one 429 and records the line; Appendix C says so |

## Not applied

- The theming half of PR-K1 is cosmetic (A nit, C22). Kept, because the operator listed it as a candidate and the parity test makes it safe; the operator can drop it at review.
- Reviewer C's suggestion to add liveness, aggregator and blacklist checks before each auto evaluation (B10), for the reason in the table above.

## What the reviewers agreed on

Three independent reviewers converged on the `evaluate-text` wiring, the drain's lock placement, the deny-rule path syntax and the home-cluster validator tuple. Two converged on the latest-added-row date, the double-evaluation window, the daily cap arithmetic, the deny list's coverage and the test commands. The agreement from different model families is the reason each of those is applied as written rather than negotiated.
