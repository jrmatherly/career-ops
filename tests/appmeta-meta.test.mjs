#!/usr/bin/env node
/**
 * tests/appmeta-meta.test.mjs — data/application-meta.tsv reader/writer and app-meta.mjs CLI.
 *
 * Run: node test-all.mjs --only appmeta-meta
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pass, fail, run, NODE, ROOT, rmSync } from './helpers.mjs';
import { readMeta, setMeta, META_KEYS } from '../lib/application-meta.mjs';
import { parseStatusLog } from '../funnel-velocity.mjs';
import { loadCanonicalStates } from '../tracker-utils.mjs';

console.log('\napplication-meta sidecar — readMeta/setMeta and app-meta.mjs');

const TRACKER = [
  '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
  '|---|---|---|---|---|---|---|---|---|',
  '| 3 | 2026-10-01 | Acme Corp | Backend Engineer | 4.2/5 | Interview | ❌ | — | — |',
  '| 5 | 2026-10-02 | Globex | Platform Engineer | 4.0/5 | Applied | ❌ | — | — |',
  '| 6 | 2026-10-03 | Initech | Data Engineer | 3.9/5 | Applied | ❌ | — | — |',
  '| 12 | 2026-10-05 | Northwind Traders | SRE | 4.1/5 | Applied | ❌ | — | — |',
  '',
].join('\n');
function withTracker(root) {
  mkdirSync(join(root, 'data'), { recursive: true });
  writeFileSync(join(root, 'data', 'applications.md'), TRACKER);
  return root;
}

const tmp = mkdtempSync(join(tmpdir(), 'co-appmeta-'));
const opts = { stdio: 'pipe', env: { ...process.env, CAREER_OPS_ROOT: tmp } };
const cli = (...args) => run(NODE, [join(ROOT, 'app-meta.mjs'), ...args], opts);

try {
  await setMeta(tmp, 12, 'lane', 'Applied');
  await setMeta(tmp, 12, 'lane', 'Phone screen', 'web', '2026-11-01');
  await setMeta(tmp, 12, 'tag', 'remote');
  await setMeta(tmp, 12, 'tag', 'ai');
  await setMeta(tmp, 12, 'tag', 'remote');
  const content = readFileSync(join(tmp, 'data', 'application-meta.tsv'), 'utf-8');
  if (content.split('\n').filter(Boolean).length === 5 && content.endsWith('\n')) pass('one terminated row per set');
  else fail(`file: ${JSON.stringify(content)}`);

  const meta = readMeta(tmp).get(12);
  if (meta?.lane?.value === 'Phone screen' && meta.lane.source === 'web' && meta.lane.date === '2026-11-01') pass('last lane row wins with its date and source');
  else fail(`lane fold wrong: ${JSON.stringify(meta?.lane)}`);
  if (JSON.stringify(meta?.tag?.value) === '["remote","ai"]') pass('tag collects distinct values in order');
  else fail(`tag fold wrong: ${JSON.stringify(meta?.tag)}`);

  let threw = false;
  try { await setMeta(tmp, 12, 'colour', 'red'); } catch { threw = true; }
  if (threw) pass('unknown key throws'); else fail('unknown key accepted');
  threw = false;
  try { await setMeta(tmp, 'x', 'lane', 'a'); } catch { threw = true; }
  if (threw) pass('non-integer num throws'); else fail('non-integer num accepted');

  const row = await setMeta(tmp, 7, 'closed_reason', 'tab\there\nnewline');
  if (row.split('\t').length === 5 && row.includes('tab here newline')) pass('tabs and newlines are stripped from cells');
  else fail(`cell not sanitized: ${JSON.stringify(row)}`);

  const cliRoot = withTracker(mkdtempSync(join(tmpdir(), 'co-appmeta-cli-')));
  const cliOpts = { stdio: 'pipe', env: { ...process.env, CAREER_OPS_ROOT: cliRoot } };
  const c = (...args) => run(NODE, [join(ROOT, 'app-meta.mjs'), ...args], cliOpts);
  const setOut = c('set', '12', 'lane', 'Phone screen', '--source', 'cli');
  if (setOut && /^12\t\d{4}-\d{2}-\d{2}\tlane\tPhone screen\tcli$/.test(setOut)) pass('set prints the row written');
  else fail(`set output: ${JSON.stringify(setOut)}`);
  c('set', '12', 'tag', 'remote');
  c('set', '12', 'tag', 'ai');
  const getOut = c('get', '12');
  if (getOut === 'lane=Phone screen tag=remote,ai closed_reason= source= closed_at=') pass('get prints every key in order');
  else fail(`get output: ${JSON.stringify(getOut)}`);
  const dump = JSON.parse(c('dump', '--json') || '{}');
  if (dump['12']?.lane?.value === 'Phone screen' && dump['12'].tag.value.length === 2) pass('dump --json round-trips');
  else fail(`dump output: ${JSON.stringify(dump)}`);
  if (c('set', '12', 'bogus', 'x') === null) pass('set with an unknown key exits non-zero');
  else fail('set with an unknown key succeeded');
  if (c('set', '99', 'lane', 'x') === null) pass('set for a number with no tracker row exits non-zero');
  else fail('set for a missing tracker row succeeded');
  threw = false;
  try { await setMeta(cliRoot, 12, 'lane', '  '); } catch { threw = true; }
  if (threw) pass('empty value throws instead of overriding the lane'); else fail('empty value accepted');
  threw = false;
  try { await setMeta(cliRoot, 12, 'closed_at', 'soon'); } catch { threw = true; }
  if (threw) pass('closed_at that is not a date throws'); else fail('bad closed_at accepted');
  writeFileSync(join(cliRoot, 'data', 'application-meta.tsv'), `${readFileSync(join(cliRoot, 'data', 'application-meta.tsv'), 'utf-8')}12\t2026-11-01\tlane\n12\t2026-11-01\tcolour\tred\tmanual\n`);
  const skipped = [];
  readMeta(cliRoot, skipped);
  if (skipped.length === 2) pass('a short row and an unknown-key row are reported, not dropped in silence');
  else fail(`skipped: ${JSON.stringify(skipped)}`);
  rmSync(cliRoot, { recursive: true, force: true });
  if (cli('get') === null) pass('get without a num exits non-zero');
  else fail('get without a num succeeded');

  const N = 10_000;
  const perfRoot = mkdtempSync(join(tmpdir(), 'co-appmeta-perf-'));
  mkdirSync(join(perfRoot, 'data'));
  const metaLines = ['# a comment line is skipped'];
  const logLines = [];
  for (let i = 0; i < N; i++) {
    const num = (i % 500) + 1;
    metaLines.push(`${num}\t2026-10-01\t${META_KEYS[i % META_KEYS.length]}\tvalue ${i % 37}\tmanual`);
    logLines.push(`${num}\t2026-10-01\tEvaluated\tApplied\tset-status\tnote ${i}`);
  }
  writeFileSync(join(perfRoot, 'data', 'application-meta.tsv'), `${metaLines.join('\n')}\n`);
  const logContent = `${logLines.join('\n')}\n`;
  const states = loadCanonicalStates(join(ROOT, 'templates', 'states.yml'));
  const best = (fn) => {
    let min = Infinity;
    for (let i = 0; i < 5; i++) { const t = performance.now(); fn(); min = Math.min(min, performance.now() - t); }
    return min;
  };
  const metaMs = best(() => readMeta(perfRoot));
  const baseMs = best(() => parseStatusLog(logContent, states));
  rmSync(perfRoot, { recursive: true, force: true });
  const msg = `readMeta ${metaMs.toFixed(1)}ms vs parseStatusLog ${baseMs.toFixed(1)}ms on ${N} rows`;
  if (metaMs <= Math.max(2 * baseMs, 50) && metaMs < 500) pass(msg); else fail(msg);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
