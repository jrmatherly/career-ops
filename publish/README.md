# publish: the career-ops share-page service

A small HTTP service that hosts rendered CVs behind a short slug, with an optional password, a view counter and feedback links for reviewers. It is the server half of the Reactive Resume sharing feature (plan: `docs/superpowers/plans/2026-11-06-reactive-resume-convergence.md`, section PR-12; architecture: research report 03). The client half is `publish/share.mjs`, the share CLI that uploads a render and pulls comments into `data/share-feedback/*.md` (section PR-12b; see [Share CLI](#share-cli) below).

Standard library only. Node 22.13 or newer, except 23.0 to 23.3, where `node:sqlite` is still behind a flag (see `lib/node-floor.mjs`). State lives in one SQLite file through `node:sqlite`.

## Run

```bash
PUBLISH_OWNER_TOKEN=$(openssl rand -hex 32) PUBLISH_SECRET=$(openssl rand -hex 32) npm --prefix publish start
```

The service refuses to start without both secrets. It binds `127.0.0.1:8080` by default and prints the address once it listens.

```bash
npm --prefix publish test
```

## Routes

Owner routes take `Authorization: Bearer $PUBLISH_OWNER_TOKEN` and answer JSON. Visitor routes answer HTML.

| Route | Who | Does |
| --- | --- | --- |
| `PUT /api/shares/:slug` | owner | Body `{ "html": "...", "password": "...", "hideContacts": true }`, 4 MiB body limit. Stores the HTML, hashes the password, strips the contact row and `mailto:`/`tel:` links when asked. Republishing a slug replaces the live page; a field left out keeps the share's current password or hideContacts setting, `"password": null` clears the password. Returns `{ slug, sha, url, hasPassword, hideContacts, contactsRemoved }`. `hideContacts` is the stored setting; `contactsRemoved` says whether the stripper found anything in this upload, so a template whose contact markup it does not recognise shows `hideContacts: true, contactsRemoved: false` rather than a false sense of safety. |
| `GET /api/shares/:slug/stats` | owner | `{ slug, views, hasPassword, hideContacts, sha, updated }`. |
| `POST /api/shares/:slug/feedback-links` | owner | `{ token }` for a reviewer link to the share's current HTML. Tokens are signed, never stored, so the same owner call mints a new one at will. |
| `GET /api/shares/:slug/feedback` | owner | Every comment left through feedback links, oldest first. |
| `DELETE /api/shares/:slug` | owner | Removes the share, its stored HTML, view hits and comments. |
| `GET /s/:slug` | visitor | The live page. With a password set, the password form (401) until the cookie is present. |
| `POST /s/:slug` | visitor | Form field `password`. Right: 303 back to the page with a ten-minute cookie. Wrong: 401 with the form again. |
| `GET /f/:token` | reviewer | The HTML frozen at the time the link was minted, with a comment form appended. Republishing the share does not change it. |
| `POST /f/:token` | reviewer | Form fields `authorName` and `body`. Stores the comment and redirects back. |

Slugs are `[a-z0-9-]`, at most 64 characters.

### What a visitor cannot learn

- An unknown slug and a protected share both answer `GET /s/:slug` with the same 401 password form, and a wrong password and an unknown slug both answer the `POST` with the same 401 body. An unknown slug, or a share with no password, still runs `scrypt` against a dummy hash so the timing matches. A deleted share is just an unknown slug.
- A forged feedback token (valid id, wrong signature) and a random token both get the same 404 body.
- Five password attempts per ten minutes per client. The sixth is a 429 with `Retry-After`. An IPv6 client is keyed by its /64, so rotating addresses inside one allocation does not reset the count or add views.
- Every page carries `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`, so an inline script in uploaded HTML does not run and an external image does not load. Also `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`. Uploads should inline their fonts and images as `data:` URLs.

### Views

One view per client key per share per hour. Requests carrying the owner token and requests from common crawler user agents are not counted.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PUBLISH_OWNER_TOKEN` | required | Bearer token for every `/api/` route. PR-13 replaces it with per-user auth. |
| `PUBLISH_SECRET` | required | Signs access cookies and feedback tokens. Rotating it logs every visitor out and invalidates every feedback link. |
| `PUBLISH_BIND` | `127.0.0.1` | Listen address. |
| `PUBLISH_PORT` | `8080` | Listen port. |
| `PUBLISH_DB` | `publish.db` | SQLite file, created on first start. `*.db` is gitignored. |
| `PUBLISH_CLIENT_IP_HEADER` | `cf-connecting-ip` | Header that carries the visitor's address when the request arrives through a trusted proxy. |
| `PUBLISH_TRUSTED_PROXIES` | empty | Comma-separated peer addresses allowed to set that header. |

## Why loopback, and why the proxy must be the only peer

The view counter and the password limiter are keyed by the client address. The service reads that address from the socket peer, except when the peer is listed in `PUBLISH_TRUSTED_PROXIES`, in which case it reads `PUBLISH_CLIENT_IP_HEADER` instead. `X-Forwarded-For` is never read, so a visitor who reaches the service directly cannot mint views or dodge the limiter by rotating headers.

That design only holds while the trusted proxy is the sole way in. Behind a Cloudflare tunnel the `cloudflared` sidecar is the peer and sets `cf-connecting-ip`; a direct connection to the pod would let a visitor set the header themselves and be believed. So the service binds loopback by default and should bind a wider address only where a network policy, or the pod's network namespace, guarantees that the proxy is the only peer. Leave `PUBLISH_TRUSTED_PROXIES` empty when there is no proxy.

Run one replica. The password limiter lives in process memory, so each replica would allow its own five attempts.

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

Exit codes: 0 done, 1 usage, a failed request (stderr names the method, path and status, never the token) or any other error, 3 the resume gate refused. `--from-resume` and a `republish` of a resume share run `node resume.mjs absorb`, which exits 3 while `cv.md` does not absorb losslessly into `data/resume.json`, so a renamed entry cannot be published with an overlay that hid the old item by id; run `node resume.mjs pair <orphanId> <newId>` (or `adopt --confirm`) to resolve it first.

`PUBLISH_URL` (the service's base URL) and `PUBLISH_OWNER_TOKEN` come from the environment, else from the data root's `.env`. They are never taken from argv. PR-13 replaces the owner token with `PUBLISH_API_KEY`.

Records in `data/shares.json` are written under a `data/shares.json.lock` directory lock (`lib/dir-lock.mjs`) with an atomic rename, so two CLI runs cannot interleave. `publish/tests/share-cli.test.mjs` runs the CLI against an in-process service and is part of `npm --prefix publish test`.
