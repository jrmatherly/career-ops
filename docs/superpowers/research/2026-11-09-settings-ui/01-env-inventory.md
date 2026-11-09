# Environment variable inventory (product code)

Date: 2026-11-09. Source: `git grep` over tracked files, excluding `tests/`, `web/tests/`, `publish/tests/`, `*.test.*`, `.github/`, `.claude/`, `docs/superpowers/research/`, `scaffolder/`. `test-all.mjs`, `updater-migration-tests.mjs`, `upgrade-tests.mjs` and `docs/recipes/gojobs/*manual-test*` are test harnesses and were treated as tests. Every row below comes from a line read in this session. "inferred" marks a claim not read directly. No `.env` file was opened; only `.env.example` and `publish/.env.example`.

## Legend for column 5 (also readable from `.env`?)

- `DR`: yes, data-root `.env`, but only inside the scan process. `scan.mjs:108` runs `dotenv.config({ path: DATA_ROOT/.env })`. Reads made per call, or in `scan.mjs` body after line 108, see it. Reads made at import time by modules that `scan.mjs` imports (ES imports hoist above line 108) do not (inferred from ESM hoisting).
- `PL`: yes, data-root `.env`, for plugin keys: `loadDotenvOnce(DATA_ROOT)` at `plugins.mjs:195`, `plugins.mjs:258`, `plugins/_engine.mjs:757`, `plugins/_engine.mjs:839`.
- `CWD`: yes, but the **current directory's** `.env`, not the data root's: `dotenv.config()` with no path at `gemini-eval.mjs:70`, `ollama-eval.mjs:53`, `openai-eval.mjs:60`, `openai-tailor.mjs:36`, `batch-evaluate-gemini.mjs:37`.
- `CODE`: yes, the code root's `.env` (`__dirname/.env`) via `loadEnvFile()` at `openrouter-runner.mjs:70-79`, only when invoked directly (`openrouter-runner.mjs:1309`); never overrides an existing env var.
- `BL`: yes, data-root `.env` read as data (not loaded into `process.env`), shell value wins: `lib/browser-launch.mjs:95-99`, `:112-135`.
- `CLI`: yes, data-root `.env` read as data for `CAREER_OPS_CLI` only: `lib/agent-cli.mjs:19`, `web/src/lib/remembered-cli.mjs:21-39`; `doctor.mjs:1135` also loads it.
- `PUB`: yes, data-root `.env` for `PUBLISH_URL` and `PUBLISH_API_KEY` only: `publish/share.mjs:43-48`; `web/src/lib/publish-account-url.mjs:16` reads `PUBLISH_URL` only.
- `no`: nothing loads a `.env` before the read.

The Next.js dashboard process itself loads no data-root `.env` (no `dotenv` in `web/src`, `web/server.mjs`). Next may load `web/.env*` on its own (inferred, framework behaviour, not verified). Child scripts the dashboard spawns get `process.env` (e.g. `web/src/app/api/run/route.ts:335`), so a value reaches them only if the web server's own environment has it, or the child loads `.env` itself (`scan.mjs` does, most others do not).

Column 3 abbreviations: "pos int" = positive integer. "bad value" says what the code does with an unusable value.

## 1. Scanner and providers

| Name | Read at | Default / accepted / bad value | Controls | `.env`? | Documented | Class | Reason |
|---|---|---|---|---|---|---|---|
| CAREER_OPS_HTTP_TIMEOUT_MS | providers/_http.mjs:157 (default resolver :55-60) | 10000 ms; finite number 1..2147483647; bad value silently falls back to 10000 | Per-request timeout for provider HTTP calls (providers with their own timeout ignore it) | DR (read per call) | .env.example:60 | user-tunable | |
| CAREER_OPS_SCAN_CONCURRENCY | scan.mjs:184 (resolver :178-182) | 10; pos safe integer; bad value falls back to 10 | Companies fetched at once in a scan | DR (scan.mjs body after :108) | .env.example:70 | user-tunable | |
| CAREER_OPS_SCAN_HOST_CONCURRENCY | scan.mjs:185 | 10; same rule | Companies fetched at once per hostname | DR | .env.example:71 | user-tunable | |
| CAREER_OPS_HTTP_CACHE | scan.mjs:5325 | on; only the literal `0` turns it off | Conditional-GET cache of board responses under `data/cache/http` | DR | undocumented | user-tunable | |
| CAREER_OPS_HTTP_CACHE_TTL_MS | scan.mjs:5328 (resolver providers/_http-cache.mjs:15) | 900000 (15 min); finite 0..2147483647, 0 = never fresh; bad value falls back | How long a cached board response counts as fresh | DR | undocumented | user-tunable | |
| CAREER_OPS_DNS_LOOKUPS_PER_MIN | providers/_dns-cache.mjs:360 (applied :391) | 400 (:97); finite number >= 0, 0 disables pacing; bad value prints a stderr warning and uses 400 | Paces DNS lookups during a scan | no: read at import (:391), before `scan.mjs:108` (inferred, ESM hoisting) | docs/SCRIPTS.md | user-tunable | advanced network tuning |
| CAREER_OPS_NO_DNS_CACHE | providers/_dns-cache.mjs:390 | unset; only `1` opts out | Disables the process-wide cached/paced DNS lookup patch | no (import time, same as above) | docs/SCRIPTS.md | user-tunable | advanced |
| CAREER_OPS_TRUST_PROXY_EGRESS | providers/_http.mjs:66 (+1 more) | unset; only `1` honours the proxy variables below | Lets scanner requests go through `HTTP(S)_PROXY` | DR (read per call) | docs/SETUP.md | security-gate | egress trust: off by default so a stray proxy variable cannot reroute scans |
| HTTP_PROXY (+ `http_proxy`) | providers/_http.mjs:68 (+ :86, :201) | unset; used only when the gate above is `1`; proxy URL with credentials over non-https, non-loopback throws | Proxy for http targets | no | docs/SETUP.md | deploy | network environment, set by whoever runs it |
| HTTPS_PROXY (+ `https_proxy`) | providers/_http.mjs:69 | unset; falls back to the HTTP proxy value | Proxy for https targets | no | docs/SETUP.md | deploy | |
| NO_PROXY (+ `no_proxy`) | providers/_http.mjs:70 | unset | Hosts that bypass the proxy | no | docs/SETUP.md | deploy | |
| CAREER_OPS_CONNECTION_SCOPE | providers/_connection-scope.mjs:79 | on; only `0` skips the per-board undici connection pool | Scopes sockets to one board so a stalled board cannot hold others | DR (read per call) | undocumented | security-gate | connection scope: deliberately hard to flip |
| JD_RESCUE_MIN_WORDS | batch/jd-rescue.mjs:208 | 80; `Number()` of the value; a non-number gives NaN, so the "thin" test (`strippedWords < NaN`) is never true (inferred from the comparison) | Word count below which a fetched JD triggers the rescue fetch | no | undocumented | user-tunable | |
| PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH | lib/browser-launch.mjs:60, :68 | unset, so the bundled Chromium is used; a path string | Which browser binary scans, PDF and checks launch | BL | docs/SETUP.md | user-tunable | picks a browser binary; a path, so a Settings file-path field |
| CAREER_OPS_BROWSER_AUTODETECT | lib/browser-launch.mjs:61, :80 | unset; `1`/`true`/`yes`/`on` (any case) enables | Auto-pick an installed Brave/Chrome/Edge/Chromium | BL | undocumented (only a hint at doctor.mjs:581) | user-tunable | |
| PLAYWRIGHT_BROWSERS_PATH | Dockerfile:11, deploy/Dockerfile:6, docker-compose.yml:21 (set; read by Playwright, inferred) | `/ms-playwright` in the images | Where Playwright keeps browsers | n/a | docker-compose.yml, docs/NIXOS.md | deploy | image layout |
| PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD | update-system.mjs:5466 (set for `npm install`), Dockerfile:10 | `1` during update | Stops postinstall downloading Chromium | n/a | undocumented | internal | set by the updater, not read by product code |

