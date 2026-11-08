Coordinator re-measurement of Claude Code gateway credential precedence, 12:20-12:26 EST, Claude Code 2.1.319 (the binary on PATH and the Dockerfile pin), loopback listener as ANTHROPIC_BASE_URL, every run under `env -i HOME PATH USER TERM` plus only the listed variables. Values were test strings; a header not matching a test string was recorded only as OTHER, never its value.
| Variables beside the gateway URL | What the gateway received |
| ANTHROPIC_AUTH_TOKEN | Bearer <auth token> (6 requests) |
| ANTHROPIC_API_KEY | x-api-key <api key> (7) |
| CLAUDE_CODE_OAUTH_TOKEN + ANTHROPIC_AUTH_TOKEN | Bearer <auth token> (7): the gateway token outranks the OAuth token |
| CLAUDE_CODE_OAUTH_TOKEN + ANTHROPIC_API_KEY | x-api-key <api key> (7): the API key outranks the OAuth token |
| CLAUDE_CODE_OAUTH_TOKEN alone | Bearer <oauth token> (2) plus one OTHER |
| ANTHROPIC_API_KEY + ANTHROPIC_AUTH_TOKEN | both headers (7) |
| ANTHROPIC_API_KEY of whitespace | OTHER (3): treated as unset, the keychain login is sent |
| ANTHROPIC_AUTH_TOKEN of whitespace | OTHER (3): treated as unset |
| CLAUDE_CODE_OAUTH_TOKEN of whitespace + ANTHROPIC_AUTH_TOKEN | Bearer <auth token> (7) |
| ANTHROPIC_AUTH_TOKEN of whitespace + CLAUDE_CODE_OAUTH_TOKEN | Bearer <oauth token> (2) |
| none | OTHER (3): the keychain login is sent to the gateway |
CORRECTION: the 11:19 measurement in receipts/P1-r2/coordinator-remeasure.md ("the OAuth token wins") ran inside this Claude Code session, whose shell exports ANTHROPIC_BASE_URL and about thirty CLAUDE_CODE_* host-auth variables that the child CLI inherits; the same in-session probe, repeated at 12:18 with clean tags, still showed the OAuth token, while the clean environment shows the gateway token. The in-session result is an artifact. It also named the wrong version (2.1.317 is the desktop app's bundled CLI, not the one on PATH). The round-3 fix-forward built on it and reversed a deploy/README.md claim that was correct. The 11:19 whitespace-key result ("answered on the subscription") was also in-session; the clean run agrees (blank key treated as unset).
Review findings decided by this table: review-comments 1 and review-errors 3 (the label names a variable the user may not have set) are moot, because the label's premise is false; review-errors 2 (blank OAuth or auth token) is measured: both are treated as unset, so doctor's trims are right. Still open: gateway with both API key and auth token sends both headers (pre-existing, follow-up); host spellings like a trailing dot (pre-existing, follow-up).
