import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rmSync } from './helpers.mjs';
import { defaultResumeData, parseResume, readLegacyDates } from '../lib/resume/schema.mjs';
import { CHECK_RULE_IDS, checkResume } from '../lib/resume/check.mjs';
import { layoutFor, TEMPLATE_LAYOUTS } from '../lib/resume/template-layouts.mjs';

const CLI = fileURLToPath(new URL('../resume.mjs', import.meta.url));
const SAMPLE = fileURLToPath(new URL('./fixtures/resume/sample.json', import.meta.url));
const EXAMPLE = fileURLToPath(new URL('./fixtures/resume/cv-example-shape.md', import.meta.url));
const NOW = new Date('2024-06-15T00:00:00Z');
// RR's azurill prints a sidebar column; onyx is one column. Career-ops has no such template, so tests inject them.
const LAYOUTS = {
  azurill: { columns: 2, sidebar: true, atsSafe: false },
  onyx: { columns: 1, sidebar: false, atsSafe: true },
};

const parsed = (json) => {
  const result = parseResume(json);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return result.data;
};
const sample = () => JSON.parse(readFileSync(SAMPLE, 'utf8'));

const experienceItem = (overrides = {}) => ({
  id: 'exp-1',
  hidden: false,
  company: 'Analytical Engines',
  position: 'Engineer',
  location: 'London',
  period: 'Jan 2020 - Present',
  website: { url: '', label: '', inlineLink: false },
  description: '<p>Designed and shipped the difference engine.</p>',
  roles: [],
  ...overrides,
});

const skillItem = () => ({ id: 's1', hidden: false, icon: '', iconColor: '', name: 'Mathematics', proficiency: '', level: 0, keywords: [] });

function makeResume(mutate = () => undefined) {
  const data = parsed(structuredClone(defaultResumeData));
  data.basics.name = 'Test Person';
  data.basics.email = 'person@example.com';
  data.basics.phone = '+1 555 0100';
  data.basics.location = 'Springfield, USA';
  data.sections.experience.items = [experienceItem()];
  data.metadata.layout.pages = [{ fullWidth: false, main: ['experience'], sidebar: [] }];
  mutate(data);
  return data;
}

const seen = new Set();
const lint = (data, opts = {}) => {
  const report = checkResume(data, { now: NOW, layout: LAYOUTS[data.careerOps.template], ...opts });
  for (const f of [...report.findings, ...report.ignored]) seen.add(f.id);
  return report;
};
const codesOf = (data) => lint(data).findings.map((f) => f.id);
const strip = ({ id, severity, path, key, params }) => ({ id, severity, path, key, ...(params ? { params } : {}) });

test('reports nothing on a well-formed resume', () => {
  const report = lint(makeResume());
  assert.deepEqual(report.findings, []);
  assert.equal(report.score, 100);
});

test('scores the share of rules with no open finding, and groups them by category', () => {
  const report = lint(makeResume((data) => (data.basics.phone = '')));
  assert.equal(report.passedRules, report.totalRules - 1);
  assert.equal(report.score, Math.round(((report.totalRules - 1) / report.totalRules) * 100));
  assert.deepEqual(report.categories.contact, { total: 7, passed: 6 });
});

test('leaves the English heading and weak-bullet rules out of the score for other languages', () => {
  const english = lint(makeResume());
  const german = lint(makeResume((data) => (data.metadata.page.locale = 'de-DE')));
  assert.equal(german.totalRules, english.totalRules - 2);
  assert.equal(german.categories.headings.total, english.categories.headings.total - 1);
  assert.equal(lint(makeResume(), { locale: 'de-DE' }).totalRules, english.totalRules - 2, 'opts.locale wins over metadata');
  const weak = makeResume((data) => {
    data.metadata.page.locale = 'de-DE';
    data.sections.experience.items[0].description = '<ul><li>Responsible for billing.</li></ul>';
  });
  assert.deepEqual(codesOf(weak), []);
});

test('keys findings by entry id, so reordering entries keeps the key', () => {
  const second = experienceItem({ id: 'exp-2', period: 'a while back' });
  const before = lint(makeResume((data) => (data.sections.experience.items = [experienceItem(), second])));
  const after = lint(makeResume((data) => (data.sections.experience.items = [second, experienceItem()])));
  const keyOf = (report) => report.findings.find((f) => f.id === 'UNPARSEABLE_PERIOD')?.key;
  assert.equal(keyOf(before), 'UNPARSEABLE_PERIOD:/sections/experience/items/#exp-2/period');
  assert.equal(keyOf(after), keyOf(before));
});

test('sets ignored findings aside without counting them against the score', () => {
  const report = lint(makeResume((data) => {
    data.basics.phone = '';
    data.metadata.check = { ignored: ['MISSING_PHONE:/basics/phone'], hiddenTerms: [] };
  }));
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.ignored.map((f) => f.id), ['MISSING_PHONE']);
  assert.equal(report.counts.warning, 0);
  assert.equal(report.score, 100);
});

