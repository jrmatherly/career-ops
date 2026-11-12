"use client";

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
        <aside className="sticky top-0 hidden print:hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface/30 p-4 md:flex">
          <Link href="/" className="mb-6 flex items-center gap-2.5 px-1">
            <CoMark size={32} />
            <span className={`${instrumentSerif.className} relative -top-px text-2xl font-normal tracking-tight text-landing`}>
              career-ops
            </span>
          </Link>
          <CommandPalette followupsEnabled={followupsEnabled} />
          {/* At md-tall the fixed Ask button sits over the sidebar's foot and the footer reserves room for it, so the
              nav scrolls rather than pushing the footer under Ask; elsewhere the whole sidebar scrolls as before. */}
          <nav className="flex flex-col gap-0.5 md-tall:min-h-0 md-tall:overflow-y-auto">
            {main.map(({ label, items }) => (
              <div key={label} className="flex flex-col gap-0.5">
                <div className="px-3 pb-1 pt-4 text-xs uppercase tracking-[0.14em] text-faint">{label}</div>
                {items.map(navLink)}
              </div>
            ))}
          </nav>

          <WorkerPills />

          <div className="mt-auto space-y-3 pb-16 pt-3 md-tall:pb-30">
            <UsageMeter />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">Appearance</span>
                <span className="font-mono text-[10px] text-faint">THEME</span>
              </div>
              <ThemeToggle showLabel />
              {pinned.map(navLink)}
              <div className="px-1">
                <span className={`${instrumentSerif.className} text-sm text-faint`}>{host ? `Hosted · ${host}` : "local-first · v0"}</span>
              </div>
            </div>
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
