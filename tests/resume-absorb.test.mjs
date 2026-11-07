import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseResume } from '../lib/resume/schema.mjs';
import { resumeToCvMarkdown } from '../lib/resume/to-cv-md.mjs';
import { absorb, pairOrphan } from '../lib/resume/absorb.mjs';
import { insertIntoCvSection } from '../add-entry.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/resume/${name}`, import.meta.url), 'utf8');
const sample = () => parseResume(JSON.parse(fixture('sample.json'))).data;

// The prior a second absorb sees: the sample once absorbed, so careerOps.cvStyle is recorded.
function prior() {
  const base = sample();
  return absorb(resumeToCvMarkdown(base), base).data;
}

function edit(md, from, to) {
  const out = md.replace(from, to);
  assert.notEqual(out, md, `edit did not apply: ${from}`);
  return out;
}

const experience = (data, company) => data.sections.experience.items.find((i) => i.company === company);

test('a no-op absorb is deep-equal to the input', () => {
  const base = sample();
  const md = resumeToCvMarkdown(base);
  const first = absorb(md, base);
  assert.equal(first.lossless, true);
  assert.deepEqual({ ...first.data, careerOps: null }, { ...base, careerOps: null }, 'only careerOps.cvStyle is recorded');
  assert.equal(resumeToCvMarkdown(first.data), md);
  const second = absorb(md, first.data);
  assert.equal(second.lossless, true);
  assert.deepEqual(second.data, first.data);
  assert.equal(second.report.changed, 0);
  assert.equal(second.report.added, 0);
  assert.deepEqual(second.report.orphans, []);
  assert.deepEqual(second.report.unparsed, []);
  assert.ok(second.report.kept > 0);
});

test('a changed bullet is one changed entry and the other bullets keep their HTML', () => {
  const p = prior();
  const { data, report, lossless } = absorb(edit(resumeToCvMarkdown(p), 'iteration time by 40%', 'iteration time by 45%'), p);
  assert.equal(lossless, true);
  assert.equal(report.changed, 1);
  const desc = experience(data, 'Cascade Studios').description;
  assert.match(desc, /<li><p>Developed custom editor tools in C\+\+ that reduced level designer iteration time by 45%/);
  assert.ok(desc.includes('<li><p>Lead gameplay programmer on an unannounced AAA action-adventure title built in Unreal Engine 5 for PC and next-gen consoles</p></li>'));
});

test('an added bullet with bold and a link becomes HTML', () => {
  const p = prior();
  const { data, report, lossless } = absorb(edit(resumeToCvMarkdown(p), '- Built the build farm', '- Built the build farm\n- Wrote the **CI** pipeline, see [docs](https://ci.example)'), p);
  assert.equal(lossless, true);
  assert.equal(report.changed, 1);
  const role = experience(data, 'Northwind Games').roles[1];
  assert.equal(role.description, '<p>Joined as the second hire.</p><ul><li><p>Built the build farm</p></li><li><p>Wrote the <strong>CI</strong> pipeline, see <a href="https://ci.example">docs</a></p></li></ul>');
});

test('a deleted bullet is removed from the entry', () => {
  const p = prior();
  const { data, lossless } = absorb(edit(resumeToCvMarkdown(p), /- Collaborated with designers[^\n]*\n/, ''), p);
  assert.equal(lossless, true);
  assert.doesNotMatch(experience(data, 'Cascade Studios').description, /Collaborated with designers/);
});

test('a summary reword rewrites the summary', () => {
  const p = prior();
  const { data, report, lossless } = absorb(edit(resumeToCvMarkdown(p), '**Passionate game developer', '**Game developer'), p);
  assert.equal(lossless, true);
  assert.equal(report.changed, 1);
  assert.match(data.summary.content, /^<p><strong>Game developer with 5\+ years/);
});

