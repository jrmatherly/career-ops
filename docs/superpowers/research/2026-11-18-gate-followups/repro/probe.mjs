// usage: node probe.mjs <module.mjs>
const { buildWorkplacePolicy, locationVerdict } = await import(process.argv[2]);
const base = { onsite_locations: ['atlanta', 'alpharetta', 'marietta', 'johns creek'], remote_countries: ['United States'] };
const ga = buildWorkplacePolicy({ ...base, home_states: ['Georgia'] });
const na = buildWorkplacePolicy({ ...base, home_states: ['Georgia'], remote_regions: ['North America'] });
const row = (group, gate, location, description = '', title = '') => {
  const g = gate(location, title, { description }), v = locationVerdict(gate, location, title, { description });
  console.log([group, JSON.stringify(location), JSON.stringify(description), g.eligible ? 'ELIG' : 'no', g.reason, v.tier, v.reason].join(' | '));
};
const US = 'Remote - United States';
for (const d of [
  'Georgia residents are not eligible.', 'Not available in Georgia.', 'Open to all US states except Georgia.',
  'We are unable to hire in the following states: Georgia, Hawaii, Alaska.', 'This role is not open to Georgia residents.',
  'Excluding Georgia and Texas.', 'Not eligible in: CA, CO, GA, NY.', 'We cannot hire in Alabama, Georgia or Hawaii.',
  'This position is not available to residents of Georgia.', 'Georgia Tech alumni are not rare here.',
  'We do not discriminate. Our Georgia office is growing.', 'Not available in Texas.', 'Colorado residents are not eligible.',
]) row('home-state-excl', ga, US, d);
for (const d of [
  'Canada-based candidates only: Apply by Friday; privacy notice below.',
  'Canada-based roles only: $140,000 CAD',
  'Canada-based roles only: the annual base salary is $140,000 CAD.',
  'Canada-based candidates only: we cannot hire in the US.',
  'UK applicants only: please read our privacy notice',
  'Pay ranges for Mexico only: $40,000 MXN',
  '<strong>Canada-based roles only</strong>: $140,000 CAD',
  'México-based roles only: $40,000 MXN',
  'Canada-based candidates only: must be located in Ontario. Salary $140,000 CAD.',
  'Canada-based candidates only: Toronto residents preferred, $140,000 CAD',
]) row('pay-label', ga, US, d);
row('pay-label-na', na, US, 'Canada-based candidates only: candidates must be located in North America; salary is $140,000 CAD.');
for (const d of [
  'Candidates must be willing to quit legacy tooling cold turkey', 'We are hiring only in Canada to work with US.',
  'United States and Canada residents only.', 'This position is open to candidates in the US and Canada only.', 'Canada and US only.',
  'Engineer (Belarus and Canada roles only)', 'New England roles only.', 'New Mexico residents only.',
  'Must be located in the Eastern Time Zone.', 'Must reside within 50 miles of Atlanta.', 'Candidates must be based in North America.',
  'Must be located in one of the following states: Georgia, Florida, Texas.', 'Must be based in GA.', 'Applicants must live in the state of Georgia.',
  'Excluding US holidays, you work a normal week.', 'Must be based in Georgia; relocation assistance is not provided.',
]) row('desc', ga, US, d);
row('desc', ga, 'Remote, Georgia', 'We have offices in Atlanta and Tbilisi.');
for (const l of [
  'Atlanta (Georgia)', 'Atlanta - Georgia', 'Atlanta (ET)', 'Remote - EST', 'Remote - ET', 'Remote, CA', 'Remote - DE', 'Remote - IL', 'N/A', 'Flexible', 'Not specified', 'See description', 'East Coast',
  'Remote - Georgia · Toronto, CA', 'Remote - Georgia · Remote - Warsaw', 'Remote - Georgia · Remote - Holland', 'Remote - Georgia (ET/CT)', 'Remote - Georgia [EST]', 'Remote - Georgia (EST / EDT)',
  'Remote - Georgia · Remote - Texas · Remote - Europe', 'Remote - Savannah, Georgia · Remote - Texas · Remote - Tbilisi', 'Remote - Georgia [country]', 'Remote - Georgia · MT working hours · Remote - Poland',
  'Remote - Canada | LIBREVILLE, GA', 'Remote - Canada · Remote not available - Texas', 'Remote - United States / Remote not available - London, UK', 'Remote - US , CA', 'Remote - United States or Texas',
  'Remote - Tbilisi, Georgia (GA) · Remote - Texas', 'Telecommuting is not available - Dallas, TX', 'Remote - Puerto Rico', 'San Juan, PR', 'Atlanta, GA / London, UK', 'Atlanta, GA - Lisbon, Portugal', 'Chicago, IL / Remote', 'Remote - Tbilisi, GA', 'REMOTE, GA',
]) row('loc', ga, l);
row('nested', ga, US, '', ''); { const v = locationVerdict(ga, 'Remote, Georgia', '', { geographyEvidence: { description: 'We have offices in Atlanta and Tbilisi.' } }); console.log('nested | geographyEvidence.description |', v.tier, v.reason); }
{ const none = buildWorkplacePolicy(undefined); const v = locationVerdict(none, 'Berlin, Germany'); console.log('policy_absent |', v.tier, v.reason); }
