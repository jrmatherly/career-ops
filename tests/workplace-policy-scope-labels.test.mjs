import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkplacePolicy } from '../providers/_country.mjs';

const gate = buildWorkplacePolicy({ onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] });
const us = (description) => gate('Remote - United States', 'Platform Engineer', { description, workplaceType: 'Remote' });

const ALLOWED = [
  'USA-based roles only: The annual base salary for this role is between $133,000 USD and $180,000 USD. Canada-based roles only: The annual base salary for this role is between $125,000 CAD and $169,000 CAD.',
  '<p><strong>USA-based roles only:</strong> $133,000 USD</p><p><strong>Canada-based roles only:</strong> $125,000 CAD</p>',
  '<strong>Canada-based roles only</strong>: $140,000 CAD\n<strong>US-based roles only</strong>: $150,000 USD',
  'Canada-based roles only: $125,000 CAD. UK-based roles only: £87,000 GBP. United States-based roles only: $133,000 USD.',
  'Pay ranges for Mexico only: MXN 900,000. Pay ranges for USA only: $120,000.',
  'For US based roles only: Pursuant to the San Francisco Fair Chance Ordinance, all qualified applicants will be considered.',
  'UK applicants only: please read our privacy notice. US applicants only: please read our CCPA notice.',
  'U.S.-based roles only: $133,000 USD. Canada-based roles only: $125,000 CAD.',
  '<li>USA-based roles only: $133,000 USD</li><li>Canada-based roles only: $125,000 CAD</li>',
  // A home label counts however it is written: after "the", with an entity for a space, or with no colon.
  'Pay ranges for Canada only: CA$100k. Pay ranges for the US only: $120k.',
  '<p>Canada-based roles only: CA$1</p><p>United&nbsp;States based roles only: $2</p>',
  '<p><strong>Canada-based roles only:</strong> CA$1</p><p><strong>US-based&nbsp;roles only:</strong> $2</p>',
  'Canada-based roles only: CA$1.\nUS-based roles only - $2.',
  'USA-based roles <strong>only</strong>: $133,000 USD. Canada-based roles only: $125,000 CAD.',
];
const FOREIGN_ONLY = 'exclusive_foreign_country', COUNTRY_RESTRICTED = 'description_country_restricted';
// [description, the gate reason]
const REJECTED = [
  ['Canada-based candidates only: we cannot hire in the US.', FOREIGN_ONLY],
  ['Canada-based candidates only: we cannot hire in the US. The salary is $140,000 CAD.', FOREIGN_ONLY],
  ['Canada-based candidates only: we cannot hire in the US, and the salary is $140,000 CAD.', FOREIGN_ONLY],
  ['<p>Canada-based candidates only: we cannot hire in the US</p><p>Salary: $140,000 CAD</p>', FOREIGN_ONLY],
  ['Canada-based candidates only: we cannot hire in the US\n$140,000 CAD', FOREIGN_ONLY],
  ['<p>Canada-based candidates only: must be located in Canada</p><p>Salary: $140,000 CAD</p>', FOREIGN_ONLY],
  ['Canada-based candidates only: must be located in Canada\n$140,000 CAD', FOREIGN_ONLY],
  ['<p>Canada-based candidates only: see the benefits below</p><p>Salary: $140,000 CAD</p>', FOREIGN_ONLY],
  ['Canada-based candidates only: see the benefits below\n$140,000 CAD', FOREIGN_ONLY],
  ['Canada-based candidates only: hiring is limited to Canada; salary is $140,000 CAD.', FOREIGN_ONLY],
  ['Canada-based candidates only: hiring is restricted to Canada; salary is $140,000 CAD.', FOREIGN_ONLY],
  ['Canada-based candidates only: no US applicants; salary starts at $140,000 CAD.', FOREIGN_ONLY],
  ['Canada-based candidates only: you must be located in Canada; salary is $140,000 CAD.', FOREIGN_ONLY],
  ['Canada-based candidates only: we are building a distributed team across North America and Europe this year, and the base salary is $140,000 CAD.', FOREIGN_ONLY],
  ['Canada-based roles only: $140,000 CAD. You must be based in Canada.', FOREIGN_ONLY],
  ['UK applicants only: you must hold a UK passport.', FOREIGN_ONLY],
  ['Pay ranges for Mexico only:', FOREIGN_ONLY],
  ['You must be based in Canada.', COUNTRY_RESTRICTED],
  ['This role is UK only.', FOREIGN_ONLY],
  ['Candidates must be located in the United Kingdom.', COUNTRY_RESTRICTED],
  ['Canada only.', FOREIGN_ONLY],
  ['Hiring in Canada only.', FOREIGN_ONLY],
  ['Remote (Canada only): you must live in Canada.', FOREIGN_ONLY],
  ['This position is open to residents of Canada only: compensation is $140,000 CAD.', FOREIGN_ONLY],
  ['Open to candidates based in Mexico only: MXN 900,000 - 1,200,000.', FOREIGN_ONLY],
  ['Canada only: relocation assistance of $10,000 provided.', FOREIGN_ONLY],
  ['Canada-based candidates only: please review our privacy policy, we cannot hire in the US', FOREIGN_ONLY],
  // A lone foreign label is a restriction, whatever follows it.
  ['Canada-based roles only: $140,000 CAD', FOREIGN_ONLY],
  ['Canada-based candidates only: CAD 120,000 to 150,000.', FOREIGN_ONLY],
  ['Pay ranges for Mexico only: MXN 900,000 - 1,200,000.', FOREIGN_ONLY],
  ['UK applicants only: please read our privacy notice', FOREIGN_ONLY],
  ['<p><strong>Canada-based roles only:</strong> The annual base salary for this role is between $125,000 CAD and $169,000 CAD</p>', FOREIGN_ONLY],
  ['About the team\n\nCanada-based roles only: The annual base salary for this role is between $125,000 CAD and $175,000 CAD, plus benefits.', FOREIGN_ONLY],
  ['<strong>Canada-based roles only</strong>: $140,000 CAD', FOREIGN_ONLY],
  ['<p><b>Canada-based roles only</b> : The annual base salary is $140,000 CAD</p>', FOREIGN_ONLY],
  ['Canada-based roles only: $140,000 CAD plus restricted stock units.', FOREIGN_ONLY],
  ['Canada-based candidates only: Apply by Friday; privacy notice below.', FOREIGN_ONLY],
  ['Canada-based roles only: $125,000 CAD. UK-based roles only: £87,000 GBP.', FOREIGN_ONLY],
  // A home label makes the labels headings, and a restriction elsewhere in the posting still counts.
  ['USA-based roles only: $133,000 USD. Canada-based roles only: $125,000 CAD. You must be based in Canada.', COUNTRY_RESTRICTED],
  ['USA-based roles only: $133,000 USD. This role is UK only.', FOREIGN_ONLY],
];
for (const d of ALLOWED) test(`labels are headings beside a home-country label: ${d.slice(0, 60)}`, () => assert.deepEqual(us(d), { eligible: true, reason: 'remote_region_allowed' }));
for (const [d, reason] of REJECTED) test(`a restriction stays: ${d.slice(0, 90)}`, () => assert.deepEqual(us(d), { eligible: false, reason }));
test('a description that is not a string does not throw', () => {
  assert.equal(us(12).eligible, true);
  assert.equal(us(['x']).eligible, true);
});

test('a home label beside a foreign one leaves the sentence after it to the other checks', () => {
  const alone = us('we cannot hire in the US');
  assert.deepEqual(us('USA-based roles only: $1.\n\nCanada-based candidates only: we cannot hire in the US.'), alone);
  assert.equal(alone.eligible, true);
});

test('a lone foreign label is a restriction under a policy whose region covers its country', () => {
  const northAmerica = buildWorkplacePolicy({ onsite_locations: ['Atlanta'], remote_countries: ['United States'], remote_regions: ['North America'] });
  assert.deepEqual(northAmerica('Remote - United States', 'Platform Engineer', { description: 'Canada-based candidates only: candidates must be located in North America; salary is $140,000 CAD.' }),
    { eligible: false, reason: 'exclusive_foreign_country' });
});

test('under another home country its own label is the home label', () => {
  const spain = buildWorkplacePolicy({ onsite_locations: ['Barcelona'], remote_countries: ['Spain'], remote_regions: ['Europe'] });
  const es = (description) => spain('Remote - Spain', 'Platform Engineer', { description });
  assert.equal(es('Spain-based roles only: €50,000. UK-based roles only: £60,000.').eligible, true);
  assert.equal(es('UK-based roles only: £60,000.').eligible, false);
});
