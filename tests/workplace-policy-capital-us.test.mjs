import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkplacePolicy } from '../providers/_country.mjs';

const gate = buildWorkplacePolicy({ onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] });
const es = buildWorkplacePolicy({ onsite_locations: ['Barcelona'], remote_countries: ['Spain'], remote_regions: ['Europe'] });
const us = (description, location = 'Remote - United States') => gate(location, 'Platform Engineer', { description, workplaceType: 'Remote' });

for (const d of ['We are open to candidates in the US and Canada.', 'This role is open to candidates in the US and Canada.', 'Open to United States and Canada employees only.', 'USA and Canada roles only.'])
  test(`a capital US beside another country is not a foreign restriction: ${d}`, () => assert.deepEqual(us(d), { eligible: true, reason: 'remote_region_allowed' }));
for (const d of ['USA, Canada and Mexico roles only.', 'United States, Canada, and Mexico employees only.', 'US, Canada, Mexico and Brazil positions only.', 'Canada, USA and Mexico hires only.',
  'USA, Canada and Mexico-based roles only.', 'USA, Canada, and Mexico based employees only.', 'USA, Canada and Mexico candidates only.', 'United States and Canada candidates only.',
  'United States and Canada residents only.', 'This position is open to candidates in the US and Canada only.', 'US and Canada only.', 'USA, Canada or Mexico applicants only.'])
  test(`a country list of any length that names the home country is not a foreign restriction: ${d}`, () => assert.deepEqual(us(d), { eligible: true, reason: 'remote_region_allowed' }));
for (const d of ['Canada roles only.', 'Canada and Mexico roles only.', 'Canada, Mexico and Brazil roles only.',
  'Belarus and Canada roles only.', 'Cyprus or Canada positions only.', 'England roles only.', 'Mexico residents only.', 'Canada and Mexico residents only.', 'Belarus and Canada candidates only.',
  'Canada and Mexico only.', 'Cyprus or Canada only.',
  'Candidates outside the US and Canada only.', 'We hire outside the United States and Canada only.', 'Non-US and Canada residents only.', 'Candidates outside Canada, USA and Mexico only.'])
  test(`a foreign country list stays a restriction: ${d}`, () => assert.deepEqual(us(d), { eligible: false, reason: 'exclusive_foreign_country' }));
for (const [d, reason] of [
  ['Canada-based candidates only: we cannot hire in the US.', 'exclusive_foreign_country'],
  ['Canada-based roles only: we cannot hire in the US.', 'exclusive_foreign_country'],
  ['Canada-based roles only: we cannot hire in the US, and the salary is $140,000 CAD.', 'exclusive_foreign_country'],
  ['HIRING IN CANADA WITH US', 'description_country_restricted'],
  ['<strong>HIRING IN CANADA WITH US</strong>', 'description_country_restricted'],
  ['HIRING IN CANADA WITH US&nbsp;', 'description_country_restricted'],
  ['Open to candidates in Canada only, join us today.', 'exclusive_foreign_country'],
]) test(`a restriction stays: ${d}`, () => assert.deepEqual(us(d), { eligible: false, reason }));
for (const d of [
  '<a href="https://example.com">HIRING IN CANADA WITH US</a>',
  '<a href="https://example.com/a.b?c=d">HIRING IN CANADA FOR US</a>',
  'ABOUT US: we only hire in Canada.',
  '<strong>ABOUT US</strong> We only hire in Canada.',
]) test(`a tag's own letters or a heading's US do not make US the country: ${d}`, () => assert.deepEqual(us(d), { eligible: false, reason: 'description_country_restricted' }));
for (const d of ['We only hire in the UK and US.', 'Open to candidates in the UK and US only.', '<a href="https://example.com">We are hiring in Canada and the US only.</a>'])
  test(`a capital US in visible text with a lower-case letter is the country: ${d}`, () => assert.deepEqual(us(d), { eligible: true, reason: 'remote_region_allowed' }));
for (const d of ['We are hiring in Canada with us.', 'Open to candidates in Canada and us'])
  test(`a lower-case us is the pronoun: ${d}`, () => assert.deepEqual(us(d), { eligible: false, reason: 'description_country_restricted' }));
for (const d of ['This role is open to candidates in the US only.', 'US only.', 'US-based candidates only.', 'Open to US residents only.'])
  test(`under another home country a capital US before "only" is a foreign country: ${d}`, () => {
    assert.deepEqual(es('Remote Europe', '', { description: d }), { eligible: false, reason: 'exclusive_foreign_country' });
    assert.deepEqual(es('Remote - Spain', '', { description: d }), { eligible: false, reason: 'exclusive_foreign_country' });
  });
