import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkplacePolicy, locationVerdict } from '../providers/_country.mjs';

const HOLD = { onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] };
const gate = buildWorkplacePolicy({ ...HOLD, home_states: ['Georgia'] });

const FIT = { tier: 'fit', reason: 'remote_region_allowed' };
const OTHER_STATE = { tier: 'review', reason: 'remote_scoped_to_other_state' };
const ABROAD = { tier: 'elsewhere', reason: 'remote_country_restricted' };
const rows = (name, expected, locations) => test(name, () => { for (const l of locations) assert.deepEqual(locationVerdict(gate, l), expected, l); });

rows('letter case is judged per place, so a code after a bar or a spaced slash is a state', OTHER_STATE, ['Remote | TN', 'Remote / TX']);
rows('a home state after a bar is home', FIT, ['Remote | GA', 'Remote / GA']);
rows('a place in capitals after a bar does not borrow lower case from a place that names somewhere else', OTHER_STATE, ['Remote - Canada | LIBREVILLE, GA', 'Remote - Canada / LIBREVILLE, GA']);
test('the gate does not read a state code in capitals beside another named place', () =>
  assert.deepEqual(gate('Remote - Canada | LIBREVILLE, GA'), { eligible: false, reason: 'remote_country_restricted' }));
rows('a timezone phrase is not a state', FIT, ['Remote - US (CT hours)', 'Remote - United States, MT working hours', 'REMOTE - UNITED STATES (CT HOURS)']);
rows('a bare code after the country is a state', OTHER_STATE, ['Remote - United States (CT)', 'REMOTE - UNITED STATES (CT)']);
rows('a state code in a place written all in capitals is review, not Tunisia', OTHER_STATE, ['REMOTE, TN', 'Remote; TN', 'Remote · TN', 'REMOTE, GA', 'REMOTE - GA', 'REMOTE | GA', 'REMOTE - LIBREVILLE, GA']);
rows('a code that is also a country, beside the home country, is review', OTHER_STATE,
  ['Remote - US, CA', 'Remote - USA, CO', 'Remote - United States, IN', 'United States, CA - Remote', 'REMOTE - CA, USA', 'Remote, CA, USA']);
rows('a home state beside the home country is home in capitals too', FIT, ['REMOTE - GA, USA', 'Remote - USA, GA']);
rows('a slash between the home country and a code is two countries', FIT, ['Remote - US/CA']);
rows('a code that is also a country, with no home country beside it, is the country', ABROAD, ['Remote - CA', 'Remote, CO', 'REMOTE - CA', 'Remote, Canada']);
rows('a foreign country beside a capital state code is still abroad', ABROAD, ['REMOTE - UK OR IE', 'REMOTE - TN, TUNISIA', 'REMOTE - PA, PERU']);

rows('a US timezone abbreviation beside a US place is not a country', FIT,
  ['Remote - Georgia (EST)', 'Remote - Georgia (ET)', 'Remote - United States (EST)', 'Remote - US - PST', 'Remote - Georgia, EDT', 'Remote - Georgia (PT)', 'Remote - GA (CST)', 'Remote - Georgia - EST', 'Remote - Georgia, PT']);
rows('a state with its timezone is still another state', OTHER_STATE, ['Remote - Florida (EST)', 'Remote - Texas, CDT', 'Remote - United States (CT)', 'Remote - Arizona (MST)', 'Remote - Oregon - PT', 'Remote - Florida, ET', 'Remote - Georgia (EST) · Remote - Estonia']);
rows('a timezone abbreviation with no US place beside it is the country code', ABROAD,
  ['Remote - Estonia', 'Remote - EST', 'Remote - Ethiopia', 'Remote (Estonia)', 'Remote - PT', 'Remote (EST)', 'Remote - Tallinn, EST', 'Remote - Lisbon (PT)']);
test('an on-site Estonian code is Estonia', () =>
  assert.deepEqual(locationVerdict(gate, 'Tallinn, EST'), { tier: 'elsewhere', reason: 'onsite_outside_allowed_locations' }));

