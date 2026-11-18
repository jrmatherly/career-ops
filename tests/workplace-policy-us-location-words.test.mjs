import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkplacePolicy } from '../providers/_country.mjs';

const gate = buildWorkplacePolicy({ onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] });
const es = buildWorkplacePolicy({ onsite_locations: ['Barcelona'], remote_countries: ['Spain'], remote_regions: ['Europe'] });
const HOLD = { onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] };
const atl = buildWorkplacePolicy({ ...HOLD, onsite_locations: [...HOLD.onsite_locations, 'ATL', 'Richmond'] });

for (const l of ['US Telecommuter', 'Anywhere in the U.S.', 'Anywhere, US', 'Telecommute - United States'])
  test(`${l} is remote in the United States`, () => assert.deepEqual(gate(l, 'Platform Engineer'), { eligible: true, reason: 'remote_region_allowed' }));
for (const l of ['Anywhere in Canada', 'Canada Telecommuter'])
  test(`${l} is remote in another country`, () => assert.deepEqual(gate(l, 'Platform Engineer'), { eligible: false, reason: 'remote_country_restricted' }));
for (const l of ['Not Telecommute - United States', 'Telecommuting not available - Dallas, TX', 'Telecommuting is not available - Dallas, TX', 'Remote is not available - Dallas, TX', 'WFH not available - Dallas, TX'])
  test(`${l} is an on-site place`, () => assert.deepEqual(gate(l, 'Platform Engineer'), { eligible: false, reason: 'onsite_outside_allowed_locations' }));
test('Telecommuting with no negation is remote', () => assert.deepEqual(gate('Telecommuting - Dallas, TX', 'Platform Engineer'), { eligible: true, reason: 'remote_region_allowed' }));
for (const l of ['Anywhere', 'WFH'])
  test(`${l} alone shows no country`, () => assert.deepEqual(gate(l, 'Platform Engineer'), { eligible: false, reason: 'remote_eligibility_unconfirmed' }));
for (const l of ['WFH - US', 'WFH (US)', 'US - WFH', 'WFH - Texas'])
  test(`${l} is remote in the United States`, () => assert.deepEqual(gate(l, 'Platform Engineer'), { eligible: true, reason: 'remote_region_allowed' }));
test('WFH in another country is remote there', () => assert.deepEqual(gate('WFH - Canada', 'Platform Engineer'), { eligible: false, reason: 'remote_country_restricted' }));
test('a negation covers its own place only', () => {
  assert.deepEqual(gate('Remote - United States · Remote not available - London, UK', 'Platform Engineer'), { eligible: true, reason: 'remote_region_allowed' });
  assert.deepEqual(gate('Remote not available - Dallas, TX', 'Platform Engineer'), { eligible: false, reason: 'onsite_outside_allowed_locations' });
});
for (const l of ['Spain Telecommuter', 'WFH - Spain'])
  test(`the home-working words are read only under a United States policy: ${l}`, () => assert.deepEqual(es(l), { eligible: false, reason: 'onsite_outside_allowed_locations' }));
for (const l of ['GA ATL', 'GA ATLANTA'])
  test(`a state code and a space before a home place: ${l}`, () => assert.deepEqual(atl(l), { eligible: true, reason: 'onsite_location_allowed' }));
for (const l of ['CA Richmond', 'DE Atlanta', 'CA Richmond, BC'])
  test(`a code that is also a country keeps its country: ${l}`, () => assert.deepEqual(atl(l), { eligible: false, reason: 'onsite_country_restricted' }));
test('GA ATL needs ATL in onsite_locations', () => assert.equal(gate('GA ATL').eligible, false));
