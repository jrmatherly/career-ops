import fs from "node:fs";
import { rootScript } from "@/lib/career-ops";
import { runCoreCli } from "@/lib/core-cli";
import { readJsonObject } from "@/lib/json-body";
import { SLUG_RE } from "@/lib/shares";

export const runtime = "nodejs"; // delegates to the share CLI via child_process
export const dynamic = "force-dynamic";

// Runs `node publish/share.mjs pull [--slug s]`: the CLI reads PUBLISH_URL and
// the key from the data root's .env, refreshes data/shares.json and rewrites
// data/share-feedback/*.md. The web never holds the key or talks to the service.
export async function POST(req: Request) {
  const body = await readJsonObject<{ slug?: unknown }>(req);
  const args = ["pull"];
  if (body?.slug !== undefined) {
    if (typeof body.slug !== "string" || !SLUG_RE.test(body.slug)) {
      return Response.json({ error: "slug must be [a-z0-9-], at most 64 characters" }, { status: 400 });
    }
    args.push("--slug", body.slug);
  }
  if (!fs.existsSync(rootScript("publish/share"))) {
    return Response.json({ error: "pulling needs the career-ops scripts; this root has data only", code: "core-script-missing" }, { status: 503 });
  }

  const r = await runCoreCli("publish/share", args);
  if (r.code === 0) return Response.json({ ok: true });
  if (r.spawnFailed) {
    console.error(`/api/shares/pull: share.mjs failed to run: ${r.stderr.trim()}`);
    return Response.json({ error: "pull failed to run" }, { status: 500 });
  }
  if (r.timedOut) return Response.json({ error: "pull timed out; the publish service may be slow or unreachable" }, { status: 504 });
  // stderr names the service URL and the .env path, so it is logged and only classified here.
  // share.mjs exits 1 for every failure, so the classes come from its messages: a fetch
  // failure (makeClient.request), "is not set" (serviceConfig), "no local record" (fetchStats).
  const err = r.stderr.trim();
  console.error(`/api/shares/pull: share.mjs exited ${r.code}: ${err}`);
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|fetch failed|non-JSON body/.test(err)) {
    return Response.json({ error: "the publish service did not answer; is it running?" }, { status: 502 });
  }
  if (/is not set/.test(err)) return Response.json({ error: "PUBLISH_URL or PUBLISH_API_KEY is not set in the data root's .env" }, { status: 503 });
  if (/no local record/.test(err)) return Response.json({ error: "that share is not in data/shares.json" }, { status: 404 });
  return Response.json({ error: "pull failed; see the server log" }, { status: 500 });
}
