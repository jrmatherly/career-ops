# Docs review fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the career-ops docs true for the fork's container and cluster deployment, fix the claims that are wrong for every user, and pin each fix with a test where a drift guard is cheap.

**Architecture:** Fork-only material (the cluster path, the settings the operator found by reading code) lands in one new `docs/DEPLOYMENT.md` plus rows in `deploy/README.md`, and the upstream docs get at most a pointer. Claims wrong for every user are fixed in the upstream files in three separable batches, each an upstream pull-request candidate. Every doc edit to an upstream file gets a row in the deviations table of `.claude/skills/upstream-review/SKILL.md` so the next merge has a resolution rule.

**Tech Stack:** Markdown, the `tests/*.test.mjs` suite (`pass`/`fail` helpers or `node:test`), `node test-all.mjs --quick`, `npm run lint`.

**Spec:** `docs/superpowers/research/2026-11-08-docs-review/README.md` (findings F1 to F31, the per-doc verdict table and the opportunities table). Finding ids below refer to it. The plan was reviewed once by an independent reviewer before it was committed; the Review log at the end records what changed.

## Global Constraints

- Docs are system layer. No value from the operator's data root, no hostname, token, key, email or path under `~/career-ops-data` appears in any file (Data Contract, `.claude/rules/dev-workflow.md`). Settings are named by their variable, never by their value, except the public image defaults already in `deploy/Dockerfile`.
- Every file under `docs/` and every root `*.md` here is upstream-shipped except `docs/superpowers/**` and `FORK.md`. `DOCKER.md` is upstream-shipped too and already has a deviations row. An edit to an upstream file gets a deviations row (`.claude/skills/upstream-review/SKILL.md`, "Deviations decided", section "Fork harness, CI and docs"), with the hunk rule (ADOPT, ADAPT, KEEP) and the pinning test, in the shape of the existing docs-audit rows. A new fork file inside `docs/` is covered by the `docs/` SYSTEM_PATHS entry and needs no `config/local-paths.txt` line.
- A pinning test asserts names and facts (a variable, a file, a flag, a table row), never a sentence, so an upstream rewrite of the surrounding prose does not fail it. Pattern: `tests/claude-web-setup-docs.test.mjs`. A test that reads a doc that may not exist yet uses the `read` helper pattern from `tests/server-image.test.mjs:12-13` (empty string when missing), so the suite reports `fail` lines instead of throwing.
- A test that runs a script passes `CAREER_OPS_ROOT` pointing at a path under `os.tmpdir()` that does not exist, runs with a temp cwd, pipes stderr, and only runs scripts that handle `--help` before any side effect.
- `node test-all.mjs --quick --only <name>` takes one substring. Two suites need two runs.
- Commits follow Conventional Commits with a scope (`docs(deploy): …`, `test(docs): …`). Before each commit: `npm run lint`, `node test-all.mjs --quick`. After each commit: `node test-all.mjs --quick --only fork-deviations-covered`, because that guard diffs `merge-base..HEAD` and cannot see uncommitted edits. A task that edits `deploy/README.md`, `deploy/compose.yml` or `web/src/**` is not docs-only for CI (`.github/scripts/docs-only-push.mjs`), so its push runs the full matrix.
- Prose follows the house style: short declarative sentences, no em dashes, no semicolons joining clauses, no colon as a mid-sentence connector.
- Never run `node update-system.mjs apply`, `doctor --init-templates`, a scan, or `kubectl` from this checkout.

## Review Focus

1. A reader of `docs/DEPLOYMENT.md` who sets `CAREER_OPS_WEB_ALLOWED_HOSTS` but not `CAREER_OPS_SCHEDULER` sees "Task not installed" and assumes the CronJob failed. Task 1's test pins that the doc names both variables.
2. A `--help` run in Task 4's test against a script that works before printing usage would build or write. `build-dashboard.mjs` runs `go build` on any argv and `cv-templates.mjs` has no `--help` branch, so both are out of the list, and the test asserts the nonexistent data root is still absent afterwards.
3. Task 6's `read_only: true` in the smoke compose breaks the smoke stack if `next start` writes anywhere outside the listed paths. Task 6 ends by running the smoke stack and names the fallback.
4. A future change that gives a dashboard worker the code root as cwd, or an `--add-dir`, would start loading `/app/CLAUDE.md` and `/app/.claude/` in the pod. Task 1's `deploy/README.md` sentence states today's cwd, and the Not in this plan section records the `.dockerignore` hygiene that would then matter.
5. Task 2's per-kind table is derived from `KNOWN_KINDS` in `web/src/lib/worker-capabilities.mjs`. A kind added without a doc row fails the test, and the failure message names the kind.

---

### Task 1: The fork's deployment doc and the runtime contract rows (fork-only)

Findings: F1, F2, F6, F7, F8 (sentence), F9 (doc half), F10, F11, F13, F14, F15, F16, F17, F18, F22, F23, F25, F26 (fork half), F30, F31.

**Files:**
- Create: `docs/DEPLOYMENT.md`
- Modify: `deploy/README.md` (bullet list ends at line 29 and the uid sentence is line 31, the runtime table ends at line 45 with `| Port |`, the CronJob paragraph is lines 47-50, the "No Go toolchain, no TeX" bullet is line 23, the `.claude` bullet is lines 27-29)
- Modify: `FORK.md:26-40`
- Modify: `DOCKER.md:23-30`
- Modify: `docs/SETUP.md` (new `### Running on a cluster` before `### PDF rendering (one-time)` at line 117), `README.md:264`, `docs/FAQ.md:108` and `:112`, `docs/ARCHITECTURE.md:13`, `docs/AUTOMATION.md` section B (after line 158), `docs/SUPPORTED_CLIS.md:21`, `docs/CLAUDE_PLUGIN.md:72`
- Modify: `.claude/skills/upstream-review/SKILL.md` (rows, Step 6)
- Test: `tests/deployment-doc.test.mjs`

