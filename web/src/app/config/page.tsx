import { ConfigForm } from "@/components/config-form";
import { PageFrame } from "@/components/page-frame";
import { SettingsView } from "@/components/settings/settings-view";
import { careerOpsRoot } from "@/lib/career-ops";

// In page order: the registry's group ids, plus the two parts ConfigForm renders.
const SECTIONS = [
  ["engine", "AI engine"],
  ["cadence", "Follow-up cadence"],
  ["scanner", "Scanner and network"],
  ["automation", "Automation and evaluation"],
  ["profile", "Profile preferences"],
  ["integrations", "Integrations"],
  ["models", "Model runners"],
  ["keys", "Keys and tokens"],
  ["deployment", "Deployment"],
] as const;

export default function ConfigPage() {
  return (
    <PageFrame width="wide">
      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
        <nav aria-label="Settings sections" className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm lg:mb-0 lg:flex-col">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#settings-${id}`} className="inline-flex min-h-6 items-center text-muted hover:text-foreground hover:underline max-sm:min-h-[44px]">{label}</a>
          ))}
        </nav>
        <div className="min-w-0">
          <div id="settings-engine" className="scroll-mt-6">
            <ConfigForm dataRoot={careerOpsRoot()} />
          </div>
          <SettingsView />
        </div>
      </div>
    </PageFrame>
  );
}
