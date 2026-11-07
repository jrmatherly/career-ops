import { pathToFileURL } from "node:url";
import { ResumeEditor } from "@/components/resume/resume-editor";
import type { TemplateOption } from "@/components/resume/template-picker";
import { rootScript } from "@/lib/career-ops";

export const dynamic = "force-dynamic";

type Templates = { listTemplates: (kind: string) => TemplateOption[] };

async function cvTemplates(): Promise<{ templates: TemplateOption[]; error?: string }> {
  try {
    const { listTemplates } = (await import(/* webpackIgnore: true */ pathToFileURL(rootScript("cv-templates")).href)) as Templates;
    return { templates: listTemplates("cv").map(({ name, displayName }) => ({ name, displayName })) };
  } catch (err) {
    console.error("resume page: listTemplates failed", err);
    // The editor still works with the profile default; the message says why the list is short.
    return { templates: [], error: (err as Error).message };
  }
}

export default async function ResumePage() {
  const { templates, error } = await cvTemplates();
  return <ResumeEditor templates={templates} templatesError={error} />;
}
