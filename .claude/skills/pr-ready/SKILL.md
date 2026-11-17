---
name: pr-ready
description: Run every check a career-ops pull request needs (pre-commit guard and syntax check, full quick suite, dashboard Go tests when relevant, SYSTEM_PATHS coverage, branch-wide user-layer file check, CodeRabbit review of the tip commit) and fill in the PR template checklist with the evidence. Use before opening or updating a PR from this checkout.
disable-model-invocation: true
argument-hint: "[base branch, default main]"
---

# PR readiness check

Run the checks below from the repo root in this order and stop at the first failure, quoting its output. The base branch is `$ARGUMENTS` when given, otherwise `main`.

1. `git diff --name-only <base>...HEAD` and `git status --short` to learn what changed.
2. `npm run lint`, then the user-layer guard over the whole branch, not the index (nothing is staged when a branch is ready): `git diff --name-only --diff-filter=A --no-renames -z <base>...HEAD | git check-ignore --stdin -z --no-index`. Exit 1 with no output is the pass; any printed path is a committed user-layer file, name it and stop.
3. `node validate-system-paths-coverage.mjs` (a new tracked file must be claimed by SYSTEM_PATHS, USER_PATHS or `config/local-paths.txt`).
4. `node test-all.mjs --quick`. It takes several minutes; run it in the foreground and wait.
5. Only if the diff touches `dashboard/` or `templates/states.yml`: `cd dashboard && go test ./...`.
6. If the diff touches an evaluation mode, `modes/_shared.md` or `batch/batch-prompt.md`: `node test-all.mjs --only evaluation-mode-parity`. For any changed `modes/x.md`, list the localized counterparts (Language Modes table in `AGENTS.md`) the diff did not touch.
7. Only when steps 1 to 6 passed and the work is committed: `node .githooks/coderabbit-review.mjs`, as its own command and never chained with a push. It records a review of the tip commit, and `.githooks/pre-push` refuses the push without one; a fix committed after the review needs a new one. Exit 2 means blocking findings (major or critical, or any from a review that did not finish): check each against the code, fix and commit the confirmed ones and run it again, and for the rest run it with `--decline "<reason>"`. Findings below major are printed and do not block; list the ones left open in the PR body. Fix findings for two passes at most; a later commit still gets its own review for its marker (`.claude/rules/dev-workflow.md`). When the quota is spent (`coderabbit review --usage`) or CodeRabbit is down, `--skip "<reason>"` records that instead; it is refused on a commit whose review has findings.

Then print the PR template checklist from `.github/PULL_REQUEST_TEMPLATE.md` with each box ticked only when the step above proved it, and one line of evidence per box (command and result). The test box's evidence line says `node test-all.mjs --quick`; tick the box only when step 4 ran clean. Note whether the change is a bug fix, provider, docs or translation (PR welcome directly) or a feature, mode or architecture change (upstream asks for an issue first). Never open the PR yourself.
