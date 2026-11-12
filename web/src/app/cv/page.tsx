import { Suspense } from "react";
import { pathToFileURL } from "node:url";
import { CvPage } from "@/components/cv/cv-page";
import type { TemplateOption } from "@/components/resume/template-picker";
import { careerOpsRoot, rootScript } from "@/lib/career-ops";
import { getProfilePath } from "@/lib/core/profile-path.mjs";

export const dynamic = "force-dynamic";

type Templates = { listTemplates: (kind: string) => TemplateOption[] };
type PageFormat = { resolvePageFormat: (explicit: unknown, opts: { profilePath: string }) => "a4" | "letter"; PAGE_CSS_SIZE: Record<"a4" | "letter", string> };

const core = <T,>(name: string) => import(/* webpackIgnore: true */ pathToFileURL(rootScript(name)).href) as Promise<T>;

async function cvTemplates(): Promise<{ templates: TemplateOption[]; error?: string }> {
  try {
    const { listTemplates } = await core<Templates>("cv-templates");
    return { templates: listTemplates("cv").map(({ name, displayName }) => ({ name, displayName })) };
  } catch (err) {
    console.error("cv page: listTemplates failed", err);
    // The structured editor still works with the profile default; the message says why the list is short.
    return { templates: [], error: (err as Error).message };
  }
}

// The same resolution GET /api/cv/pdf renders with, so the caption names the sheet the download uses.
async function pageFormat(): Promise<string | null> {
  try {
    const { resolvePageFormat, PAGE_CSS_SIZE } = await core<PageFormat>("lib/page-format");
    return PAGE_CSS_SIZE[resolvePageFormat(undefined, { profilePath: getProfilePath(careerOpsRoot()) })];
  } catch (err) {
    console.error("cv page: page format unavailable", err);
    return null;
  }
}

export default async function CvRoute() {
  const [{ templates, error }, format] = await Promise.all([cvTemplates(), pageFormat()]);
  return (
    <Suspense>
      <CvPage format={format} templates={templates} templatesError={error} />
    </Suspense>
  );
}