test('a skill keyword edit keeps the JSON-only fields', () => {
  const p = prior();
  const { data, lossless } = absorb(edit(resumeToCvMarkdown(p), 'C#, Editor Tools, Performance Profiling', 'C#, Editor Tools, DOTS'), p);
  assert.equal(lossless, true);
  const skill = data.sections.skills.items[0];
  assert.deepEqual(skill.keywords, ['C#', 'Editor Tools', 'DOTS']);
  assert.equal(skill.level, 5);
  assert.equal(skill.proficiency, 'Expert');
});

test("add-entry.mjs's insertIntoCvSection project insert absorbs as an added item", () => {
  const p = prior();
  const md = insertIntoCvSection(resumeToCvMarkdown(p), 'Projects', '- **FraudShield** (Open Source) -- Real-time fraud detection framework');
  const { data, report, lossless } = absorb(md, p);
  assert.equal(lossless, true);
  assert.equal(report.added, 1);
  const added = data.sections.projects.items.at(-1);
  assert.equal(added.name, 'FraudShield');
  assert.equal(added.period, 'Open Source');
  assert.equal(added.description, '<p>Real-time fraud detection framework</p>');
  assert.deepEqual(report.newEntries, [{ section: 'projects', id: added.id, name: 'FraudShield' }]);
});

test('an edit inside a hidden entry keeps hidden', () => {
  const p = prior();
  const { data, lossless } = absorb(edit(resumeToCvMarkdown(p), 'Confidential engine work', 'Confidential engine work on rendering'), p);
  assert.equal(lossless, true);
  const secret = experience(data, 'Secret Corp');
  assert.equal(secret.hidden, true);
  assert.match(secret.description, /Confidential engine work on rendering/);
});

test('an appended job lands at its parsed position', () => {
  const p = prior();
  const md = edit(resumeToCvMarkdown(p), '### Northwind Games -- Remote', '### Fabrikam -- Austin, TX\n\n**Intern**\n2014\n\n- Shipped a mobile port\n\n### Northwind Games -- Remote');
  const { data, report, lossless } = absorb(md, p);
  assert.equal(lossless, true);
  const items = data.sections.experience.items;
  assert.deepEqual(items.map((i) => i.company), ['Cascade Studios', 'Fabrikam', 'Northwind Games', 'Secret Corp']);
  assert.equal(items[1].hidden, false);
  assert.deepEqual(report.newEntries, [{ id: items[1].id, company: 'Fabrikam', position: 'Intern', period: '2014' }]);
  assert.deepEqual(report.orphans, []);
});

test('an en-dash date keeps its text', () => {
  const p = prior();
  const hyphen = absorb(edit(resumeToCvMarkdown(p), 'Mar 2022 – Present', 'Mar 2022 - Present'), p);
  assert.equal(hyphen.lossless, true);
  assert.equal(experience(hyphen.data, 'Cascade Studios').period, 'Mar 2022 - Present');

  const example = absorb(fixture('cv-example-shape.md'), null).data;
  const dashed = absorb(edit(fixture('cv-example-shape.md'), '\n2020-2024\n', '\n2020 – 2024\n'), example);
  assert.equal(dashed.lossless, true);
  assert.equal(dashed.report.changed, 1);
  assert.deepEqual(dashed.report.orphans, []);
  assert.equal(experience(dashed.data, 'TechFin Corp').period, '2020 – 2024');
  assert.equal(experience(parseResume(dashed.data).data, 'TechFin Corp').period, '2020 – 2024', 'the text survives a re-parse');
});

test('a retitle is one changed entry', () => {
  const p = prior();
  const id = experience(p, 'Cascade Studios').id;
  const { data, report, lossless } = absorb(edit(resumeToCvMarkdown(p), '**Senior Game Developer**', '**Senior Gameplay Engineer**'), p);
  assert.equal(lossless, true);
  assert.equal(report.changed, 1);
  assert.deepEqual(report.orphans, []);
  assert.deepEqual(report.newEntries, []);
  assert.equal(experience(data, 'Cascade Studios').id, id);
  assert.equal(experience(data, 'Cascade Studios').position, 'Senior Gameplay Engineer');
});

