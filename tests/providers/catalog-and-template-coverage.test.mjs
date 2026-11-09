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

// A row is matched by its name cell with punctuation dropped, never by notes
// text that may name another provider: "The Muse" -> themuse, and a name that
// starts with the id ("Amazon / AWS") counts. Rows named otherwise are listed here.
const CATALOG_ALIASES = {
  'agentic-jobs': 'Agentic Engineering Jobs',
  applitrack: 'Frontline AppliTrack',
  csod: 'Cornerstone OnDemand',
  eightythousandhours: '80,000 Hours',
  getonbrd: 'Get on Board',
  manfred: 'getManfred',
  oraclecloud: 'Oracle Recruiting Cloud (ORC)',
  'remote-com': 'Remote (remote.com)',
  successfactors: 'SAP SuccessFactors',
  'telegram-channel': 'Telegram (public channels)',
  ultipro: 'UKG Pro / UltiPro Recruiting',
  wttj: 'Welcome to the Jungle',
};

const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const catalogRows = readFileSync(join(ROOT, 'docs', 'SUPPORTED_JOB_BOARDS.md'), 'utf-8')
  .split('\n')
  .filter((line) => line.startsWith('|'));
const nameOf = (line) => squash(line.split('|')[1] ?? '');
const names = catalogRows.map(nameOf);
const missingRow = ids.filter((id) => {
  const alias = CATALOG_ALIASES[id];
  return alias ? !names.includes(squash(alias)) : !names.some((name) => name.startsWith(squash(id)));
});

if (missingRow.length === 0) {
  pass('every provider has a row in docs/SUPPORTED_JOB_BOARDS.md');
} else {
  fail(`provider(s) with no row in docs/SUPPORTED_JOB_BOARDS.md: ${missingRow.join(', ')}`);
}

const retiredNames = new Set(catalogRows.filter((line) => line.includes('**Retired')).map(nameOf));
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
