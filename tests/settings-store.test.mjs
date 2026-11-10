// tests/settings-store.test.mjs — reading, validating and diffing config/settings.json.
import { pass, fail, ROOT } from './helpers.mjs';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { SETTINGS_FILE, SettingsError, nextSettingsText, overlayFor, parseSettings, readSettings, settingsOff, settingsPath } from '../lib/settings-store.mjs';

console.log('\nsettings-store.mjs: the saved settings file');

const ok = (cond, label) => (cond ? pass : fail)(label);
const deepEqual = (a, b, label) => {
  if (isDeepStrictEqual(a, b)) pass(label);
  else fail(`${label}\n      expected ${JSON.stringify(b)}\n      got      ${JSON.stringify(a)}`);
};
const throwsWith = (fn, predicate, label) => {
  try { fn(); fail(`${label} (no error)`); } catch (e) { ok(e instanceof SettingsError && predicate(e), `${label}: ${e.message}`); }
};

deepEqual(parseSettings(null), { values: {}, error: null }, 'no file means nothing saved');
deepEqual(parseSettings('{"version":1,"values":{"CAREER_OPS_SCAN_CONCURRENCY":4}}'), { values: { CAREER_OPS_SCAN_CONCURRENCY: 4 }, error: null }, 'a valid file');
ok(parseSettings('{not json').error.includes('not valid JSON'), 'invalid JSON is an error');
deepEqual(parseSettings('{not json').values, {}, 'invalid JSON yields no values');
ok(parseSettings('[]').error.includes('must be an object with a "values" object'), 'an array is an error');
ok(parseSettings('null').error.includes('must be an object with a "values" object'), 'null is an error');
ok(parseSettings('{"version":1,"values":[]}').error.includes('must be an object with a "values" object'), 'a values array is an error');

ok(parseSettings('{"version":2,"values":{"CAREER_OPS_SCAN_CONCURRENCY":4}}').error.includes('version 2'), 'a file from a later format is not applied');
deepEqual(parseSettings('{"values":{"CAREER_OPS_SCAN_CONCURRENCY":4}}').values, { CAREER_OPS_SCAN_CONCURRENCY: 4 }, 'a hand-written file with no version reads as version 1');
deepEqual(['off', 'OFF', ' Off ', '', '0', undefined].map((v) => settingsOff({ CAREER_OPS_SETTINGS: v })), [true, true, true, false, false, false], 'only the word off, in any case, turns saved settings off');

const o = overlayFor({ CAREER_OPS_SCAN_CONCURRENCY: 4, CAREER_OPS_HTTP_CACHE: false, CAREER_OPS_HTTP_TIMEOUT_MS: 5, NOT_A_SETTING: 1, GEMINI_API_KEY: 'x', CAREER_OPS_AUTO_EVALUATE_LOCAL: '1' });
deepEqual(o.env, { CAREER_OPS_SCAN_CONCURRENCY: '4', CAREER_OPS_HTTP_CACHE: '0' }, 'only valid env settings reach the overlay');
deepEqual(o.skipped.map(s => s.id).sort(), ['CAREER_OPS_AUTO_EVALUATE_LOCAL', 'CAREER_OPS_HTTP_TIMEOUT_MS', 'GEMINI_API_KEY', 'NOT_A_SETTING'], 'everything else is skipped');
const reason = (id) => o.skipped.find(s => s.id === id).reason;
deepEqual([reason('NOT_A_SETTING'), reason('GEMINI_API_KEY'), reason('CAREER_OPS_AUTO_EVALUATE_LOCAL'), reason('CAREER_OPS_HTTP_TIMEOUT_MS')],
  ['is not a setting', 'cannot be saved here', 'cannot be saved here', 'must be a whole number from 1000 to 120000'], 'each skip says why');

