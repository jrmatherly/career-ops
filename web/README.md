# career-ops web (alpha)

An **experimental, opt-in web UI** for career-ops. It is a local-first *view* over
the exact same files the CLI reads and writes (`data/pipeline.md`,
`data/applications.md`, `reports/`, `config/`): no parallel engine, no separate
database, no remote backend. If you never run it, nothing about your CLI workflow changes.

> **Status: alpha.** Expect rough edges. Feedback →
> [Discussion #1142](https://github.com/career-ops-hq/career-ops/discussions/1142) ·
> roadmap context → [Discussion #156](https://github.com/career-ops-hq/career-ops/discussions/156).

## Quick start

Requires Node 22.13+ (or 23.4+ on the 23.x line), the same floor as the rest of career-ops. `npm test` runs with `--experimental-strip-types` (see [Tests](#tests)) because some suites import `.ts` modules directly, and Node strips types by default only from 22.18.

```bash
cd web
npm ci
npm run build
npm start
```

Open http://localhost:3000. The app reads the career-ops checkout it lives in
(the parent directory) — your existing CV, pipeline and reports appear as-is.
`CAREER_OPS_ROOT`, `CAREER_OPS_DATA_DIR` and a `.career-ops-data` marker file
move the data root, in that order, the same way the CLI resolves it.

`npm start` serves the production build, which is the one to use day to day.
Run `npm run build` again after updating career-ops so the app picks up the new
code. `npm run dev` is for working on the web UI itself (see
[Development](#development)): it compiles each page on first visit and checks
for changes as you go, so it is noticeably slower to use. `npm run ui` from the
repository root, where `docs/WEB_UI.md` sends you, starts that dev server, not
the production build.

The server binds IPv4 loopback, so reach it as `localhost` or `127.0.0.1`;
`http://[::1]:3000` has nothing listening on it.

## What works today

- **Pipeline** — your tracker as a sortable, filterable table; status changes
  write back through the core's own scripts.
- **Explore** — the free reverse-ATS scan with an honest partial-dataset
  indicator, plus AI-assisted discovery (bring your own CLI/keys, including Grok Build CLI).
- **Scheduled scans** — save local zero-token or full-dataset scans and run due
  jobs through an optional worker on Windows, macOS or Linux.
- **Apply** — assisted form prefill with a hard rule inherited from the core:
  **it never submits for you** — you always press the button.
- **Today / Analytics / CV / Config** — action queue, funnel + pipeline Sankey,
  CV editing with preview, settings. In **CV**, use **Upload PDF / TeX** to
  import a replacement, review the converted Markdown, then select **Update cv.md**.
  Conversion uses your configured AI CLI; saving backs up the previous CV.

### Full or focused evaluation

Open **Evaluation options** below the pasted-URL form, or select sections when
confirming **Score shortlist**. Full evaluation is the default. **Essentials**
keeps a short job summary; you can also choose optional sections individually.
Your selection is remembered in this browser.

Every selection keeps the fit score, requirements and gaps, evidence confidence,
basic posting checks, and the archived job description. Focused reports identify
their scope in the report and tracker notes. Unselected research and drafting
tasks are excluded from the request; missing research remains unknown evidence.
Fewer sections can reduce token use, but there is no fixed saving. Estimates use
your completed runs with the same selection.

The `/api/run` evaluate request accepts `evaluationSections`, an array of IDs:
`summary`, `strategy`, `research`, `customization`, `interview`, `application`,
and `keywords`. Omitting it preserves the full evaluation; `[]` requests the
required assessment without optional sections. Invalid selections return 400
before starting an AI run.

The `evaluate-text` kind evaluates posting text the caller already has, for
unattended runs. Its body is `{kind: "evaluate-text", input, cliId: "claude",
jdText}`: `input` is the posting URL, used only to name the posting, and
`jdText` is the posting text, at most 16,384 characters. The worker gets no web
tool and no write tool, runs on Claude only, and is denied Read on secrets and
the PII files. Its report header reads `unconfirmed (auto mode, no web
research)`.

The route answers 400, before it starts any CLI, for these request-shape
errors among others:

- a kind it does not know.
- a field sent to a kind that does not own it, an explicit `null` included:
  `jdText` outside `evaluate-text`, `brief` outside `cover`, and
  `evaluationSections` outside `evaluate` and `evaluate-text`.
- an `input` or a `cliId` that is not a string, or is blank or
  whitespace-only.
- an `evaluate` or `evaluate-text` input that is not a bare `http(s)://` URL
  with no whitespace in it. `evaluate` also takes a `local:` inbox row, which
  may hold an interior space but no other whitespace or line-break character.
- a `cliId` with leading or trailing whitespace.
- a built prompt that contains a NUL byte, which argv cannot carry.
- for `evaluate-text`: a `cliId` other than `claude`; a `jdText` that is
  missing, blank or over 16,384 characters; a data root the server cannot
  resolve; and a data root with characters outside letters, digits, `.`, `_`,
  `-` and `/`.
- an `evaluate-text` request whose `claude` resolves to another CLI because
  Claude is not available.

## Safety

- **Local-first:** the local web app runs entirely on your machine — no cloud,
  no account needed. Your CV and data stay in your own files.
- **Loopback by default:** `npm run dev` and `npm start` bind `127.0.0.1`, so
  nothing else on your network can reach the dashboard. It has no login — the
  bind is the access control. Opt out deliberately with
  `CAREER_OPS_WEB_ALLOWED_HOSTS` ([below](#exposing-it-beyond-this-machine)).
- **Never auto-submits:** the apply flow drafts and prefills; submitting is
  always a human action.
- **CV generation never asks the agent to write:** the `pdf` worker tailors your
  CV and emits it inline in a `<<cv-html>>` envelope; the backend parses that
  envelope, writes the HTML, and renders the PDF itself. Job postings and
  evaluation reports are untrusted input that reaches this agent, so the safest
  thing is for it to hold no write tool at all — on Claude Code every write-capable
  tool is disallowed for this mode (`Write`, `Edit`, `MultiEdit`, `NotebookEdit`
  and `Bash`), and so are `WebFetch` and `WebSearch`, since this worker has no
  reason to reach the network. Codex is fenced too, with a read-only sandbox
  (`-c sandbox_mode=read-only`; the `FENCERS` table in `src/lib/cli-fencing.mjs`
  is the list of fenced runtimes). A CLI absent from that table is invoked with a bare prompt
  and keeps its own default tool access, so on those the agent still *holds*
  write tools — what the pipeline
  guarantees is that the CV which gets rendered is the one the backend parsed out of
  the envelope, never a file an agent wrote behind it.
- **Additive:** the CLI works exactly the same without the web. The core's required
  check does run the web unit suites (`test-all.mjs`), and `web/` is its own
  release-please component; nothing in the CLI depends on it.

Which tools each run kind holds on Claude Code (`TOOL_SCOPES` in
`src/lib/claude-invocation.mjs`, in scope order):

| Kind | Allowed tools | Network |
| --- | --- | --- |
| `pdf` | Read, Glob, Grep | none |
| `research` | Read, WebFetch, WebSearch, Glob, Grep | fetch |
| `evaluate` | Read, WebFetch, WebSearch, Glob, Grep | fetch |
| `evaluate-text` | Read, Glob, Grep | none |
| `cover` | Read, WebFetch, WebSearch, Glob, Grep | fetch |
| `fix-portal` | Read, WebFetch, WebSearch, Write, Edit, Bash, Glob, Grep | fetch and writes |

A run without `Bash` cannot execute `browser-extract.mjs` or `fetch-jd.mjs`,
so `scan.extractor: cli` does nothing in a dashboard run and JD text comes
from WebFetch.

## Scheduled scans

The web UI can save scan definitions without installing an OS task. To check and
run due jobs every 15 minutes, install the local worker from the repository root.
On Windows:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File web/scripts/install-scan-schedule.ps1
```

On macOS and Linux:

```sh
sh web/scripts/install-scan-schedule.sh
```

Remove it with `web/scripts/uninstall-scan-schedule.ps1` on Windows or
`sh web/scripts/uninstall-scan-schedule.sh` on macOS and Linux.
`uninstall-scan-schedule.sh` removes only the agent or cron line the installer
wrote (`io.career-ops.scheduled-scan`). It runs as the
current user (never as root), and Windows and macOS need a logged-in session. The task runs
`web/scripts/scheduled-jobs-runner.mjs`, which starts the scanner and, for a job
in review or auto mode, ranks the rows that job's scans added through
`rank-pipeline.mjs`, which calls your agent CLI. It never evaluates roles,
applies, or submits anything. Job definitions and run history stay in the gitignored `data/`
directory. The definitions live in `data/scheduled-jobs.json` under the data
root; `CAREER_OPS_SCHEDULED_JOBS_PATH` moves that file, and a relative value
resolves against the data root.

Each job carries its own title and location filters. At run time they replace
`title_filter.negative` and the `location_filter` lists `allow`, `block`,
`block_hard` and `always_allow` in `portals.yml` (an absent job list means
none), and only `title_filter.positive` falls back to `portals.yml`. When
`title_filter_full` exists it receives the same lists, so an `engine: full` job
never uses `portals.yml`'s own full-scan keywords. Editing `portals.yml` changes neither saved job.

When something outside this machine's OS scheduler fires the runs (a Kubernetes
CronJob that POSTs `/api/scheduler` every 15 minutes, say), set
`CAREER_OPS_SCHEDULER=external` so the Scheduled scans page reports the schedule
as installed ("Task enabled") instead of "Task not installed". With it set the
app never reads `crontab` or `launchctl`, and each accepted `POST /api/scheduler`
touches the `.tick` marker beside `data/scheduled-jobs.json` once the runner has
started, the marker the cron line touches, so "Last OS check" stays right. Without
it a manual "Check due jobs now" click leaves "Last OS check" alone, so a broken
cron line still shows. A short note in `CAREER_OPS_SCHEDULER_DESCRIPTION` comes
back from `GET /api/scheduler` as `description` and `task.status`; the page does
not render it yet. Any other value of `CAREER_OPS_SCHEDULER` is logged once and
read as the OS schedule.

## Development

```bash
npm run dev          # dev server (Turbopack)
npm test             # unit suites (node --test, no framework)
npm run typecheck    # tsc --noEmit
npm run build        # production build
npm run test:browser # tests/lib/*.browser.test.mjs in Chrome, each against its own server (after build)
```

The `*.browser.test.mjs` suites skip in `npm test`: each needs a running server's
URL in an env var. `npm run test:browser` (`tests/browser-suites.mjs`) starts the
production build once per suite on disposable data, sets those variables and
fails on any skip. A failing suite gets one more run on a new server, and one
that passes only then is reported as flaky; `web-ci.yml` runs it. A new browser suite goes in that
script's `SUITES` table, or the run fails.

Set `CAREER_OPS_ROOT=/path/to/checkout` in `web/.env.local` to point the app at
a different career-ops directory (useful for testing against sample data).
Root scripts such as `doctor.mjs` run from the checkout that holds `web/`, not
from `CAREER_OPS_ROOT`; set `CAREER_OPS_CODE_ROOT` when the app runs outside it.

Every route but build assets is gated by the same-origin + loopback guard in
`src/lib/origin-guard.mjs`. Two opt-ins widen it, both unset by default:
`CAREER_OPS_WEB_ALLOWED_HOSTS` names extra non-loopback hosts the dashboard may
answer on, and `CAREER_OPS_ALLOWED_ORIGINS` names origins allowed to call the
API from outside the app — a comma- or space-separated list, no trailing slash.
The second is what a local companion client needs: a browser extension calls
from a `chrome-extension://` origin, which Fetch Metadata always reports as
`cross-site`, so the guard refuses it unless the id is named here. The host
layer still applies to an allowlisted origin.

`CAREER_OPS_ALLOWED_ORIGINS` can live in `web/.env.local`.
`CAREER_OPS_WEB_ALLOWED_HOSTS` cannot: it also picks the bind address, which the
launcher (`server.mjs`, or `npm run ui` from the repository root) reads from the
shell environment before Next.js loads `web/.env.local`
(see [below](#exposing-it-beyond-this-machine)).

Pass one-off flags through npm's `--`: `npm run dev -- -p 4000`.

### Exposing it beyond this machine

`CAREER_OPS_WEB_ALLOWED_HOSTS` is the list of hosts allowed to reach the
dashboard. Unset (or blank) the server binds `127.0.0.1`; name a host it cannot
already reach on loopback and the socket opens, with the guard answering for
loopback and the hosts you named:

```bash
CAREER_OPS_WEB_ALLOWED_HOSTS="192.168.1.50" npm run dev
```

Set it in the environment of `npm run dev`, `npm start` or `npm run ui`, as above
or with `export`. The launcher chooses the bind before Next.js reads `web/.env.local`, so
a value written only there reaches the guard but not the bind: the server stays on
`127.0.0.1` and the startup line says `loopback only`.

It is not an on/off switch, and it is not read as one: `off`, `false`, `no` and
`0` are all valid hostnames, so treating them as words would have opened the
socket to the whole network for someone typing the word for "closed". They are
refused, as is anything else that cannot be read as a hostname or an IP address.
To stay on loopback, unset the variable.

`0.0.0.0` and `::` are refused too. They name every interface, which is a bind
target rather than a host anyone is addressed by: accepting one would open the
socket while the guard went on matching `Host` literally, so honest clients on
your network would get `403` and only a client spelling `Host: 0.0.0.0` would be
let in. To open it up, name the hosts that should reach it.

**How the bind is chosen.** Name a single IP address and the socket binds exactly
that address — `192.168.1.50` and nothing else. It has to be an address *this*
machine holds: naming the address of the laptop that should reach the dev box
makes the server fail to start with `EADDRNOTAVAIL`, since you can only listen on
your own interfaces. Name that laptop's *hostname* instead, or use a hostname for
the box, and the bind falls back to every interface. Link-local addresses
(`fe80::…`) are refused: they are ambiguous across interfaces and cannot be bound
without a zone index. Binding `0.0.0.0` for a single address would
also publish the dashboard on every other interface the machine has, a VPN tunnel
or a phone hotspot included, none of which you asked for. One socket carries one
address, so `http://localhost:3000` stops answering; open it at the address you
named. If you want loopback too, name a loopback host alongside
(`"192.168.1.50, localhost"`) — that binds `0.0.0.0` and accepts the wider
exposure deliberately. Anything else — a hostname, which needs a resolver the
launcher does not have, or two addresses, which cannot share a socket — binds
`0.0.0.0`. The startup line says which of these happened.

Naming only loopback (`localhost`, `127.0.0.1`, `::1`) is not an opt-in and
changes nothing — the guard already answers for those, so widening the socket
would expose every interface while granting no host that wasn't already allowed.

Set through `CAREER_OPS_WEB_ALLOWED_HOSTS`, neither layer can widen without the
other — the bind and the allow-list are derived from that one value. They are not
equivalent, and two things move them apart: the guard also answers for loopback,
which no bind address changes, and a `-H` of your own moves the bind while the
allow-list stays as it was (see below).

Understand what you are turning on. Once the socket is open, **everything the
dashboard serves — your CV, pipeline and reports — is reachable by anyone who can
both reach that port and satisfy the host filter**, and there is no login. Two
further caveats: a client that can reach the port can also supply its own `Host`
header, so on a widened bind the allow-list filters honest clients rather than
hostile ones; and a `0.0.0.0` bind is IPv4-only, so an opted-in IPv6 address will
pass the filter with nothing listening for it.

The guard covers page routes as well as `/api/*` (`src/proxy.ts`'s matcher spans
everything but build assets). One request shape passes the cross-origin check: a
`GET` or `HEAD` page navigation, `Sec-Fetch-Mode: navigate` with
`Sec-Fetch-Dest: document`, which is a link click or the redirect back from a
login page on another site. A top-level navigation cannot carry a body or a
custom header, so it is not the CSRF this layer refuses, and without it the first
page after an OIDC login arrives as `cross-site` and gets a JSON 403. The
exemption stops at pages: a cross-site `POST`, a `GET` made by a page's `fetch()`
(`Sec-Fetch-Mode: cors`), a framed page (`Sec-Fetch-Dest: iframe`) and any
navigation to `/api/*` are still refused, and the Host filter still applies. That is not about the bind: a page you visit can
re-resolve its own domain to `127.0.0.1` and read the dashboard from your own
browser as same-origin, which a loopback bind does nothing to stop. The `Host`
header on that request carries the attacker's domain, which is what refuses it.

**In a container** the bind has to be `0.0.0.0` — loopback inside a network
namespace is not reachable from the host. Since `0.0.0.0` itself is refused as an
allowed host, get there by naming a *hostname* (the container's own name is the
obvious one): a hostname needs a resolver the launcher does not have, so the bind
falls back to every interface, which is what a namespace needs. A forwarded port
(`-p 3000:3000`) still arrives with `Host: localhost`, which
the guard admits, so the port publication is the whole of the access control
there: publish it on `127.0.0.1:3000:3000`, not `0.0.0.0`.

You can also override the bind directly — `npm run dev -- -H 0.0.0.0`. When you
pass `-H` or `--hostname`, the launcher injects nothing and Next resolves the
flag itself, so the startup line says the bind is Next's to choose rather than
claiming an address it would have to guess. **Prefer the env var.** An `-H` on
its own opens the socket while the allow-list stays empty, which is the one
combination with no honest reading: the guard then refuses LAN clients that
identify themselves truthfully and admits any that spell `Host: localhost`. The
launcher says so on startup rather than doing it quietly.

`GET /api/healthz` answers `{ "ok": true }` for a liveness or readiness probe. It
reads no file and starts no process, so a probe can hit it as often as it likes.
The guard still runs in front of it, so the probe's `Host` has to be loopback or a
name in `CAREER_OPS_WEB_ALLOWED_HOSTS`.

Use it on a network you trust, and prefer an SSH tunnel
(`ssh -L 3000:127.0.0.1:3000 you@box`) where you can — that needs no env var at
all and keeps the bind on loopback.

### Tests

Suites live in `web/tests/`, mirroring the path of what they test under
`web/src/` — so `src/lib/clean-chips.mjs` is tested by
`tests/lib/clean-chips.test.mjs`. Name the file `{module}.test.mjs`.

Root-level scripts are the one exception: `server.mjs` is tested by
`tests/lib/server-launcher.test.mjs`, because `test-all.mjs`'s parity check gates
only `web/tests/lib/` and a suite outside it would never run in the required check.

`npm test` discovers them with a glob (`tests/**/*.test.mjs`), so a new suite
needs **no registration** — just add the file. Glob discovery needs Node ≥ 22:
earlier versions don't expand CLI globs for `node --test`, so `npm test` prints
`Could not find '…'`, runs nothing and exits 1. `engines.node` in
`web/package.json` sits higher still, at the project range (`^22.13.0 || >=23.4.0`,
`NODE_ENGINES` in `lib/node-floor.mjs`), and well above what `next` itself asks for.

Three constraints follow from all this:

- **Keep tests out of `src/`.** `src/` is the Next.js app's own tree, scanned by
  `next build`'s file tracing and `tsc --noEmit`; test files there entangle
  fixtures with build and route conventions.
- **Suite files are `.test.mjs`.** There is no test framework by design, and the
  glob never discovers a `.test.ts` suite, so one would look like coverage and
  never execute. Prefer extracting the logic under test into a plain `.mjs`
  module (the pattern `src/lib/pdf-paths.mjs` and `src/lib/pdf-render.mjs`
  already follow); a suite may import a `.ts` module through
  `--experimental-strip-types` and the `@/` resolver in
  `tests/helpers/web-ts-alias-loader.mjs`.
- **Web suites use `node:test`.** Here you write
  `import { test } from "node:test"` with `node:assert/strict`. Don't import the
  root `tests/helpers.mjs` `pass`/`fail` helpers; they belong to the root
  `tests/` suite, where `test-all.mjs` runs both those and `node:test` suites
  ([#2463](https://github.com/career-ops-hq/career-ops/issues/2463)).

`tests/web-test-layout.test.mjs` in the **root** suite enforces all of the above
on every PR, including that `npm test` never goes back to listing suites by name
([#2360](https://github.com/career-ops-hq/career-ops/issues/2360)).

### Assistant conversations

The assistant saves conversations in `.career-ops-web/chats/` under the resolved
user data root. New chat keeps the previous conversation; use the history picker
to switch, rename, or delete it. Clearing browser storage does not delete saved
conversations. The old `career-ops:chat` browser entry is migrated once and only
removed after its disk write succeeds. Empty greetings are not saved.

Writes are atomic and revision-checked: a stale tab cannot overwrite newer
messages. Save failures stay visible, and switching waits for the current save.
Files with invalid JSON are reported individually without blocking healthy
conversations; damaged files are never overwritten. A crashed
writer can leave a `.json.lock` behind; the next save reclaims it once its
holder is gone (a lock file from an older version, after 30 seconds), so no
hand cleanup is needed. Conversation files contain personal text and should
stay local and gitignored. They are conversation history, not new verified CV
facts or a replacement for the canonical profile files.

Stored messages are not truncated. Model input is bounded to 24 recent messages
(up to 24,000 characters) plus literal excerpts of earlier user messages (up to
8,000 characters). Long excerpts may be shortened; this is not unlimited model
memory. Conversations are limited to 2,000 messages and 1 MB; a larger save is
rejected visibly without overwriting the previous file. On a save failure, export
the live conversation (including unsaved text) or explicitly confirm discarding
unsaved changes to start a new chat. Saved conversations remain on disk.
