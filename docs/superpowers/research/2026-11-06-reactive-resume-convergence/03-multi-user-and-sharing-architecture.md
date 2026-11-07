# Multi-user and public share links: options A1, A2, B, C

Subagent research report, 2026-11-06. Model output: claims carry file:line evidence or are labelled inference; verify against the code before relying on one.

Note: the harness refused to write `/private/tmp/claude-501/-Users-jason-dev-career-ops/9d4e3414-0fa5-470a-ad4f-a6db69a9b9c4/scratchpad/arch/report.md`, because subagents may not write report files. The directory exists, but the file was not written. The full report is below.

# Multi-user and public share links for career-ops

## Overview

career-ops has no authentication today. The `/login` directory holds only a `loading.tsx` skeleton and no `page.tsx` (`ls web/src/app/login` shows only `loading.tsx`, added by e0496089). So the brief's premise that a `/login` page exists is wrong. Access control is the network: the server binds loopback by default and a proxy refuses cross-site and non-loopback requests (`web/src/proxy.ts:23-45`, `web/src/lib/origin-guard.mjs` header, `web/server.mjs` + `bind-host.mjs`). Inside the process the data root comes from environment variables, which are global to the process, and every spawned script and agent CLI inherits it.

Reactive Resume (RR) serves a public resume as server-rendered HTML. It renders the same React template its PDF uses, but through an HTML backend, after redacting hidden fields. It gates the page with a bcrypt password and a short-lived HMAC cookie, and counts views at most once an hour per visitor. Feedback links are separate. Each one holds a frozen, redacted snapshot of the resume and a signed token that is never stored.

Recommendation: option B. Keep career-ops single-user and file-first, and add a small separate publish service that receives already-rendered CV HTML and serves the share links. That changes no upstream file. If "multi-user" has to mean hosted career-ops workspaces, run one career-ops process (container) per user behind an auth gateway (A2 below). Do not build a request-scoped data root (A1) or a Postgres mirror (C).

## Key Concepts

- **Data root.** The user-layer directory, resolved from `CAREER_OPS_ROOT`, then `CAREER_OPS_DATA_DIR`, then the `.career-ops-data` marker, then the checkout. In web this is `careerOpsRoot()` (`web/src/lib/career-ops.ts:37-61`). In core scripts it is `getCareerOpsRoot()` (`path-resolver.mjs:110-115`). Both read `process.env` on every call. Neither caches.
- **Code root.** Where the scripts live. Resolved separately with `resolveCodeRoot()` (`career-ops.ts:76-81`).
- **Agent contract.** Agents and scripts read and write markdown, TSV and YAML directly. Markdown is the source of truth and anything else is a derived index (`web/AGENTS.md`, rule 2).
- **RR `ResumeMatch` and the public payload.** RR looks a resume up by username plus slug, by primary resume, or by id. `publicResumeData()` turns the stored resume into what every visitor sees (`packages/api/src/features/resume/access-policy.ts:117-121`).

## Q1. career-ops web auth and single-root assumptions

### Auth today

- There is no session, cookie, token or password anywhere in `web/src`. A grep for `CAREER_OPS_WEB_PASSWORD|TOKEN|AUTH_SECRET|cookie|Authorization|bearer` turns up only apply-flow cookie banners and a redaction regex (`web/src/lib/report/report.ts:12`).
- `proxy.ts` gates every path except build assets (`proxy.ts:45`). It checks `Sec-Fetch-Site`, compares Origin with Host, and admits only loopback hosts or hosts listed in `CAREER_OPS_WEB_ALLOWED_HOSTS` (`proxy.ts:24-30`).
- The guard's own header says it cannot stop a LAN client that spoofs `Host: localhost`. Only the bind interface does (`origin-guard.mjs`, the "Nothing here closes F2" paragraph).
- So exposing web to more than one person needs a real auth layer in front of it. That layer does not exist yet.

### Where the data root is bound

