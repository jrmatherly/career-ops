# Thread 3. Managing publish API keys from the dashboard

Read-only investigation, 2026-11-08. Claims are labelled measured, inferred or guess.

## How keys are minted today

The publish service (`publish/`) is a plain `node:http` server with Better Auth 1.7.14 and the `@better-auth/api-key` plugin (measured, `publish/package.json`, `publish/auth.mjs:19-54`). Sign-in is Pocket ID through `genericOAuth`, and `validateUserInfo` admits only verified emails on `PUBLISH_ALLOWED_EMAILS` (measured, `auth.mjs:40`). `GET /account` lists keys behind a cookie session; `POST /account/keys` mints a key server-side with `auth.api.createApiKey({ body: { userId, name, permissions: { share: ["upload", "manage"] } } })` and no request headers, the only way the plugin accepts permissions (measured, `publish/server.mjs:283-294`); `POST /account/keys/revoke` calls `deleteApiKey` with the session headers (measured). Over HTTP the plugin's own `/api-key/create` and `/api-key/update` are disabled, so a `cops_` key can never mint another key (measured, `auth.mjs:30`). The page is one `shell()` with an inline `style` attribute, no stylesheet, no `<script>`, and shows the new key once in a `<pre>` with the instruction to paste it into the data root `.env` as `PUBLISH_API_KEY` (measured, `publish/pages/account.mjs:1-19`). Every page carries `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'` (measured, `server.mjs:16-22`).

The Next process never reads the key. `web/src/app/api/shares/pull/route.ts` spawns `publish/share.mjs pull`, and `share.mjs` reads `PUBLISH_URL` and `PUBLISH_API_KEY` from the environment first and the data root `.env` second (measured, lines 10-13 and `share.mjs:41-50`). On the cluster both arrive as pod env from the Secret and the HelmRelease, `PUBLISH_URL` being the public `https://cv.<domain>` (measured, home-cluster `secret.sops.yaml.j2:10`, `helmrelease.yaml.j2:33`). So the pod already holds the key; the route's comment that the web never reads it is a process-memory distinction, not a trust boundary (inferred, raised by the review). The account page text and the pull route's messages tell the operator to put the key in `.env`, which on the cluster is the wrong place, since env wins (measured).

Better Auth's documentation for the plugin: `createApiKey` and `updateApiKey` accept a server-only `userId` without a session, so a server-side revoke is `updateApiKey({ userId, keyId, enabled: false })`; `listApiKeys`, `getApiKey` and `deleteApiKey` require session cookies (measured, https://better-auth.com/docs/plugins/api-key). Keys are minted with no `expiresIn`, so nothing forces rotation (measured, `publish/auth.mjs:46-52`). The fork's own prototype notes record that session mocking lets a key mint keys, which is why `enableSessionForAPIKeys` is off (measured, `docs/superpowers/research/2026-11-06-reactive-resume-convergence/README.md`, prototype row).

## Constraints already decided

Appendix B of the convergence plan rejected in-app Better Auth for the dashboard and a Better Auth forward-auth service; the gateway's OIDC is the dashboard's access control (measured). Appendix C says the publish service is internet-facing, its public surface is script-free HTML, the owner keeps the CSP, the proxy-only IP trust, the limiters and the loopback bind, and never routes the dashboard through it (measured). Secrets live only in `.env` files and Kubernetes Secrets (measured). The dashboard's origin guard refuses cross-site fetches and `Sec-Fetch-Dest: iframe` requests to itself; outbound server-to-server calls are outside it (measured, `web/src/lib/origin-guard.mjs`, `web/README.md:243-254`). The publish NetworkPolicy admits ingress from the `network` namespace on 8080 only, so a direct call from the career-ops web pod to the publish Service is not admitted today (measured, home-cluster `publish/app/networkpolicy.yaml.j2`).

## Options

### (a) Theme the account page with the dashboard's tokens

