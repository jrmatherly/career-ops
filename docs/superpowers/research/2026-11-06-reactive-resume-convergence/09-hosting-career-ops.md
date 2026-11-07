# Hosting career-ops on Kubernetes: image, locks, scheduling, auth

Subagent research report, 2026-11-06. Model output: claims carry file:line evidence or are labelled inference; verify against the code before relying on one.

## Overview

The repo ships a dev-only container image and a web app that was built to sit on loopback. Neither was meant to run as a cluster service. Most of the pieces are already there. The web binds 0.0.0.0 when you name a hostname. The data root splits from the code root. CLIs inherit the pod env. The 15-minute scheduled-scan runner is a plain script. Four things are missing or break:

1. An image that contains the code, the built web app and an AI CLI.
2. A cross-pod-safe way to run scheduled scans. The file locks judge staleness by PID, so a second pod can steal a lock that is still held.
3. A health route.
4. The headed apply browser.

The topology that needs zero code changes is one pod. The web pod does every write. A tiny CronJob only POSTs to the web's existing `/api/scheduler` trigger.

## Key Concepts

- **Code root vs data root.** The core resolves the data root as `CAREER_OPS_ROOT` / `CAREER_OPS_DATA_DIR`, then the marker file, then the repo (AGENTS.md "Path Resolution"). The web follows the same precedence and also takes `CAREER_OPS_CODE_ROOT` (web/README.md:144-147, web/src/lib/career-ops.ts:33-75, web/src/lib/core/code-root.mjs:8-12). `server.mjs` pins cwd to `web/`, so the code root is `web/..` (web/server.mjs:89-91, 99).
- **The guard.** `src/proxy.ts` runs `checkRequest` on every route except build assets (web/src/proxy.ts:23-35, 45). It has no authentication. It filters Host and checks for CSRF, nothing more.
- **dir-lock.** This is the one lock protocol used by the tracker, pipeline.md, the scheduled-jobs store and the portal-health lock (lib/dir-lock.mjs:21-37, pipeline-lock.mjs:11-16, tracker-utils.mjs:16-18, web/src/lib/scheduled-jobs-store.mjs:12, 108-123). It uses an atomic `mkdir` and records `owner.json` with only `{pid, token, started_at}` (lib/dir-lock.mjs:582-586).

## How It Works

### 1. The existing image

- **Base.** `mcr.microsoft.com/playwright:v1.64.1-jammy`, pinned by digest (Dockerfile:6). On top of it go apt `git tini latexmk texlive-*` and Go 1.27.2 (Dockerfile:20-37).
- **Contents.** Only the root `package.json` and lockfile are copied, then `npm install` runs (Dockerfile:43-45). The comment says sources are not copied because "The rest of the project is bind-mounted at runtime" (Dockerfile:47-49).
  - No `web/` deps are installed.
  - No `next build` runs.
  - `.dockerignore` also drops `**/node_modules` and `web/.next` (.dockerignore:4, 47).
  - The image cannot serve the web as built.
