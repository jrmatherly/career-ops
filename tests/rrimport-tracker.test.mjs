// tests/rrimport-tracker.test.mjs — import-tracker.mjs reads a Reactive Resume
// application export (the 22-column CSV, or the account zip through --rr-zip)
// into the tracker and writes each row's sidecars under its merged number.
//
// The CLI runs against temp data roots with the fictional fixtures in
// tests/fixtures/rr. The zip is built here from those JSON files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';
import { describeSpawn } from './helpers/describe-spawn.mjs';
import { listTree } from '../lib/walk-tree.mjs';
import { parseCsv } from '../linkedin-join.mjs';
import { detectRrExport, rrFromCsv, readRrZip, planRrImport } from '../lib/import-rr-applications.mjs';
import { findCaptureForReport } from '../jd-capture.mjs';
import { localToday } from '../lib/local-today.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPT = join(ROOT, 'import-tracker.mjs');
const FIXTURES = join(ROOT, 'tests', 'fixtures', 'rr');
const CSV = join(FIXTURES, 'applications.csv');
const fixture = (name) => readFileSync(join(FIXTURES, name));

const HEADER = '| # | Date | Company | Role | Score | Status | PDF | Report | Notes | URL |';
const SEP = '|---|------|---------|------|-------|--------|-----|--------|-------|-----|';
const trackerText = (rows = []) => ['# Applications Tracker', '', HEADER, SEP, ...rows, ''].join('\n');
const EXISTING = [
  '| 1 | 2026-06-01 | Northwind Grocers | Data Analyst | 4.2/5 | Responded | ✅ | — | Remote | |',
  '| 2 | 2026-06-02 | Bramblewood Bank | BI Developer | 3.9/5 | Evaluated | ❌ | — | | [example.com](https://jobs.example.com/bramblewood/77) |',
];

function rrZip(files = {}) {
  return zipSync({
    'account.json': strToU8(JSON.stringify({ exportedAt: '2026-11-01T12:00:00.000Z', user: { name: 'Fictional Person' } })),
    'applications.json': fixture('applications.json'),
    'application-stages.json': fixture('application-stages.json'),
    'career.json': fixture('career.json'),
    ...files,
  });
}

