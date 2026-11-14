// Under a policy that allows the United States, a US state in a location is
// the United States, not the ISO country that shares its letters or its name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkplacePolicy } from '../providers/_country.mjs';

const us = buildWorkplacePolicy({ onsite_locations: ['Springfield'], remote_countries: ['United States'] });
const verdict = (gate, location) => gate(location, 'Platform Lead');

for (const location of ['Springfield, IL', 'Springfield, MA 01103', 'GA-SPRINGFIELD, 1 MAIN ST', 'Springfield, Georgia', 'Springfield, DE', 'USA - Georgia - Springfield - 30005']) {
  test(`${location} is the home place, not a foreign country`, () => assert.deepEqual(verdict(us, location), { eligible: true, reason: 'onsite_location_allowed' }));
}
// A state never confirms a remote posting: "Berlin, DE", "Perth, WA" and "Remote, CA" read the same as a US place.
for (const location of ['Remote - CO', 'Remote, CA', 'Remote, DE', 'Remote (IN)', 'Remote | DE', 'Remote, Georgia', 'Remote - Austin, TX', 'Remote - Tel Aviv, IL', 'Remote - Berlin, DE', 'Remote - Toronto, CA', 'Remote - Bengaluru, IN', 'Remote / Bogota, CO', 'Remote - Tbilisi, Georgia', 'Remote - Perth, WA', 'Remote - Milano, MI', 'Remote - Munich, DE · Remote - Paris, FR']) {
  test(`${location} is not confirmed as remote in the United States`, () => assert.equal(verdict(us, location).eligible, false));
}
test('a country code that opens a place is not a state', () => {
  assert.equal(us('IN-Bengaluru', 'Senior Engineer (Remote)').eligible, false);
});
test('a remote posting that names the United States beside a state is eligible, as before', () => {
  assert.deepEqual(verdict(us, 'Remote US - CO'), { eligible: true, reason: 'remote_region_allowed' });
});
test('the home place beside a foreign-looking second place is still the home place', () => {
  assert.equal(verdict(us, 'Springfield, IL / Tel Aviv, IL').eligible, true);
});
for (const location of ['Remote in Europe', 'Springfield or Remote', 'Remote (OK to work anywhere)', 'Remote - Toronto, ON, CA', 'Remote, Bengaluru, Karnataka, IN', 'Remote - UK or DE']) {
  test(`${location} is not confirmed as the United States`, () => assert.equal(verdict(us, location).eligible, false));
}
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
