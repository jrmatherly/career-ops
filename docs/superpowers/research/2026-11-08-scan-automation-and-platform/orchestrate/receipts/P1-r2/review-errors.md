# P1 r2 silent-failure review: checkBillingSource (doctor.mjs)

Reviewed `git diff 54a116cd f817b14e`, HEAD f817b14e. Read-only; each case below was run against `node doctor.mjs` with `CAREER_OPS_ROOT` pointed at an empty scratch directory, so no user `.env` was read.

## Findings

### 1. Whitespace-only `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` with no gateway now passes as "no API key" (confidence 55)

`doctor.mjs:180-181`, `doctor.mjs:234-237`.

Before this diff `key = "  "` was truthy and the check warned `ANTHROPIC_API_KEY is set`. After `.trim()`, both `key` and `authToken` are `''`, `which` is `null`, and the output is `✓ Billing source: no API key in the environment (a Claude subscription will be used if you are logged in)`. Verified by running `ANTHROPIC_API_KEY='  ' node doctor.mjs` and the same with `ANTHROPIC_AUTH_TOKEN`.

Whether that is a false pass depends on what the `claude` CLI does with a whitespace-only value, which I could not verify here. If the CLI tests presence (a truthy string) rather than trimmed content, a `  ` key is still "set": it takes precedence over the subscription and the request fails with an auth error, while doctor reports that the subscription will be used. The gateway branch treats the same value as "no credential" and warns (`tests/doctor-billing-source.test.mjs:94-95` pins that); the no-gateway branch treats it as "nothing set" and passes, and no test pins that. The asymmetry is the signal: one trimmed value, two opposite verdicts, and only the warning side is tested.

Smallest fix if the CLI does treat it as set: in the no-gateway branch, warn when the raw value is non-empty but the trimmed value is empty (`ANTHROPIC_API_KEY is set to whitespace; the CLI will send it and the request will fail; unset it`). If the CLI trims, no change is needed; either way, add the no-gateway whitespace case to the test so the chosen behaviour is pinned.

### 2. Gateway plus both `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` passes without comment (confidence 40)

`doctor.mjs:224-230`.

With `ANTHROPIC_BASE_URL=http://proxy.example:8317 ANTHROPIC_API_KEY=k ANTHROPIC_AUTH_TOKEN=t` doctor prints the gateway pass line. `deploy/README.md:46-47` describes the proxy pair as the URL plus `ANTHROPIC_AUTH_TOKEN` *or* `ANTHROPIC_API_KEY`, not both. The `!key && !authToken` check means a real `sk-ant-` key left exported from an earlier setup is forwarded to a third-party gateway alongside the gateway token, and doctor says nothing. Not a regression of this diff (the pre-diff code had the same shape) and the billing verdict is still right (the gateway decides), so informational. If worth closing: warn when both are set beside a gateway host, with the fix "keep ANTHROPIC_AUTH_TOKEN, unset ANTHROPIC_API_KEY".

## Checked and clean

- `undefined` env: `String(undefined ?? '')` is `''`; falls through to the correct "no credential" / "no API key" paths. Not a silenced misconfiguration.
- Non-string env values: `process.env` only ever holds strings in Node, so `String(...)` is defensive and masks nothing.
- Gateway with `CLAUDE_CODE_OAUTH_TOKEN` and no key/token (`doctor.mjs:216-222`): the pair warning fires before the no-credential check, so the no-credential message is suppressed, but the fix line ("authenticate to the gateway with ANTHROPIC_AUTH_TOKEN") already tells the user to set the missing credential. Not a silent failure.
- Credential values in output: every label and fix string embeds only variable names and `url.host`. `URL.parse("http://user:s3cret@proxy.example:8317").host` is `proxy.example:8317` (userinfo stripped), verified by running it. `--json` carries the same label strings in `warnings` (`doctor.mjs:1989`). No path puts a key or token value into human or JSON output.
- The reworded OAuth-pair label still names the gateway host and the offending variable, and the fix is unchanged; the test regex `GATEWAY_WITH_OAUTH` matches the new prefix.

## Not checked

- How the `claude` CLI itself handles a whitespace-only `ANTHROPIC_API_KEY` (would settle finding 1 either way).
- Files in the diff other than `doctor.mjs` and `tests/doctor-billing-source.test.mjs` (docs, web share route, compose) were outside this review's scope.
