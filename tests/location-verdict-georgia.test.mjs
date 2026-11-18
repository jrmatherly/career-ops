import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkplacePolicy, locationVerdict } from '../providers/_country.mjs';

const HOLD = { onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] };
const gate = buildWorkplacePolicy({ ...HOLD, home_states: ['Georgia'] });
const bare = buildWorkplacePolicy(HOLD);

const ABROAD = ['elsewhere', 'remote_country_restricted'], OFFSITE = ['elsewhere', 'onsite_outside_allowed_locations'];
const REMOTE_FIT = ['fit', 'remote_region_allowed'], ONSITE_FIT = ['fit', 'onsite_location_allowed'];
const OTHER_STATE = ['review', 'remote_scoped_to_other_state'], HOME_STATE = ['review', 'onsite_in_home_state'], NO_PLACE = ['review', 'location_names_no_place'];

// [location, verdict with Georgia as a home state, verdict with no home state]
const TABLE = [
  ['Remote - Tbilisi, Georgia', ABROAD, ABROAD],
  ['Tbilisi, Georgia', OFFSITE, OFFSITE],
  ['Batumi, Georgia · Remote', ABROAD, ABROAD],
  ['Remote - Kutaisi, Georgia', ABROAD, ABROAD],
  ['REMOTE - RUSTAVI, GEORGIA', ABROAD, ABROAD],
  ['Remote - Tbilisí, Georgia', ABROAD, ABROAD],
  ['Remote - Republic of Georgia', ABROAD, ABROAD],
  ['Remote - Georgia (country)', ABROAD, ABROAD],
  ['Remote - Georgia (EU)', ABROAD, ABROAD],
  ['Remote - Georgia, EMEA', ABROAD, ABROAD],
  ['Remote - Georgia, Europe', ABROAD, ABROAD],
  ['Remote - Georgia (Caucasus)', ABROAD, ABROAD],
  ['Remote - Georgia, CIS', ABROAD, ABROAD],
  ['Remote - Georgia, Eastern Europe', ABROAD, ABROAD],
  ['Poland · Georgia · Bulgaria · Romania · Remote', ABROAD, ABROAD],
  ['Remote - Lithuania · Remote - Georgia · Remote - Canada', ABROAD, ABROAD],
  // More Georgian towns, and the capital's other spellings.
  ['Remote - Zugdidi, Georgia', ABROAD, ABROAD],
  ['Remote - Poti, Georgia', ABROAD, ABROAD],
  ['Remote - Gori, Georgia', ABROAD, ABROAD],
  ["Remote - T'bilisi, Georgia", ABROAD, ABROAD],
  ['Remote - Tiflis, Georgia', ABROAD, ABROAD],
  ['Tiflis, Georgia', OFFSITE, OFFSITE],
  ['Remote - Georgia · Remote - Zugdidi', ABROAD, ABROAD],
  // A region outside the United States, a timezone no US state keeps, or an offset east of Greenwich.
  ['Remote - Georgia (CEE)', ABROAD, ABROAD],
  ['Remote - CEE (Georgia)', ABROAD, ABROAD],
  ['Remote - Georgia (MENA)', ABROAD, ABROAD],
  ['Remote - Georgia (Asia)', ABROAD, ABROAD],
  ['Remote - Georgia, Central Asia', ABROAD, ABROAD],
  ['Remote - Georgia, Balkans', ABROAD, ABROAD],
  ['Remote - Georgia (GMT+4)', ABROAD, ABROAD],
  ['Remote - Georgia - UTC+4', ABROAD, ABROAD],
  ['Remote - Georgia (UTC +04:00)', ABROAD, ABROAD],
  ['Remote - Georgia (EET)', ABROAD, ABROAD],
  ['Georgia, Remote (CET)', ABROAD, ABROAD],
  ['Remote - Georgia (GMT+4) · Remote - Armenia (GMT+4)', ABROAD, ABROAD],
  ['Remote - Georgia (UTC-5)', REMOTE_FIT, OTHER_STATE],
  ['Remote - Georgia (GMT-4)', REMOTE_FIT, OTHER_STATE],
  // Square brackets read as round ones.
  ['Remote - Georgia [country]', ABROAD, ABROAD],
  ['Remote - Georgia [the country]', ABROAD, ABROAD],
  ['Remote - Georgia [EU]', ABROAD, ABROAD],
  // The code GA does not make a Georgian city a US place.
  ['Remote - Tbilisi, Georgia (GA)', ABROAD, ABROAD],
  // A timezone phrase in its own place is no state, and a bare MT may be Montana.
  ['Remote - Georgia · MT working hours · Remote - Poland', ABROAD, ABROAD],
  ['Remote - Georgia · MT · Remote - Poland', OTHER_STATE, OTHER_STATE],
  // A US timezone alone in another place is no foreign country beside Georgia.
  ['Remote - Georgia · Remote (EST)', REMOTE_FIT, OTHER_STATE],
  ['Remote - Georgia', REMOTE_FIT, OTHER_STATE],
  ['Remote, Georgia', REMOTE_FIT, OTHER_STATE],
  ['GEORGIA - REMOTE', REMOTE_FIT, OTHER_STATE],
  ['Georgia - Remote; Tennessee - Remote', REMOTE_FIT, OTHER_STATE],
  ['AZ - Scottsdale · Work At Home-Idaho · Work At Home-Georgia · Work At Home-Texas', REMOTE_FIT, OTHER_STATE],
  ['Atlanta, Georgia', ONSITE_FIT, ONSITE_FIT],
  ['ALPHARETTA, GEORGIA · LONDON, , UNITED KINGDOM · CINCINNATI, OHIO', ONSITE_FIT, ONSITE_FIT],
  ['Columbus, Georgia', HOME_STATE, OFFSITE],
  ['Columbus, Georgia · London, United Kingdom', HOME_STATE, OFFSITE],
  ['Remote - Georgia, Canada', ABROAD, ABROAD],
  ['GEORGIA - VIRTUAL - GA01', REMOTE_FIT, OTHER_STATE],
  // A Georgia with a city beside it in a foreign list could be either, so it is never fit and never elsewhere.
  ['Remote - Savannah, Georgia · Remote - Poland', OTHER_STATE, OTHER_STATE],
  // A US state or the home country in another place ties a bare Georgia to the United States.
  ['Remote - Georgia · Remote - Texas · Remote - Canada', REMOTE_FIT, OTHER_STATE],
  ['Remote - Georgia · Remote - Florida', REMOTE_FIT, OTHER_STATE],
  // A code that is also a country is a US place beside a city and tells nothing alone.
  ['Remote - Georgia · San Francisco, CA · Toronto, Canada', REMOTE_FIT, OTHER_STATE],
  ['Remote - Georgia · Denver, CO · London, United Kingdom', REMOTE_FIT, OTHER_STATE],
  ['Remote - Georgia · Remote - Chicago, IL · Remote - Canada', REMOTE_FIT, OTHER_STATE],
  ['Remote - Georgia · Remote - Wilmington, DE · Remote - Canada', REMOTE_FIT, OTHER_STATE],
  ['Remote - Georgia · Vancouver, BC, CA', OTHER_STATE, OTHER_STATE],
  ['Remote - Georgia · Remote - CA', OTHER_STATE, OTHER_STATE],
  ['Remote - Georgia · Remote - CA · Remote - Canada', OTHER_STATE, OTHER_STATE],
  ['Remote - Georgia · Remote - DE', OTHER_STATE, OTHER_STATE],
  ['Remote - Georgia · Remote - IN', OTHER_STATE, OTHER_STATE],
  // With no foreign place in sight Georgia is the state, whatever else cannot be placed.
  ['Remote - Georgia · Remote - Austin', REMOTE_FIT, OTHER_STATE],
  ['Remote - Georgia · Remote - Austin · Remote - Chicago', REMOTE_FIT, OTHER_STATE],
  ['Remote - Georgia · Remote - Warsaw', REMOTE_FIT, OTHER_STATE],
  // A place that cannot be told US from foreign, beside a foreign one, leaves Georgia unsure. A US state in the list makes it the state.
  ['Remote - Georgia · Remote - Austin · Remote - Canada', OTHER_STATE, OTHER_STATE],
  ['Remote - Georgia · Remote - Warsaw · Remote - Canada', OTHER_STATE, OTHER_STATE],
  ['Poland · Georgia · Bulgaria · Isle of Man · Douglas · Isle Of Man · Romania · Remote', OTHER_STATE, OTHER_STATE],
  ['Remote - Georgia · Remote - New Mexico · Remote - Canada', REMOTE_FIT, OTHER_STATE],
  // A country code that is no US state code is foreign, and so is a country's name.
  ['Remote - Georgia · Remote - PL', ABROAD, ABROAD],
  ['Remote - Georgia · Remote - India', ABROAD, ABROAD],
  // Digits beside Georgia are not a word.
  ['100% Remote - Georgia · 100% Remote - Poland', ABROAD, ABROAD],
  // A word beside Georgia that is no home-working word leaves it unsure.
  ['Remote within Georgia · Remote within Poland', OTHER_STATE, OTHER_STATE],
  ['Remote - Georgia based · Remote - Poland', OTHER_STATE, OTHER_STATE],
  ['Remote in Poland · Remote in Georgia', OTHER_STATE, OTHER_STATE],
  // A home place in another part, or a home place or a US state in its own, ties Georgia to the United States.
  ['Remote - Georgia · Remote - Poland · Remote - Alpharetta', REMOTE_FIT, OTHER_STATE],
  ['Remote - Georgia near Atlanta · Remote - Poland', REMOTE_FIT, OTHER_STATE],
  ['Remote - Georgia, Florida · Remote - Poland', REMOTE_FIT, OTHER_STATE],
  // A US state beside a country's name tells nothing.
  ['Remote - Georgia · Remote - Panama City, FL', OTHER_STATE, OTHER_STATE],
  // A country named in full is foreign whatever code stands beside it.
  ['Remote - Georgia · Toronto, CA, Canada', ABROAD, ABROAD],
  // A region or a Georgian city in another place is as foreign as a country.
  ['Remote - EMEA · Remote - Georgia', ABROAD, ABROAD],
  ['Tbilisi · Georgia · Remote', ABROAD, ABROAD],
  ['Remote - Georgia | Remote - Armenia', ABROAD, ABROAD],
  // Beside the country Georgia another state is not home, and the home country still decides.
  ['Remote - Tbilisi, Georgia · Remote - Texas', OTHER_STATE, OTHER_STATE],
  ['Remote - Tbilisi, Georgia or Texas, USA', OTHER_STATE, OTHER_STATE],
  ['Remote - Tbilisi, Georgia or USA', REMOTE_FIT, REMOTE_FIT],
  // Another bare Georgia is not a foreign country.
  ['Remote - Georgia · Remote, Georgia', REMOTE_FIT, OTHER_STATE],
  // On-site, the home country beside a state and another country names no town.
  ['USA · Georgia · Poland', NO_PLACE, NO_PLACE],
  ['USA · Savannah, Georgia · Poland', HOME_STATE, OFFSITE],
  // A list of foreign countries makes a bare Georgia one of them, whatever their spelling.
  ['Poland · Georgia · Turkey · Hong Kong · Czech Republic · Romania · Remote', ABROAD, ABROAD],
  // The US territories are US places, the US Virgin Islands through the home country's name. The British ones are foreign.
  ['Remote - Georgia · Remote - Puerto Rico', REMOTE_FIT, OTHER_STATE],
  ['Remote - Georgia · Remote - Guam', REMOTE_FIT, OTHER_STATE],
  ['Remote - Georgia · Remote - American Samoa', REMOTE_FIT, OTHER_STATE],
  ['Remote - Georgia · Remote - Northern Mariana Islands', REMOTE_FIT, OTHER_STATE],
  ['Remote - Georgia · Remote - British Virgin Islands', ABROAD, ABROAD],
  ['Remote - Georgia · Remote - US Virgin Islands', REMOTE_FIT, REMOTE_FIT],
  ['Remote - Georgia · Remote - Puerto Rico · Remote - Poland', REMOTE_FIT, OTHER_STATE],
  // New England and a town that shares a country's name are not abroad.
  ['Remote - Georgia · Remote - New England', REMOTE_FIT, OTHER_STATE],
  ['Remote - Georgia · Remote - Holland, MI', REMOTE_FIT, OTHER_STATE],
  // On-site, a bare Georgia in a list of foreign countries is not the home state.
  ['Poland · Georgia · Bulgaria', OFFSITE, OFFSITE],
];
for (const [location, home, none] of TABLE) {
  test(`${JSON.stringify(location)} is ${home[0]} with Georgia as a home state`, () => assert.deepEqual(locationVerdict(gate, location), { tier: home[0], reason: home[1] }));
  test(`${JSON.stringify(location)} is ${none[0]} with no home state`, () => assert.deepEqual(locationVerdict(bare, location), { tier: none[0], reason: none[1] }));
}

