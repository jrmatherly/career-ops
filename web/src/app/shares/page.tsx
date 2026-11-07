import { readShares } from "@/lib/shares";
import { SharesView } from "@/components/shares/shares-view";

export const dynamic = "force-dynamic"; // always read fresh local files

export default function SharesPage() {
  const { shares, error } = readShares();
  return <SharesView shares={shares} error={error} />;
}