## 2. Evaluation and model runners

| Name | Read at | Default / accepted / bad value | Controls | `.env`? | Documented | Class | Reason |
|---|---|---|---|---|---|---|---|
| GEMINI_API_KEY | gemini-eval.mjs:287 (+ batch-evaluate-gemini.mjs:214, scan-hn.mjs:129) | unset; missing prints setup help and exits | Gemini API key | CWD | .env.example:10, DOCKER.md | secret | |
| GEMINI_MODEL | gemini-eval.mjs:239 (+ scan-hn.mjs:156) | `gemini-3.6-flash`; any string | Gemini model for evaluation | CWD | .env.example:15, docs/SCRIPTS.md | user-tunable | |
| OPENAI_API_KEY | openai-eval.mjs:148 (+ openai-tailor.mjs:95) | empty | Key for any OpenAI-compatible endpoint | CWD | .env.example:51, DOCKER.md, docs/RUNNING_ON_A_BUDGET.md | secret | |
| OPENAI_BASE_URL | openai-eval.mjs:147 (+ openai-tailor.mjs:94) | `https://api.openai.com/v1`; trailing `/` stripped | Endpoint the CV and JD are sent to | CWD | .env.example:52, docs/RUNNING_ON_A_BUDGET.md | user-tunable | eval prints the destination host before sending (openai-eval.mjs:363) |
| OPENAI_MODEL | openai-eval.mjs:146 (+ openai-tailor.mjs:93) | eval: empty, then `gpt-4o-mini` or a MiniMax default (:218-221); tailor: `gpt-4o` | Model name | CWD | .env.example:53, docs/SCRIPTS.md | user-tunable | |
| OPENAI_TIMEOUT_MS | openai-eval.mjs:358 (+ openai-tailor.mjs:267) | 300000; `parseInt`; NaN or <= 0 prints an error and exits 1 | Per-call timeout | CWD | docs/RUNNING_ON_A_BUDGET.md | user-tunable | |
| OLLAMA_MODEL | ollama-eval.mjs:122 | `llama3.3` | Local Ollama model | CWD | undocumented | user-tunable | |
| OLLAMA_BASE_URL | ollama-eval.mjs:123 | `http://localhost:11434`; invalid URL exits 1 | Ollama endpoint | CWD | docs/PRIVACY.md | user-tunable | |
| OLLAMA_NUM_CTX | ollama-eval.mjs:127 | 32768; `parseInt`; NaN or <= 0 exits 1 | Context window and prompt budget | CWD | undocumented | user-tunable | |
| OLLAMA_TIMEOUT_MS | ollama-eval.mjs:311 | 300000; NaN or <= 0 exits 1 | Per-call timeout | CWD | undocumented | user-tunable | |
| OLLAMA_ALLOW_REMOTE | ollama-eval.mjs:208 | unset; only `1` allows a non-loopback Ollama host | Lets the CV and JD go to a remote Ollama | CWD | undocumented | security-gate | stops private data reaching a remote server by accident |
| OPENROUTER_API_KEY | openrouter-runner.mjs:402 (+ :278, :314) | unset | OpenRouter key | CODE | .env.example:21, docs/RUNNING_ON_A_BUDGET.md | secret | |
| OPENROUTER_TIMEOUT_MS | openrouter-runner.mjs:101 | 120000 (:88); digits-only, 1..2147483647; otherwise ignored | Per-call model timeout (second choice after the next row) | CODE | undocumented | user-tunable | |
| CAREER_OPS_TIMEOUT_MS | openrouter-runner.mjs:100 | same rule; wins over OPENROUTER_TIMEOUT_MS | Per-call model timeout | CODE | undocumented | user-tunable | |
| CAREER_OPS_MODEL | openrouter-runner.mjs:411 (+6 more, e.g. utils/token-tracker.mjs:55) | unset, so free-model rotation; any model id | Pins one OpenRouter model | CODE | .env.example:45 | user-tunable | |
| CAREER_OPS_NO_PLAYWRIGHT | openrouter-runner.mjs:820 | unset; any non-empty value (including `0`) skips Playwright | Use plain fetch for JD pages in the OpenRouter runner | CODE | undocumented | user-tunable | truthiness check, so `0` also disables |
| CAREER_OPS_CLI | doctor.mjs:1125 (+ lib/agent-cli.mjs:16, web/src/lib/remembered-cli.mjs:21, web/src/lib/cli-pick.mjs) | unset; must be one of 12 ids in lib/agent-cli.mjs:5 (claude, codex, opencode, pi, antigravity, grok, qwen, kimi, copilot, gemini, hermes, omp); doctor reports "unknown" for others | The agent CLI every AI feature runs; written by `node remember-cli.mjs` | CLI | AGENTS.md, deploy/README.md, docs/DEPLOYMENT.md | user-tunable | the dashboard already reads this through `/api/clis` (web/src/app/api/clis/route.ts:12) |
| CAREER_OPS_RANK_CLI | rank-pipeline.mjs:397 (+ web/scripts/scheduled-jobs-runner.mjs:376) | unset; `--cli` flag wins; unknown name runs `<bin> -p`; `hermes` rejected | Agent CLI for batch ranking | no | undocumented | user-tunable | |
| CAREER_OPS_RANK_TIMEOUT_MS | rank-pipeline.mjs:320 | 180000 (:58); pos integer, else default | Per-call timeout for ranking | no | docs/SCRIPTS.md | user-tunable | |
| PRIVACY_GUARD | lib/privacy-guard.mjs:761 | unset, so the guard is on; `off`/`disabled`/`0` count only with the token below | Turns the outbound-LLM PII guard off | CWD (evaluators load it before the guard, e.g. openai-eval.mjs:60-63) | .env.example:28, docs/PRIVACY.md | security-gate | needs a second factor |
| PRIVACY_BYPASS_TOKEN | lib/privacy-guard.mjs:763 | unset; non-empty required with PRIVACY_GUARD=off, else the guard stays on and warns | Second factor for disabling the guard | CWD | .env.example:31, docs/PRIVACY.md | security-gate | also secret-like; never show it |
| PRIVACY_REDACT | lib/llm-outbound.mjs:47 | unset; only `1`/`true` (any case) | Redact instead of block | CWD | .env.example:32, docs/PRIVACY.md | security-gate | changes the guard's mode |
| CAREER_OPS_PRIVACY | lib/privacy-guard.mjs:637 | `<data root>/config/privacy.yml`; relative resolves against the data root | Path of the privacy config | no | .env.example:34, docs/PRIVACY.md | path-override | |
| CAREER_OPS_HEADLESS | learn.mjs:72 | unset; any value except `0` and empty marks a headless run; `batch/batch-runner.sh:110` exports `1` | Marks unattended runs so interactive modes stop | no | modes/_shared.md, modes/retro.md | internal | batch marker |
| OPENCODE_CONFIG_CONTENT | rank-pipeline.mjs:91 (set for the child) | `{"permission":"deny"}` | Denies opencode permissions during ranking | n/a | docs/SCRIPTS.md:1739 | internal | written, not read |