test('the gate alone admits a state code after a bar and rejects one in a place written in capitals', () => {
  for (const l of ['Remote | TN', 'Remote / TX', 'Remote - US (CT hours)', 'Remote - US, CA', 'REMOTE - CA, USA', 'REMOTE - UNITED STATES (CT)'])
    assert.deepEqual(gate(l), { eligible: true, reason: 'remote_region_allowed' }, l);
  for (const l of ['REMOTE, TN', 'Remote; TN', 'Remote · TN', 'Remote - CA'])
    assert.deepEqual(gate(l), { eligible: false, reason: 'remote_country_restricted' }, l);
});

test('an offer of null does not throw', () =>
  assert.deepEqual(locationVerdict(gate, 'Remote', '', null), { tier: 'review', reason: 'remote_eligibility_unconfirmed' }));

test('a hand-built gate with only its home states and country names still gets an answer', () => {
  const plain = Object.assign(() => ({ eligible: true, reason: 'remote_region_allowed' }), { homeStates: ['ga'], homeCountryNames: ['united states', 'usa', 'us'] });
  assert.deepEqual(locationVerdict(plain, 'Remote | TN'), OTHER_STATE);
  assert.deepEqual(locationVerdict(plain, 'Remote - US, CA'), OTHER_STATE);
  assert.deepEqual(locationVerdict(plain, 'Remote - United States'), FIT);
  assert.deepEqual(locationVerdict(plain, 'Remote - Georgia · Remote - Poland'), FIT);
  assert.deepEqual(locationVerdict(() => ({ eligible: false, reason: 'remote_country_restricted' }), 'REMOTE, TN'), ABROAD);
  assert.deepEqual(locationVerdict(() => ({ eligible: true, reason: 'remote_region_allowed' }), 'REMOTE - CA, 2 LOCATIONS'), FIT);
});

test('a home place with its state and a US timezone abbreviation is the home place', () => {
  for (const l of ['Atlanta, GA (ET)', 'Atlanta, GA (EST)', 'Hybrid - Atlanta, GA (ET)', 'Atlanta, Georgia (ET)', 'Alpharetta, GA - EST', 'Atlanta, GA (EST/EDT)', 'Atlanta, GA (EST / EDT)']) {
    assert.deepEqual(gate(l), { eligible: true, reason: 'onsite_location_allowed' }, l);
    assert.deepEqual(locationVerdict(gate, l), { tier: 'fit', reason: 'onsite_location_allowed' }, l);
  }
  assert.deepEqual(locationVerdict(gate, 'Savannah, GA (EST)'), { tier: 'review', reason: 'onsite_in_home_state' });
  assert.deepEqual(locationVerdict(gate, 'Dallas, TX (CST)'), { tier: 'elsewhere', reason: 'onsite_outside_allowed_locations' });
  assert.deepEqual(gate('Atlanta, GA · Tallinn, Estonia'), { eligible: true, reason: 'onsite_location_allowed' });
});
rows('timezone abbreviations joined by a slash are stripped together', FIT, ['Remote - Georgia (EST/CST)', 'Remote - Georgia - EST/EDT', 'Remote - Georgia (EST / EDT)']);
rows('a spaced slash inside brackets does not split the place', OTHER_STATE, ['Remote - Texas (EST / CST)', 'Remote - Texas (EST / EDT)', 'Remote - Florida (ET / CT) / Remote - Texas']);
test('a timezone code with no US state beside it is still the country on-site', () => {
  for (const l of ['Tallinn, Estonia', 'Tallinn, EST', 'Addis Ababa, ET', 'Lisbon, PT'])
    assert.deepEqual(locationVerdict(gate, l), { tier: 'elsewhere', reason: 'onsite_outside_allowed_locations' }, l);
  assert.deepEqual(locationVerdict(gate, 'Remote, PT'), ABROAD);
  const spain = buildWorkplacePolicy({ onsite_locations: ['Barcelona'], remote_countries: ['Spain'], remote_regions: ['Europe'] });
  assert.deepEqual(spain('Barcelona, Spain (CET)'), { eligible: true, reason: 'onsite_location_allowed' });
  assert.deepEqual(spain('Barcelona (EST)'), { eligible: false, reason: 'onsite_country_restricted' });
  assert.deepEqual(spain('Remote - Spain (EST)'), { eligible: true, reason: 'remote_region_allowed' });
  assert.deepEqual(spain('Lisbon, PT'), { eligible: false, reason: 'onsite_outside_allowed_locations' });
});
