// A skills line or a competency tag is split on its commas, including a comma
// inside a bracket. The last name of "Cloud Platforms (Azure, AKS)" arrived
// as "AKS)", which no source spells, so a sourced tool blocked the CV.
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
Azure, Python
`);
const options = { sourcePaths: [source], configPath: join(tmp, 'absent.json') };

const tag = (text) => `<span class="competency-tag">${text}</span>`;
const skillLine = (items) => `<div class="skill-item"><span class="skill-category">Cloud: </span>${items}</div>`;
const latexRow = (items) => `\\begin{document}\n\\textbf{Cloud}{: }{${items}} \\\\\n\\end{document}`;
const blocked = (html) => verifyFacts(html, options).unsupportedFacts.map((fact) => `${fact.kind}=${fact.value}`);

test('a sourced tool at the end of a bracketed list does not block', () => {
  for (const html of [
    tag('Cloud Platforms (Azure, Rancher, AKS)'),
    tag('Cloud Platforms (Azure and AKS)'),
    tag('Cloud Platforms (Azure (Advanced), AKS)'),
    tag('Cloud Platforms [Azure, [Rancher, AKS]]'),
    skillLine('Kubernetes [Rancher, AKS]'),
    latexRow('Kubernetes (Rancher, AKS)'),
  ]) assert.deepEqual(blocked(html), [], html);
});

test('an unsourced tool in a bracketed list blocks under its own name', () => {
  assert.deepEqual(blocked(tag('Cloud Platforms (Azure, Terraform)')), ['tool=terraform']);
  assert.deepEqual(blocked(tag('Cloud Platforms (Azure, Terraform, AKS)')), ['tool=terraform']);
  assert.deepEqual(blocked(skillLine('Kubernetes [Rancher, Nomad]')), ['tool=nomad']);
  assert.deepEqual(blocked(latexRow('Kubernetes (Rancher, Nomad)')), ['tool=nomad']);
});

// Each of these passed before the bracket was handled, and none names a tool.
test('a label, a gloss or a descriptor around a bracket still does not block', () => {
  for (const text of [
    'Languages (Python, bash)',
    'Observability (Azure, dashboards)',
    'Python (Expert, daily use)',
    'Python (Advanced and certified)',
    'Azure (Advanced)',
    'Kubernetes (Certified)',
  ]) assert.deepEqual(blocked(tag(text)), [], text);
});

test('a bracket that closes inside its own token is kept', () => {
  assert.deepEqual(blocked(tag('Azure, Kubernetes (K8s)')), ['tool=kubernetes (k8s)']);
});
