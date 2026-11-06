# Fork hardening implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every finding in the 2026-11-05 fork audit so the fork's guards, sync tooling and CI do what their docs say, in three independently landable bundles.

**Architecture:** Bundle A fixes the two safety gaps and the three rules that mislead an agent. Bundle B makes the upstream-sync driver trustworthy and adds a test that keeps the deviations table honest. Bundle C is hygiene. Every task edits fork-owned files or adds a deviation row; no upstream product code changes. Commits go straight to `main` (this fork has no PR flow), one commit per task. Each bundle is pushed once its local batch passes, and is done when the Tests and CodeQL runs on the pushed SHA are green.

**Tech Stack:** Node 22+ `.mjs` scripts and `node:test`-free suite files under `tests/` (the `pass`/`fail` helpers from `tests/helpers.mjs`), bash for `upstream-review.sh`, GitHub Actions YAML, `gh` CLI for repo settings.

**Spec:** `docs/superpowers/specs/2026-11-05-fork-hardening-audit.md` (finding numbers below refer to its table).

## Global Constraints

- Never run `node update-system.mjs apply` in this checkout (`.claude/skills/upstream-review/SKILL.md:22`).
- A new test is its own file under `tests/*.test.mjs`, never a numbered section in `test-all.mjs`, never `process.exit()` or `finish()` from a discovered suite, entry-point checks use `isMainModule(import.meta.url)` from `lib/is-main-module.mjs` (`.claude/rules/dev-workflow.md:5`).
- Every tracked file must be claimed by SYSTEM_PATHS, USER_PATHS or `config/local-paths.txt` (`node validate-system-paths-coverage.mjs`). `localUserPaths()` rejects a path under any SYSTEM_PATHS entry (`lib/update-manifest.mjs:305,445,461` list `tests/`, `.claude/skills/`, `docs/`), so a fork file inside one of those is covered by the system entry and must instead get a row in the deviations table. Such a file survives `apply` because the stale-file prune deletes only a path upstream once shipped (`wasEverShippedUpstream`, `update-system.mjs` ~2110-2140), not because the updater never prunes.
- The pre-commit hook's top-level code runs on import (`.githooks/pre-commit.mjs:20-28`, ending in `process.exit`). A test never imports it; it copies the file into the fixture repo and spawns it, as `tests/claude-hooks.test.mjs:66-73` already does.
- Every deviation from upstream gets a row in the "Deviations decided" table or a line under "Deleted or moved paths" in `.claude/skills/upstream-review/SKILL.md`.
- Commits are Conventional Commits with a scope and end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Before each push: `npm run lint`, `node validate-system-paths-coverage.mjs`, `node test-all.mjs --quick`. Workflow edits also pass `actionlint`.
- Tests alone are not sufficient verification. A task is verified only when its unit box and its live box are both checked. Live means the real surface: a scratch git repo for hooks, `gh api` for repo settings, a green workflow run for CI changes.

## Review Focus

1. A conflicted upstream merge whose resolution touches `examples/dual-track-engineer-instructor/cv.md` must commit (Task A2 test case 3).
2. `git rm --cached` of a leaked user-layer file must commit so a leak can be undone (Task A2 test case 2).
3. A machine with a global `core.hooksPath` must end up guarded and told so, not left silently unguarded (Task A4 test case 2); a clone whose local scope deliberately points elsewhere gets a warning and is left alone (case 3).
4. The first push to a new branch has `before` = all zeros; the push-trigger guard must not crash on it (Task A5 step 2 handles it in code; no local test exists for an inline `github-script`, so the live check in A5 step 4 is the evidence).
5. `upstream-review.sh --advance` with a SHA older than the current watermark must refuse (Task B2 test case 1).

---

## Bundle A: safety

### Task A1: Protect `main` against force-push and deletion (finding 1)

**Files:**
- Modify: nothing in the repo. GitHub repo setting via `gh api`.
- Modify: `.claude/skills/upstream-review/SKILL.md` "Deviations decided" (one row: repo ruleset, so the next reader knows direct pushes still work).

**Interfaces:**
- Produces: a branch ruleset named `protect-main` with rules `deletion` and `non_fast_forward` only.

- [ ] **Step 1: Confirm the current state**

Run: `gh api repos/jrmatherly/career-ops/rulesets --jq length`
Expected: `0`

- [ ] **Step 2: Create the ruleset**

```bash
gh api -X POST repos/jrmatherly/career-ops/rulesets --input - <<'JSON'
{"name":"protect-main","target":"branch","enforcement":"active",
 "conditions":{"ref_name":{"include":["refs/heads/main"],"exclude":[]}},
 "rules":[{"type":"deletion"},{"type":"non_fast_forward"}]}
JSON
```

- [ ] **Step 3: Verify, live**

