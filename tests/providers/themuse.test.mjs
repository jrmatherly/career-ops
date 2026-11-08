// tests/providers/themuse.test.mjs — provider-contract tests for the retired
// The Muse provider (providers/themuse.mjs).
import { pass, fail, ROOT } from '../helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';

console.log('\nProvider — themuse');


try {
  const museModule = await import(pathToFileURL(join(ROOT, 'providers/themuse.mjs')).href);
  const themuse = museModule.default;
  const { normalizeMuseJob, RETIRED_MESSAGE } = museModule;

  if (themuse.id === 'themuse') pass('themuse.id is "themuse"');
  else fail(`themuse.id is ${JSON.stringify(themuse.id)}`);

  // detect() — explicit provider selection only, so a stale `provider: themuse`
  // entry reaches fetch() and its retirement message instead of "no provider matched".
  const hit = themuse.detect?.({ name: 'The Muse', provider: 'themuse' });
  if (hit && hit.url === 'https://www.themuse.com/api/public/jobs') pass('themuse.detect() resolves provider:themuse → feed URL');
  else fail(`themuse.detect() returned ${JSON.stringify(hit)}`);
  if (themuse.detect?.({ name: 'The Muse', careers_url: 'https://www.themuse.com/jobs' }) === null)
    pass('themuse.detect() returns null for a themuse careers_url without provider:themuse');
  else fail('themuse.detect() should require provider:themuse');

  if (typeof RETIRED_MESSAGE === 'string' && RETIRED_MESSAGE.includes('cf-mitigated: challenge') && RETIRED_MESSAGE.includes('2026-11-08'))
    pass('RETIRED_MESSAGE names the Cloudflare challenge and the date it was observed');
  else fail(`RETIRED_MESSAGE = ${JSON.stringify(RETIRED_MESSAGE)}`);

  // fetch() must fail loudly with zero network calls: a resolved [] would read
  // as a healthy empty board and reset scan.mjs's failure streak.
  let networkCalls = 0;
  const ctx = {
    transport: 'http',
    fetchJson: async (url) => {
      networkCalls++;
      throw new Error(`fetchJson should not be called, got: ${url}`);
    },
    fetchText: async () => {
      networkCalls++;
      throw new Error('fetchText should not be called');
    },
  };
  let fetchErr = null;
  try {
    await themuse.fetch({ name: 'The Muse', provider: 'themuse' }, ctx);
  } catch (e) {
    fetchErr = e;
  }
  if (networkCalls === 0 && fetchErr && fetchErr.message === RETIRED_MESSAGE)
    pass('themuse.fetch() rejects with RETIRED_MESSAGE without touching the network');
  else fail(`themuse.fetch() should reject with RETIRED_MESSAGE and zero network calls, got: networkCalls=${networkCalls}, error=${fetchErr ? fetchErr.message : '(did not throw)'}`);

  // normalizeMuseJob — field mapping
  const job = normalizeMuseJob({
    name: 'Staff AI Engineer',
    refs: { landing_page: 'https://www.themuse.com/jobs/acme/staff-ai-engineer' },
    company: { name: 'Acme Corp' },
    locations: [{ name: 'Remote' }],
  });
  if (job?.title === 'Staff AI Engineer') pass('normalizeMuseJob maps name → title');
  else fail(`normalizeMuseJob title = ${JSON.stringify(job?.title)}`);

  if (job?.url === 'https://www.themuse.com/jobs/acme/staff-ai-engineer')
    pass('normalizeMuseJob maps refs.landing_page → url');
  else fail(`normalizeMuseJob url = ${JSON.stringify(job?.url)}`);

  if (job?.company === 'Acme Corp') pass('normalizeMuseJob maps company.name → company');
  else fail(`normalizeMuseJob company = ${JSON.stringify(job?.company)}`);

  if (job?.location === 'Remote') pass('normalizeMuseJob maps locations[0].name → location');
  else fail(`normalizeMuseJob location = ${JSON.stringify(job?.location)}`);

  if (normalizeMuseJob({ name: '', refs: { landing_page: 'https://www.themuse.com/jobs/x' }, company: { name: 'X' }, locations: [] }) === null)
    pass('normalizeMuseJob drops entries with empty title');
  else fail('normalizeMuseJob should return null for empty title');

  if (normalizeMuseJob({ name: 'Role', refs: { landing_page: '/relative' }, company: { name: 'X' }, locations: [] }) === null)
    pass('normalizeMuseJob drops entries with a non-absolute landing_page URL');
  else fail('normalizeMuseJob should return null for a relative URL');

  const noLoc = normalizeMuseJob({
    name: 'Role', refs: { landing_page: 'https://www.themuse.com/jobs/x' }, company: { name: 'X' }, locations: [],
  });
  if (noLoc?.location === '') pass('normalizeMuseJob returns empty location when locations array is empty');
  else fail(`normalizeMuseJob location for empty locations = ${JSON.stringify(noLoc?.location)}`);

  const noCompany = normalizeMuseJob({
    name: 'Role', refs: { landing_page: 'https://www.themuse.com/jobs/x' }, company: null, locations: [{ name: 'NYC' }],
  });
  if (noCompany?.company === 'The Muse') pass('normalizeMuseJob falls back to "The Muse" when company.name is missing');
  else fail(`normalizeMuseJob company fallback = ${JSON.stringify(noCompany?.company)}`);

  if (normalizeMuseJob(null) === null && normalizeMuseJob('string') === null)
    pass('normalizeMuseJob returns null for non-object inputs');
  else fail('normalizeMuseJob should return null for null/non-object input');

} catch (e) {
  fail(`themuse provider tests crashed: ${e.message}`);
}