function makeRoot({ tracker = trackerText(EXISTING), zip = rrZip() } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'rrimport-test-'));
  mkdirSync(join(root, 'data'), { recursive: true });
  if (tracker !== null) writeFileSync(join(root, 'data', 'applications.md'), tracker);
  const zipPath = join(root, 'export.zip');
  writeFileSync(zipPath, zip);
  return { root, zipPath, trackerPath: join(root, 'data', 'applications.md'), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function withRoot(opts, fn) {
  const fx = makeRoot(opts);
  try { return fn(fx); } finally { fx.cleanup(); }
}

function run(fx, args) {
  const env = { ...process.env, CAREER_OPS_ROOT: fx.root, CAREER_OPS_TRACKER: '', CAREER_OPS_DATA_DIR: '', CAREER_OPS_TRACKER_DB: join(fx.root, 'tracker.db') };
  for (const name of ['CAREER_OPS_ADDITIONS', 'CAREER_OPS_REPORTS_DIR', 'CAREER_OPS_PDF_INDEX', 'CAREER_OPS_FOLLOWUPS', 'CAREER_OPS_PIPELINE', 'CAREER_OPS_SCAN_HISTORY', 'CAREER_OPS_PORTALS']) delete env[name];
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf-8', env, timeout: 120_000 });
}

const zipImport = (fx) => run(fx, ['--rr-zip', fx.zipPath, '--confirm']);

const snapshot = (dir) => Object.fromEntries(listTree(dir).map((p) => [relative(dir, p), readFileSync(p, 'utf-8')]));

function trackerNum(fx, company) {
  const line = readFileSync(fx.trackerPath, 'utf-8').split('\n').find((l) => l.split('|').map((c) => c.trim())[3] === company);
  assert.ok(line, `${company} has a tracker row`);
  return Number(line.split('|')[1].trim());
}

const read = (fx, rel) => readFileSync(join(fx.root, rel), 'utf-8');
const rowsFor = (fx, rel, num) => read(fx, rel).split('\n').filter((l) => l.startsWith(`${num}\t`));
const planOf = (apps, trackerRows = []) => planRrImport(apps, { trackerRows, today: '2026-11-07', exportLabel: 'fixture' }).entries;
const byCompany = (entries, company) => entries.find((e) => e.company === company);

test('detects an RR CSV', () => {
  const rows = parseCsv(readFileSync(CSV, 'utf-8'));
  assert.equal(rows[0].length, 22);
  assert.equal(detectRrExport(rows[0]), true);
  assert.equal(detectRrExport(['Company', 'Job Position', 'Status', 'Date Applied']), false);
  const apps = rrFromCsv(rows);
  assert.equal(apps.length, 13);
  const quill = apps.find((a) => a.company === 'Quillfeather Health');
  assert.equal(quill.notes, '-follow up after the screen', 'the export formula guard is removed');
  const lark = apps.find((a) => a.company === 'Larkspur Analytics');
  assert.equal(lark.laneLabel, 'Referral push');
  assert.deepEqual(lark.tags, ['remote', 'dbt']);
  assert.deepEqual(lark.contacts[0], { name: 'Rowan Vale', role: 'Talent Partner', type: 'Recruiter', email: '', phone: '' });
});

test('closed with no reason lands Discarded', () => {
  for (const apps of [rrFromCsv(parseCsv(readFileSync(CSV, 'utf-8'))), readRrZip(rrZip()).apps]) {
    const tide = byCompany(planOf(apps), 'Tidewater Freight');
    assert.equal(tide.outcome, 'import');
    assert.equal(tide.status, 'Discarded');
    assert.match(tide.notes, /closed: no reason/);
  }
});

test('blank application date is never-submitted', () => {
  const csvEntry = byCompany(planOf(rrFromCsv(parseCsv(readFileSync(CSV, 'utf-8')))), 'Marrowfield Foods');
  assert.equal(csvEntry.outcome, 'never-submitted');
  assert.equal(csvEntry.app.unsentReason, 'blank Application Date');
  const zipEntry = byCompany(planOf(readRrZip(rrZip()).apps), 'Marrowfield Foods');
  assert.equal(zipEntry.outcome, 'never-submitted');
  assert.equal(zipEntry.app.unsentReason, 'submittedAt is null');
});

test('screening lands Responded', () => {
  assert.equal(byCompany(planOf(readRrZip(rrZip()).apps), 'Quillfeather Health').status, 'Responded');
});

test('the remaining closed reasons map per the table', () => {
  const entries = planOf(readRrZip(rrZip()).apps);
  const expect = {
    'Fennwick Insurance': 'Rejected', 'Harrowgate Systems': 'Hired', 'Pebblebrook Media': 'Discarded',
    'Ironbark Robotics': 'Discarded', 'Juniper Row': 'Discarded', 'Saltmarsh Labs': 'Offer',
  };
  for (const [company, status] of Object.entries(expect)) assert.equal(byCompany(entries, company).status, status, company);
});

test('an older export without submittedAt falls back to the stage and its history', () => {
  const apps = JSON.parse(fixture('applications.json'));
  for (const a of apps) delete a.submittedAt;
  const entries = planOf(readRrZip(rrZip({ 'applications.json': strToU8(JSON.stringify(apps)) })).apps);
  assert.equal(byCompany(entries, 'Tidewater Freight').outcome, 'import', 'closed after an applied stage was sent');
  assert.equal(byCompany(entries, 'Marrowfield Foods').outcome, 'import', 'an applied status counts as sent');
});

test('the preview names the reasonless close and the never-submitted row, and writes nothing', () => {
  withRoot({}, (fx) => {
    const before = snapshot(fx.root);
    const r = run(fx, [CSV]);
    assert.equal(r.status, 0, describeSpawn(r));
    assert.match(r.stdout, /row 4: Tidewater Freight \| BI Developer {2}to import: 2026-08-01 {2}Discarded \(closed, no reason\)/);
    assert.match(r.stdout, /row 8: Marrowfield Foods \| Analytics Engineer {2}never submitted \(blank Application Date\): skipped/);
    assert.match(r.stdout, /row 2: Larkspur Analytics \| Analytics Engineer .*\[meta: lane, tag, source; 1 note;/);
    assert.ok(r.stdout.split('\n').some((l) => l.startsWith('Nothing written. Add --confirm ')), r.stdout);
    assert.deepEqual(snapshot(fx.root), before);
  });
});

test('saved goes to pipeline.md under the lock and skips a scan-history URL', () => {
  withRoot({}, (fx) => {
    writeFileSync(join(fx.root, 'data', 'scan-history.tsv'),
      `url\tfirst_seen\tportal\ttitle\tcompany\tstatus\nhttps://jobs.example.com/granite/8\t${localToday()}\tmanual\tOps Analyst\tGranite Hollow Bank\tadded\n`);
    const r = zipImport(fx);
    assert.equal(r.status, 0, describeSpawn(r));
    const pipeline = read(fx, 'data/pipeline.md');
    assert.match(pipeline, /- \[ \] https:\/\/jobs\.example\.com\/cobaltline\/6 \| Cobaltline Energy \| Senior Data Analyst/);
    assert.doesNotMatch(pipeline, /granite\/8/);
    assert.equal(existsSync(join(fx.root, 'data', 'pipeline.md.lock')), false, 'the lock is released');
    assert.doesNotMatch(read(fx, 'data/applications.md'), /Cobaltline|Granite Hollow|Marrowfield/);
  });
});

test('zip import writes every sidecar under the merged number', () => {
  withRoot({}, (fx) => {
    const r = zipImport(fx);
    assert.equal(r.status, 0, describeSpawn(r));
    const lark = trackerNum(fx, 'Larkspur Analytics');
    assert.ok(lark > 2, 'a new number past the existing rows');
    assert.deepEqual(rowsFor(fx, 'data/application-meta.tsv', lark).map((l) => l.split('\t').slice(2, 5)), [
      ['lane', 'Referral push', 'rr-import'], ['tag', 'remote', 'rr-import'], ['tag', 'dbt', 'rr-import'], ['source', 'LinkedIn', 'rr-import'],
    ]);
    const events = rowsFor(fx, 'data/application-events.tsv', lark).map((l) => l.split('\t'));
    assert.deepEqual(events.map((e) => [e[2], e[3]]), [
      ['note', 'Sent the portfolio link'], ['note', 'Referred through a former teammate'], ['import', 'rr-export export.zip (exported 2026-11-01)'],
    ]);
    assert.deepEqual(rowsFor(fx, 'data/status-log.tsv', lark).map((l) => l.split('\t').slice(1, 5)), [['2026-07-01', '-', 'Applied', 'backfill']]);
    const harrow = trackerNum(fx, 'Harrowgate Systems');
    assert.deepEqual(rowsFor(fx, 'data/status-log.tsv', harrow).map((l) => l.split('\t').slice(2, 4)), [['-', 'Applied'], ['Applied', 'Offer'], ['Offer', 'Hired']]);
    assert.match(read(fx, 'data/active-interviews.md'), new RegExp(`\\| Larkspur Analytics \\| Analytics Engineer \\| screening \\| 2026-07-10 15:00 America/New_York \\(30m\\) \\| Rowan Vale \\(Talent Partner\\) \\| Scheduled \\| #${lark} in tracker; Intro call \\|`));
    const contact = read(fx, 'data/contacts.tsv').split('\n').find((l) => l.startsWith('Rowan Vale\t')).split('\t');
    assert.deepEqual([contact[1], contact[2], contact[3], contact[7]], ['Larkspur Analytics', 'recruiter', 'Talent Partner', String(lark)]);
    assert.match(read(fx, 'data/follow-ups.md'), new RegExp(`- next #${lark} 2026-07-20 .*Ask about the take-home`));
    assert.deepEqual(rowsFor(fx, 'data/salary-observations.tsv', lark).map((l) => l.split('\t').slice(2, 6)), [['advertised', '150000-170000', 'USD', 'rr-import']]);
    const salt = trackerNum(fx, 'Saltmarsh Labs');
    const terms = read(fx, 'data/offers/saltmarsh-labs/terms.md');
    assert.match(terms, new RegExp(`Tracker: #${salt}`));
    assert.match(terms, /\| Base \| 90000 \|\n\| Currency \| EUR \|/);
    assert.match(read(fx, 'data/offers/harrowgate-systems/terms.md'), /\| Currency \| GBP \|/);
    assert.equal(readdirSync(join(fx.root, 'jds')).length, 1);
    assert.equal(rowsFor(fx, 'data/application-meta.tsv', trackerNum(fx, 'Tidewater Freight')).length, 0, 'no closed_reason for a reasonless close');
  });
});

test('a row folded into an existing one keys sidecars by the existing number', () => {
  const tracker = trackerText(['| 1 | 2026-06-30 | Larkspur Analytics Inc | Analytics Engineer | 4.1/5 | Evaluated | ❌ | — | hand-added | |']);
  withRoot({ tracker }, (fx) => {
    const preview = run(fx, ['--rr-zip', fx.zipPath]);
    assert.match(preview.stdout, /row 1: Larkspur Analytics \| Analytics Engineer {2}already in the tracker as #1:/);
    const r = zipImport(fx);
    assert.equal(r.status, 0, describeSpawn(r));
    assert.doesNotMatch(read(fx, 'data/applications.md'), /\| Larkspur Analytics \|/, 'the row was not added a second time');
    assert.deepEqual(rowsFor(fx, 'data/application-meta.tsv', 1).map((l) => l.split('\t')[2]), ['lane', 'tag', 'tag', 'source']);
    assert.ok(rowsFor(fx, 'data/application-events.tsv', 1).some((l) => l.includes('\timport\trr-export ')));
    assert.ok(findCaptureForReport(join(fx.root, 'jds'), 1));
  });
});

test('a contact with no RR type keeps the interviewer type its interview round filed', () => {
  const apps = JSON.parse(fixture('applications.json'));
  apps[0].contacts[0].type = '';
  withRoot({ zip: rrZip({ 'applications.json': strToU8(JSON.stringify(apps)) }) }, (fx) => {
    const r = zipImport(fx);
    assert.equal(r.status, 0, describeSpawn(r));
    const contact = read(fx, 'data/contacts.tsv').split('\n').find((l) => l.startsWith('Rowan Vale\t'));
    assert.equal(contact.split('\t')[2], 'interviewer', contact);
  });
});

test('second run adds nothing', () => {
  withRoot({}, (fx) => {
    assert.equal(zipImport(fx).status, 0);
    const before = snapshot(fx.root);
    const r = zipImport(fx);
    assert.equal(r.status, 0, describeSpawn(r));
    assert.match(r.stdout, /Sidecars: 0 row\(s\) written, 9 already imported/);
    assert.deepEqual(snapshot(fx.root), before);
    const preview = run(fx, ['--rr-zip', fx.zipPath]);
    assert.match(preview.stdout, /already in the tracker as #\d+: Applied \(applied\) {2}\[sidecars already imported\]/);
  });
});

test('a rerun after a failed sidecar write completes it', () => {
  withRoot({}, (fx) => {
    writeFileSync(join(fx.root, 'data', 'offers'), 'not a directory');
    const r = zipImport(fx);
    assert.equal(r.status, 1, describeSpawn(r));
    assert.match(r.stderr, /offer-terms\.mjs --num=\d+: Error: ENOTDIR/);
    assert.match(r.stderr, /Run the same command again/);
    const salt = trackerNum(fx, 'Saltmarsh Labs');
    const lark = trackerNum(fx, 'Larkspur Analytics');
    const imported = (num) => rowsFor(fx, 'data/application-events.tsv', num).some((l) => l.includes('\timport\t'));
    assert.equal(imported(salt), false);
    assert.equal(imported(lark), true);
    rmSync(join(fx.root, 'data', 'offers'));
    const again = zipImport(fx);
    assert.equal(again.status, 0, describeSpawn(again));
    assert.match(again.stdout, /Sidecars: 2 row\(s\) written, 7 already imported/);
    assert.equal(imported(salt), true);
    assert.match(read(fx, 'data/offers/saltmarsh-labs/terms.md'), /\| Base \| 90000 \|/);
    assert.equal(rowsFor(fx, 'data/salary-observations.tsv', salt).length, 1, 'the observation written before the failure is not doubled');
    assert.equal(rowsFor(fx, 'data/status-log.tsv', salt).length, 3);
  });
});

test('jd capture resolves by number', () => {
  withRoot({}, (fx) => {
    assert.equal(zipImport(fx).status, 0);
    const num = trackerNum(fx, 'Larkspur Analytics');
    const hit = findCaptureForReport(join(fx.root, 'jds'), num, { companySlug: 'larkspur-analytics' });
    assert.ok(hit, 'capture found');
    assert.match(readFileSync(hit.path, 'utf-8'), /build its fictional metrics layer/);
  });
});

// Flips bytes inside the first entry's deflate stream, past its local header.
const corrupt = (zip) => zip.map((b, i) => (i >= 60 && i < 200 ? b ^ 0xff : b));

test('a malformed zip is refused with a one-line reason', () => {
  const cases = [
    [strToU8('not a zip at all'), /export\.zip is not a Reactive Resume export: no applications\.json/],
    [zipSync({ 'career.json': fixture('career.json') }), /no applications\.json/],
    [rrZip({ 'applications.json': strToU8('{ broken') }), /applications\.json is not valid JSON/],
    [rrZip({ 'applications.json': strToU8('{"company":"x"}') }), /applications\.json is not a list of applications/],
    [corrupt(zipSync({ 'applications.json': strToU8(JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ company: `Co ${i}`, role: 'Role' })))) })), /export\.zip is not a readable zip: /],
  ];
  for (const [zip, reason] of cases) {
    withRoot({ zip }, (fx) => {
      const before = snapshot(fx.root);
      const r = zipImport(fx);
      assert.equal(r.status, 1, describeSpawn(r));
      assert.equal(r.stderr.trim().split('\n').length, 1, r.stderr);
      assert.match(r.stderr, reason);
      assert.deepEqual(snapshot(fx.root), before);
    });
  }
});

