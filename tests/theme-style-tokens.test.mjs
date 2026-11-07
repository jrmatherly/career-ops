// tests/theme-style-tokens.test.mjs — the eight design tokens in theme-style.mjs
// and the shipped templates.
//
// Two guards. The token map must expose each key as its CSS variable. And a
// render of the example payload with no style: block must equal the trunk
// render in tests/fixtures/theme-style/example-default.html once the
// var(--x, <fallback>) reads resolve to their fallbacks, which pins every
// fallback to the literal the template had before.
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { pass, fail, ROOT, NODE } from './helpers.mjs';
import { listTemplates, DEFAULT_TEMPLATES_DIR } from '../cv-templates.mjs';

console.log('\ntheme-style tokens (design variables)');

const NEW_TOKENS = {
  heading_font_family: '--heading-font-family',
  heading_font_size: '--heading-font-size',
  line_height: '--line-height',
  section_gap: '--section-gap',
  item_gap: '--item-gap',
  text_color: '--text-color',
  background_color: '--background-color',
  sidebar_width: '--sidebar-width',
};

const EXAMPLE_PAYLOAD = {
  lang: 'en',
  page_format: 'a4',
  candidate: {
    name: 'Jane Smith',
    phone: '+1 555 0100',
    email: 'jane@example.com',
    linkedin: { url: 'https://linkedin.com/in/janesmith', display: 'linkedin.com/in/janesmith' },
    portfolio: { url: 'https://janesmith.dev', display: 'janesmith.dev' },
    location: 'Berlin, Germany',
  },
  summary: 'Platform engineer who ships verification tooling.',
  competencies: ['Platform engineering', 'Distributed systems'],
  experience: [{
    company: 'Example GmbH',
    role: 'Staff Engineer',
    location: 'Berlin',
    dates: '2023 - Present',
    bullets: ['Cut deploy time from 40 minutes to 4.'],
  }],
  projects: [{ name: 'Open Source Thing', description: 'A tool people use.' }],
  education: [{ title: 'BSc Computer Science', org: 'Example University', year: '2018' }],
  skills: [{ category: 'Languages', items: ['Go', 'TypeScript'] }],
};

// Replace every `var(--token, fallback)` for the new tokens with its fallback,
// honoring nested parentheses in the fallback (hsl(...), var(...)).
export function resolveNewTokenFallbacks(css) {
  const names = Object.values(NEW_TOKENS);
  let out = css;
  for (const name of names) {
    const open = `var(${name}, `;
    let at;
    while ((at = out.indexOf(open)) !== -1) {
      let depth = 1;
      let i = at + open.length;
      const start = i;
      for (; i < out.length && depth > 0; i++) {
        if (out[i] === '(') depth++;
        else if (out[i] === ')') depth--;
      }
      if (depth !== 0) throw new Error(`unbalanced var() for ${name}`);
      out = out.slice(0, at) + out.slice(start, i - 1) + out.slice(i);
    }
  }
  return out;
}

try {
  const { styleTokensFrom } = await import(pathToFileURL(join(ROOT, 'theme-style.mjs')).href);

  const style = Object.fromEntries(Object.keys(NEW_TOKENS).map((key) => [key, `v-${key}`]));
  const tokens = styleTokensFrom(style);
  const unmapped = Object.entries(NEW_TOKENS).filter(([key, cssVar]) => tokens[cssVar] !== `v-${key}`);
  if (unmapped.length === 0) pass('styleTokensFrom carries each design token to its CSS variable');
  else fail(`styleTokensFrom dropped ${unmapped.map(([k]) => k).join(', ')}`);

  const numeric = styleTokensFrom({ line_height: 1.45, heading_font_size: 13, text_color: true });
  if (numeric['--line-height'] === '1.45' && numeric['--heading-font-size'] === '13' && !('--text-color' in numeric)) {
    pass('styleTokensFrom accepts a bare YAML number and still ignores other non-strings');
  } else {
    fail(`styleTokensFrom numeric => ${JSON.stringify(numeric)}`);
  }

  const dir = mkdtempSync(join(tmpdir(), 'theme-style-tokens-'));
  const input = join(dir, 'payload.json');
  writeFileSync(input, JSON.stringify(EXAMPLE_PAYLOAD));
  const output = join(dir, 'cv.html');
  execFileSync(NODE, ['build-cv-html.mjs', input, output], { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  const golden = readFileSync(join(ROOT, 'tests', 'fixtures', 'theme-style', 'example-default.html'), 'utf-8');
  const rendered = resolveNewTokenFallbacks(readFileSync(output, 'utf-8'));
  if (rendered === golden) pass('a render with no style block equals the trunk fixture once the new var() reads resolve to their fallbacks');
  else {
    const at = [...rendered].findIndex((ch, i) => ch !== golden[i]);
    fail(`default render drifted from tests/fixtures/theme-style/example-default.html at offset ${at}: ${JSON.stringify(rendered.slice(at, at + 80))} vs ${JSON.stringify(golden.slice(at, at + 80))}`);
  }

  // Every shipped HTML template reads every token that has a construct to bind
  // to. sidebar_width binds only where a template lays out a rail.
  const RAIL_TEMPLATES = new Set(['compact']);
  for (const template of listTemplates('cv', { dir: DEFAULT_TEMPLATES_DIR, userDir: null })) {
    const src = readFileSync(template.path, 'utf-8');
    const expected = Object.values(NEW_TOKENS).filter((v) => v !== '--sidebar-width' || RAIL_TEMPLATES.has(template.name));
    const absent = expected.filter((cssVar) => !src.includes(`var(${cssVar}, `));
    if (absent.length === 0) pass(`${template.name}: reads ${expected.length} design tokens with fallbacks`);
    else fail(`${template.name}: does not read ${absent.join(', ')}`);
  }
} catch (err) {
  fail(`theme-style tokens suite threw: ${err.stack || err.message}`);
}
