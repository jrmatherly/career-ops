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

// A label is a whole word or the tail of an identifier (OPENROUTER_API_KEY, api_key),
// never the end of a word ("monkey"). The separator stays on one line, and a value
// starting with "/" is a path.
const LABELLED = /(?<![A-Za-z0-9])(api[_-]?key|key|token|secret|password|passwd|pwd|credentials?|cookie|bearer|authorization)(["']?[ \t]*[:=][ \t]*["']?|[ \t]+)((?:bearer|basic)[ \t]+)?(?!\/)([A-Za-z0-9._~+/=-]{16,})/gi;

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
    .replace(LABELLED, (m, label, sep, scheme = "", value) => (hasDigit(value) ? label + sep + scheme + MARK : m));
}