**Interfaces:**
- Produces: `docs/DEPLOYMENT.md` with these `##` headings, which Tasks 2 to 6 link to by anchor: `What runs where`, `Runtime settings`, `What the pod reads from .env`, `What the image lacks`, `Scheduled jobs`, `Rollouts kill in-flight runs`, `Behind a gateway`, `Plugins and portal health`, `Moving the data root off a Mac`, `Updating`.

- [ ] **Step 1: Write the failing test**

```js
// tests/deployment-doc.test.mjs — the cluster path is documented once, by name.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pass, fail, ROOT } from './helpers.mjs';

const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : '');
const deployment = read('docs/DEPLOYMENT.md');
const runtime = read('deploy/README.md');
const fork = read('FORK.md');
const docker = read('DOCKER.md');

const names = [
  ['docs/DEPLOYMENT.md', deployment, ['CAREER_OPS_SCHEDULER', 'CAREER_OPS_SCHEDULER_DESCRIPTION', 'CAREER_OPS_SCHEDULED_JOBS_PATH', 'PUBLISH_URL', 'PUBLISH_API_KEY', 'CAREER_OPS_CLI', 'readOnlyRootFilesystem', 'scheduled-jobs.json', 'title_filter_full', 'uninstall-scan-schedule.sh', 'launchctl bootout', 'COPYFILE_DISABLE', '--no-overwrite-dir', 'WebFetch', 'networkReadOnly', 'no `gh`', 'no TeX', '/api/healthz', '/api/scheduler', '--channel main']],
  ['deploy/README.md', runtime, ['CAREER_OPS_SCHEDULER', 'PUBLISH_URL', 'PUBLISH_API_KEY', 'no `gh`', '/api/healthz', 'docs/DEPLOYMENT.md']],
  ['FORK.md', fork, ['deploy/README.md', 'CAREER_OPS_ROOT=/data']],
  ['DOCKER.md', docker, ['career-ops-server', 'career-ops-publish', 'deploy/README.md']],
];
for (const [file, text, markers] of names) {
  for (const marker of markers) {
    if (text.includes(marker)) pass(`${file} names ${marker}`);
    else fail(`${file} no longer names ${marker}`);
  }
}
if (/on a push to `main` that touches them/.test(docker)) fail('DOCKER.md still says the images build only when their inputs change (docker-image.yml has no path filter on push)');
else pass('DOCKER.md matches docker-image.yml on the push trigger');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test-all.mjs --quick --only deployment-doc`
Expected: `fail` lines for every `docs/DEPLOYMENT.md` marker (empty string), for the `deploy/README.md`, `FORK.md` and `DOCKER.md` markers not yet present, and for the DOCKER.md trigger line.

- [ ] **Step 3: Write `docs/DEPLOYMENT.md`**

One page, under about 200 lines, headings as listed in Interfaces. Content per heading, each a short paragraph or a table, facts from the findings:

