// MIT License, copyright (c) 2026 Amruth Pillai. Hand-ported from Reactive Resume packages/resume/src/ats/{rules,catalog,section-aliases,walk,index}.ts and carriesUnmergedFields from merge.ts, at d065a9f7; see THIRD_PARTY_NOTICES.md.
// Messages condense apps/web/src/features/resume/editor/check/issues.ts (describeFinding) into plain English.
import { resumeDatesSchema, resumeDatesToPeriod } from './vendor/dates.mjs';
import { isFutureEndpoint, isReversedPeriod, parsePeriod, parseSingleDate } from './vendor/period.mjs';
import { layoutFor, TEMPLATE_LAYOUTS } from './template-layouts.mjs';
import { htmlToText, SECTION_ROWS } from './to-cv-md.mjs';

const MIN_BODY_FONT_SIZE = 9;
const MIN_LINE_HEIGHT = 1.15;
const MIN_PAGE_MARGIN = 8;
const MAX_BULLET_LENGTH = 240;

const section = (p) => `The ${p.name} section`;

/** One row per rule, in RR's catalog order. WEAK_BULLET_START and LONG_BULLET are career-ops's own. */
const CATALOG = Object.freeze({
  MISSING_NAME: { severity: 'error', category: 'contact', message: () => 'Your name is missing. Systems file you under the name at the top of the page.', fix: 'Add your name' },
  MISSING_EMAIL: { severity: 'error', category: 'contact', message: () => 'No email address. Most systems file candidates by email address.', fix: 'Add an email' },
  MALFORMED_EMAIL: { severity: 'error', category: 'contact', message: (p) => `The email address "${p.value}" won't be recognized, because it isn't a plain address like name@example.com.`, fix: 'Edit the email' },
  MISSING_PHONE: { severity: 'warning', category: 'contact', message: () => 'No phone number. Some application systems ask for one before you can apply.', fix: 'Add a phone number' },
  MISSING_LOCATION: { severity: 'info', category: 'contact', message: () => 'No location. A city and country let roles be matched to where you are.', fix: 'Add a location' },
  MALFORMED_URL: { severity: 'warning', category: 'contact', message: (p) => `The link "${p.value}" isn't a full address. Some systems only recognize links that start with https://.`, fix: 'Edit the link' },
  PICTURE_PRESENT: { severity: 'info', category: 'contact', message: () => 'Your resume has a photo. Some systems mishandle images, and photos are discouraged in some countries.', fix: 'Hide the photo' },

  EMPTY_PERIOD: { severity: 'warning', category: 'dates', message: () => 'An entry has no dates. Dates place it on your timeline.', fix: 'Add dates' },
  UNPARSEABLE_PERIOD: { severity: 'error', category: 'dates', message: (p) => `The dates "${p.value}" won't be read. Use a form systems recognize, such as Mar 2020 - Present.`, fix: 'Fix the dates' },
  UNPARSEABLE_DATE: { severity: 'warning', category: 'dates', message: (p) => `The date "${p.value}" won't be read. Use a form systems recognize, such as March 2022.`, fix: 'Fix the date' },
  REVERSED_PERIOD: { severity: 'error', category: 'dates', message: (p) => `The dates "${p.value}" run backwards and end before they start.`, fix: 'Fix the dates' },
  FUTURE_DATED_PERIOD: { severity: 'warning', category: 'dates', message: (p) => `The dates "${p.value}" start after today. Check the year, or mark the entry as current.`, fix: 'Fix the dates' },

  SECTION_MISSING_FROM_LAYOUT: { severity: 'error', category: 'layout', message: (p) => `${section(p)} never prints. It has entries but isn't placed on a page.`, fix: 'Add it to page 1' },
  NO_VISIBLE_EXPERIENCE: { severity: 'warning', category: 'headings', message: () => 'No work experience shows. Systems look for an experience section, and projects or volunteering can show the same history.', fix: 'Add experience' },
  MISSING_EXPERIENCE_DESCRIPTION: { severity: 'warning', category: 'writing', message: () => 'A role has no description. It names the role but not what you did, so it adds no keywords.', fix: 'Describe the role' },
  FRAGMENTED_ENTRY: { severity: 'warning', category: 'writing', message: () => 'This entry looks like part of the entry above. It has no dates and reads like a sentence cut off the entry above it, which happens when a PDF import splits a bullet, so adding dates would make it look like a separate job.', fix: 'Merge it into the entry above' },
  WEAK_BULLET_START: { severity: 'info', category: 'writing', message: (p) => `"${p.text}" opens with a duty, not an action${p.count > 1 ? `, and so ${p.count === 2 ? 'does' : 'do'} ${p.count - 1} more in this entry` : ''}. Say what you did, how, and what happened as a result. If you assisted, name your own part and do not claim the lead.`, fix: 'Rewrite the bullet' },
  LONG_BULLET: { severity: 'info', category: 'writing', message: (p) => `"${p.text}" runs to ${p.length} characters${p.count > 1 ? `, and ${p.count - 1} more in this entry ${p.count === 2 ? 'is' : 'are'} over ${MAX_BULLET_LENGTH}` : ''}. A bullet past about two lines usually holds two accomplishments.`, fix: 'Split the bullet' },
  NON_STANDARD_SECTION_TITLE: { severity: 'info', category: 'headings', message: (p) => `"${p.title}" isn't a heading systems look for. They look for headings such as Experience, Education and Skills.`, fix: 'Use the standard heading' },

  MULTI_COLUMN_PROSE_SECTION: { severity: 'warning', category: 'layout', message: (p) => `${section(p)} is split into ${p.columns} columns. Columns can scramble the order text is read in.`, fix: 'Use one column' },
  PROSE_SECTION_IN_SIDEBAR: { severity: 'warning', category: 'layout', message: (p) => `${section(p)} sits in the sidebar. Sidebars are often read last, or mixed into the main column.`, fix: 'Move it to the main column' },
  TWO_COLUMN_LAYOUT: { severity: 'warning', category: 'layout', message: (p) => `The sidebar is read after the main column, so ${p.names} come last in the text. Most systems still find them, and some don't.`, fix: 'Switch to one column' },

  SMALL_BODY_FONT: { severity: 'warning', category: 'layout', message: () => `Body text is very small. Text under ${MIN_BODY_FONT_SIZE} pt can be misread when a system re-renders it.`, fix: `Use ${MIN_BODY_FONT_SIZE} pt` },
  TIGHT_LINE_HEIGHT: { severity: 'warning', category: 'layout', message: () => `Lines are packed tightly and can run together when read. Use a line height of at least ${MIN_LINE_HEIGHT}.`, fix: `Use ${MIN_LINE_HEIGHT}` },
  TIGHT_PAGE_MARGINS: { severity: 'warning', category: 'layout', message: () => `Margins are very narrow, and text this close to the edge can be cut off. Use at least ${MIN_PAGE_MARGIN} pt.`, fix: `Use ${MIN_PAGE_MARGIN} pt margins` },
});

