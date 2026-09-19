"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { uploadDocument, createManualDocument } from "./actions";
import { uploadPayoutSheet } from "./payout-actions";
import { getDocumentViewUrl } from "../actions";
import type { Client } from "@/lib/supabase/types";

interface FileResult {
  name: string;
  status: "uploaded" | "duplicate" | "error";
  documentId?: string;
  error?: string;
}

interface PayoutResult {
  name: string;
  status: "ok" | "error";
  error?: string;
  summary?: {
    rowCount: number;
    onHoldCount: number;
    warningCount: number;
    skippedBlankRows: number;
    missingColumns: string[];
  };
}

export default function UploadForm({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");

  const invoiceInputRef = useRef<HTMLInputElement>(null);
  const [invoiceResults, setInvoiceResults] = useState<FileResult[] | null>(null);
  const [invoiceProgress, setInvoiceProgress] = useState<{ current: number; total: number } | null>(null);
  const [isUploadingInvoices, startInvoiceUpload] = useTransition();

  const [isStartingManual, startManual] = useTransition();
  const [manualError, setManualError] = useState<string | null>(null);

  const payoutInputRef = useRef<HTMLInputElement>(null);
  const [payoutResults, setPayoutResults] = useState<PayoutResult[] | null>(null);
  const [payoutProgress, setPayoutProgress] = useState<{ current: number; total: number } | null>(null);
  const [isUploadingPayout, startPayoutUpload] = useTransition();

  const [viewingId, setViewingId] = useState<string | null>(null);

  function handleView(documentId: string) {
    setViewingId(documentId);
    getDocumentViewUrl(documentId)
      .then((url) => window.open(url, "_blank", "noopener,noreferrer"))
      .catch((err) => alert(err instanceof Error ? err.message : "Could not open that file."))
      .finally(() => setViewingId(null));
  }

  function handleUploadInvoices(e: React.FormEvent) {
    e.preventDefault();
    const files = invoiceInputRef.current?.files;
    if (!clientId || !files || files.length === 0) return;

    const fileArray = Array.from(files);
    setInvoiceResults(null);

    startInvoiceUpload(async () => {
      const outcomes: FileResult[] = [];
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        setInvoiceProgress({ current: i + 1, total: fileArray.length });
        const formData = new FormData();
        formData.set("clientId", clientId);
        formData.set("file", file);
        try {
          const result = await uploadDocument(formData);
          outcomes.push({
            name: file.name,
            status: result.isDuplicate ? "duplicate" : "uploaded",
            documentId: result.documentId,
          });
        } catch (err) {
          outcomes.push({ name: file.name, status: "error", error: err instanceof Error ? err.message : "Upload failed." });
        }
      }
      setInvoiceProgress(null);
      setInvoiceResults(outcomes);
      if (invoiceInputRef.current) invoiceInputRef.current.value = "";
      router.refresh();
    });
  }

  function handleStartManual() {
    setManualError(null);
    if (!clientId) {
      setManualError("Choose a client first.");
      return;
    }
    startManual(async () => {
      try {
        const { documentId } = await createManualDocument(clientId);
        router.push(`/documents/${documentId}?manual=1`);
      } catch (err) {
        setManualError(err instanceof Error ? err.message : "Could not start manual entry.");
      }
    });
  }

  function handleUploadPayout(e: React.FormEvent) {
    e.preventDefault();
    const files = payoutInputRef.current?.files;
    if (!clientId || !files || files.length === 0) return;

    const fileArray = Array.from(files);
    setPayoutResults(null);

    startPayoutUpload(async () => {
      const outcomes: PayoutResult[] = [];
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        setPayoutProgress({ current: i + 1, total: fileArray.length });
        const formData = new FormData();
        formData.set("clientId", clientId);
        formData.set("file", file);
        try {
          const summary = await uploadPayoutSheet(formData);
          outcomes.push({ name: file.name, status: "ok", summary });
        } catch (err) {
          outcomes.push({ name: file.name, status: "error", error: err instanceof Error ? err.message : "Upload failed." });
        }
      }
      setPayoutProgress(null);
      setPayoutResults(outcomes);
      if (payoutInputRef.current) payoutInputRef.current.value = "";
      router.refresh();
    });
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
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <label htmlFor="clientId" className="mb-1 block text-sm font-medium text-slate-700">
          Client
        </label>
        <select
          id="clientId"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-1/2"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-400">Applies to whichever of the three options below you use.</p>
      </div>

      <form onSubmit={handleUploadInvoices} className="space-y-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">1. Upload an invoice or receipt</h2>
        <p className="text-xs text-slate-400">
          PDF, JPG or PNG, up to 25 MB each — read automatically. Select more than one at once if you
          like — hold Ctrl (or Cmd on a Mac) while clicking to pick several.
        </p>
        <input
          ref={invoiceInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
        />
        {invoiceProgress && (
          <p className="text-sm text-slate-500">
            Uploading {invoiceProgress.current} of {invoiceProgress.total}…
          </p>
        )}
        {invoiceResults && (
          <ul className="space-y-1 text-sm">
            {invoiceResults.map((r, i) => (
              <li key={i} className={r.status === "error" ? "text-red-600" : r.status === "duplicate" ? "text-amber-700" : "text-green-600"}>
                <span className="font-medium">{r.name}</span>
                {": "}
                {r.status === "uploaded" && "uploaded."}
                {r.status === "duplicate" && "uploaded — flagged as a duplicate."}
                {r.status === "error" && `failed — ${r.error}`}
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
                      Enter details manually instead
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <button
          type="submit"
          disabled={isUploadingInvoices}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {isUploadingInvoices ? "Uploading…" : "Upload"}
        </button>
      </form>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">2. Enter details manually</h2>
        <p className="text-xs text-slate-400">
          No file needed — for a phone call, a verbal agreement, or when extraction won&apos;t read
          something you have. Goes through the same review and approval steps as anything else.
        </p>
        {manualError && <p className="text-sm text-red-600">{manualError}</p>}
        <button
          type="button"
          onClick={handleStartManual}
          disabled={isStartingManual}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {isStartingManual ? "Starting…" : "Start manual entry"}
        </button>
      </div>

      <form onSubmit={handleUploadPayout} className="space-y-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">3. Upload a bulk payout sheet</h2>
        <p className="text-xs text-slate-400">
          An XLS or XLSX with many payees, one row each (mentor payouts and similar) — no invoices,
          not read like a single document. Every row is parsed and imported as its own item to
          review. If a payee is GST-registered, add GSTIN/Taxable Value/CGST/SGST/IGST columns for
          that row — everyone else is treated as gross-up (agreed net amount, TDS computed
          automatically). An &quot;Advance&quot; column, if present, is netted off the payable.
        </p>
        <input
          ref={payoutInputRef}
          type="file"
          accept=".xls,.xlsx"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
        />
        {payoutProgress && (
          <p className="text-sm text-slate-500">
            Uploading {payoutProgress.current} of {payoutProgress.total}…
          </p>
        )}
        {payoutResults && (
          <ul className="space-y-1 text-sm">
            {payoutResults.map((r, i) => (
              <li key={i} className={r.status === "error" ? "text-red-600" : "text-green-600"}>
                <span className="font-medium">{r.name}</span>
                {": "}
                {r.status === "error" && `failed — ${r.error}`}
                {r.status === "ok" && r.summary && (
                  <>
                    {r.summary.rowCount} payee row{r.summary.rowCount === 1 ? "" : "s"} imported
                    {r.summary.onHoldCount > 0 && `, ${r.summary.onHoldCount} on hold`}
                    {r.summary.warningCount > 0 && `, ${r.summary.warningCount} flagged for review`}
                    {r.summary.skippedBlankRows > 0 && ` (${r.summary.skippedBlankRows} blank rows skipped)`}
                    {". "}
                    <Link href="/documents" className="underline hover:opacity-80">
                      Review them
                    </Link>
                    {r.summary.missingColumns.length > 0 && (
                      <span className="block text-xs text-amber-700">
                        Couldn&apos;t find a column for: {r.summary.missingColumns.join(", ")} — those fields were
                        left blank for every row.
                      </span>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <button
          type="submit"
          disabled={isUploadingPayout}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {isUploadingPayout ? "Uploading…" : "Upload payout sheet"}
        </button>
      </form>
    </div>
  );
}
