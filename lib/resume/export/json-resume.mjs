// ResumeData -> a JSON Resume document, the inverse of convertJSONResume in ../import/json-resume.mjs.
import { flattenEntries, splitDescription, websiteText } from '../to-cv-md.mjs';

const SCHEMA = 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json';

const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && v.length === 0)));

/** Paragraphs as `summary`, list items as `highlights`; JSON Resume has no place for their order, so a paragraph after the bullets comes back before them. */
const prose = (html) => {
  const { lead, items } = splitDescription(html);
  return { summary: lead.map((p) => p.md).join('\n\n'), highlights: items.map((i) => i.md) };
};
const reorders = (html) => splitDescription(html).lead.some((p) => p.before > 0);
/** A field JSON Resume gives a single text (`summary`, or `reference` for a reference): the lead paragraphs, then the list items as `- ` lines, so no bullet is dropped. */
const summaryText = (html) => {
  const { summary, highlights } = prose(html);
  return [summary, ...highlights.map((h) => `- ${h}`)].filter(Boolean).join('\n');
};
// The importer reads a start with no end as ongoing, so a lone date ("2018") goes out as the end date.
const range = (dates) => (dates?.start && !dates.end && !dates.present
  ? { endDate: dates.start }
  : { startDate: dates?.start, endDate: dates?.present ? undefined : dates?.end });
const url = (website) => website?.url;

// Each JSON Resume array, from the visible items of every section of that type.
const ARRAYS = {
  experience: ['work', (items) => flattenEntries(items).map(({ item, role }) => {
    const target = role ?? item;
    return compact({ name: item.company, position: target.position, location: item.location, url: url(item.website), ...range(target.dates ?? item.dates), ...prose(target.description) });
  })],
  education: ['education', (items) => items.map((i) => compact({
    institution: i.school, studyType: i.degree, area: i.area, score: i.grade, url: url(i.website), ...range(i.dates), courses: splitDescription(i.description).items.map((c) => c.md),
  }))],
  projects: ['projects', (items) => items.map((i) => {
    const { summary, highlights } = prose(i.description);
    return compact({ name: i.name, description: summary, highlights, url: url(i.website), ...range(i.dates) });
  })],
  skills: ['skills', (items) => items.map((i) => compact({ name: i.name, level: i.proficiency, keywords: i.keywords }))],
  languages: ['languages', (items) => items.map((i) => compact({ language: i.language, fluency: i.fluency }))],
  interests: ['interests', (items) => items.map((i) => compact({ name: i.name, keywords: i.keywords }))],
  awards: ['awards', (items) => items.map((i) => compact({ title: i.title, awarder: i.awarder, date: i.dates?.start, summary: summaryText(i.description) }))],
  certifications: ['certificates', (items) => items.map((i) => compact({ name: i.title, issuer: i.issuer, date: i.dates?.start, url: url(i.website) }))],
  publications: ['publications', (items) => items.map((i) => compact({ name: i.title, publisher: i.publisher, releaseDate: i.dates?.start, url: url(i.website), summary: summaryText(i.description) }))],
  volunteer: ['volunteer', (items) => items.map((i) => compact({ organization: i.organization, url: url(i.website), ...range(i.dates), ...prose(i.description) }))],
  references: ['references', (items) => items.map((i) => compact({ name: i.name, reference: summaryText(i.description) }))],
};

/** The importer rejoins city, region and countryCode with ", ", so the string round-trips; the parts are positional, not checked as a region or a country. */
function location(text) {
  if (!text) return undefined;
  const parts = text.split(', ');
  if (parts.length > 3) return { city: text };
  const [city, region, countryCode] = parts;
  return compact({ city, region, countryCode });
}

/**
 * The importer labels a profile link with its username, else the network, so a blank username falls back to the
 * link text cv.md shows; a label that is only the network name is the importer's own fallback, not a handle.
 */
function profileUsername(p) {
  if (p.username) return p.username;
  const label = websiteText(p.website);
  return label === p.network ? '' : label;
}

/**
 * @param {object} data ResumeData (parsed)
 * @param {{ hide?: string[], hideItems?: string[] }} [opts] as resumeToPayload takes them
 * @returns {{ document: object, unmapped: string[] }} unmapped names what JSON Resume has no place for: custom sections
 *   without a matching array, `basics.customFields`, and the title and description above an entry's roles
 */
export function resumeToJsonResume(data, { hide = [], hideItems = [] } = {}) {
  // Same visibility rule as resumeToPayload in ../to-payload.mjs.
  const visible = (items) => items.filter((i) => !i.hidden && !hideItems.includes(i.id)).flatMap((i) => {
    if (!i.roles?.length) return [i];
    const roles = i.roles.filter((r) => !hideItems.includes(r.id));
    return roles.length ? [{ ...i, roles }] : [];
  });
  const shown = (key, section) => !section.hidden && !hide.includes(key);

  const sections = [
    ...Object.entries(data.sections).filter(([key]) => key !== 'profiles').map(([key, section]) => ({ type: key, key, section, name: key })),
    ...data.customSections.map((section) => ({ type: section.type, key: section.id, section, name: section.title || section.id })),
  ];
  const arrays = {};
  const unmapped = [];
  for (const { type, key, section, name } of sections) {
    if (!shown(key, section)) continue;
    const items = visible(section.items);
    if (items.length === 0) continue;
    if (!ARRAYS[type]) unmapped.push(name);
    else {
      // JSON Resume's work entries are per role, so a grouped entry's own title and description have nowhere to go.
      if (type === 'experience') for (const i of items) if (i.roles?.length && (i.position || i.description)) unmapped.push(`${i.company} (the title and description above its roles)`);
      const REORDERED = '(a paragraph after its bullets moves above them)';
      if (type === 'experience') for (const { item, role } of flattenEntries(items)) if (reorders((role ?? item).description)) unmapped.push(`${item.company} ${REORDERED}`);
      if (type === 'projects') for (const i of items) if (reorders(i.description)) unmapped.push(`${i.name} ${REORDERED}`);
      const [array, map] = ARRAYS[type];
      (arrays[array] ??= []).push(...map(items));
    }
  }

  const { basics } = data;
  if (basics.customFields.length) unmapped.push(`basics.customFields (${basics.customFields.length})`);
  const profiles = shown('profiles', data.sections.profiles) ? visible(data.sections.profiles.items) : [];
  const document = {
    $schema: SCHEMA,
    basics: compact({
      name: basics.name,
      label: basics.headline,
      image: data.picture.hidden ? undefined : data.picture.url,
      email: basics.email,
      phone: basics.phone,
      url: url(basics.website),
      summary: shown('summary', data.summary) ? summaryText(data.summary.content) : '',
      location: location(basics.location),
      profiles: profiles.map((p) => compact({ network: p.network, username: profileUsername(p), url: url(p.website) })),
    }),
    ...arrays,
  };
  return { document, unmapped };
}
