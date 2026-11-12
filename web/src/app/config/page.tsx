import { ConfigForm } from "@/components/config-form";
import { SettingsView } from "@/components/settings/settings-view";
import { careerOpsRoot } from "@/lib/career-ops";

export default function ConfigPage() {
  return (
    <>
      <ConfigForm dataRoot={careerOpsRoot()} />
      <SettingsView />
    </>
  );
}
