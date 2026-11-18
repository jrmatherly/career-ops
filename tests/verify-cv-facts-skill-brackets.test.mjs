// A bracketed list inside a skills line or a competency tag, such as
// "Cloud Platforms (Azure, AKS)", was split on its commas only. The last name
// kept its bracket ("aks)") and never matched the source, so a sourced tool
// blocked. The first name stayed glued to the words before the bracket and
// was never checked at all.
//
// Run: node --test tests/verify-cv-facts-skill-brackets.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyFacts } from '../verify-cv-facts.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'cv-skill-bracket-facts-'));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
const source = join(tmp, 'cv.md');
writeFileSync(source, `# Fixture Person

## Experience

### Fixture Co — Springfield, IL
**Coordinator**
2019 – 2024

- Ran Kubernetes on Rancher and AKS for 12 people.

## Skills
Azure, cloud platforms
`);
const options = { sourcePaths: [source], configPath: join(tmp, 'absent.json') };

const tag = (text) => `<span class="competency-tag">${text}</span>`;
const blocked = (result) => result.unsupportedFacts.map((fact) => `${fact.kind}=${fact.value}`);

test('sourced tools in a bracketed list on a competency tag do not block', () => {
  const result = verifyFacts(tag('Cloud Platforms (Azure, Rancher, AKS)'), options);
  assert.deepEqual(blocked(result), []);
});

test('an unsourced tool at the end of a bracketed list blocks under its own name', () => {
  const result = verifyFacts(tag('Cloud Platforms (Azure, Terraform)'), options);
  assert.equal(result.verdict, 'block');
  assert.deepEqual(blocked(result), ['tool=terraform']);
});

test('an unsourced tool at the start of a bracketed list blocks', () => {
  const result = verifyFacts(tag('Cloud Platforms (Terraform, AKS)'), options);
  assert.equal(result.verdict, 'block');
  assert.deepEqual(blocked(result), ['tool=terraform']);
});

test('a bracketed list on a skills line is read the same way', () => {
  const line = (items) => `<div class="skill-item"><span class="skill-category">Cloud: </span>${items}</div>`;
  assert.deepEqual(blocked(verifyFacts(line('Kubernetes [Rancher, AKS]'), options)), []);
  assert.deepEqual(blocked(verifyFacts(line('Kubernetes [Rancher, Nomad]'), options)), ['tool=nomad']);
});

test('a bracketed list joined by "and" is read the same way', () => {
  assert.deepEqual(blocked(verifyFacts(tag('Cloud Platforms (Azure and AKS)'), options)), []);
  assert.deepEqual(blocked(verifyFacts(tag('Cloud Platforms (Azure and Terraform)'), options)), ['tool=terraform']);
});

test('a bracket with one item is a gloss, not a name of its own', () => {
  for (const gloss of ['Azure (Advanced)', 'Kubernetes (Certified)', 'Cloud Platforms (IaaS)']) {
    assert.deepEqual(blocked(verifyFacts(tag(gloss), options)), [], gloss);
  }
});

test('a bracketed list on a LaTeX skills row is read the same way', () => {
  const row = (items) => `\\begin{document}\n\\textbf{Cloud}{: }{${items}} \\\\\n\\end{document}`;
  assert.deepEqual(blocked(verifyFacts(row('Kubernetes (Rancher, AKS)'), options)), []);
  assert.deepEqual(blocked(verifyFacts(row('Kubernetes (Rancher, Nomad)'), options)), ['tool=nomad']);
});
