// Under a policy whose remote countries include the United States, a remote posting
// named by a US state, home-working wording, and a home place written as an address
// are admitted. A policy without the United States reads every one of them as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkplacePolicy } from '../providers/_country.mjs';

const us = buildWorkplacePolicy({ onsite_locations: ['Atlanta', 'Marietta'], remote_countries: ['United States'] });
const es = buildWorkplacePolicy({ onsite_locations: ['Barcelona', 'Atlanta'], remote_countries: ['Spain'], remote_regions: ['Europe'] });
const REMOTE_OK = { eligible: true, reason: 'remote_region_allowed' };
const ONSITE_OK = { eligible: true, reason: 'onsite_location_allowed' };

const stateRemote = [
  'Remote, TN', 'Remote, TX', 'Remote, OK', 'Remote-MO', 'Remote-GA', 'Remote - Texas', 'Remote Kentucky', 'Remote, Pennsylvania',
  'New Jersey - Remote', 'Remote - New Mexico', 'Remote; Orem, UT', 'Remote - Philadelphia, PA', 'Bedford, NH/Remote',
  'Lehi, Utah, Open to Remote', 'Berkeley Heights, New Jersey · Remote, Arizona', 'Remote-MO · Remote-FL · Remote-CA',
  'New York - New York · Virginia - Washington DC Metro - Remote · Georgia - Springfield Metro - Remote',
  'Remote, District of Columbia', 'DISTRICT OF COLUMBIA - VIRTUAL - DC01', 'Remote, DC',
  // A bar or a spaced slash separates places as a middle dot does, so the Canada-or-California "CA" of one place does not refuse the next.
  'Remote-Friendly (Travel-Required) | San Francisco, CA | Seattle, WA', 'Remote / Livingston, NJ / Sunnyvale, CA / Bellevue, WA', 'Remote | AUSTIN, TX',
  // CA, CO, DE, IL and IN are states in a place that names another state.
  'Remote; Colorado Springs, CO', 'Remote - Kansas City, MO or Denver, CO',
  // Between states "and" is the word, not Andorra's three-letter code.
  'Remote (California, Washington, and Oregon Only)', 'Remote (Texas And Florida Only)', 'Remote - TEXAS AND OHIO',
  'Remote - San Francisco, CA, USA', 'Remote - U.S',
  // A list of states: the code beside CA or CO is a state, not a country.
  'Remote (CA, CO, NY, WA)', 'Remote - NY, CA', 'Remote - CO, UT, AZ', 'Remote - New York, NY, CA', 'Remote - TX-CO',
  // A spaced slash separates places, so the US place stands beside the foreign one.
  'Remote - Austin, TX / Toronto, Canada',
];
for (const location of stateRemote) {
  test(`${location} is remote in the United States`, () => assert.deepEqual(us(location, 'Platform Lead'), REMOTE_OK));
  test(`${location} is not eligible under a policy without the United States`, () => assert.equal(es(location, 'Platform Lead').eligible, false));
}
test('a state confirms a posting whose title carries the remote marker', () => {
  assert.deepEqual(us('TEXAS - SITE - TX01', 'Platform Lead (Remote)'), REMOTE_OK);
});
// The country reader stops at "us:" and at "u.s.a" without its last dot.
for (const location of ['Remote - US: Select locations', 'Remote - US: All locations', 'US:Remote', 'Remote - Frequent Travel Required · U.S.A']) {
  test(`${location} names the United States`, () => assert.deepEqual(us(location, 'Platform Lead'), REMOTE_OK));
  test(`${location} is not eligible under a policy without the United States`, () => assert.equal(es(location, 'Platform Lead').eligible, false));
}
test('Georgia is the state where its own code stands in the same place', () => {
  assert.deepEqual(us('GEORGIA - VIRTUAL - GA01', 'Platform Lead'), REMOTE_OK);
  assert.equal(es('GEORGIA - VIRTUAL - GA01', 'Platform Lead (Remote)').eligible, false);
});