- `careerOpsRoot()` has 103 call sites in 49 files under `web/src` (counted with grep). It reads `process.env` each time (`career-ops.ts:50-60`).
- Script children inherit the process environment:
  - `runCoreCli` passes `env: { ...process.env, ...boundedLockWait() }` with cwd set to the code root (`web/src/lib/core-cli.ts:33-39`).
  - The agent CLI starts with `{ cwd: careerOpsRoot(), env: process.env }` (`web/src/app/api/run/route.ts:231-236`).
  - Doctor, patterns and cadence pass no `env` at all, so they inherit too (`api/doctor/route.ts:28`, `api/patterns/route.ts:33`, `api/followups/cadence/route.ts:62`).
- Nothing uses `AsyncLocalStorage` or request-scoped context (grep found none).

### Could a request-scoped root `{ROOT}/users/{id}/` work?

Mechanically, mostly yes. Securely, no, unless each user also gets OS-level isolation.

What already scopes per root without changes:

- **Locks.** The lock is a directory placed next to the file it guards (`lib/dir-lock.mjs` header, "the lock is a directory (`<path>.lock`)"). Separate roots give separate locks.
- **Tracker sqlite index.** It is a sibling of the tracker markdown (`tracker.mjs:91-93`, `resolveDbPath`). Separate roots give separate databases.
- **`.career-ops-web/` state.** Every writer joins it onto the root: chats (`assistant-chat-store.mjs:12`), CV Studio (`cv-studio/server.ts:77`), runs (`api/runs/save/route.ts:39`), logo cache (`api/logo/route.ts:28`), pdf scratch (`pdf-paths.mjs:88`). It is per user automatically.
- **Core scripts.** They pick up a different root from a per-child `CAREER_OPS_ROOT`, because `getCareerOpsRoot()` reads the env at call time (`path-resolver.mjs:111-114`).

What breaks:

1. **Plumbing.** Each of the 103 `careerOpsRoot()` calls would need a request-derived root, through a parameter or `AsyncLocalStorage`. Each spawn site would also have to set `CAREER_OPS_ROOT` explicitly instead of inheriting `process.env`. You cannot change the process env per request, because concurrent requests share it.
2. **Process-global state shared across users:**
   - The tracker write token is one module-level `Set`, so user A's evaluate would block user B's row delete (`web/src/lib/core/run-registry.ts:26-30`).
   - The apply flow keeps one headed browser and one idle timer on `globalThis` (`web/src/lib/apply/session.ts:140-169`).
   - The OS scheduler integration knows one launchd label and the user's own crontab (`scheduler-status.ts:13`, `scheduled-os-schedule.mjs:27-30`).
3. **Agent isolation, the blocker.** Tool grants are by tool name, not by path (`web/src/lib/cv-envelope.mjs:5-7`). An agent started with cwd set to user A's root can still `Read` or `Glob` user B's directory. Only Codex gets an OS sandbox. The other runtimes report fencing level "none" (`api/run/route.ts:204-209`). A prompt injection in a job posting could read another user's CV. Per-directory roots inside one OS account therefore give no isolation. Each user needs a separate OS user or container.
4. **Upstream churn.** `web/` had 411 commits in the last 90 days of this checkout's history, and `career-ops.ts` alone had 32 (`git log --since="90 days ago" --no-merges -- web/` and `-- web/src/lib/career-ops.ts`). A 49-file root refactor would conflict on nearly every upstream merge.

## Q2. How Reactive Resume serves a public resume

### Routes

All of these live in `apps/server/src/http/app.ts`:

- `GET/POST /:username/:slug` calls `serveResumePage`, guarded by `isPublicResumePath` (`app.ts:188-192`; `static/web.ts:51-61` reserves app segments and feedback paths).
- `/:username` serves the account's primary resume (`app.ts:193-204`).
- Custom domains go through `http/custom-domain.ts:43`.
- `ROOT_RESUME_ID` serves one resume at `/` (`app.ts:178-186`).
- The POST variants are the password form, with a 16 KB body limit (`app.ts:188`; `static/resume-page.ts:195-200`).

### Loader

`loadPublicWebPage` (`packages/api/src/features/resume/web-page.ts:57-134`) does one `findResume` filtered by `isPublic` (`:64-82`). It then returns one of four states:

