import { LayoutDashboard, Compass, ListChecks, Send, Radar, BarChart3, FileText, Files, Settings, CalendarClock, IdCard, SquareKanban, Share2 } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

// Single source of truth for the app's primary destinations — shared by the
// desktop sidebar and the mobile nav so they can never drift.
export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  group: "Daily" | "Discover" | "Profile" | "Insight" | "Pinned";
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Today", icon: LayoutDashboard, group: "Daily" },
  { href: "/pipeline", label: "Pipeline", icon: ListChecks, group: "Daily" },
  { href: "/board", label: "Board", icon: SquareKanban, group: "Daily" },
  { href: "/followups", label: "Follow-ups", icon: Send, group: "Daily" },
  { href: "/explore", label: "Explore", icon: Compass, group: "Discover" },
  { href: "/scheduled-scans", label: "Scheduled scans", icon: CalendarClock, group: "Discover" },
  { href: "/portals", label: "Portals", icon: Radar, group: "Discover" },
  { href: "/cv", label: "CV", icon: FileText, group: "Profile" },
  { href: "/resume", label: "Resume", icon: IdCard, group: "Profile" },
  { href: "/documents", label: "Documents", icon: Files, group: "Profile" },
  { href: "/shares", label: "Shares", icon: Share2, group: "Profile" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, group: "Insight" },
  { href: "/config", label: "Settings", icon: Settings, group: "Pinned" },
];

const NAV_GROUPS: NavItem["group"][] = ["Daily", "Discover", "Profile", "Insight", "Pinned"];

export function visibleNavItems(followupsEnabled: boolean): NavItem[] {
  return followupsEnabled ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.href !== "/followups");
}

export function navGroups(followupsEnabled: boolean): { label: string; items: NavItem[] }[] {
  const items = visibleNavItems(followupsEnabled);
  return NAV_GROUPS.map((label) => ({ label, items: items.filter((item) => item.group === label) }));
}

export function isActivePath(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
