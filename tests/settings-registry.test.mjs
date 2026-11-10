// tests/settings-registry.test.mjs — the registry of user-adjustable settings.
import { pass, fail, ROOT } from './helpers.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { GROUPS, SETTINGS, settingById, validateSetting, envString, settingPath } from '../lib/settings-registry.mjs';
import { AGENT_CLIS } from '../lib/agent-cli.mjs';

console.log('\nsettings-registry.mjs: settings, bounds and encoding');

let n = 0;
const ok = (cond, label = `assertion ${n + 1}`) => { n++; (cond ? pass : fail)(label); };
const deepEqual = (a, b, label = `assertion ${n + 1}`) => {
  n++;
  if (isDeepStrictEqual(a, b)) pass(label);
  else fail(`${label}\n      expected ${JSON.stringify(b)}\n      got      ${JSON.stringify(a)}`);
};

const SECRET_IDS = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'PUBLISH_API_KEY', 'APIFY_TOKEN', 'USAJOBS_API_KEY', 'NOTION_ACCESS_TOKEN', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'H1B_API_TOKEN'];
const READONLY_IDS = ['CAREER_OPS_ROOT', 'CAREER_OPS_SCHEDULER', 'CAREER_OPS_WEB_ALLOWED_HOSTS', 'CAREER_OPS_ALLOWED_ORIGINS', 'ANTHROPIC_BASE_URL', 'PRIVACY_GUARD', 'CAREER_OPS_AUTO_EVALUATE_LOCAL', 'CAREER_OPS_CONNECTION_SCOPE', 'CAREER_OPS_TRUST_PROXY_EGRESS', 'OLLAMA_ALLOW_REMOTE'];
const DOTENV_IDS = ['CAREER_OPS_SCAN_CONCURRENCY', 'CAREER_OPS_SCAN_HOST_CONCURRENCY', 'CAREER_OPS_HTTP_CACHE', 'CAREER_OPS_HTTP_CACHE_TTL_MS', 'CAREER_OPS_HTTP_TIMEOUT_MS', 'CAREER_OPS_BROWSER_AUTODETECT', 'CAREER_OPS_CLI', 'PUBLISH_URL', 'USAJOBS_USER_AGENT', 'NOTION_PARENT_PAGE_ID'];

const conc = settingById('CAREER_OPS_SCAN_CONCURRENCY');

deepEqual(GROUPS.map(g => g.id).join(), 'scanner,automation,profile,integrations,models,keys,deployment', 'groups in page order');
ok(new Set(SETTINGS.map(s => s.id)).size === SETTINGS.length, 'ids are unique');
ok(SETTINGS.every(s => GROUPS.some(g => g.id === s.group) && s.label && s.help), 'every row has a group, label and help');
ok(SETTINGS.filter(s => s.kind === 'env').every(s => s.type), 'env rows are typed');
deepEqual(SETTINGS.filter(s => s.kind === 'env').length, 23, 'the 23 scanner, automation, integrations and model rows');
ok(SETTINGS.filter(s => s.kind === 'secret').every(s => !('default' in s)), 'secret rows carry no value');
for (const id of SECRET_IDS) ok(settingById(id)?.kind === 'secret' && settingById(id).group === 'keys', `${id} is a secret row`);
deepEqual(SETTINGS.filter(s => s.kind === 'secret').length, 14, 'exactly the 14 keys a dashboard user supplies');
ok(!settingById('PRIVACY_BYPASS_TOKEN') && !settingById('PUBLISH_SECRET'), 'gate tokens and the publish service\'s own secrets are not listed');
deepEqual(SETTINGS.filter(s => s.kind === 'readonly').map(s => s.id).sort(), [...READONLY_IDS].sort(), 'the 10 read-only deployment rows');
ok(SETTINGS.filter(s => s.kind === 'readonly').every(s => s.group === 'deployment'), 'read-only rows sit in deployment');
deepEqual(SETTINGS.filter(s => s.dotenv).map(s => s.id).sort(), [...DOTENV_IDS].sort(), 'dotenv marks the ten ids whose reader loads .env first');
deepEqual(settingById('ANTHROPIC_BASE_URL').display, 'origin', 'a base URL shows its origin only');
deepEqual(SETTINGS.filter(s => s.display === 'value').map(s => s.id).sort(), ['CAREER_OPS_ALLOWED_ORIGINS', 'CAREER_OPS_CONNECTION_SCOPE', 'CAREER_OPS_ROOT', 'CAREER_OPS_SCHEDULER', 'CAREER_OPS_WEB_ALLOWED_HOSTS'], 'rows that show their value');
ok(SETTINGS.filter(s => s.kind === 'readonly' || s.kind === 'secret').every(s => s.display || s.kind === 'secret'), 'every read-only row says how it displays');
deepEqual(settingById('CAREER_OPS_CLI').values, AGENT_CLIS, 'CAREER_OPS_CLI offers AGENT_CLIS');