- `unavailable`. The owner is told their resume is unpublished and visitors are not (`:83-92`).
- `moved`. Old slugs and usernames redirect (`:116-124`).
- `password` (`:127-128`).
- `ok`, with the redacted data (`:95-108`).

### Rendering

The page is server HTML, not the editor's PDF preview.

- `renderResumeWebPage` builds the same `ResumeDocument` React template the PDF uses, reconciles it into a host tree, and converts that tree to HTML and CSS with `toHtml` (`packages/pdf/src/html/web-page.tsx:66-78`). `to-html.ts` describes itself as "the web page's counterpart of `to-forme.tsx`" (`to-html.ts` header, lines 11-15).
- One template, two backends.
- The editor and the feedback page instead draw the PDF onto a canvas (`apps/web/src/features/resume/preview/preview.browser.tsx:16,321`; the feedback page uses `ResumePreview`, `features/feedback/review-page.tsx:17`).
- Rendered sheets are cached per process by a content hash (`static/resume-page.ts:38-54`).
- The response is `private, no-store`, because views are counted per request (`:30-31`).
- The CSP allows only the page's own inline script, by hash (`:32`).

### Password

- **Setting.** The owner sets it with bcrypt cost 10 (`service.ts:1022-1030`).
- **Verifying.** Each check spends a per-visitor, per-resume rate limit (`service.ts:1046-1047`). An unknown address costs the same bcrypt work as a wrong password (`:1048-1049`).
- **Cookie.** Success sets `resume_access_<id>` (HttpOnly, SameSite=Lax, 10 minutes). Its HMAC covers the resume id, the password hash and the expiry (`access.ts:6, 14-21, 42-50`), so changing the password invalidates every cookie.
- **Checking.** `hasResumeAccess` verifies the cookie in constant time (`access.ts:30-40`).
- **Owner.** The owner is exempt (`access-policy.ts:67-70`).

### hideContactDetails

The server enforces it before rendering, never in CSS. `redactResumeForViewer` calls `removeContactDetails` when the flag is set. It also strips notes, check results, hidden sections, items and the picture (`access-policy.ts:92-114`). The renderer only ever receives redacted data (`web-page.tsx:22`; `web-page.ts:100`).

### Views

- A view counts only when the viewer is not the owner and is not a crawler (`web-page.ts:51, 130-131`; `access-policy.ts:129-131`).
- `countVisit` dedups per resume per client key for an hour. It uses Redis if configured, then a coordination service, then an in-memory map capped at 50k entries (`view-dedup.ts:5-31, 34-47`).
- Totals and daily rows are upserted with `views + n` (`service.ts:392-408`) into `resume_statistics` and `resume_statistics_daily` (`schema/resume.ts:158-191`).
- Downloads follow the same rule (`service.ts:321-349`).

### Feedback links

- **Schema** (`schema/feedback.ts`):
  - `feedback_link` holds the label, a frozen `snapshot`, `allowComments`, `applicationIds`, `expiresAt`, `revokedAt` and `lastViewedAt` (`:12-43`).
  - `feedback_comment` holds an unverified `authorName` and a `body` (`:46-70`).
  - `feedback_event` records `created`, `viewed`, `commented` and `revoked` (`:72-96`).
- **Token.** The token is `<linkId>~<HMAC>` under a purpose-derived key and is not stored, so the owner can copy it again (`features/feedback/token.ts:6-24`).
- **Create.** Redacts the snapshot at creation, with `hideContactDetails: false`, so reviewers see contact details (`feedback/service.ts:191-195`). An account can have at most 50 active links (`:14`).
- **View.** Updates `lastViewedAt`, skips the owner, and logs a `viewed` event at most hourly (`:278-288`; `VIEW_EVENT_GAP_MS` at `:15`).
- **Comment.** Enforces `allowComments` and a comment cap (`:295-316`).
- **Route.** `apps/web/src/routes/feedback/$token.tsx` is a client page that queries `orpc.feedback.view` (`review-page.tsx:46`).

## Q3. What career-ops can reuse for a share page