test('career.json never crosses', () => {
  withRoot({}, (fx) => {
    assert.equal(zipImport(fx).status, 0);
    for (const [file, text] of Object.entries(snapshot(fx.root))) {
      if (file === 'export.zip') continue;
      assert.doesNotMatch(text, /CAREER-(FACT|STORY|PREF)-MARKER/, file);
    }
  });
});

const larkspur = () => readRrZip(rrZip()).apps.find((a) => a.company === 'Larkspur Analytics');

test('salary text is recorded only as one annual figure or range in one currency', () => {
  const cases = {
    '$150k': { amount: '150000', currency: 'USD', single: true },
    '$120-150k': { amount: '120000-150000', currency: 'USD', single: false },
    '€90.000': { amount: '90000', currency: 'EUR', single: true },
    '£70,000': { amount: '70000', currency: 'GBP', single: true },
    '$45/hr': null, 'EUR 5.000 per month': null, '$1.5M': null, 'CA$120k': null, 'A$100k': null,
    'USD 100k - EUR 90k': null, '120k': null, Competitive: null,
  };
  for (const [salary, want] of Object.entries(cases)) {
    const [e] = planOf([{ ...larkspur(), salary }]);
    assert.deepEqual(e.sidecars.salary, want, salary);
    assert.equal(e.sidecars.salaryUnparsed, want === null, salary);
  }
  const [range] = planOf([{ ...larkspur(), status: 'offer', salary: '$120-150k' }]);
  assert.equal(range.sidecars.offer, false, 'a range is not an offer base');
});

