"use client";

import { useState } from "react";
import { useDeployment } from "@/components/deployment-context";
import { pdfDownloadHref, pdfRevealHref } from "@/lib/cv-pdf-query.mjs";

export function CvPdfFileActions({ viewHref, className }: { viewHref: string; className: string }) {
  const [error, setError] = useState("");
  const { hosted } = useDeployment();

  async function reveal() {
    setError("");
    try {
      const res = await fetch(pdfRevealHref(viewHref), { method: "POST" });
      if (!res.ok) {
        const text = (await res.text()).trim();
        // 501 answers with the file's path, relative to the data folder, and nothing else.
        setError(res.status === 501 && text ? `This computer cannot open a file manager. The file is at ${text}.` : text || "Could not reveal the file.");
      }
    } catch {
      setError("Could not reveal the file.");
    }
  }

  return (
    <>
      <a href={pdfDownloadHref(viewHref)} className={className}>
        Download PDF
      </a>
      {hosted ? null : (
        <button type="button" className={className} title="Reveal the file" onClick={reveal}>
          Show in Finder
        </button>
      )}
      {error ? (
        <span role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </span>
      ) : null}
    </>
  );
}