test('ignores a finding by its id in metadata, and by opts.ignore', () => {
  const noPhone = () => makeResume((data) => {
    data.basics.phone = '';
    data.basics.location = '';
  });
  const byMeta = noPhone();
  byMeta.metadata.check = { ignored: ['MISSING_PHONE'], hiddenTerms: [] };
  for (const report of [lint(byMeta), lint(noPhone(), { ignore: ['MISSING_PHONE'] })]) {
    assert.deepEqual(report.findings.map((f) => f.id), ['MISSING_LOCATION']);
    assert.deepEqual(report.ignored.map((f) => f.id), ['MISSING_PHONE']);
  }
});

test('flags the gaps in a blank resume', () => {
  const codes = codesOf(parsed(structuredClone(defaultResumeData)));
  for (const id of ['MISSING_NAME', 'MISSING_EMAIL', 'MISSING_PHONE', 'NO_VISIBLE_EXPERIENCE']) assert.ok(codes.includes(id), id);
});

test('writes the pointer as a dotted path, with a message and fix from the catalog', () => {
  const report = lint(makeResume((data) => {
    data.basics.email = '';
    data.sections.experience.items = [experienceItem({ period: 'a while back' })];
  }));
  const email = report.findings.find((f) => f.id === 'MISSING_EMAIL');
  assert.deepEqual(email, {
    id: 'MISSING_EMAIL', category: 'contact', severity: 'error', key: 'MISSING_EMAIL:/basics/email', path: 'basics.email', pointer: '/basics/email',
    message: 'No email address. Most systems file candidates by email address.', fix: 'Add an email',
  });
  assert.equal(report.findings.find((f) => f.id === 'UNPARSEABLE_PERIOD').path, 'sections.experience.items.0.period');
});

test('contact rules flag a malformed email instead of a missing one', () => {
  const codes = codesOf(makeResume((data) => (data.basics.email = 'person at example dot com')));
  assert.ok(codes.includes('MALFORMED_EMAIL'));
  assert.ok(!codes.includes('MISSING_EMAIL'));
});

test('contact rules flag a link with no protocol', () => {
  const report = lint(makeResume((data) => (data.basics.website.url = 'example.com/person')));
  assert.deepEqual(report.findings.map(strip), [{
    id: 'MALFORMED_URL', severity: 'warning', path: 'basics.website.url', key: 'MALFORMED_URL:/basics/website/url', params: { value: 'example.com/person' },
  }]);
});

test('contact rules accept mailto and tel links in custom fields', () => {
  const data = makeResume((resume) => {
    resume.basics.customFields = [
      { id: 'a', icon: '', text: 'Mail', link: 'mailto:person@example.com' },
      { id: 'b', icon: '', text: 'Phone', link: 'tel:+15550100' },
    ];
  });
  assert.ok(!codesOf(data).includes('MALFORMED_URL'));
});

test('contact rules flag a photo and a missing location', () => {
  const codes = codesOf(makeResume((data) => {
    data.picture.url = '/photos/placeholder.jpg';
    data.basics.location = '';
  }));
  assert.ok(codes.includes('PICTURE_PRESENT'));
  assert.ok(codes.includes('MISSING_LOCATION'));
});

test('date rules flag an unreadable period at the offending item', () => {
  const report = lint(makeResume((data) => (data.sections.experience.items = [experienceItem({ period: 'a while back' })])));
  assert.deepEqual(report.findings.map(strip), [{
    id: 'UNPARSEABLE_PERIOD', severity: 'error', path: 'sections.experience.items.0.period',
    key: 'UNPARSEABLE_PERIOD:/sections/experience/items/#exp-1/period', params: { value: 'a while back' },
  }]);
});

test('date rules warn about unreadable custom text without using stale dates for timeline checks', () => {
  const raw = 'During university / bis heute';
  const data = makeResume((resume) => {
    resume.sections.experience.items = [experienceItem({ period: raw, dates: { ...readLegacyDates(raw, { locale: 'en-US', single: false }), raw } })];
  });
  const dates = lint(data).findings.filter((f) => ['UNPARSEABLE_PERIOD', 'REVERSED_PERIOD', 'FUTURE_DATED_PERIOD'].includes(f.id));
  assert.deepEqual(dates.map((f) => f.id), ['UNPARSEABLE_PERIOD']);
});

test('date rules require a period on experience', () => {
  assert.ok(codesOf(makeResume((data) => (data.sections.experience.items = [experienceItem({ period: '' })]))).includes('EMPTY_PERIOD'));
});

test('date rules accept a localized open-ended period', () => {
  const data = makeResume((resume) => {
    resume.metadata.page.locale = 'de-DE';
    resume.sections.experience.items = [experienceItem({ period: 'Jan 2020 - heute' })];
  });
  assert.ok(!codesOf(data).includes('UNPARSEABLE_PERIOD'));
});

test('date rules read structured dates rather than their printed text', () => {
  const data = makeResume((resume) => {
    resume.metadata.page.locale = 'ja-JP';
    resume.sections.experience.items = [experienceItem({ period: '2022年3月 – 現在', dates: { start: '2022-03', end: null, present: true } })];
  });
  assert.ok(!codesOf(data).includes('UNPARSEABLE_PERIOD'));
});

test('date rules flag a period that runs backwards', () => {
  assert.ok(codesOf(makeResume((data) => (data.sections.experience.items = [experienceItem({ period: 'Mar 2022 - Jan 2020' })]))).includes('REVERSED_PERIOD'));
});

