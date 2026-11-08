F1 VERIFICATION LANE, shared preamble

You verify PR-F1 of jrmatherly/career-ops, https://github.com/jrmatherly/career-ops/pull/35, branch claude/f1-file-filters, at the exact head 38e86d5c4bc2c4c6a2d349cd34bdb3589ffaff5b (trunk base 53c846a0). You did not write this code and you distrust the PR body. Your product is evidence, not a fix.

Your worktree: run `git fetch origin claude/f1-file-filters && git checkout 38e86d5c4bc2c4c6a2d349cd34bdb3589ffaff5b` first and confirm `git rev-parse HEAD` prints that SHA. A lane that needs trunk too uses `git worktree add /tmp/swarm-f1/trunk 53c846a0` from your worktree.
Spec: the plan section at <store>/briefs/F1-swarm/plan-section.md (a copy of docs/superpowers/plans/2026-11-08-scan-automation-and-platform.md lines 150-207); the Global constraints and Review focus item 5 in that plan; .claude/rules/dev-workflow.md.

Boot recipe for a live lane (skip for gates, perf and audit lanes):
- Scratch data root only: `export CAREER_OPS_ROOT=/tmp/swarm-f1/worker-<n>/root`, seeded from examples/ and templates/ (cv.md from examples/cv-example.md, config/profile.yml from templates/career-profile.example.yml or config/profile.example.yml, modes/_profile.md from modes/_profile.template.md, data/applications.md from the AGENTS.md Step 4 header). Never read or touch the operator's data root, ~/career-ops-data, /data or any .env outside your scratch root.
- portals.yml in the scratch root is a small fixture you write: `title_filter: {positive: [engineer], negative: [intern]}`, `location_filter: {}`, and ONE enabled board, for example `companies: [{name: Example, careers_url: https://job-boards.greenhouse.io/<a public board>, enabled: true}]`. Use `--limit 1` where the job form allows it so a scan finishes in seconds. If a scan needs network and the board is down, say so; do not substitute the operator's portals.yml.
- Dashboard: `cd web && npm run dev -- -p <your port>` with port 3100 + your lane number, and wait for the ready line. If the extra arg is not honoured, try `PORT=<port>`, and report which worked. Read-only diagnostics: `curl -s -H 'Host: localhost' http://127.0.0.1:<port>/api/healthz`, the scratch root's files, `data/tmp/` under the scratch root, and the runner's stderr. Drive the UI through the chrome-devtools-mcp:chrome-devtools skill (or the built-in browser tools if that MCP is not reachable; say which). Close every page you opened before you return.
- Save every screenshot to /tmp/swarm-f1/worker-<n>/<slug>.png and return the paths. Stop the dev server before you return.
- Each lane has a fixed outcome rule in the plan. Judge against it exactly. A pass on a different rule is not a pass.

Forbidden: editing any file in the PR's worktree besides your scratch root and /tmp/swarm-f1; pushing; commenting on the PR; --dangerously-skip-permissions or any auto-approve flag; doctor --init-templates in the checkout; reading the operator's data; any key.

Timebox: 45 minutes. On expiry return BLOCKED with what you saw.

REPORT (one message, plain text): lane id; HEAD SHA you verified (must be 38e86d5c…); verdict PASS, ISSUES or BLOCKED; the exact commands you ran with their outcomes; screenshot paths; for ISSUES every defect you can prove with file:line or a log line; for BLOCKED what blocked you. No prose beyond that.
