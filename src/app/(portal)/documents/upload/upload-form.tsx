"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { uploadDocument } from "./actions";
import { uploadPayoutSheet } from "./payout-actions";
import { getDocumentViewUrl } from "../actions";
import type { Client } from "@/lib/supabase/types";

interface FileResult {
  name: string;
  status: "uploaded" | "duplicate" | "error" | "payout";
  documentId?: string;
  error?: string;
  payoutSummary?: {
    rowCount: number;
    onHoldCount: number;
    warningCount: number;
    skippedBlankRows: number;
    missingColumns: string[];
  };
}

const PAYOUT_EXTENSIONS = ["xls", "xlsx"];

export default function UploadForm({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<FileResult[] | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [viewingId, setViewingId] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const clientId = new FormData(e.currentTarget).get("clientId");
    const files = fileInputRef.current?.files;

    if (typeof clientId !== "string" || !clientId || !files || files.length === 0) {
      return;
    }

    const fileArray = Array.from(files);
    setResults(null);

    startTransition(async () => {
      const outcomes: FileResult[] = [];

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        setProgress({ current: i + 1, total: fileArray.length });

        const formData = new FormData();
        formData.set("clientId", clientId);
        formData.set("file", file);

        const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

        try {
          if (PAYOUT_EXTENSIONS.includes(extension)) {
            const result = await uploadPayoutSheet(formData);
            outcomes.push({ name: file.name, status: "payout", payoutSummary: result });
          } else {
            const result = await uploadDocument(formData);
            outcomes.push({
              name: file.name,
              status: result.isDuplicate ? "duplicate" : "uploaded",
              documentId: result.documentId,
            });
          }
        } catch (err) {
          outcomes.push({
            name: file.name,
            status: "error",
            error: err instanceof Error ? err.message : "Upload failed.",
          });
        }
      }

      setProgress(null);
      setResults(outcomes);
      formRef.current?.reset();
      router.refresh();
    });
  }

  function handleView(documentId: string) {
    setViewingId(documentId);
    getDocumentViewUrl(documentId)
      .then((url) => window.open(url, "_blank", "noopener,noreferrer"))
      .catch((err) => alert(err instanceof Error ? err.message : "Could not open that file."))
      .finally(() => setViewingId(null));
  }

  if (clients.length === 0) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        No clients have been added yet. An admin needs to add a client under{" "}
        <span className="font-medium">Manage clients</span> before anything can be uploaded.
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div>
        <label htmlFor="clientId" className="mb-1 block text-sm font-medium text-slate-700">
          Client
        </label>
        <select
          id="clientId"
          name="clientId"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="file" className="mb-1 block text-sm font-medium text-slate-700">
          Files
        </label>
        <input
          ref={fileInputRef}
          id="file"
          name="file"
          type="file"
          required
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
        />
        <p className="mt-1 text-xs text-slate-400">
          PDF, JPG or PNG for a single invoice/receipt, up to 25 MB each. Select more than one at
          once if you like — hold Ctrl (or Cmd on a Mac) while clicking to pick several. An XLS or
          XLSX file is treated as a <span className="font-medium">bulk payout sheet</span> — many
          payees, one row each — and every row is imported as its own item to review, rather than
          being read as a single invoice.
        </p>
      </div>

      {progress && (
        <p className="text-sm text-slate-500">
          Uploading {progress.current} of {progress.total}…
        </p>
      )}

      {results && (
        <ul className="space-y-1 text-sm">
          {results.map((r, i) => (
            <li
              key={i}
              className={
                r.status === "error"
                  ? "text-red-600"
                  : r.status === "duplicate"
                    ? "text-amber-700"
                    : "text-green-600"
              }
            >
              <span className="font-medium">{r.name}</span>
              {": "}
              {r.status === "uploaded" && "uploaded."}
              {r.status === "duplicate" && "uploaded — flagged as a duplicate."}
              {r.status === "error" && `failed — ${r.error}`}
              {r.status === "payout" && r.payoutSummary && (
                <>
                  {r.payoutSummary.rowCount} payee row{r.payoutSummary.rowCount === 1 ? "" : "s"} imported
                  {r.payoutSummary.onHoldCount > 0 && `, ${r.payoutSummary.onHoldCount} on hold`}
                  {r.payoutSummary.warningCount > 0 && `, ${r.payoutSummary.warningCount} flagged for review`}
                  {r.payoutSummary.skippedBlankRows > 0 && ` (${r.payoutSummary.skippedBlankRows} blank rows skipped)`}
                  {". "}
                  <Link href="/documents" className="underline hover:opacity-80">
                    Review them
                  </Link>
                  {r.payoutSummary.missingColumns.length > 0 && (
                    <span className="block text-xs text-amber-700">
                      Couldn&apos;t find a column for: {r.payoutSummary.missingColumns.join(", ")} — those fields
                      were left blank for every row.
                    </span>
                  )}
                </>
              )}
              {r.documentId && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => handleView(r.documentId!)}
                    disabled={viewingId === r.documentId}
                    className="underline hover:opacity-80 disabled:opacity-50"
                  >
                    {viewingId === r.documentId ? "Opening…" : "View"}
                  </button>
                  {" · "}
                  <Link href={`/documents/${r.documentId}?manual=1`} className="underline hover:opacity-80">
                    Enter details manually
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {isPending ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
