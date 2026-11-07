// Ported from Reactive Resume packages/import/src/plain-text.ts at d065a9f7. MIT, copyright Amruth Pillai; see THIRD_PARTY_NOTICES.md.
// Adapted: JavaScript; crypto.randomUUID() for generateId(); the vendored schema, period and default modules.
import { randomUUID } from 'node:crypto';
import { parseResumeData } from '../vendor/data.mjs';
import { defaultResumeData } from '../vendor/default.mjs';
import { parsePeriod, parseSingleDate } from '../vendor/period.mjs';
import { BULLET_PATTERN, toHtmlBlocks } from './html.mjs';

const MAX_HEADING_WORDS = 4;
const MAX_HEADING_LENGTH = 48;
const MAX_ENTRY_HEADER_WORDS = 8;
const MAX_LIST_ITEMS = 60;
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15;

const SECTION_ALIASES = {
  summary: 'summary',
  'professional summary': 'summary',
  'career summary': 'summary',
  profile: 'summary',
  'personal profile': 'summary',
  about: 'summary',
  'about me': 'summary',
  objective: 'summary',
  'career objective': 'summary',
  experience: 'experience',
  'work experience': 'experience',
  'professional experience': 'experience',
  employment: 'experience',
  'employment history': 'experience',
  'work history': 'experience',
  'career history': 'experience',
  education: 'education',
  'academic background': 'education',
  'education and training': 'education',
  qualifications: 'education',
  skills: 'skills',
  'technical skills': 'skills',
  'key skills': 'skills',
  'core competencies': 'skills',
  competencies: 'skills',
  expertise: 'skills',
  projects: 'projects',
  'personal projects': 'projects',
  'selected projects': 'projects',
  'side projects': 'projects',
  languages: 'languages',
  interests: 'interests',
  hobbies: 'interests',
  'hobbies and interests': 'interests',
  awards: 'awards',
  honors: 'awards',
  honours: 'awards',
  'awards and honors': 'awards',
  achievements: 'awards',
  certifications: 'certifications',
  certificates: 'certifications',
  licenses: 'certifications',
  'licenses and certifications': 'certifications',
  publications: 'publications',
  papers: 'publications',
  research: 'publications',
  volunteer: 'volunteer',
  volunteering: 'volunteer',
  'volunteer experience': 'volunteer',
  'community involvement': 'volunteer',
  references: 'references',
  profiles: 'profiles',
  links: 'profiles',
  'social profiles': 'profiles',
};

