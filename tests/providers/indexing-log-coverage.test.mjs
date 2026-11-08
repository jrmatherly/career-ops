// tests/providers/indexing-log-coverage.test.mjs: every board provider has an
// entry in docs/SOURCE_INDEXING_LOG.md (its `providers/{id}.mjs` token, which
// each entry's **Provider** row carries, outside the waiver) or a line in the dated backfill waiver for boards
// that merged before the log existed. A board provider is one whose header
// comment (first 40 lines) names `job_boards`; retired providers are exempt.
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { pass, fail, ROOT } from '../helpers.mjs';

console.log('\nevery board provider has an indexing-log entry or a dated waiver');

// Company adapters whose header merely mentions the job_boards list.
const COMPANY_ADAPTERS = new Set(['ibm', 'peoplesoft']);
const WAIVER_HEADING = '## Backfill waiver (2026-11-08)';

// echojobs and torre keep RETIRED_MESSAGE private, so a **Retired catalog row
// (matched by name cell, "The Muse" -> themuse) also marks a retired provider.
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const retiredNames = new Set(readFileSync(join(ROOT, 'docs', 'SUPPORTED_JOB_BOARDS.md'), 'utf-8')
  .split('\n')
  .filter((line) => line.includes('**Retired'))
  .map((line) => squash(line.split('|')[1] ?? '')));

const dir = join(ROOT, 'providers');
const files = readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();

const boards = [];
for (const file of files) {
  const id = file.slice(0, -'.mjs'.length);
  if (COMPANY_ADAPTERS.has(id) || retiredNames.has(squash(id))) continue;
  const header = readFileSync(join(dir, file), 'utf-8').split('\n').slice(0, 40).join('\n');
  if (!header.includes('job_boards')) continue;
  const mod = await import(pathToFileURL(join(dir, file)).href);
  if ('RETIRED_MESSAGE' in mod) continue;
  boards.push(id);
}

if (boards.length > 0) {
  pass(`found ${boards.length} board provider(s)`);
} else {
  fail('found zero board providers; this suite would pass vacuously');
}

const log = readFileSync(join(ROOT, 'docs', 'SOURCE_INDEXING_LOG.md'), 'utf-8');
const [beforeWaiver, fromWaiver = ''] = log.split(WAIVER_HEADING);
const waiverEnd = fromWaiver.indexOf('\n## ');
const waiver = waiverEnd < 0 ? fromWaiver : fromWaiver.slice(0, waiverEnd);
const entries = beforeWaiver + (waiverEnd < 0 ? '' : fromWaiver.slice(waiverEnd));

const token = (id) => `\`providers/${id}.mjs\``;
const missing = boards.filter((id) => !entries.includes(token(id)) && !waiver.includes(token(id)));

if (missing.length === 0) {
  pass('every board provider has a log entry or a waiver line in docs/SOURCE_INDEXING_LOG.md');
} else {
  fail(`board provider(s) with no docs/SOURCE_INDEXING_LOG.md entry and no "${WAIVER_HEADING}" line: ${missing.join(', ')}`);
}

const undated = waiver.split('\n')
  .filter((line) => /`providers\/[a-z0-9-]+\.mjs`/.test(line) && !/\b\d{4}-\d{2}-\d{2}\b/.test(line));
if (undated.length === 0) {
  pass('every waiver line carries a merge date');
} else {
  fail(`waiver line(s) with no YYYY-MM-DD merge date: ${undated.join(' | ')}`);
}