test('a list that names the United States reads the same with and without the country Georgia', () => {
  for (const g of [gate, bare]) {
    assert.deepEqual(locationVerdict(g, 'Remote - United States · Remote - Georgia · Remote - Poland'), locationVerdict(g, 'Remote - United States · Remote - Poland'));
    assert.deepEqual(locationVerdict(g, 'Remote - United States · Remote - Georgia · Remote - Poland'), { tier: 'fit', reason: 'remote_region_allowed' });
    assert.deepEqual(g('Remote - United States · Remote - Georgia · Remote - Poland'), g('Remote - United States · Remote - Poland'));
  }
});

test('the gate does not read the country Georgia as the home state', () => {
  assert.deepEqual(gate('Remote - Tbilisi, Georgia'), { eligible: false, reason: 'remote_country_restricted' });
  assert.deepEqual(gate('Poland · Georgia · Bulgaria · Romania · Remote'), { eligible: false, reason: 'remote_country_restricted' });
  assert.deepEqual(gate('Remote - Georgia'), { eligible: true, reason: 'remote_region_allowed' });
});

test('the gate answers for a Georgia that is the country or unsure as it does with no home state', () => {
  for (const [location, home] of TABLE) if (home !== REMOTE_FIT) assert.deepEqual(gate(location), bare(location), location);
});

