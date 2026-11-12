"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { CoMark } from "@/components/co-mark";
import { AssistantConsole } from "@/components/assistant-console";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { BackToTop } from "@/components/back-to-top";
import { CommandPalette } from "@/components/command-palette";
import { JobsProvider } from "@/components/jobs/job-store";
import { PipelineProvider } from "@/components/pipeline/pipeline-provider";
import { ApplyProvider } from "@/components/apply/apply-provider";
import { ExploreProvider } from "@/components/explore/explore-provider";
import { FirstScoreView } from "@/components/explore/first-score-view";
import { BetaBanner } from "@/components/beta/beta-banner";
import { WorkerPills } from "@/components/jobs/worker-pills";
import { UsageMeter } from "@/components/usage-meter";
import { FootSection } from "@/components/foot-section";
import { instrumentSerif } from "@/lib/fonts";
import { useDeployment } from "@/components/deployment-context";
import { navGroups, isActivePath, type NavItem } from "@/lib/nav-items";

export function AppShell({ children, followupsEnabled }: { children: React.ReactNode; followupsEnabled: boolean }) {
  const pathname = usePathname();
  const { host } = useDeployment();
  const groups = navGroups(followupsEnabled);
  const main = groups.filter((g) => g.label !== "Pinned");
  const pinned = groups.find((g) => g.label === "Pinned")?.items ?? [];
  const navLink = ({ href, label, icon: Icon }: NavItem) => {
    const active = isActivePath(href, pathname);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors",
          active ? "bg-brand-soft text-brand-text" : "text-muted hover:bg-surface-hover hover:text-foreground",
        )}
      >
        <Icon className="size-4" />
        {label}
      </Link>
    );
  };
  return (
    <JobsProvider>
      <PipelineProvider>
      <ApplyProvider>
      <ExploreProvider>
      <a
        href="#main-content"
        className="sr-only rounded-md bg-brand text-sm font-medium text-brand-foreground focus:not-sr-only focus:fixed focus:px-3 focus:py-2 focus:left-3 focus:top-3 focus:z-[100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        Skip to content
      </a>
      <MobileNav followupsEnabled={followupsEnabled} />
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden print:hidden h-screen w-60 shrink-0 flex-col overflow-y-auto scroll-pb-14 border-r border-border bg-surface/30 p-4 md:flex">
          <Link href="/" className="mb-6 flex items-center gap-2.5 px-1">
            <CoMark size={32} />
            <span className={`${instrumentSerif.className} relative -top-px text-2xl font-normal tracking-tight text-landing`}>
              career-ops
            </span>
          </Link>
          <CommandPalette followupsEnabled={followupsEnabled} />
          <nav aria-label="Main" className="flex flex-col gap-0.5">
            {main.map(({ label, items }) => (
              <div key={label} role="group" aria-labelledby={`nav-group-${label}`} className="flex flex-col gap-0.5">
                <div id={`nav-group-${label}`} className="px-3 pb-1 pt-4 text-xs uppercase tracking-[0.14em] text-faint">{label}</div>
                {items.map(navLink)}
              </div>
            ))}
          </nav>

          <WorkerPills />

          {/* pb-14 keeps the foot clear of the fixed version pill. */}
          <div className="mt-auto space-y-1 pb-14 pt-3">
            <UsageMeter />
            {/* Open on the settings page, so the current link is never hidden. */}
            <FootSection label="Settings" icon={<Settings className="size-3" />} defaultOpen={pinned.some((item) => isActivePath(item.href, pathname))}>
              <nav aria-label="Pinned">{pinned.map((item) => navLink({ ...item, label: "All settings" }))}</nav>
              <ThemeToggle showLabel />
            </FootSection>
            {host && (
              <div className="px-1 pt-1">
                <span className={`${instrumentSerif.className} text-sm text-faint`}>Hosted · {host}</span>
              </div>
            )}
          </div>
        </aside>
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-x-hidden focus:outline-none">{children}</main>
        <div className="print:hidden">
          <AssistantConsole />
          <BackToTop />
          <FirstScoreView />
          <BetaBanner />
        </div>
      </div>
      </ExploreProvider>
      </ApplyProvider>
      </PipelineProvider>
    </JobsProvider>
  );
}