export const CHECK_RULE_IDS = Object.freeze(Object.keys(CATALOG));

/** The order Check lists its category rows in. */
const CATEGORIES = ['contact', 'dates', 'layout', 'headings', 'writing'];

/**
 * Conventional English headings the live builder lint accepts without complaint.
 * Kept deliberately narrow: this set decides whether NON_STANDARD_SECTION_TITLE fires.
 */
const SECTION_TITLE_ALIASES = {
  summary: new Set(['summary', 'professional summary', 'profile', 'about', 'about me', 'objective', 'career objective']),
  experience: new Set(['experience', 'work experience', 'professional experience', 'employment', 'employment history', 'work history', 'career history']),
  education: new Set(['education', 'academic background', 'education & training', 'educational background']),
  projects: new Set(['projects', 'personal projects', 'selected projects', 'side projects']),
  skills: new Set(['skills', 'technical skills', 'core competencies', 'competencies', 'skills & expertise']),
  languages: new Set(['languages']),
  interests: new Set(['interests', 'hobbies', 'hobbies & interests']),
  awards: new Set(['awards', 'honors', 'awards & honors', 'achievements']),
  certifications: new Set(['certifications', 'certificates', 'licenses', 'licenses & certifications']),
  publications: new Set(['publications', 'papers', 'research']),
  volunteer: new Set(['volunteer', 'volunteering', 'volunteer experience', 'community involvement']),
  references: new Set(['references']),
  profiles: new Set(['profiles', 'links', 'social profiles']),
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ALLOWED_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const PERIOD_REQUIRED_TYPES = new Set(['experience', 'education']);
const PROSE_SECTION_TYPES = new Set(['summary', 'experience', 'education', 'projects', 'volunteer']);

const escapeToken = (token) => token.replace(/~/g, '~0').replace(/\//g, '~1');
const decodeToken = (token) => token.replace(/~1/g, '/').replace(/~0/g, '~');

const finding = (id, pointer, params) => ({ id, pointer, ...(params ? { params } : {}) });

// --- walk.ts ---

const isRenderedSection = (s) => !s.hidden && s.placement !== 'none';
const isCoverLetter = (s) => s.type === 'cover-letter';

function buildPlacement(data, layout) {
  const placement = new Map();
  for (const page of data.metadata.layout.pages) {
    for (const id of page.main) if (!placement.has(id)) placement.set(id, 'main');
    // A full-width page prints no sidebar at all, so its sidebar sections only print if another page places them.
    if (page.fullWidth) continue;
    // A template without a sidebar prints sidebar sections in its single column.
    for (const id of page.sidebar) if (!placement.has(id)) placement.set(id, layout.sidebar ? 'sidebar' : 'main');
  }
  return placement;
}

const visibleItems = (items, sectionPointer) =>
  items.flatMap((value, index) => (value.hidden === true ? [] : [{ pointer: `${sectionPointer}/items/${index}`, value }]));

function walkSections(data, layout) {
  const placement = buildPlacement(data, layout);
  const sections = [{
    id: 'summary',
    type: 'summary',
    title: data.summary.title,
    columns: data.summary.columns,
    hidden: data.summary.hidden,
    placement: placement.get('summary') ?? 'none',
    pointer: '/summary',
    items: data.summary.content.trim() ? [{ pointer: '/summary/content', value: { content: data.summary.content } }] : [],
  }];
  for (const [key, s] of Object.entries(data.sections)) {
    const pointer = `/sections/${escapeToken(key)}`;
    sections.push({ id: key, type: key, title: s.title, columns: s.columns, hidden: s.hidden, placement: placement.get(key) ?? 'none', pointer, items: visibleItems(s.items, pointer) });
  }
  data.customSections.forEach((s, index) => {
    const pointer = `/customSections/${index}`;
    sections.push({ id: s.id, type: s.type, title: s.title, columns: s.columns, hidden: s.hidden, placement: placement.get(s.id) ?? 'none', pointer, items: visibleItems(s.items, pointer) });
  });
  // name is the heading cv.md prints (to-cv-md.mjs sectionDescriptors): the cvStyle heading for the summary
  // and experience, else the author's title, else the type's label, as RR's getSectionName falls back.
  const style = data.careerOps?.cvStyle;
  const printed = { summary: style?.summaryHeading, experience: style?.experienceHeading };
  return sections.map((s) => ({ ...s, name: (s.id === s.type && printed[s.type]) || s.title.trim() || SECTION_ROWS[s.type]?.heading || s.type }));
}

// --- merge.ts ---

/**
 * Fields a merge has nowhere to put: dates of any kind, a link, roles. An entry carrying one is never merged, so
 * nothing the user wrote is silently dropped.
 */
function carriesUnmergedFields(entry) {
  const filled = (value) => typeof value === 'string' && value.trim().length > 0;
  const { website, dates } = entry;
  return (
    filled(website?.url) ||
    filled(website?.label) ||
    filled(entry.period) ||
    Boolean(dates?.start || dates?.end || dates?.present === true || filled(dates?.raw)) ||
    (Array.isArray(entry.roles) && entry.roles.length > 0)
  );
}

// --- rules.ts ---

const textOf = (value) => (typeof value === 'string' ? htmlToText(value) : '');
const hasText = (value) => textOf(value).length > 0;

function isParseableUrl(value) {
  try {
    return ALLOWED_URL_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

function contactRules(ctx) {
  const { basics, picture } = ctx.data;
  const out = [];
  if (!basics.name.trim()) out.push(finding('MISSING_NAME', '/basics/name'));
  const email = basics.email.trim();
  if (!email) out.push(finding('MISSING_EMAIL', '/basics/email'));
  else if (!EMAIL_PATTERN.test(email)) out.push(finding('MALFORMED_EMAIL', '/basics/email', { value: email }));
  if (!basics.phone.trim()) out.push(finding('MISSING_PHONE', '/basics/phone'));
  if (!basics.location.trim()) out.push(finding('MISSING_LOCATION', '/basics/location'));
  if (!picture.hidden && picture.url.trim()) out.push(finding('PICTURE_PRESENT', '/picture'));
  return out;
}

function urlRules(ctx) {
  const out = [];
  const website = ctx.data.basics.website.url.trim();
  if (website && !isParseableUrl(website)) out.push(finding('MALFORMED_URL', '/basics/website/url', { value: website }));
  ctx.data.basics.customFields.forEach((field, index) => {
    const link = field.link.trim();
    if (link && !isParseableUrl(link)) out.push(finding('MALFORMED_URL', `/basics/customFields/${index}/link`, { value: link }));
  });
  for (const s of ctx.sections) {
    if (isCoverLetter(s) || !isRenderedSection(s)) continue;
    for (const item of s.items) {
      const url = typeof item.value.website?.url === 'string' ? item.value.website.url.trim() : '';
      if (url && !isParseableUrl(url)) out.push(finding('MALFORMED_URL', `${item.pointer}/website/url`, { value: url }));
    }
  }
  return out;
}

// Structured dates are read already; text that never parsed keeps its original in `raw`.
const readItemDates = (dates) => {
  const parsed = resumeDatesSchema.safeParse(dates);
  return parsed.success ? parsed.data : undefined;
};

function periodFindings(raw, dates, pointer, type, ctx) {
  if (typeof raw !== 'string') return [];
  const value = raw.trim();
  if (!value) return PERIOD_REQUIRED_TYPES.has(type) ? [finding('EMPTY_PERIOD', pointer)] : [];

  const structured = readItemDates(dates);
  const parsed = structured ? resumeDatesToPeriod(structured) : parsePeriod(value, ctx.locale);
  if (!parsed) return [finding('UNPARSEABLE_PERIOD', pointer, { value })];

  const out = [];
  if (parsed.start && parsed.end && isReversedPeriod(parsed.start, parsed.end)) out.push(finding('REVERSED_PERIOD', pointer, { value }));
  if (parsed.start && isFutureEndpoint(parsed.start, ctx.now)) out.push(finding('FUTURE_DATED_PERIOD', pointer, { value }));
  return out;
}

function singleDateFindings(raw, dates, pointer, ctx) {
  if (typeof raw !== 'string') return [];
  const value = raw.trim();
  if (!value) return [];
  const structured = readItemDates(dates);
  const readable = structured ? Boolean(structured.start) : Boolean(parseSingleDate(value, ctx.locale));
  return readable ? [] : [finding('UNPARSEABLE_DATE', pointer, { value })];
}

/** The heading fields an import can split, each judged on its own: employer and title; school, degree and field. */
const HEADING_FIELDS = {
  experience: ['company', 'position'],
  education: ['school', 'degree', 'area'],
};

/**
 * Words a sentence can't end on: conjunctions, articles, possessives and prepositions, in lower case and on their own
 * (not "sign-on", "Vipps AS" or "Series A"). Particles a phrasal verb ends on ("logged in", "took over") are left out.
 */
const DANGLING_WORD =
  /(?:^|\s)(?:and|or|but|nor|by|of|to|the|for|with|from|as|into|onto|than|that|which|while|across|per|via|through|using|including|during|within|between|without|among|toward|towards|against|a|an|our|their|its|my|your|whose)$/;
/** Words that continue a sentence: a heading that opens on one was cut from the text above. */
const CONTINUING_WORD = /^(?:and|or|but|which|while|then|so|to|with|by|of|for|including|plus)\s/;
const MAX_HEADING_WORDS = 10;
/** How a sentence or bullet closes. A line without one is still open, unless the writer never closes lines. */
const CLOSING_PUNCTUATION = /[.!?…"”)]$/;

/** The description's lines: its paragraphs, bullets and line breaks. */
const linesOf = (value) => (typeof value === 'string' ? value.split(/<\/(?:p|li|h\d)>|<br\s*\/?>/i).map(textOf).filter(Boolean) : []);

/** Text that stops on a comma, dash or dangling word: the sentence goes on somewhere else. */
const endsMidSentence = (text) => /[,;:–—-]$/.test(text) || DANGLING_WORD.test(text);

/** A field cut out of a sentence: it ends mid-sentence, or opens on a continuing word. */
const isCutMidSentence = (text) => endsMidSentence(text) || CONTINUING_WORD.test(text);

/** How the text above ends: cut on a dangling word or comma, or only open (its last line has no closing punctuation). */
function aboveEnding(value) {
  const lines = linesOf(value.description);
  const last = lines.at(-1) ?? '';
  // Bullets written without full stops aren't open sentences: only a line left open among closed ones, or a lone
  // line, says the sentence went on.
  const closesLines = lines.length === 1 || lines.slice(0, -1).some((line) => CLOSING_PUNCTUATION.test(line));
  return { cut: endsMidSentence(last), open: last.length > 0 && !CLOSING_PUNCTUATION.test(last) && closesLines };
}

/**
 * A heading that is the rest of a sentence from the entry above: it ends or opens like a cut ("…time by", "and kept…");
 * or the text above was cut and it runs on for more than 10 words; or the text above is open and it reads as prose,
 * opening on an ordinary lower-case word ("uptime above target…", "team by 40%…", "25% across…"). "Senior Vice
 * President of Global Engineering Operations", "eBay Marketplace" and "iOS platform lead" are real headings.
 */
function readsAsSentence(text, above) {
  if ((above.cut || above.open) && isCutMidSentence(text)) return true;
  const words = text.split(/\s+/).filter(Boolean);
  if (
    words.length > MAX_HEADING_WORDS &&
    (above.cut || (isCutMidSentence(text) && /\b(?:built|shipped|reduced|led|delivered|managed|improved|mentored)\b/i.test(text)))
  ) return true;
  const prose = /^(?:[\d•·*-]|\p{Ll}[^\p{Lu}]*$)/u.test(words[0] ?? '');
  return (above.cut || above.open) && words.length >= 4 && prose;
}

const isDated = (value) => textOf(value.period).length > 0 || (readItemDates(value.dates)?.start ?? null) !== null;

/**
 * Entries a PDF import split off the entry above: nothing a merge would lose (no dates, link or roles of their own),
 * and a heading field that is a sentence fragment (or no heading at all, only text), directly after a dated entry or
 * another such fragment. Adding dates would make them look like real jobs, so they're reported as part of the entry
 * above instead. A real entry without dates still gets "Add dates".
 */
const fragmentsBySections = new WeakMap();

function fragmentPointers(sections) {
  const cached = fragmentsBySections.get(sections);
  if (cached) return cached;

  const fragments = new Set();
  for (const s of sections) {
    const fields = HEADING_FIELDS[s.type];
    if (!fields || !isRenderedSection(s)) continue;
    s.items.forEach((item, index) => {
      const previous = s.items[index - 1];
      if (!previous || !(isDated(previous.value) || fragments.has(previous.pointer))) return;
      if (carriesUnmergedFields(item.value)) return;
      const headings = fields.map((field) => textOf(item.value[field])).filter(Boolean);
      const above = aboveEnding(previous.value);
      if (fragments.has(previous.pointer)) above.open = true;
      const fragment = headings.length > 0
        ? headings.some((heading) => readsAsSentence(heading, above))
        : !textOf(item.value.location) && textOf(item.value.description).length > 0;
      if (fragment) fragments.add(item.pointer);
    });
  }
  fragmentsBySections.set(sections, fragments);
  return fragments;
}

const fragmentRules = (ctx) => [...fragmentPointers(ctx.sections)].map((pointer) => finding('FRAGMENTED_ENTRY', pointer));

/** The weak starts modes/heuristics/recruiter-side.md names. English only, so it stays quiet on other languages. */
const WEAK_BULLET_START = /^(?:responsible for|helped|assisted|worked on|participated in)(?![\w-])/i;
/**
 * The text of each list item, without a leading bullet glyph. A nested item is its own bullet and its parent keeps
 * the text on both sides of it. An <li> that was never closed ends at the next <li> or at the end of its list.
 * Text outside a list is not a bullet.
 */
function bulletsOf(value) {
  if (typeof value !== 'string') return [];
  value = value.replace(/<!--[\s\S]*?-->/g, '');
  const bullets = [];
  const open = [];
  let depth = 0;
  let from = 0;
  const take = (to) => {
    if (open.length) open.at(-1).html += ` ${value.slice(from, to)}`;
  };
  const close = () => bullets.push(textOf(open.pop().html).replace(/^[•\-–—*·]\s*/, ''));
  // [^<>]* and not [^>]*: an unclosed "<li" must not make every later tag rescan the rest of the text.
  for (const tag of value.matchAll(/<(\/?)(li|ul|ol)\b[^<>]*>/gi)) {
    take(tag.index);
    from = tag.index + tag[0].length;
    const closing = tag[1] === '/';
    if (tag[2].toLowerCase() === 'li') {
      if (open.length && (closing || open.at(-1).depth === depth)) close();
      if (!closing) open.push({ depth, html: '' });
    } else if (closing) {
      while (open.length && open.at(-1).depth >= depth) close();
      depth = Math.max(0, depth - 1);
    } else {
      depth += 1;
    }
  }
  take(value.length);
  while (open.length) close();
  return bullets.filter(Boolean);
}
const clip = (text) => (text.length > 60 ? `${text.slice(0, 60)}…` : text);

/**
 * One finding per rule per description, with a count: two findings on one pointer would share a key. The weak
 * starts are English phrases, so that rule runs on English resumes only.
 */
function bulletFindings(description, pointer, english) {
  const bullets = bulletsOf(description);
  const weak = english ? bullets.filter((bullet) => WEAK_BULLET_START.test(bullet)) : [];
  const long = bullets.filter((bullet) => bullet.length > MAX_BULLET_LENGTH);
  return [
    ...(weak.length ? [finding('WEAK_BULLET_START', pointer, { text: clip(weak[0]), count: weak.length })] : []),
    ...(long.length ? [finding('LONG_BULLET', pointer, { text: clip(long[0]), count: long.length, length: long[0].length })] : []),
  ];
}

function dateRules(ctx) {
  const out = [];
  const fragments = fragmentPointers(ctx.sections);
  for (const s of ctx.sections) {
    if (isCoverLetter(s) || !isRenderedSection(s)) continue;
    for (const item of s.items) {
      // A fragment is reported as part of the entry above; asking for its dates would make it look real.
      if (fragments.has(item.pointer)) continue;
      out.push(...periodFindings(item.value.period, item.value.dates, `${item.pointer}/period`, s.type, ctx));
      out.push(...singleDateFindings(item.value.date, item.value.dates, `${item.pointer}/date`, ctx));
      const roles = item.value.roles;
      if (!Array.isArray(roles)) continue;
      roles.forEach((role, index) => {
        out.push(...periodFindings(role.period, role.dates, `${item.pointer}/roles/${index}/period`, s.type, ctx));
      });
    }
  }
  return out;
}

function structureRules(ctx) {
  const out = [];
  // A section with no items is not reported: RR's renderers (and the career-ops payload, which drops
  // empty sections) emit no heading for it, so it produces nothing on the page rather than a bare title.
  // Only content that can never render (placed on no page at all) is worth a finding.
  for (const s of ctx.sections) {
    if (isCoverLetter(s) || s.hidden) continue;
    if (s.placement === 'none' && s.items.length > 0) out.push(finding('SECTION_MISSING_FROM_LAYOUT', s.pointer, { section: s.id, name: s.name }));
  }
  const experience = ctx.sections.filter((s) => s.type === 'experience' && isRenderedSection(s));
  if (!experience.some((s) => s.items.length > 0)) out.push(finding('NO_VISIBLE_EXPERIENCE', '/sections/experience'));
  const english = isEnglish(ctx.locale);
  for (const s of experience) {
    for (const item of s.items) {
      const roles = item.value.roles;
      const roleHasText = Array.isArray(roles) && roles.some((role) => hasText(role.description));
      if (!hasText(item.value.description) && !roleHasText) out.push(finding('MISSING_EXPERIENCE_DESCRIPTION', `${item.pointer}/description`));
      out.push(...bulletFindings(item.value.description, `${item.pointer}/description`, english));
      if (Array.isArray(roles)) roles.forEach((role, index) => out.push(...bulletFindings(role.description, `${item.pointer}/roles/${index}/description`, english)));
    }
  }
  return out;
}

/** Rules that know English wording only. They apply to English resumes alone and stay out of the score elsewhere. */
const ENGLISH_ONLY_RULES = new Set(['NON_STANDARD_SECTION_TITLE', 'WEAK_BULLET_START']);
const isEnglish = (locale) => locale.toLowerCase().startsWith('en');

function titleRules(ctx) {
  if (!isEnglish(ctx.locale)) return [];
  const out = [];
  for (const s of ctx.sections) {
    if (isCoverLetter(s) || !isRenderedSection(s)) continue;
    const title = s.title.trim();
    if (!title) continue;
    const aliases = SECTION_TITLE_ALIASES[s.type];
    if (!aliases || aliases.has(title.toLowerCase())) continue;
    out.push(finding('NON_STANDARD_SECTION_TITLE', `${s.pointer}/title`, { section: s.id, title }));
  }
  return out;
}

function layoutRules(ctx) {
  const out = [];
  for (const s of ctx.sections) {
    if (isCoverLetter(s) || !isRenderedSection(s)) continue;
    if (!PROSE_SECTION_TYPES.has(s.type) || s.items.length === 0) continue;
    if (s.columns > 1) out.push(finding('MULTI_COLUMN_PROSE_SECTION', `${s.pointer}/columns`, { section: s.id, name: s.name, columns: s.columns }));
    if (s.placement === 'sidebar') out.push(finding('PROSE_SECTION_IN_SIDEBAR', s.pointer, { section: s.id, name: s.name }));
  }
  return out;
}

/**
 * A two-column template prints its sidebar as a column of its own, which most systems read after the main
 * column (or interleave with it). Full-width pages print their sidebar sections in the main column instead.
 */
function twoColumnRules(ctx) {
  if (ctx.layout.columns !== 2) return [];
  const printed = new Map(ctx.sections.filter((s) => !isCoverLetter(s) && isRenderedSection(s) && s.items.length > 0).map((s) => [s.id, s.name]));
  const sidebar = new Set(ctx.data.metadata.layout.pages.flatMap((page) => (page.fullWidth ? [] : page.sidebar.filter((id) => printed.has(id)))));
  if (sidebar.size === 0) return [];
  return [finding('TWO_COLUMN_LAYOUT', '/metadata/layout/pages', { sections: [...sidebar].join(','), names: [...sidebar].map((id) => printed.get(id)).join(', ') })];
}

function typographyRules(ctx) {
  const out = [];
  const { page, typography } = ctx.data.metadata;
  if (typography.body.fontSize < MIN_BODY_FONT_SIZE) {
    out.push(finding('SMALL_BODY_FONT', '/metadata/typography/body/fontSize', { fontSize: typography.body.fontSize, minimum: MIN_BODY_FONT_SIZE }));
  }
  if (typography.body.lineHeight < MIN_LINE_HEIGHT) {
    out.push(finding('TIGHT_LINE_HEIGHT', '/metadata/typography/body/lineHeight', { lineHeight: typography.body.lineHeight, minimum: MIN_LINE_HEIGHT }));
  }
  for (const axis of ['marginX', 'marginY']) {
    if (page[axis] < MIN_PAGE_MARGIN) out.push(finding('TIGHT_PAGE_MARGINS', `/metadata/page/${axis}`, { margin: page[axis], minimum: MIN_PAGE_MARGIN }));
  }
  return out;
}

const RULES = [contactRules, urlRules, dateRules, structureRules, fragmentRules, titleRules, layoutRules, twoColumnRules, typographyRules];

// --- index.ts ---

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

/** The finding's key: its id and pointer, with array indexes swapped for entry ids, so moving entries doesn't change it. */
function findingKey(id, pointer, data) {
  let node = data;
  const tokens = pointer.split('/').slice(1).map((token) => {
    if (Array.isArray(node)) {
      const entry = node[Number(token)];
      node = entry;
      return typeof entry?.id === 'string' ? `#${entry.id}` : token;
    }
    node = node?.[decodeToken(token)];
    return token;
  });
  return `${id}:/${tokens.join('/')}`;
}

/**
 * Where a pointer sits on the printed page, as numbers to compare: the header first, then sections in layout order
 * (each page's main column, then its sidebar), then each entry by its place, then anything not on the page.
 */
function pagePosition(pointer, data) {
  const tokens = pointer.split('/').slice(1).map(decodeToken);
  const [head, next] = tokens;
  if (head === 'basics' || head === 'picture') return [0];
  const sectionId = head === 'summary' ? 'summary' : head === 'sections' ? next : head === 'customSections' ? data.customSections[Number(next)]?.id : undefined;
  const order = data.metadata.layout.pages.flatMap((page) => [...page.main, ...page.sidebar]);
  const index = sectionId ? order.indexOf(sectionId) : -1;
  if (index === -1) return [Number.MAX_SAFE_INTEGER];
  // Every array index after the section, so items/2/roles/10 sorts after items/2/roles/9.
  return [1 + index, ...tokens.slice(2).flatMap((token) => (/^\d+$/.test(token) ? [Number(token)] : []))];
}

/** Most severe first; then in page order; then by rule. */
const compareFindings = (data) => (a, b) => {
  const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (bySeverity !== 0) return bySeverity;
  const pa = pagePosition(a.pointer, data);
  const pb = pagePosition(b.pointer, data);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const difference = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (difference !== 0) return difference;
  }
  if (a.pointer !== b.pointer) return a.pointer < b.pointer ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
};

const toPath = (pointer) => pointer.split('/').slice(1).map(decodeToken).join('.');

/**
 * RR's Check over a parsed resume. A finding is ignored when its key or its id is in metadata.check.ignored, or its
 * id is in `ignore`. `layout` defaults to careerOps.template's row in template-layouts.mjs; templateKnown is
 * false when that name has no row and the layout rules assumed one column.
 */
export function checkResume(data, { now = new Date(), locale, ignore = [], layout } = {}) {
  const template = data.careerOps?.template;
  const templateKnown = layout !== undefined || Object.hasOwn(TEMPLATE_LAYOUTS, template ?? '');
  layout ??= layoutFor(template);
  const ctx = {
    data,
    sections: walkSections(data, layout),
    locale: locale ?? (data.metadata.page.locale.trim() || 'en-US'),
    now,
    layout,
  };

  const ignoredIn = new Set(data.metadata.check?.ignored ?? []);
  const ignoredIds = new Set(ignore);
  const all = RULES.flatMap((rule) => rule(ctx))
    .map(({ id, pointer, params }) => {
      const row = CATALOG[id];
      return { id, category: row.category, severity: row.severity, pointer, key: findingKey(id, pointer, data), params };
    })
    .sort(compareFindings(data))
    .map(({ pointer, params, ...rest }) => ({
      ...rest,
      // path is the dotted form for display and data-resume-path; pointer is the lossless JSON pointer.
      path: toPath(pointer),
      pointer,
      message: CATALOG[rest.id].message(params ?? {}),
      fix: CATALOG[rest.id].fix,
      ...(params ? { params } : {}),
    }));
  const isIgnored = (f) => ignoredIn.has(f.key) || ignoredIn.has(f.id) || ignoredIds.has(f.id);
  const findings = all.filter((f) => !isIgnored(f));

  const counts = { error: 0, warning: 0, info: 0 };
  const failed = new Set();
  for (const f of findings) {
    counts[f.severity] += 1;
    failed.add(f.id);
  }
  const applicable = CHECK_RULE_IDS.filter((id) => !ENGLISH_ONLY_RULES.has(id) || isEnglish(ctx.locale));
  const passed = applicable.filter((id) => !failed.has(id));
  const categories = Object.fromEntries(CATEGORIES.map((category) => [category, {
    total: applicable.filter((id) => CATALOG[id].category === category).length,
    passed: passed.filter((id) => CATALOG[id].category === category).length,
  }]));

  return {
    score: Math.round((passed.length / applicable.length) * 100),
    templateKnown,
    totalRules: applicable.length,
    passedRules: passed.length,
    counts,
    categories,
    findings,
    ignored: all.filter(isIgnored),
  };
}
