toolkit comment-analyzer, head 1e0b92ab, ISSUES (precision and narration; nothing factually wrong)
C1 publish-account-url.mjs:9 and SKILL.md:191, :265 say the key is "never read"; dotenv parses the whole .env, only PUBLISH_URL is used. Say used/returned, not read.
C2 publish-account-url.mjs:9 "null when unset or not https" omits unparsable (URL.canParse, :15).
C3 publish-account-url.mjs:22 pointer-to-a-pointer comment on the parseEnv trailing newline; state the why (Node 22.13 parseEnv keeps an inline comment on a last line with no newline).
C4 account.mjs:4 drop the "so the page matches" tail; :5 spell publish/tests/service.test.mjs from the repo root.
C5 publish/README.md:115 CSP rationale is implementation narration inside the key-flow steps; move or drop.
C6 route.ts:11, :63 the unset message names cluster guidance for publish_api_key only; on a cluster PUBLISH_URL comes from the HelmRelease env, one clause closes it.
C7 SKILL.md:191 "Since scan automation PR-K1" is history in the Ours cell; describe the current state.
Observation for the operator's review: the account page keys dark tokens off prefers-color-scheme while the dashboard's .dark is a class toggle, so a dashboard in dark mode on a light-OS machine opens a light account page; the plan's You-see line ("opens in the dashboard's colours") is where that can mismatch.