- **Self-contained HTML is already produced.** `build-cv-html.mjs` merges a JSON payload into a template and owns all escaping (`build-cv-html.mjs:3-16`). The default template contains no `<script>` (`grep -c "<script" templates/cv-template.html` gives 0). That suits a strict CSP of `default-src 'none'`.
- **Fonts.** `generate-pdf.mjs` exports `inlineLocalFonts(html)` (`generate-pdf.mjs:2330`). It turns `url('./fonts/...')` references into data URLs and refuses traversal (`:2337-2342`). Run it before publishing so a served page does not depend on `./fonts/`.
- **The final HTML is already kept.** After a web pdf run, `keepTailoredHtml` copies the rendered HTML next to its PDF in `output/` (`web/src/lib/pdf-render.mjs:180-185`). The PDF path is `output/cv-{candidate}-{report}-{company}-{date}.pdf` (`pdf-paths.mjs:96`). The agent returns HTML through the `<<cv-html>>` envelope and the backend writes it (`cv-envelope.mjs:1-11`; `pdf-render.mjs:63-87`).
- **Contact block.** It is one element, `<div class="contact-row">` (`templates/cv-template.html:739-745`). A hide-contacts option can drop that element, or render a second payload without the contact fields. That is inference. RR's equivalent is data-level redaction (above).

So yes. A share page can be "serve this already-rendered HTML under a slug, with a password gate and a view counter." That matches RR's model closely. RR also serves stored, redacted output. It renders from data instead of storing HTML, but caches by content hash.

### Store

On the career-ops side, the share state is one user-layer file, `data/shares.json`. Each entry holds the slug, the source `output/` file, its sha256, the remote URL, whether a password is set, and the last-pulled counters. It is user-layer data because `data/` is in `USER_PATHS` (`update-system.mjs:346`; `DATA_CONTRACT.md` user table), so updates never touch it.

- **No password hashes in the user's tree.** The hash lives with the server that checks it. That is inference, and it is also how RR does it.
- **Reviewer comments come back as markdown.** They land in `data/share-feedback/{slug}.md`, so agents can read feedback the same way they read everything else. This keeps the agent-first contract.
- **Concurrency.** Only the share CLI writes the store. If two runs could overlap, wrap writes in `lib/dir-lock.mjs`, which is the one sanctioned lock protocol (`dir-lock.mjs:1-13`).

### Things to check

These are unverified:

1. A CV Studio edit is stored in `.career-ops-web/cv-studio/{n}.json` (`cv-studio/server.ts:77`). The `output/*.html` file may not reflect the latest Studio edits, so decide which artifact is the published one.
2. `build-cv-html.mjs` accepts a local photo path (`:143-148`) as well as data URLs (`:67`). A local path breaks once served elsewhere, so photos must be inlined.

## Q4. Architecture options

- **A1. Request-scoped per-user roots in one hosted web.** One Next process, `{ROOT}/users/{id}/`, a user table in sqlite, and share state in each user's root.
- **A2. Process per user.** One unmodified career-ops container per user, each with its own `CAREER_OPS_ROOT`, behind an auth gateway that routes `/{user}/*`. The gateway owns the user table. This is A's cheap variant, and it is inference that it works unchanged. Every Q1 problem is a per-process assumption, and A2 keeps one process per user.
- **B. Decoupled publish service.** Local single-user career-ops stays as it is. A small CLI uploads rendered HTML to a separate hosted service. The service owns accounts, slugs, passwords, counters and comments, and the CLI pulls counters and comments back into `data/`.
- **C. Postgres mirror.** User files mirrored into Postgres, so there are two write paths.

