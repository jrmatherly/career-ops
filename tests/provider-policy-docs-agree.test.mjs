// tests/provider-policy-docs-agree.test.mjs — the fork-only provider guidance
// (the add-provider skill and the providers rule) states Source Indexing Policy
// rule 6 the way upstream's CONTRIBUTING.md and ADDING_A_PROVIDER.md do, so an
// upstream rewrite of the rule cannot leave the fork's agents on the old one.
import { readFileSync } from 'fs';
import { join } from 'path';
import { pass, fail, ROOT } from './helpers.mjs';

console.log('\nprovider policy docs agree on rule 6');

const read = (rel) => readFileSync(join(ROOT, rel), 'utf-8');
const FORK_FILES = ['.claude/skills/add-provider/SKILL.md', '.claude/rules/providers.md'];
const ROBOTS_GATE = /robots\.txt[^.\n]*(per path|checked|read per|is a stop)/i;
const VISITOR = /not a gate|read like a visitor/i;

const rule6 = {
  'CONTRIBUTING.md': read('CONTRIBUTING.md').match(/^6\. \*\*.*$/m)?.[0] ?? '',
  'providers/ADDING_A_PROVIDER.md':
    read('providers/ADDING_A_PROVIDER.md').match(/\*\*Read like a visitor \(rule 6\)\.\*\*[\s\S]*?(?:\n\n|$)/)?.[0] ?? '',
};

if (/robots\.txt[^.\n]*not a gate/i.test(rule6['CONTRIBUTING.md'])) {
  pass('CONTRIBUTING.md rule 6 says robots.txt is not a gate');
} else {
  fail('CONTRIBUTING.md rule 6 no longer says robots.txt is not a gate: re-read upstream and update this test with the fork files');
}

for (const [file, text] of Object.entries(rule6)) {
  const missing = ['login', 'captcha', 'operator'].filter((stop) => !text.toLowerCase().includes(stop));
  if (text && missing.length === 0) pass(`${file} rule 6 names the three stops`);
  else fail(`${file} rule 6 ${text ? `is missing ${missing.join(', ')}` : 'was not found'}`);
}

for (const file of FORK_FILES) {
  const text = read(file);
  const lines = text.split('\n');
  const gate = lines.findIndex((line) => ROBOTS_GATE.test(line));
  if (gate === -1) pass(`${file} does not treat robots.txt as a gate`);
  else fail(`${file}:${gate + 1} still treats robots.txt as a gate: ${lines[gate].trim().slice(0, 120)}`);
  if (VISITOR.test(text)) pass(`${file} states rule 6 as "read like a visitor"`);
  else fail(`${file} does not state rule 6 as "read like a visitor"`);
}
