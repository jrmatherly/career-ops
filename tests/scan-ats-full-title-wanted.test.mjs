// tests/scan-ats-full-title-wanted.test.mjs: scan-ats-full.mjs hands each
// provider this scan's title decision, so Workday's 200-request detail budget
// goes to postings the title filter keeps.
// Run: node --test tests/scan-ats-full-title-wanted.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTitleWanted } from '../scan-ats-full.mjs';
import { buildTitleFilterOverrides, buildTitleFilterWithOverrides } from '../scan.mjs';
import workday from '../providers/workday.mjs';

const ENTRY = { name: 'acme', careers_url: 'https://acme.wd5.myworkdayjobs.com/acmecareers' };
const CXS = 'https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/acmecareers';
const PAGE = { total: 3, jobPostings: [
  { title: 'Platform Engineer', externalPath: '/job/USA---Austin-TX/Platform-Engineer_R1', locationsText: '3 Locations', postedOn: 'Posted Today' },
  { title: 'Staff Accountant', externalPath: '/job/USA---Austin-TX/Staff-Accountant_R2', locationsText: '2 Locations', postedOn: 'Posted Today' },
  { title: 'Payroll Specialist', externalPath: '/job/USA---Austin-TX/Payroll-Specialist_R3', locationsText: '4 Locations', postedOn: 'Posted Today' },
] };
const DETAIL = { jobPostingInfo: { location: 'USA - Austin, TX', additionalLocations: ['USA - Atlanta, GA'], startDate: '2026-10-15' } };

function recordingCtx() {
  const details = [];
  return { details, ctx: { transport: 'http', sleep: async () => {}, includeUndated: true, fetchText: async () => '',
    fetchJson: async (url) => { if (url.startsWith(`${CXS}/job/`)) { details.push(url.slice(CXS.length)); return DETAIL; } return PAGE; } } };
}
const filterFor = (overrides) => buildTitleFilterWithOverrides({ positive: ['Engineer'] }, buildTitleFilterOverrides(overrides));

test('withTitleWanted passes the company slug as the second argument', () => {
  const seen = [];
  const ctx = withTitleWanted({ a: 1 }, (title, slug) => { seen.push([title, slug]); return true; }, 'acme');
  assert.equal(ctx.a, 1);
  assert.equal(ctx.titleWanted('X'), true);
  assert.deepEqual(seen, [['X', 'acme']]);
});

test('withTitleWanted returns ctx unchanged when there is no title filter', () => {
  const ctx = { a: 1 };
  assert.equal(withTitleWanted(ctx, undefined, 'acme'), ctx);
});

test('Workday spends detail requests only on titles the sweep keeps', async () => {
  const { ctx, details } = recordingCtx();
  const jobs = await workday.fetch(ENTRY, withTitleWanted(ctx, filterFor(undefined), ENTRY.name));
  assert.deepEqual(details, ['/job/USA---Austin-TX/Platform-Engineer_R1']);
  assert.equal(jobs.find((j) => j.title === 'Platform Engineer').location, 'USA - Austin, TX · USA - Atlanta, GA');
  assert.equal(jobs.find((j) => j.title === 'Staff Accountant').location, '2 Locations');
});

test('a title kept only by this company\'s override still gets its detail request', async () => {
  const { ctx, details } = recordingCtx();
  await workday.fetch(ENTRY, withTitleWanted(ctx, filterFor([{ companies: ['acme'], positive_extra: ['Accountant'] }]), ENTRY.name));
  assert.deepEqual(details.sort(), ['/job/USA---Austin-TX/Platform-Engineer_R1', '/job/USA---Austin-TX/Staff-Accountant_R2']);
});

test('without the helper every placeholder costs a request', async () => {
  const { ctx, details } = recordingCtx();
  await workday.fetch(ENTRY, ctx);
  assert.equal(details.length, 3);
});
