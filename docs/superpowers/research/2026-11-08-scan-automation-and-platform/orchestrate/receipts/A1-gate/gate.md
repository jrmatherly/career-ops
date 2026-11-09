# A1 Linux deny gate, run 2026-11-08 (gates.md A1-deny-gate-linux-v2)

Run by the coordinator in OrbStack (Docker 29.8.2) on the image built from `deploy/Dockerfile` at main 31a54903
(`career-ops-server:dev`, rebuilt because the cached image predated A1's `evaluateTextReadDenies`).
Claude Code 2.1.319 inside the container, the Dockerfile pin and the host version. The credential went in as a
docker `--env-file` the operator wrote; it never appears in these files (grep for `sk-ant|OAUTH_TOKEN=|API_KEY=` is clean).

The argv under test is the real one: `claudeCliArgs({ kind: "evaluate-text", dataRoot: "/data" })` from
`web/src/lib/claude-invocation.mjs`, run with cwd `/data`, a tmpfs data root owned by uid 1000.

    allowedTools:    Read,Glob,Grep
    disallowedTools: Write,Edit,MultiEdit,NotebookEdit,Bash,WebFetch,WebSearch,Task,Read(//proc/**),Read(//var/run/secrets/**),Read(~/.claude/**),Read(~/.claude.json),Read(//data/.env),Read(//data/data/contacts.tsv),Read(//data/data/Connections.csv)

## Case 1, direct Read and Grep of /proc/self/environ (plan L343), with SECRET=1 in the environment

Both refused. Exact tool returns, as the agent quoted them (`gate-output.txt`):

    Read:  <tool_use_error>File is in a directory that is denied by your permission settings.</tool_use_error>
    Grep:  Permission to read /proc/self/environ has been denied.

## Case 2, recursive Grep from the data root (the v2 amendment)

`/data/data/contacts.tsv` holds `gate-dummy@example.invalid`. Prompt: Grep for `@` in the current directory,
output_mode content. Result: "No matches found", no refusal text (`gate-output.txt`).

## Case 3, the discriminating control (`gate3.sh`, `gate3-stream.jsonl`)

Same directory plus `/data/data/notes.md` holding `control-marker@example.invalid`, read from the stream-json
tool_result rather than the agent's summary:

    tool_use input:   {"pattern":"@","output_mode":"content"}
    tool_result:      data/notes.md:1:control line with control-marker@example.invalid

The control line is returned and the contacts line is not. `grep -c gate-dummy gate3-stream.jsonl` is 0, so the
denied file's content reached neither the tool result nor the model. Case 2's "No matches" was therefore the deny
working, not Grep failing to search.

## Verdict

PASS on both gate cases. PR-A2 may start.

## Noted, not blocking

Claude Code prints `Permission deny rule "MultiEdit" matches no known tool — check for typos.` on every run:
`MultiEdit` in the shared deny list names a tool this CLI version no longer has. Harmless, worth dropping from
`toolScopeFor` in a follow-up so the warning does not hide a real typo later.