const SPELLINGS = ['Turkey', 'Czech Republic', 'Hong Kong', 'Macau', 'Macao', 'Ivory Coast', 'Burma', 'Myanmar', 'Swaziland', 'East Timor', 'UAE',
  'United Arab Emirates', 'Democratic Republic of the Congo', 'DRC'];
for (const name of SPELLINGS) test(`${name} is a foreign country`, () => {
  for (const g of [gate, bare]) {
    assert.deepEqual(g(`Remote - ${name}`), { eligible: false, reason: 'remote_country_restricted' });
    assert.deepEqual(locationVerdict(g, `Remote - Georgia · Remote - ${name}`), { tier: 'elsewhere', reason: 'remote_country_restricted' });
  }
});

test('a US town that shares a country name stays a US place', () => {
  for (const l of ['Remote - Turkey, TX', 'Remote - Turkey, Texas', 'Remote - Turkey Creek, FL', 'Remote - Holland, MI', 'Remote - Wales, WI', 'Remote - Scotland, PA', 'Remote - Palestine, TX'])
    assert.deepEqual(gate(l), { eligible: true, reason: 'remote_region_allowed' }, l);
  assert.deepEqual(gate('Atlanta · Turkey Creek, FL'), { eligible: true, reason: 'onsite_location_allowed' });
  assert.deepEqual(gate('Atlanta · Istanbul, Turkey'), { eligible: false, reason: 'onsite_country_restricted' });
  assert.deepEqual(gate('Remote - Istanbul, Turkey'), { eligible: false, reason: 'remote_country_restricted' });
  for (const l of ['Remote - Austin, TX or Istanbul, Turkey', 'Remote - Texas or Turkey']) assert.deepEqual(bare(l), { eligible: false, reason: 'remote_country_restricted' }, l);
  assert.deepEqual(gate('Remote - New England'), { eligible: false, reason: 'remote_eligibility_unconfirmed' });
  assert.deepEqual(gate('Remote - England'), { eligible: false, reason: 'remote_country_restricted' });
});

