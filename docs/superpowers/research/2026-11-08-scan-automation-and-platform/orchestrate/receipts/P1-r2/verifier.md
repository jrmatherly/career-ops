# P1 round 2: verifier receipt

Head verified: f817b14edf656462cba6dd269bdae36cd07a1865 (PR 37, `claude/p1-doctor-gateway`). Fix commit a6ae1d38, merge of trunk 66bb4d54. Round-1 head 54a116cd.

**Verdict: PASS.** Both items close. Round 1 shows no regression, and the trunk merge kept both sides.

## Item 1: the OAuth-pair label states its own why

- doctor.mjs:219 now reads "...and CLAUDE_CODE_OAUTH_TOKEN is also set; authenticate to the gateway with ANTHROPIC_AUTH_TOKEN alone." The fix line at :220 is unchanged.
- `grep -rn "rules out" doctor.mjs tests/ deploy/README.md docs/RUNNING_ON_A_BUDGET.md` finds no README citation (its only hit is an unrelated test in location-filter-country-slot).
- The test regex `GATEWAY_WITH_OAUTH` (tests/doctor-billing-source.test.mjs:83) matches only the prefix up to "is also set", so it needed no change. Note: no test pins the new "why" clause. Confidence it matters: 15.

## Item 2: key and authToken are trimmed

- doctor.mjs:180-181 use `String(process.env.X ?? '').trim()`, the same form as the OAuth check at :216.
- New case at tests/doctor-billing-source.test.mjs:94-95: a gateway plus `ANTHROPIC_AUTH_TOKEN: '  '` must match GATEWAY_NO_CREDENTIAL and must not match GATEWAY_PASS. On 54a116cd the untrimmed `'  '` was truthy and took the pass branch, so the case would have failed there (reasoned from the old code, not mutation-run).
- Side effect, by design and not an issue: with no gateway, a whitespace-only ANTHROPIC_API_KEY or AUTH_TOKEN now reports "no API key in the environment" (:234-236) where it used to warn. I did not verify whether Claude Code itself treats a whitespace-only key as set. Confidence it matters: 10.

## What I ran

- `git fetch origin claude/p1-doctor-gateway`, `git checkout FETCH_HEAD`, then `git rev-parse HEAD` printed f817b14e....
- `npm install`, then `node --test tests/doctor-*.test.mjs`: 53 pass, 0 fail.
- `node scripts/check-syntax.mjs`: 2193 files pass. `node test-all.mjs --quick --only fork-deviations-covered`: 1 passed.
- Probes ran in a clean env (`env -i`, HOME and `--target` both in scratchpad/verifier, the real node binary on PATH; the operator's data root and .env were not read), script at scratchpad/verifier/probe.sh:
  - `ANTHROPIC_BASE_URL=https://gw.example ANTHROPIC_AUTH_TOKEN='   '`: human and `--json` both print "⚠ Billing source. Requests route through a gateway at gw.example, but no credential is set...", and `--json` carries it in `warnings`.
  - The same URL with `ANTHROPIC_AUTH_TOKEN=SECRETTOKEN123 CLAUDE_CODE_OAUTH_TOKEN=OAUTHSECRET456`: both modes print the new OAuth-pair label and fix line.
  - `grep -c` for both secret values across all four outputs: 0 each.
  - The human exit code 1 comes from the empty target's missing onboarding files, which is expected. `--json` exits 0.

## Trunk merge

- `git log --merges -1`: f817b14e has parents a6ae1d38 and 66bb4d54.
- `git diff --stat 66bb4d54 f817b14e`: 6 files, all P1's (SKILL.md, deploy/README.md, docs/RUNNING_ON_A_BUDGET.md, owners/P1.tsv, doctor.mjs, tests/doctor-billing-source.test.mjs).
- `git diff --stat 54a116cd f817b14e` shows doctor.mjs +3/-3 and the test +2, which is exactly the fix commit. Everything else in that stat is trunk's.
- `git merge-tree --write-tree a6ae1d38 66bb4d54`: the only conflict is deploy/README.md, and SKILL.md auto-merged. `git show --cc` on deploy/README.md: the resolution keeps P1's three rows (the edited CLAUDE_CODE_OAUTH_TOKEN row, ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN) and trunk's five (CAREER_OPS_SCHEDULER, CAREER_OPS_SCHEDULER_DESCRIPTION, PUBLISH_URL, PUBLISH_API_KEY, root filesystem). The SKILL.md doctor.mjs and Slice C rows carry the P1 text over trunk's current rows.

## Deviations from brief

- The worktree isolation refused writes to the coordinator worktree, so this receipt is in the scratchpad (scratchpad/verifier/P1-r2-verifier.md) and needs copying to receipts/P1-r2/verifier.md.
- `env -i` with HOME changed broke the mise node shim ("mise ERROR error parsing config file"). I used the absolute node binary instead.
- doctor created `data/`, `output/` and `reports/` in the temp target. That is a scratch dir, not a checkout.
- I did not edit or push anything and did not comment on the PR.