- `What runs where`: the web pod from `deploy/Dockerfile` is the daily surface, `CAREER_OPS_ROOT=/data` on a volume (tracker at `/data/data/applications.md`), a CronJob ticks `/api/scheduler`, the publish service is a second pod. Every dashboard `claude -p` worker is spawned with the data root as cwd and no `--add-dir` (`web/src/app/api/run/route.ts:191`, `:234`), so nothing under `/app/CLAUDE.md`, `/app/AGENTS.md` or `/app/.claude/` is loaded by it; the prompt carries the code root as a path. Link `deploy/README.md` as the runtime contract and `web/README.md` for the app.
- `Runtime settings`: table of every variable the pod needs beyond `deploy/README.md`'s table: `CAREER_OPS_SCHEDULER=external` (what it changes on the Scheduled scans page, `web/src/lib/scheduler-status.ts`), `CAREER_OPS_SCHEDULER_DESCRIPTION`, `CAREER_OPS_SCHEDULED_JOBS_PATH`, `PUBLISH_URL`, `PUBLISH_API_KEY` (`publish/share.mjs` reads the environment before `{root}/.env`), `CLAUDE_CODE_OAUTH_TOKEN` (renew by re-running `claude setup-token` and replacing the secret; the token lifetime is Anthropic's, stated in the deploy decision trail, not measured here).
- `What the pod reads from .env`: the Next process itself reads `{root}/.env` only for `CAREER_OPS_CLI` (`web/src/lib/remembered-cli.mjs`, environment wins) and `PUBLISH_*` (`publish/share.mjs`). Script children read it on their own terms: `scan.mjs` loads all of it (so scheduled scans see it), `lib/browser-launch.mjs` reads the browser keys for every Playwright launch including the PDF server, `doctor.mjs` reads `CAREER_OPS_PROFILE`, `lib/agent-cli.mjs` reads `CAREER_OPS_CLI`, and the key-based evaluators and `plugins/_engine.mjs` load it. Nothing in it reaches `claude -p`. A Mac `.env` holding only `CAREER_OPS_CLI` is inert in the pod because the image presets it.
- `What the image lacks`: no TeX (so `cv.output_format: latex`, `latex`, `latex-tex` fail), no `gh` (so `expand`'s GitHub step exits 3), no Go (no dashboard TUI), no headed Chrome (no apply flow), no `.claude/settings.json` or hooks. Dashboard runs: `evaluate`, `cover` and `research` get `Read,WebFetch,WebSearch,Glob,Grep` and `pdf` gets `Read,Glob,Grep` (`web/src/lib/claude-invocation.mjs` `TOOL_SCOPES`, the `networkReadOnly` and `localReadOnly` scopes), zero MCP servers, so `scan.extractor: cli` and `fetch-jd.mjs` never run from the dashboard and JD text is WebFetch only. `fix-portal` is the one writing kind and keeps Bash and its MCP servers. The coordinator reports that Ashby job pages are JavaScript shells WebFetch cannot read; the doc states it as reported, and the findings' Open questions ask for one URL to confirm it. `node doctor.mjs` in the pod always warns that Playwright MCP tools are not detected, for the same reason.
- `Scheduled jobs`: each job in `data/scheduled-jobs.json` carries its own filters. At run time `writeJobPortals` (`web/scripts/scheduled-jobs-runner.mjs:145-181`) replaces `title_filter.negative` and the four `location_filter` lists `allow`, `block`, `block_hard` and `always_allow` with the job's lists (an absent list means none), and falls back to `portals.yml` only for `title_filter.positive`. When `title_filter_full` exists it receives the same lists, so an `engine: full` job never uses `portals.yml`'s own full-scan keywords. `strict` and `workplace_policy` pass through. Editing `portals.yml` changes neither job. Engine `portals` runs `scan.mjs`, engine `full` runs `scan-ats-full.mjs`; nothing else runs on the tick (no portal health, no follow-up sweep). `POST /api/scheduler` answers 202 when the runner is spawned, not when the scan ends, and the runner is detached with its output ignored, so a failed scan shows only in the run history inside `data/scheduled-jobs.json`.
- `Rollouts kill in-flight runs`: every push to `main` rebuilds the image (`docker-image.yml`, no path filter on push; a pull request that touches image inputs builds without pushing), Renovate moves the digest on its schedule, the `Recreate` rollout stops the pod, and `web/server.mjs` has no signal handler, so an evaluate, a PDF or a scan in flight is lost. A claimed scan is requeued after 30 s on the next tick.
- `Behind a gateway`: the app has no login and `POST /api/scheduler` has no auth. Put an authenticating proxy in front and restrict the Service to the gateway and the CronJob. Probes and the CronJob may use `Host: localhost` (loopback is always admitted) or a name in `CAREER_OPS_WEB_ALLOWED_HOSTS`. `GET /api/healthz` is the probe.
- `Plugins and portal health`: plugin keys must be pod environment (no `.env` write path), only provider plugins run inside a scheduled scan, the web has no plugin surface. `verify-portals.mjs`, `audit-portals.mjs`, `stats.mjs --prune` and `filter-audit.mjs` run only from a shell against the volume (`kubectl exec`).
- `Moving the data root off a Mac`: copy 1:1 (`CAREER_OPS_ROOT=/data` keeps `data/applications.md` under it). Create the archive with `COPYFILE_DISABLE=1 tar` so no AppleDouble `._*` files are added. Extract with GNU tar `--no-overwrite-dir` so the extract does not fail setting metadata on the mount point itself. Delete any `._*` already copied (the first migration copied 138 of them, `../research/2026-11-06-reactive-resume-convergence/decisions.tsv`, the 03:18Z row). `chmod 644` on `0600` files before copying. Unload both launchd agents (`web/scripts/uninstall-scan-schedule.sh` removes only `io.career-ops.scheduled-scan`, any recipe agent needs `launchctl bootout gui/$(id -u)/<label>`). Do not copy `.env`. Stop the Mac from writing the same tracker.
- `Updating`: the pod has no `.git` and the fork cuts no releases, so `update-system.mjs` is not the path (on the Mac, `node update-system.mjs check --channel main` is the fork's only channel). Merge to `main` and let the image rebuild. User CV template copies live at `/data/data/templates/`.

- [ ] **Step 4: Edit the other files**

- `deploy/README.md`: add rows `CAREER_OPS_SCHEDULER` (`external`), `CAREER_OPS_SCHEDULER_DESCRIPTION`, `PUBLISH_URL`, `PUBLISH_API_KEY` ("environment, or `{root}/.env`, environment wins"), `Root filesystem` (read-only, writable paths `/data`, `/home/app`, `/tmp`, `/dev/shm`, `/app/web/.next/cache`). Change line 23 to "No Go toolchain, no TeX, no `gh`". Replace lines 27-29 with "No `.claude/settings.json` or hooks: `.dockerignore` excludes them. A dashboard `claude -p` run has the data root as cwd, so nothing under `/app/.claude/` or `/app/CLAUDE.md` is loaded by it either way; the modes and templates reach the worker by path." After line 31 (the uid sentence, outside the bullet list) add the rollout paragraph (two sentences). Change lines 47-50 to allow `Host: localhost` or an allowed host, and name `GET /api/healthz`. Add one line "The full cluster path is `docs/DEPLOYMENT.md`."
- `FORK.md:26-40`: keep the plugin install block for a Mac, replace "Daily use goes through the Claude Code plugin, never through this checkout" and "The data root stays `~/career-ops-data`" with two sentences: on a Mac, use the plugin with `~/career-ops-data`; the fork's production path is the server image in `deploy/README.md` with `CAREER_OPS_ROOT=/data`.
- `DOCKER.md:23-30`: list the four images with their Dockerfiles, say every push to `main` rebuilds all four (a pull request that touches image inputs builds without pushing), and add one sentence that `ghcr.io/jrmatherly/career-ops-server` is the image with the Claude CLI, documented in `deploy/README.md`.
- `docs/SETUP.md`: new `### Running on a cluster` before line 117 (three sentences and a link to `docs/DEPLOYMENT.md`). `README.md:264`: append "This fork also runs it as a hosted pod, see `deploy/README.md`." `docs/FAQ.md:108` and `:112`: one fork-note sentence each pointing at `docs/DEPLOYMENT.md`. `docs/ARCHITECTURE.md:13`: append "In the web dashboard's evaluate run the extraction is WebFetch only (`docs/DEPLOYMENT.md`)." `docs/AUTOMATION.md` after line 158: "When a CronJob or another external scheduler fires the tick, set `CAREER_OPS_SCHEDULER=external`; see `docs/DEPLOYMENT.md`." `docs/SUPPORTED_CLIS.md:21`: append "A `CAREER_OPS_CLI` set in the environment overrides the `.env` line." (this sentence is a fork hunk, so it stays fork-only). `docs/CLAUDE_PLUGIN.md:72`: append "On this fork `check` reports `offline` by default and `--channel main` is the only channel that carries updates."

- [ ] **Step 5: Run the test to verify it passes**

Run: `node test-all.mjs --quick --only deployment-doc`
Expected: PASS on every marker. Then `node test-all.mjs --quick --only claude-web-setup-docs` still passes.

- [ ] **Step 6: Deviations rows**

In "Fork harness, CI and docs" add one row: Upstream "no `docs/DEPLOYMENT.md`; `deploy/README.md` runtime table without the scheduler, publish and root-filesystem rows" / Ours "`docs/DEPLOYMENT.md` (the container and cluster path) and the added rows and paragraphs in `deploy/README.md`" / Status "landed <date> (docs review Task 1)" / Notes "KEEP (both are fork files). Pinned by `tests/deployment-doc.test.mjs`." Extend the `README.md` wording row, the slice A row (`docs/SETUP.md`, `docs/FAQ.md`, `docs/SUPPORTED_CLIS.md`, `docs/CLAUDE_PLUGIN.md`), the root `Dockerfile` row that names `DOCKER.md` ("the four-image rewrite and the `deploy/README.md` pointer"), and add `docs/ARCHITECTURE.md` and `docs/AUTOMATION.md` to the `ARCHITECTURE.md` row, each with one clause naming the pointer sentence and `tests/deployment-doc.test.mjs`. `FORK.md` is in `config/local-paths.txt` and needs no row.

- [ ] **Step 7: Lint, suite, commit, guard**

```bash
npm run lint && node test-all.mjs --quick
git add docs/DEPLOYMENT.md deploy/README.md FORK.md DOCKER.md docs/SETUP.md README.md docs/FAQ.md docs/ARCHITECTURE.md docs/AUTOMATION.md docs/SUPPORTED_CLIS.md docs/CLAUDE_PLUGIN.md tests/deployment-doc.test.mjs .claude/skills/upstream-review/SKILL.md
git commit -m "docs(deploy): document the container and cluster path in docs/DEPLOYMENT.md"
node test-all.mjs --quick --only fork-deviations-covered
```

---

### Task 2: Web run-kind tools, scheduled-job overlay, uninstall scope (upstream candidate A)

Findings: F3 (doc half), F4, F12, F24, F29.

**Files:**
- Modify: `web/README.md` (the "Safety" list ends at line 100, "Scheduled scans" is lines 102-125, the uninstall sentence is lines 118-120)
- Modify: `docs/SCRIPTS.md:43` (browser-extract row), `:51` (scheduled-jobs-runner row), `:54` (uninstall row)
- Modify: `docs/AUTOMATION.md:83`, `:138-146`, `:285`
- Modify: `docs/WEB_UI.md:51`
- Modify: `.claude/skills/upstream-review/SKILL.md`
- Test: `tests/web-readme-run-kinds.test.mjs`

**Interfaces:**
- Consumes: `KNOWN_KINDS` (exported, `web/src/lib/worker-capabilities.mjs:71`), `toolScopeFor(kind)` and `toolNames(value)` (exported, `web/src/lib/claude-invocation.mjs`). `toolScopeFor` returns `{ allowed, disallowed }`, both comma-separated strings. `claude-invocation.mjs` imports only `./worker-capabilities.mjs`, so a `tests/` suite imports it without `web/node_modules` (`test-all.mjs` already does).

- [ ] **Step 1: Write the failing test**

```js
// tests/web-readme-run-kinds.test.mjs — web/README.md names each run kind's tools and the overlay keys.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pass, fail, ROOT } from './helpers.mjs';
import { toolScopeFor, toolNames } from '../web/src/lib/claude-invocation.mjs';
import { KNOWN_KINDS } from '../web/src/lib/worker-capabilities.mjs';

const readme = readFileSync(join(ROOT, 'web', 'README.md'), 'utf8');
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const kind of KNOWN_KINDS) {
  const allowed = toolNames(toolScopeFor(kind).allowed).join(', ');
  const row = new RegExp(`\\|\\s*\`${escape(kind)}\`\\s*\\|[^\\n]*${escape(allowed)}`);
  if (row.test(readme)) pass(`web/README.md Safety table names ${kind} with ${allowed}`);
  else fail(`web/README.md Safety table lacks a row for ${kind} listing ${allowed}`);
}
const scheduled = readme.slice(readme.indexOf('## Scheduled scans'), readme.indexOf('## Development'));
for (const marker of ['title_filter.negative', 'title_filter.positive', 'title_filter_full', 'always_allow', 'block_hard', 'io.career-ops.scheduled-scan']) {
  if (scheduled.includes(marker)) pass(`web/README.md Scheduled scans names ${marker}`);
  else fail(`web/README.md Scheduled scans does not name ${marker}`);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test-all.mjs --quick --only web-readme-run-kinds`
Expected: `fail` for every kind (no table) and for the six overlay markers.

- [ ] **Step 3: Edit the docs**

- `web/README.md` Safety: after the list ends at line 100 add a table `| Kind | Allowed tools | Network |` with one row per `KNOWN_KINDS` entry, tools in scope order as `toolNames` yields them (pdf: Read, Glob, Grep, none. research, evaluate, cover: Read, WebFetch, WebSearch, Glob, Grep, fetch. fix-portal: Read, WebFetch, WebSearch, Write, Edit, Bash, Glob, Grep, fetch and writes). One sentence after it: a run without `Bash` cannot execute `browser-extract.mjs` or `fetch-jd.mjs`, so `scan.extractor: cli` does nothing in a dashboard run and JD text comes from WebFetch.
- `web/README.md` Scheduled scans: one paragraph. "Each job carries its own title and location filters. At run time they replace `title_filter.negative` and the `location_filter` lists `allow`, `block`, `block_hard` and `always_allow` in `portals.yml` (an absent job list means none), and only `title_filter.positive` falls back to `portals.yml`. When `title_filter_full` exists it receives the same lists, so a full-sweep job never uses its own keywords. Editing `portals.yml` changes neither saved job." At lines 118-120: "`uninstall-scan-schedule.sh` removes only the agent or cron line the installer wrote (`io.career-ops.scheduled-scan`)."
- `docs/SCRIPTS.md:43`: append "Needs an agent run that holds `Bash`; the web dashboard's `evaluate` run does not, so the setting does nothing there." `:51`: append the overlay sentence. `:54`: the uninstall scope sentence.
- `docs/AUTOMATION.md:138-146`: the uninstall scope sentence plus "unload a recipe agent by hand with `launchctl bootout gui/$(id -u)/<label>`". `:83` and `:285`: `launchctl bootstrap gui/$(id -u) <plist>` with the matching `bootout` line under each.
- `docs/WEB_UI.md:51`: "Handles `SIGINT` and `SIGTERM` in the launcher (`scripts/ui-server.mjs`). `node web/server.mjs start`, the production entry, has no handler." (true upstream too, so it ships in this batch).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test-all.mjs --quick --only web-readme-run-kinds`
Expected: PASS.

- [ ] **Step 5: Deviations rows, commit, guard**

Extend the `web/README.md` row (PR-18) with "the Safety run-kind table and the Scheduled scans overlay paragraph; pinned by `tests/web-readme-run-kinds.test.mjs`". Extend the slice A row for `docs/WEB_UI.md` and the `ARCHITECTURE.md` row for `docs/AUTOMATION.md` ("uninstall scope sentence, `bootstrap`/`bootout` recipes; ADOPT upstream hunks, re-apply if upstream has not taken the PR"). Extend a `docs/SCRIPTS.md` row with the two sentences.

```bash
npm run lint && node test-all.mjs --quick
git commit -am "docs(web): name each run kind's tools and the scheduled-job filter overlay"
node test-all.mjs --quick --only fork-deviations-covered
```

Open the upstream PR from these hunks (web/README.md table and paragraph, SCRIPTS.md, AUTOMATION.md and WEB_UI.md sentences, the test). Body states no personal data was added and `node test-all.mjs` passed.

---

### Task 3: Scanner, geography and plugin docs (upstream candidate B)

Findings: F5, F19, F20, F21, F26 (upstream half), F27.

**Files:**
- Modify: `templates/portals.example.yml:160`, `:296`, `:740` (the comment line only; `:739` is the `  seniority_boost:` key that `onboard-write.mjs:291` and `:299` use as a block anchor and must not change)
- Modify: `docs/WORKPLACE_GEOGRAPHY.md` (paragraph before line 3, so the sentence ending in a colon at line 6 keeps its YAML block), `docs/KEEPING_PORTALS_LIVE.md` (new `## 5. Prune what has gone quiet`), `docs/PLUGINS.md:116` (table), `docs/CLAUDE_PLUGIN.md:36-38`, `modes/scan.md:232`
- Modify: `.claude/skills/upstream-review/SKILL.md`
- Test: `tests/plugins-doc-bundled.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// tests/plugins-doc-bundled.test.mjs — docs/PLUGINS.md lists every bundled plugin with its hooks and keys,
// and the template's seniority_boost comment names the scanners that ignore it.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pass, fail, ROOT } from './helpers.mjs';

const doc = readFileSync(join(ROOT, 'docs', 'PLUGINS.md'), 'utf8');
const start = doc.indexOf('### Bundled plugins');
const end = start === -1 ? -1 : doc.indexOf('\n## ', start);
const bundled = start === -1 ? '' : doc.slice(start, end === -1 ? undefined : end);
if (start === -1) fail('docs/PLUGINS.md has no "### Bundled plugins" table');
for (const id of readdirSync(join(ROOT, 'plugins')).filter((d) => !d.startsWith('_') && existsSync(join(ROOT, 'plugins', d, 'manifest.json')))) {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'plugins', id, 'manifest.json'), 'utf8'));
  const row = bundled.split('\n').find((line) => line.startsWith(`| \`${id}\``)) ?? '';
  if (row) pass(`docs/PLUGINS.md bundled table has a row for ${id}`); else fail(`docs/PLUGINS.md bundled table has no row for ${id}`);
  for (const name of [...(manifest.hooks ?? []), ...(manifest.requiredEnv ?? []), ...(manifest.optionalEnv ?? [])]) {
    if (row.includes(name)) pass(`${id} row names ${name}`); else fail(`${id} row does not name ${name}`);
  }
}
const template = readFileSync(join(ROOT, 'templates', 'portals.example.yml'), 'utf8');
const boost = template.slice(template.indexOf('  seniority_boost:') - 400, template.indexOf('  seniority_boost:'));
if (/scan\.mjs/.test(boost) && /scan-ats-full\.mjs/.test(boost)) pass('portals.example.yml says which scanners ignore seniority_boost');
else fail('portals.example.yml seniority_boost comment does not name scan.mjs and scan-ats-full.mjs');
```

Manifests carry `hooks` (array), `requiredEnv` (array) and, for `h1b-sponsor`, `optionalEnv` (array). The template check looks at the comment immediately above the key, so place the rewritten comment there.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test-all.mjs --quick --only plugins-doc-bundled`
Expected: `fail` for the missing table and the template comment.

