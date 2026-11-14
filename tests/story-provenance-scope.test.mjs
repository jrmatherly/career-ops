import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStoryBank } from '../story-provenance-check.mjs';

const story = (scope) => ['### [Ops] Evening shift', `**Scope:** ${scope}`, '**A (Action):** Led the shift.', '**R (Result):** Zero missed handoffs.'].join('\n');
const claims = (bucket) => bucket.map((c) => c.claim);

test('every figure on a Scope line is a claim, and cv.md decides its bucket', () => {
  const cv = 'Led 8 associates on the evening shift, moving 120,000 units a month across 3 sites with a $2M budget.';
  const backed = classifyStoryBank(story('8 associates, 120,000 units a month, $2M budget, 3 sites'), cv);
  assert.deepEqual(claims(backed.existing), ['8 associates', '120,000 units', '$2M budget', '3 sites']);
  assert.ok(backed.existing.every((c) => c.pattern === 'scope-figure'));

  const inflated = classifyStoryBank(story('14 associates, 480,000 units a month'), cv);
  assert.deepEqual(claims(inflated.existing), []);
  assert.deepEqual(claims(inflated.supportedByResume), ['14 associates', '480,000 units']);

  const unbacked = classifyStoryBank(story('14 analysts, 9 regions'), 'Wrote reports.');
  assert.deepEqual(claims(unbacked.derivedUnverified), ['14 analysts', '9 regions']);
});

test('a grouped thousand is one number in prose and on a Scope line, and a currency has to match', () => {
  const cv = 'Trained 1,500 employees on the new intake flow with a $2M budget.';
  const prose = ['### [Ops] Rollout', '**A (Action):** Trained 1,500 employees on the intake flow.', '**R (Result):** Done.'].join('\n');
  assert.deepEqual(claims(classifyStoryBank(prose, cv).existing), ['1,500 employees']);
  const scoped = classifyStoryBank(story('1,500 employees trained, €2M budget'), cv);
  assert.deepEqual(claims(scoped.existing), ['1,500 employees']);
  assert.deepEqual(claims(scoped.supportedByResume), ['€2M budget']);
  const decimal = classifyStoryBank(story('$1,200.50 budget'), 'Ran the pilot on a $1,200.50 budget.');
  assert.deepEqual(claims(decimal.existing), ['$1,200.50 budget']);
  const plus = classifyStoryBank(story('$500,000+ budget'), 'Ran the programme on a €500,000+ budget.');
  assert.deepEqual(plus.existing, []);
  const magnitude = classifyStoryBank(story('$2 million budget'), 'Generated $2 million revenue.');
  assert.deepEqual(magnitude.existing, []);
  const percent = ['### [Ops] Growth', '**A (Action):** Grew weekly signups 1,200.5% after the relaunch.'].join('\n');
  assert.deepEqual(Object.values(classifyStoryBank(percent, 'Wrote reports.')).flat().map((c) => c.claim), ['1,200.5%']);
});

test('a Scope figure another pattern already reads is reported once', () => {
  const report = classifyStoryBank(story('a 15-person team, 30% of volume, 200 employees'), 'Wrote reports.');
  const all = Object.values(report).flat();
  assert.deepEqual(all.map((c) => c.pattern).sort(), ['percent', 'scale-hyphen', 'scale-noun']);
});

test('the same figures outside a Scope line stay unread, and a number with no unit is not a claim', () => {
  const prose = ['### [Ops] Evening shift', '**A (Action):** Led 8 associates across 3 sites.', '**R (Result):** Shipped.'].join('\n');
  assert.deepEqual(Object.values(classifyStoryBank(prose, 'Wrote reports.')).flat(), []);
  assert.deepEqual(Object.values(classifyStoryBank(story('since 2021'), 'Wrote reports.')).flat().map((c) => c.claim), []);
});

test('a user-cannot-confirm marker still wins over a Scope figure cv.md backs', () => {
  const marked = `${story('8 associates')}\n**Provenance:** user-cannot-confirm`;
  const report = classifyStoryBank(marked, 'Led 8 associates on the evening shift.');
  assert.deepEqual(claims(report.userCannotConfirm), ['8 associates']);
  assert.deepEqual(report.existing, []);
});

const scopeOf = (scope, cv) => {
  const report = classifyStoryBank(story(scope), cv);
  return Object.fromEntries(Object.entries(report).map(([bucket, list]) => [bucket, claims(list)]));
};

