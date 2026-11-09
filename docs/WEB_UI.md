# Career-ops Web UI Launcher Documentation

Career-ops includes a local-first web interface located in the `web/` directory. The `npm run ui` launcher script (`scripts/ui-server.mjs`) provides a zero-setup daemon to start the local Next.js server in dev mode (`next dev`, so each page compiles on its first load and that first visit is slower), verify environment readiness, canonically resolve the career-ops data root, and open the dashboard in your default browser.

---

## Getting Started

The web UI has its own dependencies. Install them once:

```bash
npm --prefix web ci
```

Then launch the local web server and open the browser dashboard:

```bash
npm run ui
```

The server starts locally on `http://127.0.0.1:3000` by default and automatically opens your browser once the server is ready.

Coming from Reactive Resume? [MIGRATING_FROM_REACTIVE_RESUME.md](MIGRATING_FROM_REACTIVE_RESUME.md) imports your resume and tracker before you open the Resume and Board pages.

---

## Command-Line Options

Pass command-line options to `npm run ui` after `--`, or npm keeps them for itself:

| Flag | Default | Description |
|---|:---:|---|
| `--port=<number>` or `--port <number>` | `3000` | Custom port to listen on. |
| `--host=<ip>` or `--host <ip>` | `127.0.0.1` | Network interface host (default: `127.0.0.1`; network exposure requires `CAREER_OPS_WEB_ALLOWED_HOSTS`). |
| `--no-open` or `--noopen` | `false` | Start the server without opening the browser automatically. |

### Examples

```bash
# Run on a custom port
npm run ui -- --port=3030

# Start without automatically launching a browser
npm run ui -- --no-open
```

---

## Process Lifecycle & Architecture

- **Canonical Data Root Resolution**: The launcher resolves the user data directory using `path-resolver.mjs` (`CAREER_OPS_ROOT` / `CAREER_OPS_DATA_DIR` / `.career-ops-data`), ensuring the web application reads and writes user-layer files according to the Data Contract.
- **Readiness Polling**: Polls the server until it responds before launching the browser, draining responses properly via `res.resume()`.
- **Graceful Shutdown**: Handles `SIGINT` (Ctrl+C) and `SIGTERM` in the launcher (`scripts/ui-server.mjs`) across Linux, macOS, and Windows (terminating the launched child process and waiting for shutdown before exiting). `node web/server.mjs start`, the production entry, has no handler.

---

## Scheduled scans

The Scheduled scans page saves scans that run on a cadence (see [AUTOMATION.md](AUTOMATION.md) to install the queue worker). Each job takes its title and location filters from one of two sources:

- **Use portals.yml filters** (on). Each run passes `portals.yml` to the scanner unchanged, so an edit to that file reaches the next run. The runner resolves a relative `CAREER_OPS_PORTALS` against the data root. The run fails with "Scheduled scans require title keywords in portals.yml title_filter.positive when a job uses the file's filters" when the title list the scanner reads is empty, because an empty list would let every posting through; the message names the list it read. The full ATS sweep reads `title_filter_full.positive` when the file has a `title_filter_full` block, and `title_filter.positive` otherwise. A bare `title_filter_full:` with no keys counts as unset, so the sweep falls back to `title_filter`. A `title_filter_full` block without a `positive` list is refused. A title list counts as empty unless it is a list holding at least one non-blank string, so `positive: engineer` written without brackets is refused. The portals scan reads `title_filter.positive`. A custom job that leaves that list empty while the file supplies none is refused too, with its own message. The toggle hides the six title and location lists; posted within, sources and scan depth still come from the job. The job card reads "uses portals.yml". The job keeps its own lists while the toggle is on, and they come back when you turn it off.
- **Custom filters** (off, the default). The job writes a temporary copy of `portals.yml` under `data/tmp/` with its own lists, and deletes it after the run. A job list that holds values replaces the file's list. A job list that is empty uses the file's list. This applies to all six lists: roles to find, exclude, city or location, exclude locations, never include and always include (`title_filter.positive` and `negative`, `location_filter.allow`, `block`, `block_hard` and `always_allow`). `title_filter_full` takes only the job's non-empty title lists.

Both sources read `portals.yml` from the data root, or the file `CAREER_OPS_PORTALS` names. The runner writes `portals: <path> (file)` or `portals: <path> (overlay)` to stderr on each run. A missing or unreadable `portals.yml`, or an empty title list, fails the run at the first attempt with no retry.

A custom job saved before 2026-11-08 keeps its meaning with three exceptions. An empty list used to clear the file's list for the run, and now it uses the file's list. For example, a job with no exclude terms used to drop the file's `title_filter.negative`, and now it keeps it. The copy also used to start from `<data root>/portals.yml` even when `CAREER_OPS_PORTALS` named another file, and now it starts from that file. A full-sweep job with no roles of its own used to copy `title_filter.positive` into `title_filter_full`, and now it uses the file's `title_filter_full.positive` or is refused when that list is empty.
