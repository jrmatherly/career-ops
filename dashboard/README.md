# dashboard/

Standalone Go TUI for browsing the career-ops pipeline.

## Purpose

A terminal UI over the application tracker: filter tabs, sort modes,
grouped/flat views, lazy-loaded report previews, and an inline status picker.
The report viewer opens the job posting with `o`, using the tracker row's URL
or, failing that, the report's `**URL:**` header.
It is optional, never required by any other component. It reads the tracker
directly and writes through the checkout's Node scripts: a status change runs
`set-status.mjs` and a PDF runs `generate-pdf.mjs`, so those two actions need
Node on PATH.

The list's DATE column shows a row's most recent transition in the ledger
beside the tracker, `status-log.tsv` — when its status last changed — and
falls back to the tracker's own Date cell (the evaluation date, which nothing
rewrites) for rows with no ledger history. The date sort orders by the same
value.

## Prerequisites and running

Requires Go 1.26+ (`go.mod`). From the repo root:

```bash
npm run serve:dashboard    # cd dashboard && go run .
npm run build:dashboard    # build the standalone binary
```

`build-dashboard.mjs` exists because `go build -o career-dashboard .` writes
an extension-less binary on Windows; the wrapper picks the platform-correct
output name (`career-dashboard.exe` on Windows, `career-dashboard` elsewhere).

The binary resolves the data root the way the Node scripts do:
`CAREER_OPS_ROOT`, then `CAREER_OPS_DATA_DIR`, then the `.career-ops-data`
marker in the repo root, then the repo root itself. `--path <dir>` overrides
that result. The tracker is `CAREER_OPS_TRACKER` when set, otherwise
`{path}/data/applications.md`, and `{path}/applications.md` only when the
canonical file is absent.

In the report viewer, `http(s)` links (bare URLs and markdown links) are
clickable in terminals that support OSC 8 hyperlinks (iTerm2, WezTerm, kitty,
VS Code, Windows Terminal, recent GNOME Terminal). Other terminals show the
same text, unlinked. Other link schemes stay plain, because report text comes
from untrusted job postings.

## Package layout

- `main.go` — entry point, flag parsing (`--path`, `--lang en|tr`), top-level
  Bubble Tea model and view state (pipeline / report viewer / stats / progress).
- `clipboard.go` — copies text through the platform clipboard utility (stdin
  only, never interpolated into a command).
- `open_*.go` — platform-specific "open file/URL" commands (darwin, linux,
  windows, unix, unsupported).
- `internal/data/` — parses `applications.md` (`career.go`), derives
  aggregate metrics (`derive.go`), resolves generated PDFs (`pdf.go`), reads
  `status-log.tsv` (`funnel_history.go`), canonicalizes archetypes for the
  stats screen (`stats.go`), and writes status changes through
  `set-status.mjs` (`status_writer.go`).
- `internal/i18n/` — the UI string catalog (English and Turkish).
- `internal/model/` — the application row model.
- `internal/theme/` — Catppuccin Mocha (dark) and Latte (light) themes;
  `NewTheme("auto")` picks by detected terminal background.
- `internal/ui/screens/` — the pipeline list, report viewer, stats, and
  progress screens.

## Dependencies

External: [Bubble Tea](https://github.com/charmbracelet/bubbletea) (TUI
framework), [Lipgloss](https://github.com/charmbracelet/lipgloss) (styling),
termenv (background detection). The Go module imports nothing from the Node
side. It reads the tracker files itself and shells out to the checkout's
`set-status.mjs` and `generate-pdf.mjs` for writes.

## Tests

Go tests live next to their packages (`*_test.go`). The Node suite builds
the dashboard as part of `node test-all.mjs` (skipped with `--quick`).