// The ranker matches a forced CLI by binary name and runs an unknown one with a bare `-p` and none of its tool-denial flags.
const rankBins = [...readFileSync(join(ROOT, 'rank-pipeline.mjs'), 'utf8').matchAll(/^\s*(?:\{ )?bin: '([a-z]+)'/gm)].map(m => m[1]);
deepEqual(settingById('CAREER_OPS_RANK_CLI').values, rankBins, 'CAREER_OPS_RANK_CLI offers the ranker\'s binaries');
deepEqual(rankBins, ['claude', 'opencode', 'codex', 'copilot', 'qwen', 'agy', 'grok', 'pi', 'omp'], 'the ranker\'s binaries are the nine known');

// Bounds and defaults come verbatim from the spec's "Editable env settings" table.
const SPEC = [
  ['CAREER_OPS_SCAN_CONCURRENCY', 'scanner', 'int', 1, 50, 10],
  ['CAREER_OPS_SCAN_HOST_CONCURRENCY', 'scanner', 'int', 1, 50, 10],
  ['CAREER_OPS_HTTP_TIMEOUT_MS', 'scanner', 'int', 1000, 120000, 10000],
  ['CAREER_OPS_HTTP_CACHE', 'scanner', 'bool', undefined, undefined, true],
  ['CAREER_OPS_HTTP_CACHE_TTL_MS', 'scanner', 'int', 0, 86400000, 900000],
  ['CAREER_OPS_DNS_LOOKUPS_PER_MIN', 'scanner', 'int', 0, 10000, 400],
  ['CAREER_OPS_BROWSER_AUTODETECT', 'scanner', 'bool', undefined, undefined, false],
  ['CAREER_OPS_CLI', 'automation', 'enum', undefined, undefined, undefined],
  ['CAREER_OPS_RANK_CLI', 'automation', 'enum', undefined, undefined, undefined],
  ['CAREER_OPS_RANK_TIMEOUT_MS', 'automation', 'int', 10000, 1800000, 180000],
  ['PUBLISH_URL', 'integrations', 'url', undefined, undefined, undefined],
  ['USAJOBS_USER_AGENT', 'integrations', 'string', 3, 200, undefined],
  ['NOTION_PARENT_PAGE_ID', 'integrations', 'string', 1, 100, undefined],
  ['GEMINI_MODEL', 'models', 'string', 1, 100, 'gemini-3.6-flash'],
  ['OPENAI_BASE_URL', 'models', 'url', undefined, undefined, 'https://api.openai.com/v1'],
  ['OPENAI_MODEL', 'models', 'string', 1, 100, undefined],
  ['OPENAI_TIMEOUT_MS', 'models', 'int', 1000, 3600000, 300000],
  ['OLLAMA_MODEL', 'models', 'string', 1, 100, 'llama3.3'],
  ['OLLAMA_BASE_URL', 'models', 'url', undefined, undefined, 'http://localhost:11434'],
  ['OLLAMA_NUM_CTX', 'models', 'int', 512, 1048576, 32768],
  ['OLLAMA_TIMEOUT_MS', 'models', 'int', 1000, 3600000, 300000],
  ['CAREER_OPS_MODEL', 'models', 'string', 1, 100, undefined],
  ['OPENROUTER_TIMEOUT_MS', 'models', 'int', 1000, 2147483647, 120000],
];
deepEqual(SETTINGS.filter(s => s.kind === 'env').map(s => [s.id, s.group, s.type, s.min, s.max, s.default]), SPEC, 'every env row has the spec table\'s group, type, bounds and default');

deepEqual(validateSetting(settingById('OLLAMA_BASE_URL'), 'http://user:pw@host:11434').ok, false, 'an Ollama URL with credentials');
deepEqual(validateSetting(settingById('OLLAMA_BASE_URL'), 'http://localhost:11434'), { ok: true, value: 'http://localhost:11434' }, 'the default Ollama URL is valid');
deepEqual(validateSetting(settingById('OLLAMA_NUM_CTX'), 0).ok, false, 'a zero Ollama context window');

const RANGE = 'must be a whole number from 1 to 50';
deepEqual(validateSetting(conc, '4'), { ok: true, value: 4 }, 'int from a digit string');
deepEqual(validateSetting(conc, 4), { ok: true, value: 4 }, 'int from a number');
deepEqual(validateSetting(conc, 0), { ok: false, error: RANGE }, 'int below min');
deepEqual(validateSetting(conc, 51), { ok: false, error: RANGE }, 'int above max');
deepEqual(validateSetting(conc, 4.5), { ok: false, error: RANGE }, 'int rejects a fraction');
deepEqual(validateSetting(conc, '4abc'), { ok: false, error: RANGE }, 'int rejects trailing text');
deepEqual(validateSetting(conc, true), { ok: false, error: RANGE }, 'int rejects a boolean');
deepEqual(validateSetting(settingById('CAREER_OPS_HTTP_CACHE'), 'yes'), { ok: false, error: 'must be on or off' }, 'bool accepts only true and false');
deepEqual(validateSetting(settingById('CAREER_OPS_HTTP_CACHE'), false), { ok: true, value: false }, 'bool false');
deepEqual(validateSetting(settingById('CAREER_OPS_RANK_CLI'), 'hermes').ok, false, 'hermes is not a ranker binary');
deepEqual(validateSetting(settingById('CAREER_OPS_RANK_CLI'), 'antigravity').ok, false, 'antigravity is not a binary name (agy is)');
deepEqual(validateSetting(settingById('CAREER_OPS_RANK_CLI'), 'gemini').ok, false, 'gemini is not a ranker binary');
deepEqual(validateSetting(settingById('CAREER_OPS_RANK_CLI'), 'agy'), { ok: true, value: 'agy' }, 'agy is');
deepEqual(validateSetting(settingById('PUBLISH_URL'), 'https://cv.example.com/'), { ok: true, value: 'https://cv.example.com/' }, 'an https URL');
deepEqual(validateSetting(settingById('PUBLISH_URL'), 'https://user:pw@cv.example.com'), { ok: false, error: 'must be an https URL without credentials (http only for this machine)' }, 'a URL with credentials');
deepEqual(validateSetting(settingById('PUBLISH_URL'), 'ftp://cv.example.com').ok, false, 'an ftp URL');
deepEqual(validateSetting(settingById('PUBLISH_URL'), 'not a url').ok, false, 'not a URL');
for (const url of ['https://cv.example.com/#x', 'https://cv.example.com?a=1', 'https://cv.example.com/a b', 'https://cv.example.com/?'])
  deepEqual(validateSetting(settingById('PUBLISH_URL'), url).ok, false, `a base URL a reader cannot append a path to: ${url}`);
deepEqual(validateSetting(settingById('PUBLISH_URL'), 'http://localhost:8787/base'), { ok: true, value: 'http://localhost:8787/base' }, 'http on this machine, with a path');
deepEqual(validateSetting(settingById('PUBLISH_URL'), 'http://127.0.0.1:8787').ok, true, 'http on the loopback address');
deepEqual(validateSetting(settingById('PUBLISH_URL'), 'http://[::1]:8787').ok, true, 'http on the IPv6 loopback address');
for (const url of ['http://cv.example.com', 'http://localhost.example.com', 'http://192.168.1.5:8787', 'http://app.localhost:8787'])
  deepEqual(validateSetting(settingById('PUBLISH_URL'), url).ok, false, `plain http that leaves this machine: ${url}`);
deepEqual(validateSetting(settingById('USAJOBS_USER_AGENT'), 'someone@例え.jp').ok, false, 'an env string a header cannot carry');
deepEqual(validateSetting(settingById('USAJOBS_USER_AGENT'), 'a\nb'), { ok: false, error: 'must be 3 to 200 characters on one line' }, 'a string with a newline');
deepEqual(validateSetting(settingById('USAJOBS_USER_AGENT'), '  someone@example.com '), { ok: true, value: 'someone@example.com' }, 'a string is trimmed');
deepEqual(validateSetting(settingById('USAJOBS_USER_AGENT'), 'ab').ok, false, 'a string below min length');
deepEqual(validateSetting({ type: 'number', min: 0, max: 5 }, '4.2'), { ok: true, value: 4.2 }, 'number from a string');
deepEqual(validateSetting({ type: 'number', min: 0, max: 5 }, 6), { ok: false, error: 'must be a number from 0 to 5' }, 'number above max');
deepEqual(validateSetting({ type: 'list', maxItems: 2, values: ['a', 'b'] }, ['a']), { ok: true, value: ['a'] }, 'list of enum values');
deepEqual(validateSetting({ type: 'list', maxItems: 2, values: ['a', 'b'] }, ['c']), { ok: false, error: 'must be a list of up to 2 entries' }, 'list with an unknown value');
deepEqual(validateSetting({ type: 'list', maxItems: 2, min: 1, max: 80 }, ['x', 'y', 'z']).ok, false, 'list over maxItems');
deepEqual(validateSetting({ type: 'list', maxItems: 2, min: 1, max: 80 }, [' x ']), { ok: true, value: ['x'] }, 'list of strings, trimmed');

ok(envString(settingById('CAREER_OPS_HTTP_CACHE'), false) === '0' && envString(settingById('CAREER_OPS_HTTP_CACHE'), true) === '1', 'a bool is written as 1 or 0');
ok(envString(conc, 4) === '4', 'an int is written as its digits');
ok(settingById('CAREER_OPS_HTTP_CACHE').on === 'nonzero' && settingById('CAREER_OPS_BROWSER_AUTODETECT').on === 'words', 'each bool names how its reader parses it');
deepEqual(settingPath(conc), [], 'an env row has no path');
deepEqual(settingPath({ kind: 'profile', id: 'profile:cv.max_pages' }), ['cv', 'max_pages'], 'a profile row has its key path');

// The profile.yml and portals.yml rows, verbatim from the spec's two file-backed tables.
const MAX = Number.MAX_SAFE_INTEGER;
const FILE_SPEC = [
  ['profile:spend_tier', 'profile', 'enum', undefined, undefined, 'standard'],
  ['profile:auto_pdf_score_threshold', 'profile', 'number', 0, 5, 3],
  ['profile:pipeline.auto_evaluate_daily_cap', 'profile', 'int', 0, 500, 10],
  ['profile:language.output', 'profile', 'string', 2, 64, 'en'],
  ['profile:language.modes_dir', 'profile', 'string', 5, 64, 'modes'],
  ['profile:page_format', 'profile', 'enum', undefined, undefined, 'letter'],
  ['profile:cv.output_format', 'profile', 'enum', undefined, undefined, 'html'],
  ['profile:cv.template', 'profile', 'string', 1, 64, undefined],
  ['profile:cv.max_pages', 'profile', 'int', 1, 10, 2],
  ['profile:cv.strict_pages', 'profile', 'bool', undefined, undefined, false],
  ['portals:max_posting_age_days', 'scanner', 'int', 0, 3650, 0],
  ['portals:scan_history.recheck_after_days', 'scanner', 'int', 0, 3650, undefined],
  ['portals:skip_tiers', 'scanner', 'list', undefined, undefined, undefined],
  ['portals:title_filter.negative', 'scanner', 'list', 1, 80, undefined],
  ['portals:location_filter.block', 'scanner', 'list', 1, 80, undefined],
  ['portals:salary_filter.min', 'scanner', 'number', 0, MAX, undefined],
  ['portals:salary_filter.max', 'scanner', 'number', 0, MAX, undefined],
  ['portals:salary_filter.currency', 'scanner', 'string', 3, 3, undefined],
  ['portals:visa_filter.enabled', 'scanner', 'bool', undefined, undefined, false],
  ['portals:experience_filter.enabled', 'scanner', 'bool', undefined, undefined, false],
];
const fileRows = SETTINGS.filter(s => s.kind === 'profile' || s.kind === 'portals');
deepEqual(fileRows.map(s => [s.id, s.group, s.type, s.min, s.max, s.default]), FILE_SPEC, 'every profile and portals row has the spec table\'s group, type, bounds and default');
ok(fileRows.every(s => s.kind === s.id.slice(0, s.id.indexOf(':'))), 'a file row\'s kind is its id prefix');
deepEqual(settingById('profile:auto_pdf_score_threshold').step, 0.1, 'the PDF threshold steps by 0.1');
deepEqual(settingById('profile:spend_tier').values, ['economy', 'standard', 'premium'], 'spend tiers');
deepEqual(settingById('profile:page_format').values, ['letter', 'a4', 'auto'], 'page formats');
deepEqual(settingById('profile:cv.output_format').values, ['html', 'latex', 'text'], 'CV output formats');
deepEqual([settingById('portals:skip_tiers').values, settingById('portals:skip_tiers').maxItems], [['intern', 'entry', 'mid', 'senior'], 4], 'skip tiers');
ok(['portals:title_filter.negative', 'portals:location_filter.block'].every(id => settingById(id).maxItems === 200), 'keyword lists hold at most 200 entries');

deepEqual(settingPath(settingById('profile:pipeline.auto_evaluate_daily_cap')), ['pipeline', 'auto_evaluate_daily_cap'], 'a profile id\'s path');
deepEqual(validateSetting(settingById('profile:spend_tier'), 'cheap'), { ok: false, error: 'must be one of: economy, standard, premium' }, 'an unknown spend tier');
deepEqual(validateSetting(settingById('portals:skip_tiers'), ['intern']), { ok: true, value: ['intern'] }, 'a known tier');
deepEqual(validateSetting(settingById('portals:skip_tiers'), ['boss']).ok, false, 'an unknown tier');
deepEqual(validateSetting(settingById('portals:salary_filter.currency'), 'USD'), { ok: true, value: 'USD' }, 'a currency code');
deepEqual(validateSetting(settingById('portals:salary_filter.currency'), 'usd').ok, false, 'a lowercase currency code');
deepEqual(validateSetting(settingById('portals:salary_filter.currency'), 'DOLLARS').ok, false, 'a currency name');
deepEqual(validateSetting(settingById('portals:salary_filter.min'), 12000000), { ok: true, value: 12000000 }, 'a salary in a currency with large figures');
deepEqual(validateSetting(settingById('profile:cv.template'), 'two-column'), { ok: true, value: 'two-column' }, 'a kebab-case template name');
deepEqual(validateSetting(settingById('profile:cv.template'), 'Two Column').ok, false, 'a template name that is not kebab-case');
deepEqual(validateSetting(settingById('profile:language.modes_dir'), 'modes/de'), { ok: true, value: 'modes/de' }, 'a market modes dir');
deepEqual(validateSetting(settingById('profile:language.modes_dir'), '../etc').ok, false, 'a modes dir outside modes/');
deepEqual(validateSetting(settingById('profile:language.output'), 'ja'), { ok: true, value: 'ja' }, 'an output language');
