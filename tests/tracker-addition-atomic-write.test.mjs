// tests/tracker-addition-atomic-write.test.mjs: gemini-eval, ollama-eval and openai-eval never leave a half-written tracker addition.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

// One stand-in fetch answers all three APIs: Gemini's generateContent, Ollama's
// streamed /api/chat (after its /api/tags probe), and an OpenAI-compatible
// streamed /chat/completions.
const FETCH_HOOK = `
globalThis.fetch = async (url) => {
  const u = String(url);
  const reply = process.env.MODEL_REPLY;
  if (u.includes(':countTokens')) return Response.json({ totalTokens: 1 });
  if (u.endsWith('/api/tags')) return Response.json({ models: [] });
  if (u.endsWith('/api/chat')) {
    return new Response([{ message: { role: 'assistant', content: reply }, done: false }, { message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop', prompt_eval_count: 1, eval_count: 1 }]
      .map((c) => JSON.stringify(c)).join('\\n') + '\\n');
  }
  if (u.endsWith('/chat/completions')) {
    return new Response([{ choices: [{ delta: { content: reply } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }]
      .map((c) => 'data: ' + JSON.stringify(c) + '\\n\\n').join('') + 'data: [DONE]\\n\\n');
  }
  return Response.json({
    candidates: [{ index: 0, finishReason: 'STOP', content: { role: 'model', parts: [{ text: reply }] } }],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
  });
};
`;

const EVALUATORS = {
  'gemini-eval.mjs': { args: [], env: { GEMINI_API_KEY: 'test-key-not-real' } },
  'ollama-eval.mjs': { args: ['--url', 'http://127.0.0.1:11434', '--model', 'synthetic-test'], env: { OLLAMA_TIMEOUT_MS: '10000' } },
  'openai-eval.mjs': { args: ['--url', 'https://api.openai.com/v1', '--model', 'gpt-4o-mini'], env: { OPENAI_API_KEY: 'test-key-not-real' } },
};

for (const [script, { args, env }] of Object.entries(EVALUATORS)) {
  test(`${script} never leaves a half-written tracker addition`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'co-eval-atomic-'));
    sandboxes.push(dir);
    mkdirSync(join(dir, 'config'), { recursive: true });
    mkdirSync(join(dir, 'modes'), { recursive: true });
    mkdirSync(join(dir, 'data'));
    writeFileSync(join(dir, 'cv.md'), '# Test Candidate\n\n## Experience\n');
    writeFileSync(join(dir, 'config', 'profile.yml'), 'candidate:\n  full_name: Test Candidate\n');
    writeFileSync(join(dir, 'modes', '_profile.md'), '# Profile\n');
    writeFileSync(join(dir, 'jd.txt'), `Senior Data Analyst at Marrowfield Grocers.\n\n${MARKER}\n`);
    const hook = join(dir, 'fetch.mjs');
    writeFileSync(hook, FETCH_HOOK);
    writeFileSync(join(dir, 'fail.cjs'), failPreload);
    const r = spawnSync(process.execPath, ['--require', join(dir, 'fail.cjs'), '--import', pathToFileURL(hook).href,
      join(ROOT, script), ...args, '--file', join(dir, 'jd.txt')], { cwd: dir, encoding: 'utf-8', timeout: 60_000,
      env: { PATH: process.env.PATH, HOME: dir, CAREER_OPS_ROOT: dir, DOTENV_CONFIG_QUIET: 'true', MODEL_REPLY: REPLY, ...env } });
    const adds = join(dir, 'batch', 'tracker-additions');
    const tsvs = existsSync(adds) ? readdirSync(adds).filter((f) => /^\d.*\.tsv$/.test(f)) : [];
    assert.equal(tsvs.length, 1, `${r.stdout}${r.stderr}`.slice(-800));
    const text = readFileSync(join(adds, tsvs[0]), 'utf-8');
    assert.ok(text.endsWith('\n') && text.split('\n').length === 3, `partial addition on disk: ${JSON.stringify(text)}`);
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`.slice(-800));
  });
}
