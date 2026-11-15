// tests/jd-text-eightfold.test.mjs: the Eightfold JD text route and its liveness rung.
// Fictional tenant and posting; fetch is stubbed, so no request leaves the process.
import './helpers.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAtsApi, checkLivenessViaApi, isAtsPosting, JD_TEXT_API_ATS } from '../liveness-api.mjs';
import { fetchJdViaKnownApi } from '../browser-extract.mjs';
import { fetchJdText } from '../jd-years.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describeSpawn } from './helpers/describe-spawn.mjs';

const TEXT_ONLY = { textOnly: true };

const PID = '1970000000000001';
const BRANDED = `https://apply.careers.microsoft.com/careers?pid=${PID}&domain=microsoft.com`;
const BRANDED_V2 = `https://apply.careers.microsoft.com/api/apply/v2/jobs/${PID}?domain=microsoft.com`;
const BRANDED_PCSX = `https://apply.careers.microsoft.com/api/pcsx/position_details?position_id=${PID}&domain=microsoft.com&hl=en`;
const TENANT = 'https://exampleco.eightfold.ai/careers?pid=42&domain=exampleco.com';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const v2Job = (over = {}) => ({
  id: Number(PID),
  name: 'Fixture Solutions Architect',
  location: 'Exampletown, Exampleland',
  locations: ['Exampletown, Exampleland', 'Otherville, Exampleland'],
  job_description: '<b>Overview</b><br><p>V2_MARKER design fixture systems &amp; tools.</p><ul><li>Ship things</li></ul>',
  ...over,
});
const pcsxJob = (over = {}) => ({
  status: 200,
  data: { id: Number(PID), name: 'Fixture Solutions Architect', location: 'Exampletown', jobDescription: '<p>PCSX_MARKER fixture body.</p>', ...over },
});

async function withFetch(mock, run) {
  const previous = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await run(); } finally { globalThis.fetch = previous; }
}

test('Eightfold posting URLs resolve to the per-position v2 endpoint on the same host', () => {
  const branded = resolveAtsApi(BRANDED);
  assert.equal(branded.ats, 'eightfold');
  assert.equal(branded.apiUrl, BRANDED_V2);
  assert.equal(resolveAtsApi(`https://apply.careers.microsoft.com/careers/job/${PID}`).apiUrl,
    `https://apply.careers.microsoft.com/api/apply/v2/jobs/${PID}`);
  assert.equal(resolveAtsApi(TENANT).apiUrl, 'https://exampleco.eightfold.ai/api/apply/v2/jobs/42?domain=exampleco.com');
  assert.ok(JD_TEXT_API_ATS.has('eightfold'));
});

test('unknown branded hosts, lookalikes and non-posting pages do not resolve', () => {
  for (const url of [
    `https://careers.exampleco.com/careers?pid=${PID}&domain=exampleco.com`,
    `https://apply.careers.microsoft.com.evil.test/careers?pid=${PID}&domain=microsoft.com`,
    `https://exampleco.eightfold.ai.evil.test/careers?pid=42`,
    'https://exampleco.eightfold.ai/careers',
    'https://exampleco.eightfold.ai/careers?pid=abc',
    'https://exampleco.eightfold.ai/careers?pid=42&domain=../x',
    `http://apply.careers.microsoft.com/careers?pid=${PID}`,
  ]) {
    assert.equal(resolveAtsApi(url), null, url);
  }
});

test('the v2 description comes back as text with title and locations', async () => {
  const calls = [];
  const jd = await withFetch(async (url, opts) => {
    calls.push([String(url), opts.redirect]);
    return json(v2Job());
  }, () => fetchJdViaKnownApi(BRANDED, undefined, undefined, TEXT_ONLY));
  assert.equal(jd.ats, 'eightfold');
  assert.equal(jd.url, BRANDED);
  assert.equal(jd.title, 'Fixture Solutions Architect');
  assert.match(jd.text, /V2_MARKER design fixture systems & tools\./);
  assert.match(jd.text, /- Ship things/);
  assert.match(jd.text, /Otherville, Exampleland/);
  assert.doesNotMatch(jd.text, /<p>/);
  assert.deepEqual(calls, [[BRANDED_V2, 'error']]);
});

test('a v2 miss falls back to the PCSX position endpoint on the same host', async () => {
  const calls = [];
  const jd = await withFetch(async (url) => {
    calls.push(String(url));
    return String(url).includes('/api/pcsx/') ? json(pcsxJob()) : json({ message: 'Not authorized for PCSX' }, 403);
  }, () => fetchJdViaKnownApi(BRANDED, undefined, undefined, TEXT_ONLY));
  assert.match(jd.text, /PCSX_MARKER fixture body\./);
  assert.deepEqual(calls, [BRANDED_V2, BRANDED_PCSX]);
});

test('non-200s, another position and empty descriptions return null', async () => {
  for (const [v2, pcsx] of [
    [json({ message: 'Job with ID 1 not found' }, 404), json({ status: 404, error: { message: 'Position not found' }, data: {} }, 404)],
    [json({}, 500), json({}, 503)],
    [json(v2Job({ id: 7 })), json(pcsxJob({ id: 7 }))],
    [json(v2Job({ job_description: '' })), json(pcsxJob({ jobDescription: '   ' }))],
    [new Response('<html>blocked</html>', { status: 200 }), new Response('nope', { status: 200 })],
  ]) {
    const jd = await withFetch(async (url) => (String(url).includes('/api/pcsx/') ? pcsx : v2), () => fetchJdViaKnownApi(BRANDED, undefined, undefined, TEXT_ONLY));
    assert.equal(jd, null);
  }
});

test('the text cap is honoured', async () => {
  const long = `<p>${'fixture words '.repeat(2000)}</p>`;
  const jd = await withFetch(async () => json(v2Job({ job_description: long })), () => fetchJdViaKnownApi(BRANDED, 500, undefined, TEXT_ONLY));
  assert.ok(jd.text.length <= 501, `length ${jd.text.length}`);
});

test('liveness stays with the browser: no API request, no verdict', async () => {
  let sent = 0;
  const verdict = await withFetch(async () => { sent += 1; return json(v2Job()); }, () => checkLivenessViaApi(BRANDED));
  assert.equal(verdict, null);
  assert.equal(sent, 0);
  assert.equal(isAtsPosting(BRANDED), false);
});

test('a reader that did not ask for text-only boards gets nothing and sends nothing', async () => {
  let sent = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { sent += 1; return new Response('{}'); };
  try {
    assert.equal(await fetchJdViaKnownApi(BRANDED), null);
  } finally {
    globalThis.fetch = previous;
  }
  assert.equal(sent, 0);
});

test('the experience filter reads a text-only board', async () => {
  const text = await withFetch(async () => json(v2Job()), () => fetchJdText(BRANDED));
  assert.match(text, /V2_MARKER/);
});

test('fetch-jd.mjs prints a text-only board\'s text and exits 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fetch-jd-eightfold-'));
  try {
    const preload = join(dir, 'preload.mjs');
    writeFileSync(preload, `globalThis.fetch = async () => new Response(${JSON.stringify(JSON.stringify(v2Job()))});`);
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, fileURLToPath(new URL('../fetch-jd.mjs', import.meta.url)), BRANDED],
      { encoding: 'utf8', timeout: 20000 });
    assert.equal(result.status, 0, describeSpawn(result));
    assert.match(result.stdout, /V2_MARKER/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
