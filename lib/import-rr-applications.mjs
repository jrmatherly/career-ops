/**
 * lib/import-rr-applications.mjs — read a Reactive Resume application export
 * (its 22-column CSV, or the "export everything" account zip) into one record
 * shape, plan it against the tracker, and write the per-application sidecars
 * once merge-tracker.mjs has given each row its number.
 *
 * Only account.json, applications.json and application-stages.json are read
 * from the zip. career.json holds RR facts and stories, which never cross into
 * career-ops content.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { strFromU8 } from 'fflate';
import { unzipEntries } from './resume/import/zip.mjs';
import { normalizeTextKey, resolveColumns, parseTrackerRow } from '../tracker-parse.mjs';
import { compensationCurrency } from '../providers/_salary-text.mjs';
import { normalizeUrl } from '../url-key.mjs';
import { isPostingUrl, slugifyCompany } from './tracker-addition.mjs';
import { readMeta, setMeta } from './application-meta.mjs';
import { addEvent, readEvents } from './application-events.mjs';
import { appendBackfillRows, companiesMatchIgnoringCorporateForm } from '../tracker-utils.mjs';
import { captureSlug, findCaptureForReport, reportPrefix } from '../jd-capture.mjs';

const CODE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const ZIP_FILES = new Set(['account.json', 'applications.json', 'application-stages.json']);

const STAGE_LABELS = { saved: 'Saved', applied: 'Applied', screening: 'Screening', interview: 'Interview', offer: 'Offer', closed: 'Closed' };
const RR_STAGE = { applied: 'Applied', screening: 'Responded', interview: 'Interview', offer: 'Offer' };
const RR_CLOSED = { 'not-selected': 'Rejected', accepted: 'Hired', withdrew: 'Discarded', 'accepted-other': 'Discarded', 'no-response': 'Discarded' };
const CONTACT_TYPES = { recruiter: 'recruiter', 'hiring manager': 'hiring-manager', referral: 'internal-referral', interviewer: 'interviewer' };
const INTERVIEW_KINDS = ['screening', 'technical', 'behavioral', 'onsite', 'other'];

/** Tracker state for an RR stage, or null for `saved`. */
const trackerState = (stage, closedReason) => (stage === 'closed' ? RR_CLOSED[closedReason] ?? 'Discarded' : RR_STAGE[stage] ?? null);

