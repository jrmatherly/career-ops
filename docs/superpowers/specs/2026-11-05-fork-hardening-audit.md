# Fork hardening audit, 2026-11-05

Findings from a four-slice read-only audit of this fork's own surface at `88262f9a` (the 61-file deviation from upstream `cd379373` plus the GitHub repo settings). Upstream's product code was out of scope. Every "measured" item was re-run by the auditor in the main session; "worker" items rest on a subagent's cited evidence.

## What passed

- `tests/claude-hooks.test.mjs` 7/7, `node validate-system-paths-coverage.mjs` OK (3153 files), `npm run lint` clean.
- All 14 action pins are 40-hex SHAs matching their tagged release, every one at latest; `sha_pinning_required` is on.
- Every workflow has a least-privilege `permissions:` block; only `GITHUB_TOKEN` is referenced; no repo secrets exist.
- GHCR images `career-ops` and `career-ops-cv-visual` are public with SLSA provenance; the Dockerfile digest resolves and equals the live `v1.64.1-jammy` tag.
- Watermark `lastReviewedSha` equals `git merge-base HEAD careerops/main`; 60 tags match upstream and origin.
- No tracked user data; every `matherly`/`jrmatherly` hit is an intended contact or owner line.

## Findings

| # | Sev | Where | Claim | Evidence |
|---|-----|-------|-------|----------|
| 1 | high | GitHub `main` | No branch protection, no ruleset: force-push and deletion allowed on a public repo | `gh api .../branches/main/protection` 404; `.../rulesets` `[]` (measured) |
| 2 | high | `.githooks/pre-commit.mjs:11` | `git diff --cached --name-only` has no `--diff-filter`, so staged edits and deletions of tracked files are graded. `examples/dual-track-engineer-instructor/cv.md` is tracked upstream and matched by `.gitignore:2`, so any edit to it, including finishing a conflicted upstream merge, is refused; `git rm --cached <leak>` is refused too | `git check-ignore -v --no-index` → `.gitignore:2:cv.md` (measured) |
| 3 | medium | `AGENTS.md:91` vs `.claude/rules/dev-workflow.md` | The session-loaded prompt says to run `node update-system.mjs apply --confirm`; the only ban is in the upstream-review skill, loaded only on invocation. `npm run update` and `./cops update` reach the same command | `grep -c update-system dev-workflow.md` = 0 (measured) |
| 4 | medium | `upstream-review.sh:119-120` | `--github` prints nothing on `main`: `for ref in main "$branch"` with `[ "$ref" = main ] && [ "$branch" = main ] && continue` skips both iterations | script text (measured) |
| 5 | medium | `upstream-review.sh:36,72,75,154-165` | Header says only `--advance` writes, but every subcommand fetches and may `git remote add`; `--advance` can move the watermark backward (only checks NEWSHA is on TIP) and never checks a review log exists; the watermark write is `cat > STATE` (truncates in place, temp leaks on jq failure); `--dry-run-merge` treats every non-zero `merge-tree` exit as a conflict | script text (measured) |
| 6 | medium | `.claude/skills/upstream-review/SKILL.md` table | No row covers the six `concurrency:` blocks and the workflow/job renames from `15db1c5d`, the `DOCKER.md` section, or `tests/claude-hooks.test.mjs`. Nothing checks the table against `git diff --name-status <merge-base> HEAD` | `grep -c` for `DOCKER.md`, `concurrency`, `claude-hooks.test` all 0 (measured) |
| 7 | medium | `.github/workflows/no-user-data.yml:14-16` | `pull_request` only; the fork pushes straight to `main` and has had zero PRs, so the CI guard against user-layer files never runs | workflow text; `gh pr list --state all` empty (measured) |
| 8 | medium | `.claude/rules/dev-workflow.md:6` | "A fork-local file goes in `config/local-paths.txt`" cannot hold for files under shipped directories (`.claude/skills/*`, `tests/claude-hooks.test.mjs`): `localUserPaths()` rejects any path under a SYSTEM_PATHS entry (`update-system.mjs:453-463`). They survive `apply` because the stale-file prune deletes only paths upstream once shipped (`wasEverShippedUpstream`, `update-system.mjs` ~2110-2140) | worker, code cited; prune rule corrected 2026-11-05 on reading the code |
| 9 | medium | `.claude/hooks/session-start.mjs:14` | `git config --get core.hooksPath` reads every scope; a global hooks path (husky, corporate) silently skips the set and the guard stays off | script text (measured) |
| 10 | low | `dashboard/go.mod:3` vs `test.yml:74,195`, `copilot-setup-steps.yml:35` | Floor `go 1.26.0` is never tested; CI installs 1.27; only `codeql.yml:40` uses `go-version-file` | measured |
| 11 | low | README, CONTRIBUTING, templates | Nothing tells a visitor this is a fork or where upstream lives | worker grep |
| 12 | low | `codeql.yml:27` | Matrix omits the `actions` language; nine workflow files are never scanned | measured |
| 13 | low | `docker-image.yml:77-86` | No `sbom: true`, provenance at default `min` | worker `imagetools inspect` → SBOM `{}` |
| 14 | low | `test.yml:12` | Dead `merge_group` trigger (no merge queue); `push` with no branch filter doubles runs when a PR branch exists | measured |
| 15 | low | `.gitignore` fork tail | `.claude/rules/skill-stack.md` and `.claude/skill-stack.json` are ignored only by `~/.gitignore` | worker `git check-ignore -v` |
| 16 | low | `.github/CODEOWNERS:15-16` | Header claims branch protection requires an approval on every PR; false here | measured (finding 1) |
| 17 | low | `.claude/skills/pr-ready/SKILL.md:15,16` | Step 4 reads a non-zero `check-ignore` exit (nothing ignored) as a failure; step 6 ticks "ran `node test-all.mjs`" after `--quick` | worker |
| 18 | low | `.claude/rules/dev-workflow.md:7` | Conventional Commits rule is prose only; no commit-msg hook | measured (`.githooks/` has only pre-commit) |
| 19 | low | `tests/claude-hooks.test.mjs` | No case for `session-start.mjs`, for a staged deletion, for a tracked-but-ignored file, or for the syntax-failure path | worker |
| 20 | low | `DOCKER.md:40` | Comment says `./cops up` builds; compose pulls the GHCR image when no local image exists | worker `docker compose --dry-run up` |
| 21 | low | `SKILL.md:66,89,22`; `watermark.json` note | Tag sync lacks `+` and pushes every local tag; line 89 names deleted `release.yml`; line 22 overstates what `apply` does (without `--force` it keeps modified files and writes `.bak`); the watermark note mislabels `forkPointSha` as the merge-base | worker, script text |
| 22 | info | secret scanning | Validity checks are enabled only through an org or enterprise security configuration; the repo-level API accepts and ignores the flag | GitHub docs (measured) |

## Deferred decisions (not in the plan)

- Deleting the inert `.github/` leftovers (issue templates, PR templates, `labeler.yml`, orphaned maintainer scripts, `FUNDING.yml`, `sponsors.json`). Each needs its CODEOWNERS entry and test pin removed in the same change. Worth a separate decision.
- Turning off `voltagent-infra` in the project stack.