The dashboard's tokens are CSS custom properties in `web/src/app/globals.css` (`--bg`, `--surface`, `--border`, `--fg`, `--muted`, `--brand`), with dark mode as a `.dark` class and fonts from Next font loaders (measured, lines 17-82). The CSP allows inline styles only, no external stylesheet and no web font (measured). So the page can carry the token values inline, switch dark mode with `prefers-color-scheme`, and use the system font stack. One file changes, plus a test that the rendered page still has no `<script>`, no external URL and the same CSP. The sign-in and the once-shown key stay where the identity and the database live. The operator still pastes the key into `.env`.

### (b) Dashboard page that calls publish server-to-server

Publish would need a new admin route family behind a new bearer credential that creates keys with the allow-listed user's id, disables them through `updateApiKey`, and lists them by reading `publish.db`, because the plugin's list call needs a session (measured docs). The web pod would call it over the in-cluster Service, which needs a publish NetworkPolicy entry for the career-ops web pod, loosening the policy that makes the proxy the only peer and `cf-connecting-ip` trustworthy (measured policy, inferred consequence). And the minted key would have nowhere useful to go. On the cluster `PUBLISH_API_KEY` is pod env from a sops Secret, `share.mjs` reads env before `.env`, and the dashboard cannot edit a sops Secret, so a key written to `/data/.env` is ignored and a rotation would look successful while changing nothing (measured env precedence, inferred outcome). The cost that remains even off the cluster is a second secret that mints `share:manage` keys on the internet-facing service. Benefit: none on the cluster.

### (c) Link-out

A link on the dashboard's Shares page to `${PUBLISH_URL}/account`, opening in a new tab with `rel="noopener"`. The operator signs in to publish with Pocket ID, a session separate from the gateway's dashboard session (inferred). No publish change. The Next process does not read `PUBLISH_URL` today (measured, grep), so the Shares page reads that one non-secret value from the environment and hides the link when it is unset or not `https`. An iframe is ruled out by `frame-ancestors 'none'` and by `SameSite=Lax` session cookies in a cross-site frame (measured CSP; cookie attribute inferred from Better Auth defaults).

### (d) Move account management into the dashboard

Means Better Auth in the dashboard, rejected in Appendix B, or the dashboard proxying publish's auth, which Appendix C forbids (measured). Publish's SQLite is the only key store, so the dashboard would still call publish for every change.

## Trade-offs

| Option | Code changed | New secret | Publish attack surface | Operator steps per rotation | Fits Appendix B and C |
| --- | --- | --- | --- | --- | --- |
| (a) theme | one publish page, one test | none | none | sign in, mint, paste | yes |
| (b) server-to-server | publish admin routes, web page, NetworkPolicy | one | admin route that mints keys | click, but the key is shadowed by the Secret on the cluster | no, and it does not work on the cluster |
| (c) link-out | one dashboard line | none | none | sign in, mint, paste | yes |
| (d) move | large | one or more | removes the script-free boundary | click | no |

## Recommendation

(a) and (c) together, one small PR. The Shares page links to the account page, the account page gets the dashboard's token values inline with a dark variant and a parity test against `globals.css` so the copy cannot drift silently, a test asserts the publish pages carry no `<script>` and no external URL (none does today, measured), and the page and the pull route name both key destinations, the cluster config and the local `.env`. Minting stays on the service that owns the identity and the key store. (b) is rejected for the cluster, because the Secret shadows any key the dashboard could write and the admin route would loosen the publish NetworkPolicy. (d) stays rejected by Appendix B. A three-model review agreed with this verdict (`reviews/01-design-interrogation.md`).

## Open questions for the operator

- On the cluster a rotation is a `cluster.toml` edit plus the Reloader restart under every option. Is that acceptable, or should the account page print the exact `cluster.toml` line to paste?
- Should the dashboard show whether `PUBLISH_API_KEY` is present and when the last pull succeeded, without ever showing the key? That is a dashboard-only change under either answer.
