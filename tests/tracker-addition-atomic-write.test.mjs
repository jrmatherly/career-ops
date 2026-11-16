// tests/tracker-addition-atomic-write.test.mjs: gemini-eval never leaves a half-written tracker addition.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const sandboxes = [];
after(() => { for (const d of sandboxes) rmSync(d, { recursive: true, force: true, maxRetries: 10 }); });

const MARKER = 'JD-MARKER-7f3a9c: build the pricing dashboards behind every weekly grocery promotion.';
const REPLY = ['A) Role summary', 'B) CV match', 'C) Level', 'D) Comp', 'E) Personalization', 'F) Interview', 'G) Legitimacy']
  .map((h) => `## ${h}\nNotes.\n`).join('\n')
  + '\n---SCORE_SUMMARY---\nCOMPANY: Marrowfield Grocers\nROLE: Senior Data Analyst\nSCORE: 4.3\nARCHETYPE: Data Analyst\nLEGITIMACY: High Confidence\n---END_SUMMARY---\n';

const failPreload = `
const fs = require('node:fs'); const path = require('node:path'); const write = fs.writeFileSync;
fs.writeFileSync = (file, content, options) => {
  if (typeof file === 'string' && /tracker-additions$/.test(path.dirname(file)) && /^\\d.*\\.tsv$/.test(path.basename(file))) {
    write(file, String(content).slice(0, 19), options);
    throw Object.assign(new Error('injected disk full'), { code: 'ENOSPC' });
  }
  return write(file, content, options);
};
require('node:module').syncBuiltinESMExports();`;

test('gemini-eval never leaves a half-written tracker addition', () => {
  const dir = mkdtempSync(join(tmpdir(), 'co-gemini-atomic-'));
  sandboxes.push(dir);
  mkdirSync(join(dir, 'config'), { recursive: true });
  mkdirSync(join(dir, 'modes'), { recursive: true });
  mkdirSync(join(dir, 'data'));
  writeFileSync(join(dir, 'cv.md'), '# Test Candidate\n\n## Experience\n');
  writeFileSync(join(dir, 'config', 'profile.yml'), 'candidate:\n  full_name: Test Candidate\n');
  writeFileSync(join(dir, 'modes', '_profile.md'), '# Profile\n');
  writeFileSync(join(dir, 'jd.txt'), `Senior Data Analyst at Marrowfield Grocers.\n\n${MARKER}\n`);
  const hook = join(dir, 'gemini-fetch.mjs');
  writeFileSync(hook, `
import { writeFileSync } from 'node:fs';
globalThis.fetch = async (url, init) => {
  if (String(url).includes(':countTokens')) return Response.json({ totalTokens: 1 });
  writeFileSync(process.env.CAPTURE, String(init?.body ?? ''));
  return Response.json({
    candidates: [{ index: 0, finishReason: 'STOP', content: { role: 'model', parts: [{ text: process.env.MODEL_REPLY }] } }],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
  });
};
`);
  writeFileSync(join(dir, 'fail.cjs'), failPreload);
  const r = spawnSync(process.execPath, ['--require', join(dir, 'fail.cjs'), '--import', pathToFileURL(hook).href,
    join(ROOT, 'gemini-eval.mjs'), '--file', join(dir, 'jd.txt')], { cwd: dir, encoding: 'utf-8', timeout: 60_000,
    env: { PATH: process.env.PATH, HOME: dir, CAREER_OPS_ROOT: dir, GEMINI_API_KEY: 'test-key-not-real', MODEL_REPLY: REPLY, CAPTURE: join(dir, 'req.json') } });
  const adds = join(dir, 'batch', 'tracker-additions');
  const tsvs = readdirSync(adds).filter((f) => /^\d.*\.tsv$/.test(f));
  assert.equal(tsvs.length, 1, `${r.stdout}${r.stderr}`.slice(-800));
  const text = readFileSync(join(adds, tsvs[0]), 'utf-8');
  assert.ok(text.endsWith('\n') && text.split('\n').length === 3, `partial addition on disk: ${JSON.stringify(text)}`);
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`.slice(-800));
});
