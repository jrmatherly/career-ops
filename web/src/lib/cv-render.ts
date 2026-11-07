import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { careerOpsRoot, rootScript } from "@/lib/career-ops";
import { runCoreCli } from "@/lib/core-cli";
import { getProfilePath } from "@/lib/core/profile-path.mjs";

export type RenderResult =
  | { ok: true; html: string; warnings: string[] }
  | { ok: false; status: 400 | 500 | 503; error: string; issues?: string[] };

type Tokens = Record<string, string>;
type PayloadSchema = { validatePayload: (payload: unknown, format: string) => { errors: string[] } };
type Templates = { resolveTemplate: (kind: string, name: string | undefined, opts: { format: string; profilePath: string }) => string };
type ThemeStyle = {
  readStyleTokens: (profilePath: string) => Tokens;
  styleTokensFrom: (style: unknown) => Tokens;
  injectThemeStyle: (html: string, tokens: Tokens) => string;
};

async function coreModule<T>(name: string): Promise<T> {
  return import(/* webpackIgnore: true */ pathToFileURL(rootScript(name)).href) as Promise<T>;
}

function stdoutWarnings(stdout: string): string[] {
  try {
    const warnings = JSON.parse(stdout).warnings;
    return Array.isArray(warnings) ? warnings.map(String) : [];
  } catch {
    return [];
  }
}

export async function renderCv(payload: unknown, template?: string, style?: unknown): Promise<RenderResult> {
  const [{ validatePayload }, { resolveTemplate }, theme] = await Promise.all([
    coreModule<PayloadSchema>("lib/cv-payload-schema"),
    coreModule<Templates>("cv-templates"),
    coreModule<ThemeStyle>("theme-style"),
  ]);

  const { errors } = validatePayload(payload, "html");
  if (errors.length) return { ok: false, status: 400, error: "invalid payload", issues: errors };

  const profilePath = getProfilePath(careerOpsRoot());
  let templatePath: string;
  try {
    templatePath = resolveTemplate("cv", template, { format: "html", profilePath });
  } catch (err) {
    return { ok: false, status: 400, error: `template ${template ?? "(default)"}: ${(err as Error).message}` };
  }

  const dir = await mkdtemp(path.join(tmpdir(), "cv-render-"));
  try {
    const inputPath = path.join(dir, "payload.json");
    const outputPath = path.join(dir, "cv.html");
    await writeFile(inputPath, JSON.stringify(payload));
    const result = await runCoreCli("build-cv-html", [inputPath, outputPath, templatePath]);
    if (result.timedOut) return { ok: false, status: 503, error: "build-cv-html timed out" };
    if (result.spawnFailed) return { ok: false, status: 500, error: "build-cv-html could not start" };
    if (result.code !== 0) return { ok: false, status: 500, error: result.stderr.trim().slice(-600) || `build-cv-html exited ${result.code}` };
    const html = await readFile(outputPath, "utf8");
    // build-cv-html never reads the profile style: block (generate-pdf does), so apply it here with the PDF's precedence.
    const tokens = { ...theme.readStyleTokens(profilePath), ...theme.styleTokensFrom(style) };
    return { ok: true, html: theme.injectThemeStyle(html, tokens), warnings: stdoutWarnings(result.stdout) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
