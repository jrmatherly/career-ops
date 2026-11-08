import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";

// The records publish/share.mjs writes to data/shares.json, plus the comments
// it pulls into data/share-feedback/<slug>.md. Read-only: publishing stays in
// the CLI: only publish/share.mjs uses the service key; the web never uses, returns or logs it.
export type Share = {
  readonly slug: string;
  readonly url: string;
  readonly source: string;
  readonly overlay: string;
  readonly hasPassword: boolean;
  readonly pulled: { readonly at: string; readonly views: number; readonly comments: number } | null;
  /** Reviewer text from the feedback file: third-party data, rendered as text only. */
  readonly feedback: string | null;
  /** False for a slug the CLI accepts but the route cannot pass as --slug (a leading dash); Pull all still refreshes it. */
  readonly pullable: boolean;
};

export type SharesData = { shares: Share[]; error: null } | { shares: []; error: string };

/**
 * What POST /api/shares/pull answers. `missing` lists shares the service no longer has (the CLI
 * exits 0 for those); `pulled` counts the shares it did answer for, so none answering reads as a
 * wrong PUBLISH_URL rather than as deleted shares.
 */
export type PullResponse = { ok: true; missing: string[]; pulled: number } | { error: string; code?: "core-script-missing" };

// The CLI's slug rule (publish/share.mjs slugOf): a key outside it cannot name a feedback file.
export const CLI_SLUG_RE = /^[a-z0-9-]{1,64}$/;
// The same rule minus a leading dash, so a slug the route passes as `--slug` can never read as a flag.
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

const obj = (v: unknown) => (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) => (Array.isArray(v) ? v.map(str) : []);

function toShare(slug: string, raw: unknown, feedbackDir: string): Share {
  const r = obj(raw);
  const source = obj(r.source);
  const hide = obj(r.hide);
  const pulled = obj(r.pulled);
  let feedback: string | null = null;
  try {
    feedback = fs.readFileSync(path.join(feedbackDir, `${slug}.md`), "utf8");
  } catch (err) {
    // ENOENT is the normal case (no pull yet); anything else is logged, since the row then shows a count with nothing behind it.
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") console.error(`shares: feedback for ${slug} could not be read: ${code}`);
  }
  return {
    slug,
    url: str(r.url),
    source: [str(source.kind), str(source.ref)].filter(Boolean).join(" "),
    overlay: [r.hideContacts === true && "contacts", ...list(hide.sections), ...list(hide.items)].filter(Boolean).join(", "),
    hasPassword: r.hasPassword === true,
    pulled: typeof pulled.at === "string" ? { at: pulled.at, views: Number(pulled.views) || 0, comments: Number(pulled.comments) || 0 } : null,
    feedback,
    pullable: SLUG_RE.test(slug),
  };
}

export function readShares(root: string = careerOpsRoot()): SharesData {
  let text: string;
  try {
    text = fs.readFileSync(path.join(root, "data", "shares.json"), "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { shares: [], error: null };
    console.error(`shares: data/shares.json could not be read: ${code}`);
    return { shares: [], error: "data/shares.json could not be read" };
  }
  let data: unknown;
  try {
    data = text.trim() ? JSON.parse(text) : {};
  } catch (err) {
    console.error(`shares: data/shares.json is not valid JSON: ${(err as Error).message}`);
    return { shares: [], error: "data/shares.json is not valid JSON; fix it or republish from the CLI" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    console.error("shares: data/shares.json is not a record of shares");
    return { shares: [], error: "data/shares.json is not a record of shares" };
  }
  const feedbackDir = path.join(root, "data", "share-feedback");
  // Every key the CLI could have written is listed; the view withholds Pull from one the route cannot pass as --slug.
  const shares = Object.entries(data)
    .filter(([slug]) => CLI_SLUG_RE.test(slug))
    .map(([slug, raw]) => toShare(slug, raw, feedbackDir));
  return { shares, error: null };
}
