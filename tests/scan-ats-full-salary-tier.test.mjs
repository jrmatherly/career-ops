import test from 'node:test';
import assert from 'node:assert/strict';
import { passesFilters, filterFingerprints, changedFilterKeys, readSkipTiers } from '../scan-ats-full.mjs';
import { buildSalaryFilter } from '../scan.mjs';

const pass = () => true;
const base = { titleFilter: pass, locationFilter: pass, contentFilter: null, titleFilterConfig: {} };
const salaryFilter = buildSalaryFilter({ min: 150000, currency: 'USD' });

test('a posting whose stated top of range is under the minimum is dropped', () => {
  assert.equal(passesFilters({ title: 'Director', salary: { min: 90000, max: 120000, currency: 'USD' } }, { ...base, salaryFilter }), false);
});
test('a posting with no salary passes', () => {
  assert.equal(passesFilters({ title: 'Director' }, { ...base, salaryFilter }), true);
});
test('a posting in another stated currency is dropped', () => {
  assert.equal(passesFilters({ title: 'Director', salary: { min: 200000, max: 250000, currency: 'EUR' } }, { ...base, salaryFilter }), false);
});
test('a skipped seniority level is dropped and an unmarked title is not', () => {
  assert.equal(passesFilters({ title: 'Infrastructure Engineer I' }, { ...base, skipTiers: ['entry'] }), false);
  assert.equal(passesFilters({ title: 'Infrastructure Engineer' }, { ...base, skipTiers: ['entry'] }), true);
});
test('with neither setting passed, every posting passes as before', () => {
  assert.equal(passesFilters({ title: 'Infrastructure Engineer I', salary: { max: 1, currency: 'USD' } }, base), true);
});
test('changing either setting changes the checkpoint fingerprint', () => {
  const cp = { filters: filterFingerprints({}) };
  assert.ok(changedFilterKeys(cp, filterFingerprints({ salary_filter: { min: 150000 } })).includes('salary_filter'));
  assert.ok(changedFilterKeys(cp, filterFingerprints({ skip_tiers: ['entry'] })).includes('skip_tiers'));
});
test('a checkpoint written before these keys existed still resumes when both are unset', () => {
  const filters = filterFingerprints({});
  delete filters.salary_filter; delete filters.skip_tiers;
  assert.deepEqual(changedFilterKeys({ filters }, filterFingerprints({})), []);
  assert.deepEqual(changedFilterKeys({ filters }, filterFingerprints({ salary_filter: { min: 150000 } })), ['salary_filter']);
});
test('skip_tiers is read lowercased, and a bad value is refused', () => {
  assert.deepEqual(readSkipTiers(undefined), []);
  assert.deepEqual(readSkipTiers(['Entry', 'intern']), ['entry', 'intern']);
  assert.throws(() => readSkipTiers(['junior']), /skip_tiers must be a list of intern, entry, mid, senior/);
  assert.throws(() => readSkipTiers('entry'), /skip_tiers must be a list/);
});
