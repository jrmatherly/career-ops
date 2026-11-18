import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkplacePolicy } from '../providers/_country.mjs';
import { validatePortalsConfig } from '../validate-portals.mjs';

const HOLD = { onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] };
const home = buildWorkplacePolicy({ ...HOLD, home_states: ['Georgia'] });
const bare = buildWorkplacePolicy(HOLD);

test('the gate carries its home states and home country names', () => {
  assert.deepEqual(home.homeStates, ['ga']);
  assert.deepEqual(buildWorkplacePolicy({ ...HOLD, home_states: ['ga', 'New York', 'GA', 'DC', 'District of Columbia'] }).homeStates, ['ga', 'ny', 'dc']);
  assert.deepEqual(bare.homeStates, []);
  assert.deepEqual(buildWorkplacePolicy({ ...HOLD, home_states: null }).homeStates, []);
  assert.deepEqual(home.homeCountryNames, ['united states of america', 'united states', 'u.s.a.', 'u.s.', 'usa', 'us']);
  assert.ok(Object.isFrozen(home.homeStates) && Object.isFrozen(home.homeCountryNames));
  assert.equal(buildWorkplacePolicy(undefined).homeStates, undefined);
});
test('home_states must be a list of US states', () => {
  assert.throws(() => buildWorkplacePolicy({ ...HOLD, home_states: 'GA' }), /workplace_policy\.home_states must be a list/);
  assert.throws(() => buildWorkplacePolicy({ ...HOLD, home_states: ['Ontario'] }), /workplace_policy\.home_states: "ontario" is not a US state name or code/);
});
test('validate-portals reports a home_states entry that is not text', async () => {
  const { errors } = await validatePortalsConfig({ location_filter: { workplace_policy: { ...HOLD, home_states: [42, ''] } } });
  assert.deepEqual(errors.filter(e => e.path.includes('home_states')).map(e => e.path), ['location_filter.workplace_policy.home_states[0]', 'location_filter.workplace_policy.home_states[1]']);
});
test('the gate result keeps its two keys', () => assert.deepEqual(home('Remote - United States'), { eligible: true, reason: 'remote_region_allowed' }));
test('Georgia is the state under a policy whose home states include it', () => {
  assert.deepEqual(home('Remote - Georgia'), { eligible: true, reason: 'remote_region_allowed' });
  assert.deepEqual(home('Georgia - Remote; Tennessee - Remote'), { eligible: true, reason: 'remote_region_allowed' });
  assert.deepEqual(home('GEORGIA - REMOTE'), { eligible: true, reason: 'remote_region_allowed' });
  assert.deepEqual(home('Remote - Georgia, Canada'), { eligible: false, reason: 'remote_country_restricted' });
  assert.deepEqual(bare('Remote - Georgia'), { eligible: false, reason: 'remote_country_restricted' });
  assert.deepEqual(home('Tbilisi, Georgia'), { eligible: false, reason: 'onsite_outside_allowed_locations' });
});