## 3. Web dashboard (Next.js in `web/`, Go TUI in `dashboard/`)

| Name | Read at | Default / accepted / bad value | Controls | `.env`? | Documented | Class | Reason |
|---|---|---|---|---|---|---|---|
| CAREER_OPS_WEB_ALLOWED_HOSTS | web/server.mjs:27 (+ web/src/proxy.ts:28, scripts/ui-server.mjs:119, web/src/lib/bind-host.mjs) | unset, so loopback only; comma/space list of hosts; refuses switch-like words (`on`, `off`, `true`, `1`, `all` ...), wildcard addresses, unscoped link-local IPv6, non-unicast addresses and URLs, and exits with an error (bind-host.mjs:57-105) | Which hosts may reach the dashboard; also decides the bind address | no (dashboard env only) | deploy/README.md, docs/DEPLOYMENT.md, docs/WEB_UI.md | deploy | opening the socket beyond loopback; set once by the host |
| CAREER_OPS_ALLOWED_ORIGINS | web/src/proxy.ts:29 (+ web/src/lib/origin-guard.mjs:26) | unset, so none | Extra origins (e.g. a browser extension) the request guard accepts | no | web/README.md | deploy | |
| CAREER_OPS_CODE_ROOT | web/src/lib/core/code-root.mjs:26 (+ web/src/app/api/run/route.ts:125) | unset, so auto-detected checkout | Points the dashboard at the engine checkout | no | web/README.md | path-override | |
| NEXT_TELEMETRY_DISABLED | web/next.config.mjs:4, web/server.mjs:120 (assigned `1`) | forced to `1` | Disables Next telemetry | n/a | undocumented | internal | forced by the product |
| BUILD_DIST | web/next.config.mjs:19 | unset, so default `.next` | Alternate `next build` output dir | no | undocumented | internal | dev builds |
| PORT | scripts/ui-server.mjs:195 (assigned for the Next child; Next reads it, inferred) | `--port` flag, default 3000 (ui-server.mjs:43) | Listen port | n/a | docs/WEB_UI.md (flag) | deploy | |
| HOSTNAME | scripts/ui-server.mjs:196 (assigned) | bind host from the allowed-hosts plan | Listen address | n/a | undocumented | deploy | |
| NODE_ENV | docker-compose.yml:20, Dockerfile:9, deploy/Dockerfile:31 (set); tracker-utils.mjs:631 (read) | `production` in deploy image, `development` in dev compose | Node mode; `test` enables a lock test marker | n/a | docker-compose.yml | internal | |
| LANG | dashboard/main.go:467 | unset, so `en` | Go TUI language when `--lang` is absent | no | undocumented (one `modes/tr/pdf.md` hit) | internal | OS locale |

## 4. Scheduled jobs and automation

| Name | Read at | Default / accepted / bad value | Controls | `.env`? | Documented | Class | Reason |
|---|---|---|---|---|---|---|---|
| CAREER_OPS_SCHEDULER | web/src/lib/scheduler-status.ts:42 | unset, so `os`; only `external` is recognised, any other value logs one warning and reads the OS schedule | Who owns the schedule: install-script task or an external caller of `POST /api/scheduler` | no | deploy/README.md, docs/AUTOMATION.md, docs/DEPLOYMENT.md, web/README.md | deploy | scheduler ownership |
| CAREER_OPS_SCHEDULER_DESCRIPTION | web/src/lib/scheduler-status.ts:131 | unset; free text, shown only when `external` | Label for the external schedule | no | deploy/README.md, web/README.md | deploy | |
| CAREER_OPS_AUTO_EVALUATE_LOCAL | web/scripts/evaluate-drain.mjs:158 (const :26) | unset; unattended drain runs only in a Kubernetes pod or when this is exactly `1` | Opt-in for unattended auto-evaluate on a local host | no | docs/AUTOMATION.md, web/README.md | security-gate | local auto-evaluate opt-in |
| KUBERNETES_SERVICE_HOST | web/scripts/evaluate-drain.mjs:158 | unset; any non-empty value | Cluster detection for the drain | n/a | docs/AUTOMATION.md, web/README.md | deploy | provided by the cluster |
| CAREER_OPS_WEB_URL | web/scripts/evaluate-drain.mjs:149 | `http://127.0.0.1:3000` | Dashboard URL the unattended drain posts to | no | docs/AUTOMATION.md, web/README.md | deploy | |
| CAREER_OPS_SCHEDULED_JOBS_PATH | web/src/lib/scheduled-runner-path.mjs:6 (+ web/scripts/install-scan-schedule.sh:55 bakes it into the OS task) | `<data root>/data/scheduled-jobs.json`; relative resolves against the data root | Scheduled-jobs store | no | docs/AUTOMATION.md, docs/DEPLOYMENT.md, web/README.md | path-override | |

## 5. Publish and shares (`publish/` service, share CLI, dashboard Shares page)

