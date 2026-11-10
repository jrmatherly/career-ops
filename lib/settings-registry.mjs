// lib/settings-registry.mjs — the settings a user can see or change from the
// dashboard: what each is, its bounds, and where its value lives.
//
// Imports nothing, so doctor.mjs and the env overlay can load it when
// node_modules is missing.

/**
 * @typedef {'env'|'profile'|'portals'|'secret'|'readonly'} SettingKind
 * @typedef {'int'|'number'|'bool'|'enum'|'string'|'url'|'list'} SettingType
 * @typedef {object} Setting
 * @property {string} id            env variable name, or `profile:a.b` / `portals:a.b`
 * @property {SettingKind} kind
 * @property {string} group
 * @property {string} label
 * @property {string} help
 * @property {SettingType} [type]
 * @property {number} [min]         lowest value; shortest length for a string or list entry
 * @property {number} [max]
 * @property {number} [step]
 * @property {string[]} [values]
 * @property {number} [maxItems]
 * @property {RegExp} [pattern]    a string must match this as well
 * @property {string} [format]     the error when it does not
 * @property {number|boolean|string} [default]
 * @property {boolean} [dotenv]     the reader loads the data root .env before reading it
 * @property {'nonzero'|'words'} [on]  how the reader turns an env string into a bool
 * @property {'value'|'set'|'origin'} [display]  what a read-only row may show
 */

export const GROUPS = [
  { id: 'scanner', label: 'Scanner and network' },
  { id: 'automation', label: 'Automation and evaluation' },
  { id: 'profile', label: 'Profile preferences' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'models', label: 'Model runners' },
  { id: 'keys', label: 'Keys and tokens' },
  { id: 'deployment', label: 'Deployment' },
];

// A copy of AGENT_CLIS: lib/agent-cli.mjs imports dotenv, which this file may not.
const AGENT_CLI_IDS = ['claude', 'codex', 'opencode', 'pi', 'antigravity', 'grok', 'qwen', 'kimi', 'copilot', 'gemini', 'hermes', 'omp'];

// Binary names, not CLI ids: the ranker runs a name it does not know with none of its tool-denial flags.
const RANK_CLI_BINS = ['claude', 'opencode', 'codex', 'copilot', 'qwen', 'agy', 'grok', 'pi', 'omp'];

const env = (group, id, label, help, rest) => ({ id, kind: 'env', group, label, help, ...rest });
const profile = (id, label, help, rest) => ({ id: `profile:${id}`, kind: 'profile', group: 'profile', label, help, ...rest });
const portals = (id, label, help, rest) => ({ id: `portals:${id}`, kind: 'portals', group: 'scanner', label, help, ...rest });
const keywords = { type: 'list', min: 1, max: 80, maxItems: 200 };
const salary = { type: 'number', min: 0, max: Number.MAX_SAFE_INTEGER };
const secret = (id, label, help) => ({ id, kind: 'secret', group: 'keys', label, help });
const readonly = (id, display, label, help) => ({ id, kind: 'readonly', group: 'deployment', label, help, display });

