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
  // A country, a count or nothing, then one row for each of the other answers.
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
  // No specific place, then on-site places outside the home area.
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
  ['Remote - CA', 'review', 'remote_scoped_to_other_state'],
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
  // The same codes beside a foreign city cannot be told apart, so the first two are review too. A code with no city reads two ways and is review as well. With the country written out they are elsewhere.
  ['Remote - Berlin, DE', 'review', 'remote_scoped_to_other_state'],
  ['Remote - Tel Aviv, IL', 'review', 'remote_scoped_to_other_state'],
  ['Remote, CA', 'review', 'remote_scoped_to_other_state'],
  ['Remote - Toronto, Canada', 'elsewhere', 'remote_country_restricted'],
  ['Remote - Toronto, ON, CA', 'elsewhere', 'remote_country_restricted'],
  ['Remote - Bogota, DC, CO', 'elsewhere', 'remote_country_restricted'],
  ['Remote - London, UK', 'elsewhere', 'remote_country_restricted'],
  ['Remote - Mexico City, MX', 'elsewhere', 'remote_country_restricted'],
  // A US city beside a foreign office is review whichever code its state has.
  ['Remote - San Francisco, CA · Remote - London, UK', 'review', 'remote_scoped_to_other_state'],
  ['Remote - San Francisco, CA; Remote - London, UK', 'review', 'remote_scoped_to_other_state'],
  ['San Francisco, CA · London, UK · Remote', 'review', 'remote_scoped_to_other_state'],
  ['Remote - London, UK; Remote - Denver, CO', 'review', 'remote_scoped_to_other_state'],
  ['Remote - Austin, TX; Remote - London, UK', 'review', 'remote_scoped_to_other_state'],
  ['Remote - London, UK; Remote - Toronto, ON, CA', 'elsewhere', 'remote_country_restricted'],
  // The home country beside another country, a direction or "only", with no city.
  ['United States; Canada', 'review', 'location_names_no_place'],
  ['United States, Canada', 'review', 'location_names_no_place'],
  ['US, Canada', 'review', 'location_names_no_place'],
  ['US / Canada', 'review', 'location_names_no_place'],
  ['United States | Canada | Mexico', 'review', 'location_names_no_place'],
  ['US Only', 'review', 'location_names_no_place'],
  ['US - East', 'review', 'location_names_no_place'],
  ['Flexible - US', 'review', 'location_names_no_place'],
  ['United States; London', 'elsewhere', 'onsite_outside_allowed_locations'],
  ['Canada; Mexico', 'elsewhere', 'onsite_outside_allowed_locations'],
  ['Flexible', 'review', 'location_names_no_place'],
  ['East Coast', 'elsewhere', 'onsite_outside_allowed_locations'],
  ['South Carolina, USA', 'elsewhere', 'onsite_outside_allowed_locations'],
  // Remote and hybrid together name no place.
  ['Remote/Hybrid', 'review', 'location_names_no_place'],
  ['Remote or Hybrid', 'review', 'location_names_no_place'],
  ['Hybrid/Remote', 'review', 'location_names_no_place'],
  ['Remote/Hybrid - US', 'review', 'location_names_no_place'],
  ['Remote/Hybrid - London, UK', 'elsewhere', 'onsite_outside_allowed_locations'],
  ['WFH', 'review', 'remote_eligibility_unconfirmed'],
  ['WFH - US', 'fit', 'remote_region_allowed'],
  // A home state's code in any letter case.
  ['Kennesaw, Ga', 'review', 'onsite_in_home_state'],
  ['kennesaw, ga', 'review', 'onsite_in_home_state'],
  ['Dallas, Tx', 'elsewhere', 'onsite_outside_allowed_locations'],
  ['Remote - New Mexico only', 'review', 'remote_scoped_to_other_state'],
];
for (const [location, tier, reason] of TABLE)
  test(`${JSON.stringify(location)} is ${tier} (${reason})`, () => assert.deepEqual(locationVerdict(gate, location, 'Platform Engineer'), { tier, reason }));

