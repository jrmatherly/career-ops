## Link and theme publish key management (PR-K1)

**Depends on.** None.

**Files.**

- [ ] Edit `publish/pages/account.mjs` (inline token values, dark variant, key destination copy with the exact `cluster.toml` line), `publish/tests/service.test.mjs` (script-free and parity assertions).
- [ ] Create `web/src/lib/publish-account-url.mjs` (`publishAccountUrl({ env, dataRoot })`, reading `PUBLISH_URL` from the environment first and the data root `.env` second, the same order `publish/share.mjs` uses) and `web/tests/lib/publish-account-url.test.mjs`.
- [ ] Edit `web/src/components/shares/shares-view.tsx` and `web/src/app/shares/page.tsx` (the link), `web/src/app/api/shares/pull/route.ts` (the destination copy), `web/tests/lib/shares.test.mjs`.
- [ ] Edit `publish/README.md` and `.claude/skills/upstream-review/SKILL.md` (extend the `/shares` row so it says the web reads `PUBLISH_URL` but never the key; rows for the new helper and its test).

**Build.**

- [ ] The account page's inline `<style>` carries the `:root` values of `--bg`, `--surface`, `--border`, `--fg`, `--muted` and `--brand-text` and the theme's `--color-brand` from `web/src/app/globals.css`, and the `.dark` block's values under `@media (prefers-color-scheme: dark)`, with a comment naming `globals.css` as the source. No `<script>`, no external URL, CSP unchanged.
- [ ] The key-shown-once copy and the pull route's two messages name both destinations, the `publish_api_key` line of the `[career_ops]` block in `cluster.toml` on a cluster install, printed ready to paste, or the data root `.env` on a local install.
- [ ] `publishAccountUrl` returns `${PUBLISH_URL}/account` when the URL is set and `https`, else null; `shares/page.tsx` passes it to `shares-view.tsx`, which shows "Manage publish keys" as a new-tab link with `rel="noopener"` when it is not null.

**You see.**

- [ ] The Shares page shows the link, and the account page opens in the dashboard's colours in light and dark mode with the same forms as before.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `publish/tests/service.test.mjs` gains "account page has no script tag and no external URL" and "account page carries the dashboard token values", the second reading `web/src/app/globals.css`, parsing the `:root` and `.dark` blocks, and asserting each named variable's value appears in the page (publish tests already import from the root, so the read is allowed; the image never copies the test). Run `npm --prefix publish test`.
- [ ] `web/tests/lib/publish-account-url.test.mjs` asserts env wins over `.env`, `http` yields null, unset yields null. Run `cd web && node --experimental-strip-types --test tests/lib/publish-account-url.test.mjs`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `sonnet medium` at the PR head, per the boot recipe, with the publish service started from `publish/start.mjs` against a temp database.

- [ ] Lane 1. Regression lane against trunk. Sign in, mint, list, revoke at trunk and head. Save `k1-mint-parity.png`. Pass when both flows succeed and the key prefix is `cops_`.
- [ ] Lane 2. Account page in light mode. Save `k1-light.png`. Pass when the background and brand colours match the dashboard's values.
- [ ] Lane 3. Account page with `prefers-color-scheme: dark`. Save `k1-dark.png`. Pass when the dark values apply.
- [ ] Lane 4. Response headers of `/account`. Save `k1-csp.png`. Pass when the CSP string is byte-identical to trunk.
- [ ] Lane 5. Shares page with `PUBLISH_URL` set in the environment to an `https` URL. Save `k1-link.png`. Pass when the link shows and opens a new tab.
- [ ] Lane 6. Shares page with `PUBLISH_URL` only in the data root `.env`. Save `k1-link-dotenv.png`. Pass when the link shows.
- [ ] Lane 7. Shares page with an `http` `PUBLISH_URL`. Save `k1-http-hidden.png`. Pass when no link renders.
- [ ] Lane 8. The key-shown-once panel. Save `k1-copy.png`. Pass when it names both destinations and prints the `cluster.toml` line.
- [ ] Lane 9. Mobile width of the account page. Save `k1-mobile.png`. Pass when the forms fit without horizontal scroll.
- [ ] Lane 10. Pull route message when the service is unreachable. Save `k1-pull-copy.png`. Pass when the toast names both destinations.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Byte size of the `/account` response, trunk and head.
- [ ] Probe. `curl -s -o /dev/null -w '%{size_download}'` three times each.
- [ ] Baseline. Record the trunk size first.
- [ ] Rule. Head under trunk plus 4 kB.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2, lane 3 and lane 5 screenshots into `private/review/k1-review-light.png`, `private/review/k1-review-dark.png` and `private/review/k1-review-link.png`.
- [ ] Record a 30 to 60 second video from the Shares link to a minted key on a lane VM, with the key masked. Save it as `private/review/k1-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The operator merges.