- **Entrypoint and command.** `ENTRYPOINT ["/usr/bin/tini","--"]`, `CMD ["bash"]` (Dockerfile:51-52). Compose overrides it with `tail -f /dev/null` (docker-compose.yml:11).
- **Ports and volumes.** No ports are exposed. Volumes are `.:/app` plus a named volume for `node_modules`, with `shm_size: 1gb` (docker-compose.yml:16-18, 27-28).
- **Env.**
  - `NODE_ENV=development`, `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` (Dockerfile:8-12).
  - Compose forwards `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (docker-compose.yml:19-25).
- **AI CLI.** None. DOCKER.md:13 says "The image has no AI coding CLI."
  - Agent modes run on the host CLI (DOCKER.md:13-19).
  - `batch/batch-runner.sh` "can't run inside the container at all" (DOCKER.md:20-21).
- **CI.** It publishes `ghcr.io/jrmatherly/career-ops` for amd64 and arm64 on main pushes that touch the Dockerfile or deps (.github/workflows/docker-image.yml:15-25, 44-47).
- **What DOCKER.md says about web and data roots.**
  - DOCKER.md does not mention the web at all. Its data story is "Everything under the project root is on your host filesystem" via the bind mount (DOCKER.md:106-114).
  - The container guidance for the web is in web/README.md:236-243. The bind must be 0.0.0.0, and you get it by naming a hostname in `CAREER_OPS_WEB_ALLOWED_HOSTS`.

### 2. Binding and access control

**Bind.** `server.mjs` reads `CAREER_OPS_WEB_ALLOWED_HOSTS` from the process env, not from `.env.local` (web/server.mjs:24-28, web/README.md:159-162). `resolveBindHost` decides the bind (web/src/lib/bind-host.mjs:246-253):

- Only loopback names, or the variable unset, gives `127.0.0.1`.
- Exactly one IP literal binds that IP.
- Anything containing a hostname gives `0.0.0.0`.

These values are refused:

- `0.0.0.0` and `::` (bind-host.mjs:171-181).
- Switch-like values such as `on` or `true` (bind-host.mjs:162-170).
- URLs (bind-host.mjs:200-208).

There is no separate bind var. Passing `-H` makes Next choose the bind, and the launcher warns about it (bind-host.mjs:286-291, 332; server.mjs:37-57). For a pod, use `CAREER_OPS_WEB_ALLOWED_HOSTS="career.example.com career-ops-web"`, which binds 0.0.0.0.

**Guard inputs.** The guard reads exactly three headers: `sec-fetch-site`, `origin` and `host` (web/src/proxy.ts:24-30). It never reads `X-Forwarded-*` (a grep for `x-forwarded` in web/src returns nothing). The decision order (web/src/lib/origin-guard.mjs:134-177):

1. **Host filter.** The Host must be loopback or listed in the allow-list, with the port stripped (lines 137-144).
2. **Origin allow-list.** `CAREER_OPS_ALLOWED_ORIGINS` passes listed origins (150-152).
3. **Fetch Metadata.** `Sec-Fetch-Site` must be `same-origin` or `none`. Anything else, `same-site` included, gets a 403 (158-161).
4. **Fallback.** With no `Sec-Fetch-Site`, a request with no Origin passes. An Origin must match the raw Host (166-176).

**Behind Envoy Gateway with OIDC to Pocket ID.**

- **TLS and forwarded headers do not trip the guard.** Envoy keeps Host by default unless an HTTPRoute rewrites the hostname (inference, Gateway API default). Origin `https://career.example.com` then compares equal to Host `career.example.com` at origin-guard.mjs:169-173. X-Forwarded-Proto and the other forwarded headers are ignored. No Next.js server actions exist (`grep "use server"` returns nothing), so Next's own origin check never runs. next.config.mjs sets no trusted-proxy options (web/next.config.mjs:7-20).
- **Gotcha: the first page after login is likely a 403.** After the Pocket ID login, Envoy handles the callback and 302s back to the original URL. Per the Fetch Metadata spec, a navigation whose redirect chain began on another site carries `Sec-Fetch-Site: cross-site`, or `same-site` when both hosts share a registrable domain. Line 160 blocks both, so the user gets a JSON 403 and a manual reload (`none`) works. The same 403 hits any link into the app from another site, such as a share page or an email. This is inference from the spec and the code. Settle it by logging in once through the gateway and checking the response.
  - Zero-code workaround: drop the `Sec-Fetch-Site` request header at the HTTPRoute with a `RequestHeaderModifier`. The guard then uses the Origin==Host fallback, which still refuses a cross-origin POST because browsers send Origin on it.
  - Small-code alternative: let GET requests with `Sec-Fetch-Mode: navigate` through in `checkRequest`.
