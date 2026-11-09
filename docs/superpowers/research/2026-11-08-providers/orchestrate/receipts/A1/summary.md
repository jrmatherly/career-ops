# Phase A receipt (coordinator, 2026-11-08 18:19 EST)

Raw audit and verify output is not kept here: it lists every tracked company in the operator's data-root portals.yml, which is private. Counts only.

- node audit-portals.mjs --summary --file ~/career-ops-data/portals.yml: 72 audited: 3 no-provider, 7 small, 62 ok. Before the edit the no-provider count was 6; the three remaining are the handoff entries the plan leaves unchanged (Task A1 names them). The three edited entries resolve to greenhouse, workday and workday with 38, 20 and 20 postings.
- node verify-portals.mjs --strict --file ~/career-ops-data/portals.yml: 69 live, 0 live-but-empty, 1 unresolved (1 unresolved), 3 no-provider (skipped); exit 1 only for one pre-existing unresolved board whose Ashby body exceeds the 10 MB maxBytes cap (logged in open-items.md), unrelated to this program.
