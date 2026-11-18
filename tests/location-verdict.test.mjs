import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkplacePolicy, locationVerdict, LOCATION_TIERS } from '../providers/_country.mjs';

const HOLD = { onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] };
const gate = buildWorkplacePolicy({ ...HOLD, home_states: ['Georgia'] });
const bare = buildWorkplacePolicy(HOLD);

test('LOCATION_TIERS', () => assert.deepEqual(LOCATION_TIERS, ['fit', 'review', 'elsewhere']));

const TABLE = [
  // The spec's Finding 1 table.
  ['United States', 'review', 'location_names_no_place'],
  ['USA', 'review', 'location_names_no_place'],
  ['United States, Multiple Locations, Multiple Locations', 'review', 'location_names_no_place'],
  ['Georgia, USA', 'review', 'location_names_no_place'],
  ['5 Locations', 'review', 'location_names_no_place'],
  ['Remote', 'review', 'remote_eligibility_unconfirmed'],
  ['', 'review', 'location_unknown'],
  ['Remote - United States', 'fit', 'remote_region_allowed'],
  ['Sunnyvale, CA, USA; Atlanta, GA, USA', 'fit', 'onsite_location_allowed'],
  // Named in the brief for this plan.
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
  ['Tbilisi, Georgia', 'review', 'onsite_in_home_state'],
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
