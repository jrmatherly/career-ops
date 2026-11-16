# Project audit: findings

Recorded 2026-11-16 against `main` at `2edd1b33`. The audit was read-only. Nothing in the product changed.

The plan that acts on these findings is [`docs/superpowers/plans/2026-11-16-project-audit-fixes.md`](../../plans/2026-11-16-project-audit-fixes.md).

## What was checked and how

Six reviewers each took one area: security, the core scripts, the web app, CI and deploy, docs and rules, and the test suite. Each reviewer wrote a report and kept the scripts that reproduce its findings. A second pass re-opened the code for every finding before a task was written for it, and that pass changed or withdrew several findings. Both passes are recorded below.

| Area | Report | Scripts |
| --- | --- | --- |
| Security | [`security-report.md`](security-report.md) | `repro/security/` |
| Core scripts | [`core-report.md`](core-report.md) | `repro/core/` |
| Web app | [`web-report.md`](web-report.md) | `repro/web/` |
| CI and deploy | [`ci-report.md`](ci-report.md) | `repro/ci/` |
| Docs and rules | [`docs-report.md`](docs-report.md) | `repro/docs/` |
| Tests, providers, Go dashboard | [`tests-report.md`](tests-report.md) | `repro/tests/` |

The scripts carry a `.txt` suffix so that lint and test discovery skip them. Rename a script to run it.

## Baseline on 2026-11-16

All measured by the lead on a clean `main`.

- `node scripts/check-syntax.mjs` passed 2,640 `.mjs` files.
- `node test-all.mjs --quick` passed 25,197 checks with 0 failures in 356 s, 12 suites at a time.
- `go test ./...` in `dashboard/` passed.
- `npm audit` reported 0 vulnerabilities in the root and in `web/`.
- GitHub showed 0 open Dependabot, code-scanning and secret-scanning alerts.
- The last 12 workflow runs on `main` succeeded.

## Findings that have a task

The id is the task id in the plan. "Measured" means a script or a command showed the behaviour. "Inferred" means the code was read and the behaviour was not run.

### Tracker and pipeline data

| Id | Finding | Status |
| --- | --- | --- |
| CORE-1 | `merge-tracker.mjs` matches a tracker row that is one cell short as a duplicate and rewrites it with shifted columns. The repro lost the note and the report link, and the run exited 0. | Measured |
| CORE-2 | Five scripts write a tracker addition in place, with no lock. A cut file merged with exit 0 and was archived. | Parser measured, race inferred |
| CORE-3 | A re-evaluation with a higher or equal score replaces the report link and leaves no pointer to the old report. | Measured. Owner decision |
| CORE-4 | `outcome.mjs` rewrites its journal in place, outside its lock. | Inferred |
| CORE-5 | `rank-pipeline.mjs` and `sync-batch-input.mjs` disagree on which lines are pending. | Measured |
| CORE-6 | `openrouter-runner.mjs` swallows a failed save of its model blacklist. | Read |
| TEST-1 | `check-jd-archive.mjs` does not treat Assessment as a sent application. | Measured |

### Web app

| Id | Finding | Status |
| --- | --- | --- |
| WEB-1 | Dismissing a running worker removes it from the list and leaves the run going for up to 780 s. | Measured |
| WEB-2 | 29 child-process handlers in 16 files decode output one chunk at a time, which corrupts a multibyte character split across chunks. | Measured |
| WEB-3 | Apply browser sessions stay open after the tab closes, and `openSession` can leak a browser context. | Measured |
| WEB-4 | Three icon-only close buttons and eight fields in the scheduled-scan dialogs have no accessible name. | Measured |
| WEB-5 | Post-run scripts have no kill timer, and `generate-pdf.mjs` leaves two Playwright steps unbounded. | Measured |
| WEB-6 | The apply prefill and drive streams do not stop their child process when the client leaves. | Measured |
| WEB-7 | `PipelineProvider` replaces its data with empty lists on a failed load. | Measured |
| WEB-8 | A failed run saves no log. | Measured. May be deliberate |
| WEB-9 | No test compares the web status canonicalizer with the core one. They agree today on 423 inputs. | Measured |

### Security

| Id | Finding | Status |
| --- | --- | --- |
| SEC-1 | Two private-address classifiers disagree. The Chromium one allows CGNAT, benchmark, multicast and broadcast ranges. Neither handles NAT64, 6to4 or Teredo forms. | Measured |
| SEC-2 | `browser-extract.mjs` and `batch-evaluate-gemini.mjs` check only the literal host in their Chromium routes, so a name that resolves to a private address passes. This path runs in CLI agent sessions, not in the web pod. | Measured |
| SEC-3 | `upskill.mjs` keeps its own weaker copy of the guard. | Measured |
| SEC-4 | The CV preview iframe renders model-written HTML with no CSP, so remote images and CSS load. | Measured |
| SEC-5 | The web app sets no `X-Content-Type-Options` or `Referrer-Policy` header. | Read |
| SEC-6a, SEC-6b | Read-deny rules exist for the evaluate agent, but an attended URL evaluation does not get them. | Measured. Exfiltration itself is not shown |

