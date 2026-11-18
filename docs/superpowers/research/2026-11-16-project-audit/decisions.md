# Owner decisions, 2026-11-16

The owner decided D1 to D11 of the [audit-fix plan](../../plans/completed/2026-11-16-project-audit-fixes.md) on 2026-11-16. D4 and D8 were decided first, from the measurements in the plan's "Evidence for D4 and D8". The other nine were decided after four researchers checked each default against the code, the live repository settings, the deployed tracker (counts only) and current documentation. The lead re-ran or re-read the claims marked "Confirmed".

**Where a row here differs from a task's text in the plan, this file wins.** A task marked "Amended" is implemented from its plan section plus the amendment below.

| # | Decision | Outcome | Tasks affected |
| --- | --- | --- | --- |
| D1 | Pointer to the superseded report on every report change | Yes, amended | CORE-3 |
| D2 | Support installs that update with `apply` | No | DOCS-1 is replaced |
| D3 | Probe the 14 other vendors in `discover-ats.mjs` | Not in this branch | DOCS-5 is dropped |
| D4 | When the Tests workflow runs | Plan default | CI-1 |
| D5 | Required checks on `main`, tag ruleset | Yes, amended | CI-7 |
| D6 | Two Windows shards | Yes, amended | TEST-2 |
| D7 | Save a failed run's log | Yes, amended | WEB-8 |
| D8 | Delivery | One branch, one pull request | FINAL-1 |
| D9 | Delete `tests/set-status-lock-scope.test.mjs` | No, keep the file | TEST-4 |
| D10 | Run SEC-6b whatever the canary shows | Yes, amended | SEC-6a, SEC-6b |
| D11 | Release the apply session on page exit | Redesigned | WEB-3 |

With DOCS-5 out, the branch holds no `feat`, so it releases career-ops 2.6.1.

## Amendments

### CORE-3 (D1)

Do the task as written, and add:

- `verify-pipeline.mjs` Check 10 (orphan reports) builds `referencedNums` from the Report cell only (`:517-529` at `456c4962`). Make it also count report numbers named by a `Superseded report [N]` marker in Notes, using the pattern Check 9 already uses for that marker. Add a test that a superseded report is not reported as an orphan.
- Update the three places that still say the marker is written on a downgrade only: the header comment near `merge-tracker.mjs:15`, the `mergeNotes` JSDoc near `:633`, and `batch/README.md:125`.

Evidence. Confirmed: Check 10 reads the Report cell only. Researcher, on the pod: 86 rows, 37 with a `Re-eval` clause, 23 with the marker; 15 equal-or-upgrade re-evaluations carry no marker; 10 report files are referenced by nothing; no row has more than two `Re-eval` clauses. Researcher: no consumer under `web/src` or `dashboard/` parses the marker, and upstream has not changed this hunk since the fork point.

### DOCS-1 (D2), replaced

Do not move entries into SYSTEM_PATHS and do not add the import-closure test. Instead, state that updating with `update-system.mjs apply` is not supported on this fork, in each fork-owned doc that offers it:

- `FORK.md`: one sentence, with the reason (shipped scripts import fork-local modules that `apply` does not deliver, so an install updated that way fails with `ERR_MODULE_NOT_FOUND`) and the supported paths (the plugin, the container image, `git pull`).
- `DOCKER.md` near `:131-138` and `docs/DEPLOYMENT.md` near `:151`: the same sentence where they describe `apply`. `DOCKER.md:136` also says `apply` uses upstream's release tarball; it fetches the fork's tag by git. Correct that.
- `docs/CLAUDE_PLUGIN.md:73` says `check` on this fork reports `offline`. Fork releases exist now. Correct it.
- `AGENTS.md:85,91` is the product's prompt and tells an agent to offer `apply`. It is a system-layer file upstream ships. Change the fork paragraph at `:85` to say the fork's `check` reports releases and `apply` is unsupported here, add a deviations row, and leave upstream's `:91` wording alone.

