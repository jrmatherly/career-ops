# Running career-ops as a hosted pod (this fork)

This page is the container and cluster path of the `jrmatherly/career-ops`
fork. Upstream career-ops is a local-first CLI tool, and every other page in
`docs/` describes that. The fork also runs the web dashboard as a pod built
from `deploy/Dockerfile`, with scheduled scans and a separate publish service.
`deploy/README.md` is the runtime contract for that image. `web/README.md`
documents the app itself. This page records what the operator otherwise learns
by reading code. Settings are named by variable, never by value, and the
cluster manifests live outside this repository.

## What runs where

The web pod is the daily surface. It runs the image from `deploy/Dockerfile`
with `CAREER_OPS_ROOT=/data` on a persistent volume, so the tracker is at
`/data/data/applications.md` and every other user-layer file sits under
`/data`. A CronJob POSTs `/api/scheduler` on a schedule, which is the tick that
runs scheduled scans. The publish service (`publish/`) is a second pod with its
own image.

Every dashboard `claude -p` worker is spawned with the data root as its
working directory and no `--add-dir` (`web/src/app/api/run/route.ts`, the
`spawnHeadlessCli` call). Nothing under `/app/CLAUDE.md`, `/app/AGENTS.md` or
`/app/.claude/` is loaded by such a run. The prompt carries the code root as a
path, and the modes, templates and scripts reach the worker that way.

## Runtime settings

These are the variables the pod needs beyond the table in `deploy/README.md`.

| Variable | What it does |
| --- | --- |
| `CAREER_OPS_SCHEDULER=external` | Tells the Scheduled scans page that an external scheduler fires the tick (`web/src/lib/scheduler-status.ts`). Without it the page shells out to `crontab -l` and reports "Task not installed". Any other value warns once and reads the OS schedule. |
| `CAREER_OPS_SCHEDULER_DESCRIPTION` | Free text shown on the Scheduled scans page when the scheduler is external, so the page can say which CronJob fires the tick. |
| `CAREER_OPS_SCHEDULED_JOBS_PATH` | Moves the scheduled-jobs store off its default `data/scheduled-jobs.json` under the data root. Leave it unset unless the store must live elsewhere. |
| `PUBLISH_URL` | The publish service the Shares page and `publish/share.mjs` call. |
| `PUBLISH_API_KEY` | The key the publish service expects. `publish/share.mjs` reads both `PUBLISH_*` values from the environment first and from `{root}/.env` second. |
| `CLAUDE_CODE_OAUTH_TOKEN` | The Claude CLI credential, passed as a secret. Renew it by running `claude setup-token` again and replacing the secret. The token's lifetime is set by Anthropic and is not measured here. |

The pod runs with `readOnlyRootFilesystem`. The writable paths are `/data`,
`/home/app`, `/tmp`, `/dev/shm` and `/app/web/.next/cache`, each a volume or
an emptyDir. A write anywhere else fails in the pod even when it passes the
smoke stack.

## What the pod reads from .env

The Next process itself reads `{root}/.env` for one thing, `CAREER_OPS_CLI`
through `web/src/lib/remembered-cli.mjs`, where a value in the environment wins.
The Shares page runs `publish/share.mjs` as a child, and that child reads
`PUBLISH_URL` and `PUBLISH_API_KEY` with the same precedence. The image presets `CAREER_OPS_CLI=claude`, so a Mac `.env`
holding only a `CAREER_OPS_CLI` line is inert in the pod.

Script children read the file on their own terms. `scan.mjs` loads all of it
with dotenv, so a scheduled scan sees every key in it. `lib/browser-launch.mjs`
reads the browser keys for every Playwright launch, the PDF server included.
`doctor.mjs` reads `CAREER_OPS_PROFILE`. `lib/agent-cli.mjs` reads
`CAREER_OPS_CLI`. The key-based evaluators and `plugins/_engine.mjs` load it.
Nothing in `.env` reaches a `claude -p` worker.

## What the image lacks

The image has no TeX, so `cv.output_format: latex` and the `latex` and
`latex-tex` modes fail. It has no `gh`, so the GitHub step of `expand` exits 3
by design. It has no Go, so there is no dashboard TUI. It has no headed Chrome,
so the apply flow does not run. It ships no `.claude/settings.json` and no
hooks.

