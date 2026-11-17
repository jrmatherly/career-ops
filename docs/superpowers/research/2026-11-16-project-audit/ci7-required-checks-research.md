# CI-7: which status checks to require on `main`

Researched 2026-11-16 against the live GitHub documentation and the repository. Read-only: nothing was changed, pushed, posted or applied.

Each answer ends with one of: **verified by reading** (the documentation page says it), **verified by observation** (seen on `jrmatherly/career-ops` or the sibling `jrmatherly/llm-router`), **not verified**.

## Recommendation

1. **Require two contexts**, both pinned to the GitHub Actions app (`integration_id` 15368):
   - the aggregate job of `test.yml`, widened to cover every job that should gate a merge (option c below), and
   - `🔒 Guard user-layer files`.
2. **Widen the aggregate job before the ruleset is applied** (YAML in question 3). Rename it at the same time, because after the ruleset exists a rename means a ruleset edit. Suggested name: `✅ Required checks passed`. If the owner keeps `✅ Test legs passed`, use that string in the JSON instead.
3. **Bypass**: repository admin role (`RepositoryRole`, `actor_id` 5), `bypass_mode: always`. Strict ("require branches to be up to date") off.
4. **Put the new rule in a second ruleset, not in `protect-main`.** A bypass actor bypasses every rule in its ruleset. Adding the admin bypass to `protect-main` would let the owner force-push and delete `main`, which nobody can do today (`bypass_actors: []`, `current_user_can_bypass: never`). Rulesets that target the same branch are aggregated, so a second ruleset gives the same checks and keeps deletion and force-push unbypassable.
5. **CodeQL**: gate with the `code_scanning` ruleset rule, not a status check, and add it as a second step after one docs-only pull request has shown how it behaves (question 4). It is not in the JSON below.

### Ruleset JSON: NOT APPLIED

Owner step. This creates a second ruleset and leaves 26671457 `protect-main` as it is.

```bash
# NOT APPLIED. Owner runs this after the widened aggregate job is on main.
gh api -X POST repos/jrmatherly/career-ops/rulesets --input - <<'EOF'
{
  "name": "main-required-checks",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/main"], "exclude": [] } },
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" } ],
  "rules": [
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "✅ Required checks passed", "integration_id": 15368 },
          { "context": "🔒 Guard user-layer files", "integration_id": 15368 }
        ] } }
  ]
}
EOF
```

Check afterwards: `gh api repos/jrmatherly/career-ops/rulesets/<new id> --jq '{bypass_actors, current_user_can_bypass}'` should print `current_user_can_bypass: "always"`, and `gh api repos/jrmatherly/career-ops/rulesets/26671457 --jq .current_user_can_bypass` should still print `"never"`.

Optional second step, after question 4's check (NOT APPLIED), one more entry in `rules`:

```json
{ "type": "code_scanning", "parameters": { "code_scanning_tools": [
  { "tool": "CodeQL", "alerts_threshold": "errors", "security_alerts_threshold": "high_or_higher" } ] } }
```

### Facts that change the decision

- The plan's `PUT` on `protect-main` widens the bypass to deletion and force-push. A second ruleset avoids that.
- A skipped job counts as a passing required check, in rulesets as in classic protection. Requiring `🌐 Browser and LaTeX suites` directly (option b) therefore works on docs-only changes, but only by relying on that rule. Option c makes the docs-only case explicit.
- The aggregate job did its work on the first run: on head 71560bfb `test (windows-latest, 1/2)` failed and `✅ Test legs passed` concluded `failure`. The earlier two contexts would have blocked that head. They would not have blocked a head where only the browser suites failed, which is what `main` itself shows on run 43913402133.
- Merge queue is not available to a personal-account repository.

## Check contexts on PR 100 (head 8bd518c9)

From `gh pr checks 100` and the GraphQL `statusCheckRollup`. Every Actions check came from app `github-actions`, id 15368, on a `pull_request` run. **Verified by observation.**

