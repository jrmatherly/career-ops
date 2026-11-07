import { boardCards } from "@/lib/application-detail";
import { Board } from "@/components/board/board";

export const dynamic = "force-dynamic"; // always read fresh local files

export default function BoardPage() {
  return <Board cards={boardCards()} />;
}