- [ ] **Step 3: Edit the docs**

- `templates/portals.example.yml:160`: "Semantics (case-insensitive whole-word match, in this order)". Replace the comment line(s) directly above `  seniority_boost:` (line 740 and the key's own trailing comment if any) with "Read only by an agent running modes/scan.md by hand. scan.mjs and scan-ats-full.mjs ignore it. Use skip_tiers or positive keywords to filter by seniority." Leave the key line and its list untouched. Beside `portal_prune_quiet_days` (line 296) add a commented `portal_health_threshold: 3` with its one-line meaning (`stats.mjs` default). `modes/scan.md:232`: the same qualification in one clause.
- `docs/WORKPLACE_GEOGRAPHY.md`: one paragraph before line 3. Tier order (`workplace_policy`, `block_hard`, `always_allow`, `block`, `allow`, the worldwide-label rescue, `remote_title_fallback`), that a bare "Remote" location fails a non-empty `allow` unless `Remote` is listed or the title says remote, and that `always_allow: ["United States"]` expands to state names and codes. Point at `templates/portals.example.yml` for the full comment.
- `docs/KEEPING_PORTALS_LIVE.md`: `## 5. Prune what has gone quiet` with `node stats.mjs --prune --summary`, `portal_prune_quiet_days`, `portal_health_threshold`, and one line each for `data/portal-health.tsv` (written by `scan.mjs`) and `data/dead-boards.tsv` (written by `scan-ats-full.mjs`).
- `docs/PLUGINS.md:116`: a `### Bundled plugins` heading and a four-column table (`id`, hooks, env keys, what it does) for the four manifests, each row starting `| \`<id>\``.
- `docs/CLAUDE_PLUGIN.md:36-38`: in the precedence prose add the `.career-ops-data` marker between the environment variables and the plugin default, with the warning that the marker is read from the code folder (`path-resolver.mjs:116`), which a plugin update replaces, so plugin users set `CAREER_OPS_ROOT` instead. One sentence on `CLAUDE_CODE_PLUGIN_CACHE_DIR` and `CLAUDE_CONFIG_DIR`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node test-all.mjs --quick --only plugins-doc-bundled`, then `node test-all.mjs --quick --only onboard` (the `seniority_boost:` anchor still resolves), then `node test-all.mjs --quick --only scan-field-filters-parity`.
Expected: PASS on all three.

- [ ] **Step 5: Deviations row, commit, guard**

New row for `templates/portals.example.yml`, `modes/scan.md`, `docs/WORKPLACE_GEOGRAPHY.md`, `docs/KEEPING_PORTALS_LIVE.md`, `docs/PLUGINS.md` ("ADOPT upstream hunks, re-apply these comments and sections if upstream has not taken the PR; pinned by `tests/plugins-doc-bundled.test.mjs`"). Extend the slice A row for `docs/CLAUDE_PLUGIN.md`. `templates/portals.example.yml` is identical to upstream today, so this row is the one that makes the deviations guard pass after the commit.

```bash
npm run lint && node test-all.mjs --quick
git commit -am "docs(scan): state the location tier order, prune commands and the bundled plugin keys"
node test-all.mjs --quick --only fork-deviations-covered
```

Open the upstream PR from these hunks.

---

### Task 4: SCRIPTS.md flag drift and the fork entry points (upstream candidate C, plus a fork-only subsection)

Findings: F28, F6 (SCRIPTS half), F13 (install-latex-engine note).

**Files:**
- Modify: `docs/SCRIPTS.md` (the sections for the 14 scripts below, the `## pdf` section, the web/scripts rows, a new `## Fork entry points` subsection at the end, `:1893`)
- Modify: `.claude/skills/upstream-review/SKILL.md`
- Test: `tests/scripts-doc-flags.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// tests/scripts-doc-flags.test.mjs — every --help flag of these read-only scripts is in its docs/SCRIPTS.md section.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pass, fail, ROOT, NODE } from './helpers.mjs';

// Each handles --help before any side effect. build-dashboard.mjs (runs go build on any
// argv) and cv-templates.mjs (no --help branch) are deliberately absent.
const SCRIPTS = ['application-artifacts.mjs', 'clean-markers.mjs', 'eval-golden.mjs', 'gemini-eval.mjs', 'hired-wall-build.mjs', 'learn.mjs', 'linkedin-join.mjs', 'match-star.mjs', 'ollama-eval.mjs', 'openai-eval.mjs', 'openrouter-runner.mjs', 'session-activity.mjs', 'sponsor-check.mjs', 'story-provenance-check.mjs'];
const doc = readFileSync(join(ROOT, 'docs', 'SCRIPTS.md'), 'utf8');
const cwd = mkdtempSync(join(tmpdir(), 'co-scripts-doc-'));
const noRoot = join(cwd, 'no-such-data-root');
const section = (name) => {
  const heading = `\n## ${name.replace(/\.mjs$/, '')}`;
  const start = doc.indexOf(heading);
  if (start === -1) return '';
  const end = doc.indexOf('\n## ', start + heading.length);
  return doc.slice(start, end === -1 ? undefined : end);
};
for (const script of SCRIPTS) {
  let out = '';
  try { out = execFileSync(NODE, [join(ROOT, script), '--help'], { cwd, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CAREER_OPS_ROOT: noRoot } }); }
  catch (err) { out = `${err.stdout ?? ''}${err.stderr ?? ''}`; }
  const flags = [...new Set([...out.matchAll(/(?<![\w-])--[a-z][a-z0-9-]+/g)].map((m) => m[0]))];
  const text = section(script);
  const missing = flags.filter((flag) => !text.includes(flag));
  if (flags.length === 0) fail(`${script} --help printed no flags`);
  else if (!text) fail(`docs/SCRIPTS.md has no "## ${script.replace(/\.mjs$/, '')}" section`);
  else if (missing.length === 0) pass(`docs/SCRIPTS.md "${script}" section names every --help flag`);
  else fail(`docs/SCRIPTS.md "${script}" section lacks flags: ${missing.join(' ')}`);
}
if (existsSync(noRoot)) fail('a --help run created the nonexistent data root'); else pass('no --help run touched a data root');
rmSync(cwd, { recursive: true, force: true });
```

Check the actual `## <name>` heading each script uses in SCRIPTS.md before relying on `section()`; adjust the heading derivation if a section is named differently (for example `## openai-eval` versus `## openai-eval.mjs`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test-all.mjs --quick --only scripts-doc-flags`
Expected: `fail` for the 14 scripts with the flags listed in F28, `pass` on the data-root check. Measured by the reviewer at about 4 s for the loop.

