// tests/doctor-env-file-root.test.mjs — doctor warns when the data root's own
// .env names another data root, and when an override names a folder that does
// not exist.
//
// Only the commands that load a .env see that line, and only after the load:
// getCareerOpsRoot() answers one folder before `import('./scan.mjs')` and the
// other after it. Doctor stays on the root it started from and says so.
//
// In the .env cases the root has to be picked by default, not by the
// environment, so doctor runs from a copy of the tracked code files whose own
// folder is the data root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { linkNodeModules, ROOT } from './helpers.mjs';

const base = realpathSync(mkdtempSync(join(tmpdir(), 'career-ops-doctor-env-root-')));
process.on('exit', () => rmSync(base, { recursive: true, force: true }));
const copy = join(base, 'checkout');
const other = join(base, 'other-root');
const skip = /^(docs|tests|web|dashboard|fonts|examples)\/|^README\.|^CHANGELOG/;
for (const file of execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf-8' }).split('\0')) {
  if (!file || skip.test(file) || !existsSync(join(ROOT, file))) continue;
  mkdirSync(dirname(join(copy, file)), { recursive: true });
  cpSync(join(ROOT, file), join(copy, file), { verbatimSymlinks: true });
}
const depsReason = linkNodeModules(copy);
mkdirSync(other);
writeFileSync(join(other, 'cv.md'), '# CV\n');

// CAREER_OPS_CLI is cleared so the human run reaches doctor's own .env load.
function doctor(args, extra = {}) {
  const env = { ...process.env, HOME: base, USERPROFILE: base, ...extra };
  for (const name of ['CAREER_OPS_ROOT', 'CAREER_OPS_DATA_DIR', 'CAREER_OPS_PROFILE', 'CAREER_OPS_CLI', 'DOTENV_OVERRIDE', 'DOTENV_CONFIG_OVERRIDE']) {
    if (!(name in extra)) delete env[name];
  }
  const r = spawnSync(process.execPath, [join(copy, 'doctor.mjs'), ...args], { cwd: copy, env, encoding: 'utf-8', timeout: 60000 });
  if (r.error) throw r.error;
  if (!args.includes('--json')) return `${r.stdout}${r.stderr}`;
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new Error(`doctor --json printed no JSON (exit ${r.status}):\n${r.stderr}`);
  }
}
const rootWarnings = (json) => json.warnings.filter((w) => /\.env sets CAREER_OPS_(ROOT|DATA_DIR)/.test(w));
const silent = (envFile, args = [], extra = {}) => {
  writeFileSync(join(copy, '.env'), envFile);
  assert.deepEqual(rootWarnings(doctor(['--json', ...args], extra)), []);
};

for (const name of ['CAREER_OPS_ROOT', 'CAREER_OPS_DATA_DIR']) {
  test(`doctor warns that the data root's .env sets ${name}, and stays on its own root`, (t) => {
    if (depsReason) return t.skip(depsReason);
    writeFileSync(join(copy, '.env'), `${name}=${other}\n`);

    const [warning] = rootWarnings(doctor(['--json']));
    assert.ok(warning, 'doctor --json carries no warning for a root set only in .env');
    assert.ok(warning.includes(other), warning);
    assert.ok(warning.includes(copy), warning);
    assert.match(warning, /Export .* in your shell/);

    const human = doctor([]);
    assert.match(human, new RegExp(`\\.env sets ${name}=`));
    // The load puts the variable into process.env. The checks must keep using
    // the root resolved before it: only the other root has a cv.md.
    assert.match(human, /cv\.md not found/, 'doctor moved to the root the .env names');
  });
}

test('doctor warns when the shell sets CAREER_OPS_DATA_DIR and the .env sets CAREER_OPS_ROOT, which outranks it', (t) => {
  if (depsReason) return t.skip(depsReason);
  writeFileSync(join(copy, '.env'), `CAREER_OPS_ROOT=${other}\n`);
  const [warning] = rootWarnings(doctor(['--json'], { CAREER_OPS_DATA_DIR: copy }));
  assert.ok(warning?.includes('CAREER_OPS_ROOT'), String(warning));
});

test('doctor reads the .env of a root the marker names, not the one beside the code', (t) => {
  if (depsReason) return t.skip(depsReason);
  const marked = join(base, 'marked-root');
  mkdirSync(marked, { recursive: true });
  writeFileSync(join(marked, '.env'), `CAREER_OPS_DATA_DIR=${other}\n`);
  writeFileSync(join(copy, '.env'), '');
  writeFileSync(join(copy, '.career-ops-data'), `${marked}\n`);
  try {
    const [warning] = rootWarnings(doctor(['--json']));
    assert.ok(warning?.includes(marked), String(warning));
  } finally {
    rmSync(join(copy, '.career-ops-data'));
  }
});

