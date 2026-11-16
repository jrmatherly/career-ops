// tests/upskill-url-guard.test.mjs. --url-text refuses private targets before fetching.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { NODE, ROOT } from './helpers.mjs';

test('--url-text refuses an IPv4-mapped loopback URL with the shared guard', () => {
  const res = spawnSync(NODE, [join(ROOT, 'upskill.mjs'), '--url-text', 'http://[::ffff:7f00:1]:9/'], {
    cwd: ROOT, encoding: 'utf-8', timeout: 60000,
    env: { ...process.env, PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: join(ROOT, 'no-such-browser') },
  });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Fatal: Failed to fetch JD from URL: blocked host \[::ffff:7f00:1\]/);
  assert.equal(res.stdout.trim(), '');
});
