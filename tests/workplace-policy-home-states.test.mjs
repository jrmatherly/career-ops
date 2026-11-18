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
  for (const key of ['homeStates', 'homeCountryNames', 'homePlaces', 'geographyText']) {
    assert.throws(() => { 'use strict'; home[key] = ['tn']; }, TypeError, key);
    assert.throws(() => Object.defineProperty(home, key, { value: ['tn'] }), TypeError, key);
  }
  assert.deepEqual(Object.keys(home), ['geographyText', 'homePlaces', 'homeStates', 'homeCountryNames']);
  assert.equal(buildWorkplacePolicy(undefined).homeStates, undefined);
});
test('home_states must be a list of US states', () => {
  assert.throws(() => buildWorkplacePolicy({ ...HOLD, home_states: 'GA' }), /workplace_policy\.home_states must be a list/);
  assert.throws(() => buildWorkplacePolicy({ ...HOLD, home_states: ['Ontario'] }), /workplace_policy\.home_states: "Ontario" is not a US state name or code/);
  for (const [entries, typed] of [[[5], '5'], [[null], 'null'], [[''], '""'], [[' '], '" "'], [[['GA']], '["GA"]'], [['GA', 5], '5']])
    assert.throws(() => buildWorkplacePolicy({ ...HOLD, home_states: entries }), { message: `workplace_policy.home_states: ${typed} is not a US state name or code` });
  assert.deepEqual(buildWorkplacePolicy({ ...HOLD, home_states: [] }).homeStates, []);
});
test('validate-portals reports a home_states entry that is not text', async () => {
  const { errors } = await validatePortalsConfig({ location_filter: { workplace_policy: { ...HOLD, home_states: [42, ''] } } });
  assert.deepEqual(errors.filter(e => e.path.includes('home_states')).map(e => e.path), ['location_filter.workplace_policy.home_states[0]', 'location_filter.workplace_policy.home_states[1]']);
});
test('validate-portals reports a home_states entry that is no state once, with the entry as typed', async () => {
  const { errors } = await validatePortalsConfig({ location_filter: { workplace_policy: { ...HOLD, home_states: ['Ontario'] } } });
  assert.deepEqual(errors.filter(e => e.path.startsWith('location_filter')), [{ path: 'location_filter.workplace_policy', message: 'workplace_policy.home_states: "Ontario" is not a US state name or code' }]);
});
test('the gate carries its home places and its place reader', () => {
  assert.deepEqual(home.homePlaces, ['atlanta', 'alpharetta', 'marietta', 'johns creek']);
  assert.ok(Object.isFrozen(home.homePlaces));
  assert.equal(home.geographyText('Remote - Georgia (EST), MT working hours').trim().replace(/ +/g, ' '), 'Remote - Georgia ,');
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
const SPAIN = { onsite_locations: ['Barcelona'], remote_countries: ['Spain'], remote_regions: ['Europe'] };
test('home_states under a policy whose remote countries lack the United States is an error', async () => {
  const message = 'workplace_policy.home_states names US states, and remote_countries does not include the United States, so it would do nothing';
  assert.throws(() => buildWorkplacePolicy({ ...SPAIN, home_states: ['Georgia'] }), { message });
  assert.throws(() => buildWorkplacePolicy({ ...SPAIN, onsite_countries: ['United States'], home_states: ['GA'] }), { message });
  for (const empty of [[], null, undefined]) assert.deepEqual(buildWorkplacePolicy({ ...SPAIN, home_states: empty }).homeStates, []);
  assert.deepEqual(buildWorkplacePolicy({ ...SPAIN, remote_countries: ['Spain', 'US'], home_states: ['Georgia'] }).homeStates, ['ga']);
  const { errors } = await validatePortalsConfig({ location_filter: { workplace_policy: { ...SPAIN, home_states: ['Georgia'] } } });
  assert.deepEqual(errors.filter(e => e.path.startsWith('location_filter')), [{ path: 'location_filter.workplace_policy', message }]);
});
for (const [shape, value] of [['a number', 42], ['a string', 'GA'], ['a mapping', {}]])
  test(`validate-portals reports home_states given as ${shape} once, as not a list`, async () => {
    const { errors } = await validatePortalsConfig({ location_filter: { workplace_policy: { ...HOLD, home_states: value } } });
    assert.deepEqual(errors.filter(e => e.path.startsWith('location_filter')), [{ path: 'location_filter.workplace_policy', message: 'workplace_policy.home_states must be a list' }]);
  });
