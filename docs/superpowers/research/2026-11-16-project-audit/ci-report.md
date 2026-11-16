# CI audit report

Commit `2edd1b33`, 2026-11-16. Slice 4 of 6: CI, release, build and deploy. Read-only audit. The scan script is in `repro/ci/` (rename `.mjs.txt` to `.mjs` and run it from the repo root).

The lead sent no corrections. A re-check while writing the tasks found two errors, marked "Corrected on re-check" below. Item 2 is withdrawn. Item 9 is mostly withdrawn.

ISSUES

1. Tests runs 3 to 5 times for one change (medium, high, measured)
- Where: `.github/workflows/test.yml:4-8`. `push:` has no branch filter, so tags trigger it. The concurrency group at `:20` is the PR number or the ref, so a branch push and its PR land in different groups.
- Evidence: SHA 4009f1a7 ran Tests three times. Run 43792282616 was for main (legs 482 to 804 s). Run 43792299272 was for tag `career-ops-v2.6.0` (Windows leg 959 s). Run 43792300115 was for tag `web-v1.7.0`. SHA 2fc37427 ran on push (43788468474) and on pull_request (43788472239). Since 2026-11-01 Tests ran 18 times on push and 7 times on pull_request.
- Impact: one release cycle costs about 5 runs of the 3-OS matrix.
- Fix (S): `push: branches: ['**']`, and one run per PR push.

2. ~~The pre-commit syntax check in a worktree checks the main checkout~~ (withdrawn)
- **Corrected on re-check.** `.githooks/pre-commit:4` is `exec node "$(git rev-parse --show-toplevel)/.githooks/pre-commit.mjs"`. Git runs a hook from the top of the worktree, so the wrapper runs the worktree's own `pre-commit.mjs`. Its `root` (line 23), and the `scripts/check-syntax.mjs` it spawns, are therefore the worktree's. `.githooks/commit-msg:4` uses the same pattern. The audit had read only the `.mjs` files, not the shell wrappers. The finding is wrong.

3. The CV visual and tool suites never test a PR's own `tests/cv-visual/Dockerfile` (medium, high, measured from a run log)
- Where: `test.yml:156-164` and `:208-216`. Both jobs pull `ghcr.io/<repo>-cv-visual:latest` and build locally only when the pull fails.
- Evidence: in PR run 43788472239, the CV visual job's log shows `latest: Pulling from jrmatherly/career-ops-cv-visual`, then `Status: Downloaded newer image`. The `docker build` branch did not run. The published image carries `org.opencontainers.image.revision` (`2edd1b33…` today), which a fix can compare against.
- Impact: a Dockerfile change is tested only after it reaches main.

4. Main has no required checks; the ruleset blocks only deletion and force-push (low-medium, high, measured)
- Evidence: `gh api repos/jrmatherly/career-ops/branches/main/protection` returns 404 "Branch not protected". Ruleset 26671457 has rules `deletion` and `non_fast_forward` only, no bypass actors, and no tag ruleset.
- In the last 98 merged PRs, one merged with all three `test (*)` legs red: #48 (`ci(release): …`, 2026-11-09).

5. Dependabot has opened no PR (low, inferred)
- `.github/dependabot.yml:5` says version updates are off on forks until enabled. All 99 PRs are by `jrmatherly` or `app/careerops-release`.
- Re-check: every action pin is at its latest release today, so enabling it would open no PR now.

6. The Docker image workflow skips `publish/**` on PRs (low, high)
- `docker-image.yml:30-39`. The file's own comment at `:17-18` already says so.

7. Web-only releases get no versioned server image (low, high, measured)
- `web-v1.1.1` and `web-v1.1.2` had no `career-ops-v` tag. `docker-image.yml:28` builds on `career-ops-v*` tags only.
- The cluster follows the image digest through Renovate (`docs/DEPLOYMENT.md:109`), so the version tag is cosmetic.

8. The session-start hooksPath warning is a false alarm (low, high, measured)
- `.claude/hooks/session-start.mjs:25` compares the value as a string with `'.githooks'`. Here `git rev-parse --git-path hooks` gives the same directory as `realpath .githooks`.

9. Dead upstream leftovers (mostly withdrawn)
- **Corrected on re-check.** The deviations table row at `.claude/skills/upstream-review/SKILL.md:241` already records the issue templates and "the five orphan `.github/scripts`" as "Kept deliberately (inert, deleting only buys conflicts)". The audit's grep for an exact path missed that row.
- Still valid: `copilot-setup-steps.yml` runs on tag pushes (runs on `career-ops-v2.6.0` and `web-v1.7.0`), because a `paths:` filter does not apply to tags.

10. `.dockerignore` misses local-only paths that a local `COPY . .` would bake in (low)
- `.claude/settings.local.json.bak-*`, `.archify/`, `.impeccable/`, `.superpowers/`, `.claude/launch.json` and `.claude/skill-stack.json` are gitignored but not dockerignored. `deploy/Dockerfile:25` copies the whole context.
- CI builds from a clean checkout and is not affected.

Opportunities (by design, not planned)
- A docs-only push to main still runs the 542 s Ubuntu suite (run 43796473392) and rebuilds the four images (2.6 min).
- Slowest jobs: test on Windows (740 to 959 s, of which the suite itself is 861 s), test on macOS (495 to 740 s), CodeQL JavaScript (528 s) and the web browser suites (246 s).
- `Dockerfile:46` reinstalls `playwright@1.64.1`, which `package.json:120` already pins exactly. The Dockerfile is upstream's.

Intentional, recorded in SKILL.md
- The `santifer` module path in `dashboard/go.mod` (row at `:257`).
- The author field in `package.json` and `.github/plugin/plugin.json` (`:220`).
- The inert `renovate.json` (`:218`), the comment-only `FUNDING.yml` (`:221`) and the fork-owned `CODEOWNERS`.
- Issue templates and orphan scripts (`:241`).

Checked and found sound
- Every action is pinned by SHA, and the repo sets `sha_pinning_required`. Permissions are least-privilege and the default token is read-only.
- Base images are pinned by digest, and the Go tarball's checksum is verified.
- The seven release token files match the manifest (2.6.0 and 1.7.0), and `stamp-version --check` passes.
- The App-token release tags trigger the image build. GHCR carries `career-ops-v2.6.0` and `2.6.0` on the images.
- The server and publish images run as uid 1000.
- `.dockerignore` excludes `.git` and the whole user layer.
- There are no open Dependabot or code-scanning alerts.

Not checked
- Image sizes (no Docker available).
- Whether Dependabot version updates are enabled (no API exposes it).
- The 34 upstream `career-ops-v1.x` tags on the fork's remote.