test('a US territory alone is remote_country_restricted at the gate', () => {
  for (const l of ['Remote - Puerto Rico', 'Remote - Guam']) assert.deepEqual(gate(l), { eligible: false, reason: 'remote_country_restricted' }, l);
});

test('an unsure Georgia on-site is review in a home state, and the gate does not pass it', () => {
  assert.deepEqual(gate('Remote - Savannah, Georgia · Remote - Poland'), { eligible: false, reason: 'remote_country_restricted' });
  assert.deepEqual(locationVerdict(gate, 'Savannah, Georgia · Warsaw, Poland'), { tier: 'review', reason: 'onsite_in_home_state' });
});

test('a foreign country in the same part as Georgia is abroad, Turkey included', () => {
  for (const name of ['Turkey', 'Armenia', 'Azerbaijan', 'Russia', 'Poland', 'UAE']) for (const g of [gate, bare]) {
    for (const l of [`Remote - Georgia, ${name}`, `Remote - ${name}, Georgia`, `Remote - Georgia and ${name}`]) {
      assert.deepEqual(locationVerdict(g, l), { tier: 'elsewhere', reason: 'remote_country_restricted' }, l);
      assert.equal(g(l).eligible, false, l);
    }
  }
});

test('Turkey beside a state code or another state name is still the US town', () => {
  assert.deepEqual(locationVerdict(gate, 'Remote - Turkey, NC'), { tier: 'review', reason: 'remote_scoped_to_other_state' });
  assert.deepEqual(locationVerdict(gate, 'Remote - Turkey, GA'), { tier: 'fit', reason: 'remote_region_allowed' });
  assert.deepEqual(locationVerdict(bare, 'Remote - Turkey, GA'), { tier: 'review', reason: 'remote_scoped_to_other_state' });
  assert.deepEqual(locationVerdict(gate, 'Turkey, GA'), { tier: 'review', reason: 'onsite_in_home_state' });
  for (const l of ['Turkey, TX', 'Turkey Creek, FL']) for (const g of [gate, bare]) assert.deepEqual(locationVerdict(g, l), { tier: 'elsewhere', reason: 'onsite_outside_allowed_locations' }, l);
});