- **Gotcha: the guard is not access control against other pods.** origin-guard.mjs:36-37 says a direct client "spelling `Host: localhost` satisfies the filter". Any pod that can reach the pod IP bypasses the gateway's OIDC. A NetworkPolicy that admits only the Envoy proxy pods, plus the trigger CronJob below, is mandatory.
- **Probes.** A kubelet httpGet probe sends `Host: <podIP>:<port>` by default, so it gets a 403. Set `httpHeaders: [{name: Host, value: localhost}]` or use a tcpSocket probe.
- **Timeouts.** The `/api/run` SSE stream can run up to `maxDuration = 800` s (route.ts:32). It sends a keepalive every 10 s because measured silences reached 149 s and "a proxy" dropped the connection (route.ts:355-364). Set the HTTPRoute `timeouts.request` to cover 800 s. My recollection is that Envoy's own default route timeout is 15 s. I did not check what Envoy Gateway defaults to, so check `kubectl get httproute -o yaml` or the Envoy config dump.

### 3. Scheduled scans

**What runs today.** Nothing in the app schedules anything. A host scheduler runs `web/scripts/scheduled-jobs-runner.mjs` every 15 minutes:

- On macOS, a launchd agent. On Linux, a crontab line with the `*/15` cadence and a marker (web/scripts/install-scan-schedule.sh:1-3, 150-176).
- The installer refuses to run as root (install-scan-schedule.sh:9-12).
- The installed command also does `touch $STORE.tick` (install-scan-schedule.sh:85).

Each tick of the runner:

1. Takes the `scheduled-jobs.json.runner` lock with a 1 s timeout, so a second tick exits idle (scheduled-jobs-runner.mjs:296-327).
2. Enqueues due jobs and claims one (32-90).
3. Writes a temporary portals overlay to `data/tmp/` (145-180).
4. Spawns `scan.mjs --since N --quiet` for the `portals` engine, or `scan-ats-full.mjs ... --json` (112-130), with `CAREER_OPS_ROOT` and `CAREER_OPS_PORTALS` set (200-218). The timeout is 25 min, with up to 3 attempts (22-24, 189-255).
5. Records the result back into the store (257-282).

The store path is `data/scheduled-jobs.json`, or `CAREER_OPS_SCHEDULED_JOBS_PATH` (web/src/lib/scheduled-runner-path.mjs:6-9).

**UI status.**

- On Linux, `schedulerStatus()` shells `crontab -l` (web/src/lib/scheduler-status.ts:41-48). It reports "installed" only when the marker line exists (scheduled-os-schedule.mjs:7-11, 27-36).
- `lastRun` is the mtime of `.tick` (scheduler-status.ts:30-35).
- In a pod with no crontab, the page shows "not installed" and no last run. This is cosmetic only.
- `running` comes from the runner lock (scheduler-status.ts:103-108).

**A web-side trigger already exists.** `POST /api/scheduler` spawns the runner detached, with cwd set to the code root, and returns 202 (web/src/app/api/scheduler/route.ts:19-48). Manual runs go through `/api/scheduled-jobs/[id]/run`.

**There is no in-process scheduler.** The only `setInterval` calls are SSE heartbeats (run/route.ts:364, apply/planner.ts:112), and there is no `instrumentation.ts`.

**Why a scan CronJob in its own pod is unsafe.** `lockRecoveryVerdict` calls `process.kill(owner.pid, 0)` and declares the lock STALE when that pid is not alive (lib/dir-lock.mjs:213-221, 271-281). Two pods have separate PID namespaces.

- A CronJob pod therefore sees the web pod's live lock as stale. It deletes the lock and both write `pipeline.md` or `scan-history.tsv` concurrently.
- That is the silent lost-offer race pipeline-lock.mjs:3-9 exists to prevent.
- The reverse case is a lock that never clears. A pid that happens to be alive in the other namespace keeps a crashed holder's lock LIVE indefinitely.
- The same applies on one node with a local-path PVC, and on NFS. `mkdir` atomicity holds on a local filesystem, and generally on NFS, but owner identity does not. The owner stamp carries no hostname (dir-lock.mjs:582-586).
- These are inferences from the code. They are not reproduced.
- The same PID-reuse hazard exists across restarts of a single pod, because container PIDs are small and repeat. A lock left by a crashed web process can read as LIVE when the new process tree reuses that pid. This is inference.

