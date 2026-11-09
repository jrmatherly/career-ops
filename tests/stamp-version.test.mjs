// scripts/stamp-version.mjs writes the manifest's versions into every file the
// release-please config names, and `--check` sees drift without writing. Run
// against a scratch copy of the config shape, then against this checkout,
// which must already agree with its own manifest.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { pass, fail, rmSync, ROOT, NODE } from './helpers.mjs';
import { stampVersions, stampJsonPath, stampMarkedLines } from '../scripts/stamp-version.mjs';
import { SYSTEM_PATHS } from '../lib/update-manifest.mjs';

console.log('\n🏷️  stamp-version (fork release tokens)');

const check = (ok, msg) => (ok ? pass(msg) : fail(msg));
const root = mkdtempSync(join(tmpdir(), 'stamp-version-'));
try {
  mkdirSync(join(root, 'web'));
  mkdirSync(join(root, 'plugin'));
  writeFileSync(join(root, 'release-please-config.json'), JSON.stringify({
    packages: {
      '.': { 'release-type': 'simple', 'extra-files': [
        { type: 'generic', path: 'VERSION' },
        { type: 'json', path: 'plugin/plugin.json', jsonpath: '$.version' },
        { type: 'json', path: 'plugin/market.json', jsonpath: '$.plugins[0].version' },
      ] },
      web: { 'release-type': 'node' },
    },
  }));
  writeFileSync(join(root, '.release-please-manifest.json'), JSON.stringify({ '.': '2.0.0', web: '1.0.0' }));
  writeFileSync(join(root, 'VERSION'), '1.39.0 # x-release-please-version\n');
  writeFileSync(join(root, 'package.json'), '{\n  "version": "1.39.0"\n}\n');
  writeFileSync(join(root, 'plugin/plugin.json'), '{\n  "name": "x",\n  "version": "1.39.0"\n}\n');
  writeFileSync(join(root, 'plugin/market.json'), '{\n  "plugins": [\n    {\n      "version": "1.39.0"\n    }\n  ]\n}\n');
  writeFileSync(join(root, 'web/package.json'), '{\n  "version": "0.17.0"\n}\n');
  writeFileSync(join(root, 'web/package-lock.json'), '{\n  "version": "0.17.0",\n  "packages": {\n    "": {\n      "version": "0.17.0"\n    }\n  }\n}\n');

  const drift = stampVersions(root, { check: true });
  check(drift.length === 5, `--check names every drifting file without writing (${drift.length} of 5)`);
  check(readFileSync(join(root, 'VERSION'), 'utf8').startsWith('1.39.0'), 'check mode leaves files untouched');

  stampVersions(root);
  check(readFileSync(join(root, 'VERSION'), 'utf8') === '2.0.0 # x-release-please-version\n', 'generic marker line takes the root version');
  check(JSON.parse(readFileSync(join(root, 'plugin/plugin.json'), 'utf8')).version === '2.0.0', 'json $.version takes the root version');
  check(JSON.parse(readFileSync(join(root, 'plugin/market.json'), 'utf8')).plugins[0].version === '2.0.0', 'json array path takes the root version');
  check(readFileSync(join(root, 'plugin/plugin.json'), 'utf8') === '{\n  "name": "x",\n  "version": "2.0.0"\n}\n', 'json indentation and trailing newline survive');
  const lock = JSON.parse(readFileSync(join(root, 'web/package-lock.json'), 'utf8'));
  check(lock.version === '1.0.0' && lock.packages[''].version === '1.0.0', 'node package takes the web version in package.json and both lockfile slots');
  check(stampVersions(root, { check: true }).length === 0, 'a stamped tree reports no drift');
  check(readFileSync(join(root, 'package.json'), 'utf8').includes('"1.39.0"'), "a sibling package.json outside the config keeps upstream's version");
} finally {
  rmSync(root, { recursive: true, force: true });
}

// The fork releases exactly these files. package.json, scaffolder/package.json
// and the npm-facing directory listings stay at upstream's version (the
// *-directory-plugin tests pin them to package.json), so a new upstream
// extra-file lands here only by a deliberate edit to this list.
const FORK_TOKEN_FILES = ['VERSION', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', '.github/plugin/plugin.json', '.codex-plugin/plugin.json'];
const config = JSON.parse(readFileSync(join(ROOT, 'release-please-config.json'), 'utf8'));
const extraPaths = [...new Set(config.packages['.']['extra-files'].map((f) => f.path))].sort();
check(JSON.stringify(extraPaths) === JSON.stringify([...FORK_TOKEN_FILES].sort()),
  `release-please-config.json extra-files are exactly the fork's token files (got ${extraPaths.join(', ')})`);
check(Object.keys(config.packages).join(',') === '.,web' && config.packages.web['release-type'] === 'node', 'the two packages are the root and the node web component');

const throwsWith = (fn, re, msg) => { try { fn(); fail(`${msg} (no error)`); } catch (e) { check(re.test(e.message), `${msg}: ${e.message}`); } };
throwsWith(() => stampJsonPath('{"name":"x"}', '$.version', '2.0.0'), /does not exist/, 'a missing json leaf is refused, not created');
throwsWith(() => stampJsonPath('{"a":{}}', '$.b[0].version', '2.0.0'), /does not exist/, 'a missing json branch names the path');
throwsWith(() => stampMarkedLines('1.39.0\n', '2.0.0'), /no x-release-please-version/, 'a generic file without a marker is refused');
throwsWith(() => stampMarkedLines('# x-release-please-version\n', '2.0.0'), /carries no version/, 'a marker line without a version is refused');

// The first release PR creates the root changelog as a new tracked file, so
// validate-system-paths-coverage.mjs must already claim it (web/ is outside
// the updater's world and excluded there by prefix).
const rootChangelog = config.packages['.']['changelog-path'];
check(SYSTEM_PATHS.includes(rootChangelog), `${rootChangelog}, which the first release PR creates, is claimed by SYSTEM_PATHS`);
check(!Object.values(config.packages).some((pkg) => 'release-as' in pkg), 'no release-as pin is left in the config (a one-shot pin would repeat the same version)');

const self = spawnSync(NODE, [join(ROOT, 'scripts', 'stamp-version.mjs'), '--check'], { encoding: 'utf8' });
check(self.status === 0, `this checkout's version tokens match .release-please-manifest.json${self.status === 0 ? '' : `\n${self.stdout}${self.stderr}`}`);
