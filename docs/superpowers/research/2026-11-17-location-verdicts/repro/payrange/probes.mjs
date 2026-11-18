// Synthetic boilerplate and real-restriction probes against a US-remote posting. usage: node probes.mjs <module.mjs>
const { buildWorkplacePolicy } = await import(process.argv[2]);
const gate = buildWorkplacePolicy({ onsite_locations: ['atlanta', 'alpharetta', 'marietta', 'johns creek'], remote_countries: ['United States'] });
export const probes = [
  // [description, expected eligible, kind]
  ['USA-based roles only: The annual base salary is between $133,000 USD and $186,000 USD. Canada-based roles only: The annual base salary is between $125,000 CAD and $175,000 CAD.', true, 'boilerplate'],
  ['US pay range: $150,000 - $180,000. Canada-based roles only: $140,000 CAD - $170,000 CAD.', true, 'boilerplate'],
  ['For candidates based in Canada only, the pay range is $120,000 - $150,000 CAD.', true, 'boilerplate'],
  ['UK applicants only: please read our candidate privacy notice.', true, 'boilerplate'],
  ['Pay ranges for Mexico only: MXN 900,000 - 1,200,000.', true, 'boilerplate'],
  ['Hiring in India? Visit our India careers page.', true, 'boilerplate'],
  ['We sponsor visas only in the UK.', true, 'boilerplate'],
  ['Our offices are hybrid; this remote role is open to US residents only.', true, 'boilerplate'],
  ['Hybrid work applies only to employees near an office. This role is remote.', true, 'boilerplate'],
  ['This role is open to candidates in the US and Canada.', true, 'real-ok'],
  ['You must be based in Canada.', false, 'real'],
  ['This role is UK only.', false, 'real'],
  ['Candidates must be located in the United Kingdom.', false, 'real'],
  ['Canada only.', false, 'real'],
  ['Open to Canadian residents only.', false, 'real'],
  ['This position is open to candidates in Canada only: we cannot hire in the US.', false, 'real'],
  ['Hiring in Canada only.', false, 'real'],
  ['Remote (Canada only): you must live in Canada.', false, 'real'],
];
const loc = 'Remote - United States';
let bad = 0;
for (const [d, want, kind] of probes) {
  const r = gate(loc, 'Platform Engineer', { description: d, workplaceType: 'Remote' });
  if (r.eligible !== want) bad++;
  console.log(`${r.eligible === want ? 'ok  ' : 'MISS'} ${kind.padEnd(11)} ${String(r.eligible).padEnd(5)} ${r.reason.padEnd(30)} ${d.slice(0, 80)}`);
}
console.log('misses', bad, 'of', probes.length);
