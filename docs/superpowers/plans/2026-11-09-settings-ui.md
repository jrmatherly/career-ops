# Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every setting an ordinary user changes adjustable from the dashboard, seeded from the environment, with a saved value winning everywhere, including terminal and scheduled runs.

**Architecture:** A registry (`lib/settings-registry.mjs`) names each setting, its bounds and where it lives. Settings that are environment variables today are saved in `{DATA_ROOT}/config/settings.json` and written onto `process.env` by a side-effect import (`lib/settings-env.mjs`) placed first in every module that reads one. Settings that are YAML keys today are written to `config/profile.yml` and `portals.yml` by the existing comment-preserving text editors, extended to top-level keys. One route (`/api/settings`) and one page section per group sit on top.

**Tech Stack:** Node 24 ESM (`.mjs`), Next.js 16.4 App Router, React 19, `js-yaml` (already a dependency), `node:test` for web tests, the repo's `tests/helpers.mjs` harness for root tests.

**Spec:** `docs/superpowers/specs/2026-11-09-settings-ui-design.md`. Its tables are the source for every id, bound and default below. Research with file:line evidence: `docs/superpowers/research/2026-11-09-settings-ui/`.

## Global Constraints

- No new dependency, in the root or in `web/`.
- `lib/settings-registry.mjs`, `lib/settings-store.mjs` and `lib/settings-env.mjs` import only `node:` builtins, each other and `path-resolver.mjs`. `doctor.mjs` must still start when `node_modules` is missing.
- The overlay never throws and never writes. A scan must run with a broken `config/settings.json`.
- Never write a user YAML file through `yaml.dump`. When the text editor returns null, the route answers 422 and names the file.
- A file that exists and does not parse, or is not a mapping, is never overwritten: 409.
- No secret value is read into a response, logged or written. `secret` and `readonly` ids are rejected by POST with 400.
- A write to `config/profile.yml` or `portals.yml` goes through `atomicWriteWithBackup` (`web/src/lib/core/safe-write.ts`), which leaves a `<file>.bak-<timestamp>` beside it. `config/settings.json` is written with `atomicWrite` from the same module, with no backup: it holds only values the page can show again, and a backup per section save would pile up in `config/`.
- Bounds, defaults, enum values and labels come verbatim from the spec tables.
- `lib/settings-registry.mjs`, `lib/settings-store.mjs` and `lib/settings-env.mjs` go in `SYSTEM_PATHS` in `lib/update-manifest.mjs`, never in `config/local-paths.txt`. `update-system.mjs apply` delivers only `SYSTEM_PATHS` (`update-system.mjs:4987`), and system files such as `scan.mjs` will import the overlay, so a file left in local-paths would break every scan after an update with `ERR_MODULE_NOT_FOUND`. `CHANGELOG.fork.md` (`lib/update-manifest.mjs:521`) is the precedent for a fork file in that list. Add each path in the commit that creates the file, because `updater-migration-tests.mjs` fails on a listed file that is absent. Every new fork file and every changed upstream file gets a row in the deviations table in `.claude/skills/upstream-review/SKILL.md`. Run `node validate-system-paths-coverage.mjs`, and rerun `node test-all.mjs --quick --only fork-deviations-covered` after committing, since that test diffs `HEAD`.
- A new root test is its own file under `tests/*.test.mjs` using `tests/helpers.mjs` (`pass`, `fail`, `run`, `NODE`, `ROOT`). A web test is `web/tests/lib/<name>.test.mjs` on `node:test`; a route test imports `../helpers/web-ts-alias-loader.mjs` first. Never call `process.exit()` from a suite.
- Test runs never read a developer's saved settings. `tests/helpers.mjs` sets `process.env.CAREER_OPS_SETTINGS = 'off'` beside its other blanked variables (built there, not in `test-all.mjs`, so a suite run on its own is covered too), and `web/package.json`'s `test` script gains `--import ./tests/helpers/saved-settings-off.mjs` (one line: `process.env.CAREER_OPS_SETTINGS ??= 'off';`). Both land in Task 3. A test that exercises saved settings passes `CAREER_OPS_SETTINGS: ''` to its child or sets it to `''` around the call. Reason: this checkout resolves its own directory as the data root, and suites import reader modules in-process, so a `config/settings.json` left by local use of the dashboard would otherwise change test results.
- Conventional Commits with a scope. `feat` bumps the fork's minor version, so use `feat(settings):` once per PR and `test`, `docs` or `refactor` for the rest.
- Work in a sibling worktree per PR (`git worktree add -b <branch> ../career-ops-settings-<n> main`, then `ln -s ../career-ops/node_modules node_modules` and the same for `web/node_modules`; remove both links before committing). Before each push: `node scripts/check-syntax.mjs`, `node test-all.mjs --quick`, `cd web && npm test`.
- Four PRs, landed one at a time, each merged only on the operator's explicit approval: Tasks 1 to 3, Tasks 4 to 6, Tasks 7 to 9, Tasks 10 to 12.
- UI text is plain and literal. The page label is "Settings". Source badges read exactly: "Saved here", "From environment", "From .env", "Default", "From profile.yml", "From portals.yml", "Not set".

## Review Focus

1. `config/settings.json` hand-edited into invalid JSON: scans still run on environment values, the page shows the parse error, and a save is refused with 409 instead of replacing the file. Tests in Tasks 2 and 5.
2. A saved value that is out of bounds or names an unknown id (hand edit, or a registry change in a later release): the overlay skips that one id and applies the rest; the row shows the error. Tests in Tasks 2 and 4.
3. Two tabs open, both save: the second save carries a stale revision and gets 409 with nothing written. Test in Task 5.
4. A profile whose key is commented out, carries a trailing comment, or uses CRLF line endings: the edit keeps every comment and the line endings, and `spend_tier` still matches the batch runner's line regex. Tests in Task 7.
5. A variable set on the command line while a saved value exists: the saved value wins, and `CAREER_OPS_SETTINGS=off` gives the command line back. Test in Task 3.

---

## File structure

| File | Responsibility |
|---|---|
| `lib/settings-registry.mjs` (new) | The list of settings and groups; value validation; env string encoding. Pure data and functions. |
| `lib/settings-store.mjs` (new) | Read and parse `config/settings.json`; compute the env overlay; compute the next file text for a set of changes. No writes. |
| `lib/settings-env.mjs` (new) | Side-effect import that applies the overlay to `process.env`. |
| `tests/settings-registry.test.mjs`, `tests/settings-store.test.mjs`, `tests/settings-env.test.mjs`, `tests/settings-overlay-coverage.test.mjs` (new) | Root suites. The last one is the drift guard. |
| `web/src/lib/settings-server.ts` (new) | Loads the core modules from the code root; async `effectiveEnv()`. |
| `web/src/lib/remembered-cli.mjs` (modify) | Reads a saved `CAREER_OPS_CLI` synchronously, ahead of the environment. |
| `web/src/lib/settings-state.mjs` (new) | Pure: registry plus inputs to the state the page renders; splits a change set by kind. |
| `web/src/lib/settings-yaml.mjs` (new) | Pure: applies profile and portals changes to YAML text. |
| `web/src/app/api/settings/route.ts` (new) | GET state, POST changes. |
| `web/src/lib/settings-form.mjs` (new) | Pure: form values, dirty diff, source labels. |
| `web/src/components/settings/settings-view.tsx`, `setting-row.tsx` (new) | The page sections. |
| `web/src/lib/profile-yaml-edit.mjs` (modify) | `patchProfileText` learns top-level keys. |
| `web/src/lib/portals-config.mjs` (modify) | Export `setListInText`; empty list writes `[]`; `setCompanyEnabledText`. |

---

## PR 1: saved settings and the overlay

### Task 1: Settings registry

**Files:**
- Create: `lib/settings-registry.mjs`
- Test: `tests/settings-registry.test.mjs`
- Modify: `lib/update-manifest.mjs` (add `'lib/settings-registry.mjs'` to `SYSTEM_PATHS`; Tasks 2 and 3 add their own file the same way), `.claude/skills/upstream-review/SKILL.md` (a deviations row for the three fork files in `SYSTEM_PATHS`)

