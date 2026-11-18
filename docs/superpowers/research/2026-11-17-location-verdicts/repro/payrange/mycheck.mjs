const [orig, fixed] = await Promise.all([import(process.argv[2]), import(process.argv[3])]);
const policy = { onsite_locations: ['atlanta','alpharetta','marietta','johns creek'], remote_countries: ['United States'] };
const cases = [
  'USA-based roles only: The annual base salary for this role is between $133,000 USD and $180,000 USD. Canada-based roles only: The annual base salary for this role is between $125,000 CAD and $169,000 CAD.',
  'Canada-based roles only: $140,000 CAD',
  'You must be based in Canada.',
  'This role is UK only.',
  'Candidates must be located in the United Kingdom.',
  'Canada-based candidates only: we cannot hire in the US.',
  'We are open to candidates in the US and Canada.',
];
for (const d of cases) {
  const r = m => m.buildWorkplacePolicy(policy)('Remote - United States', 'Engineer', { description: d, workplaceType: 'Remote' }).reason;
  console.log(`${r(orig).padEnd(34)} -> ${r(fixed).padEnd(34)} | ${d.slice(0,60)}`);
}
