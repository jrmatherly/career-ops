# Why CodeRabbit and CodeQL reviews looped, and what changed

Date: 2026-11-17. Scope: the fork's review gate (`.githooks/`), `.coderabbit.yaml`, `codeql.yml`.

## Problem

PRs 103 and 104 went through repeated rounds of review findings and fixes. The owner asked why
findings are not caught sooner and how to stop the rounds.

## Findings

Each row was measured on this repository or read from the CodeRabbit or GitHub docs on 2026-11-17.

| Finding | Evidence |
| --- | --- |
| The rounds on PR 104 were local. The branch was pushed once. | `gh run list --branch fix/pr100-review-findings` shows one head SHA. The review markers in the owner's `.git/coderabbit-reviewed/` (local, not in the repository) show five passes on that branch with 6, 4, 3, 1 and 5 findings. The decline reasons recorded there say "Ninth local pass" on PR 100 and "after 14 passes" on an earlier branch. |
| The push hook blocked on every finding. | `.githooks/coderabbit-review.mjs` ran `--gate info` and recorded any finding as blocking. |
| A gated run reviews the whole diff again. | CodeRabbit agent-mode docs: a gate "requests a fresh review of the whole selected diff instead of continuing from the last incremental checkpoint". |
| Most findings were below major. | Last local pass on PR 104: 1 major, 2 minor, 2 trivial. The PR review: 2 major, 3 minor, 1 trivial. |
| CodeRabbit's own bar is lower. | Its Claude Code guide: "The cycle continues until all critical issues are resolved." |
| Nothing on the PR blocks a merge. | The `protect-main` ruleset has no required status check. The CodeQL check passed with three alerts open. |
| `.coderabbit.yaml` is active on the fork. | CodeRabbit reviewed PRs 103 and 104. The deviations table had called the file inert. |
| Local reviews honor `path_filters` and `path_instructions`. | One probe on a scratch clone: two identical files with three planted bugs, one under an excluded path. Three findings on the included file, none on the excluded one. Two findings quoted the `**/*.mjs` path instruction. |
| The repository's UI settings cannot override the file. | Configuration inheritance docs: repository YAML outranks central configuration and the UI settings. Only organization and workspace global overrides rank above it. |
| Upstream's values maximize volume. | `profile: assertive` ("may feel nitpicky" in the reference) and `auto_pause_after_reviewed_commits: 0` (the docs advise 1 or 2 on active branches). |
| The three CodeQL alerts on PR 104 were in test fixtures. | Alerts 28 to 30 carry the classification `test`. `paths-ignore` applies to JavaScript. |
| `gitleaks` catches the token shape push protection refused. | gitleaks 8.30.1 flagged a fixture built at run time in a scratch directory. |
| The default gitleaks rules are too noisy for this tree. | `gitleaks dir .` reports 26 hits with the default rules, 21 of them `generic-api-key` on public search keys in the provider suites. Without that rule it reports 5. |
| The local review misses real defects. | It reported nothing on the first commit of this change. An independent reviewer then found that a partial review with findings could be skipped instead of declined. |
| CI costs about 11 minutes per push. | Tests run on `eb01afdc`: 11 minutes. Web CI: 5. CodeQL: 3. |

## Changes

1. The push hook gates at `major`. Findings below it are printed and counted (`belowGate`) and do not block.
2. `.claude/rules/dev-workflow.md` caps a branch at two local passes and says which findings to fix.
3. `.coderabbit.yaml`: `profile: chill`, pause after two reviewed commits, and `docs/superpowers/**` left out of review. Each line is marked `Fork:`. `learnings.approval_delay` stays at upstream's 7: on a public repository anyone can ask for a learning in a comment, and the delay is the maintainer's chance to reject it.
4. The deviations table has a row for `.coderabbit.yaml` and no longer calls it inert.
5. `.githooks/pre-commit.mjs` scans the staged diff with `gitleaks`, using the default rules (`.githooks/gitleaks.toml`), with `generic-api-key` off under `tests/`, `web/tests/`, `providers/`, `docs/` and for `test-all.mjs`. A merge being concluded is not scanned and says so, because it stages the other side's changes.
6. `codeql.yml` reads `.github/codeql/codeql-config.yml`, which leaves `tests/**` and `web/tests/**` out of the JavaScript scan.

## Tradeoffs

- A real minor defect can now pass the hook. It is still printed, and the PR review still reports it.
- The JavaScript suites under `tests/` and `web/tests/` are no longer scanned by CodeQL. Go test files, `test-all.mjs` and `publish/tests` still are.
- `.coderabbit.yaml` now differs from upstream in three settings, so an upstream edit near them needs a hand merge.
- A machine without `gitleaks` commits unscanned. GitHub push protection is still behind it.
- Under the suites, the providers and the docs the secret scan flags only the vendor token shapes, not a generic key-shaped value. Disabling that rule everywhere was tried first and stopped catching 8 of 14 generated secret shapes.
- A secret added while a merge is being concluded is not scanned.

## Not measured

- Whether `profile` changes the volume of a local review. The docs do not say.
- Whether `--deep` (the PR review policy, run locally) costs more quota or time. It is not in the hook.
- Whether learnings apply to local reviews on the open-source plan.
- Whether a path instruction that says what not to report is honored. The docs show none.
- What a real partial or failed review puts in the closing event's `gate`. The hook treats findings without a passed gate as blocking.

## Left as found

- `tests/fork-deviations-covered.test.mjs` passes without checking anything in a shallow clone: the merge base with upstream is missing, so it compares zero paths. The paths of this change were checked against the table by hand.
- `.coderabbit.yaml` carries settings the current schema does not list (`tools.github-checks.timeout_ms`, three `docstrings` blocks). They are upstream's.
- `quiet` is a third profile that posts only the most important comments inline. `chill` was chosen as the documented default.

## Sources

- https://docs.coderabbit.ai/cli/agent-mode.md
- https://docs.coderabbit.ai/cli/reference.md
- https://docs.coderabbit.ai/cli/claude-code-integration.md
- https://docs.coderabbit.ai/reference/configuration
- https://docs.coderabbit.ai/configuration/auto-review.md
- https://docs.coderabbit.ai/configuration/configuration-inheritance.md
- https://docs.coderabbit.ai/pr-reviews/status-check.md
- https://docs.coderabbit.ai/management/rate-limits.md
- https://docs.coderabbit.ai/knowledge-base/learnings
- https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/customizing-your-advanced-setup-for-code-scanning