test('a row merge would fold by a fuzzy title plans as tracked under the existing number', () => {
  const trackerRows = [{ num: 7, company: 'Larkspur Analytics Inc', role: 'Senior Analytics Engineer', url: '', status: 'Interview' }];
  const [e] = planOf([larkspur()], trackerRows);
  assert.equal(e.outcome, 'tracked');
  assert.equal(e.trackedNum, 7);
  assert.equal(e.trackedStatus, 'Interview');
  const [withUrl] = planOf([larkspur()], [{ ...trackerRows[0], url: 'https://jobs.example.com/other/1' }]);
  assert.equal(withUrl.outcome, 'import', 'a tracker row with its own posting URL is a different posting');
});

test('an unreadable CSV Application Date imports undated, not stamped silently', () => {
  const rows = parseCsv(readFileSync(CSV, 'utf-8'));
  const col = rows[0].findIndex((h) => h.replace(/^\uFEFF/, '').trim() === 'Application Date');
  for (const bad of ['2026-13-45', '07/01/2026', 'n/a']) {
    const edited = rows.map((r, i) => (i === 1 ? r.map((c, j) => (j === col ? bad : c)) : r));
    const [e] = planOf(rrFromCsv(edited));
    assert.equal(e.outcome, 'import', bad);
    assert.equal(e.undated, true, bad);
    assert.match(e.notes, /no date in source/, bad);
  }
});