### CI, tests and tooling

| Id | Finding | Status |
| --- | --- | --- |
| CI-1 | The Tests workflow runs on release tags and twice per push to a PR branch. Commit `4009f1a7` ran the three-OS matrix three times. | Measured |
| CI-2 | The session-start hook warns that the pre-commit guard is inactive when `core.hooksPath` is an absolute path to `.githooks`. The guard is active. | Measured |
| CI-3 | The CV visual jobs pull `main`'s image and never build a PR's own `tests/cv-visual/Dockerfile`. | Measured from a run log |
| CI-4 | `docker-image.yml` skips `publish/**` on pull requests, so `publish/Dockerfile` is first linted and built on `main`. | Measured |
| CI-6 | `.dockerignore` misses local-only tool state and settings backups that a local build would copy. | Measured |
| CI-7 | `main` requires no status checks, and no ruleset protects the release tags. One of the last 98 merged PRs landed with red test legs. | Measured |
| TEST-2 | The Windows leg sets the wall time of the Tests workflow, at 664 to 966 s for the suite step. | Measured |
| TEST-3 | All 412 web unit suites run in one child with a 180 s kill, and used 68% of that budget on Windows. | Measured |
| TEST-4 | Nine tests assert behaviour only by matching source text. | Measured |
| TEST-5 | `providers/workable.mjs` retries after its board is aborted. An aborted board made 4 widget calls, 4 feed calls and 6 sleeps. | Measured |
| TEST-6 | CI runs no `go vet` or linter on `dashboard/`. A narrow lint config finds three issues. | Measured |
| TEST-7 | Three provider tests pass on any thrown error. | Read |

### Docs and rules

| Id | Finding | Status |
| --- | --- | --- |
| DOCS-1 | Six shipped scripts import modules that `config/local-paths.txt` hides from the updater. An install updated with `apply` would fail with `ERR_MODULE_NOT_FOUND`. | Imports measured, `apply` path inferred. Owner decision |
| DOCS-2 | `.claude/rules/modes.md` says twenty market directories. There are 23. | Measured |
| DOCS-3 | Two live docs point at plans that moved to `plans/completed/`, and `modes/tr/scan.md` has one broken link. | Measured |
| DOCS-4 | The `/pr-ready` skill has no CodeRabbit step, though `.githooks/pre-push` requires a review. | Measured |
| DOCS-5 | `discover-ats.mjs` probes 11 vendors. The registry admits 25. | Measured. Owner decision |

## Findings withdrawn or refuted

Each of these appeared in a first report or in the lead's first summary and did not survive a second look.

| Claim | What is true | Who caught it |
| --- | --- | --- |
| Any pod in the cluster can reach the web pod. | The NetworkPolicy `career-ops` allows ingress on TCP 3000 only from the `network` namespace and from pods labelled `career-ops.io/role=scan-tick`. The app itself still has no authentication and relies on that policy. | Lead, by reading the policy |
| The pre-commit hook checks the main checkout when it runs in a worktree. | `.githooks/pre-commit` runs `node "$(git rev-parse --show-toplevel)/.githooks/pre-commit.mjs"`, so each worktree runs its own copy against its own tree. The lead's first summary marked this claim confirmed after reading only `pre-commit.mjs`. That was a mistake. | CI reviewer, second pass |
| The issue templates and five `.github/scripts` files are unrecorded dead leftovers. | The deviations table already records them as kept on purpose. | CI reviewer, second pass |
| `npm run lint` now exits 0, so a stored note about it is stale. | In the owner's shell it still exits 2 through a wrapper. `node scripts/check-syntax.mjs` exits 0. | Lead |
| `modes.md` is wrong that four `SKILL.md` copies need updating. | Four copies are files. The other six are symlinks. | Docs reviewer, second pass |
| `data/blacklist.md` is a missing feature. | It is opt-in by design, and four scanners read it. | Docs reviewer |
| `sponsor-check.mjs` should be wired into the scan. | The docs describe it as a standalone tool and promise nothing more. | Docs reviewer |
| A truncated addition should be refused when it has no final newline. | `openrouter-runner.mjs` and agent-written additions legitimately have none. CORE-2 keeps the atomic write and drops the refusal. | Core reviewer, second pass |
| `parseAppLine` should call the strict parser. | `--backfill-urls` needs the loose check, and a test pins that. CORE-1 checks rows only where duplicates are matched. | Core reviewer, second pass |
| The Workable provider should use the shared retry helper. | The helper would break the 30 s give-up that a test pins. TEST-5 adds the abort checks to Workable's own loop. | Tests reviewer, second pass |
| `batch-evaluate-gemini.mjs` hides an unreadable profile. | The next call reads the same file with no catch and fails loudly. | Core reviewer, second pass |

## Findings with no task

