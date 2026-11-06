#!/usr/bin/env node
// Git commit-msg hook for this fork: the subject must be a Conventional Commit
// with a scope (`fix(scan): …`), so a commit can be offered upstream, where
// release-please reads it; the fork itself cuts no releases.
// Merges, reverts and fixup!/squash! subjects pass. git merge runs this hook;
// git cherry-pick does not, and --no-verify remains the escape.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SUBJECT = /^(feat|fix|docs|ci|chore|test|refactor|perf|build|style|revert)\([^)]+\)!?: .+/;
const PASSTHROUGH = /^(Merge |Revert "|fixup! |squash! )/;

const file = process.argv[2];
const commentChar = (spawnSync('git', ['config', '--get', 'core.commentChar'], { encoding: 'utf-8' }).stdout || '#').trim() || '#';
if (!file) {
  console.error('commit-msg: no message file given');
  process.exit(1);
}
// git strips comment lines itself in the default cleanup mode, but a hook sees the
// raw file; skip them (core.commentChar, default #) and blank lines, then trim (a cherry-picked subject once
// carried leading spaces).
const subject = (readFileSync(file, 'utf-8').split('\n').find((line) => line.trim() && !line.startsWith(commentChar)) || '').trim();
if (SUBJECT.test(subject) || PASSTHROUGH.test(subject)) process.exit(0);
console.error(`commit-msg: commit subject must be <type>(<scope>): <summary>, got: ${JSON.stringify(subject)}`);
process.exit(1);
