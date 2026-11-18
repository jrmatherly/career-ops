import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkplacePolicy } from '../providers/_country.mjs';

const gate = buildWorkplacePolicy({ onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] });
const es = buildWorkplacePolicy({ onsite_locations: ['Barcelona'], remote_countries: ['Spain'], remote_regions: ['Europe'] });
const us = (description, location = 'Remote - United States') => gate(location, 'Platform Engineer', { description, workplaceType: 'Remote' });

for (const d of ['We are open to candidates in the US and Canada.', 'This role is open to candidates in the US and Canada.', 'Open to United States and Canada employees only.', 'USA and Canada roles only.'])
  test(`a capital US beside another country is not a foreign restriction: ${d}`, () => assert.deepEqual(us(d), { eligible: true, reason: 'remote_region_allowed' }));
for (const d of [
  'Canada-based candidates only: we cannot hire in the US.',
  'Canada-based roles only: we cannot hire in the US.',
  'HIRING IN CANADA WITH US',
  '<strong>HIRING IN CANADA WITH US</strong>',
  'HIRING IN CANADA WITH US&nbsp;',
  'Open to candidates in Canada only, join us today.',
]) test(`a restriction stays: ${d}`, () => assert.equal(us(d).eligible, false));
for (const d of ['We are hiring in Canada with us.', 'Open to candidates in Canada and us'])
  test(`a lower-case us is the pronoun: ${d}`, () => assert.deepEqual(us(d), { eligible: false, reason: 'description_country_restricted' }));
test('under another home country a capital US is a foreign country', () =>
  assert.equal(es('Remote Europe', '', { description: 'This role is open to candidates in the US only.' }).eligible, false));
for (const d of [
  'This is a US national remote role.',
  'US national remote',
  'Open to remote work.',
  'Join us and work remotely.',
  'For US-based roles open to remote work, we are currently able to hire employees in the following states only: Arizona, California.',
]) test(`a capital US does not confirm a bare remote location: ${d.slice(0, 60)}`, () =>
  assert.deepEqual(us(d, 'Remote - International'), { eligible: false, reason: 'remote_eligibility_unconfirmed' }));
test('a spelled-out country still confirms a bare Remote', () => assert.equal(us('You can work remotely from the United States.', 'Remote').eligible, true));
