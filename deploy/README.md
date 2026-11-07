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
- `@anthropic-ai/claude-code` installed globally at a pinned version, so the
  web finds `claude` in `/usr/local/bin`. `DISABLE_AUTOUPDATER=1` keeps it
  there.
- `tini` as PID 1. The server spawns the PDF server and scheduler runs as
  detached children, and `tini` reaps them.
- No Go toolchain, no TeX. The dashboard TUI and the LaTeX CV path are not
  in this image.

The process runs as uid 1000. The preset environment is in `deploy/Dockerfile`.

## Runtime contract

| Setting | Value | Why |
| --- | --- | --- |
| `CAREER_OPS_ROOT` | `/data` | The data root. Mount the persistent volume here, writable by uid 1000 (`fsGroup: 1000`). It must hold `data/applications.md` before the first boot: on a root with no tracker the workspace resolver strips the `data` basename, and the PDF server exits on `mkdir /output`. |
| `CAREER_OPS_WEB_ALLOWED_HOSTS` | `<public host> career-ops-web` | A hostname makes `web/src/lib/bind-host.mjs` bind `0.0.0.0`, which a container needs. The request guard admits only these hosts and loopback. |
| `CAREER_OPS_CLI` | `claude` | Preset in the image. |
| `CLAUDE_CODE_OAUTH_TOKEN` | from `claude setup-token` | Exactly one of this or `ANTHROPIC_API_KEY`. Pass it as a secret, never in the image. |
| `/home/app` | writable | The CLI writes `~/.claude`. |
| `/tmp` | emptyDir | The PDF server socket and Playwright scratch. |
| `/dev/shm` | emptyDir, `medium: Memory` | Chromium. |
| Replicas | 1, `strategy: Recreate` | `lib/dir-lock.mjs` judges lock staleness by pid, so two pods would see each other's locks as stale. |
| Port | 3000 | |

Scans run inside this pod. A CronJob that POSTs `/api/scheduler` with
`Host: career-ops-web` triggers the existing runner. Kubelet probes send
`Host: <pod-ip>`, which the guard refuses, so set a `Host: career-ops-web`
header on the probe.

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
Put a `cv.md` in the scratch root first (`examples/cv-example.md` works), then:

```bash
CAREER_OPS_SMOKE_ROOT=/tmp/career-ops-smoke docker compose -f deploy/compose.yml up
```

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: localhost' http://127.0.0.1:3000/api/version
```

Expect `200`. The compose file is a smoke stack, not a deployment manifest.
The cluster manifests live in the home-cluster repository.
