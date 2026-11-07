# Better Auth for the publish service and multi-user options

Subagent research report, 2026-11-06. Model output: claims carry file:line evidence or are labelled inference; verify against the code before relying on one.

# Better Auth for the career-ops publish service and multi-user options

I checked this against the Better Auth v1.7 (Latest) docs (https://better-auth.com/llms.txt) and against a prototype running better-auth@1.7.14 and @better-auth/api-key@1.7.14 on Node v24.22.2. npm's `latest` is 1.7.18. This machine's npm has `min-release-age=7`, which refuses anything newer than 1.7.14, so the prototype ran on 1.7.14. I did not override that policy. Reactive Resume (RR) pins 1.7.12 (`scratchpad/rr/repo/pnpm-workspace.yaml:9-12`). The exact commands and outputs are in `/private/tmp/claude-501/-Users-jason-dev-career-ops/9d4e3414-0fa5-470a-ad4f-a6db69a9b9c4/scratchpad/auth/RESULTS.md`. The harness refused to write `scratchpad/auth/report.md` ("Subagents should return findings as text"), so this message is the only copy of the report.

## Overview

Better Auth runs fine as a plain `node:http` service on the built-in `node:sqlite` driver with no ORM. In the prototype I:
- ran the migration with the official CLI;
- booted the server and got a response from `/api/auth/ok`;
- created an API key server-side;
- resolved both an `x-api-key` header and a signed session cookie to the user through `auth.api.getSession`.

The run also turned up three things the docs only hint at:
1. An invalid key makes `getSession` throw. That crashed my first server.
2. With session mocking on, an API key can create more API keys.
3. The default per-key limit is 10 requests per day.

**Recommendation, in order:**
1. **S first.** Accounts live only in the publish service, the CLI uploads with a scoped API key, and Pocket ID is the only way to sign in.
2. **W only when needed.** Add it when the dashboard has to be reachable beyond loopback. It is a login on a single-user app, not multi-tenancy.
3. **A2 only for a second hosted user.** Build it when a second person needs their own career-ops. Let the gateway own identity (Envoy Gateway's native OIDC against Pocket ID, or oauth2-proxy) and give each user their own hostname.

## Key concepts

- **Kysely built-in adapter.** If you pass a raw driver object as `database`, Better Auth wraps it in Kysely. The adapter recognizes `node:sqlite`'s `DatabaseSync` on its own (`proto/node_modules/@better-auth/kysely-adapter/dist/index.mjs:86-99`). This is the path `npx auth migrate` supports (https://better-auth.com/docs/concepts/rate-limit, Storage callout: "The `migrate` command only works if you're using the built-in Kysely adapter").
- **Session mocking.** `apiKey({ enableSessionForAPIKeys: true })` makes every Better Auth endpoint, and `auth.api.getSession`, accept `x-api-key` as a full user session (https://better-auth.com/docs/plugins/api-key/advanced#sessions-from-api-keys). The docs call it "generally not recommended".
- **Verify-key pattern.** RR leaves mocking off (`rr/repo/packages/auth/src/config.ts:1118`). It calls `auth.api.verifyApiKey` itself and removes `x-api-key` before any cookie session lookup (`rr/repo/packages/api/src/context.ts:62-104`).
- **Generic OAuth in 1.7.** Generic providers are now ordinary social providers. The callback is `/api/auth/callback/:providerId`, not the old `/oauth2/callback/:id` (https://better-auth.com/docs/plugins/generic-oauth#handle-oauth-callback; RR comment at `config.ts:686-688`).

## How it works

### Q1. Mounting on plain Node, and the database

**Mounting.**
- `toNodeHandler(auth)` from `better-auth/node` returns a handler for Node's request and response objects (`proto/node_modules/better-auth/dist/integrations/node.d.mts`).
- The Express guide uses exactly this and adds `fromNodeHeaders` for `getSession` (https://better-auth.com/docs/integrations/express). On bare `node:http` it needs only a path-prefix check, which is what `proto/server.mjs` does.
- Hono is also documented (https://better-auth.com/docs/integrations/hono; I found the page by search but did not read it). Per the create-auth skill its handler is `auth.handler(c.req.raw)`. Hono adds a dependency for routing that takes about ten lines to write yourself.
- Any body parser must run after the auth handler, because it consumes the request stream (Express guide callout).

**Health route.** `GET /api/auth/ok` returned `200 {"ok":true}` (measured). The best-practices skill says `{ status: "ok" }`, but the running code returns `{"ok":true}`.

**Database.**
- The SQLite adapter page calls better-sqlite3 "Recommended". It lists `node:sqlite` `DatabaseSync` as supported but still Release Candidate as of Node 24.15, with migrate and generate both supported (https://better-auth.com/docs/adapters/sqlite).
- In the prototype, `new DatabaseSync("auth.sqlite")` plus `npx --yes auth@1.7.14 migrate --config auth.mjs --yes` created the tables `account, apikey, session, user, verification` (measured).

**My pick for "one sqlite file, no ORM" is `node:sqlite` through the built-in adapter.**
- The publish service already uses the same driver for its own tables.
- It needs no native build in the container image.
- The CLI migrates it.
- better-sqlite3 is the conservative fallback, and switching is a one-line change.
- Drizzle or Prisma would add a schema-generation step and a second migration tool for a five-table schema.
- Kysely is already inside Better Auth, so "use Kysely" and "use the built-in adapter" are the same choice.

### Q2. Plugins and switches

| Need | How | Evidence |
| --- | --- | --- |
| Pocket ID OIDC | `genericOAuth({ config: [{ providerId: "pocket-id", clientId, clientSecret, discoveryUrl: "https://<pocket-id>/.well-known/openid-configuration", scopes: ["openid","email","profile"] }] })` from `better-auth/plugins/generic-oauth`. Register `https://<share-host>/api/auth/callback/pocket-id` in Pocket ID. With discovery, PKCE, issuer validation, id_token JWKS verification and nonce binding are on by default. | generic-oauth doc. In the prototype a failed discovery skipped the provider and the server stayed up. |
| CLI upload key | `apiKey` now ships as `@better-auth/api-key`. Default header is `x-api-key`. | api-key advanced doc; RR `config.ts:11`; prototype |
| 2FA | `twoFactor` from `better-auth/plugins/two-factor` | RR `config.ts:28,1110-1114` |
| Passkeys | Separate package, `@better-auth/passkey` | RR `config.ts:15,1108`; create-auth skill |
| Admin | `admin()` from `better-auth/plugins/admin`. Migrate added `role, banned, banReason, banExpires` to user and `impersonatedBy` to session. An `adminUserIds` option exists. | `proto/node_modules/better-auth/dist/plugins/admin/types.d.mts:70`; RESULTS.md |
| No email and password | Don't set `emailAndPassword`. It is off unless you set `{ enabled: true }`. RR toggles it with `enabled: !env.FLAG_DISABLE_EMAIL_AUTH`. | best-practices skill; RR `config.ts:958-966` |
| No self sign-up | `disableSignUp: true` on the genericOAuth provider config. Only existing users can sign in. | generic-oauth doc; RR `config.ts:678` |
| Allow-list | `user.validateUserInfo` returns `{ error }` to reject a user. It runs at create, at link, and on every re-sign-in, with the fresh provider email. | generic-oauth doc, "Validate OAuth User Info" |

**Allow-list choice.** For a few people, `validateUserInfo` with a list of emails is simpler than the admin plugin. The admin plugin earns its place once you want banning, roles and impersonation from a UI. Pocket ID may also be able to limit a client to certain user groups, which would be a second gate at the identity provider. I have not checked that against Pocket ID's docs.

**Migration command.** It is now `npx auth@latest migrate`, from the `auth` package, with `generate` for ORM schemas. The name in the brief, `npx @better-auth/cli migrate`, is the old one. Re-run it after adding a plugin. It worked against `node:sqlite` (measured).

### Q3. Multi-user options for career-ops

**S. Accounts only on the sharing side.**
- Only the publish service has users.
- Each person runs career-ops locally and uploads rendered CV HTML with `x-api-key`, which is RR's model (`context.ts:82-86`).
- The only career-ops change is a fork-local upload script.
- The prototype proves the key path end to end.

**W. Better Auth inside the Next app.** It would take four changes:
1. **Config and route.** Add `web/src/lib/auth.ts` with the config, and `web/src/app/api/auth/[...all]/route.ts` exporting `toNextJsHandler(auth)`. Both `toNextJsHandler` and `nextCookies` are exported by `proto/node_modules/better-auth/dist/integrations/next-js.d.mts`.
2. **Session check in `web/src/proxy.ts`.** Next 16's proxy runs on the Node.js runtime and cannot be switched to edge (`web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:255,806`). So it can call `auth.api.getSession` directly instead of only checking that the cookie exists.
3. **An exemption for the login callback.** Pocket ID's callback arrives as a top-level cross-site navigation.
   - `checkRequest` blocks every request whose `Sec-Fetch-Site` is not `same-origin` or `none` (`web/src/lib/origin-guard.mjs:158-161`).
   - `proxy.ts` applies that check to every path except build assets (`web/src/proxy.ts:45`).
   - So `/api/auth/callback/*` must skip the origin check, or the OIDC login fails with 403. I inferred this from the code and did not run it.
4. **Exposure.**
   - The Host filter admits only loopback or hosts listed in `CAREER_OPS_WEB_ALLOWED_HOSTS` (`origin-guard.mjs:137-144`).
   - The interface the server binds to decides who can connect at all (`origin-guard.mjs:36-43`, `web/src/lib/bind-host.mjs:33-34`).
   - Using it off-loopback means opting in a host and binding wider.

**What W adds, and what it doesn't.**
- Today the guard stops drive-by CSRF and DNS rebinding. Its own header comment says it cannot stop a direct client that sends `Host: localhost` (`origin-guard.mjs:36-38`). Being on the machine is the only authentication.
- W puts a real identity check in front of pages and `/api/*`. That is what makes a wider bind safe to run.
- W does not add tenancy:
  - The data root comes from process env, read on every call (`web/src/lib/career-ops.ts:37-61`, 103 call sites).
  - Agent child processes inherit `process.env` and start with `cwd: careerOpsRoot()` (`web/src/app/api/run/route.ts:231-236`).
  - Tool grants go by tool name, not by path (`web/src/lib/cv-envelope.mjs:5-7`, cited in `scratchpad/arch/report.md:60`).
- A second user would therefore share one data root and one agent sandbox. W is a login on a single-user dashboard. It helps you reach your own dashboard from a phone through the tunnel. It gives a second person nothing.

**A2. One container per user behind a gateway.**

Better Auth can be the gateway's identity source, mechanically.
- The prototype's `/forward-auth` route calls `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })`. It returns `200` with `x-auth-user-id` and `x-auth-user-email`, or `401`.
- A signed session cookie got 200 and a tampered one got 401 (measured, RESULTS.md finding 7).
- Traefik `forwardAuth` expects exactly this: a 2xx passes, and `authResponseHeaders` copies identity to the backend (https://oneuptime.com/blog/post/2026-01-23-traefik-forward-authentication/view).
- So does Envoy Gateway `extAuth.http` with `headersToBackend` (https://gateway.envoyproxy.io/docs/tasks/security/ext-auth/).

There are two catches.
- Envoy's HTTP ext-auth forwards only Host, Method, Path, Content-Length and Authorization to the auth service by default. `headersToExtAuth` must add `cookie`, or every check returns 401 (https://gateway.envoyproxy.io/v1.2/api/extension_types/).
- The authorizer, not Better Auth, must check that the requested tenant matches the session user. Without that check, any signed-in user reaches every container. The gateway does the routing itself, with one HTTPRoute per user.

Prior art and the simpler path.
- A web search found generic forward-auth services (https://github.com/govengers/auth/wiki/Forward-Auth, https://github.com/mkuhlmann/forward-auth) and no Better Auth forward-auth project. You would own that code.
- Envoy Gateway already has native OIDC in `SecurityPolicy` (https://gateway.envoyproxy.io/docs/concepts/gateway_api_extensions/security-policy/). v1.8 moved it to a native OAuth2 filter (https://gateway.envoyproxy.io/news/releases/notes/v1.8.0/).
- Pointing that at Pocket ID gives A2 its identity with no Better Auth service in the request path. This is inference. How claims map to tenants needs checking on your Envoy Gateway version.

Use one hostname per user rather than `/u/{user}/` paths. `web/next.config.mjs` sets no `basePath`, and `web/src` makes 65 calls to absolute `/api` URLs (grep for `fetch("/api`, `fetch('/api` and the backtick form). A path prefix would need a rewrite layer. That last point is inference.

### Q4. Prototype

Done. RESULTS.md has the exact commands and outputs. What ran:
- the CLI migration on `node:sqlite`;
- boot with an unreachable Pocket ID discovery URL (the provider was skipped and the server stayed up);
- `/api/auth/ok` returning 200;
- `auth.api.createApiKey({ body: { userId } })`, with the user created through `internalAdapter.createUser`;
- `x-api-key` resolving through `getSession` to the seeded user;
- forward-auth with a signed cookie;
- RR-style `verifyApiKey` with permissions.

The server is stopped. `pgrep -fl 'node server.mjs'` printed nothing.

### Q5. Security checklist for the publish service

1. **Secret.** Put `BETTER_AUTH_SECRET` (32+ characters, from `openssl rand -base64 32`) in a Kubernetes Secret, never in the image or the repo. To rotate it without logging everyone out, use the `secrets` option or `BETTER_AUTH_SECRETS` (https://better-auth.com/docs/reference/security#secret-rotation).
2. **baseURL and secure cookies behind the tunnel.**
   - Set `BETTER_AUTH_URL=https://<share-host>`. Cookies get `Secure` when baseURL is https (security doc, Cookies), and RR derives `useSecureCookies` the same way (`config.ts:954`).
   - The pod sees plain HTTP from cloudflared, so a fixed https baseURL is what keeps cookies `Secure`.
   - Leave `trustedProxyHeaders` off. A fixed baseURL ignores forwarded headers anyway (security doc, Trusted Proxy Headers priority list).
3. **Client IP for rate limits.**
   - By default Better Auth reads `X-Forwarded-For`, which clients can forge (https://better-auth.com/docs/concepts/rate-limit#connecting-ip-address).
   - Behind Cloudflare, set `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip"]` and make the tunnel the only way in.
   - RR lists only `X-Real-IP` there (`config.ts:955`). Don't copy RR's wider `TRUSTED_IP_HEADERS` list, which includes `X-Forwarded-For` (`rr/repo/packages/utils/src/rate-limit.ts:1-7`).
4. **Rate limiting.**
   - Better Auth enables it by default in production only. Enable it explicitly, and set `storage: "database"` so counters survive restarts.
   - It only covers requests through `auth.handler`. Calls to `auth.api` are exempt (rate-limit doc callout).
   - So the share-password gate and the view counter need their own limiter. RR allows 5 password attempts per 10 minutes (`rate-limit.ts:43`).
5. **API-key budget.** The plugin default is 10 requests per 24 hours, and it applies outside production too. Measured: `rateLimitMax: 10, rateLimitTimeWindow: 86400000`, then `RATE_LIMITED` with `tryAgainIn: 86399936`. Set a real budget. RR uses 1000 per hour (`rate-limit.ts:36-40`).
6. **Session mocking off.**
   - Keep `enableSessionForAPIKeys: false`, as RR does (`config.ts:1118`). With it on, a key sent alone to `POST /api/auth/api-key/create` created a second key (measured). A leaked key can mint replacements for itself.
   - Create keys with `permissions: { share: ["upload"] }` and check them with `verifyApiKey({ body: { key, permissions } })`. That worked in the prototype, and a missing permission returned `KEY_NOT_FOUND`.
7. **Require a fresh sign-in before creating a key.** RR refuses `/api-key/create` unless the session is under 24 hours old (`config.ts:866-881`). Copy that.
8. **CSRF on your own routes.**
   - Better Auth's origin checks only run inside `auth.handler`. Any route of yours that changes state for a cookie session (deleting a share, revoking a link) must call `(await auth.$context).isTrustedOrigin(origin)` (security doc, CSRF item 6).
   - RR also refuses cookie requests that arrive cross-site (`context.ts:89-96`).
   - Upload routes that authenticate with `x-api-key` should drop the cookie header.
9. **trustedOrigins.** List only the share host. Leave localhost out in production (security doc, Trusted Origins callout).
10. **Also copy from RR:**
    - `telemetry: { enabled: false }` (`config.ts:706`)
    - `account.encryptOAuthTokens: true` (`:1055`)
    - `onAPIError.errorURL` pointing at your own error page (`:950`)
    - `disabledPaths` for endpoints you don't use (`:746`)
    - a fixed key prefix, so secret scanners can spot a leaked key (`:1116-1117`)

## Where things live

All prototype files are in `/private/tmp/claude-501/-Users-jason-dev-career-ops/9d4e3414-0fa5-470a-ad4f-a6db69a9b9c4/scratchpad/auth/proto/`:
- `auth.mjs` is the config.
- `server.mjs` mounts the handler and serves `/forward-auth` and `/whoami`.
- `seed.mjs` creates the test user and key.
- `verify-pattern.mjs` runs the RR-style key check.
- `cookie-session.mjs` creates a signed session cookie.
- `.secret` holds the throwaway secret.
- `auth.sqlite` is the database.

Other locations:
- The full run log is `/private/tmp/claude-501/-Users-jason-dev-career-ops/9d4e3414-0fa5-470a-ad4f-a6db69a9b9c4/scratchpad/auth/RESULTS.md`.
- RR's Better Auth setup lives in `scratchpad/rr/repo/packages/auth/src/config.ts`, with the `betterAuth` call at `:699-1198`. Key verification is in `packages/api/src/context.ts:62-104`, and the limits are in `packages/utils/src/rate-limit.ts`.
- The career-ops request guard is in `web/src/proxy.ts:23-45` and `web/src/lib/origin-guard.mjs:134-177`, and the bind logic is in `web/src/lib/bind-host.mjs`.

## Gotchas

- **`getSession` throws on a bad key.** With mocking on, an invalid or rate-limited key raises an `APIError` (403 `INVALID_API_KEY`) instead of returning null. My first server had no catch, curl got `Empty reply from server`, and the process exited (measured). Wrap the call.
- **The default key budget breaks the CLI.** At 10 requests per day, the eleventh upload fails (measured).
- **The callback path changed in 1.7.** It is `/api/auth/callback/<providerId>`. Register that URL in Pocket ID.
- **Discovery happens at startup.** If Pocket ID is down when the service boots, sign-in returns `PROVIDER_NOT_FOUND` until a later attempt succeeds (generic-oauth doc, `discoveryUrl`). The rest of the service keeps serving (measured).
- **`node:sqlite` is still Release Candidate** (adapter doc). Pin the Node major version in the image.
- **W would block its own login.** The guard rejects the OIDC callback unless that path is exempted (inference from `origin-guard.mjs:158-161`).
- **Envoy ext-auth drops cookies by default.** Add `cookie` to `headersToExtAuth`.

## Recommendation

| | S: publish-service accounts | W: login inside career-ops web | A2: container per user + gateway |
| --- | --- | --- | --- |
| Security boundary | A separate process and database that hold only rendered HTML and accounts. Keys are scoped to `share:upload`. No agents run there. | Adds identity in front of one user's dashboard. Agents still run with tools that can reach any path, in one data root. Not a tenant boundary. | One container per user, isolated at the OS level. The only option that stops one user's agent from reading another user's files. The gateway must check that the tenant matches the session user. |
| Ops cost | One small Deployment, one PVC for the sqlite file, one Pocket ID client, one Secret. | The same Pocket ID client, a Better Auth database next to the web app, a wider bind and a tunnel route. | N career-ops pods, each with its own PVC, agent credentials and image updates, plus gateway OIDC config and a route per user. |
| Upstream-merge impact on career-ops | No upstream files change. The service is fork-local, and the upload script goes in `config/local-paths.txt`. | Edits `web/src/proxy.ts` (3 upstream commits in 90 days, counted with git log) and `web/package.json` (30), plus new auth files. A permanent fork difference. | No career-ops code changes if the gateway owns identity. The image and manifests are fork-local. |
| What a user sees | Signs in to the share site with Pocket ID once, creates a key and pastes it into career-ops. People they share with see a link, a password prompt if one is set, and a feedback form. | A Pocket ID login before the dashboard, then the same single-user app. | Their own career-ops at `<user>.<domain>`, behind Pocket ID. |

**Sequence.**
1. **Ship S now.** It changes no upstream file, and the prototype already proves its key path.
2. **Add W later, if you want it.** Do it when you want your own dashboard reachable beyond loopback, and keep the diff to the proxy session check plus the callback exemption.
3. **A2 only for a real second career-ops user.** Start from Envoy Gateway OIDC against Pocket ID, not from a Better Auth forward-auth service you would have to maintain.

**Principle applied: Prove It Works.** I ran the prototype instead of relying on the docs alone. That changed three of the recommendations: wrap `getSession`, set a real per-key limit, and keep session mocking off.

**Not checked:**
- a real Pocket ID login round trip;
- twoFactor and passkey wiring (neither plugin was installed);
- Pocket ID's group restrictions;
- any actual Envoy or Traefik configuration;
- better-auth 1.7.15 through 1.7.18, which the 7-day release-age policy blocked.

Sources: https://better-auth.com/llms.txt, https://better-auth.com/docs/adapters/sqlite, https://better-auth.com/docs/integrations/express, https://better-auth.com/docs/integrations/hono, https://better-auth.com/docs/plugins/generic-oauth, https://better-auth.com/docs/plugins/api-key/advanced, https://better-auth.com/docs/reference/security, https://better-auth.com/docs/concepts/rate-limit, https://gateway.envoyproxy.io/docs/tasks/security/ext-auth/, https://gateway.envoyproxy.io/v1.2/api/extension_types/, https://gateway.envoyproxy.io/docs/concepts/gateway_api_extensions/security-policy/, https://gateway.envoyproxy.io/news/releases/notes/v1.8.0/, https://oneuptime.com/blog/post/2026-01-23-traefik-forward-authentication/view, https://github.com/govengers/auth/wiki/Forward-Auth, https://github.com/mkuhlmann/forward-auth

**What I skipped and the risks.** I did not run a real Pocket ID login or any gateway config. The W callback-blocking claim and the per-user-hostname advice for A2 are inferences from the code and were not run. `proto/.secret` holds a throwaway secret that only the prototype database uses.
