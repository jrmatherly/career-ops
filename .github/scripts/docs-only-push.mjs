#!/usr/bin/env node
// docs-only-push: the fork's answer to "docs only?" for every event test.yml runs on.
//
// This fork has no PR flow, so CI runs on push, where upstream's
// docs-only-change.mjs always answers false (a push checkout is not a merge
// commit). A push is classified from its `before..sha` range instead, against
// upstream's patterns plus the fork's own prose. Upstream's file stays untouched
// so it merges cleanly; every doubt still answers docs_only=false.
//
// Env: GITHUB_EVENT_NAME, DOCS_ONLY_BEFORE (github.event.before), GITHUB_SHA,
//      GITHUB_OUTPUT (the step's output file; absent when run by hand)

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { isMainModule } from '../../lib/is-main-module.mjs';
import { changedFiles, classifyCheckout, isDocsPath } from './docs-only-change.mjs';

// CHANGELOG.md, HIRED.md, MANIFESTO.md, TRADEMARK.md, watermark.json and the
// agent files stay out: tests or agents read them, so an edit can fail the suite.
const FORK_DOC = /^(?:FORK\.md|MAINTAINERS\.md|DOCKER\.md|LEGAL_DISCLAIMER\.md|CONTRIBUTORS\.md|\.upstream-review\/reviews\/[^/]+\.md)$/;

/** Upstream's docs paths plus the fork's own prose. */
export function isForkDocsPath(path) {
  return isDocsPath(path) || FORK_DOC.test(path);
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * The answer for a push from `before` to `sha`. The checkout is shallow, so a
 * `before` more than one commit back is fetched; `git diff` needs only the two trees.
 *
 * Never throws: failing to decide is reported as not docs-only.
 *
 * @returns {{ docsOnly: boolean, reason: string }}
 */
export function classifyPush({ before, sha = 'HEAD', cwd = process.cwd() }) {
  // A new branch or a deleted one reports an all-zero `before`.
  if (!before || /^0+$/.test(before)) return { docsOnly: false, reason: 'push has no base commit' };
  // Only a hex id reaches git, so the value can never be read as an option.
  if (!/^[0-9a-f]{7,64}$/i.test(before)) return { docsOnly: false, reason: `base commit ${JSON.stringify(before)} is not a commit id` };
  try {
    git(['cat-file', '-e', `${before}^{commit}`], cwd);
  } catch {
    try {
      git(['fetch', '--quiet', '--no-tags', '--depth=1', 'origin', before], cwd);
    } catch {
      return { docsOnly: false, reason: `base commit ${before} is not reachable` };
    }
  }
  try {
    const files = changedFiles(before, sha, cwd);
    if (files.length > 0 && files.every(isForkDocsPath)) {
      return { docsOnly: true, reason: `${files.length} docs file(s) changed` };
    }
    const other = files.find((file) => !isForkDocsPath(file));
    // Quoted, as upstream does: a raw name could start a line with a `::` workflow command.
    return { docsOnly: false, reason: other ? `${JSON.stringify(other)} is not a docs file` : 'the diff is empty' };
  } catch (err) {
    return { docsOnly: false, reason: `could not read the diff: ${err.message.split('\n')[0]}` };
  }
}

/**
 * Dispatches on the event: a pull_request is upstream's merge-checkout case,
 * a push is a range, anything else has nothing to compare.
 *
 * @returns {{ docsOnly: boolean, reason: string }}
 */
export function classify(env = process.env, cwd = process.cwd()) {
  const event = env.GITHUB_EVENT_NAME;
  if (event === 'pull_request') return classifyCheckout(cwd);
  if (event === 'push') return classifyPush({ before: env.DOCS_ONLY_BEFORE, sha: env.GITHUB_SHA || 'HEAD', cwd });
  return { docsOnly: false, reason: `event ${event || '(none)'} has no change to classify` };
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node .github/scripts/docs-only-push.mjs\n\n'
      + 'Classifies a pull_request merge checkout, or a push from $DOCS_ONLY_BEFORE to $GITHUB_SHA.\n'
      + 'Prints why, and writes docs_only=true|false to $GITHUB_OUTPUT.');
    return;
  }
  const { docsOnly, reason } = classify();
  console.log(`docs_only=${docsOnly}: ${reason}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `docs_only=${docsOnly}\n`);
}

if (isMainModule(import.meta.url)) main();
