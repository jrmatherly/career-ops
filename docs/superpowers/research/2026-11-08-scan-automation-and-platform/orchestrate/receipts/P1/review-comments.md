toolkit comment-analyzer, head 189da72e, ISSUES (wording, none blocking)
C1 doctor.mjs:210 label and SKILL.md:132 say "does not parse" but the branch (206-207) fires on an empty host: mailto:x and file:///tmp/x pass URL.canParse and land there. Say "has no host".
C2 deploy/README.md:41 "never with CLAUDE_CODE_OAUTH_TOKEN" is a bare rule nothing enforces (doctor never reads it; the Dockerfile sets none); give the reason or cut it. "The proxy pair with ANTHROPIC_AUTH_TOKEN" is stricter than the code, which treats ANTHROPIC_API_KEY the same behind a base URL.
C3 docs/RUNNING_ON_A_BUDGET.md:64 "A cloud-provider switch still wins over a gateway" reads as a claim about Claude Code; only doctor's branch order is verified here. Scope it to doctor.
C4 doctor.mjs:214-215 comment restates the pass label two lines below; cut or shrink to one line.
Note: .host keeps a port (same as audit note A).
