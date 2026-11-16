import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { careerOpsRoot, portalsConfigPath } from "@/lib/career-ops";
import { resolveCodeRoot } from "@/lib/core/code-root.mjs";
import { atomicWriteWithBackup } from "@/lib/core/safe-write";
import { companiesNamed, isMapping, isRequestDelayMs, loadPortalsDocument, mergePortalFilters, patchPortalFiltersText, MAX_REQUEST_DELAY_MS, PortalsConfigError, setCompanyEnabledText, setCompanyRequestDelayText } from "@/lib/portals-config.mjs";
import { readJsonObject } from "@/lib/json-body";
import { revisionOf } from "@/lib/settings-state.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Merge-safe writer for portals.yml's web-owned filters (a USER-LAYER file).
// Replaces title_filter.positive and, when provided, location_filter.allow;
// seeds from templates/portals.example.yml on first create; and PRESERVES
// tracked_companies plus every other block. Atomic write, confirm-gated
// (setProfile/setPortals). This loads the first home scan after role confirmation.
// The two lists are edited in the file's text so its comments and commented-out
// companies survive; yaml.dump is only the fallback for a shape the text edit
// cannot place.
//
// POST also takes { company, enabled, revision }, the Portals page's switch for
// one tracked company. That write is not confirm-gated, so it carries the
// revision of the file the page showed and is refused when the file has changed.
// { company, request_delay_ms, revision } is the same page's least time between
// one company's requests: whole milliseconds, or null to remove the line.

export async function POST(req: Request) {
  const body = await readJsonObject<{ roles?: string[]; location?: string[]; company?: unknown; enabled?: unknown; request_delay_ms?: unknown; revision?: unknown }>(req);
  if (!body) return Response.json({ error: "bad json" }, { status: 400 });
  if ("company" in body && "request_delay_ms" in body) {
    if ("enabled" in body) return Response.json({ error: "send enabled and request_delay_ms in separate requests" }, { status: 400 });
    const ms = body.request_delay_ms;
    if (ms !== null && !isRequestDelayMs(ms)) {
      return Response.json({ error: `request_delay_ms must be null or a whole number from 1 to ${MAX_REQUEST_DELAY_MS}` }, { status: 400 });
    }
    return editCompany(body.company, body.revision, "paced", (source, company) => setCompanyRequestDelayText(source, company, ms));
  }
  if ("company" in body) {
    const { enabled } = body;
    if (typeof enabled !== "boolean") return Response.json({ error: "expected { company: string, enabled: boolean, revision: string }" }, { status: 400 });
    return editCompany(body.company, body.revision, "switched", (source, company) => setCompanyEnabledText(source, company, enabled));
  }
  const roles = (Array.isArray(body.roles) ? body.roles : []).map((r) => String(r).trim()).filter(Boolean).slice(0, 24);
  if (roles.length === 0) return Response.json({ error: "no roles" }, { status: 400 });

  const root = careerOpsRoot();
  const file = portalsConfigPath(root);
  let doc: Record<string, unknown>;
  let source: string;
  try {
    ({ doc, source } = loadPortalsDocument(file, path.join(resolveCodeRoot(process.cwd(), process.env), "templates", "portals.example.yml")));
  } catch (error) {
    const invalidUserConfig = error instanceof PortalsConfigError && error.kind === "invalid-user-config";
    return Response.json(
      { error: error instanceof Error ? error.message : "could not load portals.yml" },
      { status: invalidUserConfig ? 409 : 500 },
    );
  }

  const locations = Array.isArray(body.location)
    ? body.location.map((l) => String(l).trim()).filter(Boolean)
    : undefined;
  const text = patchPortalFiltersText(source, roles, locations)
    ?? yaml.dump(mergePortalFilters(doc, roles, locations), { lineWidth: 100, noRefs: true });

  try {
    atomicWriteWithBackup(file, text);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "write failed" }, { status: 500 });
  }
  return Response.json({ ok: true, roles: roles.length });
}

// Synchronous from the read to the write, so no other request to this server can
// land between the revision check and the write. A writer outside it still can.
function editCompany(company: unknown, revision: unknown, verb: string, edit: (source: string, company: string) => string | null) {
  if (typeof company !== "string" || typeof revision !== "string") {
    return Response.json({ error: "expected { company: string, revision: string }" }, { status: 400 });
  }
  const file = portalsConfigPath(careerOpsRoot());
  let source: string;
  try {
    source = fs.readFileSync(file, "utf8");
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === "ENOENT";
    return Response.json({ error: missing ? "portals.yml does not exist yet" : "could not read portals.yml" }, { status: missing ? 409 : 500 });
  }
  if (revisionOf(source) !== revision) return Response.json({ error: "portals.yml changed since this page loaded. Reload and try again." }, { status: 409 });
  let doc: unknown;
  try {
    doc = yaml.load(source);
  } catch {
    return Response.json({ error: "portals.yml contains invalid YAML" }, { status: 409 });
  }
  if (!isMapping(doc) || companiesNamed(doc as Record<string, unknown>, company).length === 0) {
    return Response.json({ error: `no company named "${company}" in portals.yml` }, { status: 404 });
  }
  const text = edit(source, company);
  if (text === null) {
    return Response.json({ error: `"${company}" cannot be ${verb} here (listed more than once, or written in a form the page does not edit). Edit portals.yml directly.` }, { status: 409 });
  }
  try {
    atomicWriteWithBackup(file, text);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "write failed" }, { status: 500 });
  }
  return Response.json({ ok: true, revision: revisionOf(text) });
}
