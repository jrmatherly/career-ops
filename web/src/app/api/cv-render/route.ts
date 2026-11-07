import { renderCv } from "@/lib/cv-render";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJsonObject<{ payload?: unknown; template?: unknown; style?: unknown }>(req);
  if (!body) return Response.json({ error: "bad json" }, { status: 400 });
  const template = typeof body.template === "string" ? body.template : undefined;
  const result = await renderCv(body.payload, template, body.style);
  if (result.ok) return Response.json({ html: result.html, warnings: result.warnings });
  return Response.json({ error: result.error, issues: result.issues }, { status: result.status });
}
