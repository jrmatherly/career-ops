import path from "node:path";
import { PageFrame } from "@/components/page-frame";
import { PageHeader } from "@/components/page-header";
import { PortalsView } from "@/components/portals-view";
import { careerOpsRoot, portalsConfigPath } from "@/lib/career-ops";
import { deploymentMode } from "@/lib/deployment.mjs";
import { resolveCodeRoot } from "@/lib/core/code-root.mjs";
import { loadPortalsDocument, watchedCompanies, type WatchedCompany } from "@/lib/portals-config.mjs";
import { revisionOf } from "@/lib/settings-state.mjs";

export const dynamic = "force-dynamic";

function readWatched(): { watched: WatchedCompany[]; missing: boolean; error: string | null; revision: string } {
  const root = careerOpsRoot();
  try {
    // The template ships with the code, which a data-only CAREER_OPS_ROOT does not hold.
    const template = path.join(resolveCodeRoot(process.cwd(), process.env), "templates", "portals.example.yml");
    const { doc, seeded, source } = loadPortalsDocument(portalsConfigPath(root), template);
    return { watched: seeded ? [] : watchedCompanies(doc), missing: seeded, error: null, revision: revisionOf(source) };
  } catch (e) {
    return { watched: [], missing: false, error: e instanceof Error ? e.message : String(e), revision: "" };
  }
}

export default function PortalsPage() {
  const { watched, missing, error, revision } = readWatched();
  // Name the file the page reads, which CAREER_OPS_PORTALS can move.
  const target = process.env.CAREER_OPS_PORTALS?.trim() ? portalsConfigPath(careerOpsRoot()) : "portals.yml";
  return (
    <PageFrame width="reading">
      <PageHeader
        title="Portals"
        description="The companies career-ops watches for new roles. Run a health check to catch company boards that have quietly broken — a broken link means that company silently disappears from every future scan."
      />
      <p className="text-xs text-faint">
        {deploymentMode().hosted ? (
          <>Backed by <code className="text-muted">portals.yml</code> on this server.</>
        ) : (
          <>Backed by <code className="text-muted">portals.yml</code> — edit it directly or ask the assistant.</>
        )}
      </p>
      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-400">
          Could not read <code>portals.yml</code>: {error}
        </p>
      )}
      <div className="mt-6">
        <PortalsView watched={watched} missing={missing} target={target} revision={revision} />
      </div>
    </PageFrame>
  );
}
