// Under a policy whose onsite countries include the United States, a US state written
// beside the home place is not read as the ISO country that shares its letters or its name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkplacePolicy } from '../providers/_country.mjs';

const us = buildWorkplacePolicy({ onsite_locations: ['Springfield'], remote_countries: ['United States'] });
const verdict = (gate, location) => gate(location, 'Platform Lead');

for (const location of ['Springfield, IL', 'Springfield, MA 01103', 'GA-SPRINGFIELD, 1 MAIN ST', 'Springfield, Georgia', 'Springfield, DE', 'USA - Georgia - Springfield - 30005']) {
  test(`${location} is the home place, not a foreign country`, () => assert.deepEqual(verdict(us, location), { eligible: true, reason: 'onsite_location_allowed' }));
}
// CA, CO, DE, IL and IN, and Georgia alone, never confirm a remote posting: "Berlin, DE" and "Remote, CA" read the same as a US place.
// The states that do are in workplace-policy-us-remote.test.mjs.
for (const location of ['Remote - CO', 'Remote, CA', 'Remote, DE', 'Remote (IN)', 'Remote | DE', 'Remote, Georgia', 'Remote - Tel Aviv, IL', 'Remote - Berlin, DE', 'Remote - Toronto, CA', 'Remote - Bengaluru, IN', 'Remote / Bogota, CO', 'Remote - Tbilisi, Georgia', 'Remote - Munich, DE · Remote - Paris, FR']) {
  test(`${location} is not confirmed as remote in the United States`, () => assert.equal(verdict(us, location).eligible, false));
}
test('a country code that opens a place is not a state', () => {
  assert.equal(us('IN-Bengaluru', 'Senior Engineer (Remote)').eligible, false);
});
test('a remote posting that names the United States beside a state is eligible, as before', () => {
  assert.deepEqual(verdict(us, 'Remote US - CO'), { eligible: true, reason: 'remote_region_allowed' });
});
test('a state at another office does not clear a foreign home-named place', () => {
  const dublin = buildWorkplacePolicy({ onsite_locations: ['Dublin'], remote_countries: ['United States'] });
  assert.deepEqual(verdict(dublin, 'Dublin, Ireland · Austin, TX'), { eligible: false, reason: 'onsite_country_restricted' });
  assert.equal(verdict(dublin, 'Dublin, OH · Austin, TX').eligible, true);
});
test('a country slot after the state name keeps the place foreign', () => {
  const dublin = buildWorkplacePolicy({ onsite_locations: ['Dublin'], remote_countries: ['United States'] });
  assert.deepEqual(verdict(dublin, 'Dublin, Georgia, IE'), { eligible: false, reason: 'onsite_country_restricted' });
  assert.equal(verdict(dublin, 'Dublin, Georgia (IE)').eligible, false);
  assert.equal(verdict(dublin, 'Dublin, ON, CA (Hybrid)').eligible, false);
  assert.equal(verdict(dublin, 'Dublin, Georgia, IE - Hybrid').eligible, false);
  assert.equal(verdict(dublin, 'Dublin, GA - IE').eligible, false);
  assert.equal(verdict(dublin, 'Dublin, GA - DE').eligible, false);
  assert.equal(verdict(dublin, 'Dublin, OH - Georgia').eligible, false);
  assert.equal(verdict(dublin, 'Dublin, DE - DE').eligible, false);
  assert.equal(verdict(dublin, 'GA-Dublin, 1 Main St, Ireland').eligible, false);
  assert.equal(verdict(dublin, 'GA-Dublin, 1 Example St / Ireland').eligible, false);
  assert.equal(verdict(dublin, 'GA-Dublin, 1 Main St (Ireland)').eligible, false);
  assert.equal(verdict(dublin, 'GA-Dublin, 1 Main St - Ireland').eligible, false);
  assert.equal(verdict(dublin, 'IE-Dublin, 1 Main St').eligible, false);
  assert.equal(verdict(dublin, 'GA-DUBLIN, 740 W MAIN ST NW').eligible, true);
  assert.equal(verdict(buildWorkplacePolicy({ onsite_locations: ['Austin'], remote_countries: ['United States'] }), 'Austin, TX - CA').eligible, false);
  assert.deepEqual(verdict(dublin, 'GA-Dublin, Ireland'), { eligible: false, reason: 'onsite_country_restricted' });
  assert.deepEqual(verdict(dublin, 'Dublin / Ireland'), { eligible: false, reason: 'onsite_country_restricted' });
  assert.equal(verdict(dublin, 'Dublin, OH - Hybrid').eligible, true);
  assert.equal(verdict(dublin, 'Dublin, OH (Hybrid)').eligible, true);
  assert.equal(verdict(dublin, 'Dublin, Georgia, US').eligible, true);
});
test('a three-letter country code after the state keeps the place foreign', () => {
  assert.deepEqual(verdict(us, 'Springfield, IL, CAN'), { eligible: false, reason: 'onsite_country_restricted' });
  assert.deepEqual(verdict(us, 'Springfield, IL (CA)'), { eligible: false, reason: 'onsite_country_restricted' });
});
test('the home place beside a foreign-looking second place is still the home place', () => {
  assert.equal(verdict(us, 'Springfield, IL · Tel Aviv, IL').eligible, true);
});
test('one home place in the United States is enough when another is abroad', () => {
  const two = buildWorkplacePolicy({ onsite_locations: ['Chicago', 'Dublin'], remote_countries: ['United States'] });
  assert.deepEqual(verdict(two, 'Chicago, IL · Dublin, Ireland'), { eligible: true, reason: 'onsite_location_allowed' });
  assert.equal(verdict(two, 'Chicago, Canada · Dublin, Ireland').eligible, false);
});
// "/" also joins a place to its country, so it does not split places; this posting stays held, as on main.
test('places joined by a slash are read as one place', () => {
  assert.equal(verdict(us, 'Springfield, IL / Tel Aviv, IL').eligible, false);
});
for (const location of ['Remote in Europe', 'Remote (OK to work anywhere)', 'Remote - Toronto, ON, CA', 'Remote, Bengaluru, Karnataka, IN', 'Remote - UK or DE']) {
  test(`${location} is not confirmed as the United States`, () => assert.equal(verdict(us, location).eligible, false));
}
test('an onsite location that folds to nothing is refused, not matched against every posting', () => {
  assert.throws(() => buildWorkplacePolicy({ onsite_locations: ['\uFF9E'], remote_countries: ['United States'] }), /requires onsite_locations and remote_countries lists/);
  const mixed = buildWorkplacePolicy({ onsite_locations: ['\uFF9E', 'Springfield'], remote_countries: ['United States'] });
  assert.equal(verdict(mixed, '').eligible, false);
});
test('the second home place of a policy is read too', () => {
  const two = buildWorkplacePolicy({ onsite_locations: ['Dublin', 'Chicago'], remote_countries: ['United States'] });
  assert.equal(verdict(two, 'Chicago, IL · Dublin, Ireland').eligible, true);
});
test('a posting listing the home place beside a foreign office is eligible', () => {
  assert.equal(verdict(us, 'Springfield, Georgia · London, United Kingdom · Cincinnati, Ohio').eligible, true);
});
test('a state name alone in its segment is still the country', () => {
  assert.deepEqual(verdict(us, 'Poland · Georgia · Bulgaria · Remote'), { eligible: false, reason: 'remote_country_restricted' });
});
test('a spelled-out foreign country still restricts the home place', () => {
  assert.deepEqual(verdict(us, 'Springfield, Canada'), { eligible: false, reason: 'onsite_country_restricted' });
});
test('a policy without the United States reads CA as Canada, as before', () => {
  const es = buildWorkplacePolicy({ onsite_locations: ['Barcelona'], remote_countries: ['Spain'] });
  assert.deepEqual(verdict(es, 'Barcelona, CA'), { eligible: false, reason: 'onsite_country_restricted' });
});

