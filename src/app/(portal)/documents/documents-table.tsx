"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runExtraction, archiveDocument, restoreDocument, reassignDocumentClient } from "./actions";
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

export default function DocumentsTable({
  documents,
  role,
  clients,
}: {
  documents: DocumentRow[];
  role?: UserRole;
  clients: Client[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [results, setResults] = useState<ExtractResult[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingClientFor, setEditingClientFor] = useState<string | null>(null);
  const [editClientValue, setEditClientValue] = useState("");
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [isRowPending, startRowTransition] = useTransition();

  function handleArchive(id: string) {
    setRowError(null);
    startRowTransition(async () => {
      try {
        await archiveDocument(id);
        router.refresh();
      } catch (err) {
        setRowError({ id, message: err instanceof Error ? err.message : "Could not archive." });
      }
    });
  }

  function handleRestore(id: string) {
    setRowError(null);
    startRowTransition(async () => {
      try {
        await restoreDocument(id);
        router.refresh();
      } catch (err) {
        setRowError({ id, message: err instanceof Error ? err.message : "Could not restore." });
      }
    });
  }

  function startEditClient(id: string, currentClientId: string) {
    setEditingClientFor(id);
    setEditClientValue(currentClientId);
    setRowError(null);
  }

  function saveEditClient(id: string) {
    startRowTransition(async () => {
      try {
        await reassignDocumentClient(id, editClientValue);
        setEditingClientFor(null);
        router.refresh();
      } catch (err) {
        setRowError({ id, message: err instanceof Error ? err.message : "Could not reassign." });
      }
    });
  }

  const selectGroups = useMemo(() => {
    const groups: { value: string; label: string; ids: string[] }[] = [
      { value: "all", label: "Everything shown", ids: documents.map((d) => d.id) },
      { value: "ext_pending", label: "Pending extraction", ids: documents.filter((d) => d.extraction_status === "pending").map((d) => d.id) },
      { value: "ext_completed", label: "Extraction completed", ids: documents.filter((d) => d.extraction_status === "completed").map((d) => d.id) },
      { value: "ext_failed", label: "Extraction failed", ids: documents.filter((d) => d.extraction_status === "failed").map((d) => d.id) },
      { value: "rev_not_submitted", label: "Not submitted", ids: documents.filter((d) => d.review_status === "not_submitted").map((d) => d.id) },
      { value: "rev_submitted", label: "Submitted", ids: documents.filter((d) => d.review_status === "submitted").map((d) => d.id) },
      { value: "rev_approved", label: "Approved", ids: documents.filter((d) => d.review_status === "approved").map((d) => d.id) },
      { value: "rev_rejected", label: "Rejected", ids: documents.filter((d) => d.review_status === "rejected").map((d) => d.id) },
    ];
    return groups;
  }, [documents]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectGroup(value: string) {
    const group = selectGroups.find((g) => g.value === value);
    if (group) setSelected(new Set(group.ids));
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

  function handleArchiveSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Archive ${ids.length} selected document${ids.length === 1 ? "" : "s"}? Nothing is deleted — they can be restored later.`)) return;

    setRowError(null);
    startRowTransition(async () => {
      for (const id of ids) {
        try {
          await archiveDocument(id);
        } catch (err) {
          setRowError({ id, message: err instanceof Error ? err.message : "Could not archive." });
        }
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) selectGroup(e.target.value);
            e.target.value = "";
          }}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-600"
        >
          <option value="">Select all…</option>
          {selectGroups.map((g) => (
            <option key={g.value} value={g.value} disabled={g.ids.length === 0}>
              {g.label} ({g.ids.length})
            </option>
          ))}
        </select>
        {selected.size > 0 && (
          <>
            <button
              type="button"
              onClick={clearSelection}
              className="text-sm text-slate-500 underline hover:text-slate-900"
            >
              Clear selection ({selected.size})
            </button>
            <button
              type="button"
              onClick={handleArchiveSelected}
              disabled={isRowPending}
              className="ml-auto rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {isRowPending ? "Archiving…" : `Archive selected (${selected.size})`}
            </button>
            <button
              type="button"
              onClick={handleExtractSelected}
              disabled={isPending}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
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
              <tr key={d.id} className={`border-b border-slate-100 last:border-0 ${d.archived_at ? "opacity-50" : ""}`}>
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
                  {editingClientFor === d.id ? (
                    <div className="flex items-center gap-1">
                      <select
                        value={editClientValue}
                        onChange={(e) => setEditClientValue(e.target.value)}
                        className="rounded border border-slate-300 px-1.5 py-1 text-sm"
                      >
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.code})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => saveEditClient(d.id)}
                        disabled={isRowPending}
                        className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingClientFor(null)}
                        className="text-xs text-slate-500 underline hover:text-slate-900"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <span>
                      {d.clients ? `${d.clients.name} (${d.clients.code})` : "—"}
                      {role && (
                        <button
                          type="button"
                          onClick={() => startEditClient(d.id, d.client_id)}
                          className="ml-2 text-xs text-slate-400 underline hover:text-slate-900"
                        >
                          Edit
                        </button>
                      )}
                    </span>
                  )}
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
                  {d.source === "manual_no_file" && (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      No file
                    </span>
                  )}
                  {d.archived_at && (
                    <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                      Archived
                    </span>
                  )}
                  {rowError?.id === d.id && <span className="ml-2 text-xs text-red-600">{rowError.message}</span>}
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
                    {d.storage_path && <ViewDocumentButton documentId={d.id} />}
                    {role === "maker" &&
                      d.extraction_status === "completed" &&
                      (d.review_status === "not_submitted" || d.review_status === "rejected") && (
                        <Link href={`/documents/${d.id}`} className="text-slate-900 underline hover:no-underline">
                          Review
                        </Link>
                      )}
                    {role &&
                      (d.archived_at ? (
                        <button
                          type="button"
                          onClick={() => handleRestore(d.id)}
                          disabled={isRowPending}
                          className="text-sm text-slate-600 underline hover:text-slate-900 disabled:opacity-50"
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleArchive(d.id)}
                          disabled={isRowPending}
                          className="text-sm text-red-600 underline hover:text-red-800 disabled:opacity-50"
                        >
                          Archive
                        </button>
                      ))}
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
