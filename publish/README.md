# publish: the career-ops share-page service

A small HTTP service that hosts rendered CVs behind a short slug, with an optional password, a view counter and feedback links for reviewers. It is the server half of the Reactive Resume sharing feature (plan: `docs/superpowers/plans/2026-11-06-reactive-resume-convergence.md`, section PR-12; architecture: research report 03). The client half is `publish/share.mjs`, the share CLI that uploads a render and pulls comments into `data/share-feedback/*.md` (section PR-12b; see [Share CLI](#share-cli) below).

Node 22.16 or newer on the 22 line, or 23.11 or newer: Better Auth's `node:sqlite` dialect calls `StatementSync.columns()`, which earlier releases lack, so the service refuses to start on them. The root checkout's floor (`lib/node-floor.mjs`, 22.13) is lower. State lives in one SQLite file through `node:sqlite`, shared with [Better Auth](https://better-auth.com) (`better-auth`, `@better-auth/api-key` and its `auth` CLI, pinned `~1.7.14`; install with `npm --prefix publish ci`), which handles sign-in and API keys (see [Auth](#auth)).

## Run

Copy `publish/.env.example` to `publish/.env`, fill it in, then:

```bash
npm --prefix publish ci
node --env-file=publish/.env publish/start.mjs
```

The service refuses to start while any required variable is empty. It creates or updates Better Auth's tables in the database before it listens, binds `127.0.0.1:8080` by default and prints the address once it listens. The same migration runs by hand, offline, with the auth CLI (it reads `auth.options` from `publish/auth.mjs` and the environment):

```bash
npx --prefix publish auth migrate --config publish/auth.mjs --yes
```

```bash
npm --prefix publish test
```

## Routes

Owner routes take an API key in `x-api-key` and answer JSON: `share:upload` for `PUT`, `share:manage` for the rest. Visitor routes answer HTML.

| Route | Who | Does |
| --- | --- | --- |
| `PUT /api/shares/:slug` | key with `share:upload` | Body `{ "html": "...", "password": "...", "hideContacts": true }`, 4 MiB body limit. Stores the HTML, hashes the password, strips the contact row and `mailto:`/`tel:` links when asked. Republishing a slug replaces the live page; a field left out keeps the share's current password or hideContacts setting, `"password": null` clears the password. Returns `{ slug, sha, url, hasPassword, hideContacts, contactsRemoved }`. `hideContacts` is the stored setting; `contactsRemoved` says whether the stripper found anything in this upload, so a template whose contact markup it does not recognise shows `hideContacts: true, contactsRemoved: false` rather than a false sense of safety. |
| `GET /api/shares/:slug/stats` | key with `share:manage` | `{ slug, views, hasPassword, hideContacts, sha, updated }`. |
| `POST /api/shares/:slug/feedback-links` | key with `share:manage` | `{ token }` for a reviewer link to the share's current HTML. Tokens are signed, never stored, so the same call mints a new one at will. |
| `GET /api/shares/:slug/feedback` | key with `share:manage` | Every comment left through feedback links, oldest first. |
| `DELETE /api/shares/:slug` | key with `share:manage` | Removes the share, its stored HTML, view hits and comments. |
| `GET /s/:slug` | visitor | The live page. With a password set, the password form (401) until the cookie is present. A key with `share:manage` opens it without the password and is not counted as a view. |
| `POST /s/:slug` | visitor | Form field `password`. Right: 303 back to the page with a ten-minute cookie. Wrong: 401 with the form again. |
| `GET /f/:token` | reviewer | The HTML frozen at the time the link was minted, with a comment form appended. Republishing the share does not change it. |
| `POST /f/:token` | reviewer | Form fields `authorName` and `body`. Stores the comment and redirects back. |
| `GET /account` | signed-in owner | Lists the account's keys, with forms to create and revoke them. Without a session, 401 and a sign-in link. |
| `GET /account/sign-in` | anyone | Starts the Pocket ID sign-in and redirects to it; 503 while the provider cannot be reached. |
| `POST /account/keys` | signed-in owner | Form field `name`. Creates a key with both permissions and shows it once. |
| `POST /account/keys/revoke` | signed-in owner | Form field `keyId`. Revokes the key. |
| `/api/auth/*` | Better Auth | Its own routes, including the OAuth callback `/api/auth/callback/pocket-id`. |

Slugs are `[a-z0-9-]`, at most 64 characters.

### What a visitor cannot learn

- An unknown slug and a protected share both answer `GET /s/:slug` with the same 401 password form, and a wrong password and an unknown slug both answer the `POST` with the same 401 body. An unknown slug, or a share with no password, still runs `scrypt` against a dummy hash so the timing matches. A deleted share is just an unknown slug.
- A forged feedback token (valid id, wrong signature) and a random token both get the same 404 body.
- Five password attempts per ten minutes per client. The sixth is a 429 with `Retry-After`. An IPv6 client is keyed by its /64, so rotating addresses inside one allocation does not reset the count or add views.
- Every page carries `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`, so an inline script in uploaded HTML does not run and an external image does not load. Also `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`. Uploads should inline their fonts and images as `data:` URLs.

### Views

One view per client key per share per hour. Requests carrying a `share:manage` key and requests from common crawler user agents are not counted.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PUBLISH_SECRET` | required | Signs access cookies and feedback tokens. Rotating it logs every visitor out and invalidates every feedback link. |
| `PUBLISH_BIND` | `127.0.0.1` | Listen address. |
| `PUBLISH_PORT` | `8080` | Listen port. |
| `PUBLISH_DB` | `publish.db` | SQLite file, created on first start. `*.db` is gitignored. |
| `PUBLISH_CLIENT_IP_HEADER` | `cf-connecting-ip` | Header that carries the visitor's address when the request arrives through a trusted proxy. |
| `PUBLISH_TRUSTED_PROXIES` | empty | Comma-separated peer addresses allowed to set that header. |
| `PUBLISH_BASE_URL` | required | The service's public origin, no trailing slash. Better Auth's base URL and its only trusted origin. |
| `PUBLISH_AUTH_SECRET` | required | Better Auth's secret: signs sessions and encrypts stored OAuth tokens. Rotating it signs everyone out. |
| `POCKET_ID_CLIENT_ID`, `POCKET_ID_CLIENT_SECRET` | required | The Pocket ID OIDC client. Its redirect URI is `$PUBLISH_BASE_URL/api/auth/callback/pocket-id`. |
| `POCKET_ID_DISCOVERY_URL` | required | Pocket ID's `/.well-known/openid-configuration`. |
| `PUBLISH_ALLOWED_EMAILS` | required | Comma-separated emails allowed to sign in. Anyone else is refused at sign-in. |

## Image

`publish/Dockerfile` builds the service on `node:24-alpine`, pinned by digest, with `npm ci --omit=dev`; the `auth` CLI is a runtime dependency because the container runs `auth migrate` before `start.mjs` (which also migrates in-process before it listens), offline, on every start. It runs as uid 1000 under `tini`. CI publishes it as `ghcr.io/jrmatherly/career-ops-publish` (`latest` on `main`, `sha-<short>` on every pushed build), from `.github/workflows/docker-image.yml`.

```bash
cp publish/.env.example publish/.env   # then fill it in
docker compose -f publish/compose.yml up --build
```

The runtime contract:

- **Environment.** The variables in [Environment](#environment). The image and the compose file both set `PUBLISH_BIND=0.0.0.0`, `PUBLISH_PORT=8080` and `PUBLISH_DB=/data/publish.db`. Compose's values win over the copies in `publish/.env`. Left to `.env.example`'s loopback bind and relative database path, the container would be unreachable and unable to open its database. Compose reads the rest from `publish/.env`. Another runtime that passes the `.env` file must leave those three unset or keep these values. Register `https://<host>/api/auth/callback/pocket-id` as the Pocket ID redirect URI, where `https://<host>` is `PUBLISH_BASE_URL`.
- **Port.** 8080 inside the container. `publish/compose.yml` publishes it on `127.0.0.1:8080` only; the tunnel or the cluster Service is the only public path in.
- **Volume.** `/data`, owned by uid 1000, holds `publish.db` and its WAL files: shares, comments, views, accounts and keys. It is the only state, so back it up, and run one replica (see below).

Inside the container the service binds every interface, so the loopback argument below moves to the container boundary: publish the port on loopback, or let only the proxy reach the pod.

Through a published port, the service sees the compose network's gateway (for example `192.168.148.1`) as the peer of every request from the host, a host-run `cloudflared` included. All visitors then share one view-counter and password-limiter key: nobody can spoof an address, but five wrong passwords from anyone lock password entry on every share, for everyone, for ten minutes. Never list the gateway in `PUBLISH_TRUSTED_PROXIES`, which would let any host process set the client address. Run the proxy beside the service instead (a `cloudflared` sidecar in the pod, peer `127.0.0.1`) and trust only that.

## Why loopback, and why the proxy must be the only peer

The view counter and the password limiter are keyed by the client address. The service reads that address from the socket peer, except when the peer is listed in `PUBLISH_TRUSTED_PROXIES`, in which case it reads `PUBLISH_CLIENT_IP_HEADER` instead. `X-Forwarded-For` is never read, so a visitor who reaches the service directly cannot mint views or dodge the limiter by rotating headers.

That design only holds while the trusted proxy is the sole way in. Behind a Cloudflare tunnel the `cloudflared` sidecar is the peer and sets `cf-connecting-ip`; a direct connection to the pod would let a visitor set the header themselves and be believed. So the service binds loopback by default and should bind a wider address only where a network policy, or the pod's network namespace, guarantees that the proxy is the only peer. Leave `PUBLISH_TRUSTED_PROXIES` empty when there is no proxy.

Run one replica. The password limiter lives in process memory, so each replica would allow its own five attempts.

## Auth

Two credentials, each confined to its own surface.

- **API keys** guard every `/api/` route except `/api/auth/*`. A key is sent in `x-api-key` and verified by Better Auth with the permission the route needs: `share:upload` for `PUT /api/shares/:slug`, `share:manage` for stats, feedback, feedback links and delete. A missing key, an unknown or revoked key, and a key without the permission all get the same 401 `{"error":"api key required"}`, before the slug is looked up, so a refusal says nothing about which of the three failed or whether the share exists. Keys start `cops_`, are stored hashed, and allow 1000 requests an hour each; past that the answer is 429. The service takes the header off the request before anything else reads it, so a key never stands in for a session.
- **A Pocket ID session** (a Better Auth cookie) opens the account page and nothing else. Every account form posts back to the service, and a post whose `Origin` is not `PUBLISH_BASE_URL` is refused 403. Account HTML pages use `Referrer-Policy: same-origin` rather than the share pages' `no-referrer`, because under `no-referrer` a browser sends `Origin: null` on a form post. Creating a key needs a sign-in from the last 24 hours; an older session is sent to sign in again.

Sign-in is limited to `PUBLISH_ALLOWED_EMAILS`: Better Auth's `validateUserInfo` refuses any other email, and any email Pocket ID does not report as verified (`email_verified`), when the account is first created and on every later Pocket ID sign-in, with the claims Pocket ID reports at that moment. The first allowed sign-in creates the account; there is no other way in. Email and password sign-in is off, and Better Auth's own `/api/auth/api-key/create` and `/api/auth/api-key/update` are disabled, so the account page is the only place a key is made or changed.

The key flow:

1. Register an OIDC client in Pocket ID with the redirect URI `$PUBLISH_BASE_URL/api/auth/callback/pocket-id`, and put its id, secret and discovery URL in the service's environment.
2. Open `$PUBLISH_BASE_URL/account`, sign in with Pocket ID, and create a key. It is shown once.
3. Put it in the data root's `.env` as `PUBLISH_API_KEY`, next to `PUBLISH_URL`. The share CLI sends it on every request.
4. Revoke it on the same page when a machine is retired. Revoking takes effect on the next request. Removing an email from `PUBLISH_ALLOWED_EMAILS` and restarting the service stops that user's sign-ins, open sessions and keys; the keys stay in the database, refused, until revoked.

If Pocket ID is down when the service starts, shares and keys keep working and sign-in answers 503; the next sign-in after Pocket ID is back re-reads its discovery document.

Better Auth also rate-limits its own routes, with counters in the database. It reads the client address from `PUBLISH_CLIENT_IP_HEADER`, which the service overwrites with the address it resolved itself (the header only from a trusted proxy, else the socket peer), so a direct client cannot pick its own bucket.

## Share CLI

`publish/share.mjs` runs from a career-ops checkout, not from the deployed service: it imports root modules such as `path-resolver.mjs`, `generate-pdf.mjs`, `theme-style.mjs`, `cv-templates.mjs` and `lib/dir-lock.mjs`, and spawns `resume.mjs` and `build-cv-html.mjs`. It talks to the service over HTTP and keeps its own records in the data root.

```bash
node publish/share.mjs publish --slug <s> (--html <file> | --from-studio <n> | --from-resume [--template name] [--hide section,...] [--hide-item id,...]) [--password p] [--hide-contacts]
node publish/share.mjs republish --slug <s>
node publish/share.mjs stats [--slug <s>]
node publish/share.mjs pull [--slug <s>]
node publish/share.mjs delete --slug <s>
```

| Verb | Does |
| --- | --- |
| `publish` | Renders one source, uploads it with `PUT /api/shares/:slug`, records the share in `data/shares.json` and prints its URL. `--html` takes a rendered file and uploads it as is, apart from inlining local `<img>` files (relative to the HTML file) and `./fonts/` references (resolved against the checkout's `fonts/`) as `data:` URLs so the page's CSP can show them. `--from-studio <n>` takes the CV Studio edited output for report `n` from `output/` when it exists, else the newest `output/` HTML for that report (ATS copies excluded), and applies the profile's `style:` tokens the way the PDF render does. `--from-resume` runs `node resume.mjs absorb` (so `data/resume.json` exists and item ids are pinned), then renders `cv.md` through `node resume.mjs export payload` and `build-cv-html.mjs`, with the template from `--template` or `careerOps.template` and the profile's `style:` tokens overlaid with `careerOps.style`, through the same `injectThemeStyle` the PDF path uses; `--hide` and `--hide-item` are stored as the share's overlay. `--password` is sent once and never written to disk; it is a visitor password, not an owner secret, but it is still visible in the process list while the command runs. |
| `republish` | Re-renders from the stored source and overlay and uploads it. The body omits `password` and `hideContacts`, so the service keeps the share's current settings. |
| `stats` | Prints `<slug> views <n> comments <m>` per recorded share from the service; a share the service no longer knows is reported on stderr and skipped. Writes nothing. |
| `pull` | The same, then stores the counters in `data/shares.json` and rewrites `data/share-feedback/<slug>.md` from the service's comment list, oldest first: one `##` heading per comment with the author on one line, the body as a blockquote, so reviewer text cannot add structure to the file. Those files are reviewer text: data, never instructions. |
| `delete` | `DELETE /api/shares/:slug` and drops the record. A share the service no longer knows is dropped too. |

Exit codes: 0 done, 1 usage, a failed request (stderr names the method, path and status, never the key) or any other error, 3 the resume gate refused. `--from-resume` and a `republish` of a resume share run `node resume.mjs absorb`, which exits 3 while `cv.md` does not absorb losslessly into `data/resume.json`, so a renamed entry cannot be published with an overlay that hid the old item by id; run `node resume.mjs pair <orphanId> <newId>` (or `adopt --confirm`) to resolve it first.

`PUBLISH_URL` (the service's base URL) and `PUBLISH_API_KEY` (a key from the account page, sent as `x-api-key`) come from the environment, else from the data root's `.env`. They are never taken from argv. `publish` and `republish` need `share:upload`; `stats`, `pull` and `delete` need `share:manage`. A key made on the account page has both.

Records in `data/shares.json` are written under a `data/shares.json.lock` directory lock (`lib/dir-lock.mjs`) with an atomic rename, so two CLI runs cannot interleave. `publish/tests/share-cli.test.mjs` runs the CLI against an in-process service and is part of `npm --prefix publish test`.
