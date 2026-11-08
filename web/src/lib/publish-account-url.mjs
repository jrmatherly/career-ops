import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/**
 * The publish service's account page, where keys are minted and revoked:
 * `${PUBLISH_URL}/account`, with PUBLISH_URL from the environment first and the
 * data root's .env second, the order publish/share.mjs reads it. Null when the
 * URL is unset or not https. Only PUBLISH_URL is taken; the key is never read.
 *
 * @param {{ env: Record<string, string | undefined>, dataRoot: string }} input
 * @returns {string | null}
 */
export function publishAccountUrl({ env, dataRoot }) {
  const base = env.PUBLISH_URL || dotenv(dataRoot).PUBLISH_URL;
  if (!base || !URL.canParse(base) || new URL(base).protocol !== "https:") return null;
  return `${base.replace(/\/+$/, "")}/account`;
}

function dotenv(dataRoot) {
  try {
    // The trailing newline is the same Node 22.13 parseEnv fix share.mjs applies.
    return parseEnv(fs.readFileSync(path.join(dataRoot, ".env"), "utf8") + "\n");
  } catch {
    return {};
  }
}