test('a changed company yields one orphan plus one new entry, and pairOrphan restores the id', () => {
  const p = prior();
  const original = experience(p, 'Cascade Studios');
  const md = edit(resumeToCvMarkdown(p), '### Cascade Studios -- Seattle, WA', '### Cascade Interactive -- Seattle, WA');
  const { data, report, lossless } = absorb(md, p);
  assert.equal(lossless, false);
  assert.equal(report.orphans.length, 1);
  assert.equal(report.newEntries.length, 1);
  assert.equal(report.orphans[0].id, original.id);
  assert.equal(report.newEntries[0].company, 'Cascade Interactive');

  const paired = pairOrphan(data, report.orphans[0].id, report.newEntries[0].id);
  const entry = experience(paired, 'Cascade Interactive');
  assert.equal(entry.id, original.id);
  assert.deepEqual(entry.dates, original.dates);
  assert.equal(experience(paired, 'Cascade Studios'), undefined);
  assert.equal(absorb(md, paired).lossless, true);
  assert.throws(() => pairOrphan(paired, 'no-such-id', entry.id), /no-such-id/);
});

test('a file in cv-example-shape.md with no prior absorbs lossless and records its style', () => {
  const md = fixture('cv-example-shape.md');
  const { data, report, lossless } = absorb(md, null);
  assert.equal(lossless, true);
  assert.deepEqual(report.unparsed, []);
  const style = data.careerOps.cvStyle;
  assert.equal(style.experienceHeading, 'Work Experience');
  assert.equal(style.summaryHeading, 'Professional Summary');
  assert.equal(style.dash, '--');
  assert.deepEqual(style.contactLines, ['Location', 'Email', 'LinkedIn', 'Portfolio', 'GitHub']);
  assert.deepEqual(style.sectionOrder, ['summary', 'experience', 'projects', 'education', 'skills']);
  assert.equal(resumeToCvMarkdown(data), md, 'gen reproduces the file byte for byte');
  assert.equal(data.sections.experience.items.length, 2);
  assert.equal(data.sections.education.items[0].degree, 'MS Computer Science');
  assert.equal(data.sections.education.items[0].school, 'UT Austin');
});

test('a file with a stray paragraph outside any section is not lossless and unparsed names the line', () => {
  const md = edit(fixture('cv-example-shape.md'), '\n## Professional Summary', '\nA stray note nobody filed.\n\n## Professional Summary');
  const { report, lossless } = absorb(md, null);
  assert.equal(lossless, false);
  assert.deepEqual(report.unparsed, [{ line: 9, text: 'A stray note nobody filed.' }]);
});

test('the generated sample absorbs lossless with no prior, through every section row', () => {
  const md = resumeToCvMarkdown(sample());
  const { data, report, lossless } = absorb(md, null);
  assert.equal(lossless, true);
  assert.deepEqual(report.unparsed, []);
  assert.equal(resumeToCvMarkdown(data), md);
  const custom = data.customSections.find((s) => s.title === 'Earlier experience');
  assert.equal(custom.type, 'experience', 'an unknown heading holding ### entries becomes a custom experience section');
  assert.equal(custom.items.length, 2);
  assert.deepEqual(absorb(md, data).data, data, 'a second absorb is a fixed point');
});

test('changed dates yield one orphan carrying the stored id plus one new entry, and pairOrphan makes it lossless', () => {
  const p = absorb(fixture('cv-example-shape.md'), null).data;
  const original = experience(p, 'TechFin Corp');
  const md = edit(fixture('cv-example-shape.md'), '\n2020-2024\n', '\n2021-2024\n');
  const { data, report, lossless } = absorb(md, p);
  assert.equal(lossless, false);
  assert.equal(report.changed, 0);
  assert.equal(report.orphans.length, 1);
  assert.equal(report.orphans[0].id, original.id);
  assert.equal(report.newEntries.length, 1);
  assert.equal(report.newEntries[0].period, '2021-2024');
  assert.equal(absorb(md, pairOrphan(data, report.orphans[0].id, report.newEntries[0].id)).lossless, true);
});

