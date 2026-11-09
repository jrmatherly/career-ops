# Providers: config fixes, upstream policy sync, retirement, drift gates, eight new sources

> **Landed:** PR 43 merged as `602cc0bd` (Phases A to F; Task B3 applied in the live `portals.yml`) and PR 44 as `dfe5f747` (Phase G, `plugins/usajobs/`) on 2026-11-08. The store is `../../research/2026-11-08-providers/orchestrate/`: `open-items.md` holds the follow-ups and `gates.md` the pod sync still owed (`G-cluster-sync`).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the scanner reach every company the operator targets, bring the fork's provider policy and provider set level with upstream, retire the one dead provider, add CI gates for the three provider docs that rot silently, and add eight curl-proven US or remote sources.

**Architecture:** Seven phases (A is config only). Each code phase is its own branch from `main`, and the program ships ONE pull request by operator order (2026-11-08 18:26 EST): the owners of B to F push their branches without opening a PR, and an integration unit merges them in order B, C, D, E, F into `claude/providers-program` and opens the single PR against `main`, which the operator merges. Every branch appends rows to the same "Providers program" deviations table, the catalog, the example template and the indexing log, so the integration merges keep every side of those conflicts. Phase A is a data-root config change with no code. Phase B cherry-picks the four upstream provider commits (a full merge conflicts in 14 files, nine of them fork-owned web files; see Task B1) plus fork-only doc edits. Phases C to F add or change files in `providers/`, `tests/providers/`, `docs/` and `templates/`, each new file mirroring a named existing module. Every fork-authored or fork-edited file under `providers/`, every root script (`verify-portals.mjs`, `audit-portals.mjs`, `test-all.mjs`) and every path under `plugins/` gets a row in the deviations table, or `tests/fork-deviations-covered.test.mjs` fails; `tests/` and `docs/` are named as whole directories there, so files under them are covered already (policy still wants the row). That test diffs the merge-base against HEAD, so it passes vacuously on uncommitted work: run `node test-all.mjs --quick --only fork-deviations-covered` after each commit, not before.

**Tech Stack:** Node 24 ESM (`.mjs`), the project's own test runner (`node test-all.mjs --only <substring>`), `providers/_http.mjs` fetchers, `js-yaml` for config.

**Spec:** `<repo>/private/review/2026-11-08-providers-assessment/ASSESSMENT.md` (sections 1, 3, 5, 6, 8, 10) with the evidence files beside it. Decisions D1 to D6 and Scope are in section 10. `private/` is gitignored, so a sibling worktree does not contain this plan or the spec: read both by this absolute path.

## Global Constraints

- Another session edits this checkout: do all work in a sibling worktree (`git worktree add ../career-ops-<phase> -b <branch> main`), never in `<repo>` itself.
- Every commit stages its new files explicitly (`git add <paths>` or `git add -A .` inside the worktree; `git commit -am` skips untracked files, so a `-am` commit would ship doc edits without the new test that justifies them). Before each commit: `/simplify`, then `/code-review` on the diff; `npm run lint`; `node test-all.mjs --quick`. Conventional Commits with a scope (`feat(providers): …`), enforced by `.githooks/commit-msg`.
- Never run `node update-system.mjs apply` here. The upstream sync in this plan is `git cherry-pick -x` of four named commits on a branch; the full `git merge careerops/main` is a later upstream-review pass.
- Each provider's test file covers every case `providers/ADDING_A_PROVIDER.md` section 3 lists (id; detect positives and the null cases; `redirect: 'error'` asserted on every request; allowlist throws with the fetch stub at zero calls; empty-vs-broken both branches; pagination caps and `ctx.maxPages`; transient-failure policy; probe cooperation; entity decoding before the keyword match). The per-task lists below name only what is specific to that provider.
- A new provider follows `providers/ADDING_A_PROVIDER.md` in full: `redirect: 'error'` on every request; a host allowlist before any config-derived fetch; `[]` only for a present-and-empty container, a descriptive `throw` otherwise; `toEpochMs` NaN-safe dates; `decodeEntities` from `_html-entities.mjs` for XML/HTML; `safeEncodeURIComponent` for host-controlled path segments; own `DEFAULT_MAX_PAGES` and `MAX_PAGES_CAP`; `ctx.maxPages` honoured; `sleep` from `_http.mjs` between pages (250 ms unless the source states a Crawl-delay); `fetchJsonWithRetry` / `fetchTextWithRetry` on every page fetch.
- Two sweep tests keep hand-maintained lists that a new provider must join: `tests/providers/url-encoding-surrogate.test.mjs` (the alphabetical list of providers that import `_safe-url.mjs` and call `safeEncodeURIComponent`; Bullhorn, Manatal and any provider building `url` from a response id joins it, with one behavioural case: a batch holding one lone-surrogate id keeps the clean row and drops the bad one) and `tests/providers/rss-entity-decoding.test.mjs` (`rssProviders`: `[file, exported parse function, sample link]`; Madgex and Crypto Jobs List join it, so their parsers are exported).
- A new provider ships with: `tests/providers/{id}.test.mjs` (fixtures fictional, no network), a row in `docs/SUPPORTED_JOB_BOARDS.md` in case-insensitive alphabetical position, a commented `Example … Co` stanza in `templates/portals.example.yml` (plus a live entry only when it carries more than the stanza), a `docs/SOURCE_INDEXING_LOG.md` entry for a board or aggregator, and a row under a new `### Providers program (2026-11-08)` sub-heading in `.claude/skills/upstream-review/SKILL.md` "Deviations decided" naming the provider file and its test (KEEP; new fork files), plus a one-bullet entry under "Rules for this repo" naming this plan and the KEEP class, as the two existing programs have.
- Zero-key core. Embedded public search keys are discovered at runtime from the page, never hard-coded (D2). No `--dangerously-skip-permissions` or equivalent anywhere.
- Personal data never enters the repo. Phase A edits `~/career-ops-data/portals.yml`, which is gitignored user data.

## Review Focus