| Context | Workflow (file) | Can be skipped or absent |
| --- | --- | --- |
| `Classify the change` | 🧪 Tests (`test.yml`) | Skipped on `workflow_dispatch` only. Present on every PR to `main`. |
| `test (ubuntu-latest)`, `test (macos-latest)`, `test (windows-latest, 1/2)`, `test (windows-latest, 2/2)` | 🧪 Tests | Always present. On docs-only changes the macOS and Windows legs skip their steps and report success. Names change with the matrix. |
| `✅ Test legs passed` | 🧪 Tests | Always present (`if: always()`). |
| `🖼️ CV visual regression` | 🧪 Tests | Skipped on docs-only changes (job-level `if`). |
| `🌐 Browser and LaTeX suites` | 🧪 Tests | Skipped on docs-only changes. |
| `⬆️ Upgrade regression gate` | 🧪 Tests | Skipped on docs-only changes. |
| `🛡️ Dependency audit` | 🧪 Tests | Skipped on docs-only changes. Informative by design (no root lockfile). |
| `📤 Publish service` | 🧪 Tests | Skipped on docs-only changes. |
| `🔒 Guard user-layer files` | 🔒 No user data in PRs (`no-user-data.yml`) | Always present: `pull_request` with no branch or path filter, no job `if`. |
| `📦 Dependency review` | 📦 Dependency Review (`dependency-review.yml`) | Present on every PR to `main`. |
| `🔗 depends-on` (three check runs on this head) | 🔗 Depends on (`depends-on.yml`) | Present on every PR. Runs again on `edited`, so several runs share one name on one commit. |
| `🔍 Analyze javascript-typescript`, `🔍 Analyze go`, `🔍 Analyze actions` | 🔍 CodeQL Analysis (`codeql.yml`) | **Absent** when a PR changes only `.md`, images or `.upstream-review/**` (`paths-ignore`). |
| `CodeQL` | none: app `github-advanced-security`, id 57789 | The code scanning results check. Presence on a PR where the analysis did not run: not verified. |
| `🌐 web typecheck + build` | 🌐 Web CI (`web-ci.yml`) | **Absent** unless `web/**` or the workflow file changed. |
| `🐳 publish career-ops`, `-server`, `-publish`, `-cv-visual` | 🐳 Docker images (`docker-image.yml`) | **Absent** unless a listed path changed (Dockerfile, `deploy/**`, `publish/**`, `package.json` and others). |
| `🤖 Copilot setup steps` | 🤖 Copilot setup steps | **Absent** unless its own workflow file changed. |
| `CodeRabbit` | none: app `coderabbitai`, id 347564 | External. Reported `SKIPPED` on release PR 99. |

Not on PR 100: `🧩 Validate registry entries` (`plugin-registry-validate.yml`, only when `plugins-registry/**` changes) and `🏷️ release-please` (`release.yml`, push to `main` only).

Only the 🧪 Tests jobs and the guard job are present on every pull request to `main`. Any "absent" context would leave a pull request waiting forever if it were required.

## 1. Skipped jobs and required checks