test('date rules flag a period starting in the future', () => {
  assert.ok(codesOf(makeResume((data) => (data.sections.experience.items = [experienceItem({ period: 'Jan 2030 - Present' })]))).includes('FUTURE_DATED_PERIOD'));
});

test('date rules check periods on nested roles', () => {
  const data = makeResume((resume) => {
    resume.sections.experience.items = [experienceItem({ roles: [{ id: 'r1', position: 'Junior Engineer', period: 'whenever', description: '<p>Work.</p>' }] })];
  });
  assert.ok(lint(data).findings.map((f) => f.path).includes('sections.experience.items.0.roles.0.period'));
});

test('date rules flag an unreadable single date', () => {
  const data = makeResume((resume) => {
    resume.sections.awards.items = [{ id: 'a1', hidden: false, title: 'Some Award', awarder: 'Some Body', date: 'some time ago', website: { url: '', label: '', inlineLink: false }, description: '' }];
    resume.metadata.layout.pages = [{ fullWidth: false, main: ['experience', 'awards'], sidebar: [] }];
  });
  assert.ok(codesOf(data).includes('UNPARSEABLE_DATE'));
});

test('date rules ignore hidden items', () => {
  const data = makeResume((resume) => {
    resume.sections.experience.items = [experienceItem(), experienceItem({ id: 'exp-2', period: '???', hidden: true })];
  });
  assert.ok(!codesOf(data).includes('UNPARSEABLE_PERIOD'));
});

test('structure rules flag content that is never placed on a page', () => {
  const data = makeResume((resume) => {
    resume.sections.education.items = [{
      id: 'e1', hidden: false, school: 'State University', degree: 'BSc', area: 'Mathematics', grade: '', location: 'Springfield',
      period: '2016 - 2019', website: { url: '', label: '', inlineLink: false }, description: '',
    }];
  });
  assert.deepEqual(lint(data).findings.map(strip), [{
    id: 'SECTION_MISSING_FROM_LAYOUT', severity: 'error', path: 'sections.education', key: 'SECTION_MISSING_FROM_LAYOUT:/sections/education', params: { section: 'education', name: 'Education' },
  }]);
});

test('section messages name a custom section by its title, not its id', () => {
  const data = makeResume((resume) => {
    resume.customSections = [{
      id: 'c0ffee12-aaaa', type: 'experience', title: 'Consulting', icon: '', columns: 2, hidden: false,
      keepTogether: false, startOnNewPage: false, items: [experienceItem({ id: 'c1' })],
    }];
  });
  const missing = lint(data).findings.find((f) => f.id === 'SECTION_MISSING_FROM_LAYOUT');
  assert.equal(missing.message, 'The Consulting section never prints. It has entries but isn\'t placed on a page.');
  assert.equal(missing.params.section, 'c0ffee12-aaaa');
});

test('structure rules flag an experience entry with no narrative', () => {
  assert.ok(codesOf(makeResume((data) => (data.sections.experience.items = [experienceItem({ description: '<p></p>' })]))).includes('MISSING_EXPERIENCE_DESCRIPTION'));
});

test('structure rules accept an experience entry whose narrative lives on its roles', () => {
  const data = makeResume((resume) => {
    resume.sections.experience.items = [experienceItem({ description: '', roles: [{ id: 'r1', position: 'Engineer', period: '2020 - 2022', description: '<p>Shipped it.</p>' }] })];
  });
  assert.ok(!codesOf(data).includes('MISSING_EXPERIENCE_DESCRIPTION'));
});

test('structure rules count a custom section of type experience as experience', () => {
  const data = makeResume((resume) => {
    resume.sections.experience.items = [];
    resume.customSections = [{ id: 'custom-exp', type: 'experience', title: 'Work Experience', icon: 'briefcase', columns: 1, hidden: false, keepTogether: false, startOnNewPage: false, items: [experienceItem()] }];
    resume.metadata.layout.pages = [{ fullWidth: false, main: ['custom-exp'], sidebar: [] }];
  });
  assert.ok(!codesOf(data).includes('NO_VISIBLE_EXPERIENCE'));
});

test('layout rules flag a prose section split into columns', () => {
  assert.ok(codesOf(makeResume((data) => (data.sections.experience.columns = 2))).includes('MULTI_COLUMN_PROSE_SECTION'));
});

test('layout rules flag a prose section parked in the sidebar of a template that prints one', () => {
  const data = makeResume((resume) => {
    resume.careerOps.template = 'azurill';
    resume.metadata.layout.pages = [{ fullWidth: false, main: [], sidebar: ['experience'] }];
  });
  assert.ok(codesOf(data).includes('PROSE_SECTION_IN_SIDEBAR'));
});

test('layout rules know a full-width page prints no sidebar', () => {
  const data = makeResume((resume) => {
    resume.careerOps.template = 'azurill';
    resume.metadata.layout.pages = [{ fullWidth: true, main: [], sidebar: ['experience'] }];
  });
  const codes = codesOf(data);
  assert.ok(!codes.includes('PROSE_SECTION_IN_SIDEBAR'));
  assert.ok(codes.includes('SECTION_MISSING_FROM_LAYOUT'));
});

