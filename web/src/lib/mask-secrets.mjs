// Masks key-shaped strings in text a saved run writes, keeping the label or
// prefix so a reader can still tell what kind of credential was there. A value
// must hold a digit, so prose after "key" or "token" ("API key missing") stays.
// The digit is checked in the replacer, not in a lookahead: a lookahead re-scans
// the rest of the run at every candidate start, which is quadratic on "key=key=…".
const MARK = "[masked]";

const PREFIXED = /\b(sk-ant-|sk-|gh[pousr]_|github_pat_|AIza|xox[abprs]-)([A-Za-z0-9_-]{12,})/g;

const AWS_KEY_ID = /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g;

const JWT_RUN = /\beyJ[\w.-]+/g;
const JWT = /^eyJ[\w-]*\.[\w-]+\.[\w-]+/;

const URL_PASSWORD = /(?<![a-z0-9+.-])([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s/@]+@/gi;

// A label is a whole word, the tail of an identifier (OPENROUTER_API_KEY, api_key) or
// a capitalised camelCase tail (accessToken), never the end of a lowercase word
// ("monkey"). Case is spelled out per letter because an i flag would make the
// camelCase boundary's [a-z] and [A-Z] match either case. The separator stays on one line.
const ci = (w) => w.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`);
const LABEL_WORDS = ["api[_-]?key", "key", "token", "secret", "password", "passwd", "pwd", "credentials?", "cookie", "bearer", "authorization"];
const LABEL = `(?<![A-Za-z0-9])(?:${LABEL_WORDS.map(ci).join("|")})|(?<=[a-z0-9])(?:${LABEL_WORDS.map((w) => w[0].toUpperCase() + ci(w.slice(1))).join("|")})`;
const LABELLED = new RegExp(`(${LABEL})(["']?[ \\t]*[:=][ \\t]*["']?|[ \\t]+)((?:${ci("bearer")}|${ci("basic")})[ \\t]+)?([A-Za-z0-9._~+/=-]{16,})`, "g");

// A password is short and often has no digit, so one assigned with : or = is masked
// whatever it holds. Prose after the bare word ("password required") stays.
const PASSWORD_WORDS = ["password", "passwd", "pwd"];
const PASSWORD_LABEL = `(?<![A-Za-z0-9])(?:${PASSWORD_WORDS.map(ci).join("|")})|(?<=[a-z0-9])(?:${PASSWORD_WORDS.map((w) => w[0].toUpperCase() + ci(w.slice(1))).join("|")})`;
const PASSWORD_ASSIGNED = new RegExp(`((?:${PASSWORD_LABEL})["']?[ \\t]*[:=][ \\t]*["']?)([^\\s"']{4,})`, "g");

// "/home/me/.cache/…" is a path; "/9j4AAQ…" with no second slash is base64.
const isPath = (s) => /^\/[^/]+\//.test(s);

const hasDigit = (s) => /\d/.test(s);

/** @param {string | undefined} s */
export function maskSecrets(s) {
  return (s || "")
    .replace(URL_PASSWORD, `$1${MARK}@`)
    .replace(JWT_RUN, (run) => {
      const jwt = run.match(JWT);
      return jwt ? `eyJ${MARK}${run.slice(jwt[0].length)}` : run;
    })
    .replace(AWS_KEY_ID, `$1${MARK}`)
    .replace(PREFIXED, (m, prefix, value) => (hasDigit(value) ? prefix + MARK : m))
    .replace(LABELLED, (m, label, sep, scheme = "", value) => (hasDigit(value) && !isPath(value) ? label + sep + scheme + MARK : m))
    .replace(PASSWORD_ASSIGNED, `$1${MARK}`);
}
