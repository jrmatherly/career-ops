silent-failure-hunter, A1 round 4, head b89a011c (opus, coordinator-written from the agent's returned text). Scope: web/src and web/tests hunks of aebb7eb0 against the round-3 receipt. Ran run-route-kinds, run-prompts and claude-invocation suites in web/: 110 tests, 110 pass, 0 fail.

ROUND-3 ITEMS
(A) textSource non-JD stop: CLOSED at web/src/lib/run-prompts.mjs:323 (stop before Block A, evaluation-gate status with reason needs_confirmation, no report envelope). needs_confirmation is in EVALUATION_GATE_REASONS (evaluation-gate.mjs:7); both focused (:339) and full (:354) prompts carry it via textSource (:324-325). Pinned for both shapes at tests/lib/run-prompts.test.mjs:223; URL path pinned absent at :249. The existing gated-run test shows a gate persists nothing. Wording note: the round-3 fix named jd_unavailable, which exists only in the legacy machine line and modes/oferta.md:7; the JSON gate carries "job text is unavailable" in prose instead. Not run live against a wall-shaped jdText.
Round-2 item 2, padded cliId: CLOSED at route.ts:82 (requestedCliId !== requestedCliId.trim()), message "cliId must be a non-empty string with no padding."; pinned at run-route-kinds.test.mjs:208-209 for evaluate and pdf; URL check still first (:77-80), order pinned at :167-173. Legitimate clients cannot send a padded id (config-form.tsx:144, cli-pick.mjs:33-36).
(B) NUL from the profile: parked, not worse. (C) argv ceiling: parked, not worse (textSource grew ~280 chars). (D) ENVELOPE_MARKER_RE: unchanged.

NEW
(1) LOW, conf 35. route.ts:47 evaluate local: pattern `local:\S(?:[^\t\r\n]*\S)?` admits \v, \f, U+0085, U+00A0, U+2028, U+2029 inside the path, while the comment at :44-45 and the shape string promise "no padding, tab or line break"; U+2028/U+2029/U+0085 are line breaks. JSON.stringify does not escape U+2028. The run would most likely stop on the mode's jd_unavailable gate, so not silent, but billed for an input the route says it refuses. Fix: `/^local:\S(?:[ \S]*\S)?$/` (only U+0020 inside).
(2) INFO, conf 60. The 400 message at :48 calls a local: path a "posting URL". Accurate enough.

CHECKED CLEAN: comment-only edits at route.ts:395-399 and claude-invocation.mjs:93-98; evaluate-text pattern unchanged except its message, still refuses bare schemes (:181); uppercase scheme spawns for both kinds (:189-202); spaced local: spawns (:189); " local:x", "local:x\n", "local:x\ty", "local:" refused (:181); no new catch blocks, fallbacks or optional chaining.
NOT RUN: npm ci, full web suite, lint, live claude -p with a wall-shaped jdText or a U+2028 local: path, Go tests.
Risk: finding A is closed in prompt text only; the model's live behaviour on a wall-shaped jdText is unmeasured.
