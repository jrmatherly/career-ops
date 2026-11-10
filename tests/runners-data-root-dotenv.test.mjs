// tests/runners-data-root-dotenv.test.mjs — the model runners read <data root>/.env,
// the file the Settings page reads, not a .env in the working directory.
//
// Each runner starts from an unrelated cwd with CAREER_OPS_ROOT pointing at a temp
// data root whose .env sets the model values. fetch is replaced by a stub loaded
// with --import, so the first model request is printed instead of sent.
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { pass, fail, NODE, ROOT } from './helpers.mjs';

console.log('\nModel runners read the data root .env');

const base = mkdtempSync(join(tmpdir(), 'runners-dotenv-'));
const dataRoot = join(base, 'data');
const cwd = join(base, 'cwd');
mkdirSync(dataRoot);
mkdirSync(cwd);

writeFileSync(join(dataRoot, '.env'), [
  'OLLAMA_MODEL=dotenv-ollama-model',
  'OPENAI_BASE_URL=http://127.0.0.1:9/dotenv-openai',
  'OPENAI_MODEL=dotenv-openai-model',
  'GEMINI_API_KEY=dotenv-gemini-key',
  'GEMINI_MODEL=dotenv-gemini-model',
  'OPENROUTER_API_KEY=dotenv-openrouter-key',
  'CAREER_OPS_MODEL=dotenv-openrouter-model',
  '',
].join('\n'));
mkdirSync(join(dataRoot, 'config'));
writeFileSync(join(dataRoot, 'config', 'profile.yml'), 'candidate:\n  full_name: Test Candidate\n');
writeFileSync(join(dataRoot, 'cv.md'), '# Test Candidate\n');
// A .env in the working directory must never be read: every value in it is a decoy.
writeFileSync(join(cwd, '.env'), [
  'OLLAMA_MODEL=cwd-ollama-model',
  'OPENAI_API_KEY=cwd-openai-key',
  'OPENAI_MODEL=cwd-openai-model',
  'GEMINI_API_KEY=cwd-gemini-key',
  'GEMINI_MODEL=cwd-gemini-model',
  'OPENROUTER_API_KEY=cwd-openrouter-key',
  'CAREER_OPS_MODEL=cwd-openrouter-model',
  '',
].join('\n'));
// A data root with no .env, and one whose saved setting must beat its .env.
const bareRoot = join(base, 'bare');
const savedRoot = join(base, 'saved');
for (const root of [bareRoot, savedRoot]) {
  mkdirSync(join(root, 'config'), { recursive: true });
  writeFileSync(join(root, 'config', 'profile.yml'), 'candidate:\n  full_name: Test Candidate\n');
  writeFileSync(join(root, 'cv.md'), '# Test Candidate\n');
}
writeFileSync(join(savedRoot, '.env'), 'OLLAMA_MODEL=dotenv-ollama-model\n');
writeFileSync(join(savedRoot, 'config', 'settings.json'), JSON.stringify({ version: 1, values: { OLLAMA_MODEL: 'saved-ollama-model' } }));
writeFileSync(join(cwd, 'jd.txt'), 'Some job description.\n');
writeFileSync(join(cwd, 'report.md'), '# Report\n');

const stub = join(base, 'fetch-stub.mjs');
writeFileSync(stub, `
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url ?? String(input);
  if (url.endsWith('/api/tags')) return new Response('{}');
  if (url.includes('hn.algolia.com/api/v1/search')) return Response.json({ hits: [{ objectID: '1', title: 'Ask HN: Who is hiring?' }] });
  if (url.includes('hn.algolia.com/api/v1/items')) return Response.json({ children: [] });
  let model = null;
  try { model = JSON.parse(init?.body ?? '{}').model ?? null; } catch {}
  process.stdout.write('MODEL_REQUEST ' + url + ' ' + model + '\\n');
  throw new Error('fetch stubbed by the test');
};
`);

