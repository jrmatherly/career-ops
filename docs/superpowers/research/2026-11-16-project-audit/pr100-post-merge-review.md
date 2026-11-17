# PR 100 post-merge review, 2026-11-17

PR 100 (the 2026-11-16 audit fixes, merged as `a17c8416`) took 107 commits, and the last 40 fixed that day's own fixes. Four independent reviewers read what landed, one per area, with the plan and none of the build session's history. Range: `456c4962..a17c8416`.

Nothing here is fixed yet. Each finding says how it was checked: **Re-run** (the lead ran the reviewer's reproduction again), **Reproduced** (the reviewer ran it, the lead did not), or **Read** (inferred from the code).

## Verdict

The planned cases are fixed and tested. Three of the four areas kept needing revisions for the same reason: each solved a class of input by matching its shape, and each review pass found one more shape. The reviewers independently named a simpler design in each area that would close the class.

| Area | Revised shape that kept leaking | Simpler shape |
| --- | --- | --- |
| Tracker short rows (`merge-tracker.mjs`) | Count pipes against the header | Check what each cell holds (date, score, status, PDF mark), in one predicate shared by merge, backfill and verify |
| Saved run log masking (`mask-secrets.mjs`) | Patterns for what a secret looks like, applied after the cut | Mask the values the server already knows, and mask before cutting |
| Egress guard (`liveness-browser.mjs`) | Every caller repeats a six-step order | One `openGuardedPage` helper, or the filtering proxy the code already names as the real fix |

## Findings, most severe first

### 1. Tracker: a stray pipe hides a missing cell and the row is rewritten shifted. Re-run.

`merge-tracker.mjs:1682-1707`. A row missing its PDF cell whose note holds an unescaped `|` has the right pipe count, so the stop does not fire. The merge exits 0, drops part of the note and the old report link, and writes no `Superseded report` marker. This is the audit's original CORE-1 failure, reachable without `--backfill-urls`.

```bash
node docs/superpowers/research/2026-11-16-project-audit/repro/pr100-review/tracker-probe.mjs pipeMask
```

### 2. Egress: the liveness check reads a page after a redirect into private address space, and the batch runner sends refused postings there. Re-run.

`liveness-browser.mjs:795-1009`, `batch-evaluate-gemini.mjs:450-469`. `checkUrlLiveness` never calls `rejectLandedUrl` or `recordLandedUrls`. A 302 to a name that resolves to `10.0.0.5` was read and judged `active`. In the batch path, a posting the scrape refused is visited again by this weaker check and its pipeline line is closed as expired from the internal page's text. `check-liveness.mjs` and `scan --verify` share the gap.

```bash
node docs/superpowers/research/2026-11-16-project-audit/repro/pr100-review/egress-repro.mjs
node docs/superpowers/research/2026-11-16-project-audit/repro/pr100-review/egress-batch.mjs
```

### 3. Masking: four misses and one over-mask. Re-run.

`web/src/lib/mask-secrets.mjs:31`, `web/src/app/api/runs/save/route.ts:68-73`.

| Input | Saved as |
| --- | --- |
| `password: "hunter two three"` | `password: "[masked] two three"` |
| `--password hunter2abc` | unchanged |
| a token at the start of the cut window (its label was cut off) | unchanged |
| `https://user:p@ss@host/x` | `https://user:[masked]@ss@host/x` |
| `PWD=/srv/career-ops` | `PWD=[masked]` |

The first and third are the two CodeRabbit threads left open on the PR (comments 4595682154 and 4595682159). Also unchanged, Reproduced: `SECRET_KEY_BASE=…`, `glpat-…`, `hf_…`.

### 4. Tracker: an indented row is invisible to the stop, so its re-evaluation is appended. Re-run.

`merge-tracker.mjs:1705`. A complete row with two leading spaces is valid Markdown. The merge adds a second row and archives the TSV, which is the outcome the stop was added to prevent. A short row whose `#` is `0`, `—` or blank does the same (Reproduced).

```bash
node docs/superpowers/research/2026-11-16-project-audit/repro/pr100-review/tracker-probe.mjs indentedFull
```

### 5. Egress: behind a proxy on a private or loopback address, every page read is refused. Re-run.

`liveness-browser.mjs:423, 485-505`. `response.serverAddr()` is the proxy's address. The refusal says "a response came from private target IP 127.0.0.1" with no hint that a proxy is the cause. The Node fetch path honours `CAREER_OPS_TRUST_PROXY_EGRESS`; the browser path never reads it.

### 6. Apply: closing the tab while a form is opening leaks a browser context. Read.

`web/src/lib/apply/session.ts:228-407`, `web/src/app/api/apply/session/route.ts:31`. `openSession` ignores `req.signal`, the page has no session id to release on `pagehide`, and the idle close never fires while a session is recorded. The headed Chrome process stays until the next apply, or for the life of the server. Decision D11 covers a crash, not a closed tab. Fix: pass `req.signal` in and close the context if it aborted before the session is recorded.

### 7. Read fence: an attended `fix-portal` run keeps Bash, which the fence does not govern. Read.

`web/src/app/api/run/route.ts:153`, `web/src/lib/claude-invocation.mjs:182`. The read denies cover the file tools only. `run-route-attended-read-denies.test.mjs` asserts Bash stays. Neither the stream nor the PR body says the fence is partial for this kind. Fix: narrow Bash to the one command the kind needs, or state the limit.

### 8. `verify-pipeline.mjs` passes a row the merge refuses. Reproduced.

`verify-pipeline.mjs:327`. On a tracker whose only row lacks its PDF cell, the health check prints "Pipeline is clean" and the merge prints "Nothing merged". The tool a user runs to find out why a merge stopped says nothing is wrong.

### 9. Decision D2 is half landed. Re-run (grep).

`modes/update.md:78-80` still walks an agent through `update-system.mjs apply --confirm`, and `docs/SCRIPTS.md:40` lists `npm run update` with no fork note. `AGENTS.md:85` states the override twice while `:91` still says to apply. A refusal inside `update-system.mjs` when the canonical repo is the fork would replace seven hand-edited doc sentences.

### 10. The batch runner learns about a short row only after the whole batch ran. Read.

`batch/batch-runner.sh:2119`. The merge runs last under `set -e`, so the stop ends the script before the summary. No data is lost, but the tokens are spent. Fix: a `--dry-run` preflight before the workers start.

### 11. CORE-5 unified two pending-line readers and left three on the old rule. Reproduced for Node, Read for Go.

`lib/pipeline-sections.mjs:64-71` against `dashboard/internal/data/pending.go:166-170`, `reconcile-pipeline.mjs:213-216` and `openrouter-runner.mjs:931`. For a `pipeline.md` with no Pending heading, `sync-batch-input` now queues the row, the dashboard does not show it, and reconcile never moves it.

### 12. The LaTeX compile timeout is 120 s in the product, and the test's 5 minutes never applies. Re-run (CI logs).

`generate-latex.mjs:233`. Failed `main` twice (runs 43913402133 and 44024516165). Fixed in the pull request that carries this file: 240 s.

## Minor

- `dashboard/internal/data/tracker_lock.go`: 354 lines of lock code with no production caller. The dashboard writes the tracker only through `set-status.mjs`. Read.
- `outcome.mjs:635, 641`: the journal rewrite drops file permissions and replaces a symlink. `replaceUserFile` in the same module keeps both. Read.
- `merge-tracker.mjs:1794`: when the `#` cell is the missing one, the refusal names "Row #2026" (the date). Reproduced.
- `import-tracker.mjs:359`, `fix-report-links.mjs:177`: two writers still use a plain `writeFileSync`. Read.
- `web/src/components/apply/apply-provider.tsx:128`: the reach drive in `open()` has no abort controller, which can cost one wasted planner turn. Read.
- `web/src/lib/spawn-cli.mjs:15-19`: the secret env list is a hand copy of the settings registry's secret rows with no parity test. In sync today. Reproduced.
- Egress refusals print the private address a name resolved to (`liveness-browser.mjs:301, 504`). TEST-NET ranges and a zone id on a public IPv6 address are not blocked (`providers/_ip-guard.mjs:65-77, 139-144`). Reproduced.
- `tests/landed-url-guard-armed.test.mjs:166` stubs the liveness fallback that finding 2 goes through, so it passes with the gap in place. Read.
- Source-text tests: `web/tests/lib/apply-stream-cancel.test.mjs`, `apply-session-release.test.mjs`, `worker-dismiss-stops-run.test.mjs` pin spellings, not behaviour. `attended-read-fence-routes.test.mjs` shows route handlers can be driven under a stub loader. Read.
- `.github/scripts/docs-only-push.mjs:4` still says the fork has no PR flow. Read.
- Windows shard 1 runs 1.1 to 1.3 times longer than shard 2, because only it runs the inline sections. Reproduced from run timings.

## What held up

- Every `applications.md` writer takes the tracker lock and replaces atomically.
- The masker is linear: under 5 ms at 128,000 characters on every pathological input tried.
- `isBlockedAddress` blocked all 35 address forms probed, and a WebSocket opened inside a Worker is recorded and refused.
- The two Windows shards cover 1,351 test files with no overlap and none missing. The aggregate job fails on a failed, cancelled or skipped leg.

## Not checked

- Windows behaviour and the Go tests were read, not run.
- Whether the read fence works at runtime needs a model run (SEC-6a, the owner's canary).
- The cell-shape tracker predicate, value-based masking and the filtering proxy are proposals. None was prototyped.
- A reviewer noted Claude Code has a `--restricted` mode that would replace the hand-built fence settings. Whether the image's pinned 2.1.319 has it was not verified.
- A possible bug outside the range: `liveness-core.mjs` read a URL's explicit port as the job id.
