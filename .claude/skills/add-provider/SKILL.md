---
name: add-provider
description: Add a new zero-auth job-source scanner provider to career-ops the house way (eligibility check, mirror an existing provider shape, test file, docs row). Use when asked to add a job board, ATS vendor or company careers API to the scanner, or when a user wants a new source in portals.yml that no provider reads yet.
argument-hint: "<provider-name> <sample board or API URL>"
---

# Add a scanner provider

Arguments: `$ARGUMENTS` (a short provider name and one sample URL).

1. Read `${CLAUDE_PROJECT_DIR}/providers/ADDING_A_PROVIDER.md` in full. It is the checklist and the contract; do not improvise around it.
2. Eligibility first. A single-company ATS adapter is eligible by construction. A board or aggregator must clear the Source Indexing Policy in `CONTRIBUTING.md`: employer-attributed, free for the candidate, one source per provider, full inventory with no paid placement, and `robots.txt` read per path for the paths the provider would fetch. Report the verdict before writing code; an ineligible source goes into the "Evaluated, not supported" table of `docs/SUPPORTED_JOB_BOARDS.md` instead.
3. Pick the existing provider in `providers/` with the same shape (JSON API, feed, server-rendered HTML) and mirror it, including its SSRF and timeout guards. The type catalog is `providers/_types.js`. No registration: `providers/_registry.mjs` discovers the file.
4. Write `tests/providers/{name}.test.mjs` following the pattern the guide names, with a recorded fixture, never a live network call.
5. Run `node test-all.mjs --quick --only providers/{name}` and `node test-all.mjs --quick --only providers/ats-ssrf`, then `npm run lint`. The full `node test-all.mjs` is still owed before the PR; `--only` is not a merge gate.
6. Add the row to `docs/SUPPORTED_JOB_BOARDS.md` (case-insensitive alphabetical by board name), the `templates/portals.example.yml` stanza the guide's checklist describes (`tests/providers-explicit-only-stanza.test.mjs` fails without one for a provider with no `detect()`), and, for a board or aggregator, the `docs/SOURCE_INDEXING_LOG.md` entry stating what was checked.

Stop before committing and summarise: eligibility evidence, files added, tests run and their results.
