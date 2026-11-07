import { pathToFileURL } from "node:url";
import { ResumeEditor } from "@/components/resume/resume-editor";
import type { TemplateOption } from "@/components/resume/template-picker";
import { rootScript } from "@/lib/career-ops";

export const dynamic = "force-dynamic";

type Templates = { listTemplates: (kind: string) => TemplateOption[] };

async function cvTemplates(): Promise<TemplateOption[]> {
  try {
    const { listTemplates } = (await import(/* webpackIgnore: true */ pathToFileURL(rootScript("cv-templates")).href)) as Templates;
    return listTemplates("cv").map(({ name, displayName }) => ({ name, displayName }));
  } catch (err) {
    console.error("resume page: listTemplates failed", err);
    return [];
  }
}

export default async function ResumePage() {
  return <ResumeEditor templates={await cvTemplates()} />;
}
