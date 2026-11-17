#!/usr/bin/env node
// The local CodeRabbit review a PR-branch push needs (.githooks/pre-push.mjs checks for it).
//
//   node .githooks/coderabbit-review.mjs                      review HEAD against main
//   node .githooks/coderabbit-review.mjs --decline "<why>"    push with the findings of HEAD's review left open
//   node .githooks/coderabbit-review.mjs --skip "<why>"       push a HEAD that has no review (quota spent, CodeRabbit down)
//
// Each completed run leaves a marker for the HEAD commit in the repository's git
// directory, so a commit made after a review has none and needs its own. Exits 2 when
// the review has findings at or above GATE, or findings no passed gate placed below it,
// so no caller can take it for a clean run. Findings below GATE are printed and do not
// block: a gated run reviews the whole diff afresh, and blocking on every severity did
// not converge in five passes (docs/superpowers/research/2026-11-17-review-loop).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isMainModule } from '../lib/is-main-module.mjs';

const USAGE = `Usage: node .githooks/coderabbit-review.mjs [--decline "<reason>" | --skip "<reason>"]

  (no flag)            run the CodeRabbit review of HEAD against main and record it;
                       only major and critical findings block the push
  --decline "<why>"    record why the findings of HEAD's review stay open, so the push goes
  --skip "<why>"       record why a HEAD with no review is pushed anyway
`;

const messageOf = (error) => (error instanceof Error ? error.message : String(error));

const git = (cwd, ...args) => {
  const run = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(run.error?.message ?? run.stderr ?? '').trim()}`);
  return run.stdout.trim();
};

/** One directory for every worktree of the repository, so a review made in one counts in all. */
export const markerDir = (cwd) => join(resolve(cwd, git(cwd, 'rev-parse', '--git-common-dir')), 'coderabbit-reviewed');
const markerPath = (cwd, sha) => join(markerDir(cwd), `${sha}.json`);

const hasReason = (marker) => typeof marker.reason === 'string' && marker.reason.trim() !== '';
const hasFindings = (marker) => Number.isInteger(marker.findings) && marker.findings > 0;
// What each state must carry. A marker in any other shape is no marker, so the push gate fails closed on it.
const VALID = {
  clean: () => true,
  findings: hasFindings,
  declined: (marker) => hasFindings(marker) && hasReason(marker),
  skipped: hasReason,
};

/** The marker for `sha`: {state: "clean"|"findings"|"declined"|"skipped", findings?, reason?, at}, or null when none is valid. */
export function readMarker(cwd, sha) {
  const file = markerPath(cwd, sha);
  if (!existsSync(file)) return null;
  try {
    const marker = JSON.parse(readFileSync(file, 'utf-8'));
    return marker && Object.hasOwn(VALID, marker.state) && VALID[marker.state](marker) ? marker : null;
  } catch {
    return null;
  }
}

export function writeMarker(cwd, sha, marker) {
  mkdirSync(markerDir(cwd), { recursive: true });
  const file = markerPath(cwd, sha);
  // Renamed into place, so a push in another worktree never reads half a marker.
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify({ ...marker, at: new Date().toISOString() })}\n`);
  renameSync(temp, file);
}

export const GATE = 'major';