test('the built-in experience section is named by the heading cv.md prints for it', () => {
  const data = makeResume((resume) => {
    resume.sections.experience.title = 'Where I worked';
    resume.sections.experience.columns = 2;
  });
  const found = lint(data).findings.find((f) => f.id === 'MULTI_COLUMN_PROSE_SECTION');
  assert.equal(found.params.name, data.careerOps.cvStyle.experienceHeading);
  assert.match(found.message, new RegExp(`^The ${data.careerOps.cvStyle.experienceHeading} section is split`));
});

test('TWO_COLUMN_LAYOUT lists sidebar sections by id in sections and by title in names', () => {
  const data = makeResume((resume) => {
    resume.sections.skills.items = [skillItem()];
    resume.customSections = [{
      id: 'c0ffee12-aaaa', type: 'projects', title: 'Consulting', icon: '', columns: 1, hidden: false,
      keepTogether: false, startOnNewPage: false, items: [{ id: 'p1', hidden: false, name: 'Audit', period: '', website: { url: '', label: '', inlineLink: false }, description: '<p>Ran it.</p>' }],
    }];
    resume.careerOps.template = 'azurill';
    resume.metadata.layout.pages = [{ fullWidth: false, main: ['experience'], sidebar: ['skills', 'c0ffee12-aaaa'] }];
  });
  const found = lint(data).findings.find((f) => f.id === 'TWO_COLUMN_LAYOUT');
  assert.deepEqual(found.params, { sections: 'skills,c0ffee12-aaaa', names: 'Skills, Consulting' });
  assert.match(found.message, /so Skills, Consulting come last/);
});

test('templateKnown is true for a table row or an explicit layout, false for an unknown name', () => {
  const data = makeResume((resume) => (resume.careerOps.template = 'my-own-template'));
  assert.equal(checkResume(data, { now: NOW }).templateKnown, false);
  assert.equal(checkResume(data, { now: NOW, layout: LAYOUTS.azurill }).templateKnown, true);
  data.careerOps.template = 'modern';
  assert.equal(checkResume(data, { now: NOW }).templateKnown, true);
});

test('every layout row keeps the invariants the layout rules rely on', () => {
  for (const [name, row] of [...Object.entries(TEMPLATE_LAYOUTS), ['unknown', layoutFor('unknown')]]) {
    assert.ok(row.columns === 1 || row.columns === 2, name);
    assert.equal(row.atsSafe, row.columns === 1, `${name}: atsSafe means one column`);
    assert.ok(row.columns === 1 || row.sidebar, `${name}: a second column is a sidebar`);
  }
});

test('layout rules flag a two-column template printing a sidebar, naming its sections', () => {
  const data = makeResume((resume) => {
    resume.sections.skills.items = [skillItem()];
    resume.careerOps.template = 'azurill';
    resume.metadata.layout.pages = [{ fullWidth: false, main: ['experience'], sidebar: ['skills'] }];
  });
  const found = lint(data).findings.find((f) => f.id === 'TWO_COLUMN_LAYOUT');
  assert.deepEqual(found.params, { sections: 'skills', names: 'Skills' });
  assert.equal(found.path, 'metadata.layout.pages');
});

test('layout rules leave one-column templates, full-width pages and empty sidebars out of the two-column rule', () => {
  const withSidebar = (template, fullWidth, withSkills = true) => makeResume((resume) => {
    resume.sections.skills.items = withSkills ? [skillItem()] : [];
    resume.careerOps.template = template;
    resume.metadata.layout.pages = [{ fullWidth, main: ['experience'], sidebar: ['skills'] }];
  });
  assert.ok(!codesOf(withSidebar('onyx', false)).includes('TWO_COLUMN_LAYOUT'));
  assert.ok(!codesOf(withSidebar('azurill', true)).includes('TWO_COLUMN_LAYOUT'));
  assert.ok(!codesOf(withSidebar('azurill', false, false)).includes('TWO_COLUMN_LAYOUT'));
});

test('layout rules leave short-list sections in the sidebar alone', () => {
  const data = makeResume((resume) => {
    resume.sections.skills.items = [skillItem()];
    resume.careerOps.template = 'azurill';
    resume.metadata.layout.pages = [{ fullWidth: false, main: ['experience'], sidebar: ['skills'] }];
  });
  assert.ok(!codesOf(data).includes('PROSE_SECTION_IN_SIDEBAR'));
});

for (const template of [...Object.keys(TEMPLATE_LAYOUTS), 'my-own-template']) {
  test(`career-ops template ${template} prints a sidebar section in its single column`, () => {
    const data = makeResume((resume) => {
      resume.sections.skills.items = [skillItem()];
      resume.careerOps.template = template;
      resume.metadata.layout.pages = [{ fullWidth: false, main: ['skills'], sidebar: ['experience'] }];
    });
    const codes = checkResume(data, { now: NOW }).findings.map((f) => f.id);
    assert.ok(!codes.includes('TWO_COLUMN_LAYOUT'), codes.join());
    assert.ok(!codes.includes('PROSE_SECTION_IN_SIDEBAR'), codes.join());
  });
}

test('title rules flag an unconventional heading', () => {
  assert.ok(codesOf(makeResume((data) => (data.sections.experience.title = "Where I've Been"))).includes('NON_STANDARD_SECTION_TITLE'));
});

