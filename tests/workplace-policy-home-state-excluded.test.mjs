import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkplacePolicy, locationVerdict } from '../providers/_country.mjs';

const HOLD = { onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] };
const gate = buildWorkplacePolicy({ ...HOLD, home_states: ['Georgia'] });
const bare = buildWorkplacePolicy(HOLD);
const us = (g, description, location = 'Remote - United States') => g(location, 'Platform Engineer', { description });
const EXCLUDED = { eligible: false, reason: 'home_state_excluded' }, FIT = { eligible: true, reason: 'remote_region_allowed' };

for (const d of [
  'Georgia residents are not eligible.', 'Georgia residents are not eligible to apply.', 'Georgia-based applicants are not eligible.',
  'Not available in Georgia.', 'This role is not open in Georgia.', 'This role is not available to residents of Georgia.',
  'We cannot hire in Georgia.', 'We cannot hire in Alabama, Georgia or Hawaii.',
  'We are unable to hire in the following states: Georgia, Hawaii, Alaska.',
  'Open to all US states except Georgia.', 'Open to candidates in all states excluding Georgia.', 'Excluding Georgia and Texas.',
  'We cannot hire in the state of Georgia.', 'We do not hire from Georgia.', 'Georgia candidates are excluded.', 'Georgia residents are ineligible.',
  'Georgia applicants are not eligible for this role.', 'This position is not open to residents of Georgia, Alaska or Hawaii.',
]) test(`a sentence that shuts the home state out of hiring is refused: ${d}`, () => assert.deepEqual(us(gate, d), EXCLUDED));

for (const d of [
  'Not available in Texas.', 'Colorado residents are not eligible.', 'We cannot hire in Alabama, Hawaii or Texas.',
  'Our headquarters is not in Georgia.', 'Whether or not Georgia is home, you are welcome.', 'We are not Georgia-Pacific.',
  'Benefits vary by state, except Georgia Power retirees.', 'Georgia Tech alumni are not rare here.',
  'Applicants from Georgia are not eligible for relocation.', 'Atlanta, Georgia residents are not eligible for relocation assistance.',
  'Residents of Georgia are not eligible for the commuter benefit.',
  'Our 401(k) match is not available in Georgia.', 'Paid family leave is not available in Georgia.', 'Applicants are not eligible for sponsorship in Georgia.',
  'Relocation is not supported in Georgia.', 'All benefits apply except for Georgia.', 'Candidates are not eligible for relocation from Georgia.',
  'Relocation support is not available from Georgia, Ohio or Texas.', 'Sales tax is not supported in the state of Georgia.',
  'Payroll is not supported in Georgia; those hires join as contractors.',
  'This position is eligible for remote work in all states except Georgia, where it is hybrid in our Atlanta office.',
  'Fully remote except for Georgia, where employees come to the Atlanta office twice a week.', 'Remote (except Georgia: hybrid in Atlanta).',
  'You will cover the Southeast territory, excluding Georgia.', 'Territory: Southeast (excluding Georgia).',
  'Pay transparency: ranges are disclosed for all locations except Georgia and Texas.', 'Relocation assistance is not available for candidates in Georgia.',
  'Short-term disability is not supported in Georgia.', 'Sponsorship is not available in Georgia.', 'This position is not eligible for visa sponsorship in Georgia.',
  'We do not hire contractors in Georgia; employees only.', "Georgia-based candidates are not eligible for this role's relocation package.",
  'Not available in Georgia, Armenia or Azerbaijan.', 'Not available in Georgia or elsewhere in the Caucasus.',
  'Please Note: For US-based roles open to remote work, we are currently able to hire employees in the following states only: Arizona, California, Colorado, Florida, Georgia, Illinois, New York, Texas.',
]) test(`a sentence that is not about hiring in the home state stays eligible: ${d.slice(0, 80)}`, () => assert.deepEqual(us(gate, d), FIT));

test('with no home state a state exclusion is not read', () => assert.deepEqual(us(bare, 'Georgia residents are not eligible.'), FIT));

test('each home state is read, and a longer name that starts with one is not', () => {
  const two = buildWorkplacePolicy({ ...HOLD, home_states: ['Georgia', 'New York'] });
  assert.deepEqual(us(two, 'Not available in New York.'), EXCLUDED);
  assert.deepEqual(us(two, 'We cannot hire in New York or Georgia.'), EXCLUDED);
  assert.deepEqual(us(two, 'Not available in New York City.'), FIT);
});

test('a Georgia that is the country is not the home state', () =>
  assert.deepEqual(us(gate, 'Not available in Georgia.', 'Remote - Tbilisi, Georgia'), { eligible: false, reason: 'remote_country_restricted' }));

test('the verdict for a shut-out home state is elsewhere', () =>
  assert.deepEqual(locationVerdict(gate, 'Remote - United States', '', { description: 'Not available in Georgia.' }), { tier: 'elsewhere', reason: 'home_state_excluded' }));

test('a posting in a home town is judged by its location, whatever the description says of the state', () =>
  assert.deepEqual(us(gate, 'We cannot hire in Georgia.', 'Atlanta, GA'), { eligible: true, reason: 'onsite_location_allowed' }));
