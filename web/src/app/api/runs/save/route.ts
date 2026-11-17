import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { readJsonObject } from "@/lib/json-body";
import { EVALUATION_GATE_REASONS } from "@/lib/evaluation-gate.mjs";
import { maskSecrets } from "@/lib/mask-secrets.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUTPUT_MAX = 8000;
const STEPS_MAX = 500;

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

  // Every free-text field is cut to its length before masking, so a large body
  // cannot stall the event loop, then masked: a key can surface in any of them,
  // on any status. A credential the cut splits has lost the part its pattern
  // needs, so the word the cut lands in is dropped.
  const text = (v: unknown, max: number) => {
    const raw = String(v ?? "").trim();
    const masked = maskSecrets(raw.slice(0, max));
    if (raw.length <= max || /\s/.test(raw[max])) return masked.trimEnd();
    let end = masked.length;
    while (end > 0 && !/\s/.test(masked[end - 1])) end--;
    return masked.slice(0, end).trimEnd();
  };
  const title = text(b.title, 300);
  const page = text(b.page, 200);
  const input = text(b.input, 2000);
  const gateMessage = gate ? text(gate.message, 1200) : "";
  const summary = text(b.result?.summary, 1200);
  const error = b.status === "error" ? text(b.error, 2000).slice(0, 1200) : "";
  // The client keeps the last 8000 characters. At that bound the first line, or in a
  // single-line output the first token, may start mid-key with no prefix or label left
  // to mask, so it is dropped. An unbroken run that long is unreadable and may be a key.
  // The drop comes after masking, so a label it removes has already masked its value.
  const rawOutput = String(b.output ?? "");
  let output = maskSecrets(rawOutput.slice(-OUTPUT_MAX));
  if (rawOutput.length >= OUTPUT_MAX) {
    const nl = output.indexOf("\n");
    if (nl !== -1) output = output.slice(nl + 1);
    else if (/\s/.test(output)) output = output.replace(/^\S*\s*/, "");
    else output = `[output omitted: one unbroken ${OUTPUT_MAX}-character run]`;
  }

  const dir = path.join(careerOpsRoot(), ".career-ops-web", "runs");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.error(`/api/runs/save: could not create ${dir}: ${(err as NodeJS.ErrnoException).code ?? err}`);
    return NextResponse.json({ error: "mkdir failed" }, { status: 500 });
  }
  const steps = (Array.isArray(b.steps) ? b.steps : []).slice(-STEPS_MAX).map((s) => `- ${s?.kind === "tool" ? "🔧 " : ""}${text(s?.label, 300)}`).join("\n");
  const verdict = typeof b.result?.score === "number" ? `${b.result.score}/5 — ${summary}` : "—";
  const md = `# Web run · ${title || safeId}

- id: ${safeId}
- page: ${page || "-"}
- input: ${input || "-"}
${b.status ? `- status: ${b.status}\n` : ""}- verdict: ${verdict}
${gate ? `
## Evaluation stop
- reason: ${gate.reason}
- confirmation required: ${gate.confirmationRequired ? "yes" : "no"}

${gateMessage}
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
  } catch (err) {
    console.error(`/api/runs/save: could not write the run log ${safeId}.md: ${(err as NodeJS.ErrnoException).code ?? "unknown error"}`);
    return NextResponse.json({ error: "write failed" }, { status: 500 });
  }
}
