# Security audit report

Commit `2edd1b33`, 2026-11-16. Slice 1 of 6, read-only. Repro scripts are in `repro/security/`; run each from the repo root.

ISSUES

No critical finding. Every API route and page goes through one guard, `web/src/proxy.ts` calling `checkRequest()` in `web/src/lib/origin-guard.mjs`. No route has its own auth check. All 73 routes sit below the guard, and there are no server actions.

## Findings

1. **browser-extract's Chromium path checks only the literal host.** Medium, measured.
   - Where: `browser-extract.mjs:1505`, `:1542`, `:1551`.
   - Evidence: `rejectPrivateOrInvalid()` allows `kubernetes.default.svc.cluster.local`, `career-ops-web:3000` and `localtest.me` (which resolves to 127.0.0.1). `validateUrlSecurity()` blocks all three, but this path never calls it. `installLivenessRouteGuard` (`liveness-browser.mjs:350`) does.
   - Impact: a posting URL, or a redirect from one, can make the agent's `node browser-extract.mjs --mode jd` return the text of a cluster or LAN page.
   - Fix (S): add the DNS check to the route handler.
   - Corrected after review: the web evaluate run holds no Bash (`docs/SCRIPTS.md:47`), so browser-extract runs only in CLI agent sessions, not in the pod. `batch-evaluate-gemini.mjs:368-386` has the same literal-only shape.
2. **The two egress classifiers disagree.** Medium-low, measured.
   - Where: `liveness-browser.mjs:165-178` vs `providers/_ip-guard.mjs:64-76`.
   - The Chromium-side patterns allow `100.64.0.1`, `100.100.100.100`, `198.18.0.1`, `224.0.0.1` and `255.255.255.255`.
   - Neither list blocks NAT64 (`64:ff9b::7f00:1`), 6to4 (`2002:7f00:1::`) or Teredo: `isBlockedAddress` returns false for all of them.
   - Impact: Chromium runs can reach CGNAT space, which is what a Tailscale tailnet uses.
   - Fix (S): `liveness-browser` uses `isBlockedAddress`, and `isBlockedAddress` covers the three IPv6 ranges.
3. **upskill.mjs has its own, weaker copy of the guard.** Low-medium, measured; reachability inferred.
   - Where: `upskill.mjs:781-809`.
   - The copy allows `http://0.0.0.0:3000/`, `http://[::ffff:7f00:1]/`, `http://[fd12:3456::1]/` and `http://100.64.0.1/`.
   - It also checks each Playwright redirect hop (`:898-907`), so a page the user points `--url-text` at can redirect to loopback.
   - Fix (S): import the shared guard.
4. **The CV preview iframe loads remote resources, with no CSP.** Low-medium, measured.
   - Where: `web/src/components/cv-studio/cv-preview.tsx:124-130` and `web/src/lib/cv-studio/preview-html.mjs:59`.
   - `previewHtml()` passes `<img src="https://…">` and CSS `url()` through and adds no CSP. The sandbox (`allow-same-origin allow-modals`) stops scripts but not fetches.
   - The PDF path aborts these requests (`generate-pdf.mjs:2631-2648`), and the template preview adds a CSP (`templates/preview/route.ts:27`, `withPreviewCsp`).
   - Impact: the HTML is the LLM-tailored CV written from posting text, so viewing it can beacon to an outside server and allows CSS-based leaks.
   - Fix (S): `withPreviewCsp`.
5. **The pod has no app-level auth.** Medium, depending on the cluster; measured for the guard.
   - `checkRequest` returns ok for a POST to `/api/run` with `Host: localhost` and no other headers, and for `Host: career-ops-web:3000`.
   - `docs/DEPLOYMENT.md:117-120` documents the reliance on a gateway and a Service restriction.
   - **Corrected by the lead:** the item as first written is refuted for this deployment. NetworkPolicy `career-ops` in namespace `career-ops` admits TCP 3000 only from the namespace labelled `kubernetes.io/metadata.name=network` and from pods labelled `career-ops.io/role=scan-tick`. The app itself still has no auth and depends on that policy.
6. **Possible prompt-injection exfiltration from evaluate runs.** Medium, inferred.
   - The `networkReadOnly` scope grants Read, WebFetch and WebSearch (`web/src/lib/claude-invocation.mjs:107`), and `spawn-cli.mjs:78` passes the caller's environment through.
   - Corrected after review: Read denies already exist (`unattendedReadDenies`, `claude-invocation.mjs:190-213`). `/api/run` applies them only to fenced runs (`route.ts:88`, `:151-173`). An attended URL `evaluate`, which is the run that has WebFetch, gets none (`repro/security/evaluate-read-denies.mjs.txt`).
   - Not verified: whether Claude Code's Read then returns `.env` or `/proc/self/environ`. Settle it with the canary in task SEC-6.
7. **The web app sets no security headers.** Low, measured.
   - `web/next.config.mjs` has no `headers()`, and `proxy.ts` adds none.
   - There is no CSP, `nosniff` or `Referrer-Policy`. Clickjacking is already covered: a cross-site iframe gets 403.
8. **The image installs root dependencies without a lockfile.** Low, measured.
   - `deploy/Dockerfile:18-19`, with `package-lock.json` ignored at `.gitignore:258`.
   - **Accepted by the lead, not planned:** upstream ignores the lockfile by policy, and the Dockerfile already marks the shortcut.
   - **Fixed 2026-11-22 (PR 120):** the image runs `npm ci` from the fork's own `deploy/package-lock.json`.
9. **The dev container runs as root.** Low, measured.
   - The root `Dockerfile` has no `USER` line.
   - **Accepted by the lead, not planned:** it is an upstream file and an interactive dev image.

## Checked and found sound

- Origin guard: cross-site form POSTs, cross-site iframes and rebound Host values are refused (`repro/security/origin-guard-decisions.mjs.txt`).
- Path handling:
  - Chat ids only accept the UUID format.
  - `cv-studio/[n]` only takes digits.
  - Template names are checked against the listed templates.
  - `runs/save` strips the id to safe characters.
  - The logo cache checks the file stays inside its folder.
  - Company names are slugged before use (`repro/security/company-slug-traversal.mjs.txt`).
- Process spawning: no route uses a shell, the only `execSync` runs a fixed command, and status values are checked before spawning.
- Claude tool scopes deny every write tool explicitly. A spawn without permission settings throws.
- `jd-page-fetch` follows redirects by hand, checks DNS on each hop and checks again at connect time.
- PDF rendering has JavaScript off and non-local requests aborted. The template preview has a strict CSP.
- The only `dangerouslySetInnerHTML` is the fixed theme script. react-markdown runs without a raw HTML plugin.
- The deploy and publish images run as uid 1000. `.dockerignore` excludes `.env`, `data`, `cv.md`, `output`, `reports` and `private`.
- Workflows: no `pull_request_target`, actions pinned to commit SHAs, no `github.event.*` text inside `run:` scripts, `persist-credentials: false`, scoped permissions.
- Publish service: constant-time comparisons, scrypt with a dummy hash, a strict CSP, escaped output, rate limits keyed by socket address.
- Health and diagnostics routes return no secrets.

## Not checked

- The home-cluster gateway.
- The apply/* Playwright flow.
- Per-provider fetch paths beyond the shared guard.
- The `browser-extract` known-ATS API fetches (literal-host check only, hosts derived from known ATS sites).
- Validation of every route body.
- Request body size limits.
- Claude Code's Read behaviour on `.env` and `/proc` (task SEC-6).