const us = (description, location = 'Remote - United States') => [location, 'Platform Engineer', { description, workplaceType: 'Remote' }];

test('DRC and UAE in a description are acronyms, not countries', () => {
  for (const d of ['Candidates must have experience running DRC and LVS checks.', 'Run DRC only after LVS is clean.', 'Experience with UAE Pass is open to discussion'])
    assert.deepEqual(bare(...us(d, 'Remote - US')), { eligible: true, reason: 'remote_region_allowed' }, d);
  for (const l of ['Remote - United Arab Emirates', 'Remote - Democratic Republic of the Congo', 'Remote - UAE', 'Remote - DRC']) assert.deepEqual(bare(l), { eligible: false, reason: 'remote_country_restricted' }, l);
  assert.deepEqual(bare(...us('You must be based in the UAE.')), { eligible: false, reason: 'description_country_restricted' });
});

const HOME_FIT = { tier: 'fit', reason: 'remote_region_allowed' };
// [location, description, the gate reason with no home state]
const GEORGIA_IN_PROSE = [
  ['Remote - Georgia', 'Must be based in Georgia.', 'description_country_restricted'],
  ['Remote - United States', 'Georgia residents only.', 'exclusive_foreign_country'],
  ['Remote - United States', 'Candidates must reside in Georgia or Florida.', 'description_country_restricted'],
  ['Remote (Georgia only)', undefined, 'exclusive_foreign_country'],
  ['Remote - Georgia only', undefined, 'exclusive_foreign_country'],
];
for (const [location, description, reason] of GEORGIA_IN_PROSE) test(`a home state Georgia in a description or an "only" phrase is home: ${location}, ${description}`, () => {
  assert.deepEqual(locationVerdict(gate, location, '', { description }), HOME_FIT);
  assert.deepEqual(gate(location, '', { description }), { eligible: true, reason: 'remote_region_allowed' });
  assert.deepEqual(bare(location, '', { description }), { eligible: false, reason });
});
test('a Georgia the location or the sentence places abroad is still the country in a description', () => {
  assert.deepEqual(locationVerdict(gate, 'Remote - Tbilisi, Georgia', '', { description: 'Must be based in Georgia.' }), { tier: 'elsewhere', reason: 'description_country_restricted' });
  assert.deepEqual(locationVerdict(gate, 'Remote - United States', '', { description: 'Must be based in Tbilisi, Georgia.' }), { tier: 'elsewhere', reason: 'description_location_restricted' });
  assert.deepEqual(locationVerdict(gate, 'Remote - United States', '', { description: 'Open to candidates in the Republic of Georgia only.' }), { tier: 'elsewhere', reason: 'exclusive_foreign_country' });
  assert.deepEqual(locationVerdict(gate, 'Remote - United States', '', { description: 'Canada residents only.' }), { tier: 'elsewhere', reason: 'exclusive_foreign_country' });
});