| Name | Read at | Default / accepted / bad value | Controls | `.env`? | Documented | Class | Reason |
|---|---|---|---|---|---|---|---|
| PUBLISH_URL | publish/share.mjs:46 (+ web/src/lib/publish-account-url.mjs:16) | unset; share CLI throws "is not set"; dashboard hides the link unless it parses as https without credentials (publish-account-url.mjs:19-24) | Address of the publish service (client side) | PUB | deploy/README.md, docs/DEPLOYMENT.md, publish/.env.example:31, publish/README.md | user-tunable | |
| PUBLISH_API_KEY | publish/share.mjs:46 | unset; throws "is not set" | Key minted on the service's `/account` page | PUB | same as above, publish/.env.example:32 | secret | |
| PUBLISH_SECRET | publish/server.mjs:36 | required; empty throws | Signs share-page cookies and feedback tokens | no (compose `env_file: .env` at publish/compose.yml:7; the Node code uses `process.env` only) | publish/.env.example:5, publish/README.md | secret | |
| PUBLISH_AUTH_SECRET | publish/auth.mjs:73 | required; empty throws | Signs sessions, encrypts stored OAuth tokens | no | publish/.env.example:11 | secret | rotating signs everyone out |
| PUBLISH_BASE_URL | publish/auth.mjs:72 | required; trailing `/` stripped | Public origin of the service | no | publish/.env.example:10 | deploy | |
| PUBLISH_ALLOWED_EMAILS | publish/auth.mjs:70 | required; comma list, blanks dropped | Emails allowed to sign in | no | publish/.env.example:20 | deploy | |
| POCKET_ID_CLIENT_ID | publish/auth.mjs:74 | required | OIDC client id | no | publish/.env.example:15 | deploy | |
| POCKET_ID_CLIENT_SECRET | publish/auth.mjs:74 | required | OIDC client secret | no | publish/.env.example:16 | secret | |
| POCKET_ID_DISCOVERY_URL | publish/auth.mjs:74 | required | OIDC discovery URL | no | publish/.env.example:17 | deploy | |
| PUBLISH_BIND | publish/server.mjs:34 | `127.0.0.1` (image sets `0.0.0.0`, publish/Dockerfile:21) | Bind address | no | publish/.env.example:23 | deploy | |
| PUBLISH_PORT | publish/server.mjs:31 | 8080; integer 0..65535, else throws | Port | no | publish/.env.example:24 | deploy | |
| PUBLISH_DB | publish/server.mjs:37 (+ publish/auth.mjs:83) | `publish.db` (image: `/data/publish.db`) | SQLite file | no | publish/.env.example:25 | deploy | |
| PUBLISH_CLIENT_IP_HEADER | publish/server.mjs:38 | `cf-connecting-ip` (lowercased) | Header carrying the client IP | no | publish/.env.example:26 | deploy | trusted proxy setting |
| PUBLISH_TRUSTED_PROXIES | publish/server.mjs:39 | empty set; comma list | Proxies whose client-IP header is trusted | no | publish/.env.example:27 | deploy | |

## 6. Plugins

Plugin keys reach a plugin through `ctx.env`, built from `process.env` for the names in the plugin's `manifest.json` `requiredEnv` and `optionalEnv` (plugins/_engine.mjs:549-557). A third-party plugin can therefore ask for any name not in the reserved list at plugins/_engine.mjs:48-53. All rows below load from the data-root `.env` (`PL`, and `DR` in a scan).

| Name | Read at | Default / accepted / bad value | Controls | `.env`? | Documented | Class | Reason |
|---|---|---|---|---|---|---|---|
| APIFY_TOKEN | plugins/apify/index.mjs:176 (+ plugins/apify/_apify.mjs:27, :187) | unset; plugin throws "not set" | Apify token for the apify provider | PL | .env.example:80, config/plugins.example.yml, docs/PLUGINS.md | secret | |
| NOTION_ACCESS_TOKEN | plugins/notion/index.mjs:28 | unset; throws at plugins/notion/_notion.mjs:65 | Notion integration token | PL | .env.example:84, docs/NOTION_SETUP.md | secret | |
| NOTION_PARENT_PAGE_ID | plugins/notion/index.mjs:29 | unset | Notion parent page | PL | .env.example:85, docs/NOTION_SETUP.md | user-tunable | an id, not a secret |
| GMAIL_CLIENT_ID | plugins/gmail/index.mjs:95 | unset; plugin throws if any of three is missing (:99) | Gmail OAuth client id | PL | .env.example:90, docs/PLUGINS.md | secret | stored with the secrets; not secret by itself |
| GMAIL_CLIENT_SECRET | plugins/gmail/index.mjs:96 | same | Gmail OAuth client secret | PL | .env.example:91 | secret | |
| GMAIL_REFRESH_TOKEN | plugins/gmail/index.mjs:97 | same | Gmail refresh token | PL | .env.example:92 | secret | |
| USAJOBS_API_KEY | plugins/usajobs/index.mjs:78 | unset; plugin throws naming the missing name (:65) | USAJOBS key | PL | .env.example:96, docs/SUPPORTED_JOB_BOARDS.md | secret | |
| USAJOBS_USER_AGENT | plugins/usajobs/index.mjs:78 | unset; required | Registered email used as User-Agent | PL | .env.example:97 | user-tunable | |
| H1B_API_BASE | plugins/h1b-sponsor/lib/api.mjs:35 (+ check.mjs:58, index.mjs:11) | unset, so no remote calls; set-but-blank throws (api.mjs:41) | Opts into the remote H-1B HTTP backend | PL | plugins/h1b-sponsor/README.md, docs/PLUGINS.md | security-gate | sends the shortlist to a remote host; README calls it a deliberate act |
| H1B_API_TOKEN | plugins/h1b-sponsor/check.mjs:59 | unset | Token for that backend | PL | plugins/h1b-sponsor/README.md | secret | |
| H1B_INDEX_PATH | plugins/h1b-sponsor/lib/index.mjs:134 | default index location; set-but-blank throws | Relocates the local sponsor index | PL | plugins/h1b-sponsor/README.md:113 | path-override | |

## 7. Updater (`update-system.mjs`)