test('a Scope figure is verified by its own item only, never by a neighbour on the line', () => {
  assert.deepEqual(scopeOf('$2M budget, 5 regions', 'Generated $2M revenue across 5 regions.').existing, ['5 regions']);
  assert.deepEqual(scopeOf('$40K budget, 6 vendors', 'Saved $40K across 6 vendors in licence fees.').existing, ['6 vendors']);
  assert.deepEqual(scopeOf('2m budget', 'Ran 2m sprints for the budget team.').existing, []);
  assert.deepEqual(scopeOf('$2M budget', 'Owned a $2M budget for the platform.').existing, ['$2M budget']);
});

test('a magnitude is part of the number, and a currency written after it still has to match', () => {
  assert.deepEqual(scopeOf('$2 million budget', 'Owned a $2M budget.').existing, ['$2 million budget']);
  assert.deepEqual(scopeOf('2M EUR budget', 'Managed a 2M USD budget.').existing, []);
  assert.deepEqual(scopeOf('2M€ budget', 'Managed a 2M$ budget.').existing, []);
  assert.deepEqual(scopeOf('2M EUR budget', 'Managed a 2M EUR budget.').existing, ['2M EUR budget']);
  assert.deepEqual(scopeOf('USD 2M budget', 'Managed a EUR 2M budget.').existing, []);
  assert.deepEqual(scopeOf('USD 2M budget', 'Managed a USD 2M budget.').existing, ['USD 2M budget']);
  assert.deepEqual(scopeOf('$2M USD budget', 'Managed a $2M CAD budget.').existing, []);
  assert.deepEqual(scopeOf('$2M USD budget', 'Managed a $2M USD budget.').existing, ['$2M USD budget']);
});

test('a range is two figures, and a word such as "to" is never a unit', () => {
  const grew = scopeOf('8 to 12 associates', 'Grew the team to 12 associates.');
  assert.deepEqual(grew.existing, ['12 associates']);
  assert.deepEqual([...grew.supportedByResume, ...grew.derivedUnverified], ['8 to 12 associates']);
  const dashed = scopeOf('8-12 associates', 'Led 12 associates.');
  assert.deepEqual(dashed.existing, ['12 associates']);
  assert.deepEqual([...dashed.supportedByResume, ...dashed.derivedUnverified], ['8-12 associates']);
  for (const range of ['8 – 12 associates', '8 - 12 associates']) {
    const spaced = scopeOf(range, 'Led 12 associates.');
    assert.deepEqual(spaced.existing, ['12 associates']);
    assert.deepEqual([...spaced.supportedByResume, ...spaced.derivedUnverified], [range]);
  }
});

test('years and identifiers on a Scope line are not claims', () => {
  const all = Object.values(scopeOf('FY2023 budget $2M, since 2021 pilots, March 2022 launch, 24/7 coverage, v2 platform, Jan 2021 to present', 'Wrote reports.')).flat();
  assert.deepEqual(all, []);
  assert.deepEqual(scopeOf('2000 customers', 'Supported 2000 customers on the platform.').existing, ['2000 customers']);
});

test('a grouped number before a comma is whole, and number lists in prose read as before', () => {
  assert.deepEqual(scopeOf('$1,200,000, 4 regions', 'Held a $1,200,000 budget across 4 regions.').existing, ['4 regions']);
  assert.deepEqual(scopeOf('1,200,000 units, 4 regions', 'Shipped 1,200,000 units across 4 regions.').existing, ['1,200,000 units', '4 regions']);
  const prose = (line) => Object.values(classifyStoryBank(['### [Ops] Story', `**A (Action):** ${line}`].join('\n'), 'Wrote reports.')).flat().map((c) => c.claim);
  assert.deepEqual(prose('Cut costs 10%,20%,30% over three quarters.'), ['10%', '20%', '30%']);
  assert.deepEqual(prose('Taught cohorts of 3,40 students.'), ['40 students']);
  assert.deepEqual(prose('In 2019,500 employees joined.'), ['500 employees']);
  assert.deepEqual(prose('Onboarded 1,500-person division.'), ['1,500-person']);
  assert.deepEqual(prose('Cut processing from 1,500 hours to 2 hours.'), ['1,500 hours to 2 hours']);
});
