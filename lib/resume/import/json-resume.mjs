// Ported from Reactive Resume packages/import/src/json-resume.tsx at d065a9f7. MIT, copyright Amruth Pillai; see THIRD_PARTY_NOTICES.md.
// Adapted: JavaScript; crypto.randomUUID() for generateId(); profile icons left blank (getNetworkIcon dropped); education area left blank (cv.md prints degree and area together, and the degree already names it); throws ImportError;
// returns { data, skipped }, counting the entries each section's filter dropped instead of dropping them silently.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parseResumeData } from '../vendor/data.mjs';
import { defaultResumeData } from '../vendor/default.mjs';
import { toRangeDates, toSingleDates } from './date.mjs';
import { ImportError, issuesError, listIssues } from './error.mjs';
import { arrayToHtmlList, toHtmlDescription } from './html.mjs';
import { parseLevel } from './level.mjs';

const createUrl = (url, label) => (url ? { url, label: label || url } : { url: '', label: '' });
const createItemWebsite = (url, label) => ({ ...createUrl(url, label), inlineLink: false });

// Partial ISO 8601 dates: year only, year-month, or full date.
const iso8601 = z
  .string()
  .regex(
    /^([1-2][0-9]{3}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])|[1-2][0-9]{3}-(?:0[1-9]|1[0-2])|[1-2][0-9]{3})$/,
    'Must be a valid ISO 8601 date (YYYY, YYYY-MM, or YYYY-MM-DD)',
  );

// Many exporters write "" for a field they have no value for, which JSON Resume means as absent.
const blank = (schema) => z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
const optionalDate = blank(iso8601);
const optionalUrl = blank(z.url());
const str = z.string().optional();
const strings = z.array(z.string()).optional();

const jsonResumeSchema = z.looseObject({
  basics: z.looseObject({
    name: str, label: str, image: str, email: blank(z.email()), phone: str, url: optionalUrl, summary: str,
    location: z.looseObject({ city: str, countryCode: str, region: str }).optional(),
    profiles: z.array(z.looseObject({ network: str, username: str, url: optionalUrl })).optional(),
  }).optional(),
  work: z.array(z.looseObject({
    name: str, location: str, position: str, url: optionalUrl, startDate: optionalDate, endDate: optionalDate, summary: str, highlights: strings,
  })).optional(),
  volunteer: z.array(z.looseObject({
    organization: str, url: optionalUrl, startDate: optionalDate, endDate: optionalDate, summary: str, highlights: strings,
  })).optional(),
  education: z.array(z.looseObject({
    institution: str, url: optionalUrl, area: str, studyType: str, startDate: optionalDate, endDate: optionalDate, score: str, courses: strings,
  })).optional(),
  awards: z.array(z.looseObject({ title: str, date: optionalDate, awarder: str, summary: str })).optional(),
  certificates: z.array(z.looseObject({ name: str, date: optionalDate, url: optionalUrl, issuer: str })).optional(),
  publications: z.array(z.looseObject({ name: str, publisher: str, releaseDate: optionalDate, url: optionalUrl, summary: str })).optional(),
  skills: z.array(z.looseObject({ name: str, level: str, keywords: strings })).optional(),
  languages: z.array(z.looseObject({ language: str, fluency: str })).optional(),
  interests: z.array(z.looseObject({ name: str, keywords: strings })).optional(),
  references: z.array(z.looseObject({ name: str, reference: str })).optional(),
  projects: z.array(z.looseObject({
    name: str, description: str, highlights: strings, startDate: optionalDate, endDate: optionalDate, url: optionalUrl,
  })).optional(),
});

const item = () => ({ id: randomUUID(), hidden: false });