test('a closed stage visit with no reason of its own takes the row\'s closed reason', () => {
  const apps = JSON.parse(fixture('applications.json'));
  const harrow = apps.find((a) => a.company === 'Harrowgate Systems');
  for (const e of harrow.activity) if (e.type === 'stage' && e.stage === 'closed') delete e.closedReason;
  const [entry] = planOf(readRrZip(rrZip({ 'applications.json': strToU8(JSON.stringify([harrow])) })).apps);
  assert.equal(entry.sidecars.statusLog.at(-1).to, 'Hired');
});

test('a tracked row with its own status-log history gets no RR backfill rows', () => {
  const tracker = trackerText(['| 1 | 2026-06-30 | Larkspur Analytics | Analytics Engineer | 4.1/5 | Evaluated | ❌ | — | | [example.com](https://jobs.example.com/larkspur/1) |']);
  withRoot({ tracker }, (fx) => {
    writeFileSync(join(fx.root, 'data', 'status-log.tsv'), '1\t2026-06-30\t-\tEvaluated\tset-status\t\n');
    const r = zipImport(fx);
    assert.equal(r.status, 0, describeSpawn(r));
    assert.deepEqual(rowsFor(fx, 'data/status-log.tsv', 1), ['1\t2026-06-30\t-\tEvaluated\tset-status\t']);
    assert.ok(rowsFor(fx, 'data/application-events.tsv', 1).some((l) => l.includes('\timport\trr-export ')), 'the row was imported as tracked #1');
  });
});

test('a zip import after a CSV import still writes what only the zip carries', () => {
  withRoot({}, (fx) => {
    assert.equal(run(fx, [CSV, '--confirm']).status, 0);
    assert.ok(!existsSync(join(fx.root, 'data', 'active-interviews.md')), 'the CSV path writes no interviews');
    const r = zipImport(fx);
    assert.equal(r.status, 0, describeSpawn(r));
    assert.match(read(fx, 'data/active-interviews.md'), /\| Larkspur Analytics \| Analytics Engineer \| screening \|/);
  });
});