// Lookbehinds below start a word or address only at its first character, so a long run is scanned once instead of
// once per character.
const EMAIL_PATTERN = /(?<![\w.+-])[\w.+-]+@[\w-]+\.[\w.-]*\w/;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s,;|•·]+/gi;
const PHONE_CANDIDATE = /[+(]?\d[\d\s().+-]{5,}\d/g;
const URL_TEST = /\b(?:https?:\/\/|www\.)\S+/i;
const HEADER_SCAN_LINES = 6;
const ENTRY_PREAMBLE_LOOKAHEAD = 4;
const PERIOD_CANDIDATE =
  /(?:(?<!\p{L})\p{L}{3,}\.?\s+)?(?:\d{1,2}[/.])?\d{4}\s*(?:[-–—~]|to|until|through)\s*(?:(?:\p{L}{3,}\.?\s+)?(?:\d{1,2}[/.])?\d{4}|\p{L}+)/giu;
const STRONG_SEPARATOR = /\s*[|•·]\s*|\s{2,}|\s+[–—]\s+/;
const SENTENCE_END = /[.!?]$/;
const TRAILING_DATES = [
  /(?:(?<!\p{L})\p{L}{3,}\.?\s+)?(?:\d{1,2}[/.])?(?:19|20)\d{2}$/u,
  /(?:\d{1,2}[/.])?(?:19|20)\d{2}$/,
];

const normalizeHeading = (line) =>
  line
    .replace(/[:：]\s*$/, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const COMPACT_SECTION_ALIASES = Object.fromEntries(
  Object.entries(SECTION_ALIASES).map(([name, key]) => [name.replaceAll(' ', ''), key]),
);

function knownHeading(line) {
  if (/[.!?;,]$/.test(line.trim())) return null;
  const normalized = normalizeHeading(line);
  if (!normalized) return null;
  // Letter spacing can be emitted as partial words ("E D U CAT I O N").
  return SECTION_ALIASES[normalized] ?? COMPACT_SECTION_ALIASES[normalized.replaceAll(' ', '')] ?? null;
}

function looksLikeHeading(line) {
  const trimmed = line.trim().replace(/[:：]$/, '');
  if (!trimmed || trimmed.length > MAX_HEADING_LENGTH || /\d/.test(trimmed)) return false;
  if (trimmed.split(/\s+/).length > MAX_HEADING_WORDS) return false;
  const letters = trimmed.replace(/[^\p{L}]/gu, '');
  if (letters.length < 3) return false;
  return letters === letters.toLocaleUpperCase() && letters !== letters.toLocaleLowerCase();
}

function looksLikeTitleCaseHeading(line) {
  const trimmed = line.trim().replace(/[:：]$/, '');
  if (!trimmed || trimmed.length > MAX_HEADING_LENGTH || /\d/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  if (words.length > MAX_HEADING_WORDS) return false;
  return words.every((word) => {
    const letters = word.replace(/[^\p{L}]/gu, '');
    if (letters.length === 0) return false;
    return letters[0] === letters[0]?.toLocaleUpperCase() && letters.slice(1) === letters.slice(1).toLocaleLowerCase();
  });
}

/**
 * Whether a line could be the header of an entry rather than prose belonging to the previous one, so a
 * narrative line near the next role's dates is not promoted to a header.
 */
function looksLikeEntryHeader(line) {
  const trimmed = line.trim();
  if (STRONG_SEPARATOR.test(trimmed)) return true;
  if (SENTENCE_END.test(trimmed)) return false;
  return trimmed.split(/\s+/).length <= MAX_ENTRY_HEADER_WORDS;
}

function findPeriod(line) {
  PERIOD_CANDIDATE.lastIndex = 0;
  for (const match of line.match(PERIOD_CANDIDATE) ?? []) {
    if (parsePeriod(match)) return match.trim();
    // The optional month can consume a role title before a year-only range ("Engineer 2020 – Present").
    const yearRange = match.replace(/^\p{L}{3,}\.?\s+/u, '');
    if (parsePeriod(yearRange)) return yearRange.trim();
  }
  return '';
}

function findSingleDate(text) {
  const trimmed = text.trim();
  for (const pattern of TRAILING_DATES) {
    const value = pattern.exec(trimmed)?.[0]?.trim();
    if (value && parseSingleDate(value)) return value;
  }
  return '';
}

function extractPhone(text) {
  for (const candidate of text.match(PHONE_CANDIDATE) ?? []) {
    const digits = candidate.replace(/\D/g, '');
    if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) continue;
    if (parsePeriod(candidate)) continue;
    return candidate.trim();
  }
  return '';
}

/** Exact record date evidence; a date mentioned inside prose is not a date cell. */
function standaloneDate(text) {
  const value = text.trim();
  return value && (findPeriod(value) === value || parseSingleDate(value) !== null) ? value : '';
}

function isDateLine(line, allowSingleDate = true) {
  if (findPeriod(line)) return true;
  // A section grouped without single dates reads a bare "2022" as text, so the lookahead has to agree with it.
  if (!allowSingleDate) return false;
  const bare = line.replace(BULLET_PATTERN, '').trim();
  return standaloneDate(bare) !== '';
}

function introducesEntry(lines, index, allowSingleDate = true) {
  for (let offset = 1; offset <= ENTRY_PREAMBLE_LOOKAHEAD; offset++) {
    const line = lines[index + offset];
    if (line === undefined || BULLET_PATTERN.test(line)) return false;
    if (isDateLine(line, allowSingleDate)) return true;
  }
  return false;
}

function headerBoundary(lines) {
  let boundary = 0;
  for (const [index, line] of lines.slice(0, HEADER_SCAN_LINES).entries()) {
    if (knownHeading(line)) break;
    if (EMAIL_PATTERN.test(line) || URL_TEST.test(line) || extractPhone(line)) boundary = index;
  }
  return boundary;
}

const HEADER_PUNCTUATION = /[\s,;|•·–—-]/;

// A scan instead of `/[…]+$/`, which retries from every character of a long separator run (quadratic time).
function trimHeaderPunctuation(part) {
  let start = 0;
  let end = part.length;
  while (start < end && HEADER_PUNCTUATION.test(part.charAt(start))) start++;
  while (end > start && HEADER_PUNCTUATION.test(part.charAt(end - 1))) end--;
  return part.slice(start, end);
}

function splitHeaderParts(text) {
  return text.split(STRONG_SEPARATOR).map(trimHeaderPunctuation).filter(Boolean);
}

function splitList(lines) {
  const values = [];
  for (const line of lines) {
    for (const piece of line.replace(BULLET_PATTERN, '').split(/[,;|•·]|\s{3,}/)) {
      const value = piece.trim();
      if (value) values.push(value);
    }
  }
  return [...new Set(values)].slice(0, MAX_LIST_ITEMS);
}

// Every section shape maps headerParts[0] onto a field the schema requires, so a section opening on a date line takes its header from the body.
function withHeaderText(entry) {
  if (entry.headerParts.length > 0) return entry;
  const [first, ...rest] = entry.body;
  return { ...entry, headerParts: splitHeaderParts(first ?? ''), body: rest };
}

function groupEntries(lines, allowSingleDate = false) {
  const cleaned = lines.map((line) => line.trim()).filter(Boolean);
  const entries = [];
  let current = null;

  const dateOf = (line) => {
    if (BULLET_PATTERN.test(line)) return '';
    const period = findPeriod(line);
    if (period) return period;
    return allowSingleDate ? findSingleDate(line) : '';
  };

  for (const [index, line] of cleaned.entries()) {
    const date = dateOf(line);
    if (date) {
      const remainder = splitHeaderParts(line.replace(date, ' '));
      if (current && !current.period) {
        current.period = date;
        current.headerParts.push(...remainder);
        continue;
      }
      if (current) entries.push(current);
      current = { period: date, headerParts: remainder, body: [] };
      continue;
    }

    if (!current) {
      current = { period: '', headerParts: splitHeaderParts(line), body: [] };
      continue;
    }

    const isBullet = BULLET_PATTERN.test(line);
    const leadsToDate = !isBullet && looksLikeEntryHeader(line) && introducesEntry(cleaned, index, allowSingleDate);

    if (leadsToDate && !current.period && current.body.length === 0) {
      current.headerParts.push(...splitHeaderParts(line));
      continue;
    }
    if (leadsToDate) {
      entries.push(current);
      current = { period: '', headerParts: splitHeaderParts(line), body: [] };
      continue;
    }
    current.body.push(line);
  }

  if (current) entries.push(current);
  return entries.map(withHeaderText).filter((entry) => entry.headerParts.length > 0);
}

function entryDescription(entry, usedParts) {
  const leftover = entry.headerParts.slice(usedParts);
  return toHtmlBlocks([...leftover, ...entry.body]);
}

const baseItem = () => ({ id: randomUUID(), hidden: false });

const emptyWebsite = { url: '', label: '', inlineLink: false };

function buildSectionItems(key, lines) {
  if (key === 'skills' || key === 'interests') {
    return splitList(lines).map((name) => ({
      ...baseItem(),
      icon: '',
      iconColor: '',
      name,
      ...(key === 'skills' ? { proficiency: '', level: 0, keywords: [] } : { keywords: [] }),
    }));
  }

  if (key === 'languages') {
    return lines
      .map((line) => line.replace(BULLET_PATTERN, '').trim())
      .filter(Boolean)
      .map((line) => {
        const match = /^(.+?)\s*[([–—-]\s*(.+?)\s*[)\]]?$/.exec(line);
        return { ...baseItem(), language: (match?.[1] ?? line).trim(), fluency: (match?.[2] ?? '').trim(), level: 0 };
      });
  }

  if (key === 'profiles') {
    return lines
      .map((line) => line.replace(BULLET_PATTERN, '').trim())
      .filter(Boolean)
      .map((line) => {
        const url = line.match(URL_PATTERN)?.[0] ?? '';
        const network = splitHeaderParts(line.replace(url, ' '))[0] ?? line;
        return { ...baseItem(), icon: '', iconColor: '', network, username: '', website: { url, label: '', inlineLink: false } };
      });
  }

  const dated = key === 'awards' || key === 'certifications' || key === 'publications';
  const entries = groupEntries(lines, dated);

  if (key === 'experience') {
    return entries.map((entry) => ({
      ...baseItem(),
      company: entry.headerParts[0] ?? '',
      position: entry.headerParts[1] ?? '',
      location: entry.headerParts[2] ?? '',
      period: entry.period,
      website: emptyWebsite,
      description: entryDescription(entry, 3),
      roles: [],
    }));
  }

  if (key === 'education') {
    return entries.map((entry) => ({
      ...baseItem(),
      school: entry.headerParts[0] ?? '',
      degree: entry.headerParts[1] ?? '',
      area: '',
      grade: '',
      location: entry.headerParts[2] ?? '',
      period: entry.period,
      website: emptyWebsite,
      description: entryDescription(entry, 3),
    }));
  }

  if (key === 'projects') {
    return entries.map((entry) => ({
      ...baseItem(), name: entry.headerParts[0] ?? '', period: entry.period, website: emptyWebsite, description: entryDescription(entry, 1),
    }));
  }

  if (key === 'volunteer') {
    return entries.map((entry) => ({
      ...baseItem(),
      organization: entry.headerParts[0] ?? '',
      location: entry.headerParts[1] ?? '',
      period: entry.period,
      website: emptyWebsite,
      description: entryDescription(entry, 2),
    }));
  }

  if (key === 'awards' || key === 'certifications' || key === 'publications') {
    const second = { awards: 'awarder', certifications: 'issuer', publications: 'publisher' }[key];
    return entries.map((entry) => ({
      ...baseItem(),
      title: entry.headerParts[0] ?? '',
      [second]: entry.headerParts[1] ?? '',
      date: entry.period,
      website: emptyWebsite,
      description: entryDescription(entry, 2),
    }));
  }

  return entries.map((entry) => ({
    ...baseItem(),
    name: entry.headerParts[0] ?? '',
    position: entry.headerParts[1] ?? '',
    phone: '',
    website: emptyWebsite,
    description: entryDescription(entry, 2),
  }));
}

function segment(lines) {
  const records = lines
    .map((line, index) => ({ line: line.trim(), precededByBlank: index > 0 && !lines[index - 1]?.trim() }))
    .filter((record) => record.line);
  const cleaned = records.map((record) => record.line);
  const boundary = headerBoundary(cleaned);
  const header = [];
  const segments = [];
  let current = null;

  for (const [index, { line, precededByBlank }] of records.entries()) {
    const key = knownHeading(line);
    const isolatedTitleCase = precededByBlank && looksLikeTitleCaseHeading(line);
    // With no section open the entry-preamble guard has nothing to protect, so a dated custom section that
    // opens the body is not swallowed into the contact header.
    const unknown =
      key === null &&
      index > boundary &&
      (looksLikeHeading(line) || isolatedTitleCase) &&
      (current === null || isolatedTitleCase || !introducesEntry(cleaned, index));

    if (key !== null || unknown) {
      if (current) segments.push(current);
      current = { key, title: line.replace(/[:：]\s*$/, '').trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
    else header.push(line);
  }

  if (current) segments.push(current);
  return { header, segments };
}

function parseHeader(lines) {
  const joined = lines.join(' ');
  const email = joined.match(EMAIL_PATTERN)?.[0] ?? '';
  const phone = extractPhone(joined);
  const urls = joined.match(URL_PATTERN) ?? [];

  const strip = (value) => {
    let result = value;
    if (email) result = result.replace(email, ' ');
    if (phone) result = result.replace(phone, ' ');
    result = result.replace(URL_PATTERN, ' ');
    return result.replace(/\s+/g, ' ').trim();
  };

  const remaining = lines.map(strip).filter(Boolean);
  const name = remaining[0] ?? '';
  const rest = remaining.slice(1).flatMap(splitHeaderParts).filter(Boolean);
  const locationIndex = rest.findIndex((part) => /,/.test(part) && !/\d{4}/.test(part));

  return {
    name,
    headline: locationIndex === 0 ? (rest[1] ?? '') : (rest[0] ?? ''),
    location: locationIndex === -1 ? '' : (rest[locationIndex] ?? ''),
    email,
    phone,
    website: urls[0] ?? '',
  };
}

/**
 * @param {string} text
 * @returns {object} ResumeData
 */
export function parseResumeText(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const { header, segments } = segment(lines);
  const contact = parseHeader(header);

  const data = structuredClone(defaultResumeData);
  const order = [];

  data.basics.name = contact.name;
  data.basics.headline = contact.headline;
  data.basics.email = contact.email;
  data.basics.phone = contact.phone;
  data.basics.location = contact.location;
  data.basics.website = { url: contact.website, label: '' };

  for (const item of segments) {
    if (item.lines.length === 0) continue;

    if (item.key === 'summary') {
      const content = toHtmlBlocks(item.lines);
      data.summary.content = data.summary.content ? `${data.summary.content}${content}` : content;
      if (!order.includes('summary')) order.push('summary');
      continue;
    }

    if (item.key === null) {
      const id = randomUUID();
      data.customSections.push({
        id,
        type: 'summary',
        title: item.title,
        icon: '',
        columns: 1,
        hidden: false,
        keepTogether: false,
        startOnNewPage: false,
        items: [{ id: randomUUID(), hidden: false, content: toHtmlBlocks(item.lines) }],
      });
      order.push(id);
      continue;
    }

    const items = buildSectionItems(item.key, item.lines);
    if (items.length === 0) continue;
    const section = data.sections[item.key];
    section.items = [...section.items, ...items];
    if (!order.includes(item.key)) order.push(item.key);
  }

  data.metadata.layout.pages = [{ fullWidth: true, main: order, sidebar: [] }];
  return parseResumeData(data);
}
