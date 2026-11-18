import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkplacePolicy, locationVerdict } from '../providers/_country.mjs';

const HOLD = { onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] };
const gate = buildWorkplacePolicy({ ...HOLD, home_states: ['Georgia'] });
const spain = buildWorkplacePolicy({ onsite_locations: ['Barcelona'], remote_countries: ['Spain'], remote_regions: ['Europe'] });

const review = (reason) => ({ tier: 'review', reason });
const elsewhere = (reason) => ({ tier: 'elsewhere', reason });
const rows = (expected, locations) => { for (const l of locations) test(`${l} is ${expected.tier}, ${expected.reason}`, () => assert.deepEqual(locationVerdict(gate, l), expected)); };

rows(review('location_names_no_place'), ['N/A', 'na', 'n/a', 'Not specified', 'Unspecified', 'Flexible', 'See description', 'See job description', 'To be determined']);
rows(review('remote_scoped_to_other_state'), ['Remote, CA', 'Remote - CA', 'CA - Remote', 'Remote CA', 'Remote, CO', 'Remote - DE', 'Remote - IL', 'REMOTE - CA']);
rows(review('remote_scoped_to_other_state'), ['Remote, CA; Remote, CO', 'Remote - Tbilisi, Georgia; Remote - CA', 'Remote - CA (PST)']);
rows(elsewhere('remote_country_restricted'), ['Remote - CA; Remote - Toronto, Canada']);
rows({ tier: 'fit', reason: 'onsite_location_allowed' }, ['Atlanta, GA (Flexible)', 'Atlanta, GA; N/A']);
rows(elsewhere('onsite_outside_allowed_locations'), ['United States; Denver, CO (not remote)', 'Hybrid in New York, United States; Remote in India', 'London, UK - Remote; United States - Hybrid',
  'Seattle, United States - Hybrid; Toronto, Canada - Remote']);
rows(elsewhere('remote_country_restricted'), ['Remote - Tbilisi, Georgia (EST)', 'Remote - 東京 (PT)']);
rows(review('remote_eligibility_unconfirmed'), ['United States - Remote | Denver, CO - Hybrid (not remote)', 'Remote - EST; Remote - Tbilisi, Georgia']);
rows(review('remote_eligibility_unconfirmed'), ['Remote - EST', 'Remote - ET', 'Remote (EST)', 'Remote - PT', 'Remote, PT', 'Remote EST', 'Remote PT']);
rows(elsewhere('remote_country_restricted'), ['Remote Tallinn EST', 'Remote EE']);
rows(elsewhere('onsite_outside_allowed_locations'), ['Denver, United States - Hybrid · Remote - Canada']);
rows(review('remote_eligibility_unconfirmed'), [
  'United States - Remote; Preferred: Denver, CO - Hybrid, Hybrid',
  'Remote or In-Office in San Francisco · San Francisco · United States',
  'Canada (Remote), United States (Remote), United Kingdom (Remote), Mexico City, Mexico (Hybrid)',
]);
rows(elsewhere('remote_country_restricted'), ['Remote - Toronto, ON, CA', 'Remote - Bogota, DC, CO', 'Remote - Lisbon (PT)', 'Remote - Tallinn, EST', 'Poland - Remote OR Romania - Remote', 'Remote, Canada', 'Remote - Estonia', 'Remote, BR; Remote PH', 'Flexible - Italy; Remote']);
rows(elsewhere('onsite_outside_allowed_locations'), ['Manila (Flexible)', 'Berlin (N/A)', 'Hybrid - London, UK', 'Remote or In-Office in London · London · United Kingdom', 'Tallinn, EST', 'East Coast']);

test('under another home country a bare US code or timezone is the country, and a placeholder is still no place', () => {
  assert.deepEqual(locationVerdict(spain, 'Remote, CA'), elsewhere('remote_country_restricted'));
  assert.deepEqual(locationVerdict(spain, 'Remote - EST'), elsewhere('remote_country_restricted'));
  assert.deepEqual(locationVerdict(spain, 'N/A'), review('location_names_no_place'));
});

test('under another home country a remote option beside an office word is not lifted', () => {
  const canada = buildWorkplacePolicy({ onsite_locations: ['Toronto'], remote_countries: ['Canada'] });
  assert.deepEqual(locationVerdict(canada, 'Vancouver - Hybrid; Canada - Remote'), elsewhere('onsite_outside_allowed_locations'));
});

test('the gate keeps its answer for a location the verdict sends to review', () => {
  assert.deepEqual(gate('Remote, CA'), { eligible: false, reason: 'remote_country_restricted' });
  assert.deepEqual(gate('Remote - EST'), { eligible: false, reason: 'remote_country_restricted' });
  assert.deepEqual(gate('N/A'), { eligible: false, reason: 'onsite_outside_allowed_locations' });
});
