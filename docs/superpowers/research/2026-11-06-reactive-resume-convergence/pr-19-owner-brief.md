# PR-19 owner brief (home-cluster deploy)

Written by the coordinator 2026-11-07 23:30Z. Paste into a Claude Code session opened in `~/dev/home-cluster` (own worktree, branch `career-ops-deploy`). The coordinator could not start the session itself: the app refused a cross-repo start and a proposal card cannot name another folder.

## Background

The Reactive Resume convergence program (plan `docs/superpowers/plans/2026-11-06-reactive-resume-convergence.md`, trail `decisions.tsv` beside this file, both in `~/dev/career-ops`) landed all 22 of its in-repo PRs on `jrmatherly/career-ops` main (`f3ef8dee`). PR-19 is the one unit left: deploy two images to the Flux-managed home cluster. Both images are on GHCR, `ghcr.io/jrmatherly/career-ops-server` and `ghcr.io/jrmatherly/career-ops-publish`, tags `latest` and `sha-f3ef8de` (packages API, 2026-11-07). Pocket ID runs in namespace `security`; namespace `career-ops` does not exist; `cluster.toml` has no `[career_ops]` block; local `main` was one commit behind `origin/main` at 23:15Z, so start from `origin/main`.

Owner protocol: own worktree, PR opened ready, `/pr-review-toolkit:review-pr`, one merge-in of `main` right before merging, raise `gh pr merge` so the operator presses the prompt, never merge yourself. Three PRs in flight max; this is the only one.

## Brief

Work in J mode (`/jstack:j-mode`, Feature playbook). You own this PR end to end in this worktree; no other session writes here.

GOAL. Deploy career-ops (web + scheduler) and the publish service the house way, so `career.<domain>` serves the dashboard behind Pocket ID and `cv.<domain>` serves public share pages. Stop at merge-ready and raise `gh pr merge`.

CONTRACT. Read in full the PR-19 section of the plan ("Deploy career-ops and the publish service to the home cluster (PR-19)", about lines 1345-1424). Also read `~/dev/career-ops/deploy/README.md` and `deploy/Dockerfile` (uid 1000, port 3000), `publish/README.md` and `publish/.env.example` (publish env names), and `web/src/lib/bind-host.mjs` (how the web filters `Host`, `CAREER_OPS_WEB_ALLOWED_HOSTS`).

CORRECTIONS FROM PR-13/15/17 (apply over the contract where they differ):
- Node floor 22.16+: confirm with `docker run --rm ghcr.io/jrmatherly/career-ops-server:latest node --version`, record in VERIFY.md.
- Probes: the contract says `Host: localhost`; a PR-17b follow-up says `Host career-ops-web`. Settle from `bind-host.mjs`: loopback hosts are always admitted, so `Host: localhost` works for probes; the scan-tick CronJob's `-H 'Host: career-ops-web'` needs `CAREER_OPS_WEB_ALLOWED_HOSTS` to include `career-ops-web`, or the CronJob sends `Host: localhost` too. Prefer the option needing no new env; write the reason in the PR body.
- `/data` claim with `fsGroup: 1000`; emptyDirs at `/tmp`, `/home/app/.cache`, `/dev/shm` (memory, 1Gi).
- No tracker seeding: since career-ops #18 an empty `/data` boots.
- Publish: never mount `publish/.env.example`. `PUBLISH_BIND=0.0.0.0`, DB on the `publish-data` claim. Contract: `PUBLISH_TRUSTED_PROXIES` = pod CIDR, `PUBLISH_CLIENT_IP_HEADER=x-forwarded-for` behind Envoy. PR-15 follow-up: if Cloudflare terminates through a host tunnel every visitor keys alike, so then run cloudflared as a sidecar with `PUBLISH_TRUSTED_PROXIES=127.0.0.1`. Check how `cv.<domain>` reaches a pod here (`envoy-external`, any `cloudflared` under `template/config/kubernetes/apps/network/`) and choose; write the reason.
- Pocket ID must send `email_verified: true` for the publish Better Auth sign-in; note as an operator check in the PR body and `.claude/rules/apps/career-ops.md`.
- `claude setup-token` lasts one year; renewal = rerun, paste into `cluster.toml`, `just configure`; `reloader.stakater.com/auto` restarts the pod. Put it in the rules file.

HOUSE WAY. Edit `.j2` only; `just configure` renders and encrypts; restore unchanged sops files. Mirror the closest app (`reactive-resume/`, `media/shared/app/securitypolicy.yaml.j2`, the `volume-backup` CronJob pattern). Read `CLAUDE.md` and `.claude/rules/` first. Validator: `CareerOps` model with `_all_or_none`, `career_ops_enabled` keyed on `oidc_client_secret`, cross-field rules requiring `pocket_id_enabled`, `ingress.mode != "none"`, `volume_backup_enabled`; regenerate `cluster.schema.json`; `[career_ops]` in `cluster.sample.toml`; a valid fixture entry in `.github/template-tests/valid/public.toml` and one invalid fixture with `# expect:`. Add `.claude/rules/apps/career-ops.md` plus its `CLAUDE.md` index line. Add both images to `.renovaterc.json5` digest-pinned and automerged like the docs image; pin as `latest@sha256:...` (`crane digest`).

STEPS. (1) Fetch, branch from `origin/main`, write this PR's plan with the writing-plans skill. (2) Validator first, failing fixture test first: `uv run --locked pytest template/scripts/test_validate.py -q`. (3) Templates, `just configure`, restore unchanged sops files, `oxfmt --check`. The operator has not yet created the two Pocket ID clients or run `claude setup-token`, so leave `[career_ops]` absent in `cluster.toml` (all-or-none, nothing renders) and prove the render with a scratch copy carrying placeholders; delete it, never commit it. (4) Commit (Conventional Commits with scope), push, open the PR ready with the operator gate list in the body, run `/pr-review-toolkit:review-pr`, fix what is real. (5) Stop at merge-ready. Do NOT merge. Live and perf lanes need the secrets: list them pending in VERIFY.md with the exact inputs (Pocket ID client for `https://career.<domain>/oauth2/callback`; Pocket ID client for `https://cv.<domain>/api/auth/callback/pocket-id`; `claude setup-token` output; `publish_api_key`; `publish_auth_secret`). When the operator says the values are in `cluster.toml`: `just configure`, commit, push, watch Flux, run the lanes, review-gate screenshots to `private/review/`, raise `gh pr merge`.

ACCEPTANCE. Unit test passes with the new fixtures and the Stop hook renders every valid fixture; `oxfmt --check` clean; no rendered file or unchanged sops ciphertext committed; PR open, review run, VERIFY.md at the PR head with unit evidence and the lanes marked pending with the gate list.

TIMEBOX. About 3 hours for steps 1-4; on expiry push what is committed and report.

FORBIDDEN. No merge, no rebase of shared branches, no force-push, no edits outside home-cluster, no secrets in git, no `--dangerously-skip-permissions`, no changes to other apps beyond the career-ops entries.

REPORT. Status, branch, head SHA, PR link, commands run with results, deviations with reasons, the operator gate list, follow-ups. Keep a `decisions.tsv` beside the plan (ISO timestamp, kind, what, why, evidence, next) and commit it with the PR.
