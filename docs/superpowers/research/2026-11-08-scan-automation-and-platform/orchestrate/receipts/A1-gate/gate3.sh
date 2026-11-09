#!/usr/bin/env bash
set -u
cd /app
ARGS=$(node --input-type=module -e '
import { claudeCliArgs, argValue } from "./web/src/lib/claude-invocation.mjs";
const a = claudeCliArgs({ kind: "evaluate-text", prompt: "x", dataRoot: "/data" });
console.log(JSON.stringify({ allowed: argValue(a, "--allowedTools"), disallowed: argValue(a, "--disallowedTools") }));
')
ALLOWED=$(node -e 'console.log(JSON.parse(process.argv[1]).allowed)' "$ARGS")
DISALLOWED=$(node -e 'console.log(JSON.parse(process.argv[1]).disallowed)' "$ARGS")
mkdir -p /data/data
printf 'name\temail\nGate Dummy\tgate-dummy@example.invalid\n' > /data/data/contacts.tsv
printf 'control line with control-marker@example.invalid\n' > /data/data/notes.md
cd /data
timeout 300 claude -p "Use the Grep tool to search for @ in the current directory with output_mode content. Then stop." \
  --output-format stream-json --verbose --permission-mode acceptEdits --strict-mcp-config \
  --allowedTools "$ALLOWED" --disallowedTools "$DISALLOWED" 2>/dev/null
