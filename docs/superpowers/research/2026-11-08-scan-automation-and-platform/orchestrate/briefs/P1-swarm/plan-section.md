## Make doctor gateway-aware (PR-P1)

**Depends on.** None.

**Files.**

- [ ] Edit `doctor.mjs` (`checkBillingSource`), `tests/doctor-billing-source.test.mjs`, `docs/RUNNING_ON_A_BUDGET.md` section 2b, `deploy/README.md` (the env table), `.claude/skills/upstream-review/SKILL.md` (extend the existing `doctor.mjs` and `docs/RUNNING_ON_A_BUDGET.md` rows; `deploy/` is fork-local and needs none).

**Build.**

- [ ] In `checkBillingSource`, when `ANTHROPIC_BASE_URL` parses and its host is not `api.anthropic.com`, return a pass labelled "Billing source. Requests route through a gateway at <host>, and the gateway's credential decides billing" with no fix lines, before the key and token branch; when it does not parse, return a warn naming it unparseable.
- [ ] `deploy/README.md` documents `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` as the proxy pair, exclusive with `CLAUDE_CODE_OAUTH_TOKEN`.

**You see.**

- [ ] `ANTHROPIC_BASE_URL=http://proxy.example:8317 ANTHROPIC_AUTH_TOKEN=x node doctor.mjs` prints the gateway line and no "bills per token" warning.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/doctor-billing-source.test.mjs` gains "a gateway base URL with a token reports the gateway, not per-token billing", "api.anthropic.com as base URL keeps the key warning" and "an unparseable base URL warns and does not throw". Run `node test-all.mjs --quick --only doctor-billing-source` and read the summary.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. `ANTHROPIC_API_KEY=x node doctor.mjs` at trunk and head. Save `p1-key-warning.png`. Pass when both print the per-token warning.
- [ ] Lane 2. Gateway URL plus token. Save `p1-gateway.png`. Pass when the gateway line prints.
- [ ] Lane 3. Gateway URL alone. Save `p1-url-only.png`. Pass when the gateway line prints.
- [ ] Lane 4. `ANTHROPIC_BASE_URL=https://api.anthropic.com` plus a key. Save `p1-anthropic-host.png`. Pass when the key warning prints.
- [ ] Lane 5. `CLAUDE_CODE_USE_BEDROCK=1` plus a gateway URL. Save `p1-cloud-first.png`. Pass when the cloud warning wins.
- [ ] Lane 6. `node doctor.mjs --json` with the gateway pair. Save `p1-json.png`. Pass when the JSON is unchanged in shape.
- [ ] Lane 7. The web doctor route with the gateway pair in the dashboard's env. Save `p1-web-doctor.png`. Pass when the route answers as before.
- [ ] Lane 8. A malformed `ANTHROPIC_BASE_URL`. Save `p1-malformed.png`. Pass when doctor prints a warn naming the value as unparseable and never throws.
- [ ] Lane 9. `deploy/README.md` rendered. Save `p1-readme.png`. Pass when the table row reads as written.
- [ ] Lane 10. `node test-all.mjs --quick`. Save `p1-suite.png`. Pass when green.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `node doctor.mjs --json` wall time, trunk and head.
- [ ] Probe. `time` over five runs each, interleaved.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Head within 5 percent of trunk.

**Review gate.** None. PR-P1 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The operator merges.