**Which is smaller and safer.** Keep every writer in the web pod's PID namespace:

- A CronJob running `curl -X POST -H 'Host: career-ops-web' http://career-ops-web:3000/api/scheduler` needs zero code changes.
- That request has no Origin and no Sec-Fetch-Site, and its Host is on the allow-list, so it passes origin-guard.mjs:166.
- The runner becomes a child of the web container. tini is PID 1 and reaps it (Dockerfile:51).

The alternative is a sidecar container in the same pod with `shareProcessNamespace: true`, looping `node web/scripts/scheduled-jobs-runner.mjs; sleep 900`. It is also safe, but it is more YAML. A separate scan pod should only come after a code change that adds a hostname or pod identity to `owner.json` and treats a foreign owner as LIVE until age-out.

**Browser need.**

- `scan.mjs` and `scan-ats-full.mjs` import Playwright lazily, and only under `--verify` (scan.mjs:4303-4361) or `--liveness` (scan-ats-full.mjs:1202-1213).
- The runner passes neither flag (scheduled-jobs-runner.mjs:117-129), so scheduled scans are HTTP-only.
- `scan-interamt.mjs:21` and `scan-dayforce.mjs:65` import Playwright statically, but the runner never calls them.
- The web pod still needs Chromium for PDFs. `server.mjs` starts `generate-pdf.mjs --pdf-server` (web/server.mjs:100-116) on a Unix socket in `tmpdir()/co-pdf-<uid>` (lib/pdf-server.mjs:31). So keep the Playwright base for the one image.

### 4. Headless AI runs

**Choosing a CLI.**

- `resolveCliOrFallback(id)` uses the requested CLI if installed, otherwise the remembered one, otherwise the only installed one (web/src/lib/clis.ts:171-183, cli-pick.mjs:54-59).
- `CAREER_OPS_CLI` is read from the data root's `.env`, which `remember-cli.mjs` writes (remember-cli.mjs:27-33).
- "Installed" means `findBin` found the binary. It searches `~/.local/bin`, `~/.npm-global/bin`, `~/.opencode/bin`, `/usr/local/bin`, `/usr/bin` and `$PATH` (clis.ts:80-105, 126-145).
- The registry lists claude, codex, gemini, opencode, pi, copilot, qwen, agy, grok, hermes and omp (clis.ts:63-77).

**Spawn and env.**

- `spawnHeadlessCli(binPath, args, { cwd: careerOpsRoot(), env: process.env }, { cliId, capabilities })` is called at run/route.ts:231-235. The pod env passes through untouched, and stdin is closed (spawn-cli.mjs:71-72).
- Claude's argv is `-p … --output-format stream-json --permission-mode acceptEdits`, with per-kind allow and deny tool lists. Read-only kinds also get `--strict-mcp-config` (claude-invocation.mjs:156-169, 78-88).
- Codex gets `-c sandbox_mode=…`, `--ask-for-approval never` (cli-fencing.mjs:108, 129-131).
- Only Hermes is refused for write-capable kinds (cli-fencing.mjs:54-56).

**Claude Code auth with no browser.** From https://code.claude.com/docs/en/authentication:

