import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkplacePolicy, locationVerdict, LOCATION_TIERS } from '../providers/_country.mjs';

const HOLD = { onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] };
const gate = buildWorkplacePolicy({ ...HOLD, home_states: ['Georgia'] });
const bare = buildWorkplacePolicy(HOLD);

test('LOCATION_TIERS', () => {
  assert.deepEqual(LOCATION_TIERS, ['fit', 'review', 'elsewhere']);
  assert.ok(Object.isFrozen(LOCATION_TIERS));
});

const TABLE = [
  // A country, a count or nothing, and the two fits.
  ['United States', 'review', 'location_names_no_place'],
  ['USA', 'review', 'location_names_no_place'],
  ['United States, Multiple Locations, Multiple Locations', 'review', 'location_names_no_place'],
  ['Georgia, USA', 'review', 'location_names_no_place'],
  ['5 Locations', 'review', 'location_names_no_place'],
  ['Remote', 'review', 'remote_eligibility_unconfirmed'],
  ['Anywhere', 'review', 'remote_eligibility_unconfirmed'],
  ['', 'review', 'location_unknown'],
  ['Remote - United States', 'fit', 'remote_region_allowed'],
  ['Sunnyvale, CA, USA; Atlanta, GA, USA', 'fit', 'onsite_location_allowed'],
  ['Remote, TN', 'review', 'remote_scoped_to_other_state'],
  ['Atlanta, GA', 'fit', 'onsite_location_allowed'],
  ['London, UK', 'elsewhere', 'onsite_outside_allowed_locations'],
  // No specific place.
  ['United States of America', 'review', 'location_names_no_place'],
  ['Hybrid - United States', 'review', 'location_names_no_place'],
  ['Hybrid in the United States', 'review', 'location_names_no_place'],
  ['US · 3 Locations', 'review', 'location_names_no_place'],
  ['Multiple US Locations', 'review', 'location_names_no_place'],
  ['US - Multiple', 'review', 'location_names_no_place'],
  ['Various Locations', 'review', 'location_names_no_place'],
  ['Nationwide', 'review', 'location_names_no_place'],
  ['Location TBD', 'review', 'location_names_no_place'],
  ['Tennessee, USA', 'elsewhere', 'onsite_outside_allowed_locations'],
  ['New York · United States', 'elsewhere', 'onsite_outside_allowed_locations'],
  ['Nashville, TN', 'elsewhere', 'onsite_outside_allowed_locations'],
  ['Canada', 'elsewhere', 'onsite_outside_allowed_locations'],
  ['Toronto · Canada', 'elsewhere', 'onsite_outside_allowed_locations'],
  ['Dallas, TX', 'elsewhere', 'onsite_outside_allowed_locations'],
  ['Telecommuting not available - Dallas, TX', 'elsewhere', 'onsite_outside_allowed_locations'],
  // On-site in a home state, outside onsite_locations.
  ['Kennesaw, GA', 'review', 'onsite_in_home_state'],
  ['Sandy Springs, GA', 'review', 'onsite_in_home_state'],
  ['Savannah, GA', 'review', 'onsite_in_home_state'],
  ['KENNESAW, GA', 'review', 'onsite_in_home_state'],
  ['Tbilisi, Georgia', 'elsewhere', 'onsite_outside_allowed_locations'],
  // Remote scoped to a state.
  ['Remote - Tennessee', 'review', 'remote_scoped_to_other_state'],
  ['Remote, TN, USA', 'review', 'remote_scoped_to_other_state'],
  ['Remote; Orem, UT', 'review', 'remote_scoped_to_other_state'],
  ['Remote - TX, FL, NC', 'review', 'remote_scoped_to_other_state'],
  ['Remote, DC', 'review', 'remote_scoped_to_other_state'],
  ['Remote - United States (CT)', 'review', 'remote_scoped_to_other_state'],
  ['Remote, CA, USA', 'review', 'remote_scoped_to_other_state'],
  ['Remote - IL, USA', 'review', 'remote_scoped_to_other_state'],
  ['Remote, CO, US', 'review', 'remote_scoped_to_other_state'],
  ['Remote - US/CA', 'fit', 'remote_region_allowed'],
  ['Remote - CA', 'elsewhere', 'remote_country_restricted'],
  ['Remote, GA', 'fit', 'remote_region_allowed'],
  ['Remote - Georgia', 'fit', 'remote_region_allowed'],
  ['GEORGIA - REMOTE', 'fit', 'remote_region_allowed'],
  ['Remote - TX, GA, NC', 'fit', 'remote_region_allowed'],
  ['Georgia - Remote; Tennessee - Remote', 'fit', 'remote_region_allowed'],
  ['Remote - United States; Remote, TN', 'fit', 'remote_region_allowed'],
  ['Remote - Canada', 'elsewhere', 'remote_country_restricted'],
  ['Remote - Georgia, Canada', 'elsewhere', 'remote_country_restricted'],
  // A remote role beside a US city whose state code is also a country's.
  ['Remote - San Francisco, CA', 'review', 'remote_scoped_to_other_state'],
  ['San Francisco, CA (Remote)', 'review', 'remote_scoped_to_other_state'],
  ['San Francisco, CA · Remote', 'review', 'remote_scoped_to_other_state'],
  ['Denver, CO or Remote', 'review', 'remote_scoped_to_other_state'],
  ['Remote (Chicago, IL)', 'review', 'remote_scoped_to_other_state'],
  ['Los Angeles, CA / Remote', 'review', 'remote_scoped_to_other_state'],
  ['Remote - Wilmington, DE', 'review', 'remote_scoped_to_other_state'],
  ['Remote-Friendly (Travel Required) | San Francisco, CA', 'review', 'remote_scoped_to_other_state'],
  ['Remote - New York, NY', 'review', 'remote_scoped_to_other_state'],
  // The same codes beside a foreign city cannot be told apart, so these are review too.
  ['Remote - Berlin, DE', 'review', 'remote_scoped_to_other_state'],
  ['Remote - Tel Aviv, IL', 'review', 'remote_scoped_to_other_state'],
  ['Remote, CA', 'elsewhere', 'remote_country_restricted'],
  ['Remote - Toronto, Canada', 'elsewhere', 'remote_country_restricted'],
  ['Remote - Toronto, ON, CA', 'elsewhere', 'remote_country_restricted'],
  ['Remote - Bogota, DC, CO', 'elsewhere', 'remote_country_restricted'],
  ['Remote - London, UK', 'elsewhere', 'remote_country_restricted'],
  ['Remote - San Francisco, CA · Remote - London, UK', 'elsewhere', 'remote_country_restricted'],
  ['Remote - Mexico City, MX', 'elsewhere', 'remote_country_restricted'],
];
for (const [location, tier, reason] of TABLE)
  test(`${JSON.stringify(location)} is ${tier} (${reason})`, () => assert.deepEqual(locationVerdict(gate, location, 'Platform Engineer'), { tier, reason }));