| Name | Read at | Default / accepted / bad value | Controls | `.env`? | Documented | Class | Reason |
|---|---|---|---|---|---|---|---|
| CAREER_OPS_UPDATE_CHANNEL | update-system.mjs:3692 | `release`; `--channel` flag wins; `main` allowed; anything else throws "Unknown --channel" | Release vs main channel | no | undocumented | user-tunable | |
| CAREER_OPS_UPDATE_IN_WORKTREE | update-system.mjs:1472 | unset; only `1` | Update a linked worktree's branch instead of redirecting to `main` | no | docs/FAQ.md, docs/SCRIPTS.md | user-tunable | |
| CAREER_OPS_UPDATE_COMMIT_ON_BRANCH | update-system.mjs:4272 | unset; only `1` (or `--commit-on-branch`) | Commit the update on the current branch | no | undocumented | user-tunable | |
| CAREER_OPS_GIT_TIMEOUT_MS | update-system.mjs:152 | 120000; pos int else default (parsePositiveInt :1158) | Git command timeout | no | undocumented | user-tunable | slow or cloud-synced trees |
| CAREER_OPS_GIT_FETCH_TIMEOUT_MS | update-system.mjs:153 | max(git timeout, 300000) | Git fetch timeout | no | undocumented | user-tunable | |
| CAREER_OPS_NPM_INSTALL_TIMEOUT_MS | update-system.mjs:157 | 60000 | `npm install` timeout | no | undocumented | user-tunable | |
| CAREER_OPS_PLAYWRIGHT_INSTALL_TIMEOUT_MS | update-system.mjs:158 | 120000 | Playwright install timeout | no | undocumented | user-tunable | |
| CAREER_OPS_DASHBOARD_REBUILD_TIMEOUT_MS | update-system.mjs:159 | 60000 | Go dashboard rebuild timeout | no | undocumented | user-tunable | |
| CAREER_OPS_UPDATE_PATH_CHECKOUT_BUDGET_MS | update-system.mjs:160 | 5000 | Budget for a path checkout step | no | undocumented | internal | |
| CAREER_OPS_REEXEC_BUFFER_TIMEOUT_MS | update-system.mjs:161 | 60000 | Slack added to the re-exec child timeout | no | undocumented | internal | |
| CAREER_OPS_UPDATE_REDIRECTED | update-system.mjs:1472 (set :1512) | unset; `1` | Marks a run already redirected to the main checkout | no | undocumented | internal | re-exec marker |
| CAREER_OPS_UPDATE_REEXEC | update-system.mjs:108 | `1` marks a legacy re-exec | Legacy re-exec flag | no | undocumented | internal | |
| CAREER_OPS_UPDATE_REEXEC_MARKER | update-system.mjs:77 (set :4808) | one-use path | Authenticated re-exec marker | no | undocumented | internal | |
| CAREER_OPS_UPDATE_REEXEC_TOKEN | update-system.mjs:78 (set :4809) | one-use token | Authenticated re-exec token | no | undocumented | internal | |
| CAREER_OPS_UPDATE_BACKUP_BRANCH | update-system.mjs:117, :4589 | must match `backup-pre-update-X.Y.Z-<stamp>` | Backup branch handed to the child | no | undocumented | internal | |
| CAREER_OPS_UPDATE_FORCE | update-system.mjs:4527 | `1`, honoured only in a re-exec | Passes `--force` to the child | no | undocumented | internal | |
| CAREER_OPS_UPDATE_CONFIRM | update-system.mjs:4530 | `1`, honoured only in a re-exec | Passes `--confirm` to the child | no | undocumented | internal | |
| CAREER_OPS_UPDATE_TARGET_REF | update-system.mjs:4561 | `main` in a trusted re-exec | Ref the child installs | no | undocumented | internal | |
| CAREER_OPS_UPDATE_TARGET_SHA | update-system.mjs:4621 | empty | SHA the child installs | no | undocumented | internal | |

## 8. Paths (relocate a file or directory)

| Name | Read at | Default / accepted / bad value | Controls | `.env`? | Documented | Class | Reason |
|---|---|---|---|---|---|---|---|
| CAREER_OPS_ROOT | path-resolver.mjs:112 (+ dashboard/main.go:444, web/src/lib/core/data-root.mjs:49, 10 more) | unset, then `.career-ops-data` marker, then `~/career-ops-data` in a plugin install copy, else the code root (path-resolver.mjs:111-137); relative resolves against the code root; an override inside a plugin cache throws `UnsafeDataRootError` | The data root (user layer) | no; it decides where `.env` lives, so `.env` cannot set it (inferred) | AGENTS.md, DATA_CONTRACT.md | path-override | |
| CAREER_OPS_DATA_DIR | path-resolver.mjs:112 | same chain; `CAREER_OPS_ROOT` wins when both set | Alias of the above | no | AGENTS.md, DATA_CONTRACT.md | path-override | |
| CAREER_OPS_PROFILE | path-resolver.mjs:164 (+ batch/batch-runner.sh:89, web/src/lib/core/profile-path.mjs:46, ~10 more) | `<data root>/config/profile.yml`; relative resolves against cwd | Profile file | doctor deliberately ignores it in `.env` (doctor.mjs:1136, :1315); only `scan.mjs` would see it (inferred) | AGENTS.md, DATA_CONTRACT.md, docs/DEPLOYMENT.md, docs/SCRIPTS.md | path-override | |
| CAREER_OPS_TRACKER | path-resolver.mjs:259 (+ dashboard/main.go:336, dashboard/internal/data/career.go:145, ~15 more) | `data/applications.md`, else `applications.md` in the data root | Tracker file | no | AGENTS.md, DATA_CONTRACT.md | path-override | |
| CAREER_OPS_TRACKER_DB | tracker.mjs:114, :1448 | tracker path with `.md` replaced by `.db` (tracker.mjs:91-93) | Derived SQLite index | no | undocumented | path-override | |
| CAREER_OPS_TRACKER_LOCK | tracker-utils.mjs:590 (+ dashboard/internal/data/tracker_lock.go:101) | tmp-dir lock `career-ops-merge-tracker-<hash>.lock`; the override is honoured only if absolute, inside the temp dir and named with that prefix | Tracker lock directory | no | undocumented | path-override | confined to tmp |
| CAREER_OPS_PDF_INDEX | tracker-utils.mjs:469 (+ dashboard/internal/data/pdf.go:95, web/src/lib/career-ops.ts:284) | `data/pdf-index.tsv` beside the workspace | PDF manifest | no | undocumented | path-override | |
| CAREER_OPS_PIPELINE | scan.mjs:137 (+ doctor.mjs:1456, plugins.mjs:51, linkedin-import.mjs:63, web/src/lib/core/profile-path.mjs:26) | `<data root>/data/pipeline.md`; relative resolves against cwd | Pipeline inbox | DR | docs/SCRIPTS.md, docs/APPLY_AUTOFILL.md, plugins/README.md | path-override | |
| CAREER_OPS_PORTALS | scan.mjs:121 (+ ~12 more incl. web/src/lib/career-ops.ts:353) | `<data root>/portals.yml` | Portal config | DR | DATA_CONTRACT.md, docs/SCRIPTS.md, docs/WEB_UI.md | path-override | |
| CAREER_OPS_SCAN_HISTORY | scan.mjs:136 (+ discover-new-companies.mjs:45, history-ats-seeds.mjs:137) | `<data root>/data/scan-history.tsv` | Scan history | DR | DATA_CONTRACT.md, docs/SCRIPTS.md | path-override | |
| CAREER_OPS_BLACKLIST | discover-ats.mjs:62 (+ discover-new-companies.mjs:47) | `<data root>/data/blacklist.md` | Do-not-apply list | no | DATA_CONTRACT.md | path-override | |
| CAREER_OPS_FOLLOWUPS | followup-cadence.mjs:32 (+ followup-seed.mjs:216, close-stale.mjs:337, reserve-report-num.mjs:178, lib/status-hooks.mjs:161) | `<data root>/data/follow-ups.md` | Follow-ups file | no | docs/SCRIPTS.md | path-override | |
| CAREER_OPS_FOLLOWUPS_LOCK | followup-seed.mjs:275 | derived lock dir | Follow-ups lock dir | no | undocumented | path-override | |
| CAREER_OPS_REPORTS | verify-pipeline.mjs:69 | `<data root>/reports`; relative resolves against the data root | Reports dir for verify-pipeline | no | undocumented | path-override | name differs from the next row |
| CAREER_OPS_REPORTS_DIR | reserve-report-num.mjs:65 | `<root>/reports` | Reports dir for report-number reservation | no | undocumented | path-override | same concept, different name |
| CAREER_OPS_JDS | verify-pipeline.mjs:73 | `<data root>/jds` | JD captures dir | no | undocumented | path-override | |
| CAREER_OPS_ADDITIONS | merge-tracker.mjs:2423 (+ ollama-eval.mjs:73, openai-eval.mjs:80, import-tracker.mjs:362) | `<data root>/batch/tracker-additions` | Tracker-additions dir | no | undocumented | path-override | |
| CAREER_OPS_BATCH_STATE | merge-tracker.mjs:2429 (+ batch-tailor.mjs:15, reserve-report-num.mjs:80, learn.mjs:73; exported by batch/batch-runner.sh:107) | `batch/batch-state.tsv` | Batch state file; also marks a batch worker (learn.mjs:73) | no | modes/_shared.md, modes/retro.md only | path-override | doubles as a headless marker |
| CAREER_OPS_INBOX | agent-inbox.mjs:46 | `data/agent-inbox.md`; relative resolves against cwd | Agent inbox file | no | modes/agent-inbox.md only | path-override | |
| CAREER_OPS_REPLY_CANDIDATES | reply-watch.mjs:34 (+ paste-reply.mjs:55) | `<data root>/data/reply-candidates.json` | Reply candidates file | no | undocumented | path-override | |
| CAREER_OPS_DOCUMENTS_DIR | intake.mjs:61 | `<data root>/documents` | Intake documents dir | no | undocumented | path-override | |
| CAREER_OPS_INTAKE_STATE | intake.mjs:62 | `<data root>/data/intake-state.json` | Intake snapshot state | no | undocumented | path-override | |
| CAREER_OPS_CV | add-entry.mjs:64 (+ scripts/export-ats-text.mjs:251) | `<root>/cv.md` | CV file | no | undocumented | path-override | |
| CAREER_OPS_ARTICLE_DIGEST | add-entry.mjs:65 | `<root>/article-digest.md` | Article digest file | no | undocumented | path-override | |
| CAREER_OPS_ACTIVITY_DIR | session-activity.mjs:55 | `<root>/.career-ops-locks/active` | Session activity markers | no | undocumented | path-override | |
| CAREER_OPS_AGGREGATOR_DOMAINS | scan.mjs:4012 (+ url-key.mjs:106, :143) | `data-static/aggregator-domains.txt` | Aggregator host list | DR for scan.mjs; no for url-key.mjs (import time, inferred) | undocumented | path-override | a bad path warns and falls back (url-key.mjs:143-148) |