const homeWorking = [
  'Work at Home - Kentucky', 'USA Work at Home', 'US-Work at Home', 'PA, Working at Home - Pennsylvania', 'Home Office - US, TX',
  'Springfield, PA (Market St) · Home based-Massachusetts', 'Arizona - Home Teleworkers', 'Home Worker - USA', 'Home-United States',
  'US Virtual Location', 'Chicago, Illinois, United States of America · Utah, United States of America (Virtual)',
  'Work At Home-Idaho · Work At Home-Georgia · Work At Home-New Mexico',
];
for (const location of homeWorking) {
  test(`${location} is home working in the United States`, () => assert.deepEqual(us(location, 'Platform Lead'), REMOTE_OK));
}
// The non-US policy keeps today's reading of the wording: an office role outside its onsite locations.
for (const location of ['Home based - Spain', 'Work at Home - Spain', 'Spain (Virtual)', 'Home Teleworkers, Europe']) {
  test(`${location} is not read as remote under a policy without the United States`, () => {
    assert.deepEqual(es(location, 'Platform Lead'), { eligible: false, reason: 'onsite_outside_allowed_locations' });
  });
}
test('remote countries turn the state rule on, whatever the onsite country', () => {
  const toronto = buildWorkplacePolicy({ onsite_locations: ['Toronto'], onsite_countries: ['Canada'], remote_countries: ['United States'] });
  assert.deepEqual(toronto('Remote, TN', 'Platform Lead'), REMOTE_OK);
});
test('"Home" inside a place name is not home working', () => {
  assert.deepEqual(us('Nursing Home - Dallas, TX', 'Platform Lead'), { eligible: false, reason: 'onsite_outside_allowed_locations' });
});
test('a negated telework marker does not make an office posting remote', () => {
  const atlanta = buildWorkplacePolicy({ onsite_locations: ['Atlanta'], remote_countries: ['United States'] });
  assert.deepEqual(atlanta('Austin, Texas (No telework)', 'Platform Lead'), { eligible: false, reason: 'onsite_outside_allowed_locations' });
  assert.deepEqual(atlanta('Austin, Texas (Telework)', 'Platform Lead'), REMOTE_OK);
});
for (const location of ['Home based - EMEA', 'Home, United Kingdom, HOME BASED', 'Virtual - Germany', 'Work at Home', 'Homewood, AL']) {
  test(`${location} is not home working in the United States`, () => assert.equal(us(location, 'Platform Lead').eligible, false));
}

const homeAddress = [
  'Atlanta, GA preferred, Remote',
  'STORE SUPPORT CENTER, ATLANTA - 9090',
  'Atlanta, Georgia',
  'Springfield · Atlanta · Remote · Princeton',
];
for (const location of homeAddress) {
  test(`${location} is the home place in a posting marked remote`, () => assert.deepEqual(us(location, 'Platform Lead (Remote)'), ONSITE_OK));
}
for (const location of [
  '200 Example Parkway SE Suite 900 Atlanta, GA 30339',
  'New York City, New York · Atlanta, Georgia (675 Example De Leon Ave NE) · Purchase, New York',
  'Denver, 999 18th St, Corp · Atlanta, 75 Fifth, Corp · Beavercreek, 4407 Walnut St., AFS · Beaverton, 15220 NW Example, Corp',
  'Detroit, 1515 Example Avenue, MS · Atlanta, 75 Fifth, Corp · Charlotte, 1120 S Example St., Corp',
]) {
  test(`${location} is the home place`, () => assert.deepEqual(us(location, 'Platform Lead'), ONSITE_OK));
}
test('a home place of a policy without the United States keeps its address words as countries', () => {
  assert.deepEqual(es('200 Example Parkway SE Suite 900 Atlanta, GA 30339', 'Platform Lead'), { eligible: false, reason: 'onsite_country_restricted' });
  assert.deepEqual(es('Denver, 999 18th St, Corp · Atlanta, 75 Fifth, Corp', 'Platform Lead'), { eligible: false, reason: 'onsite_country_restricted' });
  assert.equal(es('Atlanta or Remote', 'Platform Lead').eligible, false);
});
test('a number with one word after it is not a street address', () => {
  const dublin = buildWorkplacePolicy({ onsite_locations: ['Dublin'], remote_countries: ['United States'] });
  assert.deepEqual(dublin('Dublin 2 IE', 'Platform Lead'), { eligible: false, reason: 'onsite_country_restricted' });
  assert.deepEqual(dublin('Dublin, OH 43017 IE', 'Platform Lead'), { eligible: false, reason: 'onsite_country_restricted' });
  assert.deepEqual(dublin('1 Main St Dublin, OH, IE', 'Platform Lead'), { eligible: false, reason: 'onsite_country_restricted' });
});

test('Remote - Austin, TX is read as a US state', () => assert.deepEqual(us('Remote - Austin, TX', 'Platform Lead'), REMOTE_OK));
// Accepted limit, not wanted behaviour: these are foreign and are admitted. The gate knows no cities, so a foreign
// region or country code that shares a state's letters reads as the state when no country is written
// (Western Australia, Milano, Tunisia, Morocco, Indonesia, Gabon, Tamil Nadu, Albania, Bogota's Distrito Capital).
// A wrong drop is never reconsidered and a wrong admit is only evaluated, so the gate admits. A fix that refuses
// any of these without dropping a US posting is an improvement: move it to stillRefused.
for (const location of ['Remote - Perth, WA', 'Remote - Milano, MI', 'Remote - Tunis, TN', 'Remote - Rabat, MA', 'Remote - Jakarta, ID', 'Remote - Libreville, GA', 'Remote - Lagos, LA', 'Remote - Chennai, TN', 'Remote, AL', 'Remote - Bogota, DC', 'Remote | Perth, WA | Sydney, Australia', 'Remote - Chennai, TN, IN']) {
  test(`accepted limit: ${location} is foreign and is admitted as a US state`, () => assert.deepEqual(us(location, 'Platform Lead'), REMOTE_OK));
}
test('a capital state code anywhere in an office posting is not a country', () => {
  const dublin = buildWorkplacePolicy({ onsite_locations: ['Dublin'], remote_countries: ['United States'] });
  assert.deepEqual(dublin('Office: GA-Dublin, 1 Main St', 'Platform Lead'), ONSITE_OK);
  assert.deepEqual(dublin('Dublin or Remote', 'Platform Lead'), ONSITE_OK);
});