Run: `gh api repos/jrmatherly/career-ops/rules/branches/main --jq '[.[].type] | sort'`
Expected: `["deletion","non_fast_forward"]`
Run: `git push origin main` after an ordinary commit later in this bundle.
Expected: accepted (the ruleset adds no PR or review requirement).

- [ ] **Step 4: Record and commit**

Add the row to the deviations table: `| no rulesets | branch ruleset \`protect-main\` blocks deletion and force-push on \`main\`, nothing else | landed <date> | Repo setting, not a file; \`gh api repos/jrmatherly/career-ops/rulesets\`. |`

```bash
git add .claude/skills/upstream-review/SKILL.md
git commit -m "docs(fork): record the protect-main ruleset"
```

### Task A2: Grade only new additions in the pre-commit guard (finding 2, 19)

**Files:**
- Modify: `.githooks/pre-commit.mjs:11` (`ignoredStagedFiles`)
- Test: `tests/claude-hooks.test.mjs`

**Interfaces:**
- Consumes: `ignoredStagedFiles(root: string): string[]` (exported, unchanged signature; nothing imports it, see Global Constraints).
- Produces: the same function, now listing only paths whose staged status is Added (`--diff-filter=A --no-renames`). `--no-renames` matters: `git diff` detects renames by default, so without it `git mv README.md cv.md` is an `R`, not an `A`, and a user-layer name would enter through a rename.

- [ ] **Step 1: Write the failing tests**

Extend the existing fixture block in `tests/claude-hooks.test.mjs` (lines 54-80: `repo`, the `git(...args)` helper with a fixed `cwd`, the copied `hook`, and `.gitignore` already holding `cv.md`). The fixture has no commit yet, so case 2 makes the first one. Each case spawns `hook` the way line 73 does and reads `r.status` / `r.stderr`:

```js
// case 1 (existing, lines 69-75): a force-staged new cv.md is refused and named.
// case 2: git rm --cached of a committed, ignored file passes
git('commit', '-qm', 'leak');                       // README.md + the leaked cv.md
git('rm', '--cached', '-q', '--', 'cv.md');
r = spawnSync(NODE, [hook], { cwd: repo, encoding: 'utf-8' });
if (r.status === 0) pass('pre-commit lets a staged deletion of a leaked file through');
else fail(`pre-commit expected exit 0 on a staged deletion, got ${r.status}: ${r.stderr}`);
// case 3: an edit to a tracked file that .gitignore matches passes (upstream's examples/.../cv.md)
git('reset', '-q', '--hard'); writeFileSync(join(repo, 'cv.md'), 'edited\n'); git('add', 'cv.md');
r = spawnSync(NODE, [hook], { cwd: repo, encoding: 'utf-8' });
if (r.status === 0) pass('pre-commit lets an edit to a tracked-but-ignored file through');
else fail(`pre-commit expected exit 0 on a tracked-file edit, got ${r.status}: ${r.stderr}`);
// case 4: renaming a tracked file onto a user-layer name is still refused
git('reset', '-q', '--hard'); git('rm', '--cached', '-q', '--', 'cv.md'); git('commit', '-qm', 'clean');
git('mv', 'README.md', 'cv.md');
r = spawnSync(NODE, [hook], { cwd: repo, encoding: 'utf-8' });
if (r.status === 1 && r.stderr.includes('cv.md')) pass('pre-commit refuses a rename onto a gitignored name');
else fail(`pre-commit expected exit 1 naming cv.md on a rename, got ${r.status}: ${r.stderr}`);
```

