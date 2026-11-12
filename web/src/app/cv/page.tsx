import { Suspense } from "react";
import { pathToFileURL } from "node:url";
import { CvPage } from "@/components/cv/cv-page";
import type { TemplateOption } from "@/components/resume/template-picker";
import { rootScript } from "@/lib/career-ops";
import { masterPageFormat } from "@/lib/master-page-format";

export const dynamic = "force-dynamic";

type Templates = { listTemplates: (kind: string) => TemplateOption[] };

async function cvTemplates(): Promise<{ templates: TemplateOption[]; error?: string }> {
  try {
    const { listTemplates } = (await import(/* webpackIgnore: true */ pathToFileURL(rootScript("cv-templates")).href)) as Templates;
    return { templates: listTemplates("cv").map(({ name, displayName }) => ({ name, displayName })) };
  } catch (err) {
    console.error("cv page: listTemplates failed", err);
    // The structured editor still works with the profile default; the message says why the list is short.
    return { templates: [], error: (err as Error).message };
  }
}

export default async function CvRoute() {
  // The same resolution GET /api/cv/pdf renders with, so the caption names the sheet the download uses.
  const [{ templates, error }, page] = await Promise.all([cvTemplates(), masterPageFormat()]);
  return (
    <Suspense>
      <CvPage format={page?.label ?? null} templates={templates} templatesError={error} />
    </Suspense>
  );
}
