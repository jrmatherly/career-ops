"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageFrame } from "@/components/page-frame";
import { PageHeader } from "@/components/page-header";
import { ExternalLink, FileText, File, Loader2 } from "lucide-react";
import { formatDay } from "@/lib/format-time.mjs";

type DocumentItem = {
  id: string;
  filename: string;
  kind: "cv" | "cover" | "unknown";
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
  const refetch = useCallback(() => {
    fetch("/api/documents")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load documents");
        return res.json();
      })
      .then((data) => {
        setDocuments(data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || "Something went wrong");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refetch();

    window.addEventListener("co-job-done", refetch);

    return () => {
      window.removeEventListener("co-job-done", refetch);
    };
  }, [refetch]);


  const header = <PageHeader title="Documents" description="Browse your generated CVs and cover letters." />;

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