- Precedence is cloud provider vars, then `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `apiKeyHelper`, `CLAUDE_CODE_OAUTH_TOKEN`, profiles, and `/login` last.
- In `-p` mode "the key is always used when present".
- `claude setup-token` generates "a one-year OAuth token". It needs Pro, Max, Ultra, Team or Enterprise, and is set as `CLAUDE_CODE_OAUTH_TOKEN` "for CI pipelines and scripts where browser login isn't available".
- Bare mode does not read it.
- On Linux, credentials and config live under `~/.claude` (or `CLAUDE_CONFIG_DIR`).

This repo already documents `setup-token` for batch (docs/RUNNING_ON_A_BUDGET.md:83-90, README.md:383).

Container consequences:

- Put exactly one of `CLAUDE_CODE_OAUTH_TOKEN` (subscription) or `ANTHROPIC_API_KEY` (per token) in a Secret. The API key wins when both are present.
- Give the process a writable HOME or `CLAUDE_CONFIG_DIR`.
- Set `DISABLE_AUTOUPDATER=1`. The docs say native installs auto-update in the background.

**Installing Claude.** https://code.claude.com/docs/en/setup lists `npm install -g @anthropic-ai/claude-code`, which requires Node 22+, ships a native binary and supports linux-x64 and linux-arm64. It also lists `curl -fsSL https://claude.ai/install.sh | bash` and an apt repo. The image has none of these today (DOCKER.md:13). Install to `/usr/local/bin` so `findBin` sees it.

**Codex and OpenCode.**

- These are not verified in this pass. Settle them by checking the Codex CLI auth docs (likely an `OPENAI_API_KEY` or `CODEX_API_KEY` exec login) and OpenCode's provider-key docs.
- Codex fencing was "Measured on codex-cli 0.146.0 (macOS)" (cli-fencing.mjs:63). Its Linux sandbox inside an unprivileged pod is unmeasured. Treat Codex as a second choice until it is run in the pod.

**#2876 permission rules.**

- The web path passes no blanket auto-approve flag. It uses `acceptEdits` plus deny lists (claude-invocation.mjs:163).
- Running in a container changes nothing there.
- `batch/batch-runner.sh` and `batch-tailor.mjs` are the known exceptions that pass such a flag (AGENTS.md "Headless worker permissions"). Keep batch off the cluster.

### 5. Features that cannot move, or degrade

- **Apply.** `headedBrowser()` launches `{channel:'chrome', headless:false}`, then falls back to bundled Chromium with `headless:false` (web/src/lib/apply/session.ts:142-157; apply-scope.mjs:85-94).
  - The image has no X server and no `DISPLAY`. Both launches fail and the user sees the misleading "The apply feature needs Google Chrome" error (session.ts:155).
  - That outcome is inference. Settle it by running the apply flow once in the pod.
  - Running it under xvfb might work, but I did not verify it. Keep apply local.
