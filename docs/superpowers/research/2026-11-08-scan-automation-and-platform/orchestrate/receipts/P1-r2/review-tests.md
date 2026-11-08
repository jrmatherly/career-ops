# P1 round 2: test-coverage review

Reviewed at f817b14e (`git diff 54a116cd a6ae1d38` plus the trunk merge, which touches neither `doctor.mjs` nor `tests/doctor-billing-source.test.mjs`). Method: three mutants applied to `doctor.mjs` in a throwaway worktree, each run against `node test-all.mjs --only doctor-billing-source`, file restored after each. Baseline: 22 passed.

| Mutant | Result |
|---|---|
| M1: `authToken` without `.trim()` (`doctor.mjs:180`) | Killed. `a whitespace-only auth token beside a gateway counts as no credential` (`tests/doctor-billing-source.test.mjs:94`) fails; test-all exits 1. |
| M2: `key` without `.trim()` (`doctor.mjs:179`) | Survives. 22 passed, 0 failed. |
| M3: OAuth-pair label reverted to the old `, a pair deploy/README.md rules out.` wording (`doctor.mjs:219`) | Survives. 22 passed, 0 failed. |

## Gaps

1. **`ANTHROPIC_API_KEY` trim is untested** (`doctor.mjs:179`). Confidence 95 (observed: mutant survives). Both trims shipped as one item but only the token has a case. A whitespace-only key has two observable effects the suite never exercises: beside a gateway it should hit `GATEWAY_NO_CREDENTIAL` (`doctor.mjs:224`), and with no gateway it should fall to the "no API key" pass line (`doctor.mjs:234`) instead of warning `ANTHROPIC_API_KEY is set`. Killing test, one row in `BASE_URL_CASES` after line 94:
   `['a whitespace-only API key beside a gateway counts as no credential', { ANTHROPIC_BASE_URL: GATEWAY, ANTHROPIC_API_KEY: '  ' }, GATEWAY_NO_CREDENTIAL, GATEWAY_PASS]`
   Optionally a second, for the non-gateway branch: `{ ANTHROPIC_API_KEY: '  ' }` must match `/a Claude subscription will be used/` and not `/ANTHROPIC_API_KEY is set/`. Criticality 6: a stray `export ANTHROPIC_API_KEY=" "` in a profile would otherwise be reported as per-token billing, the false warning this check exists to avoid.

2. **The reworded OAuth-pair label has no assertion past its old prefix** (`doctor.mjs:219`). Confidence 95 (observed: mutant survives). `GATEWAY_WITH_OAUTH` (`tests/doctor-billing-source.test.mjs:81`) anchors on `...and CLAUDE_CODE_OAUTH_TOKEN is also set`, which both the old and new wording share, so the round-2 change is invisible to the suite. Killing change: extend the regex to the new tail, `/^⚠ Billing source\. Requests route through a gateway at proxy\.example:8317, and CLAUDE_CODE_OAUTH_TOKEN is also set; authenticate to the gateway with ANTHROPIC_AUTH_TOKEN alone\./m`, or add `/deploy\/README\.md rules out/` as the `never` pattern of the row at line 96. Criticality 3: wording only, no behavior; worth it only because the round's stated deliverable is the wording.

## Not a round-2 regression, but affects the brief's oracle

3. **`node --test tests/doctor-billing-source.test.mjs` cannot fail.** Confidence 90 (observed: with M1 applied, `node --test` prints the `❌` line yet reports `pass 1, fail 0`; a direct `node tests/doctor-billing-source.test.mjs` exits 0). `fail()` in `tests/helpers.mjs:256` only increments a counter; the `exit` hook at `helpers.mjs:179-188` sets `exitCode` for data-root drift alone. Only `test-all.mjs` (which reads the counters through `finish()`) turns a `❌` into exit 1. The project's documented runner is `test-all.mjs`, so CI is fine; the brief's suggested command is not a valid kill check for any suite in this repo. No code change proposed here, just: judge mutants by `test-all.mjs --only <suite>` or by grepping for `❌`.

## Positive

- The token-trim case (`tests/...:94`) is the right shape: it asserts both the expected warn and the absence of the pass line, so a half-fix cannot slip through.
- The whitespace-only base URL case (`tests/...:106`) already pinned the trim pattern for `ANTHROPIC_BASE_URL`; the new row mirrors it.

Skipped: no mutants against the merge commit's other files (none touch this check), and no run of the full `test-all.mjs`. Risk: none to the tree; every mutant was reverted and `git status` is clean.