1. An explicit `provider:` entry never runs `detect()` (`providers/_registry.mjs:69-72` returns the provider straight away), so a host allowlist placed only in `detect()` is dead code during a scan. Every provider in this plan validates `entry.careers_url` (or its config URL) inside `fetch()` before the first request, and its test asserts the fetch stub was called zero times on a bad host. A new provider's `detect()` must not steal entries from an alphabetically later provider or be shadowed by an earlier one. No sweep test checks overlap, so each URL-pattern `detect()` in this plan is explicit-only (`provider: {id}`) unless the host is a vendor domain nobody else matches; pinned in each provider's test by negative `detect()` cases for `https://jobs.lever.co/x` and `https://job-boards.greenhouse.io/x`.
2. A page that is present but empty must return `[]`, and a Cloudflare challenge page must throw, never parse as zero jobs. Detection regex to reuse: `CHALLENGE_RE` in `providers/computrabajo.mjs:44` (title "just a moment" / "attention required", `cf-mitigated`). Pinned in F1's and F2's tests with a challenge-HTML fixture, in F3's detail path, and in the Madgex RSS test with an HTML body where XML is expected.
3. The probe budget must bound a provider that uses `fetchResponse`. Pinned in Task D3.
4. The retired Muse provider must fail loudly on `provider: themuse`, never silently return `[]`. Pinned in Task C1.
5. The Bullhorn tenant tuple comes from the agency's `app.json`, so a malformed `swimlane` or `corpToken` must be rejected before any list request, and job URLs are built only on the entry's own https origin, never on a URL read from that JSON. Pinned in Task E2.

---

## Phase A: live config fixes (no code, no PR)

### Task A1: point three handoff entries at their ATS boards

**Files:**
- Modify: `~/career-ops-data/portals.yml` (entries `Talkdesk` ~line 2463, `Genesys` ~2487, `Zendesk` ~2960)

- [ ] **Step 1: Confirm the three boards still answer** (the assessment measured them on 2026-11-08)

Run from the checkout:
```bash
node --input-type=module -e 'import { loadProviders } from "./providers/_registry.mjs"; import { makeHttpCtx } from "./providers/_http.mjs"; const p=await loadProviders("./providers"); const ctx={...makeHttpCtx(),maxPages:1}; for (const [n,u] of [["Talkdesk","https://job-boards.greenhouse.io/talkdesk2"],["Genesys","https://genesys.wd1.myworkdayjobs.com/Genesys"],["Zendesk","https://zendesk.wd1.myworkdayjobs.com/zendesk"]]) { const e={name:n,careers_url:u}; let hit; for (const pr of p.values()) if (pr.detect?.(e)) { hit=pr; break; } console.log(n, hit.id, (await hit.fetch(e,ctx)).length); }'
```
Expected: three lines, provider `greenhouse`, `workday`, `workday`, each count > 0.

- [ ] **Step 2: Edit the three entries**

