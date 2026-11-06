---
paths:
  - "modes/**/*.md"
  - "batch/batch-prompt.md"
---

# Editing mode files

- Twenty market directories (`modes/de/`, `modes/fr/`, ...) each localize `_shared.md`, `pipeline.md`, an evaluation mode and an apply mode under their own file names (Language Modes table in `AGENTS.md`); `modes/tr/` carries more. `tests/evaluation-mode-parity.test.mjs` fails when a localized evaluation mode drifts from the report structure of `modes/oferta.md`; `tests/modes-readme-catalog.test.mjs`, `tests/modes-readme-language-keys.test.mjs` and `tests/modes-readme-report-blocks.test.mjs` check `modes/README.md`. No test lists other translation drift: update the localized counterparts of a changed mode or name the i18n follow-up in the PR.
- A new mode needs a route in `.agents/skills/career-ops/SKILL.md` (then copy that file over the four `*-directory/skills/career-ops/SKILL.md`), a row in `modes/README.md`, and a row in the Skill Modes table of `AGENTS.md` whose cell equals the router input (`tests/skill-router-modes.test.mjs`, `tests/modes-readme-catalog.test.mjs`).
- `_profile.md`, `_custom.md` and `_brief.md` are user files and never exist in this checkout; only their `.template.md` is editable. `_shared.md` is shared defaults for everyone, never personalization.
- Mode text is read by the user's agent as instructions, so a sentence here changes what every install does. Keep the Data Contract, Source-of-Truth Boundary and untrusted-content rules from `AGENTS.md` intact.