- **Job skipped by a job-level `if:`**: it reports success and does not block. "A job that is skipped will report its status as "Success". It will not prevent a pull request from merging, even if it is a required check." The troubleshooting page lists successful conclusions as `success`, `skipped` and `neutral`.
- **Workflow not triggered** (path filter, branch filter, `[skip ci]` in the commit message): the check stays "Pending" and blocks: "Avoid requiring workflows that can be skipped." A workflow run started by `workflow_dispatch` does not satisfy a required check on a pull request either, even when it passes on the head commit.
- **Job skipped because a job it needs failed**: "The dependent job is skipped and may not block merging. Use `always()` with `needs` for required checks that depend on other jobs."
- **Classic protection versus rulesets**: the same. The classic page says required checks need a "`successful`, `skipped`, or `neutral` status". The ruleset page does not repeat the sentence but links to the same troubleshooting page, which names "a required status check in a branch ruleset" in the same article. An explicit ruleset-only statement was not found.
- **The aggregate job here**. `test-result` has `needs: [test]`, `if: ${{ always() }}` and one step: `[ "$TEST_RESULT" = success ]`. It treats exactly one value of `needs.test.result` as success: `success`. `failure`, `cancelled` and `skipped` (the four documented values) all fail the job.
- **Does `always()` close the trap?** Yes for every case found:
  - a leg fails: the job runs and fails. Observed on 71560bfb (one Windows shard failed, aggregate `failure`). On 8bd518c9 all four legs passed and the aggregate was `success`.
  - `test` cancelled or skipped: the job still runs (`always()` "returns `true`, even when canceled") and the value is not `success`.
  - the aggregate job itself cancelled or never started: its conclusion is `cancelled` or the check is missing. Neither is a successful conclusion, so the merge is blocked (fails closed).
  - the workflow not triggered at all: the context is missing and the merge is blocked.
  - The job can only end `skipped` if its `if` is false, and `always()` is never false.
- One limit by design, not a trap: on docs-only changes the macOS and Windows legs skip their steps and the job concludes `success`, so the aggregate passes on the Ubuntu leg alone.

Read: <https://docs.github.com/en/pull-requests/reference/status-checks>, <https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks>, <https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions>, <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches>, <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets>, <https://docs.github.com/en/actions/reference/workflows-and-actions/contexts>, <https://docs.github.com/en/actions/reference/workflows-and-actions/expressions>, <https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax>.

Status: skipped-is-success and pending-when-not-triggered **verified by reading**. Aggregate fails when a leg fails **verified by observation**. That a ruleset evaluates a `skipped` required context as passing: **not verified** by observation (no required check exists here yet). That `needs.test.result` is `cancelled` rather than `failure` when one leg is cancelled: **not verified**; either value fails the job.

## 2. Check identity

- **Name**. "Workflow: The name format is `<job name>`. Reusable workflow: `<job name> / <reusable job name>`." "Required status checks do not take workflow, matrix, or event trigger types into account." So the context is the job's `name:`, with no workflow prefix.
- **Matrix job without `name:`**. The documentation does not spell out the default. Observed: job id plus the matrix values in order, `test (ubuntu-latest)` and `test (windows-latest, 1/2)`.
- **Emoji**. Nothing in the documentation restricts them. Observed: `llm-router`'s ruleset requires `🧪 Unit and architecture`, `🎭 End to end`, `🐳 Docker smoke` and `📦 Build gateway`, and its pull request merges evaluate `required_status_checks: pass`. The string must match byte for byte. `✅` (U+2705) and `🔒` (U+1F512) have no variation selector. `🖼️` and `⬆️` carry U+FE0F, so copy those from `gh pr checks` output, never retype them.
- **Two workflows with the same job name**. They collide: "make sure that job names are unique across all workflows. Using the same job name in multiple workflows can cause ambiguous status check results and block pull requests from being merged." Neither recommended context is produced by a second workflow here. Which check run wins when one name appears twice on a commit (as `🔗 depends-on` does) is not documented.
- **`integration_id`**. "The optional integration ID that this status check must originate from." Without it "any person or integration with write permissions to a repository can set the state of any status check". Every Actions check run on 8bd518c9 has `app.id` 15368, slug `github-actions`. Pin it: it costs nothing and stops another app or a hand-posted commit status from satisfying the rule. `llm-router` does not pin and works.

Read: <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/troubleshooting-rules>, <https://docs.github.com/en/rest/repos/rules>, the available-rules and protected-branches pages above.

Status: name format, collision warning, `integration_id` meaning **verified by reading**. 15368, the matrix names and emoji contexts **verified by observation**. Whether the REST API accepts an `integration_id` for a context that has not yet reported on `main`: **not verified** (the UI needs a recent check run; the API description states no such condition).

