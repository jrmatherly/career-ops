"use client";

import { useEffect, useState } from "react";
import { pluginLine } from "@/lib/settings-form.mjs";
import type { PluginInfo } from "@/lib/settings-form.mjs";

export function PluginStatus() {
  const [plugins, setPlugins] = useState<PluginInfo[] | "loading" | "failed">("loading");
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/doctor", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => {
        setPlugins(body.available && Array.isArray(body.plugins) ? body.plugins : "failed");
        setConfigError(typeof body.pluginConfigError === "string" ? body.pluginConfigError : null);
      })
      .catch(() => setPlugins("failed"));
  }, []);

  return (
    <div className="mt-6">
      {/* Present from the first render, so the change to "unavailable" is announced. */}
      <p role="status" className="text-sm text-muted empty:hidden">
        {plugins === "loading" ? "Loading plugin status…" : plugins === "failed" ? "Plugin status is unavailable." : ""}
      </p>
      {Array.isArray(plugins) && (
        <>
          <h3 id="settings-plugins-heading" className="mb-2 text-xs font-semibold text-muted">Plugins</h3>
          {configError && (
            <p role="alert" className="mb-2 text-sm text-rose-600 dark:text-rose-400">
              config/plugins.yml could not be read, so every plugin shows as off: {configError}
            </p>
          )}
          {plugins.length === 0 && <p className="mb-2 text-sm text-muted">No plugins were found.</p>}
          <ul aria-labelledby="settings-plugins-heading" className="rounded-xl border border-border bg-surface/50 px-4 empty:hidden">
            {plugins.map((p) => (
              <li key={p.id} className="flex flex-col gap-1 border-t border-border/60 py-4 first:border-t-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{p.id}</div>
                  <p className="mt-0.5 text-xs text-faint">{p.hooks.join(", ")}</p>
                </div>
                <div className="min-w-0 break-words text-sm text-foreground sm:max-w-[60%] sm:text-right">{pluginLine(p)}</div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-faint">
            Turning a plugin on needs your consent to what it can reach, so it is done from a terminal: <code className="whitespace-nowrap">{"node plugins.mjs enable <id> --confirm"}</code>. Its keys go in the environment or the data root&apos;s .env.
          </p>
        </>
      )}
    </div>
  );
}
