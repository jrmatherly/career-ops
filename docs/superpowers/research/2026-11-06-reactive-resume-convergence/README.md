# Research behind the Reactive Resume convergence plan

The spec (`../../specs/2026-11-06-reactive-resume-convergence.md`) and plan (`../../plans/2026-11-06-reactive-resume-convergence.md`) rest on the reports, prototypes and reviews in this folder, all from 2026-11-06. Each report is subagent output. Claims carry `file:line` evidence or are labelled inference, and the plan re-verified the load-bearing ones against the code before using them. Scratchpad paths quoted inside the reports (`/private/tmp/claude-501/...`) were the session's working directory and no longer exist; the artifacts they name are copied here.

## Reports, in reading order

| File | What it answers |
| --- | --- |
| `01-reactive-resume-inventory.md` | What Reactive Resume v6.1.0 ships (clone `d065a9f7`): schema, templates, Check, tracker, sharing, auth, imports. |
| `02-career-ops-inventory.md` | What career-ops already has for CV building, the web app and tracking, and its data contract and test conventions. |
| `03-multi-user-and-sharing-architecture.md` | Options for multi-user and public share links (per-user roots, process per user, a separate publish service, a Postgres mirror) and why the publish service won. |
| `04-tracker-field-mapping.md` | RR application fields and stages mapped onto the tracker, the sidecar design, and what an RR import can and cannot express. |
| `05-resume-schema-imports-check.md` | RR's Zod schema, importers, 23 Check rules, templates and exports, ranked port-as-is, adapt, reimplement or skip. |
| `06-web-app-internals.md` | The Next.js app's stack, preview path, status write path, auth (none) and entry points for the editor, board, Check panel and shares. |
| `07-better-auth-and-multi-user.md` | Better Auth on node:sqlite, the plugins, the multi-user options S, W and A2, and the security checklist. |
| `08-canonical-cv-decision.md` | Why `cv.md` stays canonical and `data/resume.json` is absorbed behind a lossless gate (design D), with the absorb prototype results. |
| `09-hosting-career-ops.md` | What running career-ops in a pod needs: the image, the pid-based lock constraint on scheduled scans, the origin guard, headless Claude auth, health. |
| `10-home-cluster-conventions.md` | How the home-cluster GitOps repo expresses an app, the gateway OIDC pattern, storage, CronJobs, images and secrets. |

## Prototypes

Throwaway code, kept as evidence. Sources are renamed `*.mjs.txt` so the repo's syntax and test discovery do not pick them up.

| Folder | What it proved |
| --- | --- |
| `prototypes/publish-service/` | A 120-line node:http plus node:sqlite service passed all five share-page claims (strict CSP in Chrome, scrypt plus HMAC password gate, hourly view dedup, feedback round-trip, hide-contacts). `RESULTS.md`, `selfcheck.out`, `screenshot-s-hidden.png`. |
| `prototypes/better-auth/` | better-auth 1.7.14 on node:sqlite: migration, `/api/auth/ok`, API key and cookie both resolve, forward-auth route; three surprises (getSession throws on a bad key, session mocking lets a key mint keys, 10 requests per day default). `RESULTS.md`. |
| `prototypes/absorb/` | cv.md to RR JSON round trip: nine edit kinds absorbed byte-identical, three failure cases that became PR-02 requirements. `absorb.out`, `sample.json`, `gen-cv.md`. |

## Reviews

| File | Round |
| --- | --- |
| `reviews/01-trail-review.md` | First cross-model review (13 flags) of the decision trail and the first plan, with outcomes. |
| `reviews/02-plan-review.md` | Second independent review (33 findings) of the revised plan; every finding was verified and either fixed or rejected with a reason in the plan's Appendix B. |

## Decision trail

`decisions.tsv` is the append-only log of the session's decisions, one row each with evidence pointers, kept per the show-me-your-work convention. Render it with `column -s$'\t' -t decisions.tsv`. Later sessions append to it; rows are never edited.