Update the file's header comment (lines 1-5) to name the new cases.

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/claude-hooks.test.mjs`
Expected: cases 2 and 3 print `❌`; case 4 passes already (today every staged path is graded) and guards the `--no-renames` flag from here on.

- [ ] **Step 3: Implement**

In `ignoredStagedFiles`, change the staged listing to `['diff', '--cached', '--name-only', '--diff-filter=A', '--no-renames', '-z']`. Update the comment on line 2 of `.githooks/pre-commit.mjs` and `.claude/rules/dev-workflow.md:10` to say "refuses a newly added gitignored file; edits and deletions of tracked files pass".

- [ ] **Step 4: Run to verify it passes**

Run: `node tests/claude-hooks.test.mjs`
Expected: all cases `✅`, exit 0.

- [ ] **Step 5: Verify, live**

In a scratch clone of this repo with `core.hooksPath=.githooks`: `echo x >> examples/dual-track-engineer-instructor/cv.md && git add -A && git commit -m t` commits; `git add -f cv.md` of a new root `cv.md` is refused. Record both outputs in the commit message body.

- [ ] **Step 6: Commit**

```bash
git add .githooks/pre-commit.mjs tests/claude-hooks.test.mjs .claude/rules/dev-workflow.md
git commit -m "fix(hooks): grade only newly added files in the pre-commit user-layer guard"
```

### Task A3: Make the rules file say what is true (findings 3, 8, and the worktree-wide syntax check)

**Files:**
- Modify: `.claude/rules/dev-workflow.md:6,10` and append one bullet.

**Interfaces:** none (prose).

- [ ] **Step 1: Edit line 6**

Replace the second sentence with: "A fork-local file at the repo root or in a directory upstream does not ship goes in `config/local-paths.txt`; a fork file inside a shipped directory (`tests/`, `docs/`, `.claude/skills/`) is covered by that directory's SYSTEM_PATHS entry, survives `apply` because the stale-file prune deletes only paths upstream once shipped, and gets a row in the deviations table instead."

- [ ] **Step 2: Append the updater bullet**

"- Never run `node update-system.mjs apply`, `npm run update` or `./cops update` here: they overwrite system-layer files from the release tarball. The SessionStart hook already ran `check`; on `update-available`, run `/upstream-review`. AGENTS.md's instruction to offer `apply` is the product's prompt to its users, not to you."

- [ ] **Step 3: Edit line 10**

Append: "The syntax check walks the working tree, not the index, so an unstaged broken `.mjs` blocks any commit."

- [ ] **Step 4: Verify**

Run: `grep -c 'update-system.mjs apply' .claude/rules/dev-workflow.md`
Expected: `1`

- [ ] **Step 5: Commit**

```bash
git add .claude/rules/dev-workflow.md
git commit -m "docs(fork): ban the updater in dev-workflow.md and correct the local-paths rule"
```

### Task A4: Set `core.hooksPath` in the local scope, say when it shadows a global one, warn on a foreign local value (finding 9, 19)

**Files:**
- Modify: `.claude/hooks/session-start.mjs:13-19`
- Test: `tests/claude-hooks.test.mjs`

**Interfaces:**
- Produces, from the LOCAL scope only (`git config --local --get core.hooksPath`):
  - unset → set it to `.githooks` and print `Set git core.hooksPath to .githooks for this clone: ...`; when `git config --show-scope --get core.hooksPath` had reported a value from another scope before the set, append ` (this clone now uses .githooks instead of the <scope> core.hooksPath "<value>")`.
  - `.githooks` → print nothing.
  - anything else → leave it and print `WARNING: git core.hooksPath is "<value>" in this clone's local config, so the fork's pre-commit guard in .githooks is not active here.`

  The old design (set when unset, then warn whenever the effective value is not `.githooks`) cannot warn on a global value: after the set, the effective value IS `.githooks`. The local scope wins in git, so setting it is what makes the clone guarded; the message is how the developer learns their global hooks are shadowed in this repo.

- [ ] **Step 1: Write the failing tests**

Reuse the fixture `repo` and `git` helper. `SESSION_START` is `join(ROOT, '.claude', 'hooks', 'session-start.mjs')`. Every spawn gets `env: { ...process.env, HOME: work, GIT_CONFIG_NOSYSTEM: '1', CLAUDE_PROJECT_DIR: repo, ...extra }` so the hook never reads the developer's own config (the hook also runs `update-system.mjs check` from `CLAUDE_PROJECT_DIR`; the file is absent in the fixture, so that step fails and stays silent, as its `catch` intends).

```js
// case 1: no hooksPath anywhere: the hook sets the local one
let r1 = spawnSync(NODE, [SESSION_START], { cwd: repo, encoding: 'utf-8', env });
ok(/Set git core.hooksPath/.test(r1.stdout) && git('config', '--local', '--get', 'core.hooksPath').stdout.trim() === '.githooks', 'session-start sets the local hooksPath');
// case 2: a global hooksPath exists and local is unset: set local anyway and say what it shadows
writeFileSync(join(work, 'gitconfig'), '[core]\n\thooksPath = /tmp/husky\n');
git('config', '--local', '--unset', 'core.hooksPath');
const r2 = spawnSync(NODE, [SESSION_START], { cwd: repo, encoding: 'utf-8', env: { ...env, GIT_CONFIG_GLOBAL: join(work, 'gitconfig') } });
ok(/Set git core.hooksPath/.test(r2.stdout) && /instead of the global core.hooksPath "\/tmp\/husky"/.test(r2.stdout) && git('config', '--local', '--get', 'core.hooksPath').stdout.trim() === '.githooks', 'session-start overrides a global hooksPath locally and says so');
// case 3: a foreign LOCAL value is left alone with a warning
git('config', '--local', 'core.hooksPath', '.husky');
const r3 = spawnSync(NODE, [SESSION_START], { cwd: repo, encoding: 'utf-8', env });
ok(/WARNING: git core.hooksPath is "\.husky"/.test(r3.stdout) && git('config', '--local', '--get', 'core.hooksPath').stdout.trim() === '.husky', 'session-start warns on a foreign local hooksPath and does not change it');
```

`ok` is `(cond, msg) => cond ? pass(msg) : fail(msg)`; add it to the file. `GIT_CONFIG_GLOBAL` needs git 2.32+ (local git is 2.56; the runners' git is newer).

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/claude-hooks.test.mjs`
Expected: case 2 `❌` (today the global value satisfies the `--get` and nothing is set), case 3 `❌` (no warning printed).