const US_REMOTE = 'Remote - United States';
const COUNTRY_RESTRICTED = ['elsewhere', 'description_country_restricted'], FOREIGN_ONLY = ['elsewhere', 'exclusive_foreign_country'];
// [location, description, verdict with Georgia as a home state, verdict with no home state]
const GEORGIA_SENTENCES = [
  ['Remote - Georgia', 'Must be based in Georgia or Armenia.', COUNTRY_RESTRICTED, COUNTRY_RESTRICTED],
  ['Remote - Georgia', 'Must be based in Georgia, Armenia or Azerbaijan.', COUNTRY_RESTRICTED, COUNTRY_RESTRICTED],
  ['Remote - Georgia', 'Candidates must reside in Georgia or Ukraine.', COUNTRY_RESTRICTED, COUNTRY_RESTRICTED],
  ['Remote - Georgia', 'We hire only in Georgia, Armenia and Ukraine.', COUNTRY_RESTRICTED, COUNTRY_RESTRICTED],
  ['Remote - Georgia', 'You must be based in Georgia. We are a Tbilisi startup.', COUNTRY_RESTRICTED, COUNTRY_RESTRICTED],
  [US_REMOTE, 'Candidates must be located in Georgia. Tbilisi preferred.', COUNTRY_RESTRICTED, COUNTRY_RESTRICTED],
  [US_REMOTE, 'Must be based in Georgia (the country).', COUNTRY_RESTRICTED, COUNTRY_RESTRICTED],
  [US_REMOTE, 'Must reside in Georgia or Armenia.', COUNTRY_RESTRICTED, COUNTRY_RESTRICTED],
  [US_REMOTE, 'This role is not open to Georgia residents.', COUNTRY_RESTRICTED, COUNTRY_RESTRICTED],
  [US_REMOTE, 'This position is not open to residents of Georgia, Alaska or Hawaii.', ['review', 'home_state_excluded'], COUNTRY_RESTRICTED],
  [US_REMOTE, 'This role is not open to candidates in Georgia.', ['review', 'home_state_excluded'], COUNTRY_RESTRICTED],
  [US_REMOTE, 'Open to residents of all states except Georgia only.', FOREIGN_ONLY, FOREIGN_ONLY],
  [US_REMOTE, 'Must be based outside Georgia.', COUNTRY_RESTRICTED, COUNTRY_RESTRICTED],
  [US_REMOTE, 'Open to candidates in all states excluding Georgia.', ['review', 'home_state_excluded'], COUNTRY_RESTRICTED],
  [US_REMOTE, 'Applicants in Georgia only cannot apply.', FOREIGN_ONLY, FOREIGN_ONLY],
  [US_REMOTE, "Georgia residents only can't apply.", FOREIGN_ONLY, FOREIGN_ONLY],
  [US_REMOTE, 'Georgia residents only are ineligible.', FOREIGN_ONLY, FOREIGN_ONLY],
  [US_REMOTE, 'Georgia residents only, we are unable to sponsor.', FOREIGN_ONLY, FOREIGN_ONLY],
  [US_REMOTE, 'Georgia residents only, exclude contractors.', FOREIGN_ONLY, FOREIGN_ONLY],
  [US_REMOTE, 'Georgia residents only, contractors excluded.', FOREIGN_ONLY, FOREIGN_ONLY],
  [US_REMOTE, 'Georgia residents only, no agencies.', FOREIGN_ONLY, FOREIGN_ONLY],
  // A region word in the sentence keeps its Georgia the country.
  [US_REMOTE, 'You must be based in Georgia, Europe.', COUNTRY_RESTRICTED, COUNTRY_RESTRICTED],
  [US_REMOTE, 'Must be based in Georgia (Caucasus).', COUNTRY_RESTRICTED, COUNTRY_RESTRICTED],
  [US_REMOTE, 'Candidates must reside in Georgia, EMEA.', COUNTRY_RESTRICTED, COUNTRY_RESTRICTED],
  [US_REMOTE, 'Candidates must reside in Georgia (UTC+4).', COUNTRY_RESTRICTED, COUNTRY_RESTRICTED],
  ['Remote - Georgia', 'Georgia (EU) residents only.', COUNTRY_RESTRICTED, COUNTRY_RESTRICTED],
  [US_REMOTE, 'Open to candidates in the country of Georgia only.', FOREIGN_ONLY, FOREIGN_ONLY],
  // The location's own Georgia is the country, so the description's is too.
  ['Poland · Georgia · Bulgaria · Remote', 'Georgia residents only.', FOREIGN_ONLY, FOREIGN_ONLY],
  // New Mexico is a state, not Mexico.
  [US_REMOTE, 'Candidates must reside in Georgia or New Mexico.', REMOTE_FIT, COUNTRY_RESTRICTED],
  [US_REMOTE, 'Must be based in Georgia, New Mexico or Texas.', REMOTE_FIT, COUNTRY_RESTRICTED],
  ['Remote - Tbilisi', 'Georgia residents only.', FOREIGN_ONLY, FOREIGN_ONLY],
  ['Remote - Georgia', 'Must be based in Georgia.', REMOTE_FIT, COUNTRY_RESTRICTED],
  [US_REMOTE, 'Georgia residents only.', REMOTE_FIT, FOREIGN_ONLY],
  [US_REMOTE, 'Candidates must reside in Georgia or Florida.', REMOTE_FIT, COUNTRY_RESTRICTED],
  [US_REMOTE, 'Georgia, Florida or Texas residents only.', REMOTE_FIT, REMOTE_FIT],
  [US_REMOTE, 'Must be based in Georgia (US).', REMOTE_FIT, COUNTRY_RESTRICTED],
  ['Remote (Georgia only)', undefined, REMOTE_FIT, FOREIGN_ONLY],
  ['Remote - Georgia only', undefined, REMOTE_FIT, FOREIGN_ONLY],
  ['Remote - Tbilisi, Georgia', 'Must be based in Georgia.', COUNTRY_RESTRICTED, COUNTRY_RESTRICTED],
  [US_REMOTE, 'Canada residents only.', FOREIGN_ONLY, FOREIGN_ONLY],
  [US_REMOTE, 'Must be based in Canada. Our Georgia office is closed.', COUNTRY_RESTRICTED, COUNTRY_RESTRICTED],
  // A home state shut out of hiring is refused. With no home state the sentence is not read.
  [US_REMOTE, 'Not available in Georgia.', ['review', 'home_state_excluded'], REMOTE_FIT],
];
for (const [location, description, [tier, reason], [bareTier, bareReason]] of GEORGIA_SENTENCES) test(`Georgia is home in a sentence only with no other country, no exclusion and no Georgian place: ${location}, ${description}`, () => {
  const offer = { ...(description === undefined ? {} : { description }), workplaceType: 'Remote' };
  assert.deepEqual(locationVerdict(gate, location, '', offer), { tier, reason });
  assert.deepEqual(locationVerdict(bare, location, '', offer), { tier: bareTier, reason: bareReason });
});

