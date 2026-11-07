# publish: the career-ops share-page service

A small HTTP service that hosts rendered CVs behind a short slug, with an optional password, a view counter and feedback links for reviewers. It is the server half of the Reactive Resume sharing feature (plan: `docs/superpowers/plans/2026-11-06-reactive-resume-convergence.md`, section PR-12; architecture: research report 03). The client half, the share CLI that uploads a render and pulls comments into `data/share-feedback/*.md`, lands in PR-12b.

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
| `PUT /api/shares/:slug` | owner | Body `{ "html": "...", "password": "...", "hideContacts": true }`, 4 MiB body limit. Stores the HTML, hashes the password, strips the contact row and `mailto:`/`tel:` links when asked. Republishing a slug replaces the live page; a field left out keeps the share's current password or hideContacts setting, `"password": null` clears the password. Returns `{ slug, sha, url, hasPassword, hideContacts }`, where `hideContacts` is true only when something was removed, so a template whose contact markup the stripper does not recognise reports false instead of a false sense of safety. |
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
