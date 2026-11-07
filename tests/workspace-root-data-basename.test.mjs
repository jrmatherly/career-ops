/**
 * A fresh data root whose basename is `data` stays its own workspace.
 * resolveWorkspaceRoot() strips a tracker directory named `data`, so the read
 * fallback for a root with no tracker must be data/applications.md, the same
 * path resolveTrackerPathForWrite() defaults to.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveTrackerPath, resolveTrackerPathForWrite } from '../path-resolver.mjs';
import { resolveWorkspaceRootFor } from '../tracker-utils.mjs';

function withRoot(body) {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'career-ops-data-basename-')));
  const root = join(parent, 'data');
  const oldTracker = process.env.CAREER_OPS_TRACKER;
  try {
    delete process.env.CAREER_OPS_TRACKER;
    mkdirSync(root);
    body(root);
  } finally {
    if (oldTracker === undefined) delete process.env.CAREER_OPS_TRACKER;
    else process.env.CAREER_OPS_TRACKER = oldTracker;
    rmSync(parent, { recursive: true, force: true });
  }
}

test('an empty root named data is its own workspace', () => {
  withRoot((root) => {
    assert.equal(resolveWorkspaceRootFor(root), root);
  });
});

test('read and write tracker paths agree on an empty root', () => {
  withRoot((root) => {
    assert.equal(resolveTrackerPath(root), resolveTrackerPathForWrite(root));
    assert.equal(resolveTrackerPath(root), join(root, 'data', 'applications.md'));
  });
});

test('a root with applications.md at the top keeps the root layout', () => {
  withRoot((root) => {
    writeFileSync(join(root, 'applications.md'), '# tracker\n');
    assert.equal(resolveTrackerPath(root), join(root, 'applications.md'));
    // Not asserted: the workspace. resolveWorkspaceRoot() reads a flat tracker
    // in a directory named `data` as the data/ layout, a tracker-utils limit
    // this fix leaves alone.
  });
});

test('a root with data/applications.md resolves to the root', () => {
  withRoot((root) => {
    mkdirSync(join(root, 'data'));
    writeFileSync(join(root, 'data', 'applications.md'), '# tracker\n');
    assert.equal(resolveTrackerPath(root), join(root, 'data', 'applications.md'));
    assert.equal(resolveWorkspaceRootFor(root), root);
  });
});
