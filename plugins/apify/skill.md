---
name: career-ops-plugin-apify
description: How to scan a job source through an Apify actor as a keyed provider.
license: MIT
---

# apify plugin

A keyed provider: runs an Apify actor and maps its dataset items into the
scanner. It fires ONLY on a `portals.yml` entry that sets `provider: apify` —
never via auto-detection. Enable it first (`node plugins.mjs enable apify --confirm`; with no `config/plugins.yml`, or the plugin off, `provider: apify` is unknown to the scanner) and put `APIFY_TOKEN` in `.env`.

## portals.yml entry

```yaml
tracked_companies:
  - name: "Indeed — VP Engineering (Chicago)"
    provider: apify
    actor: misceres/indeed-scraper
    input: { position: "VP of Engineering", location: "Chicago, IL", maxItems: 25 }
    field_map:
      title:    [positionName, title]    # array = first non-empty wins
      url:      url
      company:  [company, companyName]
      location: [location, formattedLocation]
```

Two optional entry keys. `defaults` fills `title`, `url`, `company` or
`location` when an item leaves it empty. `timeout_ms` caps how long the actor
run may take.

## Then

`node scan.mjs` runs the provider for that entry and writes the results to the
pipeline like any other source. An optional `field_map.description` caches the
JD locally under `jds/`.
