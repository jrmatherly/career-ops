# Research behind the scan automation and platform plan

The plan `../../plans/2026-11-08-scan-automation-and-platform.md` rests on the four reports in this folder, all from 2026-11-08. Each report came from read-only exploration of this checkout, the home-cluster repository and the Claude Code and Better Auth documentation, by subagents whose findings the lead re-verified against the code before using them. Every claim is labelled measured, inferred or guess. No user-layer file was edited, no cluster resource was touched, and no key was read or printed; the one network probe was an unauthenticated request to the proxy's health and models endpoints from the operator's Mac. Beyond the `scan-runs.tsv` rates the brief named, the lead also read row counts from the data root's `pipeline.md`, the key names of `scheduled-jobs.json`, and token totals from the six dashboard-evaluation transcripts in the data root's Claude projects folder; only counts and sums left those files, and none of their text.

## Reports

| File | What it answers |
| --- | --- |
| `01-scan-to-evaluate.md` | How a scheduled scan could chain into ranking and the web's read-only evaluate path with a per-job off, review or auto mode, what the review queue needs in the user layer, how runs and failures are recorded, and the token cost at today's volume. |
| `02-cliproxyapi-routing.md` | How CLIProxyAPI is deployed and keyed, what the Claude Code docs say about `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN`, what in the fork notices or breaks behind a proxy, and the probe result. |
| `03-publish-key-minting.md` | Four ways to manage publish API keys from the dashboard, weighed against the convergence program's security decisions, with a recommendation. |
| `04-job-filters-vs-portals.md` | How a scheduled job's filter copy overrides `portals.yml` per run, and the smallest change that lets a job use the file's filters. |

## Reviews

`reviews/00-design-memo.md` is the memo the first panel read. `reviews/01-design-interrogation.md` records the three-model adversarial review of the two contested choices (the queue and refactor shape of thread 1, the key-minting option of thread 3) and what the lead did with each finding. `reviews/02-plan-review.md` records the second round, three reviewers reading the finished plan against the code through one lens each (executor readiness, repository conventions, design and risk), with every finding's disposition; the plan at the following commit applies them.

## Trail review

A reviewer on another model family (Opus) read the trail, the reports, the plan and the transcript before the commit and returned flags; the trail's closing rows record each flag and what changed. The flags that changed the plan were the candidate rule carrying no job identity, local installs where the dashboard may be offline, rows with no API text being refetched forever, the missing `/proc` gate, and the loss of web research in auto-mode reports.

## Decision trail

`decisions.tsv` is the append-only log of the session's decisions with evidence pointers, kept per the show-me-your-work convention. Render it with `column -s$'\t' -t decisions.tsv`. Rows are never edited; a wrong row is superseded by a later one.
