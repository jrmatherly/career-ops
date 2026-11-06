# Supported CLIs

Career-ops is AI-agnostic and runs on several command-line agent tools. The core logic is shared via `AGENTS.md`, while CLI-specific nuances are handled through entry wrappers in the repository root.

| CLI | Entry File | How to Invoke |
| --- | --- | --- |
| Claude Code | `CLAUDE.md` | Interactive: `claude` (then `/career-ops`). Headless/Batch: `claude -p "prompt"`. From any folder: install the plugin ([CLAUDE_PLUGIN.md](CLAUDE_PLUGIN.md)) |
| Cursor | `AGENTS.md` | Interactive: open the project in Cursor and ask for `career-ops` (auto-discovered from `.agents/skills/career-ops/SKILL.md`) |
| Codex | `CODEX.md` (see [`docs/CODEX.md`](CODEX.md)) | Interactive: `codex` (then use plain text). Headless/Batch: `codex exec "prompt"` |
| OpenCode | `OPENCODE.md` | Interactive: `opencode` (then `/career-ops`). Headless/Batch: `opencode run "prompt"` |
| Pi | `AGENTS.md` | Interactive: `pi` (then `/skill:career-ops`). Headless/Batch: `pi -a -p "prompt"` |
| Antigravity CLI | `AGENTS.md` | Interactive: `agy` (then `/career-ops`). Headless/Batch: `agy -p "prompt"` |
| Grok Build CLI | `AGENTS.md` | Interactive: `grok` (then `/career-ops`). Headless/Batch: `grok -p "prompt"`. A blanket auto-approve flag grants every tool, so a headless worker needs its own permission handling (see "Headless worker permissions" in `AGENTS.md`) |
| Qwen | `AGENTS.md` | Interactive: `qwen` (the career-ops skill is discovered from `.qwen/skills/career-ops/`). Headless/Batch: `qwen -p "prompt"` |
| Kimi | `KIMI.md` | Interactive: `kimi` (the career-ops skill is discovered from `.kimi/skills/career-ops/`) |
| GitHub Copilot CLI | `AGENTS.md` | Headless/Batch: `copilot -p "prompt"` |
| Gemini | `GEMINI.md` | Legacy wrapper redirecting to `AGENTS.md` (transitioned to Antigravity CLI). |
| Hermes Agent | `AGENTS.md` | Interactive: `hermes` (then ask for a career-ops task). Web read-only workers: `hermes chat -q "prompt" --oneshot -Q --no-restore-cwd`. Batch ranking: unsupported. |
| Oh My Pi | `.omp/AGENTS.md` | Interactive: `omp` (then `/skill:career-ops`). Headless/Batch: `omp -p "prompt"` |

Record the CLI you use with `node remember-cli.mjs <cli>`, so `doctor.mjs`, `rank-pipeline.mjs` and the web UI use it. Accepted ids: `claude`, `codex`, `opencode`, `pi`, `antigravity` (not `agy`), `grok`, `qwen`, `kimi`, `copilot`, `gemini`, `hermes`, `omp`.

## Hermes Agent

Hermes runs the same pipeline as every other CLI here. Trust the checkout once with `hermes skills trust` before interactive use. The web UI uses Hermes's one-shot mode (`hermes chat -q ... --oneshot -Q --no-restore-cwd`) only for workers that do not write. Evaluate, research, PDF and cover workers accept it. Write-capable workers (today `fix-portal`) refuse it because no verified Hermes permission adapter exists. Batch ranking does not support Hermes. Hermes project-context scanning still applies; see [`docs/HERMES.md`](HERMES.md) for its rules and limitations.

## Pi

Pi needs no wrapper file: it reads `AGENTS.md` from the working directory as project context, and it discovers the shared skill at `.agents/skills/career-ops/SKILL.md` on its own. In interactive mode the router is available as `/skill:career-ops`; `--skill <path>` loads it explicitly, and `-p` runs one headless prompt. If a Pi build gates project resources behind a trust decision, interactive usage can use `/trust` and restart `pi`, while a headless invocation that needs to trust project resources should use the `-a` option.

```bash
cd career-ops
pi                                          # interactive
pi -a -p "Evaluate this JD with career-ops auto-pipeline: https://company.com/jobs/123"
```

If a Pi build gates project resources behind a trust decision, run `/trust` once inside the repo and restart `pi` so the project skill loads (`/trust` applies to future Pi processes), or start with `-a`, which trusts a single run and needs no restart.

## Oh My Pi (omp)

Oh My Pi discovers `.agents/skills/career-ops/SKILL.md` automatically via its `agents` discovery provider, exposing `/skill:career-ops`. `.omp/AGENTS.md` imports `AGENTS.md` (`@../AGENTS.md`), ensuring OMP's `native` project-context provider (priority 100) wins over `.github/copilot-instructions.md` (priority 30) so the career-ops contract is loaded and respected.

```bash
cd career-ops
omp                                          # interactive
omp -p "Evaluate this JD with career-ops auto-pipeline: https://company.com/jobs/123"
```
