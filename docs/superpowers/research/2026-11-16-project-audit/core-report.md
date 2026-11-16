# Core audit report

Commit `2edd1b33`, 2026-11-16. Slice 2 of 6: correctness and data safety of the core Node scripts. Read-only audit. Repro scripts are in `repro/core/` (rename `.mjs.txt` to `.mjs` and run from the repo root).

No corrections from the lead.

ISSUES

1. merge-tracker has its own row parser with a looser width check, and it rewrites shifted rows, losing data
- Severity: medium. Confidence: measured.
- Where: merge-tracker.mjs:995-999 (`parseAppLine`: `if (parts.length <= maxIdx) return null`). Compare tracker-parse.mjs:327-329, where `parseTrackerRow` requires the full width because "a missing INTERIOR cell shifts every later column".
- Evidence: `merge-shift.mjs` builds a tracker whose row #1 is missing its PDF cell. `parseTrackerRow` returns null for that row. `mergeTracker` accepted it with columns shifted and applied a re-evaluation (3→4.5). The rewritten row lost the user's note "my note" and the old report link `[1]`. The run exited 0 and archived the TSV.
- Who is affected: anyone who hand-edits the tracker. verify-pipeline.mjs:326 warns about the width, but merge does not stop.
- Fix: make `parseAppLine` call `parseTrackerRow(line, COLMAP)` or copy its width guard. Size S.

2. A half-written addition TSV is merged with exit 0 and archived, and the eval writers write additions in place
- Severity: medium. Confidence: the parser behaviour is measured; the race itself is inferred.
- Where: gemini-eval.mjs:656, ollama-eval.mjs:548, openai-eval.mjs:672, and openrouter-runner.mjs:368 (its `writeFile` helper, called at :1189). All use a plain `writeFileSync` with no tracker lock. merge-tracker reads the additions directory at :1817 under its own lock.
- Evidence: `partial-tsv.mjs` cut one TSV at three points.
  - Cut mid-URL: the row merged as `[jobs.acme.c](https://jobs.acme.c)`.
  - Cut mid-notes: notes became `Gem`.
  - Cut mid-report: the report cell became `[7](`.
  - Every case exited 0 and moved the file to `merged/`.
- Who is affected: in the web pod a merge can run while an eval is writing. The truncated URL breaks the deterministic dedup key, so the next re-evaluation adds a second row.
- Fix: writers use `writeFileAtomic` (tracker-utils.mjs:786), and `parseTsvContent` refuses content without a final newline. Size S.
- To settle the race: run the writer and `mergeTracker` in a tight concurrent loop in the scratchpad.

3. A higher-scoring re-evaluation of an Applied row drops the old report link without a trace
- Severity: low-medium. Confidence: measured. This may be intended; the owner should confirm.
- Where: merge-tracker.mjs:2316. `supersededNote` is written only on a downgrade. The update at :2370-2395 replaces Date and Report, and :2338 sets PDF to ❌.
- Evidence: `merge-full.mjs`, with a well-formed Applied row #1 (2026-01-01, PDF ✅, report `[1]`) and a re-evaluation at 4.5. The result is `| 1 | 2026-02-01 | … | Applied | ❌ | [2](…) | my note. Re-eval …`, and report [1] is not mentioned anywhere.
- Who is affected: anyone who re-evaluates a posting they already applied to. They lose the link to the report and CV they applied with.
- Fix: write the superseded-report note on any report change, not only on downgrades. Size S.

4. outcome.mjs updates its journal with an unlocked, in-place read-modify-write
- Severity: low. Confidence: inferred from the code.
- Where: outcome.mjs:621-631 (`readFileSync`, then `writeFileSync` on `outcomeLogPath`).
- Effect: a crash mid-write truncates the per-application outcome journal, and two outcome runs for the same application can lose an entry.
- Fix: `replaceUserFile` or `writeFileAtomic` under the existing outcome-dir lock. Size S.
- To settle it: run two `outcome.mjs` processes for one row in a temp root.

5. The two pending-pipeline parsers disagree
- Severity: low. Confidence: measured.
- Where: sync-batch-input.mjs:238 reads only lines under a `## Pending` heading. rank-pipeline.mjs:182 reads every `- [ ] ` line anywhere in the file.
- Evidence (`pend.mjs`): lines under `### Pending`, or before any heading, are ranked but never queued for the batch. The `local:` difference looks intentional.
- Fix: share one section-aware parser. Size S.

6. Silent catch-and-continue
- Severity: low. Confidence: measured by reading.
- batch-evaluate-gemini.mjs:97: an unreadable profile.yml silently becomes spend tier `standard`.
- openrouter-runner.mjs:256: a failed save of the model blacklist is swallowed, so bad models come back next run.
- Fix: one warning line each. Size S.

7. One root script with no product caller
- Severity: low. Confidence: measured.
- app-events.mjs says in its own header "No web consumer exists yet". `git grep` finds it only in docs/SCRIPTS.md, DATA_CONTRACT.md, the upstream-review SKILL.md and one test. No package.json script, mode, web route or workflow calls it.
- Every other root script has a real caller. followup-pin.mjs and salary-observe.mjs are called from lib/import-rr-applications.mjs.

## Checked and found sound

- lib/dir-lock.mjs and web/src/lib/core/dir-lock.mjs are byte-identical (`cmp`).
- merge-tracker releases its lock in a `finally` (:1414-1419). It aborts with nothing written when the tracker has no separator row (:2494). Refused or failed TSVs are never archived.
- `appendToPipeline` and `appendToScanHistory` (scan.mjs:3834, :3903) re-read under `withPipelineLock` and write atomically or through the ledger append. All scanners route through them.
- sync-batch-input locks and releases in a `finally`. batch-runner.sh rewrites batch-state under flock/mkdir with tmp+mv.
- dedup-tracker and normalize-statuses edit lines in place through `openTrackerTransaction`, keep lines they cannot parse, and exit 1 when the lock is unavailable.
- dedup-tracker refused to merge an Applied row into an Evaluated duplicate (measured).
- scan.mjs exits 2 when every target fails (:6007), retries a failed board only once, and providers/_http.mjs:158-197 puts a timeout on every request, combined with the board's watchdog signal. jd-page-fetch.mjs also has a timeout.
- reserve/release of report numbers uses one root in every caller (`DATA_ROOT === getCareerOpsRoot()`).
- paste-reply, interview-round, contact-extract and learn do their read-modify-write under a lock. The outcome CV lock is released in a `finally`.
- Tracker writers clean pipes and newlines out of cells with `cell()`.

## Not checked

- The web TS routes beyond grep (they write through the CLI scripts).
- scan-ats-full's checkpoint and SIGTERM path in depth.
- plugins/*, check-liveness, the followup-* scripts, import-tracker's chunked reservations.
- How the batch worker (`claude -p`) writes its own TSVs. That matters for whether finding 2 affects batch runs too.
- What learn.mjs's `WRITABLE` covers.

Not covered: no full test run (as instructed), no web-pod concurrency test. Findings 2 and 4 rest on code reading for the race itself.
