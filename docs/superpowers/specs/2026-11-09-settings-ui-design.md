# Settings UI: design

Date: 2026-11-09. Research: `docs/superpowers/research/2026-11-09-settings-ui/`. Plan: `docs/superpowers/plans/2026-11-09-settings-ui.md`.

## Goal

Every option an ordinary user needs to change, or changes regularly, is adjustable from the dashboard. A value comes from the environment until the user saves one in the UI. A saved value wins everywhere, including a scan started from a terminal or by the OS scheduler.

## What the research found

- The product reads 190 environment variables. 36 are user-tunable, 18 are secrets, 30 relocate files, 23 are hosting settings, 8 are deliberate safety gates, 75 are internal (`01-env-inventory.md`).
- The dashboard's Config page stores the agent CLI and the logos toggle in browser `localStorage`. The server, the terminal and the scheduled runner never see them. Only the follow-up cadence writes a file (`03-dashboard-settings-audit.md`).
- Keys a user tunes during a search have no writer: `spend_tier`, `auto_pdf_score_threshold`, `pipeline.auto_evaluate_daily_cap`, `max_posting_age_days`, `skip_tiers`, `title_filter.negative`, `location_filter.block`, `salary_filter.*`, `tracked_companies[].enabled` (`02-config-key-inventory.md`).
- The OS-scheduled runner starts with three path variables and nothing else (`web/scripts/install-scan-schedule.sh:54`). A value held only in the web server's environment never reaches it.
- `providers/_dns-cache.mjs:390` reads its variables while the module loads, before `scan.mjs:107` loads the data root `.env`. An overlay has to run before any reader module is evaluated.
- `patchProfileText` keeps every comment for `section.key` edits and returns null for top-level keys. Measured on the example profile: `cv.max_pages`, `pipeline.auto_evaluate_daily_cap` and `language.output` keep 353 of 353 comment lines; `spend_tier` and `auto_pdf_score_threshold` return null, and both callers then fall back to `yaml.dump`, which drops comments.
- `spend_tier` is read by a line regex in `batch/batch-runner.sh:661` and `batch-evaluate-gemini.mjs:91`. It must stay a one-line top-level scalar.
- The dashboard has no authentication. Its only gate is the same-origin and loopback check in `web/src/proxy.ts`.

## Decisions

Decided by the operator on 2026-11-09:

1. All four groups are in scope: scanner and network, automation and evaluation, integrations, profile preferences.
2. Secrets are status only in this version. The UI shows whether a key is set and where from, never its value, and never writes one. Encrypted secrets managed from the UI are a later goal and are not designed here.
3. A saved value applies everywhere, including terminal runs.

Decided in design:

4. **Two homes, by where readers already look.** A setting that is an environment variable today is saved in `{DATA_ROOT}/config/settings.json`. A setting that is a YAML key today is saved in its own file (`config/profile.yml`, `portals.yml`), because scripts and agent prompts read it there.
5. **Seeding is a live fallback, not a copy.** Effective value = saved value, else environment, else data root `.env` (only for variables whose reader loads it), else the code default. Nothing is copied at first run, so a later change to the environment still shows through for every key the user has not saved. "Reset" deletes the saved key.
6. **The overlay is an import, placed first in every module that reads a registry variable.** `lib/settings-env.mjs` writes saved values onto `process.env` when imported. A test fails when a file reads a registry variable without importing it first. `update-system.mjs` is exempt and the update channel is not exposed: the updater has no local static imports by design.
7. **`CAREER_OPS_SETTINGS=off` skips the overlay.** Without it, a variable set on a command line loses to a saved value with no way to say otherwise. It works only as a real environment variable: saved values are applied before any `.env` is read. A dashboard started with it shows a banner, reports environment values and refuses to save environment settings, so the page never claims a value its child processes ignore.
8. **A file-backed write refuses instead of falling back to `yaml.dump`.** When the text editor cannot place a key, the route returns an error naming the file. Comments in a user's profile are data.
9. **Safety gates and hosting settings are read-only rows.** The UI shows their state so a user can see why something is off. It cannot flip them.
10. **No new dependency.** The existing line editor is extended to top-level keys.
11. **The three `lib/settings-*.mjs` files ship as system files** (`SYSTEM_PATHS`). The updater delivers only that list, and system files import the overlay. `config/settings.json` joins `USER_PATHS` and `.dockerignore`.
12. **`node remember-cli.mjs` warns when a saved CLI overrides it.** Onboarding still tells agents to run that command, and a saved `CAREER_OPS_CLI` would otherwise shadow it silently.

