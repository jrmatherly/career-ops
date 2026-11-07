// ResumeData -> the build-cv-html.mjs render payload (lib/cv-payload-schema.mjs).
import { flattenEntries, htmlToText, splitDescription, websiteText, withScheme } from './to-cv-md.mjs';

// Sections the HTML payload has no slot for.
const SLOTLESS = new Set(['languages', 'publications', 'volunteer', 'references', 'summary', 'profiles', 'cover-letter']);

const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && !(Array.isArray(v) && v.length === 0)));

const link = (website, fallback = '') => {
  const display = websiteText(website) || fallback;
  if (!display) return undefined;
  return { url: website?.url || withScheme(display), display };
};

const ENTRY = {
  experience: (items) => flattenEntries(items).map(({ item, role }) => {
    const target = role ?? item;
    const { lead, items: bullets } = splitDescription(target.description);
    return compact({
      company: item.company,
      role: target.position,
      location: item.location,
      dates: target.period,
      context: lead.map((p) => htmlToText(p.html)).join(' '),
      bullets: bullets.map((b) => htmlToText(b.html)),
    });
  }).filter((e) => e.company && e.role),
  projects: (items) => items.filter((i) => i.name).map((i) => compact({ name: i.name, description: htmlToText(i.description), url: i.website?.url })),
  education: (items) => items.map((i) => compact({
    title: [i.degree, i.area].filter(Boolean).join(' '), org: i.school, location: i.location, year: i.period, description: htmlToText(i.description),
  })).filter((e) => e.title),
  certifications: (items) => items.filter((i) => i.title).map((i) => compact({ title: i.title, org: i.issuer, year: i.date })),
  awards: (items) => items.filter((i) => i.title).map((i) => compact({ title: i.title, org: i.awarder, year: i.date })),
  skills: (items) => items.filter((i) => i.name || i.keywords.length).map((i) => compact({ category: i.keywords.length ? i.name : '', items: i.keywords.length ? i.keywords : [i.name] })),
  interests: (items) => items.map((i) => i.name).filter(Boolean),
};

/**
 * @param {object} data ResumeData (parsed)
 * @param {{ lang?: string, page_format?: string, country?: string, hide?: string[], hideItems?: string[] }} [opts]
 *   `hide` names section keys other than profiles (or custom section ids); `hideItems` names item or role ids.
 * @returns {{ payload: object, unmapped: string[] }}
 */
export function resumeToPayload(data, { lang = 'en', page_format, country, hide = [], hideItems = [] } = {}) {
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
  const lists = {};
  const unmapped = [];
  for (const { type, key, section, name } of sections) {
    if (!shown(key, section)) continue;
    const items = visible(section.items);
    if (items.length === 0) continue;
    if (SLOTLESS.has(type)) unmapped.push(name);
    else (lists[type] ??= []).push(...ENTRY[type](items));
  }

  const { basics } = data;
  const profile = (network) => data.sections.profiles.items.find((p) => !p.hidden && p.network.toLowerCase() === network);
  const linkedin = profile('linkedin');
  const summary = shown('summary', data.summary) ? htmlToText(data.summary.content) : '';
  const github = profile('github');
  const payload = {
    lang,
    ...(page_format ? { page_format } : {}),
    ...(country ? { country } : {}),
    candidate: compact({
      name: basics.name,
      title: basics.headline,
      email: basics.email,
      phone: basics.phone,
      location: basics.location,
      linkedin: linkedin && link(linkedin.website, linkedin.username),
      github: github && link(github.website, github.username),
      portfolio: link(basics.website),
    }),
    ...(summary ? { summary } : {}),
    ...Object.fromEntries(Object.entries(lists).filter(([, entries]) => entries.length)),
  };
  return { payload, unmapped };
}
