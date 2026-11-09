---
name: career-ops-plugin-usajobs
description: How to scan US federal openings from the USAJOBS Search API as a keyed provider.
license: MIT
---

# usajobs plugin

A keyed provider: reads US federal openings from the documented USAJOBS Search
API (`data.usajobs.gov/api/search`). It fires ONLY on a `portals.yml` entry that
sets `provider: usajobs`, never via auto-detection.

## Key

Request a free key at https://developer.usajobs.gov by registering with an
email address. The plugin sends the key as `Authorization-Key`, and USAJOBS expects that
same email as the `User-Agent` header. Put both in `.env`:

```
USAJOBS_API_KEY=paste-your-key-here
USAJOBS_USER_AGENT=you@example.com
```

Then enable the plugin: `node plugins.mjs enable usajobs --confirm`. With no
`config/plugins.yml`, or the plugin off, `provider: usajobs` is unknown to the
scanner.

## portals.yml entry

```yaml
tracked_companies:
  - name: "USAJOBS — data engineering"
    provider: usajobs
    usajobs: { keywords: ["data engineer"], location: "Washington, DC" }
```

`keywords` runs one search per entry and deduplicates postings by URL. Leave it
out and the plugin falls back to `config/profile.yml` `target_roles`; with
neither, the entry errors. `location` is optional and passed as `LocationName`.

## Limits

Each request asks for 500 results, and each keyword stops at 20 pages. The API
serves at most 10,000 rows per query, so 20 pages of 500 is its ceiling. A
portal probe (`verify-portals.mjs`, `audit-portals.mjs`) passes `maxPages: 1`
and reads one page.
