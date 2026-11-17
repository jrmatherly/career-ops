// Masks secrets in text a saved run writes, in two layers.
//
// First by value: the server holds secrets a run could print (its own env and
// the data root .env the scripts load). A value of 8 or more characters, under
// a variable that is listed or whose name says secret, is replaced wherever it
// occurs with [masked:NAME], whatever it looks like. A location-style setting
// (a path or URL under a name ending in PATH, FILE, URL and the like) is skipped.
//
// Then by pattern, for secrets the server does not hold, keeping the label or
// prefix so a reader can still tell what kind of credential was there. A value
// must hold a digit, so prose after "key" or "token" ("API key missing") stays,
// unless a Bearer or Basic scheme names it as a credential. A password assigned
// with : or =, and the value after a command-line flag (--token x), are masked
// whatever they hold.
// The digit is checked in the replacer, not in a lookahead: a lookahead re-scans
// the rest of the run at every candidate start, which is quadratic on "key=key=…".
const MARK = "[masked]";

/** The saved output's length. The client sends CUT_SLACK more, so the server masks before it cuts. */
export const SAVED_OUTPUT_MAX = 8000;
/** Context kept past a cut, so a label is masked with its value before the cut separates them. */
export const CUT_SLACK = 256;

const MIN_SECRET = 8;
const SECRET_NAME = /KEY|TOKEN|SECRET|PASSWORD|PASSWD/i;

/**
 * The name half of the rule, used by the tests: the variable's name says secret, or
 * `names` lists it. knownSecrets also skips a location-style setting and a value under 8 characters.
 * @param {string} name
 * @param {Iterable<string>} [names]
 */
export function isSecretName(name, names = []) {
  return SECRET_NAME.test(name) || [...names].includes(name);
}

// A name the rule matches is treated as a secret whatever its value looks like, with one
// exception: a path or a URL with no user info, under a name that says it is a location
// (API_KEY_FILE, KEYCLOAK_URL), holding no long token-like run. A base64 key can start with
// "/" and a webhook URL carries its secret in the path, so shape alone never exempts a value.
const LOCATION_NAME = /(?:PATH|FILE|DIR|URL|URI|ENDPOINT|HOST)$/i;
const SETTING_PATH = /^[~.]{0,2}\/[\w./-]*$/;
const SETTING_URL = /^[a-z][a-z0-9+.-]*:\/\/[^\s@]+$/i;
const TOKEN_RUN = /[A-Za-z0-9_-]{20,}/;
const isSetting = (name, value) => LOCATION_NAME.test(name) && (SETTING_PATH.test(value) || SETTING_URL.test(value)) && !TOKEN_RUN.test(value);

/**
 * The secret values in `envs`, as written and JSON-escaped and URL-encoded, longest first.
 * @param {Array<Record<string, string | undefined>>} envs
 * @param {Iterable<string>} [names] variables that are secret whatever their name or value
 * @returns {{ name: string, value: string }[]}
 */
export function knownSecrets(envs, names = []) {
  const listed = new Set(names);
  const byValue = new Map();
  for (const env of envs) {
    for (const [name, raw] of Object.entries(env)) {
      if (typeof raw !== "string") continue;
      // A secret mounted from a file often ends in a newline the run never prints.
      const value = raw.trim();
      if (value.length < MIN_SECRET || !(listed.has(name) || (SECRET_NAME.test(name) && !isSetting(name, value)))) continue;
      const forms = [value, JSON.stringify(value).slice(1, -1), value.isWellFormed() ? encodeURIComponent(value) : value];
      for (const form of forms) if (!byValue.has(form)) byValue.set(form, name);
    }
  }
  return [...byValue].map(([value, name]) => ({ name, value })).sort((a, b) => b.value.length - a.value.length);
}

/**
 * Every known value is found in `s` as given, and overlapping finds are masked as one.
 * @param {string} s
 * @param {{ name: string, value: string }[]} known
 */
function maskKnown(s, known) {
  if (!known.length) return s;
  const ends = new Uint32Array(s.length);
  const names = new Map();
  const found = (start, end, name) => {
    if (end > ends[start]) {
      ends[start] = end;
      names.set(start, name);
    }
  };
  const head = s.slice(0, MIN_SECRET);
  for (const { name, value } of known) {
    for (let i = s.indexOf(value); i !== -1; i = s.indexOf(value, i + 1)) found(i, i + value.length, name);
    // A cut through a secret leaves its tail at the start of the text.
    for (let i = value.indexOf(head, 1); head.length === MIN_SECRET && i !== -1; i = value.indexOf(head, i + 1)) {
      if (s.startsWith(value.slice(i))) {
        found(0, value.length - i, name);
        break;
      }
    }
  }
  let out = "";
  let from = 0;
  for (let i = 0; i < s.length; ) {
    if (!ends[i]) {
      i++;
      continue;
    }
    let end = ends[i];
    for (let j = i + 1; j < end; j++) end = Math.max(end, ends[j]);
    out += `${s.slice(from, i)}[masked:${names.get(i)}]`;
    from = i = end;
  }
  return out + s.slice(from);
}

const PREFIXED = /\b(sk-ant-|sk-|gh[pousr]_|github_pat_|glpat-|hf_|AIza|xox[abprs]-)([A-Za-z0-9_-]{12,})/g;

