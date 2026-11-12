import { ConfigForm } from "@/components/config-form";
import { PageFrame } from "@/components/page-frame";
import { SettingsView } from "@/components/settings/settings-view";
import { careerOpsRoot } from "@/lib/career-ops";

export default function ConfigPage() {
  return (
    <PageFrame width="reading">
      <ConfigForm dataRoot={careerOpsRoot()} />
      <SettingsView />
    </PageFrame>
  );
}
