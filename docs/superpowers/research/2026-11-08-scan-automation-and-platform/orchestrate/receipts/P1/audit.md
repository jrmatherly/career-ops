lane audit (fable), head 189da72e, PASS with two notes
Branch order cloud, gateway, key confirmed; URL.canParse guards the parse; host compare keeps api.anthropic.com on the key path; only ${host} is interpolated (URL.host strips userinfo); tests use repo helpers, 14 passed; docs match the code's variable names, host and example URL; deviations rows extend the existing doctor.mjs and RUNNING_ON_A_BUDGET rows (deploy/ is in local-paths so no row); every plan box has a hunk; PR body states the suites.
Note A: `.host` keeps a non-default port, so https://api.anthropic.com:8443 would take the gateway branch; `.hostname` would be stricter (the plan says "host").
Note B: no unit case for gateway URL alone (plan's unit box lists three cases); proven by hand (receipt url-only.txt). Suggest one row in BASE_URL_CASES.
Receipts /tmp/swarm-p1/worker-audit/.
