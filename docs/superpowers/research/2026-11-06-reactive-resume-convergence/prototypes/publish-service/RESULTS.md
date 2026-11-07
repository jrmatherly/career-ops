# Option B prototype results (throwaway)

Node v24.22.2, stdlib only. Nothing written under ~/dev/career-ops (`git status --short` empty before and after).

## Render (step 1)
- `build-cv-html.mjs` takes positionals, not flags: `node build-cv-html.mjs <input.json> <output.html> [template.html]`. With CAREER_OPS_ROOT=proto/root it printed `"valid": true`, `"warnings": []`, 21.9 KB. Wall time 113 ms (default template).
- Default template `templates/cv-template.html` uses system fonts ("Liberation Sans", Arial...). It has zero `./fonts/` refs, so `inlineLocalFonts` is a no-op on it. Only `templates/resume-template.html` references `./fonts/*.woff2` (4 refs).
- `inlineLocalFonts` export exists (`generate-pdf.mjs:2330`). Output check: `cv-ada.inlined.html bytes 22411 fontsRefs 0 relativeRefs [] remoteLoads []` and `cv-ada-resume.inlined.html bytes 199804 fontsRefs 0 relativeRefs [] remoteLoads []`. Font inlining grows the resume template 9x (to 200 KB).
- Photo: a `data:image/png` photo passes through. It is substituted 3 times in the default template, because `{{PHOTO}}` also sits inside two CSS comments (lines 149, 451), so the base64 lands in comments too. Harmless at 1px, wasteful for a real photo. Local-path photos were not tested.
- Importing generate-pdf.mjs from the CLI pulls in Playwright-adjacent module graph but did not launch a browser.

## Self-check (steps 2-4), verbatim
```
  cookie: s_pw=1794012444093.U57zdx3EkQOAUBmVnnUQweaUEM25EUg8f-SYwvnIXUA; Path=/s/pw; HttpOnly; SameSite=Lax; Max-Age=600
  headers: default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none' | private, no-store
  views after 50 parallel: 52
  pull: [{"slug":"pw","views":1,"comments":0},{"slug":"open","views":52,"comments":1}]
  changed by pull: ["/data/share-feedback/open.md","/data/shares.json"]
  open.md: "# Feedback on open\n\n## Rita Reviewer (2026-11-07T00:37:24.488Z)\n\nLead with the Kubernetes migration.\n"
  upload: email text present=false phone text present=false linkedin present=false
  served: email text present=false phone text present=false linkedin present=false
PASS (a) password gate
PASS (b) view counting
PASS (c) feedback round-trip, pull touches only data/shares.json and data/share-feedback
PASS (d) hide-contacts
```
Whole run 0.89 s.

| Claim | Result | Evidence |
|---|---|---|
| (a) wrong pw 401, right 303+cookie, cookie 200, pw change kills cookie, unknown slug 401 via dummy scrypt | PASS | asserts above |
| (b) 2 XFF clients x10 = 2, owner 0, Googlebot 0, 50 parallel distinct = +50 | PASS | `views after 50 parallel: 52` |
| (c) feedback link renders snapshot, tampered token 404, snapshot frozen across republish, comment pulled to markdown, pull changes only the two files | PASS | `changed by pull: [...]` |
| (d) hide-contacts: no .contact-row, mailto:, tel: in upload and served page | PASS | upload/served lines |
| (e) page under CSP in Chrome: zero failed requests, zero CSP violations | PASS | chrome-devtools: /s/hidden requests = document 200 + data: png + 2 data: woff2, all 200; console empty; `document.fonts` Space Grotesk and DM Sans `loaded`. Browser password flow GET 401 -> POST 303 -> GET 200 with CSP. Screenshot `screenshot-s-hidden.png` |

## Surprises and limits
- (b) "no lost increments" is weak evidence. node:sqlite is synchronous in one process, so 50 parallel requests serialize anyway. It says nothing about multiple server processes. One process with one sqlite file is the design, so this is fine, but do not scale it horizontally.
- XFF is trusted unconditionally. A visitor can mint views by rotating the header. Production must trust it only from the known proxy.
- hide-contacts drops the whole contact row, so LinkedIn and location vanish too. That is a product choice, not just redaction. Regex removal relies on contact-row having no nested div (true in both templates today).
- The password form's 401 shows in Chrome's console as "Failed to load resource". Cosmetic. Serve the form as 200 if that matters.
- Frozen feedback snapshots need content-addressed storage (snapshots keyed by sha256). The token itself is unstored, but the HTML it points to is stored.
- Reviewer comments land in data/share-feedback/*.md, which agents read. That is untrusted external text entering the user layer and must be framed as data (AGENTS.md "Untrusted External Content").
- Not built: rate limiting on POST /s/:slug, dir-lock around shares.json, CSRF token on the feedback form (SameSite/form-action only), slug deletion, Studio edit sourcing.
- Studio edits: not checked. Which artifact gets published (output/*.html vs .career-ops-web/cv-studio/{n}.json) is still open.

## Size
server.mjs 120 lines (115 non-blank), share.mjs 61, selfcheck.mjs 99.