Replace each `careers_url` with the URL above. Delete both the `scan_method: websearch` and the `scan_query` lines on each (live file lines ~2465-2466, ~2489-2490, ~2962-2963): while a provider resolves, `scan.mjs` ignores them, but if the provider ever breaks the stale `scan_method` would turn the entry back into a handoff whose query is a bare URL. Leave Gong, Salesforce and Shopify unchanged (Shopify is Task B3's follow-up).

- [ ] **Step 3: Verify**

Run: `node audit-portals.mjs --summary --file ~/career-ops-data/portals.yml` and `node verify-portals.mjs --strict --file ~/career-ops-data/portals.yml` (from the checkout, which has no `portals.yml` of its own, so the path must be explicit)
Expected: `no-provider` count drops from 6 to 3 (Gong, Salesforce, Shopify remain as handoffs); the three names appear as `ok`; `--strict` exits 0.

- [ ] **Step 4: Sync to the cluster (operator step, outside this plan)**

The pod's `/data/portals.yml` is a separate copy on the career-ops PVC. Nothing in `deploy/` or `~/dev/home-cluster` documents a sync path, and the API server was unreachable from this machine on 2026-11-08, so the operator applies the same edits there (web config UI, or a copy into the PVC) and this plan records only that it is owed.

## Phase B: upstream sync for policy, sitemap provider and Jobicy (PR 1)

Branch `claude/providers-upstream-sync`. Uses the cherry-pick exception in `.claude/skills/upstream-review/SKILL.md` ("Sync policy"); the full merge is a separate upstream-review pass.

### Task B1: cherry-pick the four provider commits (not a full merge)

A full `git merge careerops/main` was dry-run in memory on 2026-11-08 (`git merge-tree --write-tree HEAD upstream/main`): 14 conflicting files, 9 of them web files owned by the fork's in-flight programs (`web/src/app/pipeline/page.tsx`, `web/src/components/inbox/inbox-triage.tsx`, `triage-row.tsx`, `pipeline-view.tsx`, `web/src/lib/career-ops.ts`, `pipeline-table.mjs`, `pdf-render.mjs` and its test, `web/src/app/api/run/route.ts`) plus `README.md`, `docs/SCRIPTS.md`, `.github/dependabot.yml` and two deleted workflows. Three upstream web commits (`794981f3`, `9c417d25`, `fd5de434` inbox sort by fit) overlap the fork's inbox ranking work. That merge belongs to a dedicated upstream-review pass, not a providers PR (it also brings upstream tests `tests/workflow-action-pins.test.mjs` and `readme-badges` that assert on workflows the fork deleted, so that pass needs SKIP reverts or fork edits for them). The skill allows `git cherry-pick -x` "for a window you are not ready to merge wholesale", so this task picks the four provider commits and leaves the watermark where it is.

`git apply --check` of each commit's diff against HEAD (read-only, 2026-11-08): `946416b3`, `90d0cde8`, `4c413c27` apply cleanly; `7af08dcc` fails one hunk in `docs/SUPPORTED_JOB_BOARDS.md` at the fork's SEEK NZ row (line ~122), a one-line context resolution.

**Files:**
- Create: `.upstream-review/reviews/2026-11-08-review.md` (verdicts for the four picks; the other 32 commits stay un-reviewed and the watermark does not move)
- Picked: `providers/ADDING_A_PROVIDER.md`, `providers/README.md`, `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/source-proposal.yml`, `docs/SOURCE_INDEXING_LOG.md`, `docs/SUPPORTED_JOB_BOARDS.md` (from `946416b3`); `providers/sitemap.mjs`, `tests/providers/sitemap.test.mjs`, `providers/_types.js`, `templates/portals.example.yml`, catalog and guide rows (from `7af08dcc`); `providers/jobicy.mjs`, `tests/providers/jobicy.test.mjs`, catalog, log, template (from `90d0cde8`); `scan.mjs` and its test (from `4c413c27`)

- [ ] **Step 1: Pick in upstream order**

```bash
git cherry-pick -x 90d0cde8 4c413c27 7af08dcc 946416b3
```
On the `7af08dcc` conflict in `docs/SUPPORTED_JOB_BOARDS.md`, keep both rows (SEEK NZ stays; the sitemap row lands in alphabetical position), `git add`, `git cherry-pick --continue`. Keep upstream's subjects, including their `(#NNNN)`.

- [ ] **Step 2: Check the picked files against the deviations table**

Run: `git diff --name-only HEAD~4..HEAD` and compare with `.claude/skills/upstream-review/SKILL.md` "Deviations decided". `CONTRIBUTING.md` has a row (star-count line only, unaffected); `docs/SUPPORTED_JOB_BOARDS.md` and `docs/SOURCE_INDEXING_LOG.md` have the "as upstream ships them, re-apply fork fixes" row. Re-apply any fork fix those two files carried that the pick overwrote (`git diff HEAD~4 HEAD -- docs/SUPPORTED_JOB_BOARDS.md` shows it).

- [ ] **Step 3: Validation batch** (the skill's list)

```bash
node .githooks/pre-commit.mjs
npm run lint
node validate-system-paths-coverage.mjs
node test-all.mjs --quick
git diff --name-only HEAD~4..HEAD -- .claude .githooks .upstream-review config/local-paths.txt .gitignore
```
Expected: all green; the last command prints nothing (none of the four touch fork automation). `4c413c27` changes location matching for two-letter uppercase entries: the live file uses `US` in `always_allow` and `allow`, so after Phase A also run `CAREER_OPS_ROOT=~/career-ops-data node scan.mjs --dry-run --company Anthropic` (the `--dry-run` flag writes nothing) and confirm US postings still pass the location filter.

- [ ] **Step 4: Decision log**

Write `.upstream-review/reviews/2026-11-08-review.md` from the skill's template: the four picks as ADOPT (picked), `6360bbb4` as "deferred to the next full merge (D6)", the three inbox web commits as "comparison review owed at the next full merge (overlap with the fork's inbox ranking)", and the remaining commits as "not reviewed in this window". Do not run `--advance`.

- [ ] **Step 5: Commit the log**

```bash
git add .upstream-review && git commit -m "docs(upstream): record the four provider cherry-picks of 2026-11-08"
```

### Task B2: align the fork-only files with upstream's rule 6 (D1)

**Files:**
- Modify: `.claude/skills/add-provider/SKILL.md:12`
- Modify: `docs/SUPPORTED_JOB_BOARDS.md` "Evaluated, not supported" intro (line ~155, "evaluated alongside careerviet") and closing paragraph (~170-174), if the merge did not already replace them
- Modify: `.claude/rules/providers.md:8` (first bullet names "`robots.txt` checked per path")

- [ ] **Step 1: Write the failing test**

Create `tests/provider-policy-docs-agree.test.mjs` using `pass`/`fail`/`ROOT` from `tests/helpers.mjs`:
- reads `CONTRIBUTING.md`, `.claude/skills/add-provider/SKILL.md`, `.claude/rules/providers.md`, `providers/ADDING_A_PROVIDER.md`
- asserts neither fork-only file (`SKILL.md`, `providers.md`) matches `/robots\.txt[^.\n]*(per path|checked|read per|is a stop)/i` while `CONTRIBUTING.md` matches `/robots\.txt[^.\n]*not a gate/i`; and both fork-only files match `/not a gate|read like a visitor/i`
- asserts `CONTRIBUTING.md` and `ADDING_A_PROVIDER.md` both contain the three stops: `login`, `CAPTCHA`, `operator` (case-insensitive) within the rule 6 text

- [ ] **Step 2: Run it to see it fail**

Run: `node test-all.mjs --quick --only provider-policy-docs-agree`
Expected: FAIL naming `SKILL.md:12` and `providers.md`.

- [ ] **Step 3: Edit the two fork files**

`SKILL.md` step 2 becomes: eligibility is rules 1 to 5 plus rule 6 as "read like a visitor": no login, no CAPTCHA, honour a stated `Crawl-delay`, and an operator opt-out removes the source. Drop "`robots.txt` read per path". `providers.md` first bullet: same replacement. Add one sentence to `SKILL.md` step 6: a fork-authored provider and its test need a row under "Deviations decided" in `.claude/skills/upstream-review/SKILL.md` (that is what `tests/fork-deviations-covered.test.mjs` enforces).

- [ ] **Step 4: Run the test and the suite**

Run: `node test-all.mjs --quick --only provider-policy-docs-agree` then `node test-all.mjs --quick`
Expected: PASS; suite green.

- [ ] **Step 5: Commit**

```bash
git add -A . && git commit -m "docs(providers): align the fork's add-provider rule 6 with upstream (robots.txt is not a gate)"
```

### Task B3: Shopify through the sitemap provider (data-root config)

**Files:**
- Modify: `~/career-ops-data/portals.yml` (entry `Shopify`, ~line 2946)

- [ ] **Step 1: Read the merged provider's config keys**

Read `providers/sitemap.mjs` header (upstream's: `sitemap.url`, `job_path` with a required `(?<slug>)` group, optional `(?<posting_id>)`, `fetchDetails`, `detailLimit`).

- [ ] **Step 2: Write the entry**

```yaml
  - name: Shopify
    provider: sitemap
    careers_url: https://www.shopify.com/careers
    sitemap:
      url: https://www.shopify.com/careers/sitemap.xml
      job_path: "^/careers/(?<slug>[a-z0-9-]+)_(?<posting_id>[0-9a-f-]{36})$"
      fetchDetails: true
      detailLimit: 50
    enabled: true
```
Remove the `scan_method` and `scan_query` lines.

- [ ] **Step 3: Verify**

Run: `node audit-portals.mjs --company Shopify --file ~/career-ops-data/portals.yml`
Expected: provider `sitemap`, count about 115 (measured 2026-11-08), titles derived from slugs, no descriptions (the audit runs with `maxPages: 1` and the provider skips enrichment while probing). Then `CAREER_OPS_ROOT=~/career-ops-data node scan.mjs --dry-run --company Shopify` and confirm descriptions on the rows whose title passed the filter (enrichment runs only for `ctx.titleWanted` survivors, capped by `detailLimit`).

## Phase C: retire The Muse (PR 2, D5)

Branch `claude/providers-retire-themuse`.

### Task C1: make `themuse` a retired provider

**Files:**
- Modify: `providers/themuse.mjs`
- Modify: `tests/providers/themuse.test.mjs`
- Modify: `docs/SUPPORTED_JOB_BOARDS.md:138` (The Muse row)
- Modify: `templates/portals.example.yml:2150-2152` (remove the stanza)
- Modify: `docs/SOURCE_INDEXING_LOG.md` (new entry)
- Modify: `.claude/skills/upstream-review/SKILL.md` (deviation rows: `providers/themuse.mjs`, `tests/providers/themuse.test.mjs`, KEEP; upstream still ships the live provider)

**Interfaces:**
- Produces: `export const RETIRED_MESSAGE` (string) from `providers/themuse.mjs`; a new `detect(entry) { return entry?.provider === 'themuse' ? { url: FEED_BASE } : null; }` (the `providers/echojobs.mjs:129` form; today's module exports only `id` and `fetch`, so without this the provider is in `tests/providers-explicit-only-stanza.test.mjs`'s set and deleting the stanza fails it); `fetch()` throws `new Error(RETIRED_MESSAGE)` before any network call.

- [ ] **Step 1: Rewrite the test**

Replace the fetch-path tests in `tests/providers/themuse.test.mjs` with (mirroring `tests/providers/echojobs.test.mjs`):
- `id` is `themuse`
- `detect({provider:'themuse'})` returns `{url}`; `detect({careers_url:'https://www.themuse.com/jobs'})` returns `null`
- `fetch({provider:'themuse'}, ctxWithThrowingFetchers)` rejects with `RETIRED_MESSAGE`, and the fetch stubs were called 0 times
- `RETIRED_MESSAGE` contains `cf-mitigated: challenge` and `2026-11-08`

- [ ] **Step 2: Run it to see it fail**

Run: `node test-all.mjs --quick --only providers/themuse`
Expected: FAIL (fetch attempts the network stub / `RETIRED_MESSAGE` undefined).

- [ ] **Step 3: Implement**

In `providers/themuse.mjs` keep `id`, add the `detect()` above, delete the pagination and retry code, and add `RETIRED_MESSAGE` in the EchoJobs form, naming: Cloudflare managed challenge on every path including `/api/public/jobs` (`cf-mitigated: challenge`, HTTP 403, observed 2026-11-08 from two networks), remove `provider: themuse` from `portals.yml`, and that users with an Apify token can read the board through `provider: apify` with the public actor `bibian/themuse-jobs-scraper` (answers HTTP 200 on apify.com, 2026-11-08; re-check before committing user-facing text; see `plugins/apify/skill.md`).

- [ ] **Step 4: Docs**

Catalog row mirrors Torre (`docs/SUPPORTED_JOB_BOARDS.md:140`): the Type cell becomes `**Retired (2026-11-08)**` and the Notes cell keeps the old endpoint plus the reason and the Apify route; row position unchanged. Delete the example stanza. Add a log entry titled `## themuse.com (retired 2026-11-08)` in the jobspresso entry's table form (Provider, Status, what was checked: the headers and paths listed in ASSESSMENT.md section 10 D5). Add the two deviation rows.

- [ ] **Step 5: Run the sweeps and commit**

Run: `node test-all.mjs --quick --only providers` then `node test-all.mjs --quick`
Expected: green, including `providers-explicit-only-stanza` (the new `detect()` takes themuse out of its set). Then commit and run `node test-all.mjs --quick --only fork-deviations-covered` (rows: `providers/themuse.mjs` KEEP; `tests/providers/themuse.test.mjs` is under `tests/`, row by policy).
```bash
git add -A . && git commit -m "feat(providers): retire themuse behind a Cloudflare challenge; point users at the Apify route"
```

## Phase D: drift gates and housekeeping (PR 3, F5, F6, F8 housekeeping)

Branch `claude/providers-drift-gates`.

### Task D1: every provider has a catalog row and an example stanza

**Files:**
- Create: `tests/providers/catalog-and-template-coverage.test.mjs`
- Modify: `templates/portals.example.yml` (add stanzas for `apple`, `atlassian`, `google`, `bwi`, `radancy`, `tkms`, `hiringroom`, `remotli`; fix the header claim at line ~1395)
- Modify: `docs/SUPPORTED_JOB_BOARDS.md` only if a row is missing

**Interfaces:**
- Produces: the test exports nothing; it reads `providers/*.mjs` ids through `loadProviders` (`providers/_registry.mjs`), `docs/SUPPORTED_JOB_BOARDS.md` and `templates/portals.example.yml`.

- [ ] **Step 1: Write the failing test**

Two checks, both mechanical (both were run read-only on 2026-11-08 and the expected failures below are what they printed):

(a) Catalog: for every provider id except `local-parser`, the lower-cased `docs/SUPPORTED_JOB_BOARDS.md` contains `provider: {id}`, or `` `{id}` ``, or the id with hyphens replaced by spaces. Two rows need an alias entry in the test (`adp-workforcenow` → `adp workforce now`, `remote-com` → `remote.com`); keep the alias map in the test, not in the catalog.

(b) Template: collect every `provider: <id>` value and every `https://…` URL in `templates/portals.example.yml` (commented lines included). A provider is covered when its id is in the first set, or when its `detect({name, careers_url: url})` or `detect({name, api: url})` returns truthy for any collected URL. Every provider except `local-parser` must be covered; a provider whose catalog row contains `**Retired` is exempt (neither `echojobs.mjs` nor `torre.mjs` exports its `RETIRED_MESSAGE`, so the catalog is the mechanical signal; C1's Muse row must use the same `**Retired` marker). Load providers through `loadProviders` from `providers/_registry.mjs`; wrap each `detect()` in try/catch.

- [ ] **Step 2: Run it to see it fail**

Run: `node test-all.mjs --quick --only catalog-and-template-coverage`
Expected: (a) passes once the two aliases are in; (b) FAILS listing exactly `apple, atlassian, bwi, google, hiringroom, radancy, remotli, tkms` (measured: 349 URLs in the template cover 126 of 137 providers; `echojobs` and `torre` are the retired exemptions).

- [ ] **Step 3: Add the eight stanzas**

One commented `Example … Co` stanza each in the matching group of the "Built-in provider examples" block, copying a neighbour's shape; `remotli` goes in "Job boards / aggregators" with a `careers_url: https://remotli.ch/…` line matching its `detect()`. Change the header sentence at ~1395 to state the rule the test now enforces.

- [ ] **Step 4: Pass, suite, commit**

Run: `node test-all.mjs --quick --only catalog-and-template-coverage`, then `node test-all.mjs --quick`.
```bash
git add -A . && git commit -m "test(providers): every provider has a catalog row and an example stanza"
```

### Task D2: every board provider has an indexing-log entry, or a dated waiver

**Files:**
- Create: `tests/providers/indexing-log-coverage.test.mjs`
- Modify: `docs/SOURCE_INDEXING_LOG.md` (a `## Backfill waiver (2026-11-08)` section listing the ~49 pre-policy board providers from ASSESSMENT.md / `how-docs.md` section C, each on one line with the date its provider merged)

- [ ] **Step 1: Write the failing test**

Define "board provider" mechanically: a provider whose header comment (first 40 lines) contains `job_boards`. Measured 2026-11-08: 48 modules, of which `ibm` and `peoplesoft` are company adapters that merely mention the list (exempt them by name in the test) and `themuse`, `torre` are retired (exempt by `RETIRED_MESSAGE`). For each remaining module, `docs/SOURCE_INDEXING_LOG.md` must contain the token `` `providers/{id}.mjs` `` (every entry's table has a `**Provider**` row in that form, lines 18, 44, 80, 139, 169, 195, 219; headings do not carry ids), or a line in the waiver section naming the same token. Today 8 have entries (remotli, a16z-speedrun-talent, telegram-channel, computrabajo, magneto, jobscz, pracecz, jobspresso), so the waiver section starts with about 36 lines.

- [ ] **Step 2: Run to fail; Step 3: write the waiver section; Step 4: pass and commit**

```bash
git add -A . && git commit -m "test(providers): board providers carry an indexing-log entry or a dated waiver"
```

### Task D3: bound `fetchResponse` in the probe and give `audit-portals` the same budget

**Files:**
- Modify: `verify-portals.mjs:796-810` (`boundedProbeCtx`) and export it
- Modify: `audit-portals.mjs:278` (build the ctx through `boundedProbeCtx`)
- Test: `tests/verify-portals-probe-budget.test.mjs` (create)

**Interfaces:**
- Produces: `export function boundedProbeCtx(base): { ctx, wasTripped }` and `export class ProbePageBudgetReached` from `verify-portals.mjs` (the class is not exported today, `:773`, so a test cannot assert by identity), the ctx now wrapping `fetchJson`, `fetchText` and `fetchResponse`.
- In `audit-portals.mjs` the wrap is per entry, inside the worker loop at `:272-281` (the budget is per fetch, as `probeProvider` uses it at `:828`; one shared ctx would exhaust after four requests across entries). A thrown `ProbePageBudgetReached`, or `wasTripped()` with zero rows, maps to the same "live, partial" outcome `probeProvider` produces (`:832-844`), not to `error`, so a tenant that spends several bootstrap requests (SuccessFactors CSB, per the comment at `:775-779`) is not misreported.

- [ ] **Step 1: Write the failing test**

A fake provider whose `fetch` calls `ctx.fetchResponse` six times: with `boundedProbeCtx`, the fifth call throws `ProbePageBudgetReached` and `wasTripped()` is true. Second case: `auditCompanies` on two entries resolved to that provider makes at most 4 requests per entry (8 total, counted through a stub ctx) and reports each as partial-live, not `error`. Third case: a provider that swallows the sentinel and returns `[]` after four requests is also reported partial-live.

- [ ] **Step 2: Run to fail; Step 3: implement (add `fetchResponse: guard(base.fetchResponse)`, export the class and the function; in audit-portals call `boundedProbeCtx` on the per-entry copied ctx and map the sentinel); Step 4: pass; Step 5: commit, then add deviations rows for `verify-portals.mjs` and `audit-portals.mjs` (ADAPT, naming these hunks) and rerun `fork-deviations-covered`**

```bash
git add -A . && git commit -m "fix(verify-portals): bound fetchResponse in the probe and reuse the budget in audit-portals"
```

### Task D4: housekeeping edits named in the assessment

**Files:**
- Modify: `tests/providers/registry-loads-every-provider.test.mjs:21,24,30,81,170` and `tests/providers/host-guard-anchoring.test.mjs` ("105 providers" → drop the number; these are comments)
- Modify: `providers/_types.js:196` (`sleep` comment: no `setTimeout` fallback claim; add the ctx fields scan passes that the typedef omits: `sinceMs`, `includeUndated`, `locationHints`, `syntheticEntries`; `titleWanted` arrives with the `7af08dcc` pick)
- Modify: `providers/ADDING_A_PROVIDER.md` (`deutschebahn` "302" citation at ~289; the garbled wildcard-host sentence at ~233-234; add the log entry and the "Evaluated, not supported" route to the section 5 checklist; list all seven sweep tests in section 3)
- Modify: `docs/SOURCE_INDEXING_LOG.md:9` (`santifer/career-ops` → `career-ops-hq/career-ops`)
- Modify: deviations table (ADAPT row for `providers/_types.js` naming the typedef hunk)
- Modify: `audit-portals.mjs` header comment and `docs/SCRIPTS.md` audit row: update after Task D5 extends the audit to `job_boards`

- [ ] **Step 1: Make the edits; Step 2: `node test-all.mjs --quick`; Step 3: commit**

```bash
git add -A . && git commit -m "docs(providers): fix stale counts, citations and the audit's list coverage"
```

### Task D5: record the evaluated-only and ineligible sources, and audit `job_boards`

**Files:**
- Modify: `docs/SUPPORTED_JOB_BOARDS.md` "Evaluated, not supported" table (one row per source below)
- Modify: `docs/SOURCE_INDEXING_LOG.md` (one short entry per source that got as far as an endpoint check: Loxo, Harri, Jobgether, Idealist, Dribbble, USAJOBS front-end route)
- Modify: `audit-portals.mjs:357-361` (`loadCompanies` also returns `job_boards` entries) and its header; `tests/audit-portals-providers-root.test.mjs:64-90` (fixture gains a `job_boards` entry that is audited)
- Modify: deviations table (ADAPT row for `audit-portals.mjs` naming the `loadCompanies` hunk)

- [ ] **Step 1: Write the failing test** for the audit: a fixture `portals.yml` with one `tracked_companies` and one `job_boards` entry, both resolved to a stub provider, yields two audit rows.

- [ ] **Step 2: Run to fail; Step 3: extend `loadCompanies` and the docstring; Step 4: pass**

- [ ] **Step 5: Write the rows**, with the measured reason from `ASSESSMENT.md` section 6b and 6c and the lane files, dated 2026-11-08. Under the adopted rule 6 a robots-only finding is no longer a stop, so ClearanceJobs, UNjobs, RemoteLeaf and Authentic Jobs are recorded as "robots.txt disallows the listing paths; eligible under rule 6 as of 2026-11-08, not built (low US/remote yield)" rather than as ineligible. Bot walls (PracticeLink, TeamWork Online, Climatebase, rubyonremote, golang.cafe, Nurse.com, Devex, HERC), meta-aggregators (DevITjobs, Levels.fyi, Arc.dev), paywall or login (Remote Rocketship, YC Work at a Startup, Wellfound), key-required (ReliefWeb, web3.career, USAJOBS documented API → Phase G), and the evaluated-only set (Idealist, Dribbble, Loxo, Jobgether, Harri) each get one row.

- [ ] **Step 6: Commit**

```bash
git add -A . && git commit -m "docs(providers): record the 2026-11-08 source evaluations; audit job_boards too"
```

## Phase E: new sources, API-shaped (PR 4)

Branch `claude/providers-new-api`. One commit per provider. Each task's Steps follow the same TDD cycle, so only the decisions are written out.

### Task E1: `madgex` (Chronicle, Inside Higher Ed, Science Careers)

**Files:**
- Create: `providers/madgex.mjs`, `tests/providers/madgex.test.mjs`
- Modify: catalog, example template, indexing log, deviations table

**Interfaces:**
- `id: 'madgex'`; `detect(entry)` returns `{url}` when `entry.provider === 'madgex'` and `entry.careers_url` parses as https on one of `TRUSTED_HOSTS = new Set(['jobs.chronicle.com','careers.insidehighered.com','jobs.sciencecareers.org'])`; otherwise `null` (explicit-only: the hosts are branded, so no URL-pattern claim).
- Config: `madgex: { keywords: string[] }`; when absent, fall back to `config/profile.yml` `target_roles` through `resolveProfileKeywords` (`providers/_profile-keywords.mjs`, as `jobbankca.mjs:236-242` does) and throw when both are absent, so a scan is bounded by the candidate's own terms; each keyword is one `?keywords=` pass behind a shared `seen` set; `max_pages` default `DEFAULT_MAX_PAGES = 25`, `MAX_PAGES_CAP = 1500`. Rule 3 (complete inventory) is met by the walk's natural end: a page past the last returns zero items, and raising `max_pages` on the entry reaches the whole board (~1,437 pages of 20 on Chronicle unfiltered). The catalog row states both.
- Feed: `https://{host}/jobsrss/?page={n}[&keywords=…]`; RSS 2.0; `<opensearch:totalResults>`; 20 `<item>`/page; a page past the end returns 0 items (natural stop).
- `export function parseMadgexFeed(xml, host): Job[]`: `title` is the text after the first `": "` in `<title>` (employer before it becomes `company`); `url` is `<link>` with `TrackID` and `utm_*` params stripped; `location` is the last line of `<description>` after `decodeEntities`; `postedAt` from `<pubDate>` via `toEpochMs`; `description` the decoded description text.
- Tests: id; detect positive for each host and the three negatives from Review Focus 1; parse of a two-item fixture (one with `&amp;` in the title); a body that is HTML not XML throws; an RSS with zero items returns `[]`; `ctx.maxPages: 1` makes exactly one request; pagination stops on an empty page before `DEFAULT_MAX_PAGES`; keyword passes dedupe by URL; `redirect: 'error'` asserted on every call.
- Mirror: `providers/higheredjobs.mjs` for the RSS parse, `providers/builtin.mjs:478-509` for the multi-query pass behind one `seen` set.
- `fetch()` validates `entry.careers_url` (https, host in `TRUSTED_HOSTS`) before the first request; test asserts zero fetch calls on a bad host.
- Log entry: rules 1 to 5 with the measured numbers (totalResults 28,734 / 23,312 / 531 on 2026-11-08), rule 6 as "read like a visitor", robots lines quoted (only `/invalid-request/`, `/analytics/`, `*/emailjob/*`, `*/previewjob/*` disallowed).

### Task E2: `bullhorn` (public career-portal REST)

**Interfaces:**
- `id: 'bullhorn'`; explicit-only `detect` (`entry.provider === 'bullhorn'`, `entry.careers_url` https).
- `careersOrigin` = `new URL(entry.careers_url).origin`, https only, computed once in `fetch()` before any request (throw otherwise). This first request goes to the agency's own branded host, for which no vendor allowlist can exist; that is the `phenom.mjs` shape the guide names as valid, with the DNS/IP guard in `_http.mjs` as the protection. The list requests are allowlisted by `assertBullhornUrl`. `export async function resolveTenant(entry, ctx): { swimlane: string, corpToken: string }`: reads `${careersOrigin}/app.json` through `cachedLookup(ctx.idCache, hostname, lookup, { isValid })` from `_cached-lookup.mjs` (`isValid` is required by its signature at `:32`; mirror `join.mjs:202`), falls back to a plain fetch when `ctx.idCache` is absent; `swimlane` must match `/^\d{1,3}$/`, `corpToken` `/^[A-Z0-9]{4,12}$/`, else throw naming the field (Review Focus 5). A `careersUrl` inside `app.json` is not used for anything: job URLs are built on `careersOrigin`. Optional overrides `bullhorn: { swimlane, corpToken }` skip the lookup.
- `export function assertBullhornUrl(url)`: hostname must match `/^public-rest\d{1,3}\.bullhornstaffing\.com$/` (anchored).
- List: `GET https://public-rest{swimlane}.bullhornstaffing.com/rest-services/{corpToken}/search/JobOrder?query=(isOpen:1) AND (isDeleted:0)&fields=id,title,address,employmentType,dateLastPublished,publicDescription,publishedCategory&count=500&start={n}`; stop when `start + data.length >= total` or `data.length < count`; `DEFAULT_MAX_PAGES = 20`, `MAX_PAGES_CAP = 200`.
- Job: `title`; `url` `${careersOrigin}/#/jobs/${id}` (id through `safeEncodeURIComponent`); `company` = `entry.name` (the agency, D4); `location` from `address.city`, `address.state`, `address.countryID` (countryID 1 = US, else omit); `postedAt` = `dateLastPublished` (already epoch ms); `description` from `publicDescription` through `htmlToText` (`_html-to-text.mjs`); `requisitionId` = `coerceId(id)`.
- Empty vs broken: `data` missing or non-array throws naming the keys; `{total:0,data:[]}` returns `[]`.
- Tests as E1 plus: an `entry.careers_url` that is not https throws before any request (fetch stub count 0); `app.json` whose `careersUrl` is on another origin is ignored (the entry's origin wins) and logged; a malformed `swimlane` or `corpToken` throws; override config skips `app.json`. Add `bullhorn` to the `CONVERTED` list and a lone-surrogate `id` case in `tests/providers/url-encoding-surrogate.test.mjs`.
- Mirror: `providers/ultipro.mjs`.

### Task E3: `eightythousandhours` (jobs.80000hours.org, Algolia, D2)

**Interfaces:**
- `id: 'eightythousandhours'`; explicit-only `detect`.
- `export function parseAlgoliaConfig(html): { appId, apiKey, indexName }` from the `window.__NUXT__` public config block; throws when any of the three is missing (markup change).
- Query: `POST https://{appId}-dsn.algolia.net/1/indexes/{indexName}/query` with `{hitsPerPage: 1000, page: n}`, query params `x-algolia-application-id` and `x-algolia-api-key` (as `techinasia.mjs:157-159` does) and a `Referer: https://jobs.80000hours.org/` header; `assertHost` on `/^[a-z0-9]+-dsn\.algolia\.net$/`; `DEFAULT_MAX_PAGES = 3`, `MAX_PAGES_CAP = 20`; stop when `page + 1 >= nbPages`. Algolia's default `paginationLimitedTo` is 1000 hits, and the board held 1019 on 2026-11-08, so `page=1` may come back empty: the implementer measures it first; if the window is capped, partition the query by the `tags_location_type` facet (the `workday.mjs` facet-split precedent) and dedupe by URL, and the catalog row states the limit.
- Job: `title`; `url` = `url_external` when https, else the board's own job page; `company` = `company_name`; `location` = `card_locations` joined; `postedAt` = `posted_at` seconds × 1000 (verify the unit against the fixture the implementer records); `description`; `closesAt` is NOT set (the fork has not taken `6360bbb4`, D6).
- Tests as E1 plus: config parse from a fixture HTML; missing key throws; `exhaustiveNbHits`-style empty `{hits:[]}` returns `[]`; a hit whose `url_external` is `http:` falls back to the board URL.
- Mirror: `providers/techinasia.mjs`.
- Log entry states the embedded-key decision (D2) and the techinasia precedent.

### Task E4: `manatal` (careers-page.com)

**Interfaces:**
- `id: 'manatal'`; URL-pattern `detect` on `https://www.careers-page.com/{slug}` (host exactly `www.careers-page.com` or `careers-page.com`; slug `/^[a-z0-9-]+$/`).
- List: `GET https://www.careers-page.com/api/v1.0/c/{slug}/jobs/?page_size=100&page={n}`; follow `next` until null; `DEFAULT_MAX_PAGES = 20`, `MAX_PAGES_CAP = 200`.
- Job: `title` = `position_name`; `url` = `https://www.careers-page.com/{slug}/job/{hash}` (`hash` through `safeEncodeURIComponent`; confirm the path against one live posting before committing and record it in the header comment); `company` = `entry.name`; `location` = `location_display`; no `postedAt` (the API has no date field: say so in the catalog row); `description` through `htmlToText`.
- Empty vs broken: `results` missing or non-array throws; `{count:0,results:[]}` returns `[]`.
- Tests: add `manatal` to `CONVERTED` and a lone-surrogate `hash` case in `tests/providers/url-encoding-surrogate.test.mjs`; a non-https or off-host `careers_url` throws before any request.
- Mirror: `providers/recruitee.mjs`.

### Task E5: `cryptojobslist` (RSS)

**Interfaces:**
- `id: 'cryptojobslist'`; explicit-only `detect`.
- Feed: `GET https://api.cryptojobslist.com/jobs.rss` (the settled URL; the `/rss` 301 is not followed, `redirect: 'error'`); 100 items, one request.
- `export function parseCryptoJobsListFeed(xml): Job[]`: `title` and `company` split on the last `" at "`; `url` = `<link>`; `postedAt` from `<pubDate>`; `description` decoded.
- Mirror: `providers/larajobs.mjs`. Log entry notes the robots `ClaudeBot: Allow /` line and that the full inventory (656 in the sitemap) is not walked, so rule 3 is met for the newest 100 only, stated in the catalog row.

## Phase F: new sources, HTML-shaped (PR 5)

Branch `claude/providers-new-html`.

### Task F1: `healthecareers`

**Interfaces:**
- `id: 'healthecareers'`; explicit-only `detect` (`TRUSTED_HOST = 'www.healthecareers.com'`).
- List: `GET https://www.healthecareers.com/search-jobs?pg={n}` (never `/searchjobs/` or `/new-search-jobs/`, which robots disallows; assert the path literal in a test); cards are `/job/{slug}/{id}` links; `DEFAULT_MAX_PAGES = 10`, `MAX_PAGES_CAP = 500`; stop when a page yields no new URLs.
- `export function parseSearchPage(html): {url, title, company?, location?}[]`. Order of checks on page 1: a challenge page (`CHALLENGE_RE` as in `providers/computrabajo.mjs:44`) → throw naming the bot wall; then `assertParsedSomething` as `itviec.mjs:222-229`: `/job/` hrefs present but zero cards → throw; neither → `[]`. The challenge check comes first because `itviec`'s guard returns silently on a page with no hrefs, which is what a challenge page looks like.
- Optional `healthecareers: { fetchDetails: true, detailLimit: 25 }` fills `postedAt`, `company`, `description` from the detail page's JSON-LD `JobPosting`; skipped while `ctx.maxPages` is set.
- Tests: Review Focus 2 fixture (a `Just a moment` challenge HTML → throw), plus the `fetchDetails` cases the guide lists.
- Mirror: `providers/itviec.mjs` for parsing, `providers/eploy.mjs` for the detail loop.
- Board: indexing-log entry required (rules 1 to 5 with the measured numbers; rule 6 as "read like a visitor", quoting the robots lines on `/search-jobs` and `/searchjobs/`); whether it carries backfill is checked and stated there.

### Task F2: `techjobsforgood` (dropped)

**Dropped (2026-11-08) as a rule 1 paywall stop.** The free board is a paywalled slice: `/jobs/` shows about 84 free postings beside "Upgrade to see" about 890 more (the counts drift day to day; the log entry has the measurement). No provider was built; the board is recorded as evaluated, not supported, in `docs/SUPPORTED_JOB_BOARDS.md` and `docs/SOURCE_INDEXING_LOG.md`. The interfaces below are the original task, kept for the record.

**Interfaces:**
- `id: 'techjobsforgood'`; explicit-only `detect` (`TRUSTED_HOST = 'techjobsforgood.com'`).
- List: `GET https://techjobsforgood.com/jobs/?page={n}`, 30 cards/page; a 404 on page N is the natural end (catch `err.status === 404` on page > 1 only; page 1 404 throws); `DEFAULT_MAX_PAGES = 5`, `MAX_PAGES_CAP = 50`.
- `export function parseJobsPage(html)`: cards with `/jobs/{id}/` links carrying title, company and location text.
- Optional `fetchDetails` as F1 (84 postings; JSON-LD has `datePosted`, `hiringOrganization`).
- Tests include a challenge-HTML fixture on page 1 → throw (Review Focus 2).
- Board: indexing-log entry required (whether listings are employer-posted or scraped is checked and stated there).
- Mirror: `providers/generalist-world.mjs`.

### Task F3: `dynamitejobs` (sitemap + JSON-LD)

Reads `providers/sitemap.mjs` (from the Phase B pick) as a reference only; the provider itself imports `titleFromSlug` from `providers/eploy.mjs`, present today, so F3 does not depend on the pick. It is its own provider because `provider: sitemap` is one employer per entry (`company` = `entry.name`), while Dynamite is a multi-employer board whose company is a URL segment; the rows also need their detail page for a real title, date and location.

**Interfaces:**
- `id: 'dynamitejobs'`; explicit-only `detect` (`TRUSTED_HOST = 'dynamitejobs.com'`).
- Index: `GET https://dynamitejobs.com/sitemap/jobs-of-company.xml`; keep `<loc>` matching `^https://dynamitejobs\.com/company/(?<company>[a-z0-9-]+)/remote-job/(?<slug>[a-z0-9-]+)$`; `<lastmod>` is not `postedAt`.
- Title before detail: `titleFromSlug(slug)` (exported by `providers/eploy.mjs:99`, reused by upstream's sitemap provider). Detail fetches run only for rows whose slug title passes `ctx.titleWanted` when scan supplies it (as `sitemap.mjs` does), so a full scan does not fetch 500 pages for a filter that keeps 20. Detail: one `fetchTextWithRetry` per URL, batches of 3 with 250 ms pacing (the `eploy.mjs` loop), `detailLimit` default 200, cap 1000; JSON-LD `JobPosting` gives `title`, `hiringOrganization.name`, `datePosted`, `jobLocationType`, `applicantLocationRequirements` → `location` ("Remote" plus the requirement names), `description`. A row whose detail fetch fails is dropped with a warning, never fatal.
- Under `ctx.maxPages` only the sitemap is read and the rows return with the slug title and no detail (the probe needs a count, not content).
- Tests: a sitemap with zero matching `<loc>` but other URLs → `[]`; an empty body → throw; `detailLimit` caps the detail calls; probe makes exactly one request.
- Catalog row states "detail fetches run for title-filter survivors only, capped by `detailLimit`".
- Board: indexing-log entry required (robots `Disallow: /api/` quoted, sitemap and job pages not disallowed).

## Phase G: USAJOBS as a keyed plugin (PR 6, D3, optional)

Branch `claude/plugin-usajobs`. Upstream's CONTRIBUTING says new plugins are published as `career-ops-plugin-<id>`; a fork-local `plugins/usajobs/` is a KEEP deviation. Decide at execution time whether to keep it in-tree or publish; the task below is the in-tree form.

### Task G1: `plugins/usajobs/`

**Files:**
- Create: `plugins/usajobs/manifest.json`, `plugins/usajobs/index.mjs`, `plugins/usajobs/skill.md`, `tests/plugins/usajobs.test.mjs`
- Modify: `test-all.mjs:16455-16456` (the bundled plugin set is pinned to `apify,gmail,h1b-sponsor,notion`; add `usajobs` in alphabetical position)
- Modify: deviations table (KEEP rows for `plugins/usajobs/` and `test-all.mjs`, ADAPT note for the pinned-set line)

**Interfaces (mirror `plugins/apify/`):**
- `manifest.json`: `id: "usajobs"`, `hooks: ["provider"]`, `requiredEnv: ["USAJOBS_API_KEY", "USAJOBS_USER_AGENT"]` (USAJOBS requires the registered email as `User-Agent` and the key as `Authorization-Key`), `allowedHosts: ["data.usajobs.gov"]`, `humanInTheLoop: true` (`plugins/_engine.mjs:244` rejects any other value, and `:644` flags the literal `humanInTheLoop: false`; the field means "never auto-submits", which holds for a read-only source).
- `index.mjs` default export `{ provider: { id: 'usajobs', async fetch(entry, ctx) } }` reached only by `provider: usajobs`; `GET https://data.usajobs.gov/api/search?Keyword={k}&ResultsPerPage=500&Page={n}` per `usajobs.keywords[]` entry, falling back to `config/profile.yml` `target_roles` through `resolveProfileKeywords` from `providers/_profile-keywords.mjs` and throwing only when both are absent, as `providers/jobbankca.mjs:236-242` does; stop when `SearchResult.UserArea.NumberOfPages` is reached, own cap 20.
- Job from `MatchedObjectDescriptor`: `PositionTitle`, `PositionURI`, `OrganizationName` (company), `PositionLocationDisplay`, `PublicationStartDate` → `postedAt`, `UserArea.Details.JobSummary` → description.
- Tests with recorded fixtures; the headers are asserted on every call; a 401 throws naming the missing key.
- `skill.md` documents getting the free key at developer.usajobs.gov and the two `.env` lines.

---

## Self-review notes

- Spec coverage: F1 → C1; F2 → A1, B3; F3 → B1, B2; F4 → B1; F5 → D1, D2; F6 → D3; F7 (upstream kept its code gates) → D1 decision, no code task; F8 (47 unprobed providers) → no task, needs real tenant URLs from the operator; housekeeping → D4; evaluated-only and ineligible sources → D5; F9 (agentic-jobs 500) is source-side and gets no task; section 6 scope → E1 to E5, F1 to F3; D3 → G1; D6 → B1 (not picked).
- Types: `boundedProbeCtx` is named the same in D3 and the Review Focus; provider ids are lowercase single tokens everywhere (`eightythousandhours`, `cryptojobslist`, `dynamitejobs`, `healthecareers`, `techjobsforgood`, `madgex`, `bullhorn`, `manatal`).
- Proportion: no provider body is written; each task pins endpoint, id, detect shape, config keys, field mapping, stop rule, caps, reference module and the test cases the guide requires.
- Open at execution time (state in the PR, do not guess): the Manatal job-URL path shape (E4), the 80,000 Hours `posted_at` unit and whether `page=1` is reachable (E3), whether Health eCareers carries backfill (F1 log entry), the cluster sync path (A1 step 4), in-tree versus published plugin (G1).
