// Ported from Reactive Resume packages/import/src/linkedin.ts at d065a9f7. MIT, copyright Amruth Pillai; see THIRD_PARTY_NOTICES.md.
// Adapted: JavaScript; crypto.randomUUID() for generateId(); throws ImportError; LINKEDIN_CSVS exported for detect.mjs; the repo's parseCsv replaces RR's.
import { randomUUID } from 'node:crypto';
import { parseCsv } from '../../../linkedin-join.mjs';
import { parseResumeData } from '../vendor/data.mjs';
import { defaultResumeData } from '../vendor/default.mjs';
import { formatDate, toRangeDates, toSingleDates } from './date.mjs';
import { ImportError } from './error.mjs';
import { toHtml } from './html.mjs';
import { parseLevel } from './level.mjs';
import { unzipEntries, ZipEntryTooLargeError } from './zip.mjs';

export const LINKEDIN_CSVS = new Set(['profile.csv', 'positions.csv', 'education.csv', 'skills.csv', 'languages.csv', 'certifications.csv']);

// Real LinkedIn CSVs are kilobytes; the cap keeps a crafted archive from exhausting memory.
const MAX_CSV_BYTES = 5 * 1024 * 1024;

// LinkedIn's five fixed proficiency options, mapped onto the 0-5 level scale.
const LANGUAGE_LEVELS = {
  'native or bilingual': 5,
  'full professional': 4,
  'professional working': 3,
  'limited working': 2,
  elementary: 1,
};

// Own keys only: a proficiency like "constructor" must not resolve to an Object member.
const knownLanguageLevel = (name) => (Object.hasOwn(LANGUAGE_LEVELS, name) ? LANGUAGE_LEVELS[name] : undefined);

const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