## 3. What to require

| Option | Blocks a red browser suite | Blocks red CV visual, upgrade gate, publish | YAML change | Ruleset edit when a job is added or renamed |
| --- | --- | --- | --- | --- |
| (a) aggregate + guard | no | no | none | no |
| (b) (a) + `🌐 Browser and LaTeX suites` | yes | no | none | yes, per job |
| (c) widened aggregate + guard | yes | yes | about 15 lines and one test | no, for jobs in `test.yml` |

**Pick (c).**

- (a) leaves out the failure that prompted this review. `main` has it now: run 43913402133 has `🌐 Browser and LaTeX suites` red.
- (b) works with no YAML change, because a docs-only skip counts as success. It is the cheapest fix if the owner wants only that one job added. It does nothing for the upgrade gate or the other two, and every later addition is a ruleset edit.
- (c) keeps one stable context, states in the repository which jobs gate a merge, and handles the skip itself instead of leaning on GitHub's rule.

Cost of (c): four more jobs can block a merge, and two of them pull a container image and a TeX bundle from the network. A failure there means a re-run or an admin bypass.

**How the aggregate must treat `skipped`.** The four jobs have `if: ${{ !cancelled() && needs.changes.outputs.docs_only != 'true' }}`. Because of `!cancelled()`, a failed or skipped `changes` job does not skip them. So they end `skipped` in two cases only: the classifier said docs-only, or the run was cancelled. The rule is: `skipped` passes only when `needs.changes.outputs.docs_only` is exactly `true`. Anything else that is not `success` fails. `changes` goes into `needs` so its output can be read, but its own result is not checked, which keeps its failure tolerated. `dependency-audit` stays out: it is informative by design.

```yaml
  test-result:
    name: "✅ Required checks passed"
    # The one check to require. always(), because a failed job would otherwise
    # skip this one, and a skipped job counts as passing. `changes` is needed
    # for its output only: its failure is tolerated by design.
    # dependency-audit is left out: informative by design.
    needs: [changes, test, cv-visual, tool-suites, upgrade-gate, publish]
    if: ${{ always() }}
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: "🧾 Fail unless every gating job passed"
        env:
          DOCS_ONLY: ${{ needs.changes.outputs.docs_only }}
          TEST_RESULT: ${{ needs.test.result }}
          GATED: >-
            ${{ needs.cv-visual.result }}
            ${{ needs.tool-suites.result }}
            ${{ needs.upgrade-gate.result }}
            ${{ needs.publish.result }}
        run: |
          echo "docs_only: $DOCS_ONLY, test legs: $TEST_RESULT, others: $GATED"
          [ "$TEST_RESULT" = success ]
          for r in $GATED; do
            case "$r" in
              success) ;;
              # Skipped is a pass only when the classifier said docs-only.
              skipped) [ "$DOCS_ONLY" = true ] ;;
              *) exit 1 ;;
            esac
          done
```

The shell logic was run locally against nine combinations (all success; docs-only with four skips; a skip without docs-only; a failure; a cancel; test `failure`, `cancelled`, `skipped`; empty `docs_only`) and gave the expected exit code each time. The workflow itself has not run on GitHub.

`tests/docs-only-change.test.mjs` (the test "one stably named job fails unless every test leg passed", line 266) asserts the name, `needs: ['test']`, the env name and the `[ "$TEST_RESULT" = success ]` line. The name and `needs` assertions must change with this YAML. The other two still hold.

**Does (c) remove ruleset edits?** Yes for any job in `test.yml`: a new job is added to `needs` and `GATED` in the same file, and matrix legs can be renamed freely. No for a job in another workflow (`needs` cannot cross workflows), which is why the guard job stays a separate context. No for a rename of the aggregate job itself.