**Interfaces:**
- Consumes: `AGENT_CLIS` values are copied as a literal list (the registry may not import `lib/agent-cli.mjs`, which imports `dotenv`). The test asserts the copy equals `AGENT_CLIS`.
- Produces:
  - `GROUPS: { id: string, label: string }[]`, in this order: `scanner` "Scanner and network", `automation` "Automation and evaluation", `profile` "Profile preferences", `integrations` "Integrations", `models` "Model runners", `keys` "Keys and tokens", `deployment` "Deployment".
  - `SETTINGS: Setting[]` where `Setting = { id, kind: 'env'|'profile'|'portals'|'secret'|'readonly', group, label, help, type?: 'int'|'number'|'bool'|'enum'|'string'|'url'|'list', min?, max?, step?, values?: string[], maxItems?, default?, dotenv?: boolean, on?: 'nonzero'|'words', display?: 'value'|'set'|'origin' }`. `on` says how the reader treats an environment string for a bool: `nonzero` (anything but `0` is on: `CAREER_OPS_HTTP_CACHE`) or `words` (only `1`, `true`, `yes`, `on` in any case are on: `CAREER_OPS_BROWSER_AUTODETECT`).
  - `settingById(id: string): Setting | undefined`
  - `validateSetting(setting: Setting, raw: unknown): { ok: true, value: number|boolean|string|string[] } | { ok: false, error: string }`
  - `envString(setting: Setting, value: number|boolean|string): string` (`true` to `"1"`, `false` to `"0"`, otherwise `String(value)`)
  - `settingPath(setting: Setting): string[]` (for `profile:cv.max_pages` returns `['cv','max_pages']`; empty for other kinds)

In this task the registry holds the `scanner`, `automation` and `integrations` rows of the spec's "Editable `env` settings" table (13 rows), the 14 `secret` rows in group `keys` (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `PUBLISH_API_KEY`, `APIFY_TOKEN`, `USAJOBS_API_KEY`, `NOTION_ACCESS_TOKEN`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `H1B_API_TOKEN`), and the 10 read-only rows in group `deployment`. `dotenv: true` on exactly these ten ids, whose reader loads the data root `.env` before reading: `CAREER_OPS_SCAN_CONCURRENCY`, `CAREER_OPS_SCAN_HOST_CONCURRENCY`, `CAREER_OPS_HTTP_CACHE`, `CAREER_OPS_HTTP_CACHE_TTL_MS`, `CAREER_OPS_HTTP_TIMEOUT_MS`, `CAREER_OPS_BROWSER_AUTODETECT`, `CAREER_OPS_CLI`, `PUBLISH_URL`, `USAJOBS_USER_AGENT`, `NOTION_PARENT_PAGE_ID`. `CAREER_OPS_DNS_LOOKUPS_PER_MIN` does not get it: it is read at module load, before the `.env` is loaded, so a `.env` value is ignored by the scan and must not be badged "From .env". `display` is `origin` for `ANTHROPIC_BASE_URL`, `value` for `CAREER_OPS_ROOT`, `CAREER_OPS_SCHEDULER`, `CAREER_OPS_WEB_ALLOWED_HOSTS`, `CAREER_OPS_ALLOWED_ORIGINS` and `CAREER_OPS_CONNECTION_SCOPE`, and `set` for the rest.

- [ ] **Step 1: Write the failing test** with these assertions:

```js
import { GROUPS, SETTINGS, settingById, validateSetting, envString, settingPath } from '../lib/settings-registry.mjs';
import { AGENT_CLIS } from '../lib/agent-cli.mjs';

const conc = settingById('CAREER_OPS_SCAN_CONCURRENCY');
// shape
ok(GROUPS.map(g => g.id).join() === 'scanner,automation,profile,integrations,models,keys,deployment');
ok(new Set(SETTINGS.map(s => s.id)).size === SETTINGS.length, 'ids are unique');
ok(SETTINGS.every(s => GROUPS.some(g => g.id === s.group) && s.label && s.help), 'every row has a group, label and help');
ok(SETTINGS.filter(s => s.kind === 'env').every(s => s.type), 'env rows are typed');
ok(SETTINGS.filter(s => s.kind === 'secret').every(s => !('default' in s)), 'secret rows carry no value');
for (const id of ['GEMINI_API_KEY','OPENAI_API_KEY','OPENROUTER_API_KEY','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','CLAUDE_CODE_OAUTH_TOKEN','PUBLISH_API_KEY','APIFY_TOKEN','USAJOBS_API_KEY','NOTION_ACCESS_TOKEN','GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REFRESH_TOKEN','H1B_API_TOKEN'])
  ok(settingById(id)?.kind === 'secret', `${id} is a secret row`);
ok(SETTINGS.filter(s => s.kind === 'secret').length === 14, 'exactly the 14 keys a dashboard user supplies');
ok(!settingById('PRIVACY_BYPASS_TOKEN') && !settingById('PUBLISH_SECRET'), 'gate tokens and the publish service\'s own secrets are not listed');
ok(settingById('CAREER_OPS_AUTO_EVALUATE_LOCAL').kind === 'readonly');
deepEqual(settingById('CAREER_OPS_CLI').values, AGENT_CLIS);
// the ranker matches a forced CLI by binary name and runs an unknown one with a bare `-p` and none of its tool-denial flags
const rankBins = [...readFileSync(join(ROOT, 'rank-pipeline.mjs'), 'utf8').matchAll(/^\s*(?:\{ )?bin: '([a-z]+)'/gm)].map(m => m[1]);
deepEqual(settingById('CAREER_OPS_RANK_CLI').values, rankBins);
deepEqual(rankBins, ['claude', 'opencode', 'codex', 'copilot', 'qwen', 'agy', 'grok', 'pi', 'omp']);
// validation
deepEqual(validateSetting(conc, '4'), { ok: true, value: 4 });
deepEqual(validateSetting(conc, 4), { ok: true, value: 4 });
deepEqual(validateSetting(conc, 0), { ok: false, error: 'must be a whole number from 1 to 50' });
deepEqual(validateSetting(conc, 4.5), { ok: false, error: 'must be a whole number from 1 to 50' });
deepEqual(validateSetting(conc, '4abc'), { ok: false, error: 'must be a whole number from 1 to 50' });
deepEqual(validateSetting(settingById('CAREER_OPS_HTTP_CACHE'), 'yes'), { ok: false, error: 'must be on or off' });
deepEqual(validateSetting(settingById('CAREER_OPS_RANK_CLI'), 'hermes').ok, false);
deepEqual(validateSetting(settingById('CAREER_OPS_RANK_CLI'), 'antigravity').ok, false); // its binary is agy
deepEqual(validateSetting(settingById('CAREER_OPS_RANK_CLI'), 'gemini').ok, false);
deepEqual(validateSetting(settingById('PUBLISH_URL'), 'https://cv.example.com/'), { ok: true, value: 'https://cv.example.com/' });
deepEqual(validateSetting(settingById('PUBLISH_URL'), 'https://user:pw@cv.example.com'), { ok: false, error: 'must be an https URL without credentials (http only for this machine)' });
deepEqual(validateSetting(settingById('PUBLISH_URL'), 'ftp://cv.example.com').ok, false);
deepEqual(validateSetting(settingById('USAJOBS_USER_AGENT'), 'a\nb'), { ok: false, error: 'must be 3 to 200 characters on one line' });
deepEqual(validateSetting(settingById('USAJOBS_USER_AGENT'), '  someone@example.com '), { ok: true, value: 'someone@example.com' });
// encoding
ok(envString(settingById('CAREER_OPS_HTTP_CACHE'), false) === '0' && envString(settingById('CAREER_OPS_HTTP_CACHE'), true) === '1');
ok(envString(conc, 4) === '4');
ok(settingById('CAREER_OPS_HTTP_CACHE').on === 'nonzero' && settingById('CAREER_OPS_BROWSER_AUTODETECT').on === 'words');
deepEqual(settingPath(conc), []);
```

