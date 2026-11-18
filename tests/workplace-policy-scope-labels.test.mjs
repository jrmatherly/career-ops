import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkplacePolicy } from '../providers/_country.mjs';

const gate = buildWorkplacePolicy({ onsite_locations: ['Atlanta', 'Alpharetta', 'Marietta', 'Johns Creek'], remote_countries: ['United States'] });
const us = (description) => gate('Remote - United States', 'Platform Engineer', { description, workplaceType: 'Remote' });

const ALLOWED = [
  'USA-based roles only: The annual base salary for this role is between $133,000 USD and $180,000 USD. Canada-based roles only: The annual base salary for this role is between $125,000 CAD and $169,000 CAD.',
  'Canada-based roles only: $140,000 CAD',
  'Canada-based candidates only: CAD 120,000 to 150,000.',
  'Pay ranges for Mexico only: MXN 900,000 - 1,200,000.',
  'UK applicants only: please read our privacy notice',
  '<p><strong>Canada-based roles only:</strong> The annual base salary for this role is between $125,000 CAD and $169,000 CAD</p>',
  'About the team\n\nCanada-based roles only: The annual base salary for this role is between $125,000 CAD and $175,000 CAD, plus benefits.',
  '<strong>Canada-based roles only</strong>: $140,000 CAD',
  '<p><b>Canada-based roles only</b> : The annual base salary is $140,000 CAD</p>',
  'Canada-based roles only: $140,000 CAD plus restricted stock units.',
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
  ['Canada-based candidates only: you must be located in Canada; salary is $140,000 CAD.', COUNTRY_RESTRICTED],
  ['Canada-based candidates only: we are building a distributed team across North America and Europe this year, and the base salary is $140,000 CAD.', FOREIGN_ONLY],
  ['Canada-based roles only: $140,000 CAD. You must be based in Canada.', COUNTRY_RESTRICTED],
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
];
for (const d of ALLOWED) test(`a label before pay or a notice is not a restriction: ${d.slice(0, 60)}`, () => assert.deepEqual(us(d), { eligible: true, reason: 'remote_region_allowed' }));
for (const [d, reason] of REJECTED) test(`a restriction stays: ${d.slice(0, 90)}`, () => assert.deepEqual(us(d), { eligible: false, reason }));
test('a description that is not a string does not throw', () => {
  assert.equal(us(12).eligible, true);
  assert.equal(us(['x']).eligible, true);
});
