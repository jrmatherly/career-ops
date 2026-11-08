// tests/plugins-doc-bundled.test.mjs — docs/PLUGINS.md lists every bundled plugin with its hooks and keys,
// and the template's seniority_boost comment names the scanners that ignore it.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pass, fail, ROOT } from './helpers.mjs';

const read = (rel) => {
  const file = join(ROOT, rel);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  fail(`${rel} is missing`);
  return '';
};
const doc = read('docs/PLUGINS.md');
const start = doc.indexOf('### Bundled plugins');
const end = start === -1 ? -1 : doc.indexOf('\n## ', start);
const bundled = start === -1 ? '' : doc.slice(start, end === -1 ? undefined : end);
if (start === -1) fail('docs/PLUGINS.md has no "### Bundled plugins" table');
const ids = readdirSync(join(ROOT, 'plugins')).filter((d) => !d.startsWith('_') && existsSync(join(ROOT, 'plugins', d, 'manifest.json')));
if (ids.length === 0) fail('plugins/ holds no bundled plugin with a manifest.json');
for (const id of ids) {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'plugins', id, 'manifest.json'), 'utf8'));
  const row = bundled.split('\n').find((line) => line.startsWith(`| \`${id}\``)) ?? '';
  if (row) pass(`docs/PLUGINS.md bundled table has a row for ${id}`); else fail(`docs/PLUGINS.md bundled table has no row for ${id}`);
  for (const name of [...(manifest.hooks ?? []), ...(manifest.requiredEnv ?? []), ...(manifest.optionalEnv ?? [])]) {
    if (row.includes(name)) pass(`${id} row names ${name}`); else fail(`${id} row does not name ${name}`);
  }
}
const template = read('templates/portals.example.yml');
const key = template.indexOf('  seniority_boost:');
if (key === -1) fail('portals.example.yml has no seniority_boost key');
else {
  // The comment sits directly above the key; 400 characters covers it with room.
  const boost = template.slice(Math.max(0, key - 400), key);
  if (/scan\.mjs/.test(boost) && /scan-ats-full\.mjs/.test(boost)) pass('portals.example.yml says which scanners ignore seniority_boost');
  else fail('portals.example.yml seniority_boost comment does not name scan.mjs and scan-ats-full.mjs');
}
