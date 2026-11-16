// Masks key-shaped strings in text a failed run saves, keeping the label or
// prefix so a reader can still tell what kind of credential was there. A value
// must hold a digit, so prose after "key" or "token" ("API key missing") stays.
const MARK = "[masked]";

const PREFIXED = /\b(sk-ant-|sk-|gh[pousr]_|github_pat_|AIza|xox[abprs]-)(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{12,}/g;

const LABELLED = /(key|token|secret|password|bearer|authorization)(["']?\s*[:=]\s*["']?|\s+)((?:bearer|basic)\s+)?(?=[A-Za-z0-9._~+/=-]*\d)[A-Za-z0-9._~+/=-]{16,}/gi;

/** @param {string | undefined} s */
export function maskSecrets(s) {
  return (s || "")
    .replace(PREFIXED, `$1${MARK}`)
    .replace(LABELLED, `$1$2$3${MARK}`);
}