- [ ] **Step 3: Implement**

Replace lines 13-19. Read `git config --show-scope --get core.hooksPath` once (output `<scope>\t<value>`, empty with exit 1 when unset anywhere) and `git config --local --get core.hooksPath`. Branch on the local value as the interface says; the shadow clause uses the scope and value from the first command. Keep the surrounding `try` so the hook still exits 0.

- [ ] **Step 4: Run to verify it passes**

Run: `node tests/claude-hooks.test.mjs`
Expected: all `✅`.

- [ ] **Step 5: Verify, live**

Run: `node .claude/hooks/session-start.mjs` in this checkout.
Expected: no output (local value already `.githooks`, no update available).

- [ ] **Step 6: Commit**

```bash
git add .claude/hooks/session-start.mjs tests/claude-hooks.test.mjs
git commit -m "fix(hooks): set core.hooksPath locally even under a global one, warn on a foreign local value"
```

### Task A5: Run the user-layer guard on pushes to `main` (finding 7)

**Files:**
- Modify: `.github/workflows/no-user-data.yml:14-16` (triggers) and `:36-40` (file listing)
- Test: `tests/no-user-data-batch-guard.test.mjs` (it parses this workflow; run it, extend only if it reads the trigger block)
- Modify: `.claude/skills/upstream-review/SKILL.md` deviations row 117 (add "runs on push to main")

**Interfaces:**
- Produces: on `push` to `main`, the same `USER_PATHS` check over the files in `compareCommits(before, after)`; on `pull_request`, unchanged behaviour.

- [ ] **Step 1: Add the trigger**

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
  push:
    branches: [main]