const cleanHeader = (h) => String(h ?? '').replace(/^\uFEFF/, '').trim();
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const day = (v) => {
  if (v == null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const closedReasonOf = (v) => (Object.hasOwn(RR_CLOSED, v) ? v : null);
const statusOf = (v) => (Object.hasOwn(STAGE_LABELS, v) ? v : 'unknown');

export function detectRrExport(headers) {
  const have = new Set(headers.map(cleanHeader));
  return ['Lane Category', 'Stage History', 'Timeline', 'Posting Source'].every((h) => have.has(h));
}

// The export prefixes a formula-like cell with an apostrophe (RR csvCell); this drops it again. Not
// lib/tsv-formula-escape.mjs's unescapeFormulaCell: RR's guard also covers full-width signs and leading controls.
const isFormulaLike = (v) => /^[\s\p{Cc}]*[=+@\-＝＋－＠]/u.test(v) || /^[\t\r\n]/.test(v);
const stripFormulaGuard = (v) => (v.startsWith("'") && isFormulaLike(v.slice(1)) ? v.slice(1) : v);

function parseTags(value) {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((t) => typeof t === 'string').map((t) => t.trim()).filter(Boolean);
  } catch { /* not a JSON list: the "a; b" form */ }
  return value.split(';').map((t) => t.trim()).filter(Boolean);
}

function parseCsvContact(line) {
  const m = /^(.*?)\s*\((.*)\)$/.exec(line);
  if (!m) return { name: line, role: '', type: '', email: '', phone: '' };
  const parts = m[2].split(', ');
  // One detail is a type when it names one, else a role (the export drops the empty one).
  const [role, type] = parts.length > 1 ? [parts.slice(0, -1).join(', '), parts.at(-1)]
    : CONTACT_TYPES[parts[0].toLowerCase()] ? ['', parts[0]] : [parts[0], ''];
  return { name: m[1], role, type, email: '', phone: '' };
}

const STAGE_BY_LABEL = Object.fromEntries(Object.entries(STAGE_LABELS).map(([v, l]) => [l, v]));

/** parseCsv() rows of an RR CSV export, header first, as RrApplication records. */
export function rrFromCsv(csvRows) {
  const rows = csvRows.map((cells, i) => ({ cells, row: i + 1 })).filter((r) => r.cells.some((c) => c.trim()));
  if (!rows.length) throw new Error('The file is empty.');
  const header = rows[0].cells.map(cleanHeader);
  return rows.slice(1).map(({ cells, row }) => {
    const get = (name) => {
      const i = header.indexOf(name);
      return i === -1 ? '' : stripFormulaGuard(String(cells[i] ?? '')).trim();
    };
    const status = statusOf(get('Stage'));
    const closedReason = closedReasonOf(get('Closed Reason'));
    const applied = get('Application Date');
    const iso = /^\d{4}-\d{2}-\d{2}/.exec(applied)?.[0];
    const date = iso && day(iso) === iso ? iso : null;
    const lane = get('Lane');
    const stages = get('Stage History').split(' → ').map((visit) => {
      const m = /^(.*) \((\d{4}-\d{2}-\d{2})\)$/.exec(visit.trim());
      const stage = m && STAGE_BY_LABEL[m[1]];
      return stage ? { stage, closedReason: stage === 'closed' ? closedReason : null, date: m[2] } : null;
    }).filter(Boolean);
    return {
      row,
      company: get('Company'), role: get('Role'), url: get('URL'), location: get('Location'), salary: get('Salary'),
      source: get('Source'), notes: get('Notes'), jobDescription: get('Job Description'),
      status, closedReason, submitted: Boolean(applied), unsentReason: 'blank Application Date', date,
      laneLabel: lane && lane !== STAGE_LABELS[get('Lane Category')] ? lane : null,
      tags: get('Tags') ? parseTags(get('Tags')) : [],
      contacts: get('Contacts').split('\n').map((l) => l.trim()).filter(Boolean).map(parseCsvContact),
      stages, noteEntries: [], interviews: [], followUp: null,
    };
  });
}

/** Read the account zip. Refuses with a one-line Error for anything that is not an RR export. */
export function readRrZip(bytes, name = 'the file') {
  let files = {};
  try {
    files = unzipEntries(bytes, (n) => ZIP_FILES.has(n), MAX_ENTRY_BYTES);
  } catch (err) {
    throw new Error(err?.entry ? `${name}: ${err.message}` : `${name} is not a readable zip: ${err?.message ?? err}`);
  }
  if (!files['applications.json']) throw new Error(`${name} is not a Reactive Resume export: no applications.json`);
  const json = (entry) => {
    if (!files[entry]) return null;
    try { return JSON.parse(strFromU8(files[entry])); } catch { throw new Error(`${name}: ${entry} is not valid JSON`); }
  };
  const list = json('applications.json');
  if (!Array.isArray(list)) throw new Error(`${name}: applications.json is not a list of applications`);
  const lanes = json('application-stages.json')?.lanes;
  const account = json('account.json');
  const apps = list.map((a, i) => {
    const app = a && typeof a === 'object' ? a : {};
    const activity = (Array.isArray(app.activity) ? app.activity : [])
      .filter((e) => e && typeof e === 'object')
      .sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
    const status = statusOf(app.status);
    const sent = (s) => s !== 'saved' && s !== 'closed';
    // Older exports omit submittedAt, and a missing field proves nothing, so RR's own hasApplicationSubmission decides.
    const submitted = 'submittedAt' in app ? app.submittedAt != null
      : sent(status) || (status === 'closed' && activity.some((e) => e.type === 'stage' && e.canonicalTransition !== false && sent(e.stage)));
    const lane = (Array.isArray(lanes) ? lanes : []).find((l) => l && l.id === app.laneId && l.category === status && typeof l.label === 'string');
    return {
      row: i + 1,
      company: str(app.company), role: str(app.role), url: str(app.sourceUrl), location: str(app.location), salary: str(app.salary),
      source: str(app.source), notes: str(app.notes), jobDescription: str(app.jobDescription),
      status, closedReason: closedReasonOf(app.closedReason), submitted,
      unsentReason: 'submittedAt' in app ? 'submittedAt is null' : 'no sent stage',
      date: day(app.submittedAt) ?? day(app.appliedAt),
      laneLabel: lane ? lane.label : null,
      tags: Array.isArray(app.tags) ? app.tags.map(str).filter(Boolean) : [],
      contacts: (Array.isArray(app.contacts) ? app.contacts : []).filter((c) => str(c?.name))
        .map((c) => ({ name: str(c.name), role: str(c.role), type: str(c.type), email: str(c.email), phone: str(c.phone) })),
      stages: activity.filter((e) => e.type === 'stage' && !e.dateUnknown && e.canonicalTransition !== false && day(e.at))
        .map((e) => ({ stage: e.stage, closedReason: closedReasonOf(e.closedReason), date: day(e.at) })),
      noteEntries: activity.filter((e) => e.type === 'note' && str(e.text)).map((e) => ({ at: e.at, text: str(e.text) })),
      interviews: activity.filter((e) => e.type === 'interview' && day(e.at)).map((e) => ({
        at: e.at, kind: INTERVIEW_KINDS.includes(e.kind) ? e.kind : 'other', durationMinutes: e.durationMinutes,
        timezone: str(e.timezone) || 'UTC', notes: str(e.notes),
        participants: (Array.isArray(e.participants) ? e.participants : []).filter((p) => str(p?.name)).map((p) => ({ name: str(p.name), role: str(p.role) })),
      })),
      followUp: day(app.followUpAt) ? { date: day(app.followUpAt), note: str(app.followUpNote) } : null,
    };
  });
  return { exportDate: day(account?.exportedAt), apps };
}

export const roleKey = (company, role) => `${normalizeTextKey(company)}\u0000${normalizeTextKey(role)}`;

/**
 * One posting is one key: the URL when both sides have one, otherwise the
 * company and role. Two different URLs under one title are two postings.
 */
export function postingIndex() {
  const byUrl = new Map();
  const byRole = new Map();
  return {
    remember(urlKey, rk, value) {
      if (urlKey) byUrl.set(urlKey, value);
      byRole.set(rk, [...(byRole.get(rk) ?? []), { urlKey, value }]);
    },
    lookup(urlKey, rk) {
      return (urlKey ? byUrl.get(urlKey) : undefined)
        ?? (byRole.get(rk) ?? []).find((c) => !(c.urlKey && urlKey && c.urlKey !== urlKey))?.value;
    },
  };
}

/** `{amount, currency}` from a salary text, or null when it names no amount, or no single currency. */
function parseSalary(text) {
  const s = String(text ?? '');
  const currency = compensationCurrency(s) ?? (s.includes('$') ? 'USD' : '');
  const m = /(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/i.exec(s);
  if (!currency || !m) return null;
  const amount = Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1);
  return amount > 0 ? { amount: String(amount), currency } : null;
}

function sidecarsFor(a) {
  const statusLog = [];
  for (const v of a.stages) {
    const to = trackerState(v.stage, v.closedReason);
    if (to && statusLog.at(-1)?.to !== to) statusLog.push({ date: v.date, from: statusLog.at(-1)?.to ?? '-', to });
  }
  const salary = parseSalary(a.salary);
  return {
    meta: [
      a.laneLabel && { key: 'lane', value: a.laneLabel },
      ...a.tags.map((value) => ({ key: 'tag', value })),
      a.closedReason && { key: 'closed_reason', value: a.closedReason },
      a.source && { key: 'source', value: a.source },
    ].filter(Boolean),
    notes: [...a.noteEntries, ...(a.notes ? [{ at: null, text: a.notes }] : [])],
    statusLog,
    contacts: a.contacts,
    interviews: a.interviews,
    followUp: a.followUp,
    salary,
    salaryUnparsed: Boolean(a.salary && !salary),
    offer: Boolean(salary && (a.status === 'offer' || (a.status === 'closed' && a.closedReason === 'accepted'))),
    jd: a.jobDescription,
  };
}

/** Plan an RR import without touching disk. */
export function planRrImport(apps, { trackerRows, today, exportLabel }) {
  const tracked = postingIndex();
  for (const t of trackerRows) tracked.remember(normalizeUrl(t.url), roleKey(t.company, t.role), t.num);
  const seen = postingIndex();
  const urlLessByRole = new Map();
  for (const t of trackerRows) {
    if (normalizeUrl(t.url)) continue;
    const k = normalizeTextKey(t.role);
    urlLessByRole.set(k, [...(urlLessByRole.get(k) ?? []), t]);
  }
  const entries = apps.map((a) => {
    const url = isPostingUrl(a.url) ? a.url : '';
    const base = { row: a.row, company: a.company, role: a.role, url, location: a.location, app: a, sidecars: null };
    if (!a.company || !a.role) return { ...base, outcome: 'incomplete' };
    if (a.status === 'unknown') return { ...base, outcome: 'unknown-status' };
    if (a.status === 'saved') return { ...base, outcome: 'saved' };
    if (!a.submitted) return { ...base, outcome: 'never-submitted' };
    const status = trackerState(a.status, a.closedReason);
    const closed = a.status === 'closed' ? `; closed: ${a.closedReason ?? 'no reason'}` : '';
    const planned = { ...base, status, closedReason: a.closedReason, date: a.date ?? today, notes: `imported from ${exportLabel}; source stage: ${a.status}${closed}` };
    const urlKey = normalizeUrl(url);
    const rk = roleKey(a.company, a.role);
    // merge-tracker also folds a row into a URL-less one whose company differs only by a legal suffix, so plan
    // that row as tracked rather than let the merge fold it under a number the importer cannot see.
    const foldedNum = () => {
      const matches = (urlLessByRole.get(normalizeTextKey(a.role)) ?? []).filter((t) => companiesMatchIgnoringCorporateForm(t.company, a.company));
      return matches.length === 1 ? matches[0].num : undefined;
    };
    const trackedNum = tracked.lookup(urlKey, rk) ?? foldedNum();
    if (trackedNum != null) return { ...planned, outcome: 'tracked', trackedNum, sidecars: sidecarsFor(a) };
    const firstRow = seen.lookup(urlKey, rk);
    if (firstRow != null) return { ...planned, outcome: 'repeat', firstRow };
    seen.remember(urlKey, rk, a.row);
    return { ...planned, outcome: 'import', sidecars: sidecarsFor(a) };
  });
  return { entries };
}

/** Tracker numbers whose RR sidecars were written by an earlier run (their `import` event is the last write). */
export function importedNums(root) {
  return new Set(readEvents(root).filter((e) => e.kind === 'import' && e.text.startsWith('rr-export ')).map((e) => e.num));
}

function runScript(script, args) {
  const r = spawnSync(process.execPath, [join(CODE_ROOT, script), ...args], { env: process.env, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`${script}: ${(r.stderr || r.error?.message || 'failed').trim().split('\n').at(-1)}`);
}

const readTrackerRows = (trackerPath) => {
  if (!existsSync(trackerPath)) return [];
  const lines = readFileSync(trackerPath, 'utf-8').split(/\r?\n/);
  const colmap = resolveColumns(lines);
  return lines.map((l) => parseTrackerRow(l, colmap)).filter(Boolean);
};

const readText = (path) => (existsSync(path) ? readFileSync(path, 'utf-8') : '');
const noParens = (v) => v.replace(/[;()]/g, ' ').replace(/\s+/g, ' ').trim();

// Each step checks what an earlier, interrupted run already wrote (`have`, read once for the whole import), so a
// rerun completes a row without doubling it.
async function writeRow(root, trackerPath, entry, num, { exportLabel, today, have }) {
  const { formatInZone, machineZone } = await import('../ics-interview.mjs');
  const wallTime = (at, zone = machineZone()) => {
    const { date, time } = formatInZone(new Date(at).getTime(), zone);
    return `${date}T${time}`;
  };
  const s = entry.sidecars;
  const meta = have.meta.get(num) ?? {};
  for (const { key, value } of s.meta) {
    const prior = meta[key]?.value;
    if (Array.isArray(prior) ? !prior.includes(value) : prior !== value) await setMeta(root, num, key, value, 'rr-import');
  }
  const events = have.events.get(num) ?? [];
  for (const n of s.notes) {
    if (!events.some((e) => e.kind === 'note' && e.text === n.text.replace(/[\t\r\n]+/g, ' ').trim())) {
      await addEvent(root, num, 'note', n.text, 'rr-import', n.at ? wallTime(n.at) : `${entry.date}T00:00`);
    }
  }
  // A row career-ops already tracked keeps its own ledger; RR's history would be a second, conflicting one.
  const ownHistory = entry.outcome === 'tracked' && have.statusLog.split('\n').some((l) => l.startsWith(`${num}\t`));
  const backfill = ownHistory ? [] : s.statusLog.filter((r) => !have.statusLog.includes(`${num}\t${r.date}\t${r.from}\t${r.to}\tbackfill\t`));
  await appendBackfillRows(trackerPath, backfill.map((r) => ({ num, ...r, note: 'rr-import' })));
  for (const i of s.interviews) {
    const args = ['add', `--num=${num}`, `--kind=${i.kind}`, `--at=${wallTime(i.at, i.timezone)}`, `--tz=${i.timezone}`];
    if (Number.isInteger(i.durationMinutes) && i.durationMinutes > 0) args.push(`--duration=${i.durationMinutes}`);
    if (i.participants.length) args.push(`--participants=${i.participants.map((p) => (p.role ? `${noParens(p.name)} (${noParens(p.role)})` : noParens(p.name))).join('; ')}`);
    if (i.notes) args.push(`--notes=${i.notes}`);
    runScript('interview-round.mjs', args);
  }
  // After the rounds: interview-round.mjs files each participant as an interviewer, and RR's own type should win.
  // An RR contact with no type passes none, so appendContact keeps the type already on file.
  // Lazy: contact-extract.mjs resolves the data root when it loads, which a Teal import or --help should not do.
  const { appendContact } = await import('../contact-extract.mjs');
  for (const c of s.contacts) {
    await appendContact({
      name: c.name, company: entry.company, type: CONTACT_TYPES[c.type.toLowerCase()] ?? (c.type ? 'other' : ''), title: c.role,
      email: c.email, phone: c.phone, tracker: String(num),
    }, join(root, 'data', 'contacts.tsv'));
  }
  if (s.followUp) runScript('followup-pin.mjs', [`--num=${num}`, `--date=${s.followUp.date}`, ...(s.followUp.note ? [`--note=${s.followUp.note}`] : [])]);
  const pay = s.salary;
  if (pay && !have.salary.some((l) => l.startsWith(`${num}\t`) && l.includes(`\tadvertised\t${pay.amount}\t${pay.currency}\trr-import\t`))) {
    runScript('salary-observe.mjs', [`--num=${num}`, '--kind=advertised', `--amount=${pay.amount}`, `--currency=${pay.currency}`, '--source=rr-import']);
  }
  if (s.offer) runScript('offer-terms.mjs', [`--company=${slugifyCompany(entry.company)}`, `--num=${num}`, `--base=${pay.amount}`, `--currency=${pay.currency}`]);
  const jdsDir = join(root, 'jds');
  if (s.jd && !findCaptureForReport(jdsDir, num)) {
    mkdirSync(jdsDir, { recursive: true });
    const file = `${reportPrefix(num)}-${today}_${captureSlug(entry.company)}_${captureSlug(entry.role)}.md`;
    writeFileSync(join(jdsDir, file), `# ${entry.company} — ${entry.role}\n\n${entry.url ? `**URL:** ${entry.url}\n\n` : ''}${s.jd}\n`, { flag: 'wx' });
  }
  // Last, so a row whose writes failed part way has no marker and the next run completes it.
  await addEvent(root, num, 'import', `rr-export ${exportLabel}`, 'rr-import');
}

/**
 * Write the sidecars of every `import` and `tracked` entry under the number the
 * row holds after the merge. One row's failure does not stop the others.
 */
export async function writeRrSidecars(root, trackerPath, entries, { exportLabel, today }) {
  const rows = readTrackerRows(trackerPath);
  const byUrl = new Map(rows.filter((r) => normalizeUrl(r.url)).map((r) => [normalizeUrl(r.url), r.num]));
  const done = importedNums(root);
  const events = new Map();
  for (const e of readEvents(root)) events.set(e.num, [...(events.get(e.num) ?? []), e]);
  const have = {
    meta: readMeta(root),
    events,
    statusLog: readText(join(dirname(trackerPath), 'status-log.tsv')),
    salary: readText(join(root, 'data', 'salary-observations.tsv')).split('\n'),
  };
  const result = { completed: 0, skipped: [], failed: [] };
  for (const entry of entries.filter((e) => e.outcome === 'import' || e.outcome === 'tracked')) {
    const urlKey = normalizeUrl(entry.url);
    const reserved = rows.find((r) => r.num === entry.num && roleKey(r.company, r.role) === roleKey(entry.company, entry.role));
    const num = (urlKey ? byUrl.get(urlKey) : undefined) ?? reserved?.num ?? entry.trackedNum;
    if (num == null) {
      result.skipped.push({ row: entry.row, reason: 'not in the tracker after the merge' });
      continue;
    }
    if (done.has(num)) {
      result.skipped.push({ row: entry.row, num, reason: 'already imported' });
      continue;
    }
    try {
      await writeRow(root, trackerPath, entry, num, { exportLabel, today, have });
      done.add(num);
      result.completed++;
    } catch (err) {
      result.failed.push({ num, row: entry.row, error: err.message });
    }
  }
  return result;
}

/**
 * Add `saved` postings with a URL to the pipeline inbox, leaving out the ones the
 * inbox or scan history already holds (appendToPipeline reads history only to
 * release finished inbox rows). It re-checks the inbox under its lock.
 */
export async function appendSavedToPipeline(root, entries) {
  const { appendToPipeline, collectSeenUrls, seenJobKey } = await import('../scan.mjs');
  const scanHistoryPath = join(root, 'data', 'scan-history.tsv');
  const pipelinePath = join(root, 'data', 'pipeline.md');
  const { seen } = collectSeenUrls({ scanHistoryText: readText(scanHistoryPath), pipelineText: readText(pipelinePath) });
  const offers = [];
  for (const e of entries) {
    const key = e.outcome === 'saved' && e.url && seenJobKey(e.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    offers.push({ url: e.url, company: e.company, title: e.role });
  }
  if (!offers.length) return 0;
  await appendToPipeline(offers, { pipelinePath, scanHistoryPath });
  return offers.length;
}