const runCodeRabbit = (cwd) => spawnSync('coderabbit', ['review', '--agent', '--committed', '--base', 'main', '--gate', GATE], { cwd, encoding: 'utf-8', stdio: ['inherit', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 });

/**
 * What a finished `coderabbit review --agent --gate <GATE>` run established: {state: "findings",
 * findings} when its closing event says the gate is blocked or counts blocking findings, or
 * reports findings without saying
 * the gate passed (a partial review, a gate with no result), so they are declined and not
 * skipped; {state: "clean"} only when the CLI exited 0, the gate passed with nothing blocking and
 * no file was left unreviewed (`completed_with_warnings` is then still a full review), with
 * `belowGate` counting the findings under the gate; else null.
 */
export function reviewResult(status, stdout) {
  let complete = null;
  for (const line of String(stdout ?? '').split('\n')) {
    try {
      const event = JSON.parse(line);
      if (event?.type === 'complete') complete = event;
    } catch { /* not an event line */ }
  }
  if (!complete || !Number.isInteger(complete.findings)) return null;
  const gate = complete.gate?.status;
  const blocking = Number(complete.gate?.blockingFindings) || 0;
  if (gate === 'blocked' || blocking > 0) return { state: 'findings', findings: blocking || Math.max(complete.findings, 1) };
  // Without a passed gate nothing says these are below it.
  if (gate !== 'passed' && complete.findings > 0) return { state: 'findings', findings: complete.findings };
  // `review_skipped` is the CLI finding nothing to review, which is not a review.
  const full = complete.status === 'review_completed' && complete.outcome !== 'failed' && !(complete.unreviewedFileCount > 0);
  if (status !== 0 || !full || gate !== 'passed') return null;
  return { state: 'clean', findings: 0, ...(complete.findings > 0 && { belowGate: complete.findings }) };
}

function failureOf(review) {
  if (review.error?.code === 'ENOENT') return 'the coderabbit CLI is not on PATH';
  if (review.error) return review.error.message;
  if (review.signal) return `the review was killed by ${review.signal}`;
  return `the review exited ${review.status} without a full result`;
}

/** Run the command for `args` in `cwd`; returns {code, out, err}. `run` is the seam for the CodeRabbit CLI. */
export function main(args, { cwd = process.cwd(), run = runCodeRabbit } = {}) {
  if (args.includes('--help') || args.includes('-h')) return { code: 0, out: USAGE };
  const [flag, reason = ''] = args;
  if (args.length > 2 || (flag && flag !== '--decline' && flag !== '--skip')) return { code: 1, err: USAGE };
  const sha = git(cwd, 'rev-parse', 'HEAD');

  if (flag) {
    if (!reason.trim()) return { code: 1, err: `${flag} needs a reason.\n` };
    const marker = readMarker(cwd, sha);
    const open = marker?.state === 'findings' || marker?.state === 'declined';
    if (flag === '--skip') {
      if (open) return { code: 1, err: `${sha} has a review with ${marker.findings} finding(s), so it cannot be skipped. Use --decline "<reason>".\n` };
      writeMarker(cwd, sha, { state: 'skipped', reason: reason.trim() });
      return { code: 0, out: `Recorded: ${sha} is pushed with no review (${reason.trim()}).\n` };
    }
    if (!open) return { code: 1, err: `${sha} has no review with findings to decline. Run the review first.\n` };
    writeMarker(cwd, sha, { state: 'declined', findings: marker.findings, reason: reason.trim() });
    return { code: 0, out: `Recorded: ${marker.findings} finding(s) on ${sha} stay open (${reason.trim()}).\n` };
  }

  const review = run(cwd);
  const out = review.stdout ?? '';
  // The CLI reviews whatever HEAD is when it starts reading, so a commit made meanwhile leaves the result unowned.
  const moved = git(cwd, 'rev-parse', 'HEAD') !== sha;
  if (moved) return { code: 1, out, err: `HEAD moved off ${sha} while the review ran, so nothing is recorded. Run it again.\n` };
  const result = review.error ? null : reviewResult(review.status, out);
  if (!result) {
    return { code: 1, out, err: `Nothing is recorded for ${sha}: ${failureOf(review)}. Run it again (\`coderabbit review --usage\` shows the quota), or record why the push goes without it: --skip "<reason>".\n` };
  }
  writeMarker(cwd, sha, result);
  if (result.state === 'clean') {
    return { code: 0, out, ...(result.belowGate && { err: `${result.belowGate} finding(s) below ${GATE} on ${sha} do not block the push. Read them above: fix a regression or a defect in what this branch is for, and list the rest in the pull request.\n` }) };
  }
  return { code: 2, out, err: `${result.findings} blocking finding(s) on ${sha} (${GATE} or above, or not placed below the gate by a full review). Check each against the code. Fix the confirmed ones, commit and review that commit; for the rest run this script with --decline "<reason>".\n` };
}

if (isMainModule(import.meta.url)) {
  try {
    const result = main(process.argv.slice(2));
    if (result.out) process.stdout.write(result.out);
    if (result.err) process.stderr.write(result.err);
    process.exitCode = result.code;
  } catch (error) {
    process.stderr.write(`coderabbit-review: ${messageOf(error)}\n`);
    process.exitCode = 1;
  }
}
