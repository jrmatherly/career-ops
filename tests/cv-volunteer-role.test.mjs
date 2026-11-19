import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';
import { listTemplates } from '../cv-templates.mjs';
import { absorb } from '../lib/resume/absorb.mjs';
import { resumeToCvMarkdown } from '../lib/resume/to-cv-md.mjs';
import { resumeToPayload } from '../lib/resume/to-payload.mjs';
import { parseResume } from '../lib/resume/schema.mjs';
import { payloadToDocx } from '../lib/resume/export/docx.mjs';
import { resumeToJsonResume } from '../lib/resume/export/json-resume.mjs';
import { parseJSONResume } from '../lib/resume/import/json-resume.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ROLELESS = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/cv-volunteer-roleless.json'), 'utf8'));
const ROLE = 'IT Support Volunteer';
const withRole = {
  ...ROLELESS.payload,
  volunteer: [{ org: 'Sample Nonprofit', role: ROLE, location: 'Springfield, ST', dates: '2023 - Present', description: 'Keeps 30 laptops running.' }],
};

const dir = mkdtempSync(join(tmpdir(), 'cv-volunteer-role-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
let n = 0;

const isolatedEnv = (root) => ({ ...process.env, CAREER_OPS_ROOT: root, CAREER_OPS_DATA_DIR: '', CAREER_OPS_PROFILE: '', CAREER_OPS_TRACKER: '' });

function build(payload, { template, markdown = false, root = dir } = {}) {
  const input = join(dir, `in-${++n}.json`);
  const output = join(dir, `out-${n}.${markdown ? 'md' : 'html'}`);
  writeFileSync(input, JSON.stringify(payload));
  const args = markdown ? [input, '--markdown', output] : [input, output];
  const r = spawnSync(process.execPath, ['build-cv-html.mjs', ...args, ...(template ? [template] : [])], { cwd: ROOT, encoding: 'utf8', env: isolatedEnv(root) });
  assert.equal(r.status, 0, r.stderr);
  return readFileSync(output, 'utf8');
}

const volunteerHtml = (html) => html.match(/<!-- VOLUNTEER -->[\s\S]*?(?=<!-- END -->)/)[0];
const lines = (html) => volunteerHtml(html).split(/<\/div>/).map((s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
const DENSE = 'templates/dense/cv-template.dense.html';

test('an entry with no role builds the Volunteer section main built, in HTML and markdown', () => {
  assert.equal(volunteerHtml(build(ROLELESS.payload, { template: DENSE })), ROLELESS.html);
  assert.equal(build(ROLELESS.payload, { template: DENSE, markdown: true }).match(/## Volunteer[\s\S]*$/)[0], ROLELESS.markdown);
});

test('the role is the entry title line in every shipped template, then the organization and dates', () => {
  for (const { name, path } of listTemplates('cv', { dir: join(ROOT, 'templates') })) {
    const text = lines(build(withRole, { template: path }));
    const at = text.indexOf(ROLE);
    assert.equal(text[0], 'Volunteer Experience', name);
    assert.equal(at, 1, `${name}: ${JSON.stringify(text)}`);
    assert.equal(text.slice(at + 1, at + 3).join(' '), 'Sample Nonprofit Springfield, ST | 2023 - Present', name);
  }
});

test('the dense entry gives the role the title class and the org line the dates', () => {
  const html = volunteerHtml(build(withRole, { template: DENSE }));
  assert.match(html, new RegExp(`<div class="edu-title">${ROLE}</div>\\s*</div>\\s*<div class="edu-header">\\s*<div class="edu-org">Sample Nonprofit</div>\\s*<div class="edu-year">Springfield, ST \\| 2023 - Present</div>`));
});

test('the markdown build writes the role as the entry first line', () => {
  const md = build(withRole, { markdown: true }).match(/## Volunteer[\s\S]*$/)[0];
  assert.equal(md, `## Volunteer Experience\n\n**${ROLE}**\n\nSample Nonprofit, Springfield, ST · 2023 - Present\n\nKeeps 30 laptops running.\n`);
});

test('a locked Volunteer section with a role builds in the order cv.md writes it', () => {
  const root = join(dir, 'locked-root');
  mkdirSync(join(root, 'config'), { recursive: true });
  writeFileSync(join(root, 'config', 'profile.yml'), 'cv:\n  locked_sections: [volunteer]\n');
  const [entry] = withRole.volunteer;
  writeFileSync(join(root, 'cv.md'), `# Sample Candidate\n\n## Volunteer\n\n### ${entry.org} — ${entry.location}\n**${entry.role}**\n${entry.dates}\n\n${entry.description}\n`);
  for (const template of [undefined, 'templates/ats/cv-template.ats.html', DENSE]) {
    const text = lines(build(withRole, { template, root }));
    assert.ok(text.indexOf(ROLE) > text.findIndex((l) => l.startsWith('Sample Nonprofit')), `${template ?? 'base'}: ${JSON.stringify(text)}`);
  }
});

const LIST_MD = '# CV — Sample Candidate\n\n## Volunteer\n\n- **Sample Nonprofit**, Springfield, ST (2023 – Present) -- Keeps 30 laptops running.\n';

function withStoredRole() {
  const { data } = absorb(LIST_MD, null);
  data.sections.volunteer.items[0].position = ROLE;
  return data;
}

test('a role survives the resume to cv.md to resume round trip, as a bold line under the heading', () => {
  const md = resumeToCvMarkdown(withStoredRole());
  assert.match(md, /### Sample Nonprofit — Springfield, ST\n\*\*IT Support Volunteer\*\*\n2023 – Present/);
  const back = absorb(md, null);
  assert.equal(back.lossless, true);
  assert.equal(back.data.sections.volunteer.items[0].position, ROLE);
  assert.equal(resumeToCvMarkdown(back.data), md);
});

test('a resume.json written before the field parses with an empty role and keeps the list row', () => {
  const { data } = absorb(LIST_MD, null);
  delete data.sections.volunteer.items[0].position;
  const parsed = parseResume(JSON.parse(JSON.stringify(data)));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.sections.volunteer.items[0].position, '');
  assert.equal(resumeToCvMarkdown(parsed.data), LIST_MD);
});

test('the payload, DOCX and JSON Resume carry the role, and the JSON Resume import keeps it', async () => {
  const data = withStoredRole();
  const { payload } = resumeToPayload(data);
  assert.equal(payload.volunteer[0].role, ROLE);

  const xml = strFromU8(unzipSync(new Uint8Array(await payloadToDocx(payload)))['word/document.xml']);
  const text = xml.replace(/<[^>]+>/g, '\n').split('\n').filter(Boolean);
  assert.equal(text[text.indexOf(ROLE) + 1], 'Sample Nonprofit · Springfield, ST · 2023 – Present');

  const { document } = resumeToJsonResume(data);
  assert.equal(document.volunteer[0].position, ROLE);
  assert.equal(parseJSONResume(document).data.sections.volunteer.items[0].position, ROLE);
});

function factCheck(html, cvMd) {
  const htmlFile = join(dir, `facts-${++n}.html`);
  const source = join(dir, `facts-${n}.md`);
  writeFileSync(htmlFile, html);
  writeFileSync(source, cvMd);
  return spawnSync(process.execPath, ['verify-cv-facts.mjs', htmlFile, '--source', source, '--json'], { cwd: ROOT, encoding: 'utf8', env: isolatedEnv(dir) });
}

// The fixture's employer is not in the cv.md, so the verdict blocks either way: read the facts it names.
function unsupportedVolunteerFacts(html, cvMd) {
  const r = factCheck(html, cvMd);
  const report = JSON.parse(r.stdout);
  return report.unsupportedFacts.filter((f) => f.kind === 'education').map((f) => f.value);
}

test('the fact gate passes a built entry with a role and a location against the cv.md the model writes', () => {
  const data = withStoredRole();
  const cvMd = resumeToCvMarkdown(data);
  const payload = { ...ROLELESS.payload, volunteer: resumeToPayload(data).payload.volunteer };
  assert.equal(payload.volunteer[0].location, 'Springfield, ST');
  assert.deepEqual(unsupportedVolunteerFacts(build(payload, { template: DENSE }), cvMd), []);
});

test('a role on one of several items writes every item as an entry and round-trips', () => {
  const { data } = absorb(`${LIST_MD}- **Second Org**\n- **Third Org** (2020 – 2021)\n`, null);
  data.sections.volunteer.items[1].position = ROLE;
  const md = resumeToCvMarkdown(data);
  assert.match(md, /### Third Org/);
  const back = absorb(md, data);
  assert.equal(back.lossless, true);
  assert.deepEqual(back.data.sections.volunteer.items.map((i) => i.position), ['', ROLE, '']);
  assert.equal(resumeToCvMarkdown(back.data), md);
});

test('rewriting a role-bearing section as list rows drops the role and stays lossless', () => {
  const prior = absorb(resumeToCvMarkdown(withStoredRole()), null).data;
  const back = absorb(LIST_MD, prior);
  assert.equal(back.data.sections.volunteer.items[0].position, '');
  assert.equal(back.lossless, true);
  assert.equal(resumeToCvMarkdown(back.data), LIST_MD);
});

test('a role is escaped in the HTML, and a blank one builds the role-less entry', () => {
  const [entry] = withRole.volunteer;
  const html = volunteerHtml(build({ ...withRole, volunteer: [{ ...entry, role: 'R&D <Lead>' }] }, { template: DENSE }));
  assert.match(html, /<div class="edu-title">R&amp;D &lt;Lead&gt;<\/div>/);
  const { role, ...roleless } = entry;
  const blank = build({ ...withRole, volunteer: [{ ...entry, role: '   ' }] }, { template: DENSE });
  assert.equal(volunteerHtml(blank), volunteerHtml(build({ ...withRole, volunteer: [roleless] }, { template: DENSE })));
});

test('a role-less entry beside one with a role passes the fact gate with its location', () => {
  const { data } = absorb(`${LIST_MD}- **Other Org**, Shelbyville, ST (2020)\n`, null);
  data.sections.volunteer.items[0].position = ROLE;
  const payload = { ...ROLELESS.payload, volunteer: resumeToPayload(data).payload.volunteer };
  const html = build(payload, { template: DENSE });
  assert.match(volunteerHtml(html), /<div class="edu-title">Other Org<\/div>\s*<div class="edu-year">Shelbyville, ST \| 2020<\/div>/);
  assert.deepEqual(unsupportedVolunteerFacts(html, resumeToCvMarkdown(data)), []);
});
