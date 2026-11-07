import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";

// The records publish/share.mjs writes to data/shares.json, plus the comments
// it pulls into data/share-feedback/<slug>.md. Read-only: publishing stays in
// the CLI so the service key never enters the web process.
export type Share = {
  slug: string;
  url: string;
  source: string;
  overlay: string;
  hasPassword: boolean;
  pulled: { at: string; views: number; comments: number } | null;
  /** Reviewer text from the feedback file: third-party data, rendered as text only. */
  feedback: string | null;
};

export type SharesData = { shares: Share[]; error: string | null };

// The CLI's slug rule (publish/share.mjs slugOf) minus a leading dash, so a
// slug can never read as a flag when the pull route passes it as `--slug`.
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
  } catch {
    return { shares: [], error: "data/shares.json is not valid JSON; fix it or republish from the CLI" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { shares: [], error: "data/shares.json is not a record of shares" };
  const feedbackDir = path.join(root, "data", "share-feedback");
  // A key outside SLUG_RE (the CLI's rule minus a leading dash) is skipped: the route could not
  // pass it as --slug, though the CLI's own `pull` with no slug still refreshes it.
  const shares = Object.entries(data)
    .filter(([slug]) => SLUG_RE.test(slug))
    .map(([slug, raw]) => toShare(slug, raw, feedbackDir));
  return { shares, error: null };
}