for (const d of [
  'Only shortlisted candidates will be contacted by our US office.',
  'We are the only US company in this market.',
  'You will support US customers only in the afternoons.',
  'Applicants must have experience with US GAAP.',
  '<strong>ABOUT US</strong> We only hire kind people.',
  'ABOUT US - we only hire kind people.',
]) test(`under another home country a capital US in an ordinary clause is not a restriction: ${d}`, () =>
  assert.deepEqual(es('Remote - Spain', '', { description: d }), { eligible: true, reason: 'remote_region_allowed' }));
test('under another home country a dotted U.S. keeps its "Only"', () =>
  assert.deepEqual(es('Remote - Spain', '', { description: 'U.S. Only.' }), { eligible: false, reason: 'exclusive_foreign_country' }));
test('under another home country a country list that names home is not a foreign restriction', () =>
  assert.deepEqual(es('Remote - Spain', '', { description: 'Spain, US and Mexico roles only.' }), { eligible: true, reason: 'remote_region_allowed' }));
for (const d of [
  'This is a US national remote role.',
  'US national remote',
  'Open to remote work.',
  'Join us and work remotely.',
  'For US-based roles open to remote work, we are currently able to hire employees in the following states only: Arizona, California.',
]) test(`a capital US does not confirm a bare remote location: ${d.slice(0, 60)}`, () =>
  assert.deepEqual(us(d, 'Remote - International'), { eligible: false, reason: 'remote_eligibility_unconfirmed' }));
test('a spelled-out country still confirms a bare Remote', () => assert.equal(us('You can work remotely from the United States.', 'Remote').eligible, true));
for (const d of ['New England roles only.', 'New England residents only.'])
  test(`New England before "only" is not England: ${d}`, () => assert.deepEqual(us(d), { eligible: true, reason: 'remote_region_allowed' }));
test('New Mexico before "only" in a location is the state, and Mexico is still exclusive', () => {
  assert.deepEqual(gate('Remote - New Mexico only'), { eligible: true, reason: 'remote_region_allowed' });
  assert.deepEqual(gate('Remote - Mexico only'), { eligible: false, reason: 'exclusive_foreign_country' });
});
test('an exclusive phrase in a title reads the home country whole', () =>
  assert.deepEqual(gate('Remote - United States', 'Engineer (Belarus and Canada roles only)'), { eligible: false, reason: 'exclusive_foreign_country' }));
for (const d of [
  'Must reside in the U.S.',
  'Candidates must reside in the U.S. to be considered.',
  'Must be located in the U.S.A.',
  'Must be based in the contiguous United States.',
  'Must reside in the continental United States.',
  'Must reside in the lower 48 states.',
  'Must reside in the U.S. Our headquarters are in Toronto, Canada.',
]) test(`a restriction to the United States with dots or a qualifier is home: ${d}`, () => assert.deepEqual(us(d), { eligible: true, reason: 'remote_region_allowed' }));
for (const [d, reason] of [
  ['Must reside in the U.K.', 'description_location_restricted'],
  ['Must be based in the contiguous states of Canada.', 'description_location_restricted'],
  ['Must reside in the U.S. Must be based in Canada.', 'description_country_restricted'],
  ['Must reside in continental Europe.', 'description_location_restricted'],
]) test(`a dotted or qualified restriction to another place stays: ${d}`, () => assert.deepEqual(us(d), { eligible: false, reason }));
test('a dotted U.S. does not confirm a bare remote location', () =>
  assert.deepEqual(us('This is a U.S. national remote role.', 'Remote - International'), { eligible: false, reason: 'remote_eligibility_unconfirmed' }));

test('under another home country a list that names it is home with any noun', () => {
  const spain = (description) => es('Remote - Spain', 'Platform Engineer', { description });
  assert.equal(spain('Spain and Portugal residents only.').eligible, true);
  assert.equal(spain('Portugal and France residents only.').eligible, false);
});

test('a home country written with dots still reads a list that names it as home', () => {
  const dotted = buildWorkplacePolicy({ onsite_locations: ['Atlanta'], remote_countries: ['U.S.'] });
  assert.deepEqual(dotted('Remote - United States', 'Platform Engineer', { description: 'Candidates must be based in Canada or USA only.' }), { eligible: true, reason: 'remote_region_allowed' });
});

test('New England and New Mexico are not England and Mexico in a list', () => {
  const uk = buildWorkplacePolicy({ onsite_locations: ['London'], remote_countries: ['United Kingdom'] });
  const mx = buildWorkplacePolicy({ onsite_locations: ['Monterrey'], remote_countries: ['Mexico'] });
  assert.equal(uk('Remote - United Kingdom', 'Platform Engineer', { description: 'Open to candidates in New England and Canada only.' }).eligible, false);
  assert.equal(mx('Remote - Mexico', 'Platform Engineer', { description: 'Candidates in New Mexico and Canada only.' }).eligible, false);
  assert.equal(mx('Remote - Mexico', 'Platform Engineer', { description: 'Mexico and Canada only.' }).eligible, true);
});