| | A1 request-scoped root | A2 process per user | B publish service | C Postgres mirror |
|---|---|---|---|---|
| Agent contract kept | Files are kept. Agent isolation is broken unless sandboxed (`cv-envelope.mjs:5-7`) | Fully. Each user is a normal install | Fully. Publishing reads `output/` and writes `data/` | Broken. Agents write files, the app writes rows, and "markdown is the source of truth" (`web/AGENTS.md` rule 2) stops being true |
| career-ops files changed | About 49 web files and 103 call sites, every spawn site, `run-registry.ts`, `apply/session.ts`, scheduler, plus new auth | None. New gateway and deploy config outside the core | None upstream. New fork-local `publish/` dir, plus one line in `config/local-paths.txt` | Every writer (`set-status.mjs`, `merge-tracker.mjs`, modes) or a watcher-syncer, plus a web data layer |
| Concurrency and locks | File locks are per root already. The global write token and headed browser collide across users | None new. Locks are per process and per root | Local writes to one JSON file under `dir-lock`. Service has one writer (node:sqlite) | Two-writer reconciliation. File locks don't cover the DB, so conflict resolution is needed |
| Upstream merges | Bad. 411 web commits in 90 days land on files you changed | No conflicts | No conflicts | Worst. Every new script that writes must be mirrored |
| Multi-user meaning | Hosted workspaces | Hosted workspaces | Many users publish. Each runs career-ops locally | Hosted workspaces |
| Share links | In-app route reading the user root | Gateway or a B-style service | Native | In-app |
| Ops cost | One process. Still needs OS sandboxing per agent run | One container per user (Playwright image, idle memory). Gateway auth | One small service with sqlite and static HTML | Postgres, sync daemon, migrations |
| Rough size (inference) | L, weeks, high risk | M. Gateway about 300-600 lines plus orchestration | S to M. Service about 400-600 lines, CLI about 150 | XL |

### Recommendation

Choose B now and keep A2 as the path to hosted multi-user. Reasons, each tied to evidence above:

1. **No upstream files touched.** The fork's merge cost scales with the files it diverges on (`.claude/skills/upstream-review/SKILL.md:12, 105`). `web/` is the most-churned area (411 commits in 90 days).
2. **The agent contract is untouched.** Share links consume an artifact career-ops already writes (`pdf-render.mjs:180-185`). Reviewer feedback returns as markdown in `data/`.
3. **It isolates the risky surface.** The public internet reaches only static, script-free CV HTML and a password form. It never reaches the dashboard whose routes spawn agents and write files (`origin-guard.mjs` header: an unauthenticated route there is "a remote-code-execution primitive").
4. **A1's isolation problem has no fix in code.** Agents can read any path, so per-user directories in one OS account are not a security boundary. That is the strongest reason against A1 and C.
5. **A2 reaches hosted multi-user without forking web/.** If hosted workspaces become a requirement, the gateway can also front B's service.

Copy from RR:

- data-level redaction before storing, which for career-ops means before uploading
- bcrypt, or stdlib `scrypt`, with a dummy hash on a miss and a per-client rate limit
- an HMAC access cookie bound to the password hash
- an hourly per-visitor view dedup that excludes the owner and crawlers
- signed, unstored feedback tokens holding a frozen snapshot
- a `no-store` cache policy

## Q5. Prototype for B (1 to 2 hours)

Build it first in the scratch dir, outside the repo. Promoting it means a new `publish/` directory and one line in `config/local-paths.txt`. Per `.claude/rules/dev-workflow.md`, a fork-local top-level dir belongs there. The prototype needs no edits to upstream files.

### What it must prove

1. **A real `output/*.html` renders standalone under a strict CSP.** Run `inlineLocalFonts` and inline the photo, then serve with `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:`. Load it in Chrome through the chrome-devtools MCP and check that no request fails and the layout matches the PDF.
2. **The password gate works.** Use `scrypt` from `node:crypto` (stdlib, no bcrypt dependency) and an HMAC cookie bound to the hash. Check four cases: wrong password gives 401, right password gives 303 plus a cookie, the cookie gives 200, and changing the password invalidates the cookie.
3. **The view counter is correct.** Two curl loops from different `X-Forwarded-For` keys count 2, not N. The owner (a bearer token) counts 0. A `Googlebot` user agent counts 0. 50 parallel requests lose no increments. Use node:sqlite `UPDATE ... SET views = views + 1`, the same built-in `tracker.mjs:183` uses.
4. **A feedback link round-trips.** Create a link and post a comment, then pull. `data/share-feedback/{slug}.md` appears in a temporary `CAREER_OPS_ROOT` and nothing else in it changes.
5. **Contact hiding.** With `--hide-contacts`, the uploaded HTML has no `.contact-row`, and `tel:` and `mailto:` are absent.

### Commands and files