test('a Georgian city in another place makes a bare Georgia the country', () => {
  for (const [withGeorgia, without] of [
    ['Remote - Georgia · Remote - Texas · Remote - Tbilisi', 'Remote - Texas · Remote - Tbilisi'],
    ['Remote - Georgia · Remote - Puerto Rico · Remote - Tbilisi', 'Remote - Puerto Rico · Remote - Tbilisi'],
    ['Remote - Georgia · Remote - Florida · Remote - Batumi', 'Remote - Florida · Remote - Batumi'],
    ['Remote - Georgia · Remote - Texas · Remote - Republic of Georgia', 'Remote - Texas · Remote - Republic of Georgia'],
  ]) for (const g of [gate, bare]) assert.deepEqual(locationVerdict(g, withGeorgia), locationVerdict(g, without), withGeorgia);
  assert.deepEqual(locationVerdict(gate, 'Remote - Georgia · Remote - Texas · Remote - Tbilisi'), { tier: 'review', reason: 'remote_scoped_to_other_state' });
  assert.deepEqual(locationVerdict(gate, 'Remote - Georgia · Remote - Puerto Rico · Remote - Tbilisi'), { tier: 'review', reason: 'remote_scoped_to_other_state' });
  assert.deepEqual(locationVerdict(gate, 'Remote - Georgia · Remote - Tbilisi'), { tier: 'elsewhere', reason: 'remote_country_restricted' });
  assert.deepEqual(locationVerdict(gate, 'Atlanta, GA · Tbilisi, Georgia'), { tier: 'fit', reason: 'onsite_location_allowed' });
});

