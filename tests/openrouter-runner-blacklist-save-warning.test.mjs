// tests/openrouter-runner-blacklist-save-warning.test.mjs: a failed save of the model blacklist prints a warning.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const MODEL_A = 'google/model-a:free';
const MODEL_B = 'qwen/model-b:free';

/** A scripted fetch: `script[model]` is the queue of statuses that model returns. */
function scriptedFetch(models, script) {
  const queues = Object.fromEntries(Object.entries(script).map(([m, q]) => [m, [...q]]));
  return async (url, init) => {
    if (String(url).endsWith('/models')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: models.map((id) => ({ id, pricing: { prompt: '0', completion: '0' } })),
        }),
      };
    }
    const { model } = JSON.parse(init.body);
    const status = queues[model]?.shift() ?? 200;
    if (status !== 200) {
      return { ok: false, status, text: async () => (status === 429 ? 'rate limited' : 'server error') };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: `answer from ${model}` } }], usage: {} }),
    };
  };
}

/**
 * Import a fresh copy of the runner with the data root and the OpenRouter env
 * pointed at a throwaway directory. The blacklist path is resolved at import
 * time, so the environment has to be in place first; the query string keeps each
 * call on its own module instance (own rotation index, counters and model list).
 */
async function loadRunner(dataRoot, label) {
  const names = ['CAREER_OPS_ROOT', 'CAREER_OPS_DATA_DIR', 'CAREER_OPS_MODEL', 'OPENROUTER_API_KEY'];
  const previous = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  process.env.CAREER_OPS_ROOT = dataRoot;
  delete process.env.CAREER_OPS_DATA_DIR;
  delete process.env.CAREER_OPS_MODEL;
  process.env.OPENROUTER_API_KEY = 'test-key';
  try {
    const url = `${pathToFileURL(join(ROOT, 'openrouter-runner.mjs')).href}?blacklist-save=${label}`;
    return await import(url);
  } finally {
    for (const n of names) {
      if (previous[n] === undefined) delete process.env[n];
      else process.env[n] = previous[n];
    }
  }
}

/** Call the runner once; return the error message, or null when it answered. */
async function callOnce(runner) {
  try {
    await runner.callOpenRouter('system', 'user');
    return null;
  } catch (e) {
    return e.message;
  }
}

async function withRunner(label, models, script, body) {
  const dataRoot = mkdtempSync(join(tmpdir(), 'career-ops-429-'));
  const realFetch = globalThis.fetch;
  const realKey = process.env.OPENROUTER_API_KEY;
  try {
    const runner = await loadRunner(dataRoot, label);
    globalThis.fetch = scriptedFetch(models, script);
    process.env.OPENROUTER_API_KEY = 'test-key';
    await body(runner, join(dataRoot, 'data', 'model-blacklist.json'));
  } finally {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = realKey;
    rmSync(dataRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

test('a blacklist that cannot be saved is reported', async () => {
  await withRunner('save-fails', [MODEL_A, MODEL_B], { [MODEL_A]: [403] }, async (runner, file) => {
    // A directory where the file should be, so the save throws EISDIR.
    mkdirSync(file, { recursive: true });
    const warnings = [];
    const realWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      assert.equal(await callOnce(runner), null, 'model B should answer');
    } finally { console.warn = realWarn; }
    assert.ok(runner.blacklistedModels.has(MODEL_A));
    assert.ok(warnings.some((w) => /Could not save the model blacklist to .*model-blacklist\.json: /.test(w)),
      `expected a blacklist-save warning, got ${JSON.stringify(warnings)}`);
  });
});