test('title rules accept a conventional heading regardless of case', () => {
  assert.ok(!codesOf(makeResume((data) => (data.sections.experience.title = 'Work Experience'))).includes('NON_STANDARD_SECTION_TITLE'));
});

test('title rules stay quiet on a localized resume', () => {
  const data = makeResume((resume) => {
    resume.sections.experience.title = 'Berufserfahrung';
    resume.metadata.page.locale = 'de-DE';
  });
  assert.ok(!codesOf(data).includes('NON_STANDARD_SECTION_TITLE'));
});

test('typography rules flag a small font, tight lines and each tight margin axis', () => {
  const data = makeResume((resume) => {
    resume.metadata.page.marginX = 4;
    resume.metadata.page.marginY = 4;
    resume.metadata.typography.body.fontSize = 8;
    resume.metadata.typography.body.lineHeight = 1;
  });
  const findings = lint(data).findings;
  assert.ok(findings.some((f) => f.id === 'SMALL_BODY_FONT'));
  assert.ok(findings.some((f) => f.id === 'TIGHT_LINE_HEIGHT'));
  assert.deepEqual(findings.filter((f) => f.id === 'TIGHT_PAGE_MARGINS').map((f) => f.path), ['metadata.page.marginX', 'metadata.page.marginY']);
});

test('raises no errors on the sample resume', () => {
  assert.deepEqual(lint(parsed(sample())).findings.filter((f) => f.severity === 'error'), []);
});

const fragment = (id, company, description = '') => experienceItem({ id, company, position: '', location: '', period: '', description });
const imported = () => makeResume((resume) => {
  resume.sections.experience.items = [
    experienceItem({ id: 'studio', company: 'Synthetic Studio 1', period: '2020 - Present' }),
    fragment('f1', 'Project 1.3: Built accessible services for global customers, mentored four engineers, and reduced processing time by', '<p>25%. Tracked reliability and customer feedback.</p>'),
    fragment('f2', 'and kept the on-call rotation healthy,', '<p>Cut pages by half.</p>'),
  ];
});

test('reports a sentence split off a dated entry as part of it, not as an entry missing dates', () => {
  const findings = lint(imported()).findings;
  assert.deepEqual(findings.filter((f) => f.id === 'FRAGMENTED_ENTRY').map((f) => f.path), ['sections.experience.items.1', 'sections.experience.items.2']);
  assert.ok(!findings.some((f) => f.id === 'EMPTY_PERIOD'));
});

test('still asks for dates on a real entry that has none', () => {
  const data = makeResume((resume) => {
    resume.sections.experience.items = [experienceItem({ id: 'a' }), experienceItem({ id: 'b', company: 'Freelance', position: 'Consultant', period: '' })];
  });
  assert.ok(codesOf(data).includes('EMPTY_PERIOD'));
  assert.ok(!codesOf(data).includes('FRAGMENTED_ENTRY'));
});

test('an open fragment costs one rule and leaves the score at 80 or above', () => {
  const report = lint(imported());
  assert.ok(report.score >= 80, String(report.score));
  assert.deepEqual([...new Set(report.findings.map((f) => f.id))], ['FRAGMENTED_ENTRY']);
});

test('treats an undated degree as a real entry that needs dates', () => {
  const data = makeResume((resume) => {
    const school = { hidden: false, website: { url: '', label: '', inlineLink: false }, description: '', grade: '' };
    resume.sections.education.items = [
      { ...school, id: 'e1', school: 'Stanford University', degree: 'Executive Program', area: 'Leadership', location: '', period: '2021' },
      { ...school, id: 'e2', school: 'Massachusetts Institute of Technology', degree: 'Master of Science', area: 'Electrical Engineering and Computer Science', location: 'Cambridge, MA', period: '' },
    ];
    resume.metadata.layout.pages = [{ fullWidth: false, main: ['experience', 'education'], sidebar: [] }];
  });
  assert.ok(lint(data).findings.map((f) => `${f.id} ${f.path}`).includes('EMPTY_PERIOD sections.education.items.1.period'));
  assert.ok(!codesOf(data).includes('FRAGMENTED_ENTRY'));
});

const elevenWordTitle = 'Senior Vice President of Global Engineering and Product Operations for EMEA';

for (const [name, description] of [
  ['a dangling word', '<ul><li>Led the migration</li><li>Reduced processing time by</li></ul>'],
  ['a comma', '<ul><li>Led the migration</li><li>Cut costs, grew the team,</li></ul>'],
  ['a dash', '<ul><li>Led the migration</li><li>Rebuilt the billing platform —</li></ul>'],
]) {
  test(`still reads a long or lower-case heading as the rest of a bullet that stops on ${name}`, () => {
    const data = makeResume((resume) => {
      resume.sections.experience.items = [experienceItem({ id: 'a', description }), fragment('b', 'uptime above target for every regional customer team')];
    });
    assert.ok(codesOf(data).includes('FRAGMENTED_ENTRY'));
    assert.ok(!codesOf(data).includes('EMPTY_PERIOD'));
  });
}