Two side effects to know:
- A pull request opened before the widened job lands reports the old name until it is synchronised, so it shows the new context as "Expected" and is blocked until then.
- The `pull_request` run uses the workflow from the pull request's own merge commit, so a pull request can change the gate that judges it. Acceptable with one maintainer.

Status: the `skipped` semantics of the jobs **verified by reading** `test.yml` and by observation (run 43903367055, a docs-only push: five jobs `skipped`, three legs `success`). The proposed YAML: shell logic tested locally, **not verified** on GitHub.

## 4. CodeQL

Three different things:

1. **The `🔍 Analyze <language>` jobs** are the CodeQL workflow's own jobs. Requiring them as status checks proves only that the analysis ran. They pass with new alerts (all three passed on PR 100 while alerts were open). They are absent on a pull request that changes only `.md` or image files, so requiring them would block every such pull request.
2. **The `CodeQL` check** comes from the `github-advanced-security` app (id 57789), not from a workflow. It is the code scanning results check: "If the code scanning results check finds any problems with a severity of `error`, `critical`, or `high`, the check fails". On 8bd518c9 its title is "1 new alert including 1 high severity security vulnerability" (alert 27, `js/unvalidated-dynamic-method-call`, in `tests/landed-url-guard-fixtures.mjs`). It could be required as a status check with `integration_id` 57789, but the documentation steers away from that.
3. **The ruleset rule** is type `code_scanning`, shown in the UI as "Require code scanning results". Parameters: `code_scanning_tools`, an array of `{ tool, alerts_threshold, security_alerts_threshold }`. `alerts_threshold` is one of `none`, `errors`, `errors_and_warnings`, `all`. `security_alerts_threshold` is one of `none`, `critical`, `high_or_higher`, `medium_or_higher`, `all`. It blocks when a required tool finds an alert at the threshold, when its analysis is still in progress, or when the tool is not configured. "Merge protection with rulesets is not related to status checks."

**Personal-account public repository.** Code scanning is available on "Public repositories on GitHub.com". The concept page says the rule can be set "At the repository level", and organization level needs Enterprise. The how-to page's "who can use" line names only organization roles. So the documentation points to yes but does not say it for a user-owned repository. The REST call is the test: a `422` on the `code_scanning` rule would settle it.

**Recommendation: gate, with the `code_scanning` rule**, thresholds `errors` and `high_or_higher`, which match what the `CodeQL` check already fails on. It is the mechanism built for this, it also blocks while analysis is running, and it is immune to the name and path-filter problems of options 1 and 2. Add it as a second step because of one open point: `codeql.yml` skips `.md`-only and image-only pull requests through `paths-ignore`, and the REST reference says "code scanning must be enabled and have results for both the commit and the reference being updated". Whether such a pull request is then blocked is not documented. Open one docs-only pull request after adding the rule. If it is blocked, drop `paths-ignore` from the `pull_request` trigger in `codeql.yml` (about four minutes of CI per docs pull request) or remove the rule.

Under this rule PR 100's current head would be blocked until alert 27 is fixed or dismissed.

Read: <https://docs.github.com/en/code-security/concepts/code-scanning/merge-protection>, <https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/manage-your-configuration/set-merge-protection>, <https://docs.github.com/en/code-security/code-scanning/managing-code-scanning-alerts/triaging-code-scanning-alerts-in-pull-requests>, <https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options>, <https://docs.github.com/en/rest/repos/rules>.

Status: rule name, parameters, blocking conditions, what the `CodeQL` check is: **verified by reading**. The app id and the alert: **verified by observation**. Availability on a personal-account repository and the behaviour on a path-skipped pull request: **not verified**.

## 5. Bypass and direct pushes