// CA, CO, DE, IL and IN are the codes of Canada, Colombia, Germany, Israel and India, and Georgia is a country.
const stillRefused = [
  'Remote - CO', 'Remote, CA', 'Remote CA', 'Remote, DE', 'Remote (IN)', 'Remote - Tel Aviv, IL', 'Remote - Berlin, DE', 'Remote, Georgia',
  'Work At Home-Georgia', 'Remote - Tbilisi, Georgia', 'Remote - Vancouver, BC, CA', 'Remote - Chennai, TN, India', 'Remote - Montana, Bulgaria',
  'Remote, tn', 'Remote (OK to work anywhere)', 'London or Remote', 'LONDON OR REMOTE', 'Remote - Newcastle, NE1 4ST', 'Canada - Remote (ON, AB, BC, or NS Only)',
  'Remote, BR', 'Remote PH', 'Poland · Georgia · Bulgaria · Remote', 'Remote', 'Nationwide Remote',
  'Remote-Friendly (Travel Required) | San Francisco, CA', 'Remote | Toronto, CA | Vancouver, BC', 'Chicago, IL; Remote', 'Remote / Bogota, CO',
  'Remote - CA: Toronto', 'Remote - Perth, WA, Australia | Remote', 'Remote - Berlin, DE | Remote - Paris, FR', 'Remote - U.S.A.F. Academy', 'Remote - Texas and Mexico', 'Remote, AND',
  // Next to a capital code that is no state, CA and CO are the country.
  'Remote - CO-DC-Bogota', 'Remote - Bogota, DC, CO', 'Remote - Delaware, ON, CA', 'Remote - Bogota-DC-CO', 'Remote - CO, DC, Bogota',
  // A timezone is not a state, and a country in square brackets is still a country.
  'Remote - MT working hours', 'Remote - CT hours', 'Remote - Texas [IE]',
];
for (const location of stillRefused) {
  test(`${location} is still not confirmed as remote in the United States`, () => assert.equal(us(location, 'Platform Lead').eligible, false));
}
for (const location of ['Remote - CO', 'Remote - Perth, WA', 'Remote - Berlin, DE', 'Remote - Tbilisi, Georgia', 'Remote - Vancouver, BC, CA', 'Remote, TN', 'Remote - Austin, TX']) {
  test(`${location} is not eligible under a policy without the United States`, () => assert.equal(es(location, 'Platform Lead').eligible, false));
}
for (const location of ['Perth, WA', 'Berlin, DE', 'Tbilisi, Georgia', 'Vancouver, BC, CA']) {
  test(`${location} is an office outside the onsite locations under either policy`, () => {
    assert.deepEqual(es(location, 'Platform Lead'), { eligible: false, reason: 'onsite_outside_allowed_locations' });
    assert.deepEqual(us(location, 'Platform Lead'), { eligible: false, reason: 'onsite_outside_allowed_locations' });
  });
}
test('a foreign country in the same place outranks the state beside it', () => {
  assert.deepEqual(us('Remote - Florianopolis, SC, Brazil', 'Platform Lead'), { eligible: false, reason: 'remote_country_restricted' });
  assert.deepEqual(us('Atlanta, Canada · Remote', 'Platform Lead'), { eligible: false, reason: 'remote_country_restricted' });
});
test('the onsite countries turn on the home-place rules, the remote countries the state-named remote role', () => {
  const mixed = buildWorkplacePolicy({ onsite_locations: ['Atlanta'], onsite_countries: ['United States'], remote_countries: ['Spain'] });
  assert.deepEqual(mixed('Atlanta or Remote', 'Platform Lead'), ONSITE_OK);
  assert.deepEqual(mixed('200 Example Parkway SE Suite 900 Atlanta, GA 30339', 'Platform Lead'), ONSITE_OK);
  assert.equal(mixed('Remote, TN', 'Platform Lead').eligible, false);
  assert.deepEqual(mixed('Work at Home - Texas', 'Platform Lead'), { eligible: false, reason: 'onsite_outside_allowed_locations' });
});
