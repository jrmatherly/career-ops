#!/usr/bin/env node
// The local CodeRabbit review a PR-branch push needs (.githooks/pre-push.mjs checks for it).
//
//   node .githooks/coderabbit-review.mjs                      review HEAD against main
//   node .githooks/coderabbit-review.mjs --decline "<why>"    push with the findings of HEAD's review left open
//   node .githooks/coderabbit-review.mjs --skip "<why>"       push with no review (quota spent, CodeRabbit down)
//
// Each run leaves a marker for the HEAD commit in the repository's git directory, so a
// commit made after a review has none and needs its own. Exits 2 when the review has
// findings, which stops a `review && git push` chain before the push.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isMainModule } from '../lib/is-main-module.mjs';

const USAGE = `Usage: node .githooks/coderabbit-review.mjs [--decline "<reason>" | --skip "<reason>"]

  (no flag)            run the CodeRabbit review of HEAD against main and record it
  --decline "<why>"    record why the findings of HEAD's review stay open, so the push goes
  --skip "<why>"       record why HEAD is pushed with no review
`;

const git = (cwd, ...args) => {
  const run = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${run.stderr.trim()}`);
  return run.stdout.trim();
};

/** One directory for every worktree of the repository, so a review made in one counts in all. */
export const markerDir = (cwd) => join(resolve(cwd, git(cwd, 'rev-parse', '--git-common-dir')), 'coderabbit-reviewed');
const markerPath = (cwd, sha) => join(markerDir(cwd), `${sha}.json`);

/** The marker for `sha`: {state: "clean"|"findings"|"declined"|"skipped", findings, reason}, or null. */
export function readMarker(cwd, sha) {
  const file = markerPath(cwd, sha);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

export function writeMarker(cwd, sha, marker) {
  mkdirSync(markerDir(cwd), { recursive: true });
  writeFileSync(markerPath(cwd, sha), `${JSON.stringify({ ...marker, at: new Date().toISOString() })}\n`);
}

const runCodeRabbit = (cwd) => spawnSync('coderabbit', ['review', '--agent', '--committed', '--base', 'main', '--gate', 'info'], { cwd, encoding: 'utf-8', stdio: ['inherit', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 });

/** How many findings the review's closing event reports, or null when the review did not complete in full. */
export function findingsIn(stdout) {
  for (const line of String(stdout ?? '').split('\n').reverse()) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'complete') return event.outcome === 'completed' && Number.isInteger(event.findings) ? event.findings : null;
    } catch { /* not an event line */ }
  }
  return null;
}

/** Run the command for `args` in `cwd`; returns {code, out, err}. `run` is the seam for the CodeRabbit CLI. */
export function main(args, { cwd = process.cwd(), run = runCodeRabbit } = {}) {
  if (args.includes('--help') || args.includes('-h')) return { code: 0, out: USAGE };
  const [flag, reason = ''] = args;
  if (args.length > 2 || (flag && flag !== '--decline' && flag !== '--skip')) return { code: 1, err: USAGE };
  const sha = git(cwd, 'rev-parse', 'HEAD');

  if (flag) {
    if (!reason.trim()) return { code: 1, err: `${flag} needs a reason.\n` };
    if (flag === '--skip') {
      writeMarker(cwd, sha, { state: 'skipped', reason: reason.trim() });
      return { code: 0, out: `Recorded: ${sha} is pushed with no review (${reason.trim()}).\n` };
    }
    const marker = readMarker(cwd, sha);
    if (marker?.state !== 'findings' && marker?.state !== 'declined') return { code: 1, err: `${sha} has no review with findings to decline. Run the review first.\n` };
    writeMarker(cwd, sha, { state: 'declined', findings: marker.findings, reason: reason.trim() });
    return { code: 0, out: `Recorded: ${marker.findings} finding(s) on ${sha} stay open (${reason.trim()}).\n` };
  }

  const review = run(cwd);
  const out = review.stdout ?? '';
  // The CLI exits 0 when clean and 2 at the gate; anything else is a failed or partial review, whatever it printed.
  const findings = review.status === 0 || review.status === 2 ? findingsIn(out) : null;
  if (review.error || findings === null) {
    return { code: review.status || 1, out, err: `The review did not complete${review.error ? ` (${review.error.message})` : ''}, so ${sha} is not recorded. See \`coderabbit review --usage\` for the quota.\n` };
  }
  if (findings === 0) {
    writeMarker(cwd, sha, { state: 'clean', findings });
    return { code: 0, out };
  }
  writeMarker(cwd, sha, { state: 'findings', findings });
  return { code: 2, out, err: `${findings} finding(s) on ${sha}. Check each against the code. Fix the confirmed ones, commit and review again; for the rest run this script with --decline "<reason>".\n` };
}

if (isMainModule(import.meta.url)) {
  const result = main(process.argv.slice(2));
  if (result.out) process.stdout.write(result.out);
  if (result.err) process.stderr.write(result.err);
  process.exitCode = result.code;
}
