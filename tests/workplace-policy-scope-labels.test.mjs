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
];
const REJECTED = [
  'Canada-based candidates only: we cannot hire in the US.',
  'Canada-based candidates only: we cannot hire in the US. The salary is $140,000 CAD.',
  '<p>Canada-based candidates only: we cannot hire in the US</p><p>Salary: $140,000 CAD</p>',
  'Canada-based candidates only: we cannot hire in the US\n$140,000 CAD',
  '<p>Canada-based candidates only: must be located in Canada</p><p>Salary: $140,000 CAD</p>',
  'Canada-based candidates only: must be located in Canada\n$140,000 CAD',
  '<p>Canada-based candidates only: see the benefits below</p><p>Salary: $140,000 CAD</p>',
  'Canada-based candidates only: see the benefits below\n$140,000 CAD',
  'Canada-based roles only: $140,000 CAD. You must be based in Canada.',
  'UK applicants only: you must hold a UK passport.',
  'Pay ranges for Mexico only:',
  'You must be based in Canada.',
  'This role is UK only.',
  'Candidates must be located in the United Kingdom.',
  'Canada only.',
  'Hiring in Canada only.',
  'Remote (Canada only): you must live in Canada.',
  'This position is open to residents of Canada only: compensation is $140,000 CAD.',
  'Open to candidates based in Mexico only: MXN 900,000 - 1,200,000.',
  'Canada only: relocation assistance of $10,000 provided.',
  'Canada-based candidates only: please review our privacy policy, we cannot hire in the US',
];
for (const d of ALLOWED) test(`a label before pay or a notice is not a restriction: ${d.slice(0, 60)}`, () => assert.deepEqual(us(d), { eligible: true, reason: 'remote_region_allowed' }));
for (const d of REJECTED) test(`a restriction stays: ${d.slice(0, 60)}`, () => assert.equal(us(d).eligible, false));
test('a description that is not a string does not throw', () => {
  assert.equal(us(12).eligible, true);
  assert.equal(us(['x']).eligible, true);
});
