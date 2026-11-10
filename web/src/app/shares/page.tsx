import { careerOpsRoot } from "@/lib/career-ops";
import { publishAccountUrl } from "@/lib/publish-account-url.mjs";
import { effectiveEnv } from "@/lib/settings-server";
import { readShares } from "@/lib/shares";
import { SharesView } from "@/components/shares/shares-view";

export const dynamic = "force-dynamic"; // always read fresh local files

export default async function SharesPage() {
  const { shares, error } = readShares();
  return <SharesView shares={shares} error={error} accountUrl={publishAccountUrl({ env: await effectiveEnv(), dataRoot: careerOpsRoot() })} />;
}