- **What the rule does to a push.** "Choose which status checks must pass before the ref is updated. When enabled, commits must first be pushed to another ref where the checks pass." A direct push of a commit with no passing checks is refused unless the pusher can bypass.
- **Owner's direct push, with the admin bypass.** Allowed, and recorded as a bypass. Observed on `llm-router` (user-owned, public, same bypass): its rule suites for `refs/heads/main` show `result: bypass` with the evaluation `required_status_checks: fail, "4 of 4 required status checks are expected."`.
- **Merge of a pull request with green checks.** Passes with no bypass. Observed on `llm-router`: the squash merge of its pull request 76 has `result: pass`, `required_status_checks: pass`.
- **The release-please App.** Not affected. The ruleset targets `refs/heads/main` only. The App pushes `release-please--branches--main` and creates tags and releases, none of which match a branch ruleset on `main`. The last 100 rule suites on `career-ops` are all `refs/heads/main` by `jrmatherly`: the App has not pushed to `main`. Its release pull request does get `pull_request` runs (PR 99 has the full set of checks), because it is opened with the App token, so the required contexts will report there.
- **Admin bypass on a personal repository.** The documentation lists "Repository admins" among eligible bypass actors and restricts only one type: "OrganizationAdmin is not applicable for personal repositories." The REST enum is `Integration`, `OrganizationAdmin`, `RepositoryRole`, `Team`, `DeployKey`, `User`. `llm-router` has `{actor_id: 5, actor_type: RepositoryRole, bypass_mode: always}` and `current_user_can_bypass: "always"`, and it bypasses in practice. **Role id 5 is not listed in any GitHub documentation page read**; it is confirmed by that observation only.
- **Modes.** `always`, `pull_request`, `exempt`. `pull_request` would refuse the owner's direct docs pushes. `exempt` skips the rules and writes no bypass entry, which loses the audit trail. Keep `always`.
- **Scope of a bypass.** It covers every rule in its ruleset. See recommendation 4.
- **`gh pr merge` with a failing required check.** From the `gh` source (`pkg/cmd/pr/merge/merge.go`, trunk; local `gh` is 2.104.0): when the pull request's `mergeStateStatus` is `BLOCKED` and neither `--admin` nor `--auto` is given, it prints "is not mergeable: the base branch policy prohibits the merge", suggests `--admin`, and exits non-zero. With `--admin` it merges. So `--admin` is needed, and that refusal is the practical safety: a plain `gh pr merge` cannot land a red pull request by accident. `--auto` is not an option here (`allow_auto_merge` is `false`). In the web UI the equivalent is the bypass checkbox in the merge box.

Read: <https://docs.github.com/en/rest/repos/rules>, <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository>, <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets>, <https://cli.github.com/manual/gh_pr_merge>, <https://github.com/cli/cli/blob/trunk/pkg/cmd/pr/merge/merge.go>.

Status: push semantics, bypass actor types and modes, layering: **verified by reading**. Bypass and pass results, role id 5, the App's refs: **verified by observation** (`llm-router` rule suites, `career-ops` rule suites, `release.yml`). That GitHub reports `BLOCKED` to a viewer who can bypass, so that `gh` really refuses without `--admin`: **not verified** (PR 100 reports `UNSTABLE` today because nothing is required; `viewerCanMergeAsAdmin` is `true`). The first red pull request after the ruleset settles it.

## 6. Cancelled or never-started runners

The documentation offers re-running only: "You can re-run a workflow run, all failed jobs in a workflow run, or specific jobs in a workflow run up to 30 days after its initial run." No automatic retry for a job that could not get a hosted runner was found in the Actions documentation, and a web search found no changelog entry for one.

What helps here:
- `gh run rerun <run-id> --failed` re-runs the cancelled leg, and "GitHub also re-runs the jobs that depend on them", so the aggregate job re-evaluates on the same commit without a new push.
- If only infrastructure failed and the wait is not worth it, the admin bypass (`gh pr merge --admin`) is the other exit.
- A workflow that re-runs failed runs on `workflow_run` is possible but is new code with `actions: write`, for something seen once (run 43913402133: the macOS leg waited 15 minutes and was cancelled with no runner assigned). Not recommended yet.