test('keeps a title of up to 10 words after a cut bullet, and reads 11 as the rest of it', () => {
  const after = (position) => makeResume((resume) => {
    resume.sections.experience.items = [
      experienceItem({ id: 'a', description: '<ul><li>Reduced processing time by</li></ul>' }),
      experienceItem({ id: 'b', company: 'Contoso', position, location: '', period: '', description: '' }),
    ];
  });
  assert.ok(!codesOf(after(elevenWordTitle.replace(' for EMEA', ' EMEA'))).includes('FRAGMENTED_ENTRY'));
  assert.ok(codesOf(after(elevenWordTitle)).includes('FRAGMENTED_ENTRY'));
  assert.ok(!codesOf(after('Senior Platform Engineer')).includes('FRAGMENTED_ENTRY'));
  assert.ok(codesOf(after('platform engineer for payments')).includes('FRAGMENTED_ENTRY'));
});

for (const [name, extra] of [
  ['a link', { website: { url: 'https://example.com/case-study', label: 'Case study', inlineLink: false } }],
  ['an end date', { dates: { start: null, end: '2019-05', present: false } }],
  ['date text', { dates: { start: null, end: null, present: false, raw: 'Summer' } }],
]) {
  test(`never reads a fragment carrying ${name} as part of the entry above`, () => {
    const data = makeResume((resume) => {
      resume.sections.experience.items = [experienceItem({ id: 'a' }), { ...fragment('b', 'and kept the on-call rotation healthy,', '<p>Cut pages.</p>'), ...extra }];
    });
    assert.ok(!codesOf(data).includes('FRAGMENTED_ENTRY'));
  });
}

const entryAfter = (above, heading) => makeResume((resume) => {
  resume.sections.experience.items = [
    experienceItem({ id: 'a', description: above }),
    experienceItem({ id: 'b', company: '', position: '', location: '', period: '', description: '', ...heading }),
  ];
});

for (const [name, above, heading] of [
  ['a sign-on bullet', '<ul><li>Shipped SAML single sign-on</li></ul>', { company: 'Contoso', position: elevenWordTitle }],
  ['a logged-in bullet', '<ul><li>Cut the time it took users to get logged in</li></ul>', { company: 'Contoso', position: elevenWordTitle }],
  ['a Series A bullet', '<ul><li>Helped raise a Series A</li></ul>', { company: 'Contoso', position: elevenWordTitle }],
  ['a walk-through bullet', '<ul><li>Led the quarterly security walk-through</li></ul>', { company: 'Contoso', position: elevenWordTitle }],
  ['an open line', '<ul><li>Shipped SAML single sign-on</li></ul>', { company: 'Contoso', position: 'iOS platform engineering lead' }],
  ['bullets that never close', '<ul><li>Led the platform migration</li><li>Grew the team from 8 to 40</li></ul>', { company: 'Contoso', position: 'senior platform engineering lead' }],
]) {
  test(`treats a real undated entry after ${name} as one that needs dates`, () => {
    const codes = codesOf(entryAfter(above, heading));
    assert.ok(codes.includes('EMPTY_PERIOD'));
    assert.ok(!codes.includes('FRAGMENTED_ENTRY'));
  });
}

for (const [name, above, company] of [
  ['a noun phrase', '<ul><li>Reduced processing time for the payments</li></ul>', 'team by 40% across all regions'],
  ['an open last bullet among closed ones', '<ul><li>Led the platform migration.</li><li>Grew the team from 8 to 40 while keeping</li></ul>', 'senior engineers on call across every region'],
  ['during', '<ul><li>Kept checkout up during</li></ul>', 'Black Friday Cyber Monday Peak Season Traffic Across All Twelve Regional Markets'],
]) {
  test(`reads the rest of a sentence cut at ${name} as part of the entry above`, () => {
    const codes = codesOf(entryAfter(above, { company }));
    assert.ok(codes.includes('FRAGMENTED_ENTRY'));
    assert.ok(!codes.includes('EMPTY_PERIOD'));
  });
}

test('keeps an undated company ending in a dangling word after a closed sentence', () => {
  const data = makeResume((resume) => {
    resume.sections.experience.items = [
      experienceItem({ id: 'a', description: '<p>Delivered reliable services.</p>' }),
      experienceItem({ id: 'b', company: 'Design with', position: 'Director', location: '', period: '', description: '<p>Led design.</p>' }),
    ];
  });
  assert.ok(!codesOf(data).includes('FRAGMENTED_ENTRY'));
  assert.ok(codesOf(data).includes('EMPTY_PERIOD'));
});

function withRoot(fn) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'career-ops-resume-check-')));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const run = (root, ...args) => spawnSync(process.execPath, [CLI, ...args], {
  encoding: 'utf8', env: { ...process.env, CAREER_OPS_ROOT: root, CAREER_OPS_DATA_DIR: '' },
});
const writeSample = (root, mutate) => {
  const json = sample();
  mutate(json);
  const path = join(root, 'draft.json');
  writeFileSync(path, JSON.stringify(json));
  return path;
};

test('check --in --json exits 0 with the report', () => withRoot((root) => {
  const r = run(root, 'check', '--in', SAMPLE, '--json');
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.totalRules, 25);
  assert.ok(Array.isArray(report.findings) && report.findings.every((f) => CHECK_RULE_IDS.includes(f.id)));
}));

