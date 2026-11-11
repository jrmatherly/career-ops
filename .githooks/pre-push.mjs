#!/usr/bin/env node
// Git pre-push hook for this fork: a branch other than main is pushed only when its tip
// commit has a CodeRabbit review on record (.githooks/coderabbit-review.mjs writes it).
// Git feeds one "<local ref> <local sha> <remote ref> <remote sha>" line per ref on stdin.
import { readFileSync } from 'node:fs';
import { isMainModule } from '../lib/is-main-module.mjs';
import { readMarker } from './coderabbit-review.mjs';

const REVIEW = 'node .githooks/coderabbit-review.mjs';

/** What stops this push: one message per ref that may not go, and a note per ref that goes without a clean review. */
export function pushVerdict(stdin, cwd) {
  const refused = [];
  const notes = [];
  for (const line of stdin.split('\n')) {
    const [localRef, sha, remoteRef] = line.trim().split(/\s+/);
    // Tags, deletions (an all-zero sha) and main itself need no review.
    if (!remoteRef?.startsWith('refs/heads/') || remoteRef === 'refs/heads/main' || /^0+$/.test(sha)) continue;
    const marker = readMarker(cwd, sha);
    const short = sha.slice(0, 8);
    if (!marker) refused.push(`${localRef} (${short}) has no CodeRabbit review. Run \`${REVIEW}\` and read what it reports, then push.`);
    else if (marker.state === 'findings') refused.push(`${localRef} (${short}) has ${marker.findings} open finding(s). Fix them, commit and review again, or run \`${REVIEW} --decline "<reason>"\`.`);
    else if (marker.state !== 'clean') notes.push(`${localRef} (${short}) goes with ${marker.state === 'skipped' ? 'no review' : `${marker.findings} finding(s) declined`}: ${marker.reason}`);
  }
  return { refused, notes };
}

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`Usage: git runs this as its pre-push hook, with the pushed refs on stdin.\nA branch other than main needs a review of its tip commit first: ${REVIEW}`);
    process.exit(0);
  }
  const { refused, notes } = pushVerdict(readFileSync(0, 'utf-8'), process.cwd());
  for (const note of notes) console.error(`pre-push: ${note}`);
  for (const message of refused) console.error(`pre-push: ${message}`);
  process.exitCode = refused.length ? 1 : 0;
}