/** @type {Setting[]} */
export const SETTINGS = [
  env('scanner', 'CAREER_OPS_SCAN_CONCURRENCY', 'Scan concurrency', 'How many companies a scan fetches at once.', { type: 'int', min: 1, max: 50, default: 10, dotenv: true }),
  env('scanner', 'CAREER_OPS_SCAN_HOST_CONCURRENCY', 'Scan concurrency per host', 'How many companies a scan fetches at once from one hostname.', { type: 'int', min: 1, max: 50, default: 10, dotenv: true }),
  env('scanner', 'CAREER_OPS_HTTP_TIMEOUT_MS', 'Request timeout (ms)', 'How long a scan waits for one response before giving up.', { type: 'int', min: 1000, max: 120000, default: 10000, dotenv: true }),
  env('scanner', 'CAREER_OPS_HTTP_CACHE', 'Reuse recent downloads', 'A scan reuses a board response saved within the reuse window, and rechecks an older one instead of downloading it again.', { type: 'bool', default: true, dotenv: true, on: 'nonzero' }),
  env('scanner', 'CAREER_OPS_HTTP_CACHE_TTL_MS', 'Download reuse window (ms)', 'How long a saved board response counts as fresh. 0 means never.', { type: 'int', min: 0, max: 86400000, default: 900000, dotenv: true }),
  env('scanner', 'CAREER_OPS_DNS_LOOKUPS_PER_MIN', 'DNS lookups per minute', 'The most hostname lookups a scan makes in a minute. 0 turns pacing off.', { type: 'int', min: 0, max: 10000, default: 400 }),
  env('scanner', 'CAREER_OPS_BROWSER_AUTODETECT', 'Use an installed browser', 'Pick an installed Brave, Chrome, Edge or Chromium instead of the bundled Chromium.', { type: 'bool', default: false, dotenv: true, on: 'words' }),

  env('automation', 'CAREER_OPS_CLI', 'Agent CLI', 'The agent CLI that doctor reports and pipeline ranking prefers.', { type: 'enum', values: AGENT_CLI_IDS, dotenv: true }),
  env('automation', 'CAREER_OPS_RANK_CLI', 'Ranking CLI', 'The CLI binary that ranks the pipeline in batch.', { type: 'enum', values: RANK_CLI_BINS }),
  env('automation', 'CAREER_OPS_RANK_TIMEOUT_MS', 'Ranking timeout (ms)', 'How long one ranking call may run.', { type: 'int', min: 10000, max: 1800000, default: 180000 }),

  profile('spend_tier', 'Spend tier', 'How capable, and how costly, a model evaluations use.', { type: 'enum', values: ['economy', 'standard', 'premium'], default: 'standard' }),
  profile('auto_pdf_score_threshold', 'Score for an automatic CV', 'The pipeline makes a tailored CV for an offer scoring at least this. 0 means every offer.', { type: 'number', min: 0, max: 5, step: 0.1, default: 3 }),
  profile('pipeline.auto_evaluate_daily_cap', 'Automatic evaluations per day', 'The most evaluations unattended runs start in one day (UTC).', { type: 'int', min: 0, max: 500, default: 10 }),
  profile('language.output', 'Output language', 'The language of reports, CVs, letters and other text written for you, such as en or de.', { type: 'string', min: 2, max: 64, default: 'en' }),
  profile('language.modes_dir', 'Market', 'The job market whose vocabulary and rules evaluations use.', { type: 'string', min: 5, max: 64, pattern: /^modes(\/[A-Za-z0-9_-]+)?$/, format: 'must be modes or modes/<name>', default: 'modes' }),
  profile('page_format', 'Paper size', 'The page size of CVs and cover letters. auto picks it from your country.', { type: 'enum', values: ['letter', 'a4', 'auto'], default: 'letter' }),
  profile('cv.output_format', 'CV format', 'Which kind of CV the pipeline makes.', { type: 'enum', values: ['html', 'latex', 'text'], default: 'html' }),
  profile('cv.template', 'CV template', 'The name of a template under templates/ or data/templates/, such as modern.', { type: 'string', min: 1, max: 64, pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/, format: 'must be lowercase letters and digits joined by hyphens' }),
  profile('cv.max_pages', 'CV page limit', 'The most pages a CV may run to.', { type: 'int', min: 1, max: 10, default: 2 }),
  profile('cv.strict_pages', 'Fail a CV over the limit', 'A CV longer than the page limit fails instead of only warning.', { type: 'bool', default: false }),

  portals('max_posting_age_days', 'Skip postings older than (days)', 'A scan skips a posting whose date is older than this. 0 turns the filter off.', { type: 'int', min: 0, max: 3650, default: 0 }),
  portals('scan_history.recheck_after_days', 'Look at a seen posting again after (days)', 'A posting a scan has already seen comes back after this many days. It never comes back while portals.yml has no such line.', { type: 'int', min: 0, max: 3650 }),
  portals('skip_tiers', 'Skip seniority levels', 'A scan skips postings whose title reads as one of these levels.', { type: 'list', values: ['intern', 'entry', 'mid', 'senior'], maxItems: 4 }),
  portals('title_filter.negative', 'Titles to skip', 'A scan skips a posting whose title contains one of these words.', keywords),
  portals('location_filter.block', 'Places to skip', 'A scan skips a posting whose location matches one of these, unless an always-allowed place matches too.', keywords),
  portals('salary_filter.min', 'Minimum salary', 'A scan skips a posting whose stated annual salary tops out below this.', salary),
  portals('salary_filter.max', 'Maximum salary', 'A scan skips a posting whose stated salary starts above this. 0 means no cap.', salary),
  portals('salary_filter.currency', 'Salary currency', 'The currency of the salary bounds, such as USD. A posting that states another currency is skipped.', { type: 'string', min: 3, max: 3, pattern: /^[A-Z]{3}$/, format: 'must be a three-letter currency code in capitals, such as USD' }),
  portals('visa_filter.enabled', 'Skip postings that refuse sponsorship', 'A scan skips a posting that says it will not sponsor a work visa.', { type: 'bool', default: false }),
  portals('experience_filter.enabled', 'Check required years of experience', 'A scan reads each new posting for a stated minimum of years above yours. Needs your years of experience in the profile.', { type: 'bool', default: false }),

  env('integrations', 'PUBLISH_URL', 'CV publish service URL', 'The address of the service that publishes shared CVs.', { type: 'url', dotenv: true }),
  env('integrations', 'USAJOBS_USER_AGENT', 'USAJOBS account email', 'The email registered with your USAJOBS API key, sent as the User-Agent.', { type: 'string', min: 3, max: 200, dotenv: true }),
  env('integrations', 'NOTION_PARENT_PAGE_ID', 'Notion parent page ID', 'The Notion page the Notion plugin works under.', { type: 'string', min: 1, max: 100, dotenv: true }),

  secret('GEMINI_API_KEY', 'Gemini API key', 'Used by the Gemini evaluator.'),
  secret('OPENAI_API_KEY', 'OpenAI API key', 'Used for any OpenAI-compatible endpoint.'),
  secret('OPENROUTER_API_KEY', 'OpenRouter API key', 'Used by the OpenRouter evaluator.'),
  secret('ANTHROPIC_API_KEY', 'Anthropic API key', 'Read by the agent CLI. career-ops only checks whether it is set.'),
  secret('ANTHROPIC_AUTH_TOKEN', 'Anthropic auth token', 'Read by the agent CLI. career-ops only checks whether it is set.'),
  secret('CLAUDE_CODE_OAUTH_TOKEN', 'Claude Code OAuth token', 'The Claude subscription token. career-ops only checks whether it is set.'),
  secret('PUBLISH_API_KEY', 'CV publish API key', 'The key minted on the publish service account page.'),
  secret('APIFY_TOKEN', 'Apify token', 'Used by the Apify provider.'),
  secret('USAJOBS_API_KEY', 'USAJOBS API key', 'Used by the USAJOBS plugin.'),
  secret('NOTION_ACCESS_TOKEN', 'Notion access token', 'Used by the Notion plugin.'),
  secret('GMAIL_CLIENT_ID', 'Gmail client ID', 'Used by the Gmail plugin.'),
  secret('GMAIL_CLIENT_SECRET', 'Gmail client secret', 'Used by the Gmail plugin.'),
  secret('GMAIL_REFRESH_TOKEN', 'Gmail refresh token', 'Used by the Gmail plugin.'),
  secret('H1B_API_TOKEN', 'H-1B data token', 'Used by the H-1B sponsor plugin.'),

  readonly('CAREER_OPS_ROOT', 'value', 'Data folder', 'Where your CV, profile, tracker and reports live.'),
  readonly('CAREER_OPS_SCHEDULER', 'value', 'Scheduler', 'Who owns the schedule. Unset means this machine; external means another system calls the dashboard.'),
  readonly('CAREER_OPS_WEB_ALLOWED_HOSTS', 'value', 'Allowed hosts', 'Host names the dashboard answers to. Unset means this machine only.'),
  readonly('CAREER_OPS_ALLOWED_ORIGINS', 'value', 'Allowed origins', 'Extra origins, such as a browser extension, that the dashboard accepts requests from.'),
  readonly('ANTHROPIC_BASE_URL', 'origin', 'Anthropic base URL', 'The gateway the agent CLI sends requests to.'),
  readonly('PRIVACY_GUARD', 'set', 'Privacy guard variable', 'Whether PRIVACY_GUARD is set. Only the value off, together with a bypass token, turns off the guard that keeps personal data out of model calls.'),
  readonly('CAREER_OPS_AUTO_EVALUATE_LOCAL', 'set', 'Unattended evaluation on this machine', 'Set to 1 to let unattended runs evaluate new postings on this machine.'),
  readonly('CAREER_OPS_CONNECTION_SCOPE', 'value', 'Connection scope', 'Each job board gets its own connections, so a stalled board cannot hold up the others. Only 0 turns this off.'),
  readonly('CAREER_OPS_TRUST_PROXY_EGRESS', 'set', 'Scan through a proxy', 'Set to 1 to let scans go through the proxy named in HTTP_PROXY or HTTPS_PROXY.'),
  readonly('OLLAMA_ALLOW_REMOTE', 'set', 'Remote Ollama', 'Set to 1 to let your CV and job descriptions go to an Ollama server on another machine.'),
];

