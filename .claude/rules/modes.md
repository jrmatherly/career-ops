---
paths:
  - "modes/**/*.md"
  - "batch/batch-prompt.md"
---

# Editing mode files

- Every mode exists in about 20 language directories (`modes/de/`, `modes/fr/`, …). `tests/evaluation-mode-parity.test.mjs`, `tests/modes-readme-catalog.test.mjs`, `tests/modes-readme-language-keys.test.mjs` and `tests/modes-readme-report-blocks.test.mjs` check structure, catalog and report blocks. A change to `modes/x.md` either lands in every `modes/{lang}/x.md` or the PR names the i18n follow-up (`node test-all.mjs --quick --only evaluation-mode-parity` lists the drift).
- A new mode needs a row in `modes/README.md` and in the Skill Modes table of `AGENTS.md`.
- `_profile.md`, `_custom.md` and `_brief.md` are user files and never exist in this checkout; only their `.template.md` is editable. `_shared.md` is shared defaults for everyone, never personalization.
- Mode text is read by the user's agent as instructions, so a sentence here changes what every install does. Keep the Data Contract, Source-of-Truth Boundary and untrusted-content rules from `AGENTS.md` intact.
