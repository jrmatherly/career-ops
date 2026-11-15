import { spawn } from "node:child_process";
import { NextRequest } from "next/server";
import { careerOpsRoot } from "@/lib/career-ops";
import { locateTailoredPdf } from "@/lib/cv-pdf-file";
import { revealCvRequest } from "@/lib/cv-reveal.mjs";
import { deploymentMode } from "@/lib/deployment.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const result = await revealCvRequest({
    searchParams: req.nextUrl.searchParams,
    locate: locateTailoredPdf,
    // On a hosted install the file manager would open on the server, where nobody sees it:
    // no platform, so nothing is spawned and the answer is 501.
    platform: deploymentMode().hosted ? "hosted" : process.platform,
    spawn,
    root: careerOpsRoot(),
  });
  return new Response(result.body || null, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
