import { pathToFileURL } from "node:url";
import { careerOpsRoot, rootScript } from "@/lib/career-ops";
import { getProfilePath } from "@/lib/core/profile-path.mjs";

type PageFormat = { resolvePageFormat: (explicit: unknown, opts: { profilePath: string }) => "a4" | "letter"; PAGE_CSS_SIZE: Record<"a4" | "letter", string> };

/** The sheet the master CV renders on, as the profile sets it. Null, logged, when the core module cannot say. */
export async function masterPageFormat(): Promise<{ format: "a4" | "letter"; label: string } | null> {
  try {
    const { resolvePageFormat, PAGE_CSS_SIZE } = (await import(/* webpackIgnore: true */ pathToFileURL(rootScript("lib/page-format")).href)) as PageFormat;
    const format = resolvePageFormat(undefined, { profilePath: getProfilePath(careerOpsRoot()) });
    return { format, label: PAGE_CSS_SIZE[format] };
  } catch (err) {
    console.error("cv: page format unavailable", err);
    return null;
  }
}