## Setting classes

| Kind | Stored in | UI | Count in this plan |
|---|---|---|---|
| `env` | `config/settings.json` | editable, source badge, Reset | 23 |
| `profile` | `config/profile.yml` | editable | 10 |
| `portals` | `portals.yml` | editable | 10, plus the per-company toggle on the Portals page |
| `secret` | environment or `.env` | "Set, from environment", "Set, from .env" or "Not set" | 14 |
| `readonly` | environment | value or on/off, no control | 10 |

### Editable `env` settings

| Id | Type and bounds | Default | Group |
|---|---|---|---|
| `CAREER_OPS_SCAN_CONCURRENCY` | int 1 to 50 | 10 | scanner |
| `CAREER_OPS_SCAN_HOST_CONCURRENCY` | int 1 to 50 | 10 | scanner |
| `CAREER_OPS_HTTP_TIMEOUT_MS` | int 1000 to 120000 | 10000 | scanner |
| `CAREER_OPS_HTTP_CACHE` | bool, saved as `1` or `0` | on | scanner |
| `CAREER_OPS_HTTP_CACHE_TTL_MS` | int 0 to 86400000 | 900000 | scanner |
| `CAREER_OPS_DNS_LOOKUPS_PER_MIN` | int 0 to 10000, 0 turns pacing off | 400 | scanner |
| `CAREER_OPS_BROWSER_AUTODETECT` | bool, saved as `1` or `0` | off | scanner |
| `CAREER_OPS_CLI` | enum, `AGENT_CLIS` in `lib/agent-cli.mjs` | none | automation |
| `CAREER_OPS_RANK_CLI` | enum of the ranker's binaries: `claude`, `opencode`, `codex`, `copilot`, `qwen`, `agy`, `grok`, `pi`, `omp` | none | automation |
| `CAREER_OPS_RANK_TIMEOUT_MS` | int 10000 to 1800000 | 180000 | automation |
| `PUBLISH_URL` | https URL, no credentials, no query or fragment; http only for this machine | none | integrations |
| `USAJOBS_USER_AGENT` | string, 3 to 200 chars | none | integrations |
| `NOTION_PARENT_PAGE_ID` | string, 1 to 100 chars | none | integrations |
| `GEMINI_MODEL` | string, 1 to 100 chars | `gemini-3.6-flash` | models |
| `OPENAI_BASE_URL` | https URL, no credentials, no query or fragment; http only for this machine | `https://api.openai.com/v1` | models |
| `OPENAI_MODEL` | string, 1 to 100 chars | none | models |
| `OPENAI_TIMEOUT_MS` | int 1000 to 3600000 | 300000 | models |
| `OLLAMA_MODEL` | string, 1 to 100 chars | `llama3.3` | models |
| `OLLAMA_BASE_URL` | https URL, no credentials, no query or fragment; http only for this machine | `http://localhost:11434` | models |
| `OLLAMA_NUM_CTX` | int 512 to 1048576 | 32768 | models |
| `OLLAMA_TIMEOUT_MS` | int 1000 to 3600000 | 300000 | models |
| `CAREER_OPS_MODEL` | string, 1 to 100 chars | none | models |
| `OPENROUTER_TIMEOUT_MS` | int 1000 to 2147483647 | 120000 | models |

A saved URL is where a key or a CV is sent, so it must be https unless the host is this machine. A plain-http address on another host, such as an Ollama server on the LAN, cannot be saved: it stays an environment setting beside `OLLAMA_ALLOW_REMOTE`.

The upper bounds on concurrency, timeouts and DNS pacing are this design's choice. The code accepts larger values. `CAREER_OPS_RANK_CLI` takes binary names, not CLI ids: the ranker matches a forced value against its candidates' `bin` and runs anything else with a bare `-p` and none of the tool-denial flags (`rank-pipeline.mjs:412`), so `antigravity`, `gemini` and `kimi` are not offered.

