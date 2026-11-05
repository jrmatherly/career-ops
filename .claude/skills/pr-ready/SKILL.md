---
name: pr-ready
description: Run every check a career-ops pull request needs (lint, full quick suite, dashboard Go tests when relevant, SYSTEM_PATHS coverage, staged-file personal-data check) and fill in the PR template checklist with the evidence. Use before opening or updating a PR from this checkout.
disable-model-invocation: true
argument-hint: "[base branch, default main]"
---

# PR readiness check

Run the checks below from the repo root in this order and stop at the first failure, quoting its output. The base branch is `$ARGUMENTS` when given, otherwise `main`.

1. `git diff --name-only <base>...HEAD` and `git status --short` to learn what changed.
2. `npm run lint`.
3. `node validate-system-paths-coverage.mjs` (a new tracked file must be claimed by SYSTEM_PATHS, USER_PATHS or `config/local-paths.txt`).
4. `git diff --cached --name-only -z | git check-ignore --stdin -z --no-index`: any output is a force-staged user-layer file; name it and stop.
5. `node test-all.mjs --quick`. It takes several minutes; run it in the foreground and wait.
6. Only if the diff touches `dashboard/` or `templates/states.yml`: `cd dashboard && go test ./...`.
7. If the diff touches `modes/*.md`: `node test-all.mjs --quick --only evaluation-mode-parity` and list the `modes/{lang}/` siblings that were not updated.

Then print the PR template checklist from `.github/PULL_REQUEST_TEMPLATE.md` with each box ticked only when the step above proved it, and one line of evidence per box (command and result). Note whether the change is a bug fix, provider, docs or translation (PR welcome directly) or a feature, mode or architecture change (upstream asks for an issue first). Never open the PR yourself.
