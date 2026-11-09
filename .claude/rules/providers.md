---
paths:
  - "providers/**"
---

# Adding or changing a scanner provider

- Read `providers/ADDING_A_PROVIDER.md` first. Before any code, the source must clear the Source Indexing Policy in `CONTRIBUTING.md` (employer-attributed, free, one source per provider, full inventory, and rule 6, read like a visitor: no login, no CAPTCHA, honour a stated `Crawl-delay`, an operator opt-out removes the source; `robots.txt` is not a gate).
- Mirror an existing provider of the same shape (ATS API, feed, server-rendered HTML); the type catalog is `providers/_types.js`.
- No registration: `providers/_registry.mjs` loads every module in the directory.
- Every provider has `tests/providers/{name}.test.mjs`; `tests/providers/host-guard-anchoring.test.mjs` and `tests/providers/registry-loads-every-provider.test.mjs` iterate every provider module and run against it too.
