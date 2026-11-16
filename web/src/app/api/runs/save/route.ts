import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { readJsonObject } from "@/lib/json-body";
import { EVALUATION_GATE_REASONS } from "@/lib/evaluation-gate.mjs";
import { maskSecrets } from "@/lib/mask-secrets.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  id?: string;
  title?: string;
  subtitle?: string;
  page?: string;
  input?: string;
  status?: "done" | "gated" | "error";
  error?: string;
  gate?: { reason: string; message: string; confirmationRequired: boolean };
  result?: { score: number | null; summary: string };
  steps?: { kind: string; label: string }[];
  output?: string;
};

// Persist a finished worker's log as markdown under a web-managed dir so the CLI
// assistant can read past runs ("what did we find on that Anthropic role?").
export async function POST(req: Request) {
  const b = await readJsonObject<Body>(req);
  if (!b) return NextResponse.json({ error: "bad json" }, { status: 400 });
  const safeId = String(b.id ?? "").replace(/[^a-z0-9_-]/gi, "");
  if (!safeId) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (b.status !== undefined && !["done", "gated", "error"].includes(b.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
  const gate = b.status === "gated" ? b.gate : undefined;
  if (b.status === "gated" && (!gate || !EVALUATION_GATE_REASONS.some(reason => reason === gate.reason)
    || typeof gate.message !== "string" || !gate.message.trim() || gate.message.trim().length > 1200
    || typeof gate.confirmationRequired !== "boolean" || b.result?.score != null)) {
    return NextResponse.json({ error: "invalid evaluation stop" }, { status: 400 });
  }

  // The error line is picked for mentioning credentials, so it is the likeliest to quote one.
  const error = b.status === "error" && typeof b.error === "string" ? maskSecrets(b.error.trim()).slice(0, 1200) : "";
  const output = b.status === "error" ? maskSecrets(b.output) : b.output || "";

  const dir = path.join(careerOpsRoot(), ".career-ops-web", "runs");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return NextResponse.json({ error: "mkdir failed" }, { status: 500 });
  }
  const steps = (Array.isArray(b.steps) ? b.steps : []).map((s) => `- ${s.kind === "tool" ? `🔧 ${s.label}` : s.label}`).join("\n");
  const verdict = b.result?.score != null ? `${b.result.score}/5 — ${b.result.summary || ""}` : "—";
  const md = `# Web run · ${b.title || b.id}

- id: ${b.id}
- page: ${b.page || "-"}
- input: ${b.input || "-"}
${b.status ? `- status: ${b.status}\n` : ""}- verdict: ${verdict}
${gate ? `
## Evaluation stop
- reason: ${gate.reason}
- confirmation required: ${gate.confirmationRequired ? "yes" : "no"}

${gate.message.trim()}
` : ""}${error ? `
## Error

${error}
` : ""}

## Steps
${steps}

## Output
${output}
`;
  try {
    fs.writeFileSync(path.join(dir, `${safeId}.md`), md);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "write failed" }, { status: 500 });
  }
}
