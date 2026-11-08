toolkit silent-failure-hunter, head 5ecd6dc8
Fail-fast at attempt 1 for an unreadable portals.yml judged correct, not a regression (deterministic config error; trunk's three zero-delay retries recorded a misleading attempt: 3). Resolves audit-b I3 as docs-only.
E1 HIGH custom-mode guard message names title_filter.positive when the full engine read title_filter_full.positive (runner:186; probe: title_filter positive [engineer] plus title_filter_full {negative:[intern]} refuses and points at the wrong key). Same as audit-b I4 and code-review R2. The fifth test asserts only spawned === false, not the message.
E2 MEDIUM FILE_FILTERS_NEED_TITLES (runner:150) does not name which key was read.
E3 MEDIUM YAML parse errors in file mode reach the card without the file name (runner:171-175; probe: "deficient indentation (3:3)", "expected a document, but the input is empty").
E4 MEDIUM inherited file lists pass through cleanChips, which drops non-string scalars, punctuation-only entries, dedupes and caps at 512 (runner:180-184; probe: positive [2024, engineer] becomes [engineer] with no warning); trunk did this for title_filter.positive only. Same as audit-a note and comment-review nit. Fix: copy the file's array unchanged when the job list is empty, or warn on stderr when shortened.
E5 LOW no save-time check that the file has title keywords (advisory).
E6 LOW isSafeScheduledId no longer runs in file mode; no write uses the id there, main() validates --job ids. No impact.