test('check prints a score below 100 and the missing email, and --ignore drops it', () => withRoot((root) => {
  const draft = writeSample(root, (json) => (json.basics.email = ''));
  const r = run(root, 'check', '--in', draft);
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split('\n');
  const [, score] = lines[0].match(/^Check score (\d+)\/100 \(\d+ of 25 rules pass\)$/);
  assert.ok(Number(score) < 100);
  assert.ok(lines.some((line) => line.startsWith('MISSING_EMAIL contact basics.email  ')), r.stdout);

  const ignored = run(root, 'check', '--in', draft, '--ignore', 'MISSING_EMAIL');
  assert.equal(ignored.status, 0, ignored.stderr);
  assert.ok(!ignored.stdout.split('\n').some((line) => line.startsWith('MISSING_EMAIL ')), ignored.stdout);
  assert.match(ignored.stdout, /^1 ignored: MISSING_EMAIL basics\.email$/m);
}));

test('check --ignore with an unknown id exits 1 naming the valid ids', () => withRoot((root) => {
  const r = run(root, 'check', '--in', SAMPLE, '--ignore', 'NOPE');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown rule id NOPE.*MISSING_EMAIL/);
}));

test('check reports reversed dates on an experience period', () => withRoot((root) => {
  const draft = writeSample(root, (json) => (json.sections.experience.items[0].period = 'Mar 2022 - Jan 2020'));
  const r = run(root, 'check', '--in', draft, '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(JSON.parse(r.stdout).findings.some((f) => f.id === 'REVERSED_PERIOD' && f.path === 'sections.experience.items.0.period'));
  assert.ok(!JSON.parse(run(root, 'check', '--in', SAMPLE, '--json').stdout).findings.some((f) => f.id === 'REVERSED_PERIOD'));
}));

test('check without --in absorbs cv.md in memory, writing nothing', () => withRoot((root) => {
  writeFileSync(join(root, 'cv.md'), readFileSync(EXAMPLE, 'utf8'));
  const r = run(root, 'check', '--json');
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.totalRules, 25);
  assert.ok(report.findings.some((f) => f.id === 'MISSING_PHONE'), r.stdout);
  assert.equal(existsSync(join(root, 'data', 'resume.json')), false);
}));

test('check without --in exits 3 while the absorb gate fails', () => withRoot((root) => {
  writeFileSync(join(root, 'cv.md'), readFileSync(EXAMPLE, 'utf8').replace('## Professional Summary', 'Stray line.\n\n## Professional Summary'));
  const r = run(root, 'check', '--json');
  assert.equal(r.status, 3);
  const report = JSON.parse(r.stdout);
  assert.equal(report.lossless, false);
  assert.equal(report.totalRules, undefined);
}));

test('check --ignore takes a comma list, and --json moves the findings to ignored', () => withRoot((root) => {
  const draft = writeSample(root, (json) => {
    json.basics.email = '';
    json.basics.phone = '';
  });
  const before = JSON.parse(run(root, 'check', '--in', draft, '--json').stdout);
  const r = run(root, 'check', '--in', draft, '--json', '--ignore', 'MISSING_EMAIL,MISSING_PHONE');
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.deepEqual(report.ignored.map((f) => f.id).sort(), ['MISSING_EMAIL', 'MISSING_PHONE']);
  assert.ok(!report.findings.some((f) => f.id === 'MISSING_EMAIL' || f.id === 'MISSING_PHONE'));
  assert.equal(report.passedRules, before.passedRules + 2);
  assert.match(run(root, 'check', '--in', draft, '--ignore', 'MISSING_EMAIL,MISSING_PHONE').stdout, /^2 ignored: MISSING_EMAIL basics\.email, MISSING_PHONE basics\.phone$/m);
}));

