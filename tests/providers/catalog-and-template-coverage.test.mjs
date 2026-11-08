// tests/providers/catalog-and-template-coverage.test.mjs: every provider module
// has a row in docs/SUPPORTED_JOB_BOARDS.md and is reachable from at least one
// example in templates/portals.example.yml, either a `provider: <id>` line or a
// URL its detect() claims. A provider whose catalog row is marked **Retired is
// exempt from the template check, since its stanza is removed on retirement.
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadProviders } from '../../providers/_registry.mjs';
import { pass, fail, ROOT } from '../helpers.mjs';

console.log('\nevery provider has a catalog row and a portals.example.yml example');

const providers = await loadProviders(join(ROOT, 'providers'));
const ids = [...providers.keys()].filter((id) => id !== 'local-parser').sort();

if (ids.length > 0) {
  pass(`loaded ${ids.length} provider(s)`);
} else {
  fail('loaded zero providers; this suite would pass vacuously');
}

// Catalog rows whose name is not the id with hyphens as spaces.
const CATALOG_ALIASES = {
  'adp-workforcenow': 'adp workforce now',
  'remote-com': 'remote.com',
};

const catalogText = readFileSync(join(ROOT, 'docs', 'SUPPORTED_JOB_BOARDS.md'), 'utf-8');
const catalog = catalogText.toLowerCase();
const missingRow = ids.filter((id) => ![
  `provider: ${id}`,
  `\`${id}\``,
  id.replaceAll('-', ' '),
  CATALOG_ALIASES[id],
].some((needle) => needle && catalog.includes(needle)));

if (missingRow.length === 0) {
  pass('every provider has a row in docs/SUPPORTED_JOB_BOARDS.md');
} else {
  fail(`provider(s) with no row in docs/SUPPORTED_JOB_BOARDS.md: ${missingRow.join(', ')}`);
}

// A retired row is matched by its name cell with punctuation dropped
// ("The Muse" -> themuse), never by notes text that may name another provider.
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const retiredNames = new Set(catalogText.split('\n')
  .filter((line) => line.includes('**Retired'))
  .map((line) => squash(line.split('|')[1] ?? '')));
const retired = new Set(ids.filter((id) => retiredNames.has(squash(id))));

const exampleYml = readFileSync(join(ROOT, 'templates', 'portals.example.yml'), 'utf-8');
const providerIds = new Set([...exampleYml.matchAll(/provider:\s*"?([a-z0-9-]+)/g)].map((m) => m[1]));
const urls = [...new Set(exampleYml.match(/https:\/\/[^\s"'`<>)]+/g) ?? [])];

// tkms and others read `api` as well as `careers_url`, so try both shapes.
const detects = (provider, url) => {
  for (const entry of [{ name: 'Example', careers_url: url }, { name: 'Example', api: url }]) {
    try {
      if (provider.detect(entry)) return true;
    } catch {
      // A detect() that throws on an unrelated URL does not claim it.
    }
  }
  return false;
};

const uncovered = ids.filter((id) => {
  if (retired.has(id) || providerIds.has(id)) return false;
  const provider = providers.get(id);
  return typeof provider.detect !== 'function' || !urls.some((url) => detects(provider, url));
});

if (uncovered.length === 0) {
  pass(`every non-retired provider has an example in templates/portals.example.yml (retired: ${[...retired].join(', ') || 'none'})`);
} else {
  fail(`provider(s) with no provider: line and no detected URL in templates/portals.example.yml: ${uncovered.join(', ')}`);
}