function convertJSONResume(jsonResume) {
  // Clone so the writes below never mutate the shared defaultResumeData singleton.
  const result = structuredClone(defaultResumeData);
  const skipped = [];
  // RR drops an entry whose required field is empty; the count is reported so the drop is not silent.
  const keep = (section, rows, pred, field) => {
    const kept = (rows ?? []).filter(pred);
    if (kept.length < (rows ?? []).length) skipped.push(`${section}: ${(rows ?? []).length - kept.length} entr${(rows ?? []).length - kept.length === 1 ? 'y' : 'ies'} without ${field} skipped`);
    return kept;
  };
  const basics = jsonResume.basics ?? {};
  result.basics = {
    name: basics.name || '',
    headline: basics.label || '',
    email: basics.email || '',
    phone: basics.phone || '',
    location: [basics.location?.city, basics.location?.region, basics.location?.countryCode].filter(Boolean).join(', '),
    website: createUrl(basics.url),
    customFields: [],
  };
  result.picture.url = basics.image ?? '';
  result.summary.content = toHtmlDescription(basics.summary);

  const s = result.sections;
  s.experience.items = keep('work', jsonResume.work, (w) => w.name || w.position, 'a name or position').map((w) => ({
    ...item(),
    company: w.name || '',
    position: w.position || '',
    location: w.location || '',
    period: '',
    dates: toRangeDates(w.startDate, w.endDate),
    website: createItemWebsite(w.url),
    roles: [],
    description: toHtmlDescription(w.summary, w.highlights),
  }));
  s.education.items = keep('education', jsonResume.education, (e) => e.institution, 'an institution').map((e) => ({
    ...item(),
    school: e.institution || '',
    degree: [e.studyType, e.area].filter(Boolean).join(' in ') || '',
    area: '',
    grade: e.score || '',
    location: '',
    period: '',
    dates: toRangeDates(e.startDate, e.endDate),
    website: createItemWebsite(e.url),
    description: arrayToHtmlList(e.courses ?? []),
  }));
  s.projects.items = keep('projects', jsonResume.projects, (p) => p.name, 'a name').map((p) => ({
    ...item(),
    name: p.name || '',
    period: '',
    dates: toRangeDates(p.startDate, p.endDate),
    website: createItemWebsite(p.url),
    description: toHtmlDescription(p.description, p.highlights),
  }));
  s.skills.items = keep('skills', jsonResume.skills, (k) => k.name, 'a name').map((k) => ({
    ...item(), icon: 'star', iconColor: '', name: k.name || '', proficiency: k.level || '', level: parseLevel(k.level), keywords: k.keywords || [],
  }));
  s.languages.items = keep('languages', jsonResume.languages, (l) => l.language, 'a language').map((l) => ({
    ...item(), language: l.language || '', fluency: l.fluency || '', level: parseLevel(l.fluency),
  }));
  s.interests.items = keep('interests', jsonResume.interests, (i) => i.name, 'a name').map((i) => ({
    ...item(), icon: 'star', iconColor: '', name: i.name || '', keywords: i.keywords || [],
  }));
  s.awards.items = keep('awards', jsonResume.awards, (a) => a.title, 'a title').map((a) => ({
    ...item(), title: a.title || '', awarder: a.awarder || '', date: '', dates: toSingleDates(a.date), website: createItemWebsite(), description: toHtmlDescription(a.summary),
  }));
  s.certifications.items = keep('certificates', jsonResume.certificates, (c) => c.name, 'a name').map((c) => ({
    ...item(), title: c.name || '', issuer: c.issuer || '', date: '', dates: toSingleDates(c.date), website: createItemWebsite(c.url), description: '',
  }));
  s.publications.items = keep('publications', jsonResume.publications, (p) => p.name, 'a name').map((p) => ({
    ...item(), title: p.name || '', publisher: p.publisher || '', date: '', dates: toSingleDates(p.releaseDate), website: createItemWebsite(p.url), description: toHtmlDescription(p.summary),
  }));
  s.volunteer.items = keep('volunteer', jsonResume.volunteer, (v) => v.organization, 'an organization').map((v) => ({
    ...item(),
    organization: v.organization || '',
    location: '',
    period: '',
    dates: toRangeDates(v.startDate, v.endDate),
    website: createItemWebsite(v.url),
    description: toHtmlDescription(v.summary, v.highlights),
  }));
  s.references.items = keep('references', jsonResume.references, (r) => r.name || r.reference, 'a name or text').map((r) => ({
    ...item(), name: r.name || '', position: '', website: createItemWebsite(), phone: '', description: toHtmlDescription(r.reference),
  }));
  s.profiles.items = keep('profiles', basics.profiles, (p) => p.network, 'a network').map((p) => ({
    ...item(), icon: '', iconColor: '', network: p.network || '', username: p.username || '', website: createItemWebsite(p.url, p.username || p.network),
  }));
  return { data: parseResumeData(result), skipped };
}

const DATE_FIELDS = { startDate: 'start date', endDate: 'end date', date: 'date', releaseDate: 'release date' };

// How each section's entry is named in a sentence, from the entry itself.
const ENTRY_NAMES = {
  work: (e) => `your role at ${String(e.name || e.position || 'an unnamed employer')}`,
  volunteer: (e) => `your volunteering at ${String(e.organization || 'an unnamed organization')}`,
  education: (e) => `your studies at ${String(e.institution || 'an unnamed school')}`,
  projects: (e) => `the project ${String(e.name || 'without a name')}`,
  awards: (e) => `the award ${String(e.title || 'without a title')}`,
  certificates: (e) => `the certificate ${String(e.name || 'without a name')}`,
  publications: (e) => `the publication ${String(e.name || 'without a name')}`,
};

/** A bad date names the entry in words ("your role at Acme"), not its field path. */
function describeDateIssue(error, input) {
  for (const issue of error.issues) {
    const [section, index, field] = issue.path;
    const fieldName = typeof field === 'string' ? DATE_FIELDS[field] : undefined;
    const entryName = typeof section === 'string' && Object.hasOwn(ENTRY_NAMES, section) ? ENTRY_NAMES[section] : undefined;
    if (!fieldName || !entryName || typeof index !== 'number' || issue.path.length !== 3) continue;
    const entry = input?.[section]?.[index];
    return { message: `The ${fieldName} for ${entryName(entry && typeof entry === 'object' ? entry : {})} isn't a date; use YYYY, YYYY-MM or YYYY-MM-DD.`, issue };
  }
  return null;
}

/**
 * @param {unknown} input parsed JSON Resume document
 * @returns {{ data: object, skipped: string[] }} ResumeData and the entries the filters dropped
 */
export function parseJSONResume(input) {
  const parsed = jsonResumeSchema.safeParse(input);
  if (parsed.success) return convertJSONResume(parsed.data);
  const dateIssue = describeDateIssue(parsed.error, input);
  if (!dateIssue) throw issuesError(parsed.error.issues);
  const others = parsed.error.issues.filter((i) => i !== dateIssue.issue);
  throw new ImportError(others.length ? `${dateIssue.message} Other problems: ${listIssues(others)}.` : dateIssue.message);
}