const t1 = nextSettingsText(null, { CAREER_OPS_SCAN_CONCURRENCY: '4' });
deepEqual(JSON.parse(t1), { version: 1, values: { CAREER_OPS_SCAN_CONCURRENCY: 4 } }, 'a first save stores the parsed value');
ok(t1.endsWith('\n') && t1.includes('\n  "values"'), 'the file is indented and ends with a newline');
deepEqual(JSON.parse(nextSettingsText(t1, { CAREER_OPS_SCAN_CONCURRENCY: null, PUBLISH_URL: 'https://cv.example.com' })).values, { PUBLISH_URL: 'https://cv.example.com' }, 'null resets an id');
deepEqual(Object.keys(JSON.parse(nextSettingsText('{"version":1,"values":{"OLD_ID":1}}', { CAREER_OPS_SCAN_CONCURRENCY: 2 })).values), ['OLD_ID', 'CAREER_OPS_SCAN_CONCURRENCY'], 'an id the registry no longer knows survives, and new keys are appended');
throwsWith(() => nextSettingsText('{not json', { CAREER_OPS_SCAN_CONCURRENCY: 2 }), e => e.code === 'malformed', 'a malformed file is never rewritten');
throwsWith(() => nextSettingsText(null, { CAREER_OPS_SCAN_CONCURRENCY: 0, GEMINI_API_KEY: 'x', NOPE: 1 }),
  e => e.code === 'invalid' && e.errors.CAREER_OPS_SCAN_CONCURRENCY === 'must be a whole number from 1 to 50'
    && e.errors.GEMINI_API_KEY === 'cannot be changed here' && e.errors.NOPE === 'is not a setting', 'every bad change is reported at once');
throwsWith(() => nextSettingsText(null, JSON.parse('{"__proto__":1}')), e => e.code === 'invalid' && Object.hasOwn(e.errors, '__proto__'), 'an id of __proto__ is reported, not swallowed');
deepEqual(overlayFor(JSON.parse('{"__proto__":{"x":1},"constructor":1}')).env, {}, 'prototype keys never reach the overlay');
deepEqual(JSON.parse(nextSettingsText('{"version":1,"values":{"OLD_ID":1}}', { OLD_ID: null })).values, {}, 'a reset clears an id the registry no longer knows');
throwsWith(() => nextSettingsText(null, { GEMINI_API_KEY: null }), e => e.code === 'invalid' && e.errors.GEMINI_API_KEY === 'cannot be changed here', 'a reset of a secret row is refused');

const root = mkdtempSync(join(tmpdir(), 'settings-store-'));
try {
  deepEqual(settingsPath(root), join(root, SETTINGS_FILE), 'the file sits under config/');
  deepEqual(readSettings(root), { values: {}, text: null, error: null }, 'an absent file is not an error');
  mkdirSync(join(root, 'config'));
  const text = '{"version":1,"values":{"CAREER_OPS_SCAN_CONCURRENCY":4}}\n';
  writeFileSync(settingsPath(root), text);
  deepEqual(readSettings(root), { values: { CAREER_OPS_SCAN_CONCURRENCY: 4 }, text, error: null }, 'a valid file is read');
  writeFileSync(settingsPath(root), '{not json');
  const broken = readSettings(root);
  ok(broken.error.includes('not valid JSON') && broken.text === '{not json' && isDeepStrictEqual(broken.values, {}), 'a malformed file reports its error and keeps its text');
  rmSync(settingsPath(root));
  mkdirSync(settingsPath(root));
  const unreadable = readSettings(root);
  ok(typeof unreadable.error === 'string' && unreadable.text === null, 'any other read failure is an error');
} finally {
  rmSync(root, { recursive: true, force: true });
}

// These three load before node_modules exists (doctor.mjs) and before any .env is read.
for (const name of ['settings-registry', 'settings-store', 'settings-env']) {
  const file = join(ROOT, 'lib', `${name}.mjs`);
  if (!existsSync(file)) continue;
  const specifiers = [...readFileSync(file, 'utf8').matchAll(/^\s*(?:import|export)\b[^'"\n]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)].map(m => m[1] ?? m[2]);
  const foreign = specifiers.filter(s => !(s.startsWith('node:') || s.startsWith('./settings-') || s === '../path-resolver.mjs'));
  deepEqual(foreign, [], `lib/${name}.mjs imports only node: builtins, its siblings and path-resolver`);
}
