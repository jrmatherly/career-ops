"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageFrame } from "@/components/page-frame";
import { PageHeader } from "@/components/page-header";
import { ExternalLink, FileText, File, Loader2 } from "lucide-react";
import { formatDay } from "@/lib/format-time.mjs";
import { createLatestRequest } from "@/lib/latest-request.mjs";

type DocumentItem = {
  id: string;
  filename: string;
  kind: "cv" | "cover" | "unknown";
  company?: string;
  role?: string;
  date: string | null;
  reportId: string | null;
  format: string | null;
  mtimeMs: number;
  title: string;
  subtitle: string;
  trackerN: string | null;
};

const KIND_LABEL: Record<DocumentItem["kind"], string> = { cv: "CV", cover: "Cover letter", unknown: "Document" };

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Only the newest request applies its result: a slower, older response that
  // lands after a newer one is ignored instead of putting the older list back.
  const requests = useRef(createLatestRequest());
  const refetch = useCallback(() => {
    const ticket = requests.current.start();
    fetch("/api/documents")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load documents");
        return res.json();
      })
      .then((data) => {
        if (!requests.current.isLatest(ticket)) return;
        setDocuments(data);
        setError(null);
      })
      .catch((err) => {
        if (!requests.current.isLatest(ticket)) return;
        setError(err.message || "Something went wrong");
      })
      .finally(() => {
        if (!requests.current.isLatest(ticket)) return;
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const latest = requests.current;
    refetch();

    // co-job-done only reaches the tab that ran the job. Another open tab
    // refetches when it becomes visible again, so it does not keep showing a
    // list from before the job finished.
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };

    window.addEventListener("co-job-done", refetch);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("co-job-done", refetch);
      document.removeEventListener("visibilitychange", onVisible);
      latest.cancel();
    };
  }, [refetch]);


  const header = <PageHeader title="Documents" description="Tailored CVs and cover letters." />;

  if (loading) {
    return (
      <PageFrame>
        {header}
        <div className="flex h-64 items-center justify-center text-muted">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </PageFrame>
    );
  }

  if (error) {
    return (
      <PageFrame>
        {header}
        <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 rounded-full bg-red-500/10 p-3 text-red-500">
          <File className="h-6 w-6" />
        </div>
        <h2 className="text-base font-semibold text-foreground">Failed to load</h2>
        <p className="mt-1 text-sm text-muted">{error}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          Try again
        </Button>
        </div>
      </PageFrame>
    );
  }

  if (documents.length === 0) {
    return (
      <PageFrame>
        {header}
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <div className="mb-4 rounded-full bg-surface-hover p-3 text-muted">
            <FileText className="h-6 w-6" />
          </div>
          <h2 className="text-base font-semibold text-foreground">No documents found</h2>
          <p className="mt-1 max-w-md text-sm text-muted">
            Open a report and choose Generate tailored CV (PDF). The file shows up here.
          </p>
        </div>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      {header}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {documents.map((doc) => (
          <Card key={doc.id} className="flex flex-col justify-between p-4">
            <div className="min-w-0">
              <h3 className="font-medium text-foreground break-words">{doc.title}</h3>
              {doc.subtitle && <p className="mt-0.5 text-sm text-muted break-words">{doc.subtitle}</p>}
              {doc.title !== doc.filename && <p className="mt-0.5 truncate font-mono text-xs text-faint" title={doc.filename}>{doc.filename}</p>}
              <p className="mt-2 text-xs text-muted">
                {KIND_LABEL[doc.kind]} · {formatDay(doc.date ?? new Date(doc.mtimeMs).toISOString().slice(0, 10))}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={`/api/documents?id=${doc.id}`}
                target="_blank"
                rel="noopener"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Open PDF
                <ExternalLink className="h-3.5 w-3.5 text-muted" aria-hidden />
              </a>
              {doc.trackerN && (
                <Link href={`/pipeline/${doc.trackerN}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Open role
                </Link>
              )}
            </div>
          </Card>
        ))}
      </div>
    </PageFrame>
  );
}
