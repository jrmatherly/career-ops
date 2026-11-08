import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/**
 * The publish service's account page, where keys are minted and revoked:
 * `${PUBLISH_URL}/account`, with PUBLISH_URL from the environment first and the
 * data root's .env second, the order publish/share.mjs reads it. Null when the
 * URL is unset, unparsable, not https or carries credentials. Only PUBLISH_URL
 * is used; the key is never returned or logged.
 *
 * @param {{ env: Record<string, string | undefined>, dataRoot: string }} input
 * @returns {string | null}
 */
export function publishAccountUrl({ env, dataRoot }) {
  const base = (env.PUBLISH_URL || dotenv(dataRoot).PUBLISH_URL || "").trim();
  if (!base) return null;
  // A whitespace or control character is a malformed .env line (an unterminated quote can swallow the next one).
  const url = /[\s\x00-\x1f]/.test(base) ? null : URL.parse(base);
  const why = !url ? "is not a URL" : url.protocol !== "https:" ? "is not https" : url.username || url.password ? "carries credentials" : null;
  if (why) {
    console.error(`shares: the Manage publish keys link is hidden because PUBLISH_URL ${why}`);
    return null;
  }
  url.search = "";
  url.hash = "";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/account`;
  return url.href;
}

function dotenv(dataRoot) {
  const file = path.join(dataRoot, ".env");
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    if (code !== "ENOENT") console.error(`shares: ${file} could not be read: ${code}`);
    return {};
  }
  // Node 22.13's parseEnv keeps an inline comment on a last line with no newline.
  return parseEnv(`${text}\n`);
}