test('without home_states no state is known to be home', () => {
  assert.deepEqual(locationVerdict(bare, 'Remote, GA'), { tier: 'review', reason: 'remote_scoped_to_other_state' });
  assert.deepEqual(locationVerdict(bare, 'Georgia, USA'), { tier: 'review', reason: 'location_names_no_place' });
  assert.deepEqual(locationVerdict(bare, 'Tennessee, USA'), { tier: 'review', reason: 'location_names_no_place' });
  for (const l of ['Remote - Georgia', 'Remote, Georgia', 'Georgia (Remote)', 'Remote - Georgia, Tennessee', 'GEORGIA - REMOTE'])
    assert.deepEqual(locationVerdict(bare, l), { tier: 'review', reason: 'remote_scoped_to_other_state' }, l);
  assert.deepEqual(locationVerdict(bare, 'Remote - Georgia, Canada'), { tier: 'elsewhere', reason: 'remote_country_restricted' });
  for (const l of ['Nashville, TN', 'Kennesaw, GA', 'Dallas, TX'])
    assert.deepEqual(locationVerdict(bare, l), { tier: 'elsewhere', reason: 'onsite_outside_allowed_locations' }, l);
});
test('a description restriction is elsewhere, with the gate reason', () =>
  assert.deepEqual(locationVerdict(gate, 'Remote - United States', '', { description: 'You must be based in Canada.' }), { tier: 'elsewhere', reason: 'description_country_restricted' }));
test('a location that is not a string is unknown', () => {
  assert.deepEqual(locationVerdict(gate, null), { tier: 'review', reason: 'location_unknown' });
  assert.deepEqual(locationVerdict(gate, 42), { tier: 'review', reason: 'location_unknown' });
});
test('an absent policy is always fit', () =>
  assert.deepEqual(locationVerdict(buildWorkplacePolicy(undefined), 'Remote, TN'), { tier: 'fit', reason: 'policy_absent' }));
test('a gate with no properties does not throw', () =>
  assert.deepEqual(locationVerdict(() => ({ eligible: false, reason: 'onsite_outside_allowed_locations' }), 'United States'), { tier: 'elsewhere', reason: 'onsite_outside_allowed_locations' }));
test('a description that is not a string does not throw', () => {
  for (const description of [42, null, { text: 'Canada only' }, ['You must be based in Canada.']])
    assert.deepEqual(locationVerdict(gate, 'Remote - United States', '', { description }), { tier: 'fit', reason: 'remote_region_allowed' });
});
test('a gate with no properties and a location that is not a string does not throw', () => {
  for (const [reason, tier, said] of [
    ['remote_region_allowed', 'fit', 'remote_region_allowed'],
    ['remote_country_restricted', 'elsewhere', 'remote_country_restricted'],
    ['onsite_outside_allowed_locations', 'review', 'location_names_no_place'],
  ]) assert.deepEqual(locationVerdict(() => ({ eligible: reason === 'remote_region_allowed', reason }), null), { tier, reason: said }, reason);
});
test('a workplace type of remote beside a US city is review', () =>
  assert.deepEqual(locationVerdict(gate, 'San Francisco, CA', '', { workplaceType: 'remote' }), { tier: 'review', reason: 'remote_scoped_to_other_state' }));
test('under another home country a US city is still elsewhere', () => {
  const spain = buildWorkplacePolicy({ onsite_locations: ['Barcelona'], remote_countries: ['Spain'], remote_regions: ['Europe'] });
  for (const l of ['Remote - Denver, CO', 'Remote - Wilmington, DE', 'Remote - Puerto Rico']) assert.deepEqual(locationVerdict(spain, l), { tier: 'elsewhere', reason: 'remote_country_restricted' }, l);
});
test('a home town the gate rejects beside another place is review, and the gate still rejects it', () => {
  for (const l of ['San Francisco, CA / Atlanta, GA', 'Atlanta, GA or London, UK', 'Atlanta, GA / London, UK', 'Atlanta; London, UK', 'London, UK · Atlanta', 'Hybrid - Atlanta, GA or Dublin, Ireland',
    'Atlanta · Istanbul, Turkey', 'Atlanta, GA or Hong Kong', 'Atlanta (ET)', 'Atlanta, GA (ET/CT)']) for (const g of [gate, bare]) {
    assert.deepEqual(locationVerdict(g, l), { tier: 'review', reason: 'onsite_country_restricted' }, l);
    assert.deepEqual(g(l), { eligible: false, reason: 'onsite_country_restricted' }, l);
  }
});