Read: <https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs>, <https://docs.github.com/en/actions/reference/runners/github-hosted-runners>, <https://docs.github.com/en/actions/how-tos/troubleshoot-workflows>.

Status: re-run behaviour **verified by reading**; the cancelled leg **verified by observation**. Absence of an automatic retry is a negative result from the pages read and one search: **not verified** beyond that.

## 7. Merge queue and "require branches to be up to date"

- **Merge queue: no, and it cannot be turned on.** "Pull request merge queues are available in any public repository owned by an organization, or in private repositories owned by organizations using GitHub Enterprise Cloud." This repository is owned by a user account. **Verified by reading** (<https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue>).
- **Strict: off.** The owner pushes docs commits to `main` many times a day. With strict on, each of those makes every open pull request "behind" and forces an update and a full CI run before it can merge. The `pull_request` run already tests the merge of the branch with `main` as of the run. The documented cost of loose mode, "Status checks may fail after you merge your branch if there are incompatible changes with the base branch", is small when pull requests land one at a time, and the push run on `main` shows it. **Verified by reading** (available-rules page).

## 8. Other options the plan's JSON does not use

- **`do_not_enforce_on_create`** ("Allow repositories and branches to be created if a check would otherwise prohibit it"). It matters when a ruleset targets a pattern under which new branches get created. This one targets `refs/heads/main`, which exists. Leave it `false`. It is in the JSON above only to make the choice visible.
- **A second ruleset instead of editing `protect-main`.** Recommended, see recommendation 4.
- **`integration_id`.** The plan already uses it. Keep it.
- **`bypass_mode: exempt`** and the **`User` actor type** both exist now. `exempt` is not wanted (no audit entry). `User` with id 156276185 is the plan's fallback and is still valid, but the role bypass is observed working, so the fallback should not be needed.
- **`code_scanning`** rule: question 4.
- **Rule insights.** `gh api repos/jrmatherly/career-ops/rulesets/rule-suites` lists every push with `pass`, `fail` or `bypass`. Use it after the change to confirm that a direct push shows `bypass` and a merge shows `pass`. The "Evaluate" enforcement mode would allow a dry run, but the pages read do not say which plans have it.
- The plan text of Task CI-7 Step 3 still lists the five leg names. The decision record (two contexts) supersedes it, and this report supersedes the context name if the job is renamed.

Read: <https://docs.github.com/en/rest/repos/rules>, <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/managing-rulesets-for-a-repository>. Status: **verified by reading**. Evaluate-mode availability: **not verified**.

## What could not be verified

1. That a ruleset counts a `skipped` required context as passing. Documented for status checks in general, not observed here. Settled by the first docs-only pull request after the ruleset exists, if option (b) is chosen. Option (c) does not depend on it.
2. The widened aggregate YAML on GitHub. Only its shell logic was run. Settled by one normal and one docs-only pull request.
3. `needs.test.result` when a single leg is cancelled (`cancelled` or `failure`). Both fail the job. Settled by cancelling one leg on a pull request run and reading the job's first log line.
4. Whether GitHub reports `BLOCKED` to an actor who can bypass, which is what makes `gh pr merge` refuse without `--admin`. Settled by `gh pr view <n> --json mergeStateStatus` on the first red pull request.
5. Role id 5 from GitHub's own documentation. Observed working on `llm-router` only.
6. The `code_scanning` rule on a user-owned repository, and what it does to a pull request on which `codeql.yml` did not run. Settled by adding the rule and opening one `.md`-only pull request.
7. Which check run counts when one context name appears more than once on a commit. Not documented. Not a problem for the two recommended contexts unless a pull request is closed and reopened on the same commit while a run is in progress.
8. That no automatic retry for an unavailable hosted runner exists. Negative result from three documentation pages and one search.
9. Whether the REST API accepts a required context that has never reported on `main`, and the plan availability of "Evaluate" mode.