## 9. Internal (locks, debug, PDF server, test seams, OS and vendor variables)

| Name | Read at | Default / accepted / bad value | Controls | `.env`? | Documented | Class | Reason |
|---|---|---|---|---|---|---|---|
| CAREER_OPS_TRACKER_LOCK_TIMEOUT_MS | tracker-utils.mjs:663 (+ merge-tracker.mjs:2433, reserve-report-num.mjs:311, web/src/lib/core-cli.ts:22, dashboard/internal/data/tracker_lock.go:62) | 60000 (Go: same; web child default 10000, capped at CLI timeout minus 5000, core-cli.ts:19-26); JS `Number(x) \|\| default` so a negative value is honoured; Go ignores values <= 0 | Tracker lock wait | no | undocumented | internal | lock tuning |
| CAREER_OPS_TRACKER_LOCK_RETRY_MS | tracker-utils.mjs:664 (+ Go :63) | 75 | Lock retry interval | no | undocumented | internal | |
| CAREER_OPS_TRACKER_LOCK_STALE_MS | tracker-utils.mjs:665 (+ Go :64) | 600000 | Lock stale age | no | undocumented | internal | |
| CAREER_OPS_TRACKER_TEST_LOCK_WAIT_MARKER | tracker-utils.mjs:632 | read only when `NODE_ENV=test` | Test seam | no | undocumented | internal | |
| CAREER_OPS_FOLLOWUPS_LOCK_TIMEOUT_MS | followup-seed.mjs:392 (envInt :220) | 60000; finite number else default | Follow-ups lock wait | no | undocumented | internal | |
| CAREER_OPS_FOLLOWUPS_LOCK_RETRY_MS | followup-seed.mjs:393 | 75 | | no | undocumented | internal | |
| CAREER_OPS_FOLLOWUPS_LOCK_STALE_MS | followup-seed.mjs:394 | 600000 | | no | undocumented | internal | |
| CAREER_OPS_PIPELINE_LOCK_TIMEOUT_MS | pipeline-lock.mjs:63 | 8000 (:34); `Number()\|\|default` | Pipeline lock wait | no | undocumented | internal | |
| CAREER_OPS_PIPELINE_LOCK_RETRY_MS | pipeline-lock.mjs:64 | 80 | | no | undocumented | internal | |
| CAREER_OPS_PIPELINE_LOCK_STALE_MS | pipeline-lock.mjs:65 | 30000 | | no | undocumented | internal | |
| CAREER_OPS_PIPELINE_LOCK_MAX_WAIT_MS | pipeline-lock.mjs:81 | unset; number >= 0 or Infinity; others dropped | Ceiling on progress-extended waiting | no | undocumented | internal | |
| CAREER_OPS_PORTAL_HEALTH_LOCK_TIMEOUT_MS | portal-health-lock.mjs:53 | 8000 | Portal-health lock wait | no | undocumented | internal | |
| CAREER_OPS_PORTAL_HEALTH_LOCK_RETRY_MS | portal-health-lock.mjs:54 | 80 | | no | undocumented | internal | |
| CAREER_OPS_PORTAL_HEALTH_LOCK_STALE_MS | portal-health-lock.mjs:55 | 30000 | | no | undocumented | internal | |
| CAREER_OPS_OWNERLESS_GRACE_MS | lib/dir-lock.mjs:64 (+ web/src/lib/core/dir-lock.mjs:64) | 1000; finite and > 0, else 1000 | Grace before an ownerless lock ages out | no (import time) | undocumented | internal | |
| CAREER_OPS_WEB_LOCK_TIMEOUT_MS | web/src/lib/inbox-skip.mjs:138 | 5000 | Dashboard inbox-skip lock wait | no | undocumented | internal | |
| CAREER_OPS_WEB_FOLLOWUPS_LOCK_TIMEOUT_MS | web/src/lib/core/followups-lock.ts:91 (+ web/src/app/api/followups/override/route.ts:23) | 5000 | Dashboard follow-ups lock wait | no | undocumented | internal | |
| CAREER_OPS_JD_ARCHIVE_TIMEOUT_MS | lib/status-hooks.mjs:38 | 120000, clamped to 100..300000 | Timeout of the JD archive hook | no | undocumented | internal | |
| CAREER_OPS_DEBUG | reply-watch.mjs:42, tracker.mjs:140 | unset; only `1` | Debug timing output | no | undocumented | internal | |
| CAREER_OPS_DEDUP_STATS | dedup-tracker.mjs:726 | unset; only `1` | Prints dedup counters | no | undocumented | internal | |
| CAREER_OPS_MERGE_HOLD_MS | merge-tracker.mjs:2445 | 0 | Regression-test hold (merge-tracker.mjs:102) | no | undocumented | internal | test seam |
| CAREER_OPS_MERGE_READY_IPC | merge-tracker.mjs:2446 | only `1` | Test IPC | no | undocumented | internal | |
| CAREER_OPS_PDF_SHARED | generate-pdf.mjs:2405 (+ web/server.mjs:111, web/src/lib/pdf-render.mjs:110, batch/batch-runner.sh:2398) | only `1` | Use the shared PDF painter process | no | docs/SCRIPTS.md | internal | set by the launchers |
| CAREER_OPS_PDF_SERVER_PROCESS | generate-pdf.mjs:2406 (+ web/server.mjs:112) | only `1` | Marks the painter process | no | undocumented | internal | |
| CAREER_OPS_PDF_SOCKET | lib/pdf-server.mjs:49 | hashed socket under a private dir | Painter socket path | no | undocumented | internal | IPC |
| CAREER_OPS_PDF_BROWSER_ROOT | generate-pdf.mjs:2722 | data root | Where the painter looks for browser settings | no | undocumented | internal | |
| CAREER_OPS_PDF_WORKSPACE_ROOT | lib/pdf-server.mjs:349 (set only; no read found) | n/a | Handed to the painter child | n/a | undocumented | internal | |
| CAREER_OPS_TEST_QUEUE | lib/test-queue.mjs:63 | queue on; `0` skips | Serialises full test runs | no | lib/test-queue.mjs comments only | internal | dev tool |
| CAREER_OPS_TEST_QUEUE_LOCK | lib/test-queue.mjs:64 | default lock dir | Test queue lock | no | comments only | internal | |
| CAREER_OPS_SMOKE_ROOT | deploy/compose.yml:16 | required (`:?` error if unset) | Scratch data root for the container smoke test | n/a | deploy/README.md | deploy | |
| CAREER_OPS_SMOKE_PORT | deploy/compose.yml:10 | 3000 | Host port for the smoke container | n/a | deploy/README.md | deploy | |
| GITHUB_TOKEN | validate-plugin-registry.mjs:61 | unset | Token for registry validation fetches | no | undocumented | secret | maintainer tool |
| CLAUDE_CODE_OAUTH_TOKEN | doctor.mjs:217 (+ deploy/compose.yml:14 passes it through) | unset | Claude subscription token (diagnostic read only) | no | deploy/README.md, README.*.md | secret | owned by the Claude CLI |
| ANTHROPIC_API_KEY | doctor.mjs:180 (+ docker-compose.yml:24) | unset | Billing-source warning only; the agent CLI uses it | no | .env.example:63, DOCKER.md | secret | |
| ANTHROPIC_AUTH_TOKEN | doctor.mjs:181 | unset | same | no | deploy/README.md, docs/RUNNING_ON_A_BUDGET.md | secret | |
| ANTHROPIC_BASE_URL | doctor.mjs:205 | unset; must be an http(s) URL with a host or doctor warns | Gateway warning only | no | deploy/README.md, docs/RUNNING_ON_A_BUDGET.md | internal | diagnostic read of a vendor variable |
| CLAUDE_CODE_USE_BEDROCK | doctor.mjs:190-191 | unset; `1`/`true`/`yes`/`on` | Billing warning only | no | docs/RUNNING_ON_A_BUDGET.md | internal | vendor variable |
| CLAUDE_CODE_USE_VERTEX | doctor.mjs:190-191 | same | same | no | docs/RUNNING_ON_A_BUDGET.md | internal | |
| CLAUDE_CODE_USE_FOUNDRY | doctor.mjs:190-191 | same | same | no | undocumented | internal | |
| CLAUDE_CONFIG_DIR | doctor.mjs:657 (+ path-resolver.mjs:28) | `~/.claude` | Claude config dir for MCP and plugin detection | no | docs/CLAUDE_PLUGIN.md | internal | vendor variable |
| CLAUDE_CODE_PLUGIN_CACHE_DIR | path-resolver.mjs:26 | unset | Plugin cache root, used to detect a plugin install copy | no | docs/CLAUDE_PLUGIN.md | internal | |
| CLAUDE_PLUGIN_ROOT | scripts/claude-plugin-session-start.mjs:189 | script's parent dir | Plugin root for the session-start hook | no | undocumented | internal | |
| CLAUDE_PLUGIN_DATA | scripts/claude-plugin-session-start.mjs:190 | unset | Persistent plugin data dir | no | docs/CLAUDE_PLUGIN.md | internal | |
| OPENCODE | doctor.mjs:1148 | only `1` selects opencode | CLI auto-detect | no | AGENTS.md | internal | |
| OPENCODE_CONFIG_DIR | doctor.mjs:678 | unset | opencode config lookup | no | undocumented | internal | |
| OPENCODE_CONFIG | doctor.mjs:682 | unset | opencode config file | no | undocumented | internal | |
| XDG_CONFIG_HOME | doctor.mjs:674 | `~/.config` | opencode global config lookup | no | undocumented | internal | OS |
| OMP_PROFILE | doctor.mjs:722 | unset | OMP profile | no | undocumented | internal | |
| PI_PROFILE | doctor.mjs:722 | unset | Pi profile | no | undocumented | internal | |
| PI_CONFIG_DIR | doctor.mjs:723 | `.omp` | OMP config dir name | no | undocumented | internal | |
| PI_CODING_AGENT_DIR | doctor.mjs:727 | unset | OMP agent dir | no | undocumented | internal | |
| PATH | doctor.mjs:1072 (+ web/src/lib/clis.ts:105) | OS | Finding agent CLIs | n/a | AGENTS.md and others (incidental) | internal | OS |
| PATHEXT | doctor.mjs:1077 (+ web/src/lib/clis.ts:114) | `.COM;.EXE;.BAT;.CMD` | Windows executable suffixes | n/a | undocumented | internal | OS |
| LOCALAPPDATA | web/src/lib/clis.ts:96 | `~/AppData/Local` | Windows CLI lookup | n/a | undocumented | internal | OS |
| APPDATA | web/src/lib/clis.ts:97 | `~/AppData/Roaming` | Windows CLI lookup | n/a | undocumented | internal | OS |
| SystemRoot | install-latex-engine.mjs:103 | unset | Windows `tar.exe` lookup | n/a | undocumented | internal | OS |
| TEMP / TMPDIR | weekly-digest.mjs:524 | `/tmp` | Self-test scratch dir | n/a | undocumented | internal | OS |
| TERM_PROGRAM | scan.mjs:5857 | unset | Hyperlink support check for the manifesto note | n/a | undocumented | internal | terminal |
| WT_SESSION | scan.mjs:5858 | unset | same | n/a | undocumented | internal | terminal |
| KITTY_WINDOW_ID | scan.mjs:5858 | unset | same | n/a | undocumented | internal | terminal |
| VTE_VERSION | scan.mjs:5859 | `0`; `parseInt` | same | n/a | undocumented | internal | terminal |
| DISABLE_AUTOUPDATER | deploy/Dockerfile:32 (set; read by the Claude CLI, inferred) | `1` | Stops the Claude CLI updating in the image | n/a | deploy/README.md | internal | |
| HOME | deploy/Dockerfile:33 (set) | `/home/app` | Image home | n/a | undocumented | internal | OS |