test('without home_states no state is known to be home', () => {
  assert.deepEqual(locationVerdict(bare, 'Remote, GA'), { tier: 'review', reason: 'remote_scoped_to_other_state' });
  assert.deepEqual(locationVerdict(bare, 'Georgia, USA'), { tier: 'review', reason: 'location_names_no_place' });
  assert.deepEqual(locationVerdict(bare, 'Tennessee, USA'), { tier: 'review', reason: 'location_names_no_place' });
  assert.deepEqual(locationVerdict(bare, 'South Carolina, USA'), { tier: 'review', reason: 'location_names_no_place' });
  for (const l of ['Remote - Georgia', 'Remote, Georgia', 'Georgia (Remote)', 'Remote - Georgia, Tennessee', 'GEORGIA - REMOTE'])
    assert.deepEqual(locationVerdict(bare, l), { tier: 'review', reason: 'remote_scoped_to_other_state' }, l);
  assert.deepEqual(locationVerdict(bare, 'Remote - Georgia, Canada'), { tier: 'elsewhere', reason: 'remote_country_restricted' });
  for (const l of ['Nashville, TN', 'Kennesaw, GA', 'Dallas, TX'])
    assert.deepEqual(locationVerdict(bare, l), { tier: 'elsewhere', reason: 'onsite_outside_allowed_locations' }, l);
});
test('a state whose name holds another state is not that state', () => {
  const remote = { workplaceType: 'Remote' };
  for (const [homeStates, rows] of [
    [['Virginia'], [['Remote - West Virginia', 'review', 'remote_scoped_to_other_state'], ['Charleston, West Virginia', 'elsewhere', 'onsite_outside_allowed_locations'], ['Remote - Virginia', 'fit', 'remote_region_allowed'], ['Richmond, Virginia', 'review', 'onsite_in_home_state']]],
    [['West Virginia'], [['Remote - West Virginia', 'fit', 'remote_region_allowed'], ['Remote - Virginia', 'review', 'remote_scoped_to_other_state']]],
    [['Kansas'], [['Remote - Arkansas', 'review', 'remote_scoped_to_other_state'], ['Fayetteville, Arkansas', 'elsewhere', 'onsite_outside_allowed_locations']]],
    [['Arkansas'], [['Remote - Kansas', 'review', 'remote_scoped_to_other_state'], ['Topeka, Kansas', 'elsewhere', 'onsite_outside_allowed_locations']]],
    [['Washington'], [['Remote - Washington', 'fit', 'remote_region_allowed'], ['Remote - Washington, DC', 'review', 'remote_scoped_to_other_state'], ['Washington, D.C.', 'elsewhere', 'onsite_outside_allowed_locations'], ['Tacoma, Washington', 'review', 'onsite_in_home_state']]],
    [['DC'], [['Remote - Washington, DC', 'fit', 'remote_region_allowed'], ['Washington, DC', 'review', 'onsite_in_home_state'], ['Remote - Washington', 'review', 'remote_scoped_to_other_state']]],
  ]) {
    const policy = buildWorkplacePolicy({ ...HOLD, home_states: homeStates });
    for (const [location, tier, reason] of rows)
      assert.deepEqual(locationVerdict(policy, location, '', location.startsWith('Remote') ? remote : {}), { tier, reason }, `${homeStates}: ${location}`);
  }
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
test('under another home country a US state beside the home country does not scope the role', () => {
  const spain = buildWorkplacePolicy({ onsite_locations: ['Barcelona'], remote_countries: ['Spain'], remote_regions: ['Europe'] });
  for (const l of ['Remote - Spain or Tennessee', 'Remote - Spain or Texas', 'Remote - Spain']) assert.deepEqual(locationVerdict(spain, l), { tier: 'fit', reason: 'remote_region_allowed' }, l);
  const handBuilt = Object.assign((location) => spain(location), { homeStates: ['ga'], homeCountryNames: spain.homeCountryNames, homePlaces: spain.homePlaces, geographyText: spain.geographyText });
  assert.deepEqual(locationVerdict(handBuilt, 'Kennesaw, GA'), locationVerdict(spain, 'Kennesaw, GA'));
  assert.deepEqual(locationVerdict(spain, 'Kennesaw, GA'), { tier: 'elsewhere', reason: 'onsite_outside_allowed_locations' });
  assert.deepEqual(locationVerdict(spain, 'Spain; Portugal'), { tier: 'review', reason: 'location_names_no_place' });
  for (const l of ['Texas', 'Georgia', 'Arizona - Home Teleworkers']) assert.deepEqual(locationVerdict(spain, l), { tier: 'elsewhere', reason: 'onsite_outside_allowed_locations' }, l);
});
test('a home town the gate rejects beside another place is review, and the gate still rejects it', () => {
  for (const l of ['San Francisco, CA / Atlanta, GA', 'Atlanta, GA or London, UK', 'Atlanta, GA / London, UK', 'Atlanta; London, UK', 'London, UK · Atlanta', 'Hybrid - Atlanta, GA or Dublin, Ireland',
    'Atlanta · Istanbul, Turkey', 'Atlanta, GA or Istanbul, Turkey', 'Atlanta, GA or Hong Kong', 'Atlanta (ET)', 'Atlanta (EST)', 'Atlanta, GA (ET/CT)']) for (const g of [gate, bare]) {
    assert.deepEqual(locationVerdict(g, l), { tier: 'review', reason: 'onsite_country_restricted' }, l);
    assert.deepEqual(g(l), { eligible: false, reason: 'onsite_country_restricted' }, l);
  }
});