(Define `ok(cond, label)`, `deepEqual(a, b, label)` and `throwsWith(fn, predicate, label)` at the top of each root suite as thin wrappers over `pass`/`fail` from `tests/helpers.mjs` and `node:util`'s `isDeepStrictEqual`. No existing suite exports them.)

- [ ] **Step 2: Run it.** `node test-all.mjs --quick --only settings-registry`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `lib/settings-registry.mjs`.** Error strings, exactly: int `must be a whole number from {min} to {max}`; number `must be a number from {min} to {max}`; bool `must be on or off` (accepts only `true` and `false`); enum `must be one of: {values joined by ", "}`; string `must be {min} to {max} characters on one line` (trim first; reject any character below U+0020 or U+007F); url `must be an https URL without credentials (http only for this machine)` (use `URL.parse`); list `must be a list of up to {maxItems} entries`, with each entry checked as a string or against `values`. An int given as a string must match `/^\d+$/`.
- [ ] **Step 4: Run it.** Expected: PASS. Then `node validate-system-paths-coverage.mjs`, expected exit 0.
- [ ] **Step 5: Commit.** `git commit -m "feat(settings): registry of user-adjustable settings"`

### Task 2: Settings store

**Files:**
- Create: `lib/settings-store.mjs`
- Modify: `lib/update-manifest.mjs` (add `'lib/settings-store.mjs'` to `SYSTEM_PATHS`)
- Test: `tests/settings-store.test.mjs`

**Interfaces:**
- Consumes: `settingById`, `validateSetting`, `envString` from Task 1.
- Produces:
  - `SETTINGS_FILE = 'config/settings.json'`
  - `settingsPath(root: string): string`
  - `parseSettings(text: string | null): { values: Record<string, unknown>, error: string | null }` (null text is `{ values: {}, error: null }`)
  - `readSettings(root: string): { values: Record<string, unknown>, text: string | null, error: string | null }` (a missing file is not an error; any other read failure is, with the message)
  - `overlayFor(values: Record<string, unknown>): { env: Record<string, string>, skipped: { id: string, reason: string }[] }` (only `kind: 'env'` ids reach `env`)
  - `nextSettingsText(text: string | null, changes: Record<string, unknown>): string` (throws `SettingsError`)
  - `class SettingsError extends Error { code: 'malformed' | 'invalid'; errors?: Record<string, string> }`

- [ ] **Step 1: Write the failing test** with these assertions:

```js
deepEqual(parseSettings(null), { values: {}, error: null });
deepEqual(parseSettings('{"version":1,"values":{"CAREER_OPS_SCAN_CONCURRENCY":4}}').values, { CAREER_OPS_SCAN_CONCURRENCY: 4 });
ok(parseSettings('{not json').error.includes('not valid JSON'));
ok(parseSettings('[]').error.includes('must be an object with a "values" object'));
ok(parseSettings('{"version":1,"values":[]}').error.includes('must be an object with a "values" object'));

const o = overlayFor({ CAREER_OPS_SCAN_CONCURRENCY: 4, CAREER_OPS_HTTP_CACHE: false, CAREER_OPS_HTTP_TIMEOUT_MS: 5, NOT_A_SETTING: 1, GEMINI_API_KEY: 'x', CAREER_OPS_AUTO_EVALUATE_LOCAL: '1' });
deepEqual(o.env, { CAREER_OPS_SCAN_CONCURRENCY: '4', CAREER_OPS_HTTP_CACHE: '0' });
deepEqual(o.skipped.map(s => s.id).sort(), ['CAREER_OPS_AUTO_EVALUATE_LOCAL', 'CAREER_OPS_HTTP_TIMEOUT_MS', 'GEMINI_API_KEY', 'NOT_A_SETTING']);

const t1 = nextSettingsText(null, { CAREER_OPS_SCAN_CONCURRENCY: '4' });
deepEqual(JSON.parse(t1), { version: 1, values: { CAREER_OPS_SCAN_CONCURRENCY: 4 } });
ok(t1.endsWith('\n'));
deepEqual(JSON.parse(nextSettingsText(t1, { CAREER_OPS_SCAN_CONCURRENCY: null, PUBLISH_URL: 'https://cv.example.com' })).values, { PUBLISH_URL: 'https://cv.example.com' });
// a saved id the registry no longer knows survives a write to another id
deepEqual(JSON.parse(nextSettingsText('{"version":1,"values":{"OLD_ID":1}}', { CAREER_OPS_SCAN_CONCURRENCY: 2 })).values, { OLD_ID: 1, CAREER_OPS_SCAN_CONCURRENCY: 2 });
throwsWith(() => nextSettingsText('{not json', { CAREER_OPS_SCAN_CONCURRENCY: 2 }), e => e.code === 'malformed');
throwsWith(() => nextSettingsText(null, { CAREER_OPS_SCAN_CONCURRENCY: 0, GEMINI_API_KEY: 'x', NOPE: 1 }),
  e => e.code === 'invalid' && e.errors.CAREER_OPS_SCAN_CONCURRENCY === 'must be a whole number from 1 to 50'
    && e.errors.GEMINI_API_KEY === 'cannot be changed here' && e.errors.NOPE === 'is not a setting');
// readSettings against a temp root: absent, valid, malformed
```

Also assert, by reading the three source files as text, that every `import ... from` specifier in `lib/settings-registry.mjs`, `lib/settings-store.mjs` and `lib/settings-env.mjs` starts with `node:`, `./settings-` or is `../path-resolver.mjs` (Global Constraints line 2). The `settings-env.mjs` half of this assertion goes red until Task 3; skip the file when it does not exist yet.

- [ ] **Step 2: Run it.** `node test-all.mjs --quick --only settings-store`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** `nextSettingsText` writes `JSON.stringify({ version: 1, values }, null, 2) + '\n'` with keys in their existing order and new keys appended. `overlayFor` skip reasons: `is not a setting`, `cannot be saved here` (a non-`env` kind), or the validation error.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(settings): read, validate and diff config/settings.json"`

### Task 3: Overlay import, wired into every reader

**Files:**
- Create: `lib/settings-env.mjs`
- Test: `tests/settings-env.test.mjs`, `tests/settings-overlay-coverage.test.mjs`
- Modify: `test-all.mjs` and `web/package.json`, and create `web/tests/helpers/saved-settings-off.mjs` (the test-isolation line in Global Constraints)
- Modify, adding `import './lib/settings-env.mjs';` (path adjusted per file) as the first import statement, after any shebang or `// @ts-check` header and before every other import: `scan.mjs`, `providers/_http.mjs`, `providers/_dns-cache.mjs`, `lib/browser-launch.mjs`, `rank-pipeline.mjs`, `lib/agent-cli.mjs`, `doctor.mjs`, `publish/share.mjs`, `plugins/_engine.mjs`, `web/scripts/scheduled-jobs-runner.mjs`
- Modify: `lib/update-manifest.mjs` (add `'lib/settings-env.mjs'` to `SYSTEM_PATHS`), `update-system.mjs` (add `'config/settings.json'` to `USER_PATHS`, near line 338), `.dockerignore` (add `config/settings.json`; `tests/server-image.test.mjs:43` fails when a `USER_PATHS` entry is missing there, and it is the only guard keeping a checkout's file out of the image), `remember-cli.mjs` (after it writes `.env`, when `config/settings.json` holds `CAREER_OPS_CLI`, print one stderr line: `note: the dashboard has a saved CLI (<value>) that overrides this one; change it on the Settings page`)
- Modify: `.gitignore` (add `config/settings.json` under "User config and customization"), `DATA_CONTRACT.md` (a user-layer row: `config/settings.json`, "Settings saved from the dashboard; a saved value overrides the environment"), `.env.example` (a header note of three lines: the dashboard's Settings page can save most values below; a saved value wins over this file and the environment; exporting `CAREER_OPS_SETTINGS=off` in the shell ignores saved values, and setting it in this file does nothing, because saved values are applied before this file is read), `docs/SCRIPTS.md` (the same three facts where environment variables are introduced), `.claude/skills/upstream-review/SKILL.md` (one deviations row listing the ten files and the one-line import)

**Interfaces:**
- Consumes: `readSettings`, `overlayFor` (Task 2); `getCareerOpsRoot` from `path-resolver.mjs`.
- Produces: `applySettings(env?: NodeJS.ProcessEnv, root?: string): { applied: string[], skipped: { id: string, reason: string }[] }`. The kill switch is read from the `env` argument (`env.CAREER_OPS_SETTINGS === 'off'` returns `{ applied: [], skipped: [] }` and changes nothing). The module calls `applySettings()` once at the end of its own evaluation.

- [ ] **Step 1: Write `tests/settings-env.test.mjs`.** Each case makes a temp data root, writes `config/settings.json`, and spawns `NODE --input-type=module -e <script>` with `cwd: ROOT`, `CAREER_OPS_ROOT` set to the temp root and `CAREER_OPS_SETTINGS: ''` (the harness sets it to `off`; case 2 overrides it):

```js
// 1. saved beats environment
//    settings: { CAREER_OPS_SCAN_CONCURRENCY: 4 }; env CAREER_OPS_SCAN_CONCURRENCY=9
//    script: await import('./lib/settings-env.mjs'); console.log(process.env.CAREER_OPS_SCAN_CONCURRENCY)
//    expect stdout '4'
// 2. the kill switch: same, plus env CAREER_OPS_SETTINGS=off → stdout '9'
// 3. nothing saved → stdout '9', stderr empty
// 4. malformed file ('{not json') → stdout '9', exit 0, stderr has exactly one line containing
//    'config/settings.json' and 'saved settings are not applied'
// 5. one bad value among good ones: { CAREER_OPS_SCAN_CONCURRENCY: 0, CAREER_OPS_HTTP_TIMEOUT_MS: 20000 }
//    script prints both → '9' and '20000'; stderr names CAREER_OPS_SCAN_CONCURRENCY once
// 6. the overlay is in a reader's import graph and runs before the reader's own top-level read:
//    settings: { CAREER_OPS_DNS_LOOKUPS_PER_MIN: 123 }; env unset
//    script: const m = await import('./providers/_dns-cache.mjs'); console.log(process.env.CAREER_OPS_DNS_LOOKUPS_PER_MIN)
//    expect stdout '123'
// 7. spawn with CAREER_OPS_SETTINGS=off so the import-time call is a no-op, then call
//    applySettings(fresh = {}, tempRoot): returns { applied: ['CAREER_OPS_SCAN_CONCURRENCY'], skipped: [] },
//    fresh.CAREER_OPS_SCAN_CONCURRENCY === '4', and process.env.CAREER_OPS_SCAN_CONCURRENCY is still '9'
// 8. the harness default holds: a child started with the suite's own inherited env (no CAREER_OPS_SETTINGS override)
//    and the case-1 settings prints '9'
```

- [ ] **Step 2: Write `tests/settings-overlay-coverage.test.mjs`,** the drift guard. For every `kind: 'env'` id in `SETTINGS`, list tracked files (`git ls-files`, extensions `.mjs`, `.ts`, `.tsx`) outside `tests/`, `web/tests/`, `publish/tests/`, `docs/`, `.github/`, `.claude/`, `scaffolder/` and `lib/settings-*.mjs` whose text matches `new RegExp('env\\??\\.' + id + '\\b')` (so `ctx?.env?.ID` counts) or `new RegExp('[\'"]' + id + '[\'"]')`. Each such file must either (a) have an `import` of `settings-env.mjs` that appears before any other `import` statement, judged after stripping `//` and `/* */` comments, since header comments in `providers/_dns-cache.mjs` and `plugins/_engine.mjs` contain the word "import", or (b) be a key of an `EXEMPT` map in the test whose value is the reason. Start `EXEMPT` with exactly:

```js
const EXEMPT = {
  'web/src/lib/publish-account-url.mjs': 'takes env as a parameter; the caller passes effectiveEnv()',
  'web/src/lib/remembered-cli.mjs': 'takes env as a parameter; the caller passes effectiveEnv()',
  'plugins/usajobs/index.mjs': 'loaded by plugins/_engine.mjs, which imports the overlay first',
  'plugins/notion/index.mjs': 'loaded by plugins/_engine.mjs, which imports the overlay first',
};
```

The failure message names the file, the id it reads, and says "add the settings-env import as the first import, or add the file to EXEMPT with a reason". A file in `EXEMPT` that no longer reads any registry id is also a failure, so the list cannot rot. A dry run of this matcher on 2026-11-09 (with the widened pattern, which adds `plugins/notion/index.mjs`) named thirteen files for these 13 ids: `doctor.mjs`, `lib/agent-cli.mjs`, `lib/browser-launch.mjs`, `plugins/usajobs/index.mjs`, `providers/_dns-cache.mjs`, `providers/_http.mjs`, `publish/share.mjs`, `rank-pipeline.mjs`, `scan.mjs`, `web/scripts/scheduled-jobs-runner.mjs` the notion plugin and the two exempt web files. `plugins/_engine.mjs` is wired as well although the matcher does not name it, because the `usajobs` exemption depends on it; assert in this test that `plugins/_engine.mjs` has the first-import line.

- [ ] **Step 3: Run both.** `node test-all.mjs --quick --only settings-env` and `--only settings-overlay-coverage`. Expected: FAIL (module missing; then the coverage test names each unwired reader).
- [ ] **Step 4: Implement `lib/settings-env.mjs`.** Resolve the root with `getCareerOpsRoot()` inside a `try` (an `UnsafeDataRootError` means apply nothing). Messages go to stderr, one line each, prefixed `settings: `: `config/settings.json <error>; saved settings are not applied` and `<id> <reason>; using the environment value`.
- [ ] **Step 5: Add the import to the ten files.** Run the coverage test after each; add any file it still names. If it names a file not in the list above, wire that file too and add it to the deviations row.
- [ ] **Step 5b: Add `web/tests/lib/saved-settings-off.test.mjs`:** under the web `test` script, `process.env.CAREER_OPS_SETTINGS` is `'off'`, and after `await import('../../scripts/scheduled-jobs-runner.mjs')` with `CAREER_OPS_ROOT` pointing at a temp root whose settings file saves `CAREER_OPS_RANK_CLI: 'codex'`, `process.env.CAREER_OPS_RANK_CLI` is unchanged.
- [ ] **Step 6: Run everything.** `node scripts/check-syntax.mjs`, `node test-all.mjs --quick`, `cd web && npm test`. Expected: all pass. `doctor.mjs` now reports a saved `CAREER_OPS_CLI` with `cli_source` naming the environment, since the overlay put it there; that is accepted and noted in the deviations row. Then run a real scan dry check from the worktree, `CAREER_OPS_ROOT=<temp root with settings {"CAREER_OPS_SCAN_CONCURRENCY":3}> node scan.mjs --help`, expected exit 0 with no `settings:` line on stderr.
- [ ] **Step 7: Commit and open PR 1.** `git commit -m "feat(settings): apply saved settings over the environment in every reader"`. Rerun `node test-all.mjs --quick --only fork-deviations-covered` after the commit.

---

## PR 2: the Settings API and page

### Task 4: Settings state for the page

**Files:**
- Create: `web/src/lib/settings-state.mjs`
- Test: `web/tests/lib/settings-state.test.mjs`

**Interfaces:**
- Consumes: registry values passed in as arguments (this module imports nothing from the code root, so it runs under `node:test` with no loader).
- Produces:
  - `revisionOf(text: string | null): string` (16 hex chars of SHA-256, or `"absent"` for null)
  - `buildSettingsState(input): { groups: { id, label, settings: SettingState[] }[] }` where `input = { groups, settings, validateSetting, stored: Record<string, unknown>, fileError: string | null, overlayDisabled: boolean, env: Record<string, string|undefined>, dotenv: Record<string, string>, profile: unknown, portals: unknown, modesDirs: string[], dataRoot: string }` and `SettingState = Setting & { value: unknown, source: 'saved'|'environment'|'dotenv'|'default'|'file'|'unset', editable: boolean, error?: string }`
  - `splitChanges(changes: Record<string, unknown>, settingById): { env: Record<string, unknown>, profile: Record<string, unknown>, portals: Record<string, unknown>, errors: Record<string, string> }`

Rules for `buildSettingsState`:
- `env` kind: `saved` when the id is in `stored`; else `environment` when `env[id]` is a non-empty string; else `dotenv` when the setting has `dotenv: true` and `dotenv[id]` is non-empty; else `default` when the setting has a default; else `unset`. The value is parsed to the setting's type; a bool read from the environment or `.env` follows the setting's `on` rule from the registry, and a saved bool is already a boolean. A saved or environment value that fails `validateSetting` keeps its raw value and gets `error`.
- When `fileError` is non-null or `overlayDisabled` is true, `stored` is treated as empty for sources and values, and every `env` row is `editable: false`.
- `portals:visa_filter.enabled` and `portals:experience_filter.enabled` do not read the bare path. The scanner treats a present block with no `enabled` key as on (`scan.mjs:4696`, `:4703-4705`), and onboarding writes `experience_filter: { stretch_years: 1 }` with no `enabled`. Effective value: visa is `block is a mapping && block.enabled !== false`; experience is `block is a mapping && (block.enabled === undefined || block.enabled === true)`. Source is `file` when the block exists.
- `secret` kind: `value` is always `null`. `source` is `environment`, `dotenv` or `unset`. `editable: false`.
- `readonly` kind: `editable: false`. `display: 'value'` shows the string (`CAREER_OPS_ROOT` shows `dataRoot`); `'origin'` shows `new URL(v).origin`, or `"set"` when it does not parse; `'set'` shows `true` or `false` for "is a non-empty string".
- `profile` and `portals` kinds: read the value at `settingPath` from the parsed document. `source: 'file'` when present, else `default` or `unset`. When the document is null (file absent or malformed) `editable: false` with `error: 'config/profile.yml is missing or unreadable'` (or `portals.yml`). `profile:language.modes_dir` is `editable: false` with `error: 'set to a list in config/profile.yml; edit it there'` when the file holds a list.
- Empty groups are omitted.

- [ ] **Step 1: Write the failing test.** Use a three-row fixture registry in the test (one `env` int with `dotenv: true`, one `secret`, one `readonly` with `display: 'origin'`) plus these cases: each of the five `env` sources in precedence order; a saved `0` for the int reports `source: 'saved'` with `error: 'must be a whole number from 1 to 50'`; the secret never returns its value from `env` or `dotenv` (assert `JSON.stringify(state)` does not contain the fixture secret string); `https://user:pw@gw.example:8317/v1` displays as `https://gw.example:8317`; a portals document of `{ experience_filter: { stretch_years: 1 } }` reports `portals:experience_filter.enabled` as `true` with `source: 'file'`, and `{ visa_filter: { enabled: false } }` reports visa as `false`; with `fileError: 'x'` or `overlayDisabled: true` a saved id reports its environment value and `editable: false`; `revisionOf(null) === 'absent'` and `revisionOf('a')` is 16 hex chars; `splitChanges({ A_ENV: 1, 'profile:cv.max_pages': 1, A_SECRET: 'x', NOPE: 1 })` returns the first two under `env` and `profile` and `errors` of `{ A_SECRET: 'cannot be changed here', NOPE: 'is not a setting' }`.
- [ ] **Step 2: Run it.** `cd web && node --experimental-strip-types --test tests/lib/settings-state.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(settings): compute the settings page state and sources"`

### Task 5: `/api/settings`

**Files:**
- Create: `web/src/lib/settings-server.ts`, `web/src/app/api/settings/route.ts`
- Test: `web/tests/lib/settings-route.test.mjs`
- Modify: `web/src/lib/remembered-cli.mjs` (`readRememberedCli(root, env)` first reads `{root}/config/settings.json` synchronously and returns `values.CAREER_OPS_CLI` when it is a non-empty string and `env.CAREER_OPS_SETTINGS !== 'off'`; any read or parse failure falls through to today's behavior). It stays synchronous on purpose: `resolveCliOrFallback` in `web/src/lib/clis.ts:171` calls it synchronously and has nine call sites across eight routes, so an async `effectiveEnv()` there would ripple through all of them. Also `web/src/app/shares/page.tsx:10`, the one caller of `publishAccountUrl`, an async server component (pass `await effectiveEnv()` as `env`)

**Interfaces:**
- Consumes: Tasks 1, 2 and 4; `careerOpsRoot`, `rootScript` (`web/src/lib/career-ops.ts`); `atomicWriteWithBackup`; `readJsonObject` (`web/src/lib/json-body`); `getProfilePath` (`web/src/lib/core/profile-path.mjs`); `portalsConfigPath`.
- Produces:
  - `coreSettings(): Promise<{ registry: typeof import('lib/settings-registry.mjs'), store: typeof import('lib/settings-store.mjs') }>` using the dynamic `import(/* webpackIgnore: true */ pathToFileURL(rootScript("lib/settings-store")).href)` pattern from `web/src/app/api/personalization/route.ts`
  - `effectiveEnv(root?: string, env?: NodeJS.ProcessEnv): Promise<NodeJS.ProcessEnv>` returning `{ ...env, ...overlayFor(readSettings(root).values).env }`
  - `GET /api/settings` responds `{ revision: { settings: string, profile: string, portals: string }, groups, fileError: string | null, overlayDisabled: boolean }`. `overlayDisabled` is `process.env.CAREER_OPS_SETTINGS === 'off'`; `effectiveEnv` returns `env` unchanged in that case, and POST of an `env` id answers 409 `Saved settings are turned off for this server (CAREER_OPS_SETTINGS=off).`
  - `POST /api/settings` with body `{ revision: { settings, profile, portals }, changes: Record<string, unknown> }`. Responses: 200 with the same shape as GET; 400 `{ error: 'bad json' }` or `{ errors: Record<string, string> }`; 409 `{ error: string }`.

**Found while building PR 1 (2026-11-09), to settle before this task.** The dashboard process does load the overlay. `web/src/lib/apply/url-guard.mjs` imports `liveness-browser.mjs` from the code root in-process, and that import applies saved values to the server's own `process.env` (measured: `CAREER_OPS_ROOT=<root saving CAREER_OPS_RANK_TIMEOUT_MS=12345> node -e "await import('./liveness-browser.mjs')"` leaves `12345` in the environment; `generate-pdf.mjs` does the same). The spec says the dashboard never mutates its own environment. Left alone, after the first apply flow a Reset would show the old saved value as "From environment", and every child the dashboard starts would inherit it until a restart. Task 5 must either keep the overlay out of the server process or have `GET /api/settings` and child spawns read an environment captured before it ran. Add a route test that imports `liveness-browser.mjs` first and then asserts a Reset row is not `environment`.

In this task POST handles the `env` kind. A `profile:` or `portals:` id answers 400 with `not available yet` until Task 8 replaces that branch.

- [ ] **Step 1: Write the failing route test,** modeled on `web/tests/lib/app-meta-route.test.mjs` (temp data root in `CAREER_OPS_ROOT`, `CAREER_OPS_CODE_ROOT` pointing at the real checkout, env restored in `after`). Cases:
  - GET with no settings file: 200, `revision.settings === 'absent'`, the `scanner` group contains `CAREER_OPS_SCAN_CONCURRENCY` with `value: 10, source: 'default'`.
  - GET with `CAREER_OPS_SCAN_CONCURRENCY=7` in `process.env`: `value: 7, source: 'environment'`.
  - GET with `GEMINI_API_KEY=test-secret-value` in `process.env`: the response text does not contain `test-secret-value`; the row has `source: 'environment'`.
  - POST `{ revision, changes: { CAREER_OPS_SCAN_CONCURRENCY: 4 } }`: 200; the file on disk parses to `{ version: 1, values: { CAREER_OPS_SCAN_CONCURRENCY: 4 } }`; the returned row has `source: 'saved'`; `process.env.CAREER_OPS_SCAN_CONCURRENCY` is unchanged.
  - POST the same body again with the old revision: 409, `error` contains `changed since this page loaded`, file unchanged.
  - POST `{ changes: { CAREER_OPS_SCAN_CONCURRENCY: null } }` with the current revision: 200, the id is gone from the file, `source` is back to `environment` or `default`.
  - POST `{ changes: { CAREER_OPS_SCAN_CONCURRENCY: 0, GEMINI_API_KEY: 'x' } }`: 400 with both ids in `errors`, file unchanged.
  - With the file set to `{not json`: GET is 200 with a non-null `fileError` and every `env` row `editable: false`; POST is 409 and the file still reads `{not json`.
  - POST with an empty `changes`: 400 `{ error: 'nothing to change' }`.
  - With `CAREER_OPS_SETTINGS=off` in `process.env` and a saved concurrency of 4: GET reports `overlayDisabled: true` and the row's environment or default value, not 4; POST of an `env` id is 409.
  - `readRememberedCli(root, {})` returns a saved `CAREER_OPS_CLI`; with `{ CAREER_OPS_SETTINGS: 'off', CAREER_OPS_CLI: 'codex' }` it returns `codex`; with a malformed settings file it returns what it returned before this change.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** `export const runtime = "nodejs"; export const dynamic = "force-dynamic";`. Read the data root `.env` with `parseEnv` from `node:util` on the text plus a trailing newline (the pattern in `web/src/lib/publish-account-url.mjs`); a missing file is `{}`. `modesDirs` is every directory under the code root's `modes/` that contains `_shared.md`, as `modes/<name>`, with `modes` first. Validate all changes before any write. The route tests set `process.env.CAREER_OPS_SETTINGS = ''` in `before` and restore it in `after`, since the web test script turns saved settings off. The 409 text for a stale revision: `config/settings.json changed since this page loaded. Reload and try again.`
- [ ] **Step 4: Run it, then the whole web suite.** `cd web && npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(settings): GET and POST /api/settings for saved environment settings"`

### Task 6: The Settings page

**Files:**
- Create: `web/src/lib/settings-form.mjs`, `web/src/components/settings/settings-view.tsx`, `web/src/components/settings/setting-row.tsx`
- Test: `web/tests/lib/settings-form.test.mjs`, `web/tests/lib/settings-view-wiring.test.mjs`
- Modify: `web/src/app/config/page.tsx` (render `<ConfigForm />` then `<SettingsView />`), `web/src/components/config-form.tsx` (heading "Settings"; on Save also POST `CAREER_OPS_CLI`), `web/src/lib/nav-items.ts:23` (label "Settings"), `web/README.md` (a "Settings" section: what is saved where, the precedence order, `CAREER_OPS_SETTINGS=off`, secrets are status only), `.claude/skills/upstream-review/SKILL.md` (rows for the changed upstream web files)

**Interfaces:**
- Consumes: the GET and POST shapes from Task 5.
- Produces:
  - `SOURCE_LABELS = { saved: 'Saved here', environment: 'From environment', dotenv: 'From .env', default: 'Default', unset: 'Not set' }` and `sourceLabel(state): string` (for `source: 'file'` returns `From profile.yml` or `From portals.yml` by kind)
  - `formValue(state): string | boolean | string[]`
  - `parseFormValue(state, formValue): unknown` (an empty text field on an `env` row means `null`, a reset)
  - `dirtyChanges(states: SettingState[], form: Record<string, unknown>): Record<string, unknown>`
  - `secretStatus(state): 'Set, from environment' | 'Set, from .env' | 'Not set'`

- [ ] **Step 1: Write `settings-form.test.mjs`.** Assert each label above verbatim; `dirtyChanges` returns only ids whose parsed form value differs from `state.value`; an emptied text field on a saved row yields `null`; an untouched row is absent; a bool toggled and toggled back is absent; a list compares by content, not identity.
- [ ] **Step 2: Write `settings-view-wiring.test.mjs`,** a source-reading test in the style of `web/tests/lib/config-form-persist-wiring.test.mjs`. It reads the two component files as text and asserts: `settings-view.tsx` fetches `/api/settings` and POSTs `revision` and `changes`; it renders a load-error state with a Retry control and does not render rows when the load failed; `setting-row.tsx` renders no `<input` for `kind === "secret"` or `editable === false`; a `type="password"` input appears nowhere in either file; `config-form.tsx` contains `career-ops:settings-saved` and does not POST when `cliId` is empty; `settings-view.tsx` listens for the same event; `config/page.tsx` renders `SettingsView`; `nav-items.ts` has `label: "Settings"` on the `/config` entry.
- [ ] **Step 3: Run both.** Expected: FAIL.
- [ ] **Step 4: Build the UI.** Load the `frontend-design:frontend-design` skill first and match the existing page: `Card`, the uppercase section labels and the `max-w-2xl` column `config-form.tsx` uses, light and dark. One `<section id="settings-{group.id}">` per group with a heading, its rows and one Save button that sends only that section's dirty changes. A short in-page list of section links sits above the first section. Each row: label, one line of help, the control for its type (number input with `min`, `max`, `step`; switch for bool; select for enum; text input for string and url), the source badge, and a Reset button when `source === 'saved'`. Per-id errors from a 400 render under their row with `role="alert"`. A 409 shows the server's message and a Reload button. Secret rows show `secretStatus` and nothing else. Read-only rows show the value as text. Every control has a programmatic label. `ConfigForm`'s Save, after its existing `localStorage` write, saves the CLI server-side only when `cliId` is non-empty and differs from the saved `CAREER_OPS_CLI`: it GETs `/api/settings` for the current revision, POSTs `{ revision, changes: { CAREER_OPS_CLI: cliId } }`, surfaces a failure in the existing saved-state line, and on success dispatches a `career-ops:settings-saved` window event. `SettingsView` listens for that event and refetches, so its own next save does not carry a stale revision. `ConfigForm` has no revision of its own today, and `cliId` is `""` when no CLI is installed (`config-form.tsx:39`), which the enum would reject. When `overlayDisabled` is true the page shows one banner above the sections: "Saved settings are turned off for this server (CAREER_OPS_SETTINGS=off). The values below come from the environment."
- [ ] **Step 5: Run the tests and the suite.** `cd web && npm test`. Expected: PASS.
- [ ] **Step 6: Verify in a browser.** Start the dashboard against a temp data root (`CAREER_OPS_ROOT=<temp> npm run dev` in `web/`) and drive it with the chrome-devtools MCP at `1366x768x1` and at `390x844x3,mobile,touch`:
  - Change scan concurrency to 4, Save: the badge reads "Saved here", `config/settings.json` holds 4, and `CAREER_OPS_ROOT=<temp> node --input-type=module -e "await import('./lib/settings-env.mjs'); console.log(process.env.CAREER_OPS_SCAN_CONCURRENCY)"` from the checkout prints 4.
  - Reset: the badge reads "Default" and the file no longer holds the id.
  - Enter 0: the row shows `must be a whole number from 1 to 50` and nothing is written.
  - Restart with `CAREER_OPS_SCAN_CONCURRENCY=7` exported: the badge reads "From environment" and the value is 7.
  - No horizontal scroll at 390 wide; no console errors; run the `chrome-devtools-mcp:a11y-debugging` checks on the page. Close every page opened.
- [ ] **Step 7: Commit and open PR 2.** `git commit -m "feat(settings): Settings page for saved environment settings, key status and deployment state"`

---

## PR 3: profile and portals keys

### Task 7: Top-level keys in the YAML text editor

**Files:**
- Modify: `web/src/lib/profile-yaml-edit.mjs` (`patchProfileText`, near line 202), `web/src/lib/portals-config.mjs` (export `setListInText`, near line 116; an empty `items` writes `key: []`)
- Test: `web/tests/lib/profile-yaml-edit.test.mjs`, `web/tests/lib/portals-config.test.mjs` (add cases to both)

**Interfaces:**
- Produces: `patchProfileText(source: string, patch: Record<string, ProfileValue | Record<string, ProfileValue>>, expected: unknown): string | null`. A patch entry whose value is a scalar, boolean or string list (not a plain object) is a top-level key. Existing callers are unaffected. `setListInText(lines: string[], section: string, key: string, items: string[]): string[] | null` is exported unchanged apart from the empty-list form.

Placement of a top-level key, first match wins: (1) an existing uncommented line `^key:` is replaced in place, keeping its trailing comment; (2) a commented line at column 0 matching `^#\s*key:` gets the new line inserted directly after it; (3) otherwise the line is appended after the last non-blank line. A top-level string is written bare when it matches `/^[A-Za-z0-9_.\/-]+$/` and is not `true`, `false`, `null`, `yes`, `no`, `on`, `off` or `~` in any case, and JSON-quoted otherwise. Do not reuse `scalar()` (`profile-yaml-edit.mjs:17`) for it: that helper always quotes strings, and `batch-evaluate-gemini.mjs:91-93` takes the text after `spend_tier:` verbatim, so `spend_tier: "premium"` falls through `spendTierToModel` to the standard model with no warning. A list is written on one line as a flow sequence, `key: ["a", "b"]`. A multi-line existing value under the key (a block list or mapping) returns null. When placement (2) yields text that does not parse to `expected` (the commented line sat inside another block), retry with placement (3) before returning null.

- [ ] **Step 1: Write the failing tests.** Against `config/profile.example.yml` read from the checkout, with `comments(t)` counting lines matching `/^\s*#/`:

```js
const src = readFileSync(join(ROOT, 'config/profile.example.yml'), 'utf8');
const base = yaml.load(src);
const out1 = patchProfileText(src, { spend_tier: 'premium' }, { ...base, spend_tier: 'premium' });
assert.equal(comments(out1), comments(src));
assert.match(out1, /^spend_tier: premium\b/m);
// batch-evaluate-gemini.mjs:91-93 reads exactly this and maps it to a model; a quoted value silently becomes standard
assert.equal(out1.match(/^[ \t]*spend_tier[ \t]*:[ \t]*(.+)$/m)[1].trim(), 'premium');
assert.equal(patchProfileText('a: 1\n', { session_title: 'my title' }, { a: 1, session_title: 'my title' }), 'a: 1\nsession_title: "my title"\n');
assert.equal(patchProfileText('a: 1\n', { x: 'yes' }, { a: 1, x: 'yes' }), 'a: 1\nx: "yes"\n');
const out2 = patchProfileText(src, { auto_pdf_score_threshold: 4.2 }, { ...base, auto_pdf_score_threshold: 4.2 });
assert.equal(comments(out2), comments(src));
const lines2 = out2.split('\n');
assert.equal(lines2[lines2.findIndex(l => /^#\s*auto_pdf_score_threshold:/.test(l)) + 1], 'auto_pdf_score_threshold: 4.2');
// trailing comment survives
assert.equal(patchProfileText('spend_tier: standard  # cheap\n', { spend_tier: 'economy' }, { spend_tier: 'economy' }), 'spend_tier: economy  # cheap\n');
// absent everywhere → appended
assert.equal(patchProfileText('a: 1\n', { page_format: 'a4' }, { a: 1, page_format: 'a4' }), 'a: 1\npage_format: a4\n');
// CRLF kept
assert.equal(patchProfileText('a: 1\r\nspend_tier: standard\r\n', { spend_tier: 'premium' }, { a: 1, spend_tier: 'premium' }), 'a: 1\r\nspend_tier: premium\r\n');
// top-level list, flow style
assert.equal(patchProfileText('a: 1\n', { skip_tiers: ['intern', 'entry'] }, { a: 1, skip_tiers: ['intern', 'entry'] }), 'a: 1\nskip_tiers: ["intern", "entry"]\n');
// a block value under the key is not handled
assert.equal(patchProfileText('skip_tiers:\n  - intern\n', { skip_tiers: ['mid'] }, { skip_tiers: ['mid'] }), null);
// a commented twin inside another block falls back to appending
assert.equal(patchProfileText('a:\n  b: 1\n# page_format: a4\n  c: 2\n', { page_format: 'a4' }, { a: { b: 1, c: 2 }, page_format: 'a4' }), 'a:\n  b: 1\n# page_format: a4\n  c: 2\npage_format: a4\n');
// mixed: a top-level key and a section key in one patch
const out3 = patchProfileText(src, { spend_tier: 'economy', cv: { max_pages: 1 } }, { ...base, spend_tier: 'economy', cv: { ...base.cv, max_pages: 1 } });
assert.equal(comments(out3), comments(src));
```

In `portals-config.test.mjs`: `setListInText` with `[]` on an existing list yields a document where the key parses to `[]` and every comment line outside the list survives; on `templates/portals.example.yml`, replacing `title_filter.negative` with a shorter list keeps the comment lines that sat inside the list (count them before and after).

- [ ] **Step 2: Run.** `cd web && node --experimental-strip-types --test tests/lib/profile-yaml-edit.test.mjs tests/lib/portals-config.test.mjs`. Expected: the new cases FAIL, the existing ones pass.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS, including every pre-existing case in both files.
- [ ] **Step 5: Commit.** `git commit -m "feat(settings): edit top-level profile and portals keys without losing comments"`

### Task 8: Profile and portals kinds in the registry and the route

**Files:**
- Modify: `lib/settings-registry.mjs` (the 10 `profile:` and 10 `portals:` rows from the spec; `profile:` rows in group `profile`, `portals:` rows in group `scanner`), `web/src/app/api/settings/route.ts`
- Create: `web/src/lib/settings-yaml.mjs`
- Test: `tests/settings-registry.test.mjs`, `web/tests/lib/settings-yaml.test.mjs`, `web/tests/lib/settings-route.test.mjs` (add cases)

**Interfaces:**
- Consumes: `patchProfileText`, `setListInText` (Task 7); `validateProfile(profileText, exampleText)` returning `{ parsed, findings }` (`validate-profile.mjs:212`) and `validatePortalsConfig(config, { providerIds })` returning `{ errors, warnings }` (`validate-portals.mjs:255`), both loaded from the code root the way `coreSettings()` loads its modules.
- Produces:
  - `applyYamlChanges(source: string, changes: { path: string[], value: unknown }[]): { text: string, doc: unknown } | { error: string }`. It parses `source`, refuses a non-mapping (`error: 'is not a YAML mapping'`), builds the expected document by setting each path, routes a string-list change with a two-segment path through `setListInText`, sends everything else through `patchProfileText` in one call, and returns `{ error: 'could not be edited without rewriting the file; edit it by hand' }` when either editor returns null.
  - POST now accepts `profile:` and `portals:` ids.

Route rules for these kinds:
- The target file must exist: otherwise 409 `config/profile.yml does not exist yet. Finish onboarding first.` (or `portals.yml`).
- The file's revision must match `revision.profile` or `revision.portals`: otherwise the 409 text from Task 5 with the file name swapped.
- Invalid YAML or a non-mapping: 409 `config/profile.yml exists but is not valid YAML. It was not changed.`
- `applyYamlChanges` returning `error`: 422 `{ error: 'config/profile.yml ' + error }`.
- After editing and before writing: for the profile, any `validateProfile` finding at error level that was not already present for the unedited text is a 400 on the changed id; for portals, any new entry in `errors` likewise. Pre-existing findings in a user's file never block a save.
- `profile:language.modes_dir` is a `string` row in the registry (`modes` or `modes/<name>`, 5 to 64 chars). The route also requires the value to be one of `modesDirs` (computed in Task 5), error `must be one of: <the list>`; `buildSettingsState` fills the row's `values` from `modesDirs` so the page renders a select.
- `profile:cv.template` is checked only as a kebab-case string. Whether an unknown template name fails a render or falls back was not verified (`cv-templates.mjs:40,751`); the row's help text says the name must match a template under `templates/` or `data/templates/`.
- Cross-field rule checked in the route: `portals:salary_filter.max` must be 0 or at least the resulting `salary_filter.min`, error `must be 0 or at least the minimum`.
- `validatePortalsConfig` is async: `await` it. Pass an empty `providerIds` set and rely on the new-errors-only rule; do not import the scanner's provider loader into the route, since it pulls `providers/*` and with them the overlay into the server process.
- All files are validated before the first write. Files are then written in the order settings, profile, portals. If a later write throws, respond 500 with `{ error, written: string[] }` naming what already landed.

- [ ] **Step 1: Write the failing tests.**
  - Registry: each of the 20 ids exists with the spec's type and bounds; `settingPath(settingById('profile:pipeline.auto_evaluate_daily_cap'))` is `['pipeline','auto_evaluate_daily_cap']`; `validateSetting` on `profile:spend_tier` rejects `cheap` with `must be one of: economy, standard, premium`; `portals:skip_tiers` accepts `['intern']` and rejects `['boss']`; `portals:salary_filter.currency` accepts `USD` and rejects `usd` and `DOLLARS`.
  - `settings-yaml.test.mjs`: on the example profile, changing `spend_tier`, `pipeline.auto_evaluate_daily_cap` and `cv.max_pages` together returns text with the same comment count whose parse has all three values; on `templates/portals.example.yml`, changing `max_posting_age_days` to 30 and `title_filter.negative` to a three-item list keeps every comment outside that list; `'- a\n- b\n'` returns `{ error: 'is not a YAML mapping' }`.
  - Route, each against a temp data root seeded with a copy of the example profile and the portals template: POST `profile:spend_tier: 'premium'` is 200, the file's comment count is unchanged, a file named `profile.yml.bak-<timestamp>` exists beside it (match the prefix), and GET shows `source: 'file'`; POST `profile:cv.max_pages: 0` is 400 and the file bytes are unchanged; POST with no profile file is 409 containing `Finish onboarding first`; POST against a profile containing `: : :` is 409 and the bytes are unchanged; POST `portals:salary_filter.min: 200000` with `portals:salary_filter.max: 100000` is 400 on the max id; one POST carrying an `env` id and a `profile:` id writes both files, and no `settings.json.bak-*` file is created; on a portals file holding `experience_filter:\n  stretch_years: 1\n`, POST `portals:experience_filter.enabled: false` writes `enabled: false` into that block and GET then reports `false`; `profile:language.modes_dir` on a profile whose value is a list is 400 `set to a list in config/profile.yml; edit it there`.
- [ ] **Step 2: Run.** Root: `node test-all.mjs --quick --only settings-registry`. Web: the two test files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run both suites in full.** Expected: PASS. The Task 3 coverage test must still pass: `profile:` and `portals:` ids are not `env` kind and need no import.
- [ ] **Step 5: Commit.** `git commit -m "feat(settings): save profile and portals settings from /api/settings"`

### Task 9: Profile and filter rows on the page

**Files:**
- Modify: `web/src/components/settings/setting-row.tsx` (a list control), `web/src/lib/settings-form.mjs`, `web/README.md`
- Test: `web/tests/lib/settings-form.test.mjs`, `web/tests/lib/settings-view-wiring.test.mjs`

**Interfaces:**
- Consumes: Task 8's state for `profile` and `portals` kinds.
- Produces: `parseListText(text: string): string[]` (one entry per line, trimmed, blanks and exact duplicates dropped, order kept) and `listText(items: string[]): string`.

- [ ] **Step 1: Write the failing tests.** `parseListText(' a \n\nb\na\n')` equals `['a','b']`; `listText(['a','b'])` equals `'a\nb'`; `dirtyChanges` treats a list edited and restored as clean; `sourceLabel` returns `From profile.yml` and `From portals.yml`. Wiring: `setting-row.tsx` renders a `<textarea` for a `list` type without `values` and checkboxes for a `list` type with `values`; a row with `editable === false` and an `error` renders the error text and no control.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** A free list is a textarea, one entry per line, with the count shown ("37 entries"). `portals:skip_tiers` is four checkboxes. File-backed rows have no Reset button. The Profile preferences section shows one line under its heading: "Saved to config/profile.yml. Comments in the file are kept." The scanner section's file-backed rows sit under a sub-heading "Filters (portals.yml)".
- [ ] **Step 4: Run the web suite.** Expected: PASS.
- [ ] **Step 5: Verify in a browser** against a temp data root seeded from the example profile and the portals template, at both viewports from Task 6: set spend tier to premium and Save, then confirm `grep -c '^\s*#' config/profile.yml` is unchanged and `grep '^spend_tier:' config/profile.yml` prints `spend_tier: premium`; add one line to the rejected titles list and confirm the template's in-list comments are still in `portals.yml`; `node validate-portals.mjs` and `node validate-profile.mjs` against the temp root exit 0; delete `config/profile.yml` and reload: the profile rows are disabled with the missing-file message and the rest of the page works. Close every page opened.
- [ ] **Step 6: Commit and open PR 3.** `git commit -m "feat(settings): profile preferences and scan filters on the Settings page"`

---

## PR 4: company switches, model runners, plugin status

### Task 10: Per-company on/off on the Portals page

**Files:**
- Modify: `web/src/lib/portals-config.mjs` (add `setCompanyEnabledText`), `web/src/app/api/portals/route.ts` (accept the toggle), `web/src/components/portals-view.tsx` (a switch per company)
- Test: `web/tests/lib/portals-config.test.mjs`; create `web/tests/lib/portals-route.test.mjs` (no route test exists for `/api/portals` today)

**Interfaces:**
- Produces: `setCompanyEnabledText(source: string, name: string, enabled: boolean): string | null`. It finds the `tracked_companies` entry whose `name:` equals `name` exactly, replaces that entry's `enabled:` line or inserts one directly after its `name:` line at the same indent, writes the boolean `true` or `false`, keeps every other line, and returns null when the name matches zero or more than one entry, when the entry is flow style, or when the result does not parse to the intended document. POST `/api/portals` accepts `{ company: string, enabled: boolean, revision: string }`, answers 404 `no company named "<name>" in portals.yml` on null from zero matches and 409 on an ambiguous or uneditable entry, and writes through `atomicWriteWithBackup`.

- [ ] **Step 1: Write the failing tests.** On `templates/portals.example.yml`: turning the first enabled company off returns text where exactly one line changed (compare line arrays), `watchedCompanies(yaml.load(text))` reports it disabled, and a commented-out company block elsewhere is byte-identical; an entry with no `enabled:` line gains `enabled: false` right after `name:`; a name that appears twice returns null; an unknown name returns null; turning it back on restores the original text. Route: 200 and a `.bak`; unknown company 404; stale revision 409.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The switch is optimistic with rollback on failure, labelled "Scan <company>", and disabled while its request is in flight. The Portals page is a server component that reads the file itself (`web/src/app/portals/page.tsx`), so it passes `revisionOf` the file text to `PortalsView` as a prop, and each successful toggle response returns the new revision.
- [ ] **Step 4: Run the web suite and verify in a browser:** toggle one company off, run `node validate-portals.mjs` against the temp root (exit 0), then `node scan.mjs --dry-run --company "<name>"` if `node scan.mjs --help` lists a company filter, otherwise a plain `--dry-run`, and confirm the company is not fetched. Close every page opened.
- [ ] **Step 5: Commit.** `git commit -m "feat(portals): turn a tracked company on or off from the Portals page"`

### Task 11: Model runner settings

**Files:**
- Modify: `lib/settings-registry.mjs` (the 10 `models` rows from the spec), `gemini-eval.mjs`, `scan-hn.mjs`, `openai-eval.mjs`, `openai-tailor.mjs`, `ollama-eval.mjs`, `openrouter-runner.mjs`, `utils/token-tracker.mjs` (the overlay import, first; the seven files a dry run of the matcher named on 2026-11-09, beside `plugins/_engine.mjs`, which Task 3 already wired), `.claude/skills/upstream-review/SKILL.md`
- Test: `tests/settings-registry.test.mjs` (add cases); `tests/settings-overlay-coverage.test.mjs` needs no edit and is the check

- [ ] **Step 1: Add registry assertions:** the 10 ids exist in group `models` with the spec's bounds and defaults; `validateSetting` on `OLLAMA_BASE_URL` rejects `http://user:pw@host:11434`; on `OLLAMA_NUM_CTX` rejects `0`.
- [ ] **Step 2: Add the rows, then run the coverage test.** `node test-all.mjs --quick --only settings-overlay-coverage`. Expected: FAIL, naming each unwired reader.
- [ ] **Step 3: Add the import to each file it names.** Expected after: PASS. The Models section appears on the page with no web change, since the page renders whatever groups the registry holds; confirm by loading `/config`.
- [ ] **Step 4: Prove one runner end to end.** With `{"OLLAMA_MODEL":"example-model"}` saved in a temp root, run `node ollama-eval.mjs --help` (exit 0, no `settings:` line), then a child script that imports `./ollama-eval.mjs`'s module graph the way Task 3 case 6 does and prints `process.env.OLLAMA_MODEL`. Expected: `example-model`.
- [ ] **Step 5: Commit.** `git commit -m "feat(settings): model runner settings"`

### Task 12: Plugin status on the page

**Files:**
- Create: `web/src/components/settings/plugin-status.tsx`
- Modify: `web/src/components/settings/settings-view.tsx` (render it at the end of the Integrations section), `web/README.md`
- Test: `web/tests/lib/settings-form.test.mjs`, `web/tests/lib/settings-view-wiring.test.mjs`

**Interfaces:**
- Consumes: the existing `GET /api/doctor`, whose JSON has `plugins: { id: string, hooks: string[], enabled: boolean, missingEnv: string[] }[]` (shape confirmed by running `node doctor.mjs --json` on 2026-11-09).
- Produces: `pluginLine(p): string` in `settings-form.mjs`: `"On"` when enabled; `"Off. Missing: A, B"` when `missingEnv` is non-empty; otherwise `"Off"`.

- [ ] **Step 1: Write the failing tests.** `pluginLine` for the three cases. Wiring: `plugin-status.tsx` fetches `/api/doctor`, renders no toggle or input, and shows the literal text `node plugins.mjs enable <id> --confirm`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** One row per plugin: id, hooks, `pluginLine`. Under the list: "Turning a plugin on needs your consent to what it can reach, so it is done from a terminal: `node plugins.mjs enable <id> --confirm`. Its keys go in the environment or the data root's .env." A failed fetch shows "Plugin status is unavailable." and nothing else.
- [ ] **Step 4: Run the web suite, verify in a browser at both viewports, close every page opened.**
- [ ] **Step 5: Commit and open PR 4.** `git commit -m "feat(settings): plugin status on the Settings page"`

---

## After the last PR

- [ ] Move this plan to `docs/superpowers/plans/completed/` and the spec to `docs/superpowers/specs/completed/`.
- [ ] home-cluster: nothing to change for the feature to work. Values in the HelmRelease env keep applying until a value is saved in the UI, which then lands in `config/settings.json` on the data volume. Record that in the home-cluster handoff so a later env edit that "does nothing" is traced to a saved value.