test('a removed entry is one orphan with the stored id and no new entry', () => {
  const p = absorb(fixture('cv-example-shape.md'), null).data;
  const md = edit(fixture('cv-example-shape.md'), /### DataStartup Inc[\s\S]*?(?=## Projects)/, '');
  const { report, lossless } = absorb(md, p);
  assert.equal(lossless, false);
  assert.equal(report.removed, 1);
  assert.equal(report.orphans[0].id, experience(p, 'DataStartup Inc').id);
  assert.deepEqual(report.newEntries, []);
});

test('a hard-wrapped lead paragraph is not lossless though the report is otherwise empty', () => {
  const p = prior();
  const { report, lossless } = absorb(edit(resumeToCvMarkdown(p), 'Joined as the second hire.', 'Joined as the\nsecond hire.'), p);
  assert.equal(lossless, false);
  assert.deepEqual(report.orphans, []);
  assert.deepEqual(report.newEntries, []);
  assert.deepEqual(report.unparsed, []);
});

test('an H1 without the CV prefix absorbs lossless and records titlePrefix false', () => {
  const md = edit(fixture('cv-example-shape.md'), '# CV -- Alex Chen', '# Alex Chen');
  const { data, lossless } = absorb(md, null);
  assert.equal(lossless, true);
  assert.equal(data.basics.name, 'Alex Chen');
  assert.equal(data.careerOps.cvStyle.titlePrefix, false);
  assert.equal(resumeToCvMarkdown(data), md);
  assert.equal(absorb(fixture('cv-example-shape.md'), null).data.careerOps.cvStyle.titlePrefix, true);
  assert.equal(sample().careerOps.cvStyle.titlePrefix, true, 'the default style keeps the prefix');
});

test('the save gate refuses editor drafts whose cv.md cannot absorb back', () => {
  const emptyPosition = prior();
  experience(emptyPosition, 'Cascade Studios').position = '';
  assert.equal(absorb(resumeToCvMarkdown(emptyPosition), emptyPosition).lossless, false, 'an empty position');
  const dashedCompany = prior();
  experience(dashedCompany, 'Cascade Studios').company = 'Cascade -- Studios';
  assert.equal(absorb(resumeToCvMarkdown(dashedCompany), dashedCompany).lossless, false, 'a company containing the dash');
});

test('pairOrphan on a redated role moves it out of its company, and the item goes with its last role', () => {
  const p = prior();
  const northwind = experience(p, 'Northwind Games');
  const roleIds = northwind.roles.map((r) => r.id);
  const once = edit(resumeToCvMarkdown(p), '\n2016 – 2018\n', '\n2015 – 2018\n');
  const first = absorb(once, p);
  assert.deepEqual(first.report.orphans.map((o) => o.id), [roleIds[1]]);
  const paired = pairOrphan(first.data, roleIds[1], first.report.newEntries[0].id);
  assert.deepEqual(experience(paired, 'Northwind Games').roles.map((r) => r.id), [roleIds[0]]);
  assert.equal(absorb(once, paired).lossless, true);

  const twice = edit(once, '\n2018 – 2020\n', '\n2018 – 2021\n');
  const second = absorb(twice, absorb(once, paired).data);
  assert.deepEqual(second.report.orphans.map((o) => o.id), [roleIds[0]]);
  const emptied = pairOrphan(second.data, roleIds[0], second.report.newEntries[0].id);
  assert.equal(emptied.sections.experience.items.some((i) => i.id === northwind.id), false, 'the item left with no roles is removed');
  assert.equal(absorb(twice, emptied).lossless, true);
});

test('a cv.md with CRLF line endings absorbs lossless', () => {
  const { lossless, report } = absorb(fixture('cv-example-shape.md').replace(/\n/g, '\r\n'), null);
  assert.equal(lossless, true);
  assert.deepEqual(report.unparsed, []);
});
