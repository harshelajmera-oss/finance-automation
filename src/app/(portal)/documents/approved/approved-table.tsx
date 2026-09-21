"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ApprovedRow } from "@/lib/extraction/approved";
import { formatDate, formatNumber } from "@/lib/format";

const PAYMENT_ROUTE_LABELS: Record<string, string> = {
  portal: "Pay via portal",
  card: "Already paid by card",
  employee: "Already paid by employee",
  auto_debit: "Auto-debit",
  pay_gross_recover: "Pay gross and recover TDS",
};

interface CurrentFilters {
  vendorId?: string;
  receivedFrom?: string;
  receivedTo?: string;
  approvedFrom?: string;
  approvedTo?: string;
  showAll?: string;
}

export default function ApprovedTable({
  rows,
  currentFilters,
  outstandingByReview,
}: {
  rows: ApprovedRow[];
  currentFilters: CurrentFilters;
  outstandingByReview: Record<string, number | null>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.reviewId))));
  }

  const filterQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (currentFilters.vendorId) p.set("vendorId", currentFilters.vendorId);
    if (currentFilters.receivedFrom) p.set("receivedFrom", currentFilters.receivedFrom);
    if (currentFilters.receivedTo) p.set("receivedTo", currentFilters.receivedTo);
    if (currentFilters.approvedFrom) p.set("approvedFrom", currentFilters.approvedFrom);
    if (currentFilters.approvedTo) p.set("approvedTo", currentFilters.approvedTo);
    if (currentFilters.showAll) p.set("showAll", currentFilters.showAll);
    return p.toString();
  }, [currentFilters]);

  const selectedQuery = useMemo(() => {
    const p = new URLSearchParams();
    p.set("ids", Array.from(selected).join(","));
    return p.toString();
  }, [selected]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={toggleAll} className="text-sm text-slate-600 underline hover:text-slate-900" disabled={rows.length === 0}>
          {selected.size === rows.length && rows.length > 0 ? "Clear selection" : `Select all (${rows.length})`}
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {selected.size > 0 && (
            <>
              <a
                href={`/documents/approved/export?${selectedQuery}`}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Download selected ({selected.size})
              </a>
              <a
                href={`/documents/approved/razorpay-export?${selectedQuery}`}
                className="rounded-md border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
              >
                Razorpay payout file (selected)
              </a>
              <a
                href={`/documents/payments/new?${selectedQuery}`}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Record payment ({selected.size})
              </a>
              <a
                href={`/documents/payments/batch?${selectedQuery}`}
                className="rounded-md border border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
              >
                Record several payments ({selected.size})
              </a>
            </>
          )}
          <a
            href={`/documents/approved/export${filterQuery ? `?${filterQuery}` : ""}`}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Download {filterQuery ? "filtered" : "all"} as Excel
          </a>
          <a
            href={`/documents/approved/razorpay-export${filterQuery ? `?${filterQuery}` : ""}`}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Razorpay payout file ({filterQuery ? "filtered" : "all"})
          </a>
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        The Razorpay payout file only includes rows routed &quot;Pay via portal&quot; or &quot;Pay gross and recover TDS&quot;
        with a vendor PAN, bank account and IFSC on file — rows already paid outside the portal, or missing those
        details, are listed separately in the file under &quot;Excluded rows&quot; instead of being paid.
        &quot;Record payment&quot; makes one payment record covering all selected rows with one shared UTR/date — use
        it when a single bank transaction paid several invoices together. &quot;Record several payments&quot; instead
        opens a grid where each row gets its own UTR/date/mode, for entering many separate vendor payments at once.
      </p>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="w-8 px-3 py-2"></th>
              <th className="px-3 py-2 font-medium">Approved</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Vendor</th>
              <th className="px-3 py-2 font-medium">Invoice</th>
              <th className="px-3 py-2 text-right font-medium">Taxable</th>
              <th className="px-3 py-2 text-right font-medium">CGST</th>
              <th className="px-3 py-2 text-right font-medium">SGST</th>
              <th className="px-3 py-2 text-right font-medium">IGST</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-right font-medium">TDS</th>
              <th className="px-3 py-2 text-right font-medium">Net payable</th>
              <th className="px-3 py-2 font-medium">Route</th>
              <th className="px-3 py-2 font-medium">Downloaded</th>
              <th className="px-3 py-2 font-medium">Paid</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.reviewId} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(r.reviewId)}
                    onChange={() => toggle(r.reviewId)}
                    aria-label={`Select ${r.vendorName}`}
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                  {r.approvedAt ? formatDate(r.approvedAt) : "—"}
                </td>
                <td className="px-3 py-2 text-slate-900">
                  {r.clientName} ({r.clientCode})
                </td>
                <td className="px-3 py-2 text-slate-900">
                  <Link href={`/documents/${r.documentId}`} className="underline hover:no-underline">
                    {r.vendorName}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-900">{r.invoiceNumber ?? "—"}</td>
                <td className="px-3 py-2 text-right text-slate-900">{r.taxableValue !== null ? formatNumber(r.taxableValue) : "—"}</td>
                <td className="px-3 py-2 text-right text-slate-900">{r.cgst !== null ? formatNumber(r.cgst) : "—"}</td>
                <td className="px-3 py-2 text-right text-slate-900">{r.sgst !== null ? formatNumber(r.sgst) : "—"}</td>
                <td className="px-3 py-2 text-right text-slate-900">{r.igst !== null ? formatNumber(r.igst) : "—"}</td>
                <td className="px-3 py-2 text-right text-slate-900">{r.total !== null ? formatNumber(r.total) : "—"}</td>
                <td className="px-3 py-2 text-right text-slate-900">{r.tdsAmount !== null ? formatNumber(r.tdsAmount) : "—"}</td>
                <td className="px-3 py-2 text-right font-medium text-slate-900">
                  {r.netPayable !== null ? formatNumber(r.netPayable) : "—"}
                </td>
                <td className="px-3 py-2 text-slate-500">{PAYMENT_ROUTE_LABELS[r.paymentRoute] ?? r.paymentRoute}</td>
                <td className="px-3 py-2 text-slate-500">
                  {r.exportedAt ? (
                    formatDate(r.exportedAt)
                  ) : (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">New</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {(() => {
                    const outstanding = outstandingByReview[r.reviewId];
                    if (outstanding === null || outstanding === undefined) return "—";
                    if (outstanding <= 0) {
                      return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Paid in full</span>;
                    }
                    return `${formatNumber(outstanding)} owing`;
                  })()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={14} className="px-3 py-6 text-center text-slate-400">
                  Nothing matches these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
