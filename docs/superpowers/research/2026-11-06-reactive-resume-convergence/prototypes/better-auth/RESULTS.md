# Better Auth prototype results (2026-11-06)

Directory: /private/tmp/claude-501/-Users-jason-dev-career-ops/9d4e3414-0fa5-470a-ad4f-a6db69a9b9c4/scratchpad/auth/proto
Files: auth.mjs (config), server.mjs (node:http server), seed.mjs (user + key), verify-pattern.mjs (RR-style key check), cookie-session.mjs (signed session cookie).

## Versions

- Node v24.22.2, npm 11.19.1.
- npm `latest` is better-auth 1.7.18 (published 2026-11-05). This machine's npm has `min-release-age=7` (`npm config get min-release-age` prints 7), so `npm install @better-auth/api-key@1.7.18` failed with `ETARGET ... No matching version found ... with a date before 10/30/2026`. I did not override the policy.
- Installed: better-auth@1.7.14 and @better-auth/api-key@1.7.14 (published 2026-10-26), the newest 1.7.x the policy allows. CLI: `npx auth@1.7.14`.
- Docs line used: v1.7 (Latest), per https://better-auth.com/llms.txt.

## Commands and outputs

```
npm init -y && npm pkg set type=module
npm install better-auth@1.7.14 @better-auth/api-key@1.7.14
# added 22 packages ... found 0 vulnerabilities

export BETTER_AUTH_SECRET=$(openssl rand -base64 32)   # throwaway, kept in proto/.secret
npx --yes auth@1.7.14 migrate --config auth.mjs --yes
# -> name, email, ... role, banned, banReason, banExpires fields on user table.
# -> ... impersonatedBy fields on session table.
# -> ... account table. -> ... verification table.
# -> configId, name, start, referenceId, prefix, key, ... permissions, metadata fields on apikey table.
# 🚀 migration was completed successfully!
# sqlite_master tables: account,apikey,session,user,verification

node server.mjs &
# listening on 4321
# ERROR [Better Auth]: Discovery fetch failed for "pocket-id": TypeError: fetch failed
# ERROR [Better Auth]: Provider "pocket-id": discovery left no usable authorization endpoint or token exchange. Provider skipped.
curl -i http://127.0.0.1:4321/api/auth/ok       # HTTP/1.1 200 OK  {"ok":true}
curl http://127.0.0.1:4321/whoami               # 401 (no credentials)

node seed.mjs   # internalAdapter.createUser + auth.api.createApiKey({ body: { userId } })
# { userId: 'ismAl2NX6IZJti2lBIvCZ3SUqNpjhFeb', keyPrefix: 'cops_', keyLen: 69 }

curl -i -H "x-api-key: $K" http://127.0.0.1:4321/whoami
# HTTP/1.1 200 OK
# x-auth-user-id: ismAl2NX6IZJti2lBIvCZ3SUqNpjhFeb
# x-auth-user-email: operator@example.test
curl -H "x-api-key: $K" http://127.0.0.1:4321/api/auth/get-session   # full user + session JSON
```

## Findings the run produced

1. `auth.api.getSession({ headers })` with `enableSessionForAPIKeys: true` resolves an `x-api-key` to a session (above).
2. An invalid key makes `getSession` throw, not return null. The first server.mjs had no catch, and `curl -H "x-api-key: cops_wrong"` got `Empty reply from server`; server.log: `[APIError: Invalid API key.] { status: 'FORBIDDEN', body: { code: 'INVALID_API_KEY' }, statusCode: 403 }` then the process exited. After adding `.catch(() => null)` the same request returns 401.
3. With session mocking on, the API key can mint more keys over HTTP: `POST /api/auth/api-key/create` with only `x-api-key` returned a new `cops_...` key for the same user.
4. Default per-key rate limit is 10 requests per 24 h, even with NODE_ENV unset. DB row: `rateLimitEnabled: 1, rateLimitMax: 10, rateLimitTimeWindow: 86400000`. Twelve `/whoami` calls gave `200 x7` then `401 x5` (the 10 counted all prior uses), and get-session returned `{"code":"RATE_LIMITED","details":{"tryAgainIn":86399936}}`.
5. Keys are stored hashed: the DB `key` column does not equal the plaintext; `start` keeps `cops_I` for display.
6. RR-style check (`verify-pattern.mjs`, `enableSessionForAPIKeys: false`, plugin rateLimit 1000/hour, key created with `permissions: { share: ["upload"] }`):
   `{"ok":{"valid":true,"referenceId":true,"rateLimitMax":1000},"denied":{"valid":false,"code":"KEY_NOT_FOUND"},"sessionFromKey":null}`.
   A missing permission reports `KEY_NOT_FOUND` and logs an ERROR line. `getSession` with the key returns null.
7. Forward-auth with a browser session cookie (`cookie-session.mjs` creates a DB session with `internalAdapter.createSession` and signs the token with HMAC-SHA256 of the secret, as a completed OIDC login would set it): `curl -H "cookie: better-auth.session_token=..." /forward-auth` gives `200` and `x-auth-user-email: operator@example.test`; a tampered cookie gives `401`.
8. An unreachable `discoveryUrl` does not stop boot. The provider is skipped and retried on the next sign-in that names it (matches https://better-auth.com/docs/plugins/generic-oauth, `discoveryUrl`).

Not verified: a real Pocket ID login round trip (needs a reachable Pocket ID and a registered client), twoFactor and passkey (not installed), and the Envoy or Traefik side of forward-auth.

Server stopped: `pgrep -fl 'node server.mjs'` printed nothing after `pkill`.