test('check names a template outside the layout table on stderr', () => withRoot((root) => {
  const draft = writeSample(root, (json) => (json.careerOps = { ...json.careerOps, template: 'my-own-template' }));
  const r = run(root, 'check', '--in', draft, '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /template "my-own-template" is not in lib\/resume\/template-layouts\.mjs/);
  assert.equal(JSON.parse(r.stdout).templateKnown, false);
  assert.equal(run(root, 'check', '--in', SAMPLE).stderr, '');
}));

test('metadata.check.ignored by an entry-id key follows the entry when it moves, and only that entry', () => {
  const second = experienceItem({ id: 'exp-2', period: 'a while back' });
  const third = experienceItem({ id: 'exp-3', period: 'some day' });
  const key = 'UNPARSEABLE_PERIOD:/sections/experience/items/#exp-2/period';
  for (const items of [[experienceItem(), second, third], [third, second, experienceItem()]]) {
    const report = lint(makeResume((data) => {
      data.sections.experience.items = items;
      data.metadata.check = { ignored: [key], hiddenTerms: [] };
    }));
    assert.deepEqual(report.ignored.map((f) => f.key), [key]);
    assert.deepEqual(report.findings.filter((f) => f.id === 'UNPARSEABLE_PERIOD').map((f) => f.key), ['UNPARSEABLE_PERIOD:/sections/experience/items/#exp-3/period']);
  }
});

test('export keeps human text on the absorb gate failure that check --json turns into JSON', () => withRoot((root) => {
  writeFileSync(join(root, 'cv.md'), readFileSync(EXAMPLE, 'utf8').replace('## Professional Summary', 'Stray line.\n\n## Professional Summary'));
  const r = run(root, 'export', 'payload', '--json');
  assert.equal(r.status, 3);
  assert.match(r.stdout, /^cv\.md does not absorb losslessly/);
}));

test('a bullet that opens with a duty phrase is flagged, and the same words mid-sentence are not', () => {
  const data = parsed(sample());
  data.sections.experience.items[0].description =
    '<ul><li>Responsible for billing disputes.</li><li>Led the team responsible for billing.</li></ul>';
  const found = lint(data).findings.filter((f) => f.id === 'WEAK_BULLET_START');
  assert.equal(found.length, 1);
  assert.equal(found[0].params.text, 'Responsible for billing disputes.');
  assert.equal(found[0].params.count, 1);
  assert.equal(found[0].severity, 'info');
});

test('two weak bullets in one description are one finding with a count, and a role is checked under its own key', () => {
  const data = parsed(sample());
  data.sections.experience.items[0].description = '<ul><li>Helped with releases.</li><li>Worked on billing.</li></ul>';
  data.sections.experience.items[1].roles[0].description = '<ul><li>Assisted the support team.</li></ul>';
  const found = lint(data).findings.filter((f) => f.id === 'WEAK_BULLET_START');
  assert.deepEqual(found.map((f) => f.params.count), [2, 1]);
  assert.match(found[0].message, /and so does 1 more in this entry/);
  assert.match(found[1].pointer, /\/roles\/0\/description$/);
  assert.equal(new Set(found.map((f) => f.key)).size, 2);
});

test('a paragraph is not linted as a bullet, alone or above a list', () => {
  const data = parsed(sample());
  data.sections.experience.items[0].description = '<p>Responsible for the billing platform.</p>';
  assert.deepEqual(lint(data).findings.filter((f) => f.id === 'WEAK_BULLET_START'), []);
  data.sections.experience.items[0].description += '<ul><li>Shipped the intake form.</li></ul>';
  assert.deepEqual(lint(data).findings.filter((f) => f.id === 'WEAK_BULLET_START'), []);
});

test('a bullet over 240 characters is flagged, and a link target does not count', () => {
  const data = parsed(sample());
  const long = `Consolidated ${'vendor approvals and '.repeat(12)}one intake form.`;
  const linked = `<a href="https://example.com/${'x'.repeat(300)}">Shipped the intake form</a>`;
  data.sections.experience.items[0].description = `<ul><li>${long}</li><li>${linked}</li></ul>`;
  const found = lint(data).findings.filter((f) => f.id === 'LONG_BULLET');
  assert.equal(found.length, 1);
  assert.equal(found[0].params.count, 1);
  assert.equal(found[0].params.length, long.length);
  assert.ok(found[0].params.text.length <= 61);
  data.sections.experience.items[0].description = `<ul><li>${'a'.repeat(240)}</li><li>Assisted-living intake rebuilt.</li><li>PARTICIPATED IN the audit.</li></ul>`;
  const edge = lint(data).findings.filter((f) => f.id.endsWith('BULLET') || f.id === 'WEAK_BULLET_START');
  assert.deepEqual(edge.map((f) => [f.id, f.params.text]), [['WEAK_BULLET_START', 'PARTICIPATED IN the audit.']]);
});

test('nested, unclosed and glyph-led list items are each read as their own bullet', () => {
  const weak = (description) => {
    const data = parsed(sample());
    data.sections.experience.items[0].description = description;
    return lint(data).findings.filter((f) => f.id === 'WEAK_BULLET_START').map((f) => [f.params.text, f.params.count]);
  };
  assert.deepEqual(weak('<ul><li>Led platform work<ul><li>Responsible for billing.</li><li>Helped QA.</li></ul></li></ul>'), [['Responsible for billing.', 2]]);
  assert.deepEqual(weak('<ul><li>Responsible for billing.<li>Shipped the form.</ul>'), [['Responsible for billing.', 1]]);
  assert.deepEqual(weak('<ul><li>• Worked on releases.</li></ul><p>Responsible for nothing listed.</p>'), [['Worked on releases.', 1]]);
  assert.deepEqual(weak('<ul><li>Built tooling.</li></ul><p>Responsible for regional operations.</p><ol><li>Reduced delays.</li></ol>'), []);
  assert.deepEqual(weak('<ul><li>Built a workflow that<ul><li>Reduced failures.</li></ul>helped teams ship faster.</li></ul>'), []);
  assert.deepEqual(weak('<li>Helped with a bare item.'), [['Helped with a bare item.', 1]]);
  assert.deepEqual(weak('<ul><!-- <li>Helped with the old thing.</li> --><li>— Assisted the audit.</li></ul>'), [['Assisted the audit.', 1]]);
});

test('every rule id is produced by some fixture above', () => {
  assert.deepEqual(CHECK_RULE_IDS.filter((id) => !seen.has(id)), []);
});

test('a long bullet is flagged in a resume that is not in English', () => {
  const data = parsed(sample());
  data.metadata.page.locale = 'de-DE';
  data.sections.experience.items[0].description = `<ul><li>${'a'.repeat(241)}</li></ul>`;
  assert.equal(lint(data).findings.filter((f) => f.id === 'LONG_BULLET').length, 1);
});