// Seeded as if the developer had exported it, so dropping it below is tested on every run.
const env = { ...process.env, CAREER_OPS_PROFILE: join(base, 'no-such-profile.yml'), CAREER_OPS_ROOT: dataRoot };
for (const id of ['CAREER_OPS_DATA_DIR', 'CAREER_OPS_PROFILE', 'CAREER_OPS_PRIVACY', 'CAREER_OPS_PORTALS',
  'CAREER_OPS_PIPELINE', 'CAREER_OPS_SCAN_HISTORY', 'OLLAMA_MODEL', 'OLLAMA_BASE_URL', 'OPENAI_BASE_URL', 'OPENAI_MODEL',
  'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'OPENROUTER_API_KEY', 'CAREER_OPS_MODEL']) delete env[id];

function run(script, args, overrides = {}) {
  const r = spawnSync(NODE, ['--import', pathToFileURL(stub).href, join(ROOT, script), ...args], {
    cwd, env: { ...env, ...overrides }, encoding: 'utf-8', timeout: 30000,
  });
  return `${r.stdout}${r.stderr}`;
}

function check(script, args, expected, label, overrides) {
  const out = run(script, args, overrides);
  const found = expected instanceof RegExp ? expected.test(out) : out.includes(expected);
  if (found) pass(`${script} ${label}`);
  else fail(`${script} ${label}: expected ${expected}. tail: ${out.trim().split('\n').slice(-3).join(' | ')}`);
}

// With no .env in the data root, the runner must reach `marker` (its no-key or
// default-model path) without any value from the working directory .env.
function ignoresCwd(script, args, marker) {
  const out = run(script, args, { CAREER_OPS_ROOT: bareRoot });
  if (out.includes(marker) && !out.includes('cwd-')) pass(`${script} ignores a .env in the working directory`);
  else fail(`${script} read the working directory .env, or never reached ${JSON.stringify(marker)}. tail: ${out.trim().split('\n').slice(-3).join(' | ')}`);
}

try {
  check('ollama-eval.mjs', ['--no-save', 'Some job description.'],
    /MODEL_REQUEST \S+ dotenv-ollama-model/, 'sends OLLAMA_MODEL from the data root .env');
  check('openai-eval.mjs', ['--no-save', 'Some job description.'],
    'MODEL_REQUEST http://127.0.0.1:9/dotenv-openai/chat/completions dotenv-openai-model',
    'sends to OPENAI_BASE_URL with OPENAI_MODEL from the data root .env');
  check('openai-tailor.mjs', ['--jd', 'jd.txt', '--report', 'report.md'],
    'MODEL_REQUEST http://127.0.0.1:9/dotenv-openai/chat/completions dotenv-openai-model',
    'sends to OPENAI_BASE_URL with OPENAI_MODEL from the data root .env');
  check('gemini-eval.mjs', ['--no-save', 'Some job description.'],
    '/models/dotenv-gemini-model:generateContent', 'asks for GEMINI_MODEL with the key from the data root .env');
  check('scan-hn.mjs', [], 'AI Key detected', 'finds GEMINI_API_KEY in the data root .env');
  const batch = run('batch-evaluate-gemini.mjs', []);
  if (!batch.includes('GEMINI_API_KEY not found') && batch.includes('Required context file missing')) {
    pass('batch-evaluate-gemini.mjs finds GEMINI_API_KEY in the data root .env');
  } else fail(`batch-evaluate-gemini.mjs did not find GEMINI_API_KEY. tail: ${batch.trim().split('\n').slice(-2).join(' | ')}`);
  check('openrouter-runner.mjs', ['eval', 'Some job description.'],
    /MODEL_REQUEST \S+ dotenv-openrouter-model/, 'sends CAREER_OPS_MODEL with the key from the data root .env');

  ignoresCwd('ollama-eval.mjs', ['--no-save', 'Some job description.'], 'MODEL_REQUEST');
  ignoresCwd('openai-eval.mjs', ['--no-save', 'Some job description.'], 'No API key');
  ignoresCwd('openai-tailor.mjs', ['--jd', 'jd.txt', '--report', 'report.md'], 'No API key');
  ignoresCwd('gemini-eval.mjs', ['--no-save', 'Some job description.'], 'GEMINI_API_KEY not found');
  ignoresCwd('scan-hn.mjs', [], 'No AI key');
  ignoresCwd('batch-evaluate-gemini.mjs', [], 'GEMINI_API_KEY not found');
  ignoresCwd('openrouter-runner.mjs', ['models'], 'OPENROUTER_API_KEY is not set');

  check('ollama-eval.mjs', ['--no-save', 'Some job description.'],
    /MODEL_REQUEST \S+ saved-ollama-model/, 'sends the saved OLLAMA_MODEL over the data root .env one',
    { CAREER_OPS_ROOT: savedRoot, CAREER_OPS_SETTINGS: '' });
} finally {
  rmSync(base, { recursive: true, force: true });
}
