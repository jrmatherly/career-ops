import { careerOpsRoot, isRegularContainedFile, readApplications } from "@/lib/career-ops";
import { resolvePdfIndexPath } from "@/lib/core/pdf-index";
import { handleDocumentsRequest } from "@/lib/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const root = careerOpsRoot();
  const manifestPath = await resolvePdfIndexPath();
  // Titles are a nicety: an unreadable tracker must not take the PDFs down with it.
  let applications: ReturnType<typeof readApplications> = [];
  try {
    applications = readApplications();
  } catch (e) {
    console.error("documents: tracker unreadable, titling by filename", e);
  }
  return handleDocumentsRequest(req, root, manifestPath, isRegularContainedFile, applications);
}
