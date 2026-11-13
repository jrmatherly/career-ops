import { spawn } from "node:child_process";
import { GET as readResume } from "@/app/api/resume/route";
import { POST as previewResume } from "@/app/api/resume/preview/route";
import { resolveCodeRoot } from "@/lib/core/code-root.mjs";
import { masterPdfFilename, renderMasterPdf } from "@/lib/cv-master-pdf.mjs";
import { PAGE_OVERFLOW_HEADER } from "@/lib/cv/page-overflow.mjs";
import { masterPageFormat } from "@/lib/master-page-format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Failure = { ok: false; status: number; error: string };

// Download the master CV (cv.md) as a PDF. Reuses the CV page's own absorb and
// preview handlers so the PDF is the HTML the page shows.
export async function GET() {
  let out: Response | Failure;
  try {
    out = await render();
  } catch (err) {
    out = { ok: false, status: 500, error: `PDF export failed: ${(err as Error).message}` };
  }
  if (out instanceof Response) return out;
  (out.status >= 500 ? console.error : console.warn)(`cv pdf: ${out.status} ${out.error}`);
  return Response.json({ error: out.error }, { status: out.status });
}

async function render(): Promise<Response | Failure> {
  const absorbed = await readResume();
  if (!absorbed.ok) {
    const body = (await absorbed.json().catch(() => ({}))) as { error?: string };
    return { ok: false, status: absorbed.status, error: body.error ?? "cv.md could not be read" };
  }
  const { data, lossless } = (await absorbed.json()) as { data: { basics?: { name?: unknown } } | null; lossless: boolean };

  const page = await masterPageFormat();
  if (!page) return { ok: false, status: 500, error: "The page format could not be resolved, so the PDF was not rendered." };
  const out = await renderMasterPdf({
    lossless,
    format: page.format,
    profilePath: page.profilePath,
    renderHtml: async () => {
      const res = await previewResume(new Request("http://localhost/api/resume/preview", { method: "POST", body: JSON.stringify({ data }) }));
      const body = (await res.json().catch(() => ({}))) as { html?: string; error?: string };
      return res.ok && typeof body.html === "string" ? { ok: true, html: body.html } : { ok: false, status: res.ok ? 500 : res.status, error: body.error ?? "CV preview failed" };
    },
    spawnFn: spawn,
    execPath: process.execPath,
    coreRoot: resolveCodeRoot(process.cwd(), process.env),
  });
  if (!out.ok) return out;
  const name = typeof data?.basics?.name === "string" ? data.basics.name : "";
  return new Response(new Uint8Array(out.pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${masterPdfFilename(name)}"`,
      "Cache-Control": "no-store",
      ...(out.warning ? { [PAGE_OVERFLOW_HEADER]: encodeURIComponent(out.warning) } : {}),
    },
  });
}
