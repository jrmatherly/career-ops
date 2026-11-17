import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { careerOpsRoot } from "@/lib/career-ops";
import { readJsonObject } from "@/lib/json-body";
import { EVALUATION_GATE_REASONS } from "@/lib/evaluation-gate.mjs";
import { CUT_SLACK, SAVED_OUTPUT_MAX, knownSecrets, maskSecrets } from "@/lib/mask-secrets.mjs";
import { CAREER_OPS_SECRET_ENV } from "@/lib/spawn-cli.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STEPS_MAX = 500;

/** The data root .env the scripts a run starts load their keys from. */
function readDotenv(): Record<string, string> {
  try {
    // Node 22.13's parseEnv keeps an inline comment on a last line with no newline.
    return parseEnv(`${fs.readFileSync(path.join(careerOpsRoot(), ".env"), "utf8")}\n`) as Record<string, string>;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") console.error(`/api/runs/save: .env not read (${code ?? "unknown error"}), so its keys are masked by pattern only`);
    return {};
  }
}

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

  // A key can surface in any free-text field, on any status. Each field is masked
  // with some context past its length, then cut, so a label and its value, or a
  // known secret, are never separated before masking. The context is CUT_SLACK, or
  // the longest known secret when that is longer. Capping first keeps a large body
  // from stalling the event loop. The word a cut lands in is dropped.
  const known = knownSecrets([process.env, readDotenv()], CAREER_OPS_SECRET_ENV);
  const slack = Math.max(CUT_SLACK, known[0]?.value.length ?? 0);
  const text = (v: unknown, max: number) => {
    const raw = String(v ?? "").trim();
    const masked = maskSecrets(raw.slice(0, max + slack), known);
    if (raw.length <= max + slack && masked.length <= max) return masked.trimEnd();
    if (/\s/.test(masked[max] ?? "")) return masked.slice(0, max).trimEnd();
    let end = Math.min(max, masked.length);
    while (end > 0 && !/\s/.test(masked[end - 1])) end--;
    return masked.slice(0, end).trimEnd();
  };
  const title = text(b.title, 300);
  const page = text(b.page, 200);
  const input = text(b.input, 2000);
  const gateMessage = gate ? text(gate.message, 1200) : "";
  const summary = text(b.result?.summary, 1200);
  const error = b.status === "error" ? text(b.error, 1200) : "";
  // The client sends the last SAVED_OUTPUT_MAX + CUT_SLACK characters. The whole of
  // that is masked, then the last SAVED_OUTPUT_MAX kept. A tab still on an older
  // bundle cuts at exactly SAVED_OUTPUT_MAX, so the first CUT_SLACK of that is
  // context and dropped too. Where anything may have been cut, the first line, or
  // in a single-line output the first token, may be the tail of a value the masker
  // did not know, so it is dropped. An unbroken run that long is unreadable and may
  // be a key.
  const rawOutput = String(b.output ?? "");
  let output = maskSecrets(rawOutput.slice(-(SAVED_OUTPUT_MAX + CUT_SLACK)), known);
  if (rawOutput.length >= SAVED_OUTPUT_MAX) {
    output = output.slice(-(rawOutput.length === SAVED_OUTPUT_MAX ? SAVED_OUTPUT_MAX - CUT_SLACK : SAVED_OUTPUT_MAX));
    const nl = output.indexOf("\n");
    if (nl !== -1) output = output.slice(nl + 1);
    else if (/\s/.test(output)) output = output.replace(/^\S*\s*/, "");
    else output = `[output omitted: one unbroken ${SAVED_OUTPUT_MAX}-character run]`;
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