Dashboard runs are fenced by `TOOL_SCOPES` in
`web/src/lib/claude-invocation.mjs`. The `evaluate`, `cover` and `research`
kinds get `Read,WebFetch,WebSearch,Glob,Grep` (the `networkReadOnly` scope) and
`pdf` gets `Read,Glob,Grep` (the `localReadOnly` scope). None of them loads an
MCP server. Without `Bash` a worker cannot run `browser-extract.mjs` or
`fetch-jd.mjs`, so `scan.extractor: cli` does nothing in a dashboard run and JD
text is WebFetch only. `fix-portal` is the one writing kind and keeps Bash and
its MCP servers. Ashby job pages render client-side, so WebFetch is expected to
return the page shell without the JD. This has not been confirmed against a
live posting from the pod. `node doctor.mjs` in the pod
always warns that Playwright MCP tools are not detected, for the same reason.

## Scheduled jobs

Each job in `data/scheduled-jobs.json` carries its own filters. At run time
`writeJobPortals` in `web/scripts/scheduled-jobs-runner.mjs` writes a temporary
copy of `portals.yml` in which the job's lists replace `title_filter.negative`
and the four `location_filter` lists `allow`, `block`, `block_hard` and
`always_allow`. An absent job list means none. Only `title_filter.positive`
falls back to `portals.yml` when the job has no keywords. When
`title_filter_full` exists it receives the same lists, so an `engine: full` job
never uses `portals.yml`'s own full-scan keywords. `strict` and
`workplace_policy` pass through unchanged. Editing `portals.yml` changes
neither saved job.

Engine `portals` runs `scan.mjs`. Engine `full` runs `scan-ats-full.mjs`.
Nothing else runs on the tick. There is no portal health check and no
follow-up sweep. `POST /api/scheduler` answers 202 when the runner is spawned,
not when the scan ends, and the runner is detached with its output ignored, so
a failed scan shows only in the run history inside `data/scheduled-jobs.json`.

## Rollouts kill in-flight runs

Every push to `main` rebuilds the image. `docker-image.yml` has no path filter
on push, and a pull request that touches image inputs builds without pushing.
Renovate, configured in the cluster manifests repository, moves the image
digest on its own schedule. The `Recreate` rollout
stops the pod, and `web/server.mjs` has no signal handler, so an evaluate, a
PDF render or a scan in flight is lost. A claimed scan whose claim is older
than 30 seconds is requeued and rerun on the next tick.

## Behind a gateway

The app has no login, and `POST /api/scheduler` has no authentication. Put an
authenticating proxy in front and restrict the Service so only the gateway and
the CronJob reach port 3000. Probes and the CronJob may send `Host: localhost`,
which the request guard always admits as loopback, or a name listed in
`CAREER_OPS_WEB_ALLOWED_HOSTS`. `GET /api/healthz` is the probe endpoint.

## Plugins and portal health

Plugin keys must be pod environment. There is no write path to `.env` from the
pod. Only provider plugins run inside a scheduled scan, and the web has no
plugin surface. `verify-portals.mjs`, `audit-portals.mjs`, `stats.mjs --prune`
and `filter-audit.mjs` run only from a shell against the volume, for example
through `kubectl exec`.

## Moving the data root off a Mac

Copy the data root one to one. With `CAREER_OPS_ROOT=/data` the tracker stays
at `data/applications.md` under it. Create the archive with
`COPYFILE_DISABLE=1 tar` so no AppleDouble `._*` files are added. Extract with
GNU tar `--no-overwrite-dir` so the extract does not fail setting metadata on
the mount point itself. Delete any `._*` files already copied. The first
migration copied over a hundred of them (the migration row in
`docs/superpowers/research/2026-11-06-reactive-resume-convergence/decisions.tsv`). Run `chmod 644` on `0600` files
before copying. Unload both launchd agents first.
`web/scripts/uninstall-scan-schedule.sh` removes only
`io.career-ops.scheduled-scan`, and a recipe agent needs
`launchctl bootout gui/$(id -u)/<label>`. Do not copy `.env`. Stop the Mac from
writing the same tracker.

## Updating

The pod has no `.git`, and the fork cuts no releases, so `update-system.mjs` is
not the path. On a Mac checkout `node update-system.mjs check --channel main`
is the fork's only channel. For the pod, merge to `main` and let the image
rebuild. User CV template copies live at `/data/data/templates/`, on the
volume, never in the image.
