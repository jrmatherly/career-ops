# Hosted career-ops image

`deploy/Dockerfile` builds `ghcr.io/jrmatherly/career-ops-server`, the image the
home cluster runs. It is not the development container: the root `Dockerfile`
stays that, with Go and TeX, and bind-mounts the checkout at run time. This
image copies the checkout to `/app`, builds the web app, installs the Claude
CLI, and starts the web server. `.github/workflows/docker-image.yml` publishes
it for `linux/amd64` on every push to `main`, with provenance and an SBOM.

## What the image contains

- The Playwright Chromium base, pinned to the same digest as the root
  `Dockerfile`, so `generate-pdf.mjs --pdf-server` renders PDFs.
- The checkout at `/app`, root dependencies installed, `web/` built with
  `next build`.
- `@anthropic-ai/claude-code` installed globally at a pinned version, so
  `claude` is on `PATH`. `DISABLE_AUTOUPDATER=1` keeps it at that version.
- `tini` as PID 1. `web/server.mjs` spawns the PDF server and the web's
  `/api/scheduler` route spawns scheduler runs, both detached, and `tini`
  reaps them. A pod stop ends the container as
  soon as `web/server.mjs` dies, so `next` and any run in flight get no
  graceful shutdown today.
- No Go toolchain, no TeX, no `gh`. The dashboard TUI and the LaTeX CV path are not
  in this image. Neither is the apply flow: it wants a headed Google Chrome,
  or failing that the Chromium revision of the web's own `playwright-core`,
  and the image has no Chrome, no display and not that revision.
- No `.claude/settings.json` or hooks: `.dockerignore` excludes them. A
  dashboard `claude -p` run has the data root as cwd, so nothing under
  `/app/.claude/` or `/app/CLAUDE.md` is loaded by it either way. The modes
  and templates reach the worker by path.

The process runs as uid 1000. The preset environment is in `deploy/Dockerfile`.

A merge to `main`, or a digest bump from the cluster manifests' Renovate, replaces the pod. Anything
running at that moment (an evaluate, a PDF render, a scan) is lost. A claimed
scan whose claim is older than 30 seconds is requeued and rerun on the next tick.

## Runtime contract

| Setting | Value | Why |
| --- | --- | --- |
| `CAREER_OPS_ROOT` | `/data` | The data root. Mount the persistent volume here, writable by uid 1000 (`fsGroup: 1000`). An empty volume is fine since jrmatherly/career-ops#18: before it, a mount point named `data` with no `data/applications.md` made the tracker fallback `/data/applications.md`, the workspace resolver treated `/data` as a `data/` subdirectory and returned `/`, and the PDF server died on `mkdir /output`. |
| `CAREER_OPS_WEB_ALLOWED_HOSTS` | `<public host> career-ops-web` | A hostname makes `web/src/lib/bind-host.mjs` bind `0.0.0.0`, which a container needs. The request guard admits only these hosts and loopback. |
| `CAREER_OPS_CLI` | `claude` | Preset in the image. |
| `CLAUDE_CODE_OAUTH_TOKEN` | from `claude setup-token` | One of this, `ANTHROPIC_API_KEY`, or the proxy pair below. Pass it as a secret, never in the image. |
| `ANTHROPIC_BASE_URL` | the gateway URL, such as `http://proxy.example:8317` | The proxy pair: this URL plus `ANTHROPIC_AUTH_TOKEN` (or `ANTHROPIC_API_KEY`). Routes every `claude` request through the gateway. `node doctor.mjs` reports the gateway host as the billing source, and warns when the URL is set without a token or key, or alongside `CLAUDE_CODE_OAUTH_TOKEN`, which the gateway token outranks. |
| `ANTHROPIC_AUTH_TOKEN` | the gateway's client key | The proxy pair's credential, with `ANTHROPIC_BASE_URL`. Pass it as a secret, never in the image. |
| `CAREER_OPS_SCHEDULER` | `external` | The Scheduled scans page reports the external tick instead of shelling out to `crontab -l` and saying "Task not installed". |
| `CAREER_OPS_SCHEDULER_DESCRIPTION` | free text | Shown on the Scheduled scans page when the scheduler is external. |
| `PUBLISH_URL` | the publish service | Environment, or `{root}/.env`, environment wins. |
| `PUBLISH_API_KEY` | from the publish service | Environment, or `{root}/.env`, environment wins. |
| Root filesystem | read-only | Writable paths: `/data`, `/home/app`, `/tmp`, `/dev/shm`, `/app/web/.next/cache`. |
| `/home/app` | writable | The CLI writes `~/.claude`. |
| `/tmp` | emptyDir | The PDF server socket and Playwright scratch. |
| `/dev/shm` | emptyDir, `medium: Memory` | Chromium. |
| Replicas | 1, `strategy: Recreate` | `lib/dir-lock.mjs` judges lock staleness by pid, so two pods would see each other's locks as stale. |
| Port | 3000 | |

Scans run inside this pod. A CronJob that POSTs `/api/scheduler` triggers the
existing runner. The request guard admits `Host: localhost` and any name in
`CAREER_OPS_WEB_ALLOWED_HOSTS`, and refuses the `Host: <pod-ip>` kubelet probes
send by default, so set one of those on the CronJob and on the probe.
`GET /api/healthz` is the probe endpoint. The full cluster path is
`docs/DEPLOYMENT.md`.

## Build and smoke test

```bash
docker build -f deploy/Dockerfile -t career-ops-server:dev .
```

```bash
docker run --rm career-ops-server:dev claude --version
```

The compose file runs the image against a scratch data root and publishes the
port on loopback only, at `CAREER_OPS_SMOKE_PORT` (default 3000; pick another
when a dev server holds 3000, since Docker Desktop does not report the clash).
`CAREER_OPS_SMOKE_ROOT` is required and must point outside the checkout: a
root inside it would sit in the build context, where the root-anchored
`.dockerignore` patterns do not reach, and a rebuild would bake it in.
Put a `cv.md` in the scratch root first (`examples/cv-example.md` works),
then:

```bash
CAREER_OPS_SMOKE_ROOT=/tmp/career-ops-smoke docker compose -f deploy/compose.yml up
```

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: localhost' http://127.0.0.1:3000/api/version
```

Expect `200`. The PDF server runs detached and logs nothing on exit, so
also check `docker compose exec career-ops-web ps -ef` lists
`generate-pdf.mjs --pdf-server`. The compose file is a smoke stack, not a
deployment manifest.
The cluster manifests live in the home-cluster repository.
