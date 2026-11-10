# Settings UI: research

Date: 2026-11-09. Question: which configuration does career-ops read, which of it should an ordinary user be able to change from the dashboard, and how can a saved value reach every reader?

Spec: `docs/superpowers/specs/completed/2026-11-09-settings-ui-design.md`. Plan: `docs/superpowers/plans/completed/2026-11-09-settings-ui.md`.

## Files

| File | What it holds | How it was made |
|---|---|---|
| `01-env-inventory.md` | 190 environment variables read by product code: read site, default, bad-value behavior, `.env` reach, docs, class | Subagent (Sonnet), `git grep` and direct reads |
| `02-config-key-inventory.md` | Every key in `config/profile.yml`, `portals.yml`, `config/plugins.yml`, `config/privacy.yml` and the smaller stores: reader, type, default, existing writer, how often it changes | Subagent (Sonnet) |
| `03-dashboard-settings-audit.md` | What the dashboard lets a user edit today, how it writes files, how it starts child processes, hardcoded tunables, navigation | Subagent (Sonnet) |

The three reports are subagent output. Treat a row as a lead until its file:line is read.

## Claims re-checked by the coordinating session

Each was run or read directly on 2026-11-09 at `538f8332`.

| Claim | Check | Result |
|---|---|---|
| The OS-scheduled runner gets only three path variables | Read `web/scripts/install-scan-schedule.sh:52-62` | Confirmed |
| The DNS variables are read at module load, before the data root `.env` is loaded | Read `providers/_dns-cache.mjs:390` and `scan.mjs:101-107` | Confirmed |
| `patchProfileText` returns null for top-level keys | Ran it on `config/profile.example.yml` with five patches | `cv.max_pages`, `pipeline.auto_evaluate_daily_cap`, `language.output`: 353 of 353 comment lines kept. `spend_tier`, `auto_pdf_score_threshold`: null |
| `spend_tier` is read by a line regex | Read `batch-evaluate-gemini.mjs:91`, `batch/batch-runner.sh:661-667` | Confirmed |
| `setPluginEnabled` writes with `yaml.dump` and plain `writeFileSync` | Read `plugins.mjs:462-470` | Confirmed |
| `setListInText` keeps comment lines that sit inside a list | Read `web/src/lib/portals-config.mjs:116-152`; the template has 32 comment lines inside `title_filter.negative` | Confirmed by reading, not run |
| `doctor.mjs --json` reports plugin state | Ran it | `plugins: [{ id, hooks, enabled, missingEnv }]` |
| `path-resolver.mjs` imports only builtins | Read its imports | Confirmed: `path`, `url`, `fs`, `os` |
| Which files read a registry variable | Ran the coverage test's matcher over `git ls-files` | 12 files for the first 13 ids, 8 for the model ids (lists in the plan, Tasks 3 and 11) |
| `update-system.mjs` has no local static imports | Read its import block | Confirmed, so the update channel is not exposed |

## Not checked

- Whether `next dev` runs route handlers in the launcher's process. The design does not depend on it: the dashboard never mutates its own `process.env`.
- The Windows scheduler installer (`.ps1`).
- Provider-specific blocks inside `portals.yml` entries.
- Whether an agent following `modes/*.md` honors each profile key the inventory marks "agent prompt". That was checked by grep, not by running an agent.
- The line numbers inside the three reports were not all re-read. The plan cites only lines the coordinating session read.

## Classification rule

A setting is editable in the UI when all three hold: a reader exists in code or in a prompt an agent follows, an ordinary user has a reason to change it, and a wrong value cannot widen access or disable a safety gate. Paths, hosting settings, gates and internals stay in the environment. The spec lists every editable id with its bounds, and every group left out with the reason.

## Plan review, 2026-11-09

The plan was reviewed twice before it was committed: by the coordinating session, and by an independent subagent (Opus) that had not seen the design discussion. Each finding below was re-read or re-run by the coordinating session before the plan changed.

| Finding | Evidence | Change |
|---|---|---|
| `lib/settings-*.mjs` in `config/local-paths.txt` would break every scan after `update-system.mjs apply` | `apply` checks out only `SYSTEM_PATHS` (`update-system.mjs:4987`); `scan.mjs` and the other importers are system files | The three files go in `SYSTEM_PATHS`; `CHANGELOG.fork.md` is the precedent |
| The `CAREER_OPS_RANK_CLI` enum offered ids the ranker runs wrongly | `rank-pipeline.mjs:412` matches by `bin` and runs an unknown value with a bare `-p`, without the tool-denial flags at `:90-106` | The enum is the nine candidate binaries |
| A quoted top-level `spend_tier` silently selects the standard model | `scalar()` quotes strings (`profile-yaml-edit.mjs:17`); `batch-evaluate-gemini.mjs:91-93,140-147` takes the text verbatim | Top-level plain strings are written bare, with a test on that regex |
| An async `effectiveEnv()` could not feed the sync CLI resolver | `resolveCliOrFallback` (`web/src/lib/clis.ts:171`) is sync with nine call sites | `readRememberedCli` reads the saved CLI synchronously |
| The Config form's CLI save had no revision and posted an empty id | `config-form.tsx:36-99` | It fetches the revision, skips an empty or unchanged id, and signals the settings view |
| The dashboard ignored `CAREER_OPS_SETTINGS=off`, and the switch does nothing in `.env` | The overlay runs before `scan.mjs:107` loads `.env` | GET reports `overlayDisabled`; the page shows a banner; the `.env.example` note says shell only |
| `visa_filter.enabled` and `experience_filter.enabled` would read off when the scanner has them on | `scan.mjs:4696`, `:4703-4705`; onboarding writes the block with no `enabled` | Effective value follows the scanner's rule |
| The salary bound of ten million rejected JPY, KRW and INR figures | `scan.mjs:1328` accepts any finite value of 0 or more | No practical ceiling |
| Tests would read a developer's saved settings | This checkout resolves itself as the data root; `web/tests/lib/scheduled-jobs-runner.test.mjs` imports the runner in-process; a probe showed `node --import` reaches `node:test` subprocesses | Both test runners default to `CAREER_OPS_SETTINGS=off` |
| A saved CLI silently shadows `node remember-cli.mjs` | `remember-cli.mjs` writes `.env`, which a saved value beats | `remember-cli.mjs` prints a note |
| `config/settings.json` was missing from `USER_PATHS` and `.dockerignore` | `tests/server-image.test.mjs:43` | Both added |
| The drift guard missed `ctx?.env?.ID` and would misread header comments | `plugins/notion/index.mjs:29`; comments in `providers/_dns-cache.mjs` | Wider pattern; comments stripped |
| `CAREER_OPS_DNS_LOOKUPS_PER_MIN` must not be badged "From .env" | Read at module load (`providers/_dns-cache.mjs:390`) | The `dotenv` ids are listed by name |
| Smaller gaps | Top-level placement after a commented twin can land inside another block; one command had its flags in the wrong order; the Portals page is a server component; `validatePortalsConfig` is async; backups are timestamped | Fixed in place |

Checked and found sound: ESM evaluation order for a first side-effect import in every listed file (shebang and `// @ts-check` headers are compatible); no reader loads `.env` with `override`; the Next.js server imports none of the overlay's readers in-process; the plan's named interfaces exist with the stated signatures; defaults match the code.

Not run: the updater end to end, and the Windows scheduler installer.