### Editable `profile` settings (`config/profile.yml`)

| Id | Type and bounds | Default |
|---|---|---|
| `profile:spend_tier` | enum `economy`, `standard`, `premium` | `standard` |
| `profile:auto_pdf_score_threshold` | number 0 to 5, step 0.1 | 3.0 |
| `profile:pipeline.auto_evaluate_daily_cap` | int 0 to 500 | 10 |
| `profile:language.output` | string, 2 to 64 chars | `en` |
| `profile:language.modes_dir` | enum of the `modes/<dir>` folders that hold a `_shared.md`, plus `modes`; a list value in the file renders read-only | `modes` |
| `profile:page_format` | enum `letter`, `a4`, `auto` | `letter` |
| `profile:cv.output_format` | enum `html`, `latex`, `text` | `html` |
| `profile:cv.template` | string, kebab-case, 1 to 64 chars | none |
| `profile:cv.max_pages` | int 1 to 10 | 2 |
| `profile:cv.strict_pages` | bool | false |

### Editable `portals` settings (`portals.yml`)

| Id | Type and bounds | Default |
|---|---|---|
| `portals:max_posting_age_days` | int 0 to 3650, 0 turns the filter off | off |
| `portals:scan_history.recheck_after_days` | int 0 to 3650 | off |
| `portals:skip_tiers` | list from `intern`, `entry`, `mid`, `senior` | none |
| `portals:title_filter.negative` | list of strings, each 1 to 80 chars, at most 200 | template list |
| `portals:location_filter.block` | list of strings, each 1 to 80 chars, at most 200 | none |
| `portals:salary_filter.min` | number, 0 to `Number.MAX_SAFE_INTEGER` | none |
| `portals:salary_filter.max` | number, 0 to `Number.MAX_SAFE_INTEGER`, 0 means no cap, must be 0 or at least `min` | none |
| `portals:salary_filter.currency` | string, 3 uppercase letters | none |
| `portals:visa_filter.enabled` | bool; a block with no `enabled` key reads as on, as the scanner reads it | off when the block is absent |
| `portals:experience_filter.enabled` | bool; same rule | off when the block is absent |

Salary bounds carry no practical ceiling because annual figures in JPY, KRW and INR pass ten million, and the scanner accepts any finite value of 0 or more (`scan.mjs:1328`).

### Secret rows (status only)

