// tests/doctor-billing-source.test.mjs — the billing-source check in doctor.mjs.
//
// The check exists to tell a user which account their tokens are billed to, so
// a FALSE warning is worse than none: it tells someone who explicitly opted out
// of a cloud provider that they're billing to it. The cloud switches are
// documented as `=1`, which makes `=0` the natural way to turn one off.
import { pass, fail, NODE, ROOT } from './helpers.mjs';
import { execFileSync } from 'child_process';
import { join } from 'path';

console.log('\ndoctor.mjs — billing source');

const DOCTOR = join(ROOT, 'doctor.mjs');

/** Run doctor and return its human output (it exits non-zero when it finds issues). */
function runDoctor(env, args = []) {
  try {
    return execFileSync(NODE, [DOCTOR, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    return String(e.stdout || '');
  }
}

const CLOUD_VARS = ['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'];
// Clear every billing-related var so each case starts from a known state.
const CLEAN = Object.fromEntries(
  [...CLOUD_VARS, 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN'].map((v) => [v, '']),
);

const warnsAbout = (out, v) => new RegExp(`${v} is set`).test(out);

// Truthy values must warn — the check's actual job.
for (const value of ['1', 'true']) {
  const out = runDoctor({ ...CLEAN, CLAUDE_CODE_USE_BEDROCK: value });
  if (warnsAbout(out, 'CLAUDE_CODE_USE_BEDROCK')) {
    pass(`CLAUDE_CODE_USE_BEDROCK=${value} warns that requests bill to the cloud account`);
  } else {
    fail(`CLAUDE_CODE_USE_BEDROCK=${value} did not warn`);
  }
}

// Explicit opt-outs must NOT warn. Mere presence used to be enough, so `=0`
// told a user who had just disabled Bedrock that they were billing to it.
for (const value of ['0', 'false', 'no', 'off', '']) {
  const out = runDoctor({ ...CLEAN, CLAUDE_CODE_USE_BEDROCK: value });
  if (!warnsAbout(out, 'CLAUDE_CODE_USE_BEDROCK')) {
    pass(`CLAUDE_CODE_USE_BEDROCK=${JSON.stringify(value)} is an opt-out and stays quiet`);
  } else {
    fail(`CLAUDE_CODE_USE_BEDROCK=${JSON.stringify(value)} produced a false cloud-billing warning`);
  }
}

// The other two switches share the rule.
for (const v of ['CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']) {
  const on = runDoctor({ ...CLEAN, [v]: '1' });
  const off = runDoctor({ ...CLEAN, [v]: '0' });
  if (warnsAbout(on, v) && !warnsAbout(off, v)) {
    pass(`${v} warns at =1 and stays quiet at =0`);
  } else {
    fail(`${v} truthiness handling is inconsistent with CLAUDE_CODE_USE_BEDROCK`);
  }
}

// An API key still takes precedence and must still be reported.
{
  const out = runDoctor({ ...CLEAN, ANTHROPIC_API_KEY: 'sk-ant-test' });
  if (/ANTHROPIC_API_KEY is set/.test(out)) {
    pass('an API key in the environment is still reported as the billing source');
  } else {
    fail('the API key path regressed');
  }
}

const GATEWAY = 'http://proxy.example:8317';
const GATEWAY_LINE = /route through a gateway at proxy\.example:8317/;
const GATEWAY_PASS = /^✓ Billing source\. Requests route through a gateway at proxy\.example:8317, and the gateway's credential/m;
const GATEWAY_NO_CREDENTIAL = /^⚠ Billing source\. Requests route through a gateway at proxy\.example:8317, but no ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY is set, so Claude Code sends any keychain login to the gateway/m;
const GATEWAY_OAUTH_ONLY = /^⚠ Billing source\. Requests route through a gateway at proxy\.example:8317, and no ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY is set, so Claude Code sends your subscription OAuth token \(CLAUDE_CODE_OAUTH_TOKEN\) to the gateway\.\n {2}→ Set ANTHROPIC_AUTH_TOKEN to the gateway's client key and unset CLAUDE_CODE_OAUTH_TOKEN\.$/m;
const outranksOAuth = (v) => new RegExp(`^⚠ Billing source\\. Requests route through a gateway at proxy\\.example:8317, and ${v} outranks CLAUDE_CODE_OAUTH_TOKEN, so the OAuth token is unused here\\.\\n {2}→ Unset CLAUDE_CODE_OAUTH_TOKEN, so a missing gateway credential never falls back to your subscription\\.$`, 'm');
const NOT_HTTP_URL = /^⚠ ANTHROPIC_BASE_URL is set but is not an http\(s\) URL with a host/m;

// [name, env, must match, must not match]
const BILLING_CASES = [
  ['a gateway base URL with a token passes with the gateway, not per-token billing',
    { ANTHROPIC_BASE_URL: GATEWAY, ANTHROPIC_AUTH_TOKEN: 'x' }, GATEWAY_PASS, /bills per token/],
  ['a gateway base URL with an API key passes with the gateway',
    { ANTHROPIC_BASE_URL: GATEWAY, ANTHROPIC_API_KEY: 'sk-ant-test' }, GATEWAY_PASS, /bills per token/],
  ['a gateway base URL alone warns that no credential is set and names the host',
    { ANTHROPIC_BASE_URL: GATEWAY }, GATEWAY_NO_CREDENTIAL, /a Claude subscription will be used/],
  ['a whitespace-only auth token beside a gateway counts as no credential',
    { ANTHROPIC_BASE_URL: GATEWAY, ANTHROPIC_AUTH_TOKEN: '  ' }, GATEWAY_NO_CREDENTIAL, GATEWAY_PASS],
  ['a whitespace-only API key beside a gateway counts as no credential',
    { ANTHROPIC_BASE_URL: GATEWAY, ANTHROPIC_API_KEY: '  ' }, GATEWAY_NO_CREDENTIAL, GATEWAY_PASS],
  // Claude Code 2.1.319 treats a whitespace-only ANTHROPIC_API_KEY as unset.
  ['a whitespace-only API key with no gateway counts as no API key',
    { ANTHROPIC_API_KEY: '  ' }, /a Claude subscription will be used/, /ANTHROPIC_API_KEY is set/],
  ['a gateway with only CLAUDE_CODE_OAUTH_TOKEN warns that the OAuth token goes to the gateway',
    { ANTHROPIC_BASE_URL: GATEWAY, CLAUDE_CODE_OAUTH_TOKEN: 'x' }, GATEWAY_OAUTH_ONLY, GATEWAY_NO_CREDENTIAL],
  ['a gateway token beside CLAUDE_CODE_OAUTH_TOKEN warns that the token outranks it',
    { ANTHROPIC_BASE_URL: GATEWAY, ANTHROPIC_AUTH_TOKEN: 'x', CLAUDE_CODE_OAUTH_TOKEN: 'x' }, outranksOAuth('ANTHROPIC_AUTH_TOKEN'), GATEWAY_PASS],
  ['an API key beside CLAUDE_CODE_OAUTH_TOKEN warns that the key outranks it',
    { ANTHROPIC_BASE_URL: GATEWAY, ANTHROPIC_API_KEY: 'sk-ant-test', CLAUDE_CODE_OAUTH_TOKEN: 'x' }, outranksOAuth('ANTHROPIC_API_KEY'), GATEWAY_PASS],
  ['a whitespace-only CLAUDE_CODE_OAUTH_TOKEN beside a gateway token passes with the gateway',
    { ANTHROPIC_BASE_URL: GATEWAY, ANTHROPIC_AUTH_TOKEN: 'x', CLAUDE_CODE_OAUTH_TOKEN: '  ' }, GATEWAY_PASS, /CLAUDE_CODE_OAUTH_TOKEN/],
  ['api.anthropic.com as base URL keeps the key warning',
    { ANTHROPIC_BASE_URL: 'https://api.anthropic.com', ANTHROPIC_API_KEY: 'sk-ant-test' }, /^⚠ ANTHROPIC_API_KEY is set/m, GATEWAY_LINE],
  ['an unparseable base URL warns and does not throw',
    { ANTHROPIC_BASE_URL: 'not a url', ANTHROPIC_AUTH_TOKEN: 'x' }, NOT_HTTP_URL, GATEWAY_LINE],
  ['a file: base URL warns as not an http(s) URL',
    { ANTHROPIC_BASE_URL: 'file:///x', ANTHROPIC_AUTH_TOKEN: 'x' }, NOT_HTTP_URL, GATEWAY_LINE],
  ['an ftp: base URL warns instead of passing as a gateway',
    { ANTHROPIC_BASE_URL: 'ftp://proxy.example', ANTHROPIC_AUTH_TOKEN: 'x' }, NOT_HTTP_URL, /route through a gateway/],
  ['a whitespace-only base URL falls through to the key warning',
    { ANTHROPIC_BASE_URL: '   ', ANTHROPIC_API_KEY: 'sk-ant-test' }, /^⚠ ANTHROPIC_API_KEY is set/m, /ANTHROPIC_BASE_URL is set/],
  ['a cloud switch wins over a gateway base URL',
    { CLAUDE_CODE_USE_BEDROCK: '1', ANTHROPIC_BASE_URL: GATEWAY }, /^⚠ CLAUDE_CODE_USE_BEDROCK is set/m, GATEWAY_LINE],
];

for (const [name, env, want, never] of BILLING_CASES) {
  const out = runDoctor({ ...CLEAN, ...env });
  if (want.test(out) && !never.test(out)) pass(name);
  else fail(`${name}: expected ${want} and not ${never}`);
}

// --json is the path AGENTS.md has agents read, so a billing warn must reach it.
{
  const parse = (env) => {
    try { return JSON.parse(runDoctor({ ...CLEAN, ...env }, ['--json'])); } catch { return null; }
  };
  const baseline = parse({});
  const bad = parse({ ANTHROPIC_BASE_URL: 'not a url', ANTHROPIC_AUTH_TOKEN: 'x' });
  const sameKeys = baseline && bad
    && JSON.stringify(Object.keys(bad)) === JSON.stringify(Object.keys(baseline));
  const listed = bad?.warnings?.some((w) => w.startsWith('ANTHROPIC_BASE_URL is set but is not an http(s) URL with a host'));
  if (sameKeys && listed) pass('--json lists the billing warn and keeps every top-level key');
  else fail(`--json billing warn: keys unchanged=${Boolean(sameKeys)}, warning listed=${Boolean(listed)}`);
}