Read each file first; the line numbers are from `456c4962` and the researcher's report, and only `AGENTS.md:85,91` was re-read by the lead. The commit is `docs(...)`.

Evidence. Confirmed: 0 stars, 0 forks, created 2026-11-05; `CANONICAL_REPO` is the fork; `deploy/Dockerfile:25` is `COPY . .`; `config/local-paths.txt` is tracked. Researcher: `apply` works mechanically on fork tags and the six imports are real, so the breakage is real for anyone who clones the fork and runs `apply`; nothing but the updater, the coverage validator and their tests reads SYSTEM_PATHS; DOCS-1 as written would have required every existing clone to hand-edit `config/local-paths.txt`.

### DOCS-5 (D3), dropped

Not in this branch. If the vendors are wanted later, offer them upstream, because `discover-ats.mjs` is byte-identical to upstream's and upstream grew it from 3 to 11 vendors itself.

Evidence. Confirmed: `providers/zoho-recruit.mjs` documents a 200 "Page does not exist" page for an unknown tenant, `providers/trakstar.mjs` documents HTTP 400, and `isDefinitiveAbsence` accepts only 404 and 410, so both vendors would turn every unresolved company into "probe error". Researcher: the pod's `portals.yml` has no entry for the 14 vendors beyond the template's; upstream issues #4190 and #4179 record vendors that answer for any slug.

### TEST-2 (D6) and CI-7 (D5)

TEST-2 as written, and add one aggregate job to `.github/workflows/test.yml`:

- It `needs: [test]`, runs with `if: ${{ always() }}`, and fails unless `needs.test.result == 'success'`. Without `always()`, a failed leg skips the job, and a skipped job counts as passing.
- It ignores the `changes` job, whose failure is tolerated by design.
- Give it a stable name. Add one assertion for it in `tests/docs-only-change.test.mjs`.
- Fix the job-count comment: `test.yml` starts 9 jobs today, so the count becomes 11 with the second shard and the aggregate job.

CI-7 then requires two contexts, the aggregate job and `🔒 Guard user-layer files`, not the leg names. Keep the admin-role bypass at `always` and strict off. CI-7 stays the owner's, after the merge.

Evidence. Confirmed: `jrmatherly/llm-router` runs a ruleset with `required_status_checks`, the bypass `{actor_id: 5, actor_type: RepositoryRole, bypass_mode: always}` and `current_user_can_bypass: always`; `test.yml` has no `paths:` filter. Researcher: about 31 direct docs pushes to `main` in 8 days, which a pull-request-only bypass would block; Windows legs took 740 to 1065 s against 300 to 694 s for macOS; another public repository's include-only matrix yields the predicted shard names. Not verified: that `needs.test.result` is `failure` when one matrix leg fails. The first pull-request run settles it.

Known cost. On run 43913402133 the macOS leg was cancelled because no hosted runner was acquired. Under required checks, a miss like that blocks a merge until the leg is re-run.

### WEB-8 (D7)

As written, and add: before the save route writes an error run, mask key-shaped strings in the error text and the output tail. The error line is chosen by `GENERIC_FATAL_STDERR_RE` in `web/src/lib/run-cli-support.mjs:150-151`, which matches `api key`, `credentials`, `unauthorized` and `login`, so it favours the lines most likely to quote a secret. Reuse a masker if the repo has a general one; the researcher found none (only `redactToken`, local to `providers/comeet.mjs`). A small pure function with its own test is enough: mask long token-shaped runs after `key`, `token`, `secret`, `bearer` or `authorization`, and known prefixes such as `sk-`. Not in scope: the "No CLI configured" path, which returns before `finish` and still saves nothing.

Evidence. Confirmed: the regex. Researcher: nothing redacts saved logs; the assistant preamble tells the assistant to read saved runs; scheduled scans do not use this path; the pod holds 10 run files in 44 KB. Not verified: whether any agent CLI prints a key on stderr.