// LinkedIn writes "Jan 2020" (or a bare year); anything else stays as written.
function toLinkedInIsoDate(value = '') {
  const trimmed = value.trim();
  if (/^\d{4}$/.test(trimmed)) return trimmed;
  const monthYear = /^([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(trimmed);
  const month = MONTHS[monthYear?.[1]?.toLowerCase() ?? ''];
  return monthYear && month ? `${monthYear[2]}-${month}` : null;
}

function formatLinkedInDate(value = '') {
  const iso = toLinkedInIsoDate(value);
  return iso ? formatDate(iso) : value.trim();
}

// Only an empty end cell means the entry is ongoing; an unrecognised one must not read as "Present".
function formatLinkedInPeriod(start, end) {
  const from = formatLinkedInDate(start);
  const to = formatLinkedInDate(end);
  if (!from) return to;
  return `${from} - ${to || 'Present'}`;
}

// Dates only when every cell was read; otherwise the text is read when parsed.
function linkedInPeriodDates(start, end) {
  const from = toLinkedInIsoDate(start);
  const to = toLinkedInIsoDate(end);
  if (!from || (end?.trim() && !to)) return undefined;
  return toRangeDates(from, to ?? undefined);
}

function linkedInSingleDates(value) {
  const iso = toLinkedInIsoDate(value);
  return iso ? toSingleDates(iso) : undefined;
}

const textToHtml = (text = '') => toHtml(text.split(/\r\n?|\n/));

const languageLevel = (proficiency = '') =>
  // The lookbehind starts the match only at a whitespace run's first character, keeping long runs linear.
  knownLanguageLevel(proficiency.toLowerCase().replace(/(?<!\s)\s*proficiency$/, '')) ?? parseLevel(proficiency);

export const basename = (path) => path.slice(path.lastIndexOf('/') + 1).toLowerCase();

function rowsToRecords(rows) {
  if (rows.length === 0) return [];
  const header = rows[0] ?? [];
  return rows.slice(1).map((row) => Object.fromEntries(row.slice(0, header.length).map((cell, i) => [(header[i] ?? '').trim(), cell.trim()])));
}

function findCsv(files, fileName) {
  const key = Object.keys(files).find((path) => basename(path) === fileName);
  if (!key) return [];
  return rowsToRecords(parseCsv(new TextDecoder().decode(files[key])).filter((r) => r.some((cell) => cell.trim() !== '')));
}

const emptyWebsite = { url: '', label: '', inlineLink: false };
const linkWebsite = (url) => (url ? { url, label: url, inlineLink: false } : emptyWebsite);
const item = () => ({ id: randomUUID(), hidden: false });

/**
 * Converts LinkedIn's "Download your data" export (a ZIP of per-topic CSVs) into ResumeData. Only the CSVs
 * relevant to a resume are read.
 *
 * @param {Uint8Array} zipBytes
 * @returns {object} ResumeData
 */
export function parseLinkedInExport(zipBytes) {
  let files;
  const selected = new Set();
  try {
    // Only inflate the first copy of each CSV read; the rest of the export (messages, media) can be large.
    files = unzipEntries(
      zipBytes,
      (name) => {
        const file = basename(name);
        if (!LINKEDIN_CSVS.has(file) || selected.has(file)) return false;
        selected.add(file);
        return true;
      },
      MAX_CSV_BYTES,
    );
  } catch (error) {
    if (error instanceof ZipEntryTooLargeError) {
      throw new ImportError(`"${error.entry}" in this ZIP is larger than 5 MB, which is too large for a LinkedIn data export; use the ZIP exactly as LinkedIn provided it.`);
    }
    throw new ImportError('not readable as a ZIP archive; export your data from LinkedIn\'s "Get a copy of your data" page and use the ZIP as-is.');
  }

  const profile = findCsv(files, 'profile.csv')[0];
  const positions = findCsv(files, 'positions.csv');
  const education = findCsv(files, 'education.csv');
  const skills = findCsv(files, 'skills.csv');
  const languages = findCsv(files, 'languages.csv');
  const certifications = findCsv(files, 'certifications.csv');

  if (!profile && positions.length === 0 && education.length === 0) {
    throw new ImportError('not a LinkedIn data export; it needs Profile.csv, Positions.csv or Education.csv.');
  }

  // structuredClone, not a shallow spread: the writes below would otherwise mutate defaultResumeData's nested objects.
  const result = structuredClone(defaultResumeData);
  const d = defaultResumeData;

  if (profile) {
    result.basics = {
      ...d.basics,
      name: [profile['First Name'], profile['Last Name']].filter(Boolean).join(' '),
      headline: profile.Headline || '',
      location: profile['Geo Location'] || '',
      website: { url: '', label: '' },
    };
    if (profile.Summary) result.summary = { ...d.summary, content: textToHtml(profile.Summary), hidden: false };
  }

  const companies = positions.filter((p) => p['Company Name']);
  if (companies.length > 0) {
    result.sections.experience = {
      ...d.sections.experience,
      items: companies.map((p) => ({
        ...item(),
        company: p['Company Name'] ?? '',
        position: p.Title || '',
        location: p.Location || '',
        period: formatLinkedInPeriod(p['Started On'], p['Finished On']),
        dates: linkedInPeriodDates(p['Started On'], p['Finished On']),
        website: emptyWebsite,
        roles: [],
        description: textToHtml(p.Description),
      })),
    };
  }

  const schools = education.filter((e) => e['School Name']);
  if (schools.length > 0) {
    result.sections.education = {
      ...d.sections.education,
      items: schools.map((e) => ({
        ...item(),
        school: e['School Name'] ?? '',
        degree: e['Degree Name'] || '',
        area: '',
        grade: '',
        location: '',
        period: formatLinkedInPeriod(e['Start Date'], e['End Date']),
        dates: linkedInPeriodDates(e['Start Date'], e['End Date']),
        website: emptyWebsite,
        description: textToHtml(e.Notes),
      })),
    };
  }

  const namedSkills = skills.filter((k) => k.Name);
  if (namedSkills.length > 0) {
    result.sections.skills = {
      ...d.sections.skills,
      items: namedSkills.map((k) => ({ ...item(), icon: 'star', iconColor: '', name: k.Name ?? '', proficiency: '', level: 0, keywords: [] })),
    };
  }

  const namedLanguages = languages.filter((l) => l.Name);
  if (namedLanguages.length > 0) {
    result.sections.languages = {
      ...d.sections.languages,
      items: namedLanguages.map((l) => ({ ...item(), language: l.Name ?? '', fluency: l.Proficiency || '', level: languageLevel(l.Proficiency) })),
    };
  }

  const namedCertifications = certifications.filter((c) => c.Name);
  if (namedCertifications.length > 0) {
    result.sections.certifications = {
      ...d.sections.certifications,
      items: namedCertifications.map((c) => ({
        ...item(),
        title: c.Name ?? '',
        issuer: c.Authority || '',
        date: formatLinkedInDate(c['Started On']),
        dates: linkedInSingleDates(c['Started On']),
        website: linkWebsite(c.Url),
        description: '',
      })),
    };
  }

  return parseResumeData(result);
}