## Summary

### (a) Count per class

| Class | Rows |
|---|---|
| user-tunable | 36 |
| secret | 18 |
| path-override | 30 |
| deploy | 23 |
| security-gate | 8 |
| internal | 75 |
| **Total** | **190** |

By area (user-tunable / secret / path-override / deploy / security-gate / internal):

- 1. Scanner and providers: 10 / 0 / 0 / 4 / 2 / 1
- 2. Evaluation and model runners: 15 / 3 / 1 / 0 / 4 / 2
- 3. Web dashboard (Next.js in `web/`, Go TUI in `dashboard/`): 0 / 0 / 1 / 4 / 0 / 4
- 4. Scheduled jobs and automation: 0 / 0 / 1 / 4 / 1 / 0
- 5. Publish and shares (`publish/` service, share CLI, dashboard Shares page): 1 / 4 / 0 / 9 / 0 / 0
- 6. Plugins: 2 / 7 / 1 / 0 / 1 / 0
- 7. Updater (`update-system.mjs`): 8 / 0 / 0 / 0 / 0 / 11
- 8. Paths (relocate a file or directory): 0 / 0 / 26 / 0 / 0 / 0
- 9. Internal (locks, debug, PDF server, test seams, OS and vendor variables): 0 / 4 / 0 / 2 / 0 / 57