const AWS_KEY_ID = /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g;

const JWT_RUN = /\beyJ[\w.-]+/g;
const JWT = /^eyJ[\w-]*\.[\w-]+\.[\w-]+/;

// The host cannot hold an @, so the password runs to the last @ before the path.
const URL_PASSWORD = /(?<![a-z0-9+.-])([a-z][a-z0-9+.-]*:\/\/[^\s:/@]*:)(?!\[masked)[^\s/?#]*@/gi;

// A label is a whole word, the tail of an identifier (OPENROUTER_API_KEY, api_key) or
// a capitalised camelCase tail (accessToken), never the end of a lowercase word
// ("monkey"). Case is spelled out per letter because an i flag would make the
// camelCase boundary's [a-z] and [A-Z] match either case. The separator stays on one line.
const ci = (w) => w.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`);
const LABEL_WORDS = ["api[_-]?key", "key", "token", "secret", "password", "passwd", "pwd", "credentials?", "cookie", "bearer", "authorization"];
const LABEL = `(?<![A-Za-z0-9])(?:${LABEL_WORDS.map(ci).join("|")})|(?<=[a-z0-9])(?:${LABEL_WORDS.map((w) => w[0].toUpperCase() + ci(w.slice(1))).join("|")})`;
const LABELLED = new RegExp(`(${LABEL})(["']?[ \\t]*[:=][ \\t]*["']?|[ \\t]+)((?:${ci("bearer")}|${ci("basic")})[ \\t]+)?([A-Za-z0-9._~+/=-]{16,})`, "g");

// A password is short and often has no digit, so one assigned with : or = is masked
// whatever it holds, a quoted one to its closing quote. Prose after the bare word
// ("password required") stays. So does a path after the shell's own upper-case PWD=
// (PWD=/srv/app is a directory); a path after any other label or separator
// (password=/srv/app/data, pwd=/srv/app, PWD: /srv/app, db_pwd=/srv/app) is masked.
// A known value can be a label word (a variable holding "password"), so its mark
// labels what is assigned to it too. A quoted value runs past escaped quotes.
const PASSWORD_WORDS = ["password", "passwd", "pwd"];
const KNOWN_MARK = "\\[masked:\\w+\\]";
const PASSWORD_LABEL = `(?<![A-Za-z0-9])(?:${PASSWORD_WORDS.map(ci).join("|")})|(?<=[a-z0-9])(?:${PASSWORD_WORDS.map((w) => w[0].toUpperCase() + ci(w.slice(1))).join("|")})|${KNOWN_MARK}`;
const VALUE = `(?!\\[masked)("(?:[^"\\\\\\n]|\\\\.)*"?|'(?:[^'\\\\\\n]|\\\\.)*'?|[^\\s"']+)`;
const PASSWORD_ASSIGNED = new RegExp(`((?:${PASSWORD_LABEL})["']?[ \\t]*[:=][ \\t]*)${VALUE}`, "g");

// A command-line flag names its value: --password x, --api-key=x, --github-token x.
const FLAG = new RegExp(`((?<![\\w-])--[\\w-]{0,40}?(?:password|passwd|token|secret|api-?key|${KNOWN_MARK})(?:=|[ \\t]+))(?!--)${VALUE}`, "gi");

/** @param {string} label @param {string} value */
const maskValue = (label, value) => {
  const q = value[0];
  if (q !== '"' && q !== "'") return label + MARK;
  return label + q + MARK + (value.length > 1 && value.endsWith(q) ? q : "");
};

// An Authorization header names its value as a credential, however short.
const AUTH_SCHEME = /(authorization["']?[ \t]*[:=][ \t]*["']?(?:basic|bearer)[ \t]+)([A-Za-z0-9._~+/=-]{4,})/gi;

// "/home/me/.cache/…" is a path; "/9j4AAQ…" with no second slash is base64.
const isPath = (s) => /^\/[^/]+\//.test(s);

const hasDigit = (s) => /\d/.test(s);

/**
 * @param {string | undefined} s
 * @param {{ name: string, value: string }[]} [known] from knownSecrets
 */
export function maskSecrets(s, known = []) {
  return maskKnown(s || "", known)
    .replace(URL_PASSWORD, `$1${MARK}@`)
    .replace(JWT_RUN, (run) => {
      const jwt = run.match(JWT);
      return jwt ? `eyJ${MARK}${run.slice(jwt[0].length)}` : run;
    })
    .replace(AWS_KEY_ID, `$1${MARK}`)
    .replace(PREFIXED, (m, prefix, value) => (hasDigit(value) ? prefix + MARK : m))
    .replace(LABELLED, (m, label, sep, scheme = "", value) => ((scheme || hasDigit(value)) && !isPath(value) ? label + sep + scheme + MARK : m))
    // Only the shell's own PWD= holds a path. A password that looks like one, under db_pwd or any other label, is still a password.
    .replace(PASSWORD_ASSIGNED, (m, label, value, at, all) => (/^PWD=["']?$/.test(label) && !/[A-Za-z0-9_]/.test(all[at - 1] ?? "") && isPath(value.replace(/^["']|["']$/g, "")) ? m : maskValue(label, value)))
    .replace(FLAG, (m, label, value) => maskValue(label, value))
    .replace(AUTH_SCHEME, `$1${MARK}`);
}
