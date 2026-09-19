"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runExtraction } from "./actions";
import ViewDocumentButton from "./view-document-button";
import { formatDateTime } from "@/lib/format";
import type { Client, Document, UserRole } from "@/lib/supabase/types";

type DocumentRow = Document & { clients: Pick<Client, "name" | "code"> | null };

interface ExtractResult {
  id: string;
  name: string;
  status: "completed" | "failed";
  error?: string;
}

function ExtractionBadge({ status }: { status: Document["extraction_status"] }) {
  const styles: Record<Document["extraction_status"], string> = {
    completed: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    pending: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>{status}</span>
  );
}

function ReviewBadge({ status }: { status: Document["review_status"] }) {
  const styles: Record<Document["review_status"], string> = {
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    submitted: "bg-blue-100 text-blue-800",
    not_submitted: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}

export default function DocumentsTable({ documents, role }: { documents: DocumentRow[]; role?: UserRole }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [results, setResults] = useState<ExtractResult[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const pendingIds = useMemo(
    () => documents.filter((d) => d.extraction_status === "pending").map((d) => d.id),
    [documents],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllPending() {
    setSelected(new Set(pendingIds));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function handleExtractSelected() {
    const ids = documents.filter((d) => selected.has(d.id));
    if (ids.length === 0) return;

    setResults(null);
    startTransition(async () => {
      const outcomes: ExtractResult[] = [];

      for (let i = 0; i < ids.length; i++) {
        const doc = ids[i];
        setProgress({ current: i + 1, total: ids.length });
        try {
          await runExtraction(doc.id);
          outcomes.push({ id: doc.id, name: doc.original_filename, status: "completed" });
        } catch (err) {
          outcomes.push({
            id: doc.id,
            name: doc.original_filename,
            status: "failed",
            error: err instanceof Error ? err.message : "Extraction failed.",
          });
        }
      }

      setProgress(null);
      setResults(outcomes);
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={selectAllPending}
          disabled={pendingIds.length === 0}
          className="text-sm text-slate-600 underline hover:text-slate-900 disabled:opacity-40 disabled:no-underline"
        >
          Select all pending ({pendingIds.length})
        </button>
        {selected.size > 0 && (
          <>
            <button
              type="button"
              onClick={clearSelection}
              className="text-sm text-slate-500 underline hover:text-slate-900"
            >
              Clear selection
            </button>
            <button
              type="button"
              onClick={handleExtractSelected}
              disabled={isPending}
              className="ml-auto rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {isPending ? "Extracting…" : `Extract selected (${selected.size})`}
            </button>
          </>
        )}
      </div>

      {progress && (
        <p className="mb-3 text-sm text-slate-500">
          Extracting {progress.current} of {progress.total}…
        </p>
      )}

      {results && (
        <ul className="mb-4 space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
          {results.map((r) => (
            <li key={r.id} className={r.status === "failed" ? "text-red-600" : "text-green-600"}>
              <Link href={`/documents/${r.id}`} className="underline hover:no-underline">
                {r.name}
              </Link>
              {": "}
              {r.status === "completed" ? "extracted." : `failed — ${r.error}`}
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="w-8 px-4 py-2"></th>
              <th className="px-4 py-2 font-medium">Received</th>
              <th className="px-4 py-2 font-medium">Client</th>
              <th className="px-4 py-2 font-medium">File</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Extraction</th>
              <th className="px-4 py-2 font-medium">Review</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={() => toggle(d.id)}
                    aria-label={`Select ${d.original_filename}`}
                  />
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                  {formatDateTime(d.received_at)}
                </td>
                <td className="px-4 py-2 text-slate-900">
                  {d.clients ? `${d.clients.name} (${d.clients.code})` : "—"}
                </td>
                <td className="px-4 py-2">
                  <Link href={`/documents/${d.id}`} className="text-slate-900 underline hover:no-underline">
                    {d.original_filename}
                  </Link>
                  {d.source === "bulk_payout" && (
                    <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                      Payout row
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {d.status === "duplicate" ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Duplicate
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      Received
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <ExtractionBadge status={d.extraction_status} />
                </td>
                <td className="px-4 py-2">
                  <ReviewBadge status={d.review_status} />
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <ViewDocumentButton documentId={d.id} />
                    {role === "maker" &&
                      d.extraction_status === "completed" &&
                      (d.review_status === "not_submitted" || d.review_status === "rejected") && (
                        <Link href={`/documents/${d.id}`} className="text-slate-900 underline hover:no-underline">
                          Review
                        </Link>
                      )}
                  </div>
                </td>
              </tr>
            ))}
            {documents.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  Nothing uploaded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
