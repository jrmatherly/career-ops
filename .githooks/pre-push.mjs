#!/usr/bin/env node
// Git pre-push hook for this fork: a push to any remote branch but main goes only when
// its tip commit has a CodeRabbit review on record (.githooks/coderabbit-review.mjs writes it).
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
    // Read from the right: the local ref is whatever was typed, and `HEAD@{1 day ago}` has spaces.
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const [sha, remoteRef] = parts.slice(-3);
    const localRef = parts.slice(0, -3).join(' ');
    // Tags, deletions (an all-zero sha) and main itself need no review.
    if (!remoteRef.startsWith('refs/heads/') || remoteRef === 'refs/heads/main' || /^0+$/.test(sha)) continue;
    const marker = readMarker(cwd, sha);
    const name = `${localRef} (${sha.slice(0, 8)})`;
    if (marker?.state === 'clean') continue;
    if (marker?.state === 'skipped') notes.push(`${name} goes with no review: ${marker.reason}`);
    else if (marker?.state === 'declined') notes.push(`${name} goes with ${marker.findings} finding(s) declined: ${marker.reason}`);
    else if (marker?.state === 'findings') refused.push(`${name} has ${marker.findings} open finding(s). Fix them, commit and review again, or run \`${REVIEW} --decline "<reason>"\`.`);
    else refused.push(`${name} has no CodeRabbit review on record. Run \`${REVIEW}\` and read what it reports, then push.`);
  }
  return { refused, notes };
}

function readStdin() {
  try {
    return readFileSync(0, 'utf-8');
  } catch (error) {
    // Windows reports an empty pipe, which is what git sends when nothing is pushed, as EOF.
    if (error?.code === 'EOF') return '';
    throw error;
  }
}

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`Usage: git runs this as its pre-push hook, with the pushed refs on stdin.\nA push to any remote branch but main needs a review of its tip commit first: ${REVIEW}`);
    process.exit(0);
  }
  try {
    const { refused, notes } = pushVerdict(readStdin(), process.cwd());
    for (const note of notes) console.error(`pre-push: ${note}`);
    for (const message of refused) console.error(`pre-push: ${message}`);
    process.exitCode = refused.length ? 1 : 0;
  } catch (error) {
    console.error(`pre-push: the review gate could not run, so the push is refused: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
