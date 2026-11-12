#!/usr/bin/env node
/**
 * tests/evaluate-queue.test.mjs — data/evaluate-queue.tsv: the ledger module and evaluate-queue.mjs.
 *
 * Run: node test-all.mjs --quick --only evaluate-queue
 */

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pass, fail, run, NODE, ROOT, rmSync } from './helpers.mjs';
import { appendRow, drainPlan, ledgerPath, readAutoPdfThreshold, readDailyCap, readLedger, startedToday } from '../lib/evaluate-queue.mjs';

console.log('\nevaluate-queue ledger — appendRow/readLedger/drainPlan and evaluate-queue.mjs');

const T0 = Date.parse('2026-11-08T12:00:00.000Z');
const at = (seconds) => new Date(T0 + seconds * 1000).toISOString();
const base = { jobId: 'job-1', runId: 'run-1', source: 'rank-pass' };
const tmp = mkdtempSync(join(tmpdir(), 'co-evaluate-queue-'));
const check = (ok, message, detail) => (ok ? pass(message) : fail(`${message}: ${detail}`));

try {
  const A = 'https://jobs.example.test/a/';
  await appendRow(tmp, { ...base, url: A, at: at(0), rank: 4.2, state: 'queued' });
  await appendRow(tmp, { ...base, url: 'https://JOBS.example.test/a?utm_source=feed', at: at(10), state: 'running', source: 'drain' });
  await appendRow(tmp, { ...base, url: A, at: at(20), state: 'evaluated', source: 'drain' });
  const lines = readFileSync(ledgerPath(tmp), 'utf-8').split('\n').filter(Boolean);
  check(lines[0] === 'url\tat\tjobId\trunId\trank\treason\tstate\tsource' && lines.filter((l) => l.startsWith('url\t')).length === 1,
    'the header is written once, on the first append', JSON.stringify(lines));

  let entries = readLedger(tmp, { now: T0 + 30_000 });
  check(entries.length === 1, 'two URL spellings group under one key', entries.length);
  check(entries[0].url === A, 'the first row\'s raw URL is returned', entries[0].url);
  check(entries[0].state === 'evaluated' && entries[0].rows.length === 3 && entries[0].rank === 4.2,
    'the last row wins and the full history stays', JSON.stringify(entries[0]));

  const B = 'https://jobs.example.test/b';
  await appendRow(tmp, { ...base, url: B, at: at(0), rank: 3.9, state: 'running', source: 'drain' });
  check(readLedger(tmp, { now: T0 + 859_000 }).find((e) => e.url === B).state === 'running', 'a running row 859 s old is still running', '');
  const stale = readLedger(tmp, { now: T0 + 860_000 }).find((e) => e.url === B);
  check(stale.state === 'failed' && stale.failures === 1 && !stale.final, 'a running row 860 s old reads as failed, once', JSON.stringify(stale));

  const deaths = mkdtempSync(join(tmpdir(), 'co-evaluate-queue-deaths-'));
  try {
    for (let i = 0; i < 3; i += 1) await appendRow(deaths, { ...base, url: B, at: at(i), state: 'running', source: 'drain' });
    const dead = readLedger(deaths, { now: T0 + 900_000 })[0];
    check(dead.failures === 3 && dead.final, 'every running row a later running row follows counts as a failure, so a drain that keeps dying ends final', JSON.stringify(dead));
    check(startedToday(readLedger(deaths), T0) === 3, 'the daily cap counts running rows, three for one URL started three times', '');
    const G = 'https://jobs.example.test/g';
    await appendRow(deaths, { ...base, url: G, at: at(0), state: 'running', source: 'drain' });
    await appendRow(deaths, { ...base, url: G, at: at(1), state: 'queued', reason: 'in-flight', source: 'drain' });
    check(readLedger(deaths, { now: T0 + 900_000 }).find((e) => e.url === G).failures === 0, 'a queued row soon after a running row spends no retry', '');
    await appendRow(deaths, { ...base, url: G, at: at(10), state: 'running', source: 'drain' });
    await appendRow(deaths, { ...base, url: G, at: at(900), state: 'queued', reason: 'dashboard-offline', source: 'drain' });
    const late = readLedger(deaths, { now: T0 + 1_000_000 }).find((e) => e.url === G);
    check(late.failures === 1 && late.state === 'queued', 'a row written after a running row went stale keeps the failure it charged', JSON.stringify(late));
    const H = 'https://jobs.example.test/h';
    await appendRow(deaths, { ...base, url: H, at: at(0), state: 'running', source: 'drain' });
    await appendRow(deaths, { ...base, url: H, at: at(870), state: 'failed', reason: 'slow error', source: 'drain' });
    check(readLedger(deaths, { now: T0 + 1_000_000 }).find((e) => e.url === H).failures === 1, 'a failed row that is a running row\'s late outcome counts once', '');
    const K = 'https://jobs.example.test/k';
    for (let i = 0; i < 3; i += 1) {
      await appendRow(deaths, { ...base, url: K, at: at(i * 1000), state: 'running', source: 'drain' });
      await appendRow(deaths, { ...base, url: K, at: at(i * 1000 + 900), state: 'queued', reason: 'dashboard-offline', source: 'drain' });
    }
    const spent = readLedger(deaths, { now: T0 + 5_000_000 }).find((e) => e.url === K);
    check(spent.final && spent.state === 'failed' && spent.reason === '3 failed attempts', 'three dead runs end the URL and it reads as failed, not queued', JSON.stringify({ ...spent, rows: undefined }));
    writeFileSync(ledgerPath(deaths), `${B}\t${at(0)}\tjob-1\trun-1\thigh\t\tqueued\trank-pass\n`, { flag: 'a' });
    const bad = [];
    readLedger(deaths, { skipped: bad });
    check(bad.length === 1, 'a rank cell that is not a number is reported, not read as NaN', JSON.stringify(bad));
    writeFileSync(ledgerPath(deaths), `${B}\tyesterday\tjob-1\trun-1\t\t\tqueued\trank-pass\n`, { flag: 'a' });
    const badAt = [];
    readLedger(deaths, { skipped: badAt });
    check(badAt.length === 2, 'an `at` that is not a timestamp is reported, not read as outlived', JSON.stringify(badAt));
  } finally {
    rmSync(deaths, { recursive: true, force: true });
  }

  const C = 'https://jobs.example.test/c';
  await appendRow(tmp, { ...base, url: C, at: at(0), rank: 4.8, state: 'queued' });
  for (let i = 1; i <= 2; i += 1) await appendRow(tmp, { ...base, url: C, at: at(i), state: 'failed', reason: 'boom', source: 'drain' });
  check(!readLedger(tmp, { now: T0 }).find((e) => e.url === C).final, 'two failed rows are not final', '');
  await appendRow(tmp, { ...base, url: C, at: at(3), state: 'failed', reason: 'boom', source: 'drain' });
  check(readLedger(tmp, { now: T0 }).find((e) => e.url === C).final, 'the third failed row is final', '');

  const D = 'https://jobs.example.test/d';
  await appendRow(tmp, { ...base, url: D, at: at(0), rank: 3.5, reason: '=HYPERLINK("x")', state: 'queued' });
  const stored = readFileSync(ledgerPath(tmp), 'utf-8').split('\n').find((line) => line.startsWith(D));
  check(stored.split('\t')[5] === `'=HYPERLINK("x")`, 'a reason starting with = is stored behind a quote', stored);
  check(readLedger(tmp, { now: T0 }).find((e) => e.url === D).reason === '=HYPERLINK("x")', 'and reads back as written', '');
  await appendRow(tmp, { ...base, url: 'https://jobs.example.test/e', at: at(0), rank: 4, reason: 'tab\there\nnewline', state: 'queued' });
  check(readLedger(tmp, { now: T0 }).find((e) => e.url.endsWith('/e')).reason === 'tab here newline', 'tabs and newlines in a cell collapse to a space', '');

  // A is evaluated, B is stale (failed once), C is final, D and E are queued.
  // Two URLs (A, B) started today, so a cap of 3 leaves room for one.
  const now = T0 + 900_000;
  check(JSON.stringify(drainPlan(tmp, { dailyCap: 10, now }).map((e) => e.url)) === JSON.stringify([D.replace('/d', '/e'), B, D]),
    'the plan holds queued and retryable rows, best rank first', JSON.stringify(drainPlan(tmp, { dailyCap: 10, now }).map((e) => e.url)));
  check(drainPlan(tmp, { dailyCap: 3, now }).length === 1, 'the daily cap counts every running row dated today, whatever followed', JSON.stringify(drainPlan(tmp, { dailyCap: 3, now }).map((e) => e.url)));
  check(drainPlan(tmp, { dailyCap: 10, now: T0 + 86_400_000 }).length === 3, 'yesterday\'s running rows do not count against today\'s cap', '');
  check(JSON.stringify(drainPlan(tmp, { dailyCap: 10, rankThreshold: 3.95, now }).map((e) => e.url)) === JSON.stringify(['https://jobs.example.test/e']),
    'the plan drops rows below the job\'s current threshold', '');
  check(drainPlan(tmp, { dailyCap: 10, maxPerRun: 2, now }).length === 2, 'the plan stops at maxPerRun', '');
  check(drainPlan(tmp, { jobId: 'job-2', dailyCap: 10, now }).length === 0, 'the plan holds only the named job\'s rows', '');

  writeFileSync(join(tmp, 'data', 'evaluate-queue.tsv'), 'garbage line\n', { flag: 'a' });
  const skipped = [];
  readLedger(tmp, { skipped });
  check(skipped.length === 1 && skipped[0].raw === 'garbage line', 'a malformed row is reported, not dropped in silence', JSON.stringify(skipped));

  let threw = '';
  try { await appendRow(tmp, { ...base, url: A, state: 'done' }); } catch (error) { threw = error.message; }
  check(/Unknown ledger state "done"/.test(threw), 'an unknown state is refused', threw);
  threw = '';
  try { await appendRow(tmp, { ...base, url: 'not a url', state: 'queued' }); } catch (error) { threw = error.message; }
  check(/Not a posting URL/.test(threw), 'a value that is not a URL is refused', threw);

  mkdirSync(join(tmp, 'config'), { recursive: true });
  const profile = join(tmp, 'config', 'profile.yml');
  check(readDailyCap(join(tmp, 'config', 'missing.yml')) === 10, 'the daily cap defaults to 10 with no profile', '');
  writeFileSync(profile, 'pipeline:\n  auto_evaluate_daily_cap: 2\n');
  check(readDailyCap(profile) === 2, 'the daily cap reads pipeline.auto_evaluate_daily_cap', '');
  writeFileSync(profile, 'pipeline:\n  auto_evaluate_daily_cap: lots\n');
  const write = process.stderr.write;
  const warned = [];
  process.stderr.write = (chunk) => { warned.push(String(chunk)); return true; };
  let fellBack;
  try { fellBack = readDailyCap(profile); } finally { process.stderr.write = write; }
  check(fellBack === 10 && /auto_evaluate_daily_cap is "lots", not a whole number of 0 or more; using 10/.test(warned.join('')),
    'a non-integer cap falls back to 10 and says so on stderr', warned.join(''));
  writeFileSync(profile, 'pipeline:\n  triage_threshold: 3.5\n');
  warned.length = 0;
  process.stderr.write = (chunk) => { warned.push(String(chunk)); return true; };
  try { readDailyCap(profile); } finally { process.stderr.write = write; }
  check(warned.length === 0, 'a missing cap key falls back in silence', warned.join(''));

  check(readAutoPdfThreshold(join(tmp, 'config', 'missing.yml')) === 3, 'the automatic CV score defaults to 3 with no profile', '');
  check(readAutoPdfThreshold(profile) === 3, 'the automatic CV score defaults to 3 with no key', '');
  writeFileSync(profile, 'auto_pdf_score_threshold: 4\n');
  check(readAutoPdfThreshold(profile) === 4, 'the automatic CV score reads auto_pdf_score_threshold', '');
  writeFileSync(profile, 'auto_pdf_score_threshold: "high"\n');
  warned.length = 0;
  process.stderr.write = (chunk) => { warned.push(String(chunk)); return true; };
  try { fellBack = readAutoPdfThreshold(profile); } finally { process.stderr.write = write; }
  check(fellBack === 3 && /auto_pdf_score_threshold is "high", not a number from 0 to 5; using 3/.test(warned.join('')),
    'a score that is not a number falls back to 3 and says so on stderr', warned.join(''));

  const opts = { stdio: 'pipe', env: { ...process.env, CAREER_OPS_ROOT: tmp, CAREER_OPS_PROFILE: '' } };
  const cli = (...args) => run(NODE, [join(ROOT, 'evaluate-queue.mjs'), ...args], opts);
  const dump = JSON.parse(cli('dump', '--json'));
  check(Array.isArray(dump) && dump.find((e) => e.url === A)?.state === 'evaluated', 'dump --json prints the folded ledger', '');
  cli('add', '--url', 'https://jobs.example.test/f', '--state', 'queued', '--job', 'job-1', '--run', 'run-2', '--rank', '4.9');
  check(readLedger(tmp).find((e) => e.url.endsWith('/f'))?.runId === 'run-2', 'add appends a row', '');
  const plan = JSON.parse(cli('drain-plan', '--json', '--max', '1'));
  check(JSON.stringify(plan) === JSON.stringify(['https://jobs.example.test/f']), 'drain-plan --json prints the plan with the profile\'s cap', JSON.stringify(plan));
  check(cli('add', '--url', A, '--state', 'queued', '--job', 'j', '--run', 'r', '--rank', 'high') === null, 'add refuses a rank that is not a number', '');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
