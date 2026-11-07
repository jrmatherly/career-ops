// Ported from Reactive Resume apps/web/src/features/resume/import/read-file.ts (detectJsonImportKind, detectImportKind) at d065a9f7. MIT, copyright Amruth Pillai; see THIRD_PARTY_NOTICES.md.
// Adapted: synchronous on a Buffer; zips are told apart by entry names; RR v4 is refused by name, cover letters and PDFs read as unknown; adds importResume and its review.
import { z } from 'zod';
import { absorb } from '../absorb.mjs';
import { parseResume } from '../schema.mjs';
import { resumeToCvMarkdown, sectionDescriptors } from '../to-cv-md.mjs';
import { parseDocx } from './docx-text.mjs';
import { ImportError, issuesError } from './error.mjs';
import { parseJSONResume } from './json-resume.mjs';
import { basename, LINKEDIN_CSVS, parseLinkedInExport } from './linkedin.mjs';
import { parseReactiveResumeJSON } from './reactive-resume-json.mjs';
import { unzipEntries } from './zip.mjs';

export { ImportError } from './error.mjs';

/** Account archives keep document metadata around the importable resume content. */
const unwrapArchive = (json) => (json?.data && typeof json.data === 'object' && !('sections' in json) && !('metadata' in json) ? json.data : json);

/** @param {unknown} data an unwrapped JSON document @returns {'rr'|'json-resume'|null} */
function detectJsonImportKind(data) {
  if (!data || typeof data !== 'object') return null;
  // JSON Resume: top-level `basics`, without Reactive Resume's `sections`/`metadata`.
  if ('basics' in data && !('sections' in data) && !('metadata' in data)) return 'json-resume';
  // V4 stores layout as nested arrays and may lack metadata.page; only the current schema imports.
  if ('sections' in data || 'metadata' in data) {
    const { metadata } = data;
    if (metadata && (Array.isArray(metadata.layout) || !('page' in metadata))) throw new ImportError('a Reactive Resume v4 export; open it in Reactive Resume v6 and export again');
    return 'rr';
  }
  return null;
}

const extensionFormat = (name) => (name.endsWith('.docx') ? 'docx' : name.endsWith('.zip') ? 'linkedin' : 'unknown');

/**
 * What a file holds, from its bytes and shape rather than its extension. Throws ImportError for JSON that does
 * not parse, a Reactive Resume v4 export, or a broken archive with no telling extension.
 *
 * @param {Uint8Array} buffer
 * @param {string} filename
 * @returns {'rr'|'json-resume'|'linkedin'|'docx'|'unknown'}
 */
export function detectFormat(buffer, filename) {
  const name = filename.toLowerCase();
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  if (isZip) {
    const names = [];
    let broken = '';
    try {
      // Only the entry names matter: the selector takes nothing, so nothing is inflated.
      unzipEntries(buffer, (entry) => names.push(entry) && false, 0);
    } catch (err) {
      broken = err.message;
    }
    if (names.includes('word/document.xml')) return 'docx';
    if (names.some((n) => LINKEDIN_CSVS.has(basename(n)))) return 'linkedin';
    // A broken archive falls through to its extension, so the importer reports the one-line reason; with no telling
    // extension the reason is reported here.
    const fallback = extensionFormat(name);
    if (fallback === 'unknown' && (broken || !names.length)) throw new ImportError(`not readable as a ZIP archive (${broken || 'no entries found'})`);
    return fallback;
  }
  // A leading UTF-8 BOM (0xEF) is what Windows exporters write; TextDecoder strips it before JSON.parse.
  const first = buffer.find((b) => b !== 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d);
  if (first === 0x7b || first === 0xef) return detectJsonImportKind(readJson(buffer)) ?? 'unknown';
  return extensionFormat(name);
}

function readJson(buffer) {
  try {
    return unwrapArchive(JSON.parse(new TextDecoder().decode(buffer)));
  } catch (err) {
    throw new ImportError(`not valid JSON (${err.message})`);
  }
}

/** Each importer returns `{ data, skipped }`, skipped being one line per input the importer read past. */
const IMPORTERS = {
  rr: (buffer) => ({ data: parseReactiveResumeJSON(readJson(buffer)), skipped: [] }),
  'json-resume': (buffer) => parseJSONResume(readJson(buffer)),
  linkedin: (buffer) => parseLinkedInExport(buffer),
  docx: (buffer) => ({ data: parseDocx(buffer), skipped: [] }),
};

export const FORMATS = Object.keys(IMPORTERS);

/** Dot-joined paths where two JSON values differ; careerOps is the sidecar's own bookkeeping. */
function diffPaths(a, b, path = [], out = []) {
  if (Object.is(a, b) || (path.length === 1 && path[0] === 'careerOps')) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) diffPaths(a[key], b[key], [...path, key], out);
  } else out.push(path.join('.'));
  return out;
}

const plural = (n) => `${n} item${n === 1 ? '' : 's'}`;

function review(data, absorbed, skipped) {
  const sections = sectionDescriptors(data).map((d) => `${d.heading}: ${plural(d.items ? d.items.length : 1)}`);
  const profiles = data.sections.profiles.items.length;
  if (profiles) sections.push(`${data.sections.profiles.title || 'Profiles'}: ${plural(profiles)}`);
  const leftover = [];
  if (data.basics.customFields.length) leftover.push(`basics.customFields (${data.basics.customFields.length})`);
  if (data.picture.url) leftover.push('picture.url');
  leftover.push(...diffPaths(data, absorbed), ...skipped);
  return { sections, leftover };
}

/**
 * The imported resume after one absorb round trip (so its cvStyle matches `generated`), the cv.md it renders to,
 * the absorb result that gates a write, and the review.
 *
 * @param {Uint8Array} buffer
 * @param {'rr'|'json-resume'|'linkedin'|'docx'} format
 * @returns {{ data: object, generated: string, gate: ReturnType<typeof absorb>, review: { sections: string[], leftover: string[] } }}
 */
export function importResume(buffer, format) {
  let imported;
  let skipped;
  try {
    ({ data: imported, skipped } = IMPORTERS[format](buffer));
  } catch (err) {
    if (err instanceof z.ZodError) throw issuesError(err.issues);
    throw err;
  }
  // parseResume also runs syncResumeDates, so every period/date text is printed from its structured dates.
  const parsed = parseResume(imported);
  if (!parsed.ok) throw issuesError(parsed.issues);
  const { data } = parsed;
  // cv.md's heading needs the name; without one the regenerated file would read "CV --" back as the name.
  if (!data.basics.name) throw new ImportError('no candidate name found (the first line of a Word file, Profile.csv, or basics.name must carry it)');
  data.careerOps.cvSha256 = '';
  delete data.careerOps.pendingCvSha256;
  const generated = resumeToCvMarkdown(data);
  const gate = absorb(generated, data);
  const found = review(data, gate.data, skipped);
  return { data: gate.data, generated, gate, review: found };
}
