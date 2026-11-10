// tests/settings-env.test.mjs — the overlay that puts saved settings onto process.env.
import { pass, fail, NODE, ROOT } from './helpers.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

console.log('\nsettings-env.mjs: saved settings over the environment');

const deepEqual = (a, b, label) => {
  if (isDeepStrictEqual(a, b)) pass(label);
  else fail(`${label}\n      expected ${JSON.stringify(b)}\n      got      ${JSON.stringify(a)}`);
};

const roots = [];
/** A temp data root; `saved` is the values object, or raw text for a malformed file, or undefined for none. */
function dataRoot(saved) {
  const root = mkdtempSync(join(tmpdir(), 'settings-env-'));
  roots.push(root);
  if (saved !== undefined) {
    mkdirSync(join(root, 'config'));
    writeFileSync(join(root, 'config', 'settings.json'), typeof saved === 'string' ? saved : JSON.stringify({ version: 1, values: saved }));
  }
  return root;
}

// The harness turns saved settings off, so each case opts back in unless it says otherwise.
function child(root, script, env = {}) {
  const r = spawnSync(NODE, ['--input-type=module', '-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, CAREER_OPS_ROOT: root, CAREER_OPS_SETTINGS: '', CAREER_OPS_SCAN_CONCURRENCY: '9', ...env },
  });
  const lines = (s) => s.split('\n').filter(Boolean);
  return { status: r.status, out: lines(r.stdout), err: lines(r.stderr) };
}

const PRINT = "await import('./lib/settings-env.mjs'); console.log(process.env.CAREER_OPS_SCAN_CONCURRENCY);";
const four = { CAREER_OPS_SCAN_CONCURRENCY: 4 };

try {
  deepEqual(child(dataRoot(four), PRINT), { status: 0, out: ['4'], err: [] }, 'a saved value beats the environment');
  deepEqual(child(dataRoot(four), PRINT, { CAREER_OPS_SETTINGS: 'off' }), { status: 0, out: ['9'], err: [] }, 'CAREER_OPS_SETTINGS=off gives the environment back');
  deepEqual(child(dataRoot(), PRINT), { status: 0, out: ['9'], err: [] }, 'nothing saved leaves the environment alone, silently');

  const malformed = child(dataRoot('{not json'), PRINT);
  deepEqual([malformed.status, malformed.out, malformed.err.length], [0, ['9'], 1], 'a malformed file applies nothing and says so once');
  deepEqual(malformed.err[0]?.startsWith('settings: config/settings.json ') && malformed.err[0].endsWith('; saved settings are not applied'), true, `the malformed-file line names the file: ${malformed.err[0]}`);

  const mixed = child(dataRoot({ CAREER_OPS_SCAN_CONCURRENCY: 0, CAREER_OPS_HTTP_TIMEOUT_MS: 20000 }),
    `${PRINT} console.log(process.env.CAREER_OPS_HTTP_TIMEOUT_MS);`);
  deepEqual([mixed.status, mixed.out], [0, ['9', '20000']], 'one bad value is skipped and the rest apply');
  deepEqual(mixed.err, ['settings: CAREER_OPS_SCAN_CONCURRENCY must be a whole number from 1 to 50; using the environment value'], 'the skipped id is named once');

  const quoted = child(dataRoot(JSON.parse('{"BAD\\u001b[31m":1}')), PRINT);
  deepEqual(quoted.err.length === 1 && !quoted.err[0].includes('\u001b'), true, `an unknown id is quoted before it is printed: ${JSON.stringify(quoted.err)}`);

  const scan = spawnSync(NODE, ['scan.mjs', '--help'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CAREER_OPS_ROOT: dataRoot('{not json'), CAREER_OPS_SETTINGS: '' } });
  deepEqual([scan.status, scan.stderr.split('\n').filter((l) => l.startsWith('settings: ')).length], [0, 1], 'a scan still starts on a malformed file and says so once');

  const unsafe = child(join(homedir(), '.claude', 'plugins', 'cache', 'x', 'y'), PRINT);
  deepEqual(unsafe, { status: 0, out: ['9'], err: [] }, 'a data root the resolver refuses applies nothing, silently');

  const dns = child(dataRoot({ CAREER_OPS_DNS_LOOKUPS_PER_MIN: 123 }),
    "await import('./providers/_dns-cache.mjs'); console.log(process.env.CAREER_OPS_DNS_LOOKUPS_PER_MIN);");
  deepEqual([dns.status, dns.out], [0, ['123']], 'a reader that reads at load has the overlay in its import graph');

  const root = dataRoot(four);
  const direct = child(root, `
    const { applySettings } = await import('./lib/settings-env.mjs');
    const fresh = {};
    console.log(JSON.stringify([applySettings(fresh, ${JSON.stringify(root)}), fresh, process.env.CAREER_OPS_SCAN_CONCURRENCY]));
  `, { CAREER_OPS_SETTINGS: 'off' });
  deepEqual(JSON.parse(direct.out[0] ?? 'null'), [{ applied: ['CAREER_OPS_SCAN_CONCURRENCY'], skipped: [] }, { CAREER_OPS_SCAN_CONCURRENCY: '4' }, '9'],
    'applySettings writes onto the env it is given and nothing else');

  const inherited = spawnSync(NODE, ['--input-type=module', '-e', PRINT], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, CAREER_OPS_ROOT: dataRoot(four), CAREER_OPS_SCAN_CONCURRENCY: '9' },
  });
  deepEqual(inherited.stdout.trim(), '9', 'the test harness turns saved settings off for every child it starts');
} finally {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
}
