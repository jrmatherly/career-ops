import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { GET as readResume } from "@/app/api/resume/route";
import { POST as previewResume } from "@/app/api/resume/preview/route";
import { careerOpsRoot, rootScript } from "@/lib/career-ops";
import { resolveCodeRoot } from "@/lib/core/code-root.mjs";
import { getProfilePath } from "@/lib/core/profile-path.mjs";
import { masterPdfFilename, renderMasterPdf } from "@/lib/cv-master-pdf.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageFormat = { resolvePageFormat: (explicit: unknown, opts: { profilePath: string }) => "letter" | "a4" };

// Download the master CV (cv.md) as a PDF. Reuses the CV page's own absorb and
// preview handlers so the PDF is the HTML the page shows.
export async function GET() {
  const absorbed = await readResume();
  if (!absorbed.ok) return absorbed;
  const { data, lossless } = (await absorbed.json()) as { data: { basics?: { name?: unknown } } | null; lossless: boolean };

  const { resolvePageFormat } = (await import(/* webpackIgnore: true */ pathToFileURL(rootScript("lib/page-format")).href)) as PageFormat;
  const out = await renderMasterPdf({
    lossless,
    format: resolvePageFormat(undefined, { profilePath: getProfilePath(careerOpsRoot()) }),
    renderHtml: async () => {
      const res = await previewResume(new Request("http://localhost/api/resume/preview", { method: "POST", body: JSON.stringify({ data }) }));
      const body = (await res.json()) as { html?: string; error?: string };
      return res.ok && typeof body.html === "string" ? { ok: true, html: body.html } : { ok: false, status: res.ok ? 500 : res.status, error: body.error ?? "CV preview failed" };
    },
    spawnFn: spawn,
    execPath: process.execPath,
    coreRoot: resolveCodeRoot(process.cwd(), process.env),
  });
  if (!out.ok) {
    if (out.status === 500) console.error(`cv pdf: ${out.error}`);
    return Response.json({ error: out.error }, { status: out.status });
  }
  const name = typeof data?.basics?.name === "string" ? data.basics.name : "";
  return new Response(new Uint8Array(out.pdf), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${masterPdfFilename(name)}"`, "Cache-Control": "no-store" },
  });
}