// [location, title, description, verdict with Georgia as a home state, verdict with no home state]
const GEORGIA_CONTEXT = [
  ['Remote, Georgia', '', 'Join our growing team in Tbilisi.', ABROAD, ABROAD],
  ['Remote, Georgia', '', 'We are a Georgian company headquartered in Batumi.', ABROAD, ABROAD],
  ['Remote, Georgia', '', 'Work permit for Georgia (country) required.', ABROAD, ABROAD],
  ['Remote, Georgia', 'Engineer (Tbilisi)', undefined, ABROAD, ABROAD],
  ['Remote, Georgia', 'Engineer - Georgia (EMEA)', undefined, OTHER_STATE, OTHER_STATE],
  ['Remote, Georgia', 'Engineer, EMEA', undefined, OTHER_STATE, OTHER_STATE],
  ['Remote, Georgia', '', 'Our Georgia (EMEA) hub is growing.', OTHER_STATE, OTHER_STATE],
  ['Remote - Savannah, Georgia', '', 'We have offices in Savannah and Tbilisi.', OTHER_STATE, OTHER_STATE],
  // A region word in a sentence that does not name Georgia tells nothing about it.
  ['Remote, Georgia', '', 'We serve customers across EMEA.', REMOTE_FIT, OTHER_STATE],
  ['Remote, Georgia', '', 'Our team works from Georgia. We serve customers across EMEA.', REMOTE_FIT, OTHER_STATE],
  // A US place in the location still decides.
  ['Remote - Georgia · Remote - Texas', 'Engineer, EMEA', undefined, REMOTE_FIT, OTHER_STATE],
  ['Remote - Georgia, USA', '', 'Join our growing team in Tbilisi.', REMOTE_FIT, REMOTE_FIT],
  ['Atlanta, Georgia', 'Engineer (Tbilisi)', undefined, ONSITE_FIT, ONSITE_FIT],
  // A Georgian place in the title keeps a description's Georgia the country.
  [US_REMOTE, 'Engineer (Tbilisi)', 'Georgia residents only.', FOREIGN_ONLY, FOREIGN_ONLY],
];
for (const [location, title, description, [tier, reason], [bareTier, bareReason]] of GEORGIA_CONTEXT) test(`the title and the description place a location's Georgia: ${location}, ${title}, ${description}`, () => {
  const offer = description === undefined ? {} : { description };
  assert.deepEqual(locationVerdict(gate, location, title, offer), { tier, reason });
  assert.deepEqual(locationVerdict(bare, location, title, offer), { tier: bareTier, reason: bareReason });
  if (tier !== 'fit') assert.equal(gate(location, title, offer).eligible, false);
});