- [ ] **Step 3: Edit `docs/SCRIPTS.md`**

Add each missing flag to its script's own section with one clause of meaning taken from the `--help` text (the list is in F28 and in the research folder's `scripts-doc-flags.mjs` output). In `## pdf` add a row for `generate-pdf.mjs --pdf-server` and `CAREER_OPS_PDF_SHARED` (the long-lived renderer `web/server.mjs` starts). Add a row for `web/scripts/uninstall-scan-schedule.ps1` beside the `.sh` uninstall row (upstream ships the file and never names it). At `:1893` (install-latex-engine) append "In a container with a read-only image root this path is not writable; use `cv.output_format: html`." Add `## Fork entry points` at the end: `node web/server.mjs start` (the production web entry, see `deploy/README.md`) and `node publish/share.mjs` (the share CLI, see `publish/README.md`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test-all.mjs --quick --only scripts-doc-flags`
Expected: PASS for all 14 and the data-root check.

- [ ] **Step 5: Deviations row, commit, guard**

Extend a `docs/SCRIPTS.md` row: "the added flags, the `--pdf-server` and `.ps1` rows and the `## Fork entry points` subsection; ADOPT upstream hunks, ours stay, a conflict keeps both (append-only shared file); pinned by `tests/scripts-doc-flags.test.mjs`".

```bash
npm run lint && node test-all.mjs --quick
git commit -am "docs(scripts): add the --help flags the reference omits and the fork entry points"
node test-all.mjs --quick --only fork-deviations-covered
```

The flag additions, the `--pdf-server` row, the `.ps1` row and the test are the upstream PR. The fork subsection stays here.

---

### Task 5: Shares error strings name the environment (fork-only, code)

Finding: F7 (UI half).

**Files:**
- Modify: `web/src/app/api/shares/pull/route.ts:58`, `:60`
- Modify: `web/src/components/shares/shares-view.tsx:42`
- Test: `web/tests/lib/shares.test.mjs:165-193` (the pull-route error cases)

- [ ] **Step 1: Install web dependencies once and write the failing assertions**

Run: `npm --prefix web ci` (this worktree has no `web/node_modules`). In `web/tests/lib/shares.test.mjs`, in the 401 and 403 cases at lines 167-168 and the "is not set" case at line 189, add `assert.match(body.error, /environment/)` beside the existing regex assertions (follow the test's own variable names).

- [ ] **Step 2: Run the web suite to verify it fails**

Run: `npm --prefix web test -- tests/lib/shares.test.mjs`
Expected: the three new assertions fail.

- [ ] **Step 3: Change the three strings**

`route.ts:58`: "the publish service refused PUBLISH_API_KEY; check the environment or the data root's .env". `route.ts:60`: "PUBLISH_URL or PUBLISH_API_KEY is not set in the environment or the data root's .env". `shares-view.tsx:42`: "check PUBLISH_URL in the environment or the data root's .env".

- [ ] **Step 4: Verify and commit**

Run: `npm --prefix web test && npm --prefix web run typecheck`. Expected: pass.

```bash
git commit -am "fix(web): shares errors name the environment as the first place PUBLISH_* is read"
```

The deviations table already names `web/src/app/shares` and `web/src/components/shares` as program-owned paths. No new row.

---

### Task 6: Smoke compose reproduces the read-only root (fork-only, config)

Finding: F9 (compose half).

**Files:**
- Modify: `deploy/compose.yml`
- Test: `tests/server-image.test.mjs` (two checks added; `read` and `check` are defined at lines 12-16 and `compose` is the raw file string)

- [ ] **Step 1: Write the failing checks**

After the port check add `check(/read_only:\s*true/.test(compose), 'deploy/compose.yml runs the smoke container with a read-only root')` and `check(compose.includes('/app/web/.next/cache'), 'deploy/compose.yml gives .next/cache a writable mount')`.

- [ ] **Step 2: Run to verify they fail**

Run: `node test-all.mjs --quick --only server-image`
Expected: FAIL on both new checks.

- [ ] **Step 3: Edit `deploy/compose.yml`**

Add `read_only: true` to the service, and `tmpfs` entries for `/home/app` and `/app/web/.next/cache` beside the existing `/tmp` one.

- [ ] **Step 4: Run the smoke stack**

Run (needs Docker): `CAREER_OPS_SMOKE_ROOT=/tmp/career-ops-smoke docker compose -f deploy/compose.yml up -d && curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: localhost' http://127.0.0.1:3000/api/version`
Expected: `200`, and `docker compose -f deploy/compose.yml exec career-ops-web ps -ef` lists `generate-pdf.mjs --pdf-server`. If `next start` fails on a write elsewhere, drop `read_only: true`, keep the tmpfs lines, remove the first new check, and add one sentence to `deploy/README.md` naming the path that needed writing. Stop the stack afterwards.

- [ ] **Step 5: Run the test to verify it passes, commit, guard**

Run: `node test-all.mjs --quick --only server-image`. Expected: PASS.

```bash
git commit -am "build(deploy): smoke compose runs the server image with a read-only root"
node test-all.mjs --quick --only fork-deviations-covered
```

Extend the `deploy/` deviations row (PR-16/17) with "compose `read_only` and the two tmpfs mounts".

---

## Order and grouping

Task 1 first (it is what the operator reads tonight). Tasks 2, 3 and 4 are independent of each other and of Task 1 except for the `docs/DEPLOYMENT.md` anchor links, which can be added after Task 1 lands. Tasks 5 and 6 are independent small changes. Upstream pull requests: one each from Tasks 2, 3 and 4 (flags, `--pdf-server` and `.ps1` rows only), opened from a branch that carries only those hunks against `careerops/main`, body stating no personal data was added and `node test-all.mjs` passed. Whether each batch applies cleanly to `careerops/main` given the fork hunks already in those files was not checked; `git merge-tree` on the batch branch answers it before the PR is opened. Everything else stays in the fork.

## Not in this plan

- Any change to the cluster, the home-cluster manifests, `portals.yml` or `scheduled-jobs.json`. The operator checks the two scheduled jobs' filter lists by hand (F4) and decides how an Ashby JD reaches a dashboard evaluate (F3). Both are operator calls recorded in the findings' Open questions.
- Excluding `.claude/rules/` and `.claude/agents/` from the server image (F31). A dashboard worker runs with the data root as cwd and no `--add-dir`, so the files are dead weight, not loaded guidance. Two `.dockerignore` lines would be image hygiene only; add them if a future change gives a worker the code root as cwd.
- A third scheduler engine for portal health or the follow-up sweep (F16), and a web plugin surface (F15). Both are features, each needs an issue first.
- The web PDF route's truncated error output (lane 6). It is being fixed separately and no reviewed doc claims otherwise.

## Review log

An independent reviewer (opus, read-only) checked the first draft of this plan against the code on 2026-11-08 and found 3 blockers, 11 should-fix and 7 nits. All were verified by the author against the code and folded in:

- `toolScopeFor(kind).allowed` is a string; the test now uses `toolNames()` and iterates `KNOWN_KINDS`.
- `build-dashboard.mjs` runs `go build` on any argv and `cv-templates.mjs` has no `--help` branch; both left Task 4's list, which now runs in a temp cwd with piped stderr and asserts per section.
- Every pod `claude -p` runs with the data root as cwd, so the former Task 7 (exclude `.claude/rules` from the image) lost its premise and became a sentence in Task 1 plus a Not in this plan entry.
- Manifests use `hooks`, `requiredEnv` and `optionalEnv`; the plugins test asserts inside the bundled table.
- `onboard-write.mjs` anchors on the literal `  seniority_boost:` line, so Task 3 edits the comment line only.
- `--no-overwrite-dir` keeps directory metadata and deletes nothing; the migration text now separates `COPYFILE_DISABLE=1` (prevent), `--no-overwrite-dir` (extract past the mount point) and deleting `._*` files already copied.
- `.env` is also read by `lib/browser-launch.mjs`, `doctor.mjs`, `lib/agent-cli.mjs` and the key-based evaluators; the `.env` section names them.
- `title_filter_full` receives the job's lists too (runner line 166); the overlay text and the test name it.
- `DOCKER.md` is upstream-shipped and already has a row; the `SUPPORTED_CLIS.md:21` sentence is a fork hunk and moved to Task 1; the `WEB_UI.md` clause is true upstream and moved to Task 2; `.ps1` is an upstream gap and moved to the upstream batch.
- The deviations guard diffs committed history, so every task runs it after its commit; `templates/portals.example.yml` is the one newly diverged path and Task 3's row covers it.
- Line anchors corrected (`deploy/README.md` paragraph after line 31, `WORKPLACE_GEOGRAPHY.md` paragraph before line 3, `web/README.md` table after line 100, `CLAUDE_PLUGIN.md:36-38`).
- Gaps closed: F26's fork half (`--channel main`), F6's AUTOMATION pointer and run-history sentence, F18's `doctor.mjs` warning, the `fix-portal` line, and the `web/tests/lib/shares.test.mjs` assertions for Task 5.
- The Ashby and token-lifetime statements are worded as reported, not measured.

Not re-reviewed after the edits. Not checked by anyone: the Task 6 smoke stack (needs Docker) and whether the three upstream batches apply cleanly to `careerops/main`.