`GEMINI_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `PUBLISH_API_KEY`, `APIFY_TOKEN`, `USAJOBS_API_KEY`, `NOTION_ACCESS_TOKEN`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `H1B_API_TOKEN`. The inventory's other four secrets are left out: `PUBLISH_SECRET`, `PUBLISH_AUTH_SECRET` and `POCKET_ID_CLIENT_SECRET` belong to the publish service's own process, and `GITHUB_TOKEN` is read by CI scripts.

### Read-only rows

`CAREER_OPS_ROOT` (shown as the resolved data root path), `CAREER_OPS_SCHEDULER`, `CAREER_OPS_WEB_ALLOWED_HOSTS`, `CAREER_OPS_ALLOWED_ORIGINS`, `ANTHROPIC_BASE_URL` (origin only, since a URL can carry credentials), `PRIVACY_GUARD`, `CAREER_OPS_AUTO_EVALUATE_LOCAL`, `CAREER_OPS_CONNECTION_SCOPE`, `CAREER_OPS_TRUST_PROXY_EGRESS`, `OLLAMA_ALLOW_REMOTE`.

## Not exposed, and why

- **Path overrides (30) and internal variables (75).** Path overrides decide where the settings file itself lives. Internal ones are re-exec markers, lock tuning, test seams and OS variables.
- **Update channel and updater timeouts.** `update-system.mjs` cannot import the overlay, and a pod is updated by its image.
- **Hosting variables for the publish service** (`PUBLISH_BIND`, `PUBLISH_PORT`, `PUBLISH_TRUSTED_PROXIES`). They belong to another process and are set once.
- **Plugin enable and disable.** Enabling needs the consent card and a `plugins.lock` record, and a plugin is useless without keys the UI cannot write. The UI shows each plugin's state and missing keys, with the command to run.
- **Keys nothing reads.** `pipeline.triage_min_urls`, `narrative.superpowers`, `location.city`, `location.onsite_availability`, `compensation.location_flexibility`, `title_filter.seniority_boost`, `tracked_companies[].notes`.
- **Rare profile keys.** `style.*`, `cover_letter.*`, `outreach.*`, `culture_screen.*`, `re_apply_windows.*`, `github_evidence.*`. Hand edit or the assistant.
- **`config/privacy.yml`.** An unparseable file blocks every outbound model call, and its values are personal data.
- **Hardcoded dashboard tunables** (usage-meter budgets, Explore `sinceDays` and `limitPerAts`, `FOLLOW_UP_AFTER_DAYS`). They need a decision on whether they are settings at all. Listed in `03-dashboard-settings-audit.md` section 4.

## Behavior

**Saved settings file.** `{DATA_ROOT}/config/settings.json`, user layer, gitignored:

```json
{ "version": 1, "values": { "CAREER_OPS_SCAN_CONCURRENCY": 4, "CAREER_OPS_HTTP_CACHE": false } }
```

- Absent means nothing saved.
- A file that exists and does not parse, or whose `values` is not an object, is never overwritten. The overlay prints one line to stderr and applies nothing. The API answers 409 and the page shows the error.
- An unknown id, or a value that fails its bounds, is skipped by the overlay with one stderr line and shown as an error on its row. The file is hand-editable, so it is validated on every read.

**Overlay.** Importing `lib/settings-env.mjs` sets `process.env[id]` for each valid saved `env` setting. A bool is written as `1` or `0`, everything else as its string form. It never throws. It does nothing when `CAREER_OPS_SETTINGS=off` or when the data root cannot be resolved.

**The dashboard process does not mutate its own `process.env`.** It computes the effective environment per request (`{...process.env, ...overlay}`) for the two places it reads registry variables itself: the publish account link and the remembered CLI. Child scripts apply the overlay themselves on import.

**API.** `GET /api/settings` returns every group with each setting's effective value, its source (`saved`, `environment`, `dotenv`, `default`, `file`, `unset`) and three revisions (settings file, profile, portals). `POST /api/settings` takes `{ revision, changes }` where a value of `null` resets an `env` setting. It validates every change before writing anything, answers 400 with per-id messages on a bad value, and 409 when a revision is stale or a target file is malformed or absent. A `secret` or `readonly` id in `changes` is a 400.

**File-backed writes** follow the existing rules: refuse a file that does not parse or is not a mapping, edit as text so comments survive, check the edited text parses to the intended document, validate with `validateProfile` or `validatePortalsConfig`, write with `atomicWriteWithBackup`. A missing `config/profile.yml` or `portals.yml` is a 409 that points to onboarding. The settings page never seeds those files.

**Page.** `/config` keeps its route and is labelled "Settings" in the nav. The existing AI engine, logos and follow-up cadence controls stay at the top. Below them, one section per group, each with its own Save. Every row shows a source badge: "Saved here", "From environment", "From .env", "Default", "From profile.yml", "From portals.yml" or "Not set". A row whose value is saved here has a Reset control. A failed load shows an error and Retry, never defaults, the rule `CadenceSettings` already follows. Saving the AI engine also saves `CAREER_OPS_CLI`, so the scheduled runner and the terminal use the same CLI the dashboard does.

**Portals page.** Each watched company gets an on/off switch that writes `tracked_companies[].enabled`. Off writes the boolean `false`, the only value the scanner treats as disabled.

## Risks

- **An unauthenticated settings route.** It adds no new class of exposure: the dashboard already writes the profile and starts child processes behind the same origin guard. It writes no secret, no path, no host allow-list and no safety gate. `CAREER_OPS_RANK_CLI` is limited to the ranker's own binaries, each of which runs with its tool-denial flags. `PUBLISH_URL` and the model base URLs are the sensitive rows: a changed URL redirects where a key is sent. They refuse URLs with credentials, and the Ollama remote gate stays in the environment.
- **A saved value hides a later environment change.** The source badge and Reset make that visible. This is the behavior the operator asked for.
- **Upstream merges.** The overlay is one import line in each of 17 files (10 in the first PR, 7 with the model runners). Each gets a row in the deviations table in `.claude/skills/upstream-review/SKILL.md`.
