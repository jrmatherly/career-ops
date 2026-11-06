# career-ops

One-command installer for [**career-ops**](https://github.com/career-ops-hq/career-ops) — the AI-powered job search pipeline for AI coding CLIs.

```bash
npx @santifer/career-ops init
```

This sets up a ready-to-use workspace:

1. Clones career-ops at the latest stable release into the target folder, which must be empty or absent (when none can be resolved, for example because the GitHub API is unreachable or rate-limited, it clones `main` instead and says so)
2. Installs dependencies, then prints the `npx playwright install chromium` step to run for PDFs

Then open your AI coding tool in the folder. **On first launch the agent walks you through setup — your CV, profile and target roles — just by chatting.** Nothing to configure by hand. career-ops is AI-agnostic — Claude Code, Codex, Qwen Code, OpenCode, Pi, Oh My Pi, GitHub Copilot CLI, Antigravity CLI, Grok Build CLI and the legacy Gemini CLI wrapper all work.

The installer bootstraps CLI skill entrypoints after clone, so new CLIs (e.g. Grok) work even when `npx` pulled an older release tag.

## Usage

```bash
npx @santifer/career-ops init [folder]   # default folder: ./career-ops
```

Prefer the manual route? `git clone` still works exactly as before — see the [setup guide](https://github.com/career-ops-hq/career-ops/blob/main/docs/SETUP.md).

## Requirements

- Node.js 22.13+ (on 23.x, 23.4+)
- git

## License

MIT © [Santiago Fernández de Valderrama](https://santifer.io)
