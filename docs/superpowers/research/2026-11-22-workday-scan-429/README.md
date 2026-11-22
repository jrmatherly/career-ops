# Why five Workday boards stopped reading, and what was done

Date: 2026-11-22. Scope: the owner's hosted instance (v2.9.0), its `portals.yml` and scheduled scans. No code changed.

## Problem

From the 2026-11-16 12:01Z scan on, the daily scan reported 9 to 10 errors. Five Workday boards (Equifax, Home Depot, Fiserv, NCR Voyix, Elevance Health) have failed every scan since. The other five Workday boards on the list (Genesys, Zendesk, Empower, Truist, Global Payments) fail on some scans and read on others.

## Evidence labels

- **Measured** means a session ran it and read the output. Rows dated 2026-11-22 were run in the session that wrote this note. Rows marked "carried" come from the previous session's handoff and were not run again.
- **Inferred** means reasoned from code or data and not observed.

## Findings

| Finding | Evidence |
| --- | --- |
| The failure is an HTTP 429 with a Cloudflare "Security Check" JavaScript challenge and no `Retry-After`. | Carried. |
| The owner's workstation and the instance share one public address, so a probe from one against the other proves nothing. | Carried. |
| The 2026-11-15 21:34Z scan read all 10 Workday boards with the same board count, the same scan positions, the 163-company list and the v2.5.x reader. | Carried. This rules those four out as the cause of the onset. |
| v2.6.0 adds only `applyEntryPacing` to the scan path, the base image is pinned by digest, and the lockfile diff across the onset is a version stamp. | Carried. |
| Three all-board scans ran inside about 20 minutes on 2026-11-15 (21:34Z, 21:45Z, about 21:55Z). | Carried. This is the only lead for the onset and it is unproven. |
| `request_delay_ms: 4000` on all 10 Workday boards did not help. | Measured 2026-11-22. The 04:43Z scan, before the delay, had 5 Workday boards `unknown` and 4 `partial`, 5 errors. The 12:02Z scan, the first with the delay, had 9 `unknown` and 1 `partial`, 10 errors (`data/portal-health.tsv`, `data/scan-runs.tsv`). |
| The delay spaces requests inside one board only. | Inferred from `lib/entry-pacing.mjs`: the gate is keyed by the `portals.yml` entry, so ten boards on one host family still start together. |
| Scan concurrency is not the cause for Equifax. | Measured 2026-11-22 13:50Z, 108 minutes after the last scan: `CAREER_OPS_SCAN_CONCURRENCY=1 node scan.mjs --dry-run --company Equifax` returned `Equifax: HTTP 429`. |
| `CAREER_OPS_SCAN_CONCURRENCY` is unset on the instance, so scans run at the default of 10. | Measured 2026-11-22 (`env` in the pod; default in `lib/settings-registry.mjs`). |

## What was done

On the owner's instruction, the five boards that fail every scan were set to `enabled: false` in the instance's `portals.yml`, through `setCompanyEnabledText` from `web/src/lib/portals-config.mjs`. The diff is five lines. A dry-run scan of each of the five then reported "Scanning 0 companies". The file from before the change is kept beside the instance's other backups as `portals.yml.bak-2026-11-22-workday-disable`.

The other five Workday boards stay enabled and keep the 4-second delay.

## Not tested

- Home Depot, Fiserv, NCR Voyix and Elevance Health alone at concurrency 1. Only Equifax was run, to keep requests to a host that is challenging the address to a minimum.
- Whether the five intermittent boards read more often with the five blocked ones gone. The 2026-11-23 12:00Z scan is the first that can show it.
- Whether the block lifts by itself after a period without requests.
- Netflix, which read `reachable` at 04:43Z and `unknown` at 12:02Z on 2026-11-22.
- Getting past the challenge. That was not attempted and is not planned.

## If the intermittent five keep failing

Lowering `CAREER_OPS_SCAN_CONCURRENCY` is the one lever left that spreads requests across boards. The Equifax result says it does not lift an existing block. Whether it prevents a new one is not known.
