import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkplacePolicy } from '../providers/_country.mjs';

const gate = buildWorkplacePolicy({ onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] });
const es = buildWorkplacePolicy({ onsite_locations: ['Barcelona'], remote_countries: ['Spain'], remote_regions: ['Europe'] });
const HOLD = { onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] };
const atl = buildWorkplacePolicy({ ...HOLD, onsite_locations: [...HOLD.onsite_locations, 'ATL', 'Richmond'] });

for (const l of ['US Telecommuter', 'Anywhere in the U.S.', 'Anywhere, US', 'Telecommute - United States'])
  test(`${l} is remote in the United States`, () => assert.deepEqual(gate(l, 'Platform Engineer'), { eligible: true, reason: 'remote_region_allowed' }));
for (const l of ['Anywhere in Canada', 'Canada Telecommuter', 'Not Telecommute - United States', 'Telecommuting not available - Dallas, TX', 'Anywhere'])
  test(`${l} stays out`, () => assert.equal(gate(l, 'Platform Engineer').eligible, false));
test('the new words are read only under a United States policy', () =>
  assert.deepEqual(es('Spain Telecommuter'), { eligible: false, reason: 'onsite_outside_allowed_locations' }));
for (const l of ['GA ATL', 'GA ATLANTA'])
  test(`a state code and a space before a home place: ${l}`, () => assert.deepEqual(atl(l), { eligible: true, reason: 'onsite_location_allowed' }));
for (const l of ['CA Richmond', 'DE Atlanta', 'CA Richmond, BC'])
  test(`a code that is also a country keeps its country: ${l}`, () => assert.deepEqual(atl(l), { eligible: false, reason: 'onsite_country_restricted' }));
test('GA ATL needs ATL in onsite_locations', () => assert.equal(gate('GA ATL').eligible, false));
