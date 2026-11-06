// plugins/h1b-sponsor keeps its index and lookup cache under the DATA root,
// like every other plugin's user-layer files, not under the code checkout. In
// a Claude Code plugin install the checkout is replaced on every update, which
// silently deleted an installed index anchored there.
import { pass, fail, ROOT, NODE, rmSync } from './helpers.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

console.log('\nh1b-sponsor: index and cache resolve under the data root');

const dataRoot = realpathSync(mkdtempSync(join(tmpdir(), 'h1b-data-root-')));
const probe = `
  const { indexPath } = await import(${JSON.stringify(join(ROOT, 'plugins/h1b-sponsor/lib/index.mjs'))});
  const { writeCache } = await import(${JSON.stringify(join(ROOT, 'plugins/h1b-sponsor/lib/cache.mjs'))});
  const entry = await writeCache('Acme Corp', { tier: 'none' });
  console.log(JSON.stringify({ index: indexPath(), cache: entry.path ?? null }));
`;
const env = { ...process.env, CAREER_OPS_ROOT: dataRoot };
delete env.CAREER_OPS_DATA_DIR;
delete env.H1B_INDEX_PATH;
const run = spawnSync(NODE, ['--input-type=module', '-e', probe], { cwd: ROOT, env, encoding: 'utf8' });

if (run.status !== 0) {
  fail(`probe exited ${run.status}\n${run.stderr}`);
} else {
  const out = JSON.parse(run.stdout.trim().split('\n').pop());
  if (out.index === join(dataRoot, 'data', 'h1b', 'index.ndjson.gz')) pass('indexPath() is {dataRoot}/data/h1b/index.ndjson.gz');
  else fail(`indexPath() ignores CAREER_OPS_ROOT: ${out.index}`);
  const { existsSync, readdirSync } = await import('node:fs');
  const cacheDir = join(dataRoot, 'data', 'cache', 'h1b');
  if (existsSync(cacheDir) && readdirSync(cacheDir).some((f) => f.endsWith('.json'))) pass('writeCache() writes under {dataRoot}/data/cache/h1b/');
  else fail(`writeCache() ignores CAREER_OPS_ROOT; nothing under ${cacheDir}`);
  const stray = join(ROOT, 'data', 'cache', 'h1b');
  if (!existsSync(stray) || !readdirSync(stray).some((f) => f.startsWith('acme-corp-'))) pass('no cache entry landed in the checkout');
  else fail(`a cache entry for the probe landed in the checkout at ${stray}`);
}

rmSync(dataRoot, { recursive: true, force: true });