### (b) Read in code, documented nowhere

Documented nowhere in `docs/`, READMEs, `.env.example`, `deploy/README.md` or `modes/`: CAREER_OPS_HTTP_CACHE, CAREER_OPS_HTTP_CACHE_TTL_MS, CAREER_OPS_CONNECTION_SCOPE, CAREER_OPS_BROWSER_AUTODETECT (only a doctor hint), CAREER_OPS_NO_PLAYWRIGHT, CAREER_OPS_RANK_CLI, OLLAMA_MODEL, OLLAMA_NUM_CTX, OLLAMA_TIMEOUT_MS, OLLAMA_ALLOW_REMOTE, OPENROUTER_TIMEOUT_MS, CAREER_OPS_TIMEOUT_MS, JD_RESCUE_MIN_WORDS, CAREER_OPS_UPDATE_CHANNEL, CAREER_OPS_UPDATE_COMMIT_ON_BRANCH, CAREER_OPS_GIT_TIMEOUT_MS, CAREER_OPS_GIT_FETCH_TIMEOUT_MS, CAREER_OPS_NPM_INSTALL_TIMEOUT_MS, CAREER_OPS_PLAYWRIGHT_INSTALL_TIMEOUT_MS, CAREER_OPS_DASHBOARD_REBUILD_TIMEOUT_MS, CAREER_OPS_TRACKER_DB, CAREER_OPS_TRACKER_LOCK, CAREER_OPS_PDF_INDEX, CAREER_OPS_REPORTS, CAREER_OPS_REPORTS_DIR, CAREER_OPS_JDS, CAREER_OPS_ADDITIONS, CAREER_OPS_REPLY_CANDIDATES, CAREER_OPS_DOCUMENTS_DIR, CAREER_OPS_INTAKE_STATE, CAREER_OPS_CV, CAREER_OPS_ARTICLE_DIGEST, CAREER_OPS_ACTIVITY_DIR, CAREER_OPS_AGGREGATOR_DOMAINS, CAREER_OPS_FOLLOWUPS_LOCK, plus every lock-tuning, PDF-server, debug and re-exec variable in sections 7 and 9. `CAREER_OPS_BATCH_STATE`, `CAREER_OPS_INBOX` and `CAREER_OPS_HEADLESS` appear only in `modes/`.

### (c) Documented but no code reads it

- `NODE_OPTIONS` in `.env.example:40` (commented out): Node reads it, no repo code does; `plugins/_engine.mjs:52` lists it only as a reserved name.
- `CAREER_OPS_TEST_JOBS` in `CONTRIBUTING.md:198`: read only by `test-all.mjs:700`, a test harness, so outside this inventory.
- `EXA_API_KEY`, `SERPER_API_KEY`, `TAVILY_API_KEY` in `docs/PLUGINS.md` and `plugins-registry/*.json`: declared by third-party plugins, not read by this repo. The registry also declares `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REFRESH_TOKEN`, `MSGRAPH_CLIENT_ID`, `MSGRAPH_REFRESH_TOKEN`, `MSGRAPH_CLIENT_SECRET`.
- `CAREER_OPS_TEST_STARTUP`, `CAREER_OPS_TEST_PDF_CAPTURE`: read only in `dashboard/*_test.go`.
- Every other name in `.env.example` and `publish/.env.example` is read by code.

### (d) Not classified or not read as env, and why

- False positives from the first grep: `CAREER_OPS_CODE_ROOT` in `invite-match.mjs:56` and `merge-tracker.mjs:63` is a JS constant, not an env read; `CAREER_OPS_UNSAFE_DATA_ROOT` (`path-resolver.mjs:89`) is an error code; `PUBLISH_CMD` (`web/src/components/shares/shares-view.tsx:11`) is a display string; `PUBLIC_ALGOLIA_APPLICATION_ID` and `PUBLIC_ALGOLIA_API_KEY_CLIENT` (`providers/wttj.mjs:88-89`) are fields parsed from a fetched page payload, not `process.env`.
- `.envrc` is tracked at the repo root. It was not opened (rule: no env files). Anything it exports is not in this inventory.
- `PORT`, `HOSTNAME`, `NODE_ENV`: only assignments were read; that Next.js reads `PORT` and `HOSTNAME` is inferred.
- Next.js may load `web/.env*` itself (inferred, not verified).
- `CAREER_OPS_TRACKER_LOCK_*` Go and JS defaults match (60 s / 75 ms / 10 min); the web wrapper overrides the timeout for its child (`web/src/lib/core-cli.ts:19-26`).
- Import-time versus call-time reads decide whether a data-root `.env` value can apply (DNS cache, `url-key.mjs`, `dir-lock.mjs`); that ordering is inferred from ESM hoisting, not run.
- Variables that commands read only when called with a flag first (`--cli`, `--channel`, `--port`, `--host`) have the flag winning; the flag list was not enumerated beyond those cited.
