import test from 'node:test';
import assert from 'node:assert/strict';
import { passesFilters, filterFingerprints, changedFilterKeys, readSkipTiers, salaryFilterProblem } from '../scan-ats-full.mjs';
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
test('a refused skip_tiers value is named in the message', () => {
  assert.throws(() => readSkipTiers(['junior']), /got \["junior"\]/);
});
test('a setting that filters nothing, or is only respelled, does not change the fingerprint', () => {
  const unset = filterFingerprints({});
  assert.deepEqual(changedFilterKeys({ filters: unset }, filterFingerprints({ skip_tiers: [], salary_filter: { min: 0, max: 0, currency: 'USD' } })), []);
  const set = filterFingerprints({ skip_tiers: ['Senior', 'entry'], salary_filter: { min: 150000, currency: 'usd' } });
  assert.deepEqual(changedFilterKeys({ filters: set }, filterFingerprints({ skip_tiers: ['entry', 'senior'], salary_filter: { currency: 'USD', min: 150000 } })), []);
  assert.deepEqual(changedFilterKeys({ filters: set }, filterFingerprints({ skip_tiers: ['entry'], salary_filter: { min: 150000, currency: 'EUR' } })), ['salary_filter', 'skip_tiers']);
});
test('a salary_filter the scanner would turn off or choke on is named as a problem', () => {
  for (const ok of [undefined, null, {}, { min: 150000 }, { min: '150000', max: 0, currency: 'USD' }, { currency: 'USD' }]) {
    assert.equal(salaryFilterProblem(ok), null, JSON.stringify(ok));
  }
  assert.match(salaryFilterProblem('high'), /must be a mapping/);
  assert.match(salaryFilterProblem([100000]), /must be a mapping/);
  assert.match(salaryFilterProblem({ min: 'abc' }), /must be numbers of 0 or more/);
  assert.match(salaryFilterProblem({ min: -1 }), /must be numbers of 0 or more/);
  assert.match(salaryFilterProblem({ min: 200000, max: 150000 }), /min cannot be above/);
  assert.match(salaryFilterProblem({ min: 100000, currency: 1 }), /currency must be a currency code/);
});
test('onDrop names the stage that dropped a posting, and stays quiet for a title miss or a pass', () => {
  const stages = [];
  const opts = { ...base, salaryFilter, skipTiers: ['entry'], onDrop: (stage) => stages.push(stage) };
  passesFilters({ title: 'Infrastructure Engineer I' }, opts);
  passesFilters({ title: 'Director', salary: { max: 120000, currency: 'USD' } }, opts);
  passesFilters({ title: 'Director', description: 'x' }, { ...opts, contentFilter: () => false });
  passesFilters({ title: 'Director' }, opts);
  passesFilters({ title: 'Engineer I' }, { ...opts, titleFilter: () => false });
  assert.deepEqual(stages, ['tier', 'salary', 'content']);
});
test('a checkpoint with no recorded filters resumes unless one of the two settings is now on', () => {
  assert.deepEqual(changedFilterKeys({}, filterFingerprints({ title_filter: { positive: ['x'] } })), []);
  assert.deepEqual(changedFilterKeys(null, filterFingerprints({ skip_tiers: ['entry'] })), []);
  assert.deepEqual(changedFilterKeys({}, filterFingerprints({ skip_tiers: ['entry'] })), ['skip_tiers']);
  assert.deepEqual(changedFilterKeys({}, filterFingerprints({ salary_filter: { min: 150000 } })), ['salary_filter']);
});