// A state counts only directly beside the home place name, so each of these keeps its foreign reading.
const policyFor = (home) => buildWorkplacePolicy({ onsite_locations: [home], remote_countries: ['United States'] });
for (const [home, location] of [
  ['Dublin', 'Dublin · London, United Kingdom · Paris, France'],
  ['Athens', 'Athens; London, UK'],
  ['Rome', 'Rome · Milan, Italy'],
  ['Dublin', 'London, United Kingdom; Dublin; Amsterdam, Netherlands'],
  ['Vancouver', 'Vancouver, BC, CA - HQ'],
  ['Vancouver', 'Vancouver, BC, CA - 2 days'],
  ['Vancouver', 'Vancouver, BC, CA +2 more'],
  ['Vancouver', 'Vancouver, BC, CA, +2 more'],
  ['Vancouver', 'Vancouver, BC, CA V6B 1A1'],
  ['Cambridge', 'Cambridge, ON, CA | Hybrid'],
  ['Cambridge', 'Cambridge, ON, CA [Hybrid]'],
  ['Cambridge', 'Cambridge, ON, CA - Hybrid (3 days)'],
  ['Vancouver', 'Vancouver BC, CA'],
  ['Richmond', 'CA-BC-Richmond'],
  ['Cambridge', 'CA-ON-Cambridge'],
  ['Vancouver', 'CA-Vancouver, BC'],
  ['Dublin', 'GA-Dublin, IE'],
  ['Dublin', 'GA-Dublin, 1 Main St, IE'],
  ['Dublin', 'GA-Dublin, 1 Example St / IE'],
  ['Dublin', 'GA-Dublin, 1 Example St - IE'],
  ['Dublin', 'GA-Dublin, 1 Example St (IE)'],
  ['Dublin', 'GA-Dublin, 1 Main St, IE D02 X285'],
  ['Dublin', 'GA-Dublin, 1 Main St [IE]'],
  ['Dublin', 'Dublin, GA [IE]'],
  ['Dublin', 'Dublin, Co Dublin'],
  ['Dublin', 'Dublin, Co Dublin, D02 X285'],
  ['Dublin', 'Dublin, Co Dublin (Hybrid)'],
  ['Dublin', 'Dublin, Co. Dublin · London, UK'],
  ['Dublin', 'Dublin, Co.Dublin · London, UK'],
  ['Washington', 'Washington, Co Down'],
  ['Dublin', 'Dublin, OH | Ireland'],
  ['Dublin', 'Dublin, GA | London, UK'],
  ['Dublin', 'Georgia-Dublin, 1 Main St'],
]) {
  test(`${location} is not the home place ${home} in the United States`, () => assert.equal(verdict(policyFor(home), location).eligible, false));
}
for (const [home, location] of [
  ['Atlanta', 'Atlanta, GA · London, UK'],
  ['Atlanta', 'Atlanta GA'],
  ['Atlanta', 'GA-ATLANTA'],
  ['Atlanta', 'Atlanta Georgia · London, UK'],
  ['Springfield', 'Springfield IN · Berlin, Germany'],
  ['Chicago', 'Chicago, Illinois · London, United Kingdom'],
  ['Albuquerque', 'Albuquerque, New Mexico'],
  ['Atlanta', 'GA-ATLANTA, 740 W PEACHTREE ST NW · IN-INDIANAPOLIS, 220 VIRGINIA AVE'],
]) {
  test(`${location} is the home place ${home}`, () => assert.deepEqual(verdict(policyFor(home), location), { eligible: true, reason: 'onsite_location_allowed' }));
}