The first implementation followed "error text and output of an error run". A task review and a commit security review on 2026-11-16 found that too narrow and the masker quadratic. The route now coerces and caps every free-text field, then masks all of them on every status.

### TEST-4 (D9)

As written, except keep `tests/set-status-lock-scope.test.mjs`. Drop its deletion line, its deviations note and the `git rm`.

Evidence. Lead's experiment: with `set-status.mjs` switched to an in-place `writeFileSync`, `tests/set-status.test.mjs` printed `❌ write-failure`, so the behaviour is covered on macOS without the file. Researcher: the file costs 0.32 s, only reads source text so it cannot flake, and upstream has not edited it since the fork point. Deleting it buys nothing and adds a deviation.

### SEC-6a and SEC-6b (D10)

SEC-6b as written, and add:

- Pass `permissions.blockReadsOutsideWorkingDirectories: true` to the attended Claude run through `--settings`, with the code checkout given by `--add-dir`, and a cwd-relative deny for the data root's env files that also covers `.env.*`. Keep the existing `~/.claude` denies. Confirmed in the settings reference: "Make the file tools refuse reads outside the working directories in every permission mode". The researcher reads the version floor as 2.1.257; the image pins 2.1.319. **Nobody has run this against the app.** The implementer first proves the flag is accepted by the installed CLI (`claude --help` and a dry invocation), and reports BLOCKED if it is not, in which case SEC-6b ships as written.
- Give the same read protection to the two other attended Claude routes that hold Read plus WebFetch, `web/src/app/api/assistant/route.ts` and `web/src/app/api/explore/ai/route.ts`.
- Tighten the environment strip so a Claude child does not inherit the other agents' keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`) when they are set. A CLI keeps only its own.

SEC-6a (owner step): the canary should also probe Grep and Glob over the working directory, not only Read, because the documentation describes Read-deny coverage of those tools as best-effort.

Gap that stays open and goes in the pull request body: the ten CLIs other than Claude and Codex get no read fence. The pod runs only Claude.

### WEB-3 (D11), redesigned

Keep the first half as written: `openSession` closes its BrowserContext on any throw before the session is recorded.

Replace the second half:

- On `pagehide`, release the session unless its window has been handed off. The handoff is a sticky fact in the provider, not a status, because after a handoff the status moves on to `filling`, `ready` or `error` while the headed Chrome window stays on screen. It is set when a fill response carries `handedOff` or the agent's fill reports `filled`, and cleared only where `open` and `reset` give up the session id. Ignore `event.persisted`. Do not listen for `visibilitychange`.
- No server-side timer. The owner decided this on 2026-11-16. A cap from creation would close a window in use, and the server cannot tell an abandoned handed-off window from an active one. A window orphaned by a crash stays until the user closes it or the next apply prunes it.
- Tests, in `web/tests/lib/apply-session-release.test.mjs`: `openSession` closes its context when a page step throws. The other three read the provider's source, because node cannot import the client component. They pin that `pagehide` releases only when the window is not handed off, that both handoff paths record it, and that only `open` and `reset` clear it, so a later status cannot.

The back-forward-cache question D11 asked is close to moot. Confirmed: `web/src/app/layout.tsx:38` calls `connection()`, and the prefill and drive streams return `Cache-Control: no-store`. Researcher, from Chrome's documentation: such pages are restored rarely and only within three minutes. Not verified in a browser.

## Research notes

- One researcher wrote three temporary files to the pod's `/tmp` through `kubectl exec` and deleted them, against its read-only brief. It reports nothing under `/data` was touched.
- Parked for the whole-branch review, from the CORE-1 and CORE-2 task reviews: the short-row warning also prints during `--backfill-urls` runs; a row short only by its trailing URL cell is no longer matched, so a re-evaluation adds a row until `--backfill-urls` repairs it; the CORE-2 deviations row says its test pins five writers and it runs one.