const BY_ID = new Map(SETTINGS.map((s) => [s.id, s]));

/** @param {string} id @returns {Setting|undefined} */
export const settingById = (id) => BY_ID.get(id);

const bad = (error) => ({ ok: false, error });
const good = (value) => ({ ok: true, value });

function oneLine(raw, min, max) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  // Control characters would let a saved value break out of an env line or a header.
  if (/[\u0000-\u001f\u007f]/.test(text) || text.length < min || text.length > max) return null;
  return text;
}

function numberIn(setting, raw, whole) {
  const n = typeof raw === 'number' ? raw
    : typeof raw === 'string' && (whole ? /^\d+$/ : /^-?\d+(\.\d+)?$/).test(raw.trim()) ? Number(raw) : NaN;
  if (!Number.isFinite(n) || (whole && !Number.isInteger(n)) || n < setting.min || n > setting.max) {
    return bad(`must be a ${whole ? 'whole number' : 'number'} from ${setting.min} to ${setting.max}`);
  }
  return good(n);
}

/**
 * Check a raw value against a setting's type and bounds.
 *
 * @param {Setting} setting
 * @param {unknown} raw
 * @returns {{ ok: true, value: number|boolean|string|string[] } | { ok: false, error: string }}
 */
export function validateSetting(setting, raw) {
  switch (setting.type) {
    case 'int': return numberIn(setting, raw, true);
    case 'number': return numberIn(setting, raw, false);
    case 'bool': return typeof raw === 'boolean' ? good(raw) : bad('must be on or off');
    case 'enum': return setting.values.includes(raw) ? good(raw) : bad(`must be one of: ${setting.values.join(', ')}`);
    case 'string': {
      let text = oneLine(raw, setting.min, setting.max);
      // An env string can end up in an HTTP header, which carries printable ASCII only.
      if (setting.kind === 'env' && text !== null && /[^\x20-\x7e]/.test(text)) text = null;
      if (text === null) return bad(`must be ${setting.min} to ${setting.max} characters on one line`);
      return setting.pattern && !setting.pattern.test(text) ? bad(setting.format) : good(text);
    }
    case 'url': {
      const text = oneLine(raw, 1, 2000);
      const url = text === null ? null : URL.parse(text);
      // Readers append a path to this, so a query or fragment would swallow it.
      // A key is sent to this address, so plain http is allowed only when it never leaves this machine.
      const local = url && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
      const usable = url && (url.protocol === 'https:' || (url.protocol === 'http:' && local)) && !url.username && !url.password
        && !url.search && !url.hash && !/[\s?#]/.test(text);
      return usable ? good(text) : bad('must be an https URL without credentials (http only for this machine)');
    }
    case 'list': {
      const error = bad(`must be a list of up to ${setting.maxItems} entries`);
      if (!Array.isArray(raw) || raw.length > setting.maxItems) return error;
      const items = raw.map((item) => (setting.values ? (setting.values.includes(item) ? item : null) : oneLine(item, setting.min, setting.max)));
      return items.includes(null) ? error : good(items);
    }
    default: return bad('cannot be changed here');
  }
}

/**
 * The string an env reader expects for a validated value.
 *
 * @param {Setting} setting
 * @param {number|boolean|string} value
 */
export function envString(setting, value) {
  return typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
}

/**
 * The key path of a file-backed setting (`profile:cv.max_pages` is `['cv', 'max_pages']`).
 *
 * @param {Setting} setting
 * @returns {string[]}
 */
export function settingPath(setting) {
  if (setting.kind !== 'profile' && setting.kind !== 'portals') return [];
  return setting.id.slice(setting.id.indexOf(':') + 1).split('.');
}