- `node --version`. It must be 22 or newer for `node:sqlite`.
- Scratch files:
  - `/private/tmp/claude-501/-Users-jason-dev-career-ops/9d4e3414-0fa5-470a-ad4f-a6db69a9b9c4/scratchpad/arch/proto/server.mjs`, the `node:http` server: `PUT /api/shares/:slug`, `GET/POST /s/:slug`, `GET/POST /f/:token`, `GET /api/shares/:slug/stats`.
  - `/private/tmp/claude-501/-Users-jason-dev-career-ops/9d4e3414-0fa5-470a-ad4f-a6db69a9b9c4/scratchpad/arch/proto/share.mjs`, the CLI: `publish | stats | pull`. It imports `inlineLocalFonts` from `~/dev/career-ops/generate-pdf.mjs` and resolves the root through `getCareerOpsRoot()` from `~/dev/career-ops/path-resolver.mjs`, as AGENTS.md requires of new scripts.
  - `/private/tmp/claude-501/-Users-jason-dev-career-ops/9d4e3414-0fa5-470a-ad4f-a6db69a9b9c4/scratchpad/arch/proto/selfcheck.mjs`, assert-based checks for points 2 to 5.
- Run:
  - `CAREER_OPS_ROOT=<tmp root> node share.mjs publish --html <tmp root>/output/cv-x.html --slug x --password hunter22 --hide-contacts`
  - `node server.mjs`
  - `node selfcheck.mjs`
- The local store it writes is `<tmp root>/data/shares.json` plus `<tmp root>/data/share-feedback/x.md`. It writes nothing under `~/dev/career-ops`.
- If no `output/*.html` exists locally, make one with `node build-cv-html.mjs` on `examples/` payload data. That is unverified: check `node build-cv-html.mjs --help` for the payload flag first.

## Where things live

- `~/dev/career-ops/web/src/proxy.ts` and `~/dev/career-ops/web/src/lib/origin-guard.mjs` hold today's only access control.
- `~/dev/career-ops/web/src/lib/career-ops.ts` binds the data root (`careerOpsRoot`, 37-61).
- `~/dev/career-ops/web/src/lib/core-cli.ts` and `~/dev/career-ops/web/src/app/api/run/route.ts` are where spawned children inherit the env.
- `~/dev/career-ops/web/src/lib/core/run-registry.ts` and `~/dev/career-ops/web/src/lib/apply/session.ts` hold the process-global state.
- `~/dev/career-ops/web/src/lib/pdf-render.mjs` keeps the published HTML in `output/` (`keepTailoredHtml`).
- `~/dev/career-ops/generate-pdf.mjs:2330` is `inlineLocalFonts`.
- `~/dev/career-ops/update-system.mjs:334-348` is `USER_PATHS`, which covers `data/` and `.career-ops-web/`.
- RR:
  - `apps/server/src/http/app.ts:176-204`, the routes
  - `apps/server/src/static/resume-page.ts`, the page and password form
  - `packages/api/src/features/resume/{web-page,access-policy,access,view-dedup,service}.ts`
  - `packages/pdf/src/html/{web-page.tsx,to-html.ts}`
  - `packages/api/src/features/feedback/{service,token}.ts`
  - `packages/db/src/schema/{resume,feedback}.ts`

## Gotchas

- The empty `web/src/app/login/` makes an auth layer look half-built. It is only a loading skeleton.
- `CAREER_OPS_WEB_ALLOWED_HOSTS` widens the bind, but the guard still trusts a spoofed `Host: localhost` from the LAN (`origin-guard.mjs` header). Putting the dashboard on the internet behind only that variable is unsafe.
- RR's public page and RR's feedback page use different renderers: server HTML on one, a PDF canvas on the other. For career-ops, one HTML artifact can serve both.
- RR's feedback snapshot keeps contact details (`feedback/service.ts:193`) while the public page can hide them. Decide this per link, not per resume.

Not checked: whether Studio edits reach `output/*.html`; the photo path behaviour; the exact `build-cv-html.mjs` CLI flags. Commit counts come from this checkout's merged history (upstream plus fork), not from upstream alone. Nothing was run in the RR clone, and nothing was written in ~/dev/career-ops.
