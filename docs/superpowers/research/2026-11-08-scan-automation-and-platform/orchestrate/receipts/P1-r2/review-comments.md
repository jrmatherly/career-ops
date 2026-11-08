# P1 round 2: comment and wording review

Reviewed at `f817b14e` (origin/claude/p1-doctor-gateway), diff `54a116cd..a6ae1d38`: `doctor.mjs` 177-230 and `tests/doctor-billing-source.test.mjs`. Read-only. `node tests/doctor-billing-source.test.mjs` passes at HEAD, including the new whitespace-token case; the `GATEWAY_WITH_OAUTH` regex still matches the reworded label.

## Findings

1. **doctor.mjs:219 — the warn label gives the instruction, not the reason.** Round 1 dropped "a pair deploy/README.md rules out"; the replacement "; authenticate to the gateway with ANTHROPIC_AUTH_TOKEN alone" is the same sentence as `fix[0]` on line 220, so the label and its fix now say one thing twice and neither says what goes wrong when both are set. The reason the check exists is billing attribution: with both credentials present the user cannot tell from the environment which one Claude Code sends, so they cannot tell whether the gateway's upstream account or their subscription is billed. Suggested shape: `...and CLAUDE_CODE_OAUTH_TOKEN is also set, so it is unclear which credential bills this session; the gateway needs only ANTHROPIC_AUTH_TOKEN.` and keep `fix[0]` as the action. If the precedence claim in finding 2 is confirmed, say it outright instead ("Claude Code sends the gateway token and ignores the OAuth token"). Confidence 75.

2. **deploy/README.md:46 agrees with the label, but carries an unverified precedence claim.** The row says doctor "warns when the URL is set ... alongside `CLAUDE_CODE_OAUTH_TOKEN`, which the gateway token outranks." The warn and its trigger match `doctor.mjs:217-221`, so README and label agree. "Outranks" is a statement about Claude Code's credential precedence that nothing in the diff, the tests or the repo docs establishes, and the local Claude docs mirror (`~/.claude/plugins/data/claude-docs-claude-code-docs`) is empty, so I could not check it. What would settle it: the Claude Code authentication/env-var docs, or `/status` in a shell with both variables set. If it is wrong, the README row and the "alone" wording of the label both lean on it. Confidence 50.

3. **docs/RUNNING_ON_A_BUDGET.md:64 — the gateway paragraph lists only one of the two gateway warns.** It says doctor "warns instead when neither `ANTHROPIC_AUTH_TOKEN` nor `ANTHROPIC_API_KEY` is set" and does not mention the OAuth-pair warn added in this PR. Outside the asked scope (deploy/README.md) but it is the doc the API-key fix list points users at (`doctor.mjs:239`), so a reader following that pointer after the pair warn finds no explanation. One clause would close it. Confidence 55.

4. **tests/doctor-billing-source.test.mjs:1-6 — header comment is narrower than the file.** It frames the file around the cloud-switch false-warning case; since round 1 the file is mostly gateway/base-URL cases (lines 82-118). Still true, just no longer describes the file. Low value to fix now. Confidence 40.

## Checked and fine

- `doctor.mjs:175-178` (Spanish header): "Aviso, nunca fallo" still holds; every branch returns `warn` or `pass`, none `fail`.
- `doctor.mjs:183-190` (truthy-switch comment): unchanged and still matches the regex on line 192.
- The `.trim()` change on 181-182 needs no comment; the new test case states the behaviour. One edge I did not verify: whether Claude Code itself treats a whitespace-only `ANTHROPIC_API_KEY` as unset the way doctor now does (the pass label on 230 would then promise a subscription that may not be used). Confidence 30, likely harmless.

Not checked: Claude Code's actual credential precedence (finding 2); nothing under `~/career-ops-data` or any `.env` was read.
