// tests/settings-overlay-coverage.test.mjs — every file that reads a saved-able
// environment setting imports the overlay first, or says why it need not.
// It sees .mjs, .ts and .tsx files that name the variable as env.ID or as a
// quoted string; no shell or Go file read one when this was written.
import { pass, fail, ROOT } from './helpers.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SETTINGS } from '../lib/settings-registry.mjs';

console.log('\nsettings overlay: every reader imports it first');

// A reader listed here is not wired, for the reason given.
const EXEMPT = {
  'web/src/lib/publish-account-url.mjs': 'runs in the dashboard, which passes it the saved values over the environment (effectiveEnv)',
  'web/src/lib/remembered-cli.mjs': 'runs in the dashboard and reads the saved CLI from config/settings.json itself',
  'web/src/components/config-form.tsx': 'browser code: it names the id to save it through /api/settings and reads no environment',
  'remember-cli.mjs': 'writes .env; it reads the saved CLI only to print a note',
  'plugins/usajobs/index.mjs': 'loaded by plugins/_engine.mjs, which imports the overlay first',
  'plugins/notion/index.mjs': 'loaded by plugins/_engine.mjs, which imports the overlay first',
};

const SKIP = /^(tests|web\/tests|publish\/tests|docs|\.github|\.claude|scaffolder)\/|^lib\/settings-[^/]*\.mjs$/;
const ids = SETTINGS.filter((s) => s.kind === 'env').map((s) => s.id);
const readsId = (text) => ids.find((id) => new RegExp(`env\\??\\.${id}\\b`).test(text) || new RegExp(`['"]${id}['"]`).test(text));

/** True when the first import statement in `text` is the overlay. Header comments mention "import", so they are stripped first. */
function importsOverlayFirst(text) {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const first = code.match(/^\s*import\b[^;]*;/m);
  return Boolean(first && /^\s*import\s+['"][^'"]*\/settings-env\.mjs['"];/.test(first[0]));
}

const files = execFileSync('git', ['-C', ROOT, 'ls-files', '-z', '--', '*.mjs', '*.ts', '*.tsx'], { encoding: 'utf8' })
  .split('\0').filter((f) => f && !SKIP.test(f) && existsSync(join(ROOT, f)));
const readers = new Map();
for (const file of files) {
  const text = readFileSync(join(ROOT, file), 'utf8');
  const id = readsId(text);
  if (id) readers.set(file, { id, wired: importsOverlayFirst(text) });
}

if (readers.size < 10) fail(`only ${readers.size} readers found; the matcher is broken`);
for (const [file, { id, wired }] of readers) {
  if (wired || EXEMPT[file]) pass(`${file} (${id})${wired ? '' : `: ${EXEMPT[file]}`}`);
  else fail(`${file} reads ${id}: add the settings-env import as the first import, or add the file to EXEMPT with a reason`);
}
for (const file of Object.keys(EXEMPT)) {
  if (!readers.has(file)) fail(`${file} is in EXEMPT but no longer reads a registry setting; remove it`);
}

// The two plugin exemptions rest on this file, which names no setting itself.
const engine = readFileSync(join(ROOT, 'plugins/_engine.mjs'), 'utf8');
(importsOverlayFirst(engine) ? pass : fail)('plugins/_engine.mjs imports the overlay first');