| Finding | Why no task |
| --- | --- |
| The root `package-lock.json` is gitignored, so `deploy/Dockerfile` resolves dependencies at build time. | Upstream ignores the lockfile by policy, and the Dockerfile already marks the shortcut. |
| The root dev `Dockerfile` runs as root and installs `playwright` twice. | It is an upstream file, and an edit conflicts on every upstream merge. |
| `web/` has no ESLint, and its 254 `.mjs` files are not type-checked. | Size M to L, and no defect was shown. |
| `pipeline-view.tsx` (1,281 lines) and the run route's `POST` handler are split candidates. | Size L each, and no defect was shown. |
| 27 web lib modules and 33 API routes have no direct test. | The riskiest one is covered by WEB-9. The rest is a list, not a defect. |
| `app-events.mjs` has no product caller. | Its own header says so. DOCS-1 ships it because another module runs it by name. |
| A docs-only push to `main` runs the full suite and rebuilds four images. | By design. The server image copies the whole checkout. |
| Three suites flake when the machine is under heavy load (load average above 20). `tests/split-root.test.mjs` fails with "batch-runner exited 139": once in ten runs in the audit, then once in a full quick run and once in three runs alone on 2026-11-16. `tests/closing-soon.test.mjs` has a wall-clock bound that failed once with "took 5265ms". `tests/batch-dealbreaker-skip.test.mjs` failed once in a quick run and once in five runs alone. Each passes on a rerun. | No cause is established. The exit 139 is a crash in a child of `batch-runner.sh` and is the one worth a root-cause task. Three quick runs in a row each had a different one of these failures, so a full local run on a loaded machine is not a reliable gate today. Follow-up candidate. |
| Four tests have wall-clock upper bounds. | They passed every run. Watch item. |
| `docker-image.yml` gives the server image no version tag on a web-only release. | The cluster follows the image digest, so the tag is cosmetic, and building it would rebuild four images per web release. |
| A sixth writer of tracker additions, `persist-evaluation-report.mjs`, also writes in place. It is the path the web pod uses. | Its file-system calls go through a test-stubbed `fsImpl`, so the change is larger than CORE-2. Follow-up candidate. |
| About 16 more tests read source text without calling the code, beyond the nine TEST-4 looks at. TEST-4 itself leaves five of its nine alone. | Each needs a browser run or a refactor to convert. TEST-4 records the reason for each one it leaves. |
| `apply-login-wall` and `apply-own-label` skip when Chrome fails to launch. | A launch failure is rare and shows in the log. Watch item. |
| `web/` holds eight dead `eslint-disable` comments and four `any`. | No linter reads the comments, and no defect was shown. |
| `.all-contributorsrc` and `.codexignore` are referenced nowhere. `docs/demo.gif` is 4.8 MB. | Optional cleanup. |

## How the plan was reviewed

After the plan was drafted, seven more reviewers checked it. Six wrote each task's test in a throwaway worktree at `2edd1b33`, ran it, applied the fix and ran it again. One read the whole plan against this spec and the repo's rules. That pass changed the plan in these ways.

| Task | What the first draft got wrong | Who caught it |
| --- | --- | --- |
| WEB-1 | The abort guard sat in a catch block that an aborted run never reaches, because the stream reader turns the abort into an error result. A dismissed run would still have been reported as failed. | Web verifier, with a real aborted fetch |
| CORE-5 | The test could never pass, because its fixture hosts are filtered out as non-public. The fix also broke a neighbouring test. | Phase 1 verifier |
| CORE-3 | The change broke `tests/merge-tracker-no-notes-column.test.mjs`, which the task did not list. | Phase 1 verifier |
| CORE-1 | The warning told the user to run `verify-pipeline.mjs`, which does not name the row. | Phase 1 verifier |
| SEC-6 | The canary script could not load its import, and it would have handed the agent the real environment. The task is now split into an owner-run canary and a code change. | Security verifier |
| CI-1 | Running on `push` only would let a docs-only follow-up push leave a pull request's head with green checks that tested nothing. The default is now pull requests plus pushes to `main`. | CI verifier and the whole-plan reviewer, independently |
| CI-4 | The `web-v*` image tag was cosmetic and would rebuild four images on every web release. It was dropped. | CI verifier |
| TEST-2 | The shard filter ran before the empty-list check, so a shard that a filter left empty failed. | Tests verifier and the whole-plan reviewer |
| TEST-6 | The lint command fails under Go 1.27. It now pins the toolchain to the version in `go.mod`. | Tests verifier |
| DOCS-1 | The import-closure test claimed more than it checks, and two more shipped tests load fork-only files. | Docs verifier |
| DOCS-5 | The owner's vendor probe was scheduled before the code that makes it runnable. An offline probe test turned out to be possible and was added. | Docs verifier |
| PREP-1, FINAL-1 | The worktree would have had no plan, no repro scripts and a launch configuration that starts the main checkout's app. | Whole-plan reviewer |

Not covered by that pass: no browser suite ran, no workflow ran on GitHub, and the canary was never run against a real agent.

## What the audit did not cover

- Nothing ran in a browser, and no Docker image was built.
- The home-cluster manifests beyond the one NetworkPolicy.
- The apply flow's Playwright path, the plugins, and input validation in every route body.
- Whether a posting can make the evaluate agent send a secret to an outside server. SEC-6 starts with the test that settles it.