- **Host scheduler.** launchd and crontab status and install scripts do not apply in a pod (scheduler-status.ts:38-61, install-scan-schedule.sh). The status display is cosmetic, as covered in section 3.
- **`open` / `xdg-open`.** Used by `hired-share.mjs:320` and `scripts/ui-server.mjs:163`. These are CLI conveniences and stay local.
- **Claude usage page.** It scans `~/.claude/projects/**/*.jsonl` (web/src/lib/claude-usage-scan.mjs:4, 24). It will show only runs from the pod, not from the Mac.
- **Agent-driven apply modes and Canva MCP.** They need the Playwright MCP or Canva MCP in the agent config. doctor warns "Playwright MCP tools not detected" (observed in a `node doctor.mjs --json` run here). Writing kinds load the user's MCP config (claude-invocation.mjs:164-169). Keep them local.
- **Batch mode.** Stays local (DOCKER.md:20-21; #2876).

### 6. Data root persistence

**Pages read on every request.** Pages are force-dynamic and read the tracker and other files on each request (proxy.ts:37-41). Tracker reads are mtime-cached (career-ops.ts:185-203).

**Written on actions, not on every request.**

- `.career-ops-web/runs/{id}.md`, `chats/`, `cv-studio/`, `pdf-tmp/` (assistant-preamble.mjs:13, assistant-chat-store.mjs:12, 60; cv-studio/server.ts:77; pdf-paths.mjs:88).
- `data/pdf-index.tsv`, `data/scheduled-jobs.json` and the tracker, which is written through `set-status.mjs` and `merge-tracker` (run-registry.ts:11-15).

**Written by scans.** `data/pipeline.md`, `data/scan-history.tsv`, `data/scan-runs.tsv` and `data/tmp/`.

**Cold.** `cv.md`, `config/`, `modes/_*.md`, `portals.yml`, `reports/`, `jds/`.

**Filesystem assumptions.**

- Locks need atomic `mkdir` and `rename` (dir-lock.mjs:21-22, scheduled-jobs-store.mjs:82-87).
- Owner liveness is the local PID namespace (section 3).
- The tracker lock name is a hash of the canonical tracker path (tracker-utils.mjs:568-573), so every process must mount the root at the same path.
- The web also holds an in-memory tracker-write registry. It says "The web is a single local Node process" (web/src/lib/core/run-registry.ts:1-15).
- Together these mean one replica and `strategy: Recreate`. A RollingUpdate overlap puts two processes, in two PID namespaces, on one data root.
- A local-path or RWO block PVC is fine for one pod. NFS adds nothing but risk.

**Backup.** No helper script exists. `docs/BACKUP_STRATEGIES.md` gives three manual patterns:

- A private git repo with a cron `git add -A && git commit && git push` (lines 79-111).
- rclone (141).
- restic (161).

It also has a secret-scan `git grep` before committing (89). The image already has `git` (Dockerfile:25), so a nightly CronJob could do it. That CronJob must not write while the web writes. Commit-only reads are safe against the locks, but `git add` and `commit` touch only `.git`.

### 7. Health and readiness

- There is no health route. A grep for `health` in web/src/app only hits the portals page and the doctor route.
- `/api/doctor` spawns `doctor.mjs --json` with a 10 s timeout and always returns 200, with `available:false` on failure (web/src/app/api/doctor/route.ts).
- `/api/version` is cheap but runs `git rev-parse` (version/route.ts:28-36, 47-58).
- `doctor.mjs --json` exits 0 even with `onboardingNeeded: true`. I observed exit 0 and about 120 ms here. It suits a startup check or a dashboard, not a readiness gate.
- For probes, use `GET /api/version` with `Host: localhost`, or a tcpSocket check on 3000.

## Where Things Live

- `Dockerfile`, `docker-compose.yml`, `DOCKER.md`, `.github/workflows/docker-image.yml`. The image.
- `web/server.mjs`, `web/src/lib/bind-host.mjs`, `web/src/proxy.ts`, `web/src/lib/origin-guard.mjs`. Bind and guard. web/README.md:144-260 is the exposure doc.
- `web/scripts/scheduled-jobs-runner.mjs`, `web/src/app/api/scheduler/route.ts`, `web/src/lib/scheduler-status.ts`, `web/scripts/install-scan-schedule.sh`. Scheduling.
- `lib/dir-lock.mjs`, mirrored byte-for-byte to `web/src/lib/core/dir-lock.mjs` (dir-lock.mjs:15-19). Locks.
- `web/src/lib/clis.ts`, `claude-invocation.mjs`, `cli-fencing.mjs`, `spawn-cli.mjs`, `web/src/app/api/run/route.ts`. CLI runs.
- `web/src/lib/apply/session.ts`, `apply-scope.mjs`. The headed apply browser.

## Gotchas

- The post-login 403 from `Sec-Fetch-Site` (section 2) is the most likely first-day surprise.
- Without a NetworkPolicy, the gateway's OIDC is bypassable from inside the cluster (origin-guard.mjs:36-37).
- Chromium needs a large `/dev/shm`. Compose sets 1 GB (docker-compose.yml:26-27). In a pod, mount an `emptyDir` with `medium: Memory` at `/dev/shm`.
- The image runs as root (DOCKER.md:143-147). Files on the PVC end up root-owned unless you set `runAsUser`. The Playwright image has a non-root user, but I did not verify which uid it has.

## Recommended topology (single operator)

**Image.** Build one `career-ops-server` image, either as a new Dockerfile or a target. Fork-local file placement follows the dev-workflow rule. The image:

- Copies the repo into `/app`.
- Runs `npm ci` at the root and in `web/`.
- Runs `npm run build` in `web/`.
- Runs `npm i -g @anthropic-ai/claude-code`.
- Uses `ENTRYPOINT tini`, `CMD ["node","web/server.mjs","start"]` and `NODE_ENV=production`.

**Deployment `career-ops-web`.**

- 1 replica, `strategy: Recreate`, container port 3000.
- Env:
  - `CAREER_OPS_ROOT=/data`.
  - `CAREER_OPS_WEB_ALLOWED_HOSTS="career.<domain> career-ops-web"`.
  - `CAREER_OPS_CLI=claude`. It can also stay in `/data/.env`.
  - `HOME=/home/app`, writable, so `~/.claude` persists on a PVC subPath. Otherwise keep it on an emptyDir and accept the loss of usage history.
  - `DISABLE_AUTOUPDATER=1`.
- Secret: `CLAUDE_CODE_OAUTH_TOKEN`, or `ANTHROPIC_API_KEY`. Never both.
- Volumes:
  - PVC (RWO, local-path or Longhorn) at `/data`.
  - emptyDir at `/tmp`.
  - Memory emptyDir at `/dev/shm`.
- Probes: httpGet `/api/version` with a `Host: localhost` header.

**Service, HTTPRoute and SecurityPolicy.**

- ClusterIP `career-ops-web:3000`.
- An HTTPRoute with `timeouts.request ≥ 900s`, and optionally a `RequestHeaderModifier` that removes `Sec-Fetch-Site`.
- An Envoy Gateway OIDC SecurityPolicy against Pocket ID.

**NetworkPolicy.** Allow ingress to the web only from the Envoy proxy pods and the trigger CronJob. Egress is open for job boards and the Anthropic API.

**CronJob `career-ops-scan-tick`.** Schedule `*/15 * * * *`, curl image, `concurrencyPolicy: Forbid`. It runs `curl -fsS -X POST -H 'Host: career-ops-web' http://career-ops-web:3000/api/scheduler`. The web pod runs the existing runner, which runs `scan.mjs` / `scan-ats-full.mjs`.

**Optional backup CronJob.** A nightly git push of `/data` per BACKUP_STRATEGIES.md Pattern 1. Mount the PVC read-only except `.git`, or run it as an exec into the web pod. Either way it shares the RWO volume, so it must land on the same node.

**Kept on the Mac.** Apply (headed browser), batch mode, agent modes needing the Playwright or Canva MCP, `hired-share --open`, and the dashboard TUI.

## career-ops code changes this needs

**Required: none for the core topology.** The new image file is packaging, not code.

**Recommended, small:**

1. A `/api/healthz` route that touches nothing. It replaces the git-calling `/api/version` probe.
2. Let `Sec-Fetch-Site: same-site/cross-site` through on `GET` + `Sec-Fetch-Mode: navigate` in `checkRequest`, instead of stripping the header at the gateway.
3. Teach `schedulerStatus()` an env-declared external schedule, so the page does not read "not installed". The runner, or the trigger route, would `touch .tick`.

**Only if scans must move to their own pod:** add a host or pod identity to dir-lock's `owner.json`, and treat a foreign-host owner as LIVE until age-out. This is in lib/dir-lock.mjs plus the web mirror. It also fixes PID reuse after a restart.

I did not check Codex or OpenCode container auth, Envoy Gateway's default timeout or OIDC cookie SameSite, or apply under xvfb. The 403 after login and the cross-pod lock stealing are inferred from the code and the Fetch Metadata spec, not reproduced. The lock finding is the risk to keep in mind: do not run a scan CronJob in a separate pod against the shared data root.
