import fs from "node:fs";
import { rootScript } from "@/lib/career-ops";
import { runCoreCli } from "@/lib/core-cli";
import { readJsonObject } from "@/lib/json-body";
import { SLUG_RE, type PullResponse } from "@/lib/shares";

export const runtime = "nodejs"; // delegates to the share CLI via child_process
export const dynamic = "force-dynamic";

// On a cluster install both arrive as pod env, which share.mjs reads before .env, so a value put in .env there is ignored.
const URL_DESTINATIONS = "PUBLISH_URL is set in the career-ops HelmRelease env on a cluster install and in the data root's .env on a local install.";
const KEY_ON_CLUSTER = `on a cluster install, set publish_api_key = "cops_..." in the [career_ops] block of cluster.toml`;

// Runs `node publish/share.mjs pull [--slug s]`: the CLI reads PUBLISH_URL and
// the key from its environment or the data root's .env, refreshes
// data/shares.json and rewrites the feedback file of every share it pulled.
// The web never reads the key itself and never talks to the service.
export async function POST(req: Request) {
  // A body-less POST pulls everything; a body that is not an object is a client bug, not "everything".
  const body = req.headers.get("content-length") === "0" || !req.body ? {} : await readJsonObject<{ slug?: unknown }>(req);
  if (!body) return Response.json({ error: "bad json" }, { status: 400 });
  const args = ["pull"];
  if (body.slug !== undefined) {
    if (typeof body.slug !== "string" || !SLUG_RE.test(body.slug)) {
      return Response.json({ error: "slug must be [a-z0-9-], at most 64 characters" }, { status: 400 });
    }
    args.push("--slug", body.slug);
  }
  if (!fs.existsSync(rootScript("publish/share"))) {
    return Response.json({ error: "pulling needs the career-ops scripts; this root has data only", code: "core-script-missing" }, { status: 503 });
  }

  const r = await runCoreCli("publish/share", args);
  // stderr names the service URL and the .env path, so it is logged and only classified here.
  // share.mjs exits 1 for every pull failure (3 is the resume gate, which only publish and
  // republish reach), so the classes come from its messages: a fetch failure, "answered <status>"
  // or "non-JSON body" (makeClient.request), "is not set" (serviceConfig), "lock timeout" (updateShares,
  // lib/dir-lock.mjs), "is not valid JSON" (readShares), "no local record" and, on exit 0,
  // "<slug> is not on the server" (fetchStats).
  const err = r.stderr.trim();
  if (r.code === 0) {
    // A share the service no longer has is skipped by the CLI, which still exits 0; its advice goes only to stderr.
    // `pulled` counts the shares the service did answer for (one stdout line each), so the page can tell
    // "this one is gone" from "nothing answered", which is what a mis-pointed PUBLISH_URL looks like.
    const missing = [...err.matchAll(/^publish: (\S+) is not on the server/gm)].map((m) => m[1]);
    const pulled = r.stdout.split("\n").filter((line) => /^\S+ views \d+ comments \d+$/.test(line)).length;
    if (err) console.error(`/api/shares/pull: share.mjs said: ${err}`);
    return Response.json({ ok: true, missing, pulled } satisfies PullResponse);
  }
  if (r.spawnFailed) {
    console.error(`/api/shares/pull: share.mjs failed to run: ${err}`);
    return Response.json({ error: "pull failed to run" }, { status: 500 });
  }
  if (r.timedOut) {
    console.error(`/api/shares/pull: share.mjs timed out: ${err}`);
    return Response.json({ error: "pull timed out; the publish service may be slow or unreachable" }, { status: 504 });
  }
  console.error(`/api/shares/pull: share.mjs exited ${r.code}: ${err}`);
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|fetch failed|non-JSON body|answered 5\d\d/.test(err)) {
    return Response.json({ error: `the publish service did not answer; is it running, and is PUBLISH_URL its address? ${URL_DESTINATIONS}` }, { status: 502 });
  }
  if (/answered 40[13]/.test(err)) return Response.json({ error: `the publish service refused PUBLISH_API_KEY, read from the environment or the data root's .env. Mint a new key on the publish account page; ${KEY_ON_CLUSTER}.` }, { status: 503 });
  if (/answered 429/.test(err)) return Response.json({ error: "the publish service is rate limiting pulls; try again shortly" }, { status: 429 });
  if (/is not set/.test(err)) return Response.json({ error: `PUBLISH_URL or PUBLISH_API_KEY is not set in the environment or the data root's .env. ${URL_DESTINATIONS} For the key, ${KEY_ON_CLUSTER}; on a local install, set PUBLISH_API_KEY in the data root's .env.` }, { status: 503 });
  if (/lock timeout/.test(err)) return Response.json({ error: "another pull or publish is writing data/shares.json; try again shortly" }, { status: 503 });
  if (/is not valid JSON/.test(err)) return Response.json({ error: "data/shares.json is not valid JSON; fix it or republish from the CLI" }, { status: 500 });
  if (/no local record/.test(err)) return Response.json({ error: "that share is not in data/shares.json" }, { status: 404 });
  return Response.json({ error: "pull failed; see the server log" }, { status: 500 });
}