```

- [ ] **Step 2: Branch the file listing**

Replace lines 36-40 with: when `context.eventName === 'push'`, set `before = context.payload.before`, and if it is forty zeros use `${context.sha}~1` instead; then `files = (await github.rest.repos.compareCommits({ owner, repo, base: before, head: context.sha })).data.files ?? []`. Otherwise keep the `pulls.listFiles` paginate call. The rest of the script reads `files[].filename` and `files[].status` as before (`compareCommits` returns the same `filename`/`status` shape). This edit sits above `const USER_PATHS = [`, so the slice `tests/no-user-data-batch-guard.test.mjs:52-56` evaluates is untouched. Update the header comment (lines 3 and 11-12) to mention pushes to `main`.

- [ ] **Step 3: Verify, unit**

Run: `actionlint .github/workflows/no-user-data.yml && node tests/no-user-data-batch-guard.test.mjs`
Expected: actionlint silent; test all `✅`.

- [ ] **Step 4: Verify, live**

Push the commit. Run: `gh run list --workflow=no-user-data.yml --branch main --limit 1 --json conclusion,databaseId --jq '.[0]'`
Expected: `success`. Then `gh run view <databaseId> --log | grep -c 'OK — no user-layer'` prints `1`: the push path listed the commit's files and blocked none. The trigger is `main`-only, so a throwaway branch cannot exercise it; the positive path (a blocked file) is covered by the local hook and by `tests/user-layer-untracked.test.mjs`, not by this run.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/no-user-data.yml .claude/skills/upstream-review/SKILL.md
git commit -m "ci(no-user-data): guard pushes to main, not only pull requests"
```

### Bundle A close

- [ ] `npm run lint && node validate-system-paths-coverage.mjs && node test-all.mjs --quick` all pass.
- [ ] `git push origin main`; Tests and CodeQL runs on the pushed SHA are green (`gh run list --branch main --limit 4`).

---

## Bundle B: upstream-sync machinery

### Task B1: Make `--github` report on `main` (finding 4)

**Files:**
- Modify: `.claude/skills/upstream-review/scripts/upstream-review.sh:119-120`

**Interfaces:**
- Produces: on `main`, one compare line for `main`; on another branch, two lines (`main`, then the branch).

- [ ] **Step 1: Implement**

Replace the two lines with:

```bash
  refs=main; [ "$branch" = main ] || refs="main $branch"
  for ref in $refs; do
```

- [ ] **Step 2: Verify, live**

Run: `.claude/skills/upstream-review/scripts/upstream-review.sh --github` on `main`.
Expected: exactly one line beginning `career-ops-hq/career-ops:main...main` ending in `behind_by=0`.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/upstream-review/scripts/upstream-review.sh
git commit -m "fix(upstream-review): print the main compare line when run from main"
```

### Task B2: Make `--advance` and the watermark write safe, and the header true (finding 5)

**Files:**
- Modify: `.claude/skills/upstream-review/scripts/upstream-review.sh:36,143-149,154-165`
- Create: `tests/upstream-review-script.test.mjs`
- Modify: `.claude/skills/upstream-review/SKILL.md` deviations row 111 (name the new test)

**Interfaces:**
- Consumes: `REMOTE=careerops`, `STATE=.upstream-review/watermark.json`, `WATERMARK` as the script already defines them.
- Produces: `--advance <sha>` exits 1 with `watermark would move backward` when `<sha>` is an ancestor of the current watermark; exits 1 with `no decision log mentions <short-sha>` when no file under `.upstream-review/reviews/` contains the short SHA; writes the watermark with `mv` from a temp file in the same directory. `--dry-run-merge` exits 2 with `merge-tree failed` on any `merge-tree` exit status above 1, and keeps exit 1 with the file list on a conflict.

- [ ] **Step 1: Write the failing test**

`tests/upstream-review-script.test.mjs` builds one scratch repo as the fork clone: a `README.md` committed three times as upstream commits A, B, C on a throwaway branch, then `main` reset to B with its own fork commit on top, and a `.upstream-review/watermark.json` whose `lastReviewedSha` is B and whose `upstreamUrl` is `https://github.com/career-ops-hq/career-ops.git`.

The script cannot be pointed at a local bare repo: `ensure_upstream` dies when the remote's URL differs from the watermark's (`upstream-review.sh:68`), and the watermark URL must be an https github.com URL (`:57`). Instead the fixture gives the remote the real URL, pre-seeds the tip the fetch would have produced with `git update-ref refs/remotes/careerops/main C`, and makes the fetch fail fast offline with `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.proxy GIT_CONFIG_VALUE_0=http://127.0.0.1:9` in the script's env; `ensure_upstream` then takes its "fetch failed; using cached" branch (`:75-77`). Every spawn also gets `HOME=<work>` and `GIT_CONFIG_NOSYSTEM=1`. `run(...args)` spawns `bash <ROOT>/.claude/skills/upstream-review/scripts/upstream-review.sh` with `cwd` set to the fixture, since the script finds its state from `git rev-parse --show-toplevel`.

```js
// 1: advancing to A (ancestor of B) refuses
ok(run('--advance', A).status === 1 && /move backward/.test(r.stderr), 'advance refuses an older sha');
// 2: advancing to C without a review log refuses and leaves watermark.json unchanged
ok(run('--advance', C).status === 1 && readWatermark() === B, 'advance refuses without a decision log');
// 3: with reviews/x.md mentioning C's short sha, advance succeeds and no temp file remains
ok(run('--advance', C).status === 0 && readWatermark() === C && readdirSync('.upstream-review').sort().join() === 'reviews,watermark.json', 'advance writes atomically');
// 4: --dry-run-merge on a conflicting README.md exits 1 and names the file
ok(run('--dry-run-merge').status === 1 && /README\.md/.test(r.stdout), 'dry-run-merge reports the conflicting file');
```

Case 4 covers the exit-status handling; the `merge-tree failed` branch (exit above 1) needs a corrupt ref and stays untested. The suite declares nothing in `toolRequired`; it needs only `git`, `bash` and `jq` (skip with a `pass('jq missing, skipped')` when `command -v jq` fails).

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/upstream-review-script.test.mjs`
Expected: cases 1 and 2 `❌`; cases 3 and 4 pass already and pin today's behaviour.

- [ ] **Step 3: Implement**

In `--advance`: after the existing ancestor check add `g merge-base --is-ancestor "$WATERMARK" "$NEWSHA" || die "watermark would move backward: $NEWSHORT is an ancestor of $(g rev-parse --short "$WATERMARK")"` and `grep -rlq -- "$NEWSHORT" "$(dirname "$STATE")/reviews" 2>/dev/null || die "no decision log mentions $NEWSHORT; write .upstream-review/reviews/<date>-review.md first"`. Replace the temp write with `tmp="$(mktemp "$(dirname "$STATE")/.watermark.XXXXXX")"; trap 'rm -f "$tmp"' EXIT; jq ... > "$tmp" && mv "$tmp" "$STATE"`. In `--dry-run-merge`, capture `rc=$?` on the failing branch and `[ "$rc" -eq 1 ] || die "merge-tree failed (exit $rc)"` before printing conflicts. Change the header line 36 to "Every subcommand fetches $REMOTE/main (and adds the remote when missing); only --advance writes a file, the watermark."

- [ ] **Step 4: Run to verify it passes**

Run: `node tests/upstream-review-script.test.mjs`
Expected: all `✅`.

- [ ] **Step 5: Verify, live**

Run: `.claude/skills/upstream-review/scripts/upstream-review.sh --advance cd379373` in this checkout.
Expected: exit 0 and the watermark unchanged (same SHA), proving the ancestor check accepts an equal SHA and the log check finds `cd379373` in `.upstream-review/reviews/2026-11-05-review.md` (it appears there 5 times today). `lastAdvancedAt` changes; `git checkout .upstream-review/watermark.json` afterwards.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/upstream-review/scripts/upstream-review.sh tests/upstream-review-script.test.mjs .claude/skills/upstream-review/SKILL.md
git commit -m "fix(upstream-review): refuse backward or unlogged advances, write the watermark atomically"
```

### Task B3: Keep the deviations table honest with a test (finding 6, 21)

**Files:**
- Create: `tests/fork-deviations-covered.test.mjs`
- Modify: `.claude/skills/upstream-review/SKILL.md` rows 111, 117, 123, lines 22, 66, 89
- Modify: `.upstream-review/watermark.json` `note`

**Interfaces:**
- Produces: a suite that reads `lastReviewedSha` from `.upstream-review/watermark.json`, skips with `pass('upstream base <sha> not in history (shallow clone), skipped')` when `git cat-file -e <sha>` fails, computes `base = git merge-base HEAD <sha>`, and otherwise asserts every `M` and `D` path in `git diff --name-status --no-renames <base> HEAD` appears as a backticked token in `SKILL.md`, and every `A` path is under a `config/local-paths.txt` prefix or appears in `SKILL.md`. The merge-base, not the SHA itself: after a cherry-pick-only sync `lastReviewedSha` is not an ancestor of HEAD (watermark note), and a diff against it would list upstream-only changes as our deviations.

- [ ] **Step 1: Write the test**

Match a path as covered when the text from `## Deleted or moved paths` to `## Decision log template` in SKILL.md contains `` `<path>` ``, `` `<basename>` `` or a backticked parent directory with its trailing slash (`.claude/hooks/`, `.githooks/`). Print one `fail` per uncovered path naming it.

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/fork-deviations-covered.test.mjs`
Expected: exactly three `❌`, measured on 2026-11-05 against the 61-path diff with this matcher: `DOCKER.md`, `docker-compose.yml` (row 123 quotes its `image:` line but never the filename) and `tests/claude-hooks.test.mjs`. Everything else is already named, including each deleted workflow and `web/tests/lib/cv-upload.test.mjs` (row 120).

- [ ] **Step 3: Fix the table, the stale lines, and the CI checkout depth**

In `.github/workflows/test.yml`, add `fetch-depth: 0` under the `test` job's checkout `with:` (line 52 area) so `lastReviewedSha` is in history on CI; note it in row 117. Row 117: add "Six workflows carry a `concurrency:` cancel-in-progress block and emoji workflow, job and step names (except the Node-floor step); a job rename changes check names." Row 123: add `DOCKER.md` and `docker-compose.yml`. Row 111: add `tests/claude-hooks.test.mjs`, `tests/upstream-review-script.test.mjs`, `tests/fork-deviations-covered.test.mjs`. Line 89: delete the clause from "`release.yml` has no repository guard" to the end of the sentence. Line 22: replace "it overwrites system-layer files wholesale" with "without `--force` it keeps every locally modified system file and writes a `.bak` beside it, so deviations freeze instead of receiving upstream changes; `--force` overwrites them (still after the `.bak`)" (`update-system.mjs:4889-4893`). Line 66: change the fetch to `git fetch careerops '+refs/tags/career-ops-v*:refs/tags/career-ops-v*' '+refs/tags/web-v*:refs/tags/web-v*'` and the push to `git push origin 'refs/tags/career-ops-v*' 'refs/tags/web-v*'`. Those two families are what `upgrade-tests.mjs` and the release channel read; the local tag list also holds 5 bare `v*` and one `manifesto-v*` tag from the first wholesale fetch, which stay as they are and are no longer re-pushed. Watermark note: "forkPointSha is the upstream commit the fork was created from and never moves; the merge-base moves with every merge and is computed by the script."

- [ ] **Step 4: Run to verify it passes**

Run: `node tests/fork-deviations-covered.test.mjs && node validate-system-paths-coverage.mjs`
Expected: all `✅`; coverage OK.

- [ ] **Step 5: Verify, live**

Run: `node test-all.mjs --quick --only fork-deviations-covered`
Expected: the suite is discovered and passes.

- [ ] **Step 6: Commit**

```bash
git add tests/fork-deviations-covered.test.mjs .claude/skills/upstream-review/SKILL.md .upstream-review/watermark.json
git commit -m "test(fork): fail when the deviations table misses an upstream diff path"
```

### Bundle B close

- [ ] Same batch as Bundle A close, then push and confirm green.

---

## Bundle C: hygiene

### Task C1: Test the Go floor CI installs (finding 10)

**Files:**
- Modify: `.github/workflows/test.yml:74`, `.github/workflows/copilot-setup-steps.yml:35`

- [ ] **Step 1: Replace `go-version: '1.27'` with `go-version-file: dashboard/go.mod` in both places.** Leave `test.yml:195` (upgrade gate) as is; its comment says old updaters rebuild the dashboard and it needs a current toolchain.
- [ ] **Step 2: Verify, unit.** Run: `actionlint .github/workflows/test.yml .github/workflows/copilot-setup-steps.yml && node tests/go-floor.test.mjs`. Expected: silent, all `✅`. `go-floor.test.mjs:76` scans only `go-version:` lines, so these two pins drop out of its check; the floor is then enforced by setup-go reading `go.mod` directly, which its own failure text (`:82`) already recommends.
- [ ] **Step 3: Verify, live.** After push, the `test (ubuntu-latest)` job log shows `go version go1.26`.
- [ ] **Step 4: Commit.** `git commit -m "ci(test): install the Go floor from go.mod"`

### Task C2: Tell visitors this is a fork (findings 11, 15)

**Files:**
- Create: `FORK.md`
- Modify: `config/local-paths.txt` (add `FORK.md`), `.gitignore` fork tail (add `.claude/skill-stack.json`, `.claude/rules/skill-stack.md`), SKILL.md deviations table (row for `FORK.md` and for `docs/superpowers/`)

- [ ] **Step 1: Write `FORK.md`** with four sections: what this fork is (personal fork of career-ops-hq/career-ops, link), what differs (link to the deviations table in `.claude/skills/upstream-review/SKILL.md`), how it syncs (`/upstream-review`), and where to contribute (upstream; issues and PRs are off here). Under 40 lines.
- [ ] **Step 2: Claim and ignore.** Append `FORK.md` to `config/local-paths.txt`; append the two skill-stack paths after `.remember/` in `.gitignore`.
- [ ] **Step 3: Verify, unit.** Run: `node validate-system-paths-coverage.mjs && git check-ignore -v .claude/skill-stack.json | grep -q '^.gitignore' && node tests/fork-deviations-covered.test.mjs`. Expected: OK, a `.gitignore:` line, all `✅`.
- [ ] **Step 4: Commit.** `git commit -m "docs(fork): add FORK.md and ignore the generated skill-stack files"`

### Task C3: CI and image hardening (findings 12, 13, 14, 16, 20)

**Files:**
- Modify: `.github/workflows/codeql.yml:27`, `.github/workflows/docker-image.yml:77-86`, `.github/workflows/test.yml:9-12`, `.github/CODEOWNERS:14-16`, `DOCKER.md:40`, SKILL.md row 117 and row 123

- [ ] **Step 1: codeql.yml.** Matrix becomes `['javascript-typescript', 'go', 'actions']`; the `actions` entry takes the Autobuild path (it already does: `if: matrix.language != 'go'`).
- [ ] **Step 2: docker-image.yml.** Add `provenance: mode=max` and `sbom: true` under `with:` of the build-push step.
- [ ] **Step 3: test.yml.** Delete the `merge_group:` trigger (line 12) and every line that exists only for it: the comment at 9-11, the token comment block starting at 14, the checkout comment at 54, and the four `if: github.event_name != 'merge_group'` job conditions (95, 145, 178, 219), which become always-true. `web-ci.yml:37` has the same checkout comment; trim its `(fork code, in a merge_group)` clause. `depends-on.yml` keeps its `merge_group:` trigger: that workflow is PR-only machinery and is out of this task. Leave `push:` unfiltered: finding 14's double run needs a PR branch, and this fork has none; the cost returns only if a PR flow ever starts.
- [ ] **Step 4: CODEOWNERS.** Replace lines 14-16 with "Area ownership routes review; nothing enforces it on this fork (no branch protection beyond the protect-main ruleset)."
- [ ] **Step 5: DOCKER.md:40.** Change the comment to "`./cops up` pulls `ghcr.io/jrmatherly/career-ops:latest`; `./cops rebuild` builds locally."
- [ ] **Step 6: Verify, unit.** `actionlint .github/workflows/*.yml && node tests/codeowners-paths.test.mjs && node tests/fork-deviations-covered.test.mjs`. Expected: silent, all `✅`.
- [ ] **Step 7: Verify, live.** After push: CodeQL run shows three analyses (`gh api 'repos/jrmatherly/career-ops/code-scanning/analyses?per_page=3' --jq '.[].category'` includes `/language:actions`); `docker buildx imagetools inspect ghcr.io/jrmatherly/career-ops:latest --format '{{json .SBOM}}'` is not `{}`.
- [ ] **Step 8: Commit.** `git commit -m "ci(fork): scan workflows with CodeQL, attest SBOM and provenance, drop the dead merge_group trigger"`

### Task C4: Enforce the commit convention and fix pr-ready (findings 17, 18)

**Files:**
- Create: `.githooks/commit-msg`, `.githooks/commit-msg.mjs`
- Modify: `.claude/skills/pr-ready/SKILL.md:15,16,20`
- Test: `tests/claude-hooks.test.mjs`

**Interfaces:**
- Produces: `commit-msg` exits 1 with `commit subject must be <type>(<scope>): <summary>` unless the first non-comment line, trimmed, matches `^(feat|fix|docs|ci|chore|test|refactor|perf|build|style|revert)\([^)]+\)!?: .+` or starts with `Merge `, `Revert "`, `fixup! ` or `squash! `. Trimmed because one cherry-picked commit in the fork's history carries a leading-space subject (`   test(reply-watch): ...`); the other 29 fork commits since the merge-base match the pattern as is (measured with `git log --format=%s`). `git merge` runs this hook; `git cherry-pick` does not, and `--no-verify` remains the escape.

- [ ] **Step 1: Write the failing tests.** Four cases in `tests/claude-hooks.test.mjs`, each writing the subject to a file in `work` and spawning `commit-msg.mjs` with that path: `feat(scan): x` passes, `update stuff` fails, `Merge branch 'careerops/main'` passes, `  fix(a): leading space` passes.
- [ ] **Step 2: Run to verify it fails.** `node tests/claude-hooks.test.mjs`, expected `❌` (hook missing).
- [ ] **Step 3: Implement** `.githooks/commit-msg` (sh shim like `pre-commit`, passing `"$1"` through) and `commit-msg.mjs` reading `process.argv[2]` with the regex above.
- [ ] **Step 4: pr-ready.** Steps 2 and 4 collapse into one `node .githooks/pre-commit.mjs` step: `npm run lint` is `node scripts/check-syntax.mjs` (`package.json:18`), which the hook already runs after the user-layer guard, so a separate lint step would run it twice. Step 7's evidence line must say `node test-all.mjs --quick` and the template box stays unticked unless the full suite ran.
- [ ] **Step 5: Verify, unit and live.** `node tests/claude-hooks.test.mjs` all `✅`; `git commit --allow-empty -m "bad subject"` in this checkout is refused, then `git commit --allow-empty -m "chore(fork): probe commit-msg hook"` succeeds and is dropped with `git reset --hard HEAD~1`.
- [ ] **Step 6: Commit.** `git commit -m "feat(hooks): enforce Conventional Commits in a commit-msg hook"`

### Bundle C close

- [ ] Same batch as Bundle A close, then push and confirm green.

---

## Appendix A. Alternatives rejected

- Editing `README.md` for the fork banner. It is CODEOWNERS-claimed upstream and changes every release; `FORK.md` avoids a permanent `~` conflict.
- Replacing the deviations table with an auto-generated one. The table carries verdicts and resolution rules a diff cannot infer; the test only checks coverage.
- Deleting the inert `.github/` leftovers in this plan. Each deletion needs its CODEOWNERS line and test pin removed together; deferred to a separate decision (spec, "Deferred decisions").
- A full branch protection with required checks. It would block the fork's direct-push flow; the ruleset blocks only destruction.

## Appendix B. Risks

- A2: a genuine leak that was already committed is no longer caught by the hook on later edits; `tests/user-layer-untracked.test.mjs` still catches it in CI.
- A5: `compareCommits` caps at 300 files; a merge from upstream larger than that would be partially checked. Acceptable, the local hook graded every file at commit time.
- B2: the review-log check greps the short SHA; a log that cites only the full SHA still matches since the short SHA is its prefix.
- B3: the `test` job checkout is shallow (depth 1, `test.yml:52`), so without the `fetch-depth: 0` change in B3 step 3 the suite skips on CI and only runs locally. A full clone adds the pack size, 126 MiB measured (`git count-objects -vH`), per OS runner.
- A4: a developer who relies on a global `core.hooksPath` (husky, a corporate hook set) loses those hooks in this clone, since the local value wins. The hook says so in its output; the developer can set the local value to their own path and then gets the WARNING instead, by design.
- B2: the fixture makes the fetch fail through a proxy on a closed local port; a machine with something listening on 127.0.0.1:9 would hang the fetch until git's timeout and the suite would be slow, not wrong.
- C3: adding `actions` to CodeQL may surface new alerts in the 9 workflows; triage them before dismissing.