test('doctor says nothing when the shell variable that names the root shadows the line', (t) => {
  if (depsReason) return t.skip(depsReason);
  silent(`CAREER_OPS_ROOT=${other}\n`, [], { CAREER_OPS_ROOT: copy });
  silent(`CAREER_OPS_DATA_DIR=${other}\n`, [], { CAREER_OPS_ROOT: copy });
  silent(`CAREER_OPS_DATA_DIR=${other}\n`, [], { CAREER_OPS_DATA_DIR: copy });
});

test('doctor says nothing when the .env names no root, or the root it is in', (t) => {
  if (depsReason) return t.skip(depsReason);
  silent('CAREER_OPS_ROOT=\nGEMINI_MODEL=x\n');
  silent(`CAREER_OPS_ROOT=${copy}\n`);
});

test('doctor --target says nothing about the target\'s .env', (t) => {
  if (depsReason) return t.skip(depsReason);
  silent(`CAREER_OPS_ROOT=${other}\n`, ['--target', copy]);
});

for (const flag of ['DOTENV_OVERRIDE', 'DOTENV_CONFIG_OVERRIDE']) {
  test(`doctor warns when ${flag} lets the .env replace a root the shell names`, (t) => {
    if (depsReason) return t.skip(depsReason);
    writeFileSync(join(copy, '.env'), `CAREER_OPS_ROOT=${other}\n`);
    const [warning] = rootWarnings(doctor(['--json'], { CAREER_OPS_ROOT: copy, [flag]: 'true' }));
    assert.ok(warning?.includes(other), String(warning));
    assert.match(warning, /Remove it from \.env/);
    assert.doesNotMatch(warning, /in your shell/);
  });
}

test('doctor treats dotenv\'s off values as off', (t) => {
  if (depsReason) return t.skip(depsReason);
  for (const off of ['false', 'OFF', '0', '']) {
    silent(`CAREER_OPS_ROOT=${other}\n`, [], { CAREER_OPS_ROOT: copy, DOTENV_OVERRIDE: off });
  }
});

test('doctor warns when an override lets an empty line clear the root the shell names', (t) => {
  if (depsReason) return t.skip(depsReason);
  const shellRoot = join(base, 'shell-root');
  mkdirSync(shellRoot, { recursive: true });
  writeFileSync(join(shellRoot, '.env'), 'CAREER_OPS_ROOT=\n');
  const [warning] = rootWarnings(doctor(['--json'], { CAREER_OPS_ROOT: shellRoot, DOTENV_OVERRIDE: 'true' }));
  assert.ok(warning, 'no warning for a root the .env clears');
  // With the shell value cleared, the root falls back to the code folder.
  assert.ok(warning.includes(`use ${copy} from then on`), warning);
  assert.match(warning, /Remove it from \.env/);
});

test('doctor says nothing when the cleared root falls back to the same folder', (t) => {
  if (depsReason) return t.skip(depsReason);
  silent('CAREER_OPS_ROOT=\n', [], { CAREER_OPS_ROOT: copy, DOTENV_OVERRIDE: 'true' });
});

for (const name of ['CAREER_OPS_ROOT', 'CAREER_OPS_DATA_DIR']) {
  test(`doctor warns when ${name} names a folder that does not exist`, (t) => {
    if (depsReason) return t.skip(depsReason);
    writeFileSync(join(copy, '.env'), '');
    const gone = join(base, `gone-${name}`);
    const missing = (json) => json.warnings.filter((w) => w.includes('does not exist'));

    const [warning] = missing(doctor(['--json'], { [name]: gone }));
    assert.ok(warning?.startsWith(`${name} names ${gone}`), String(warning));

    assert.match(doctor([], { [name]: gone }), new RegExp(`${name} names .*does not exist`));
    assert.ok(!existsSync(gone), 'the human run created the folder, so the next run would stop warning');
    assert.deepEqual(doctor(['--json', '--init-templates'], { [name]: gone }).autoCopied, []);
    assert.ok(!existsSync(gone), '--init-templates seeded a root that does not exist');

    assert.deepEqual(missing(doctor(['--json'], { [name]: other })), []);
    assert.deepEqual(missing(doctor(['--json'])), []);
  });
}

test('doctor warns when the marker names a folder that does not exist', (t) => {
  if (depsReason) return t.skip(depsReason);
  const gone = join(base, 'gone-marker');
  writeFileSync(join(copy, '.env'), '');
  writeFileSync(join(copy, '.career-ops-data'), `${gone}\n`);
  try {
    const [warning] = doctor(['--json']).warnings.filter((w) => w.includes('does not exist'));
    assert.ok(warning?.startsWith(`The .career-ops-data marker names ${gone}`), String(warning));
    doctor([]);
    assert.ok(!existsSync(gone));
  } finally {
    rmSync(join(copy, '.career-ops-data'));
  }
});
