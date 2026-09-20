"use client";

import { useMemo, useState } from "react";
import type { TallyVoucherRow } from "@/lib/tally/data";
import { formatDate, formatNumber } from "@/lib/format";

export default function VoucherExportTable({
  rows,
  holdReasons,
  isAdmin,
  showAll,
}: {
  rows: TallyVoucherRow[];
  holdReasons: Record<string, string | null>;
  isAdmin: boolean;
  showAll: boolean;
}) {
  const payableRows = rows.filter((r) => !holdReasons[r.reviewId]);
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
    setSelected((prev) => (prev.size === payableRows.length ? new Set() : new Set(payableRows.map((r) => r.reviewId))));
  }

  const selectedQuery = useMemo(() => new URLSearchParams({ ids: Array.from(selected).join(",") }).toString(), [selected]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggleAll}
          className="text-sm text-slate-600 underline hover:text-slate-900"
          disabled={payableRows.length === 0}
        >
          {selected.size === payableRows.length && payableRows.length > 0 ? "Clear selection" : `Select all ready (${payableRows.length})`}
        </button>
        {isAdmin && (
          <a href={`/documents/tally/vouchers${showAll ? "" : "?showAll=1"}`} className="text-sm text-slate-500 underline hover:text-slate-900">
            {showAll ? "Hide already-exported invoices" : "Admin override: show already-exported invoices too"}
          </a>
        )}
        <div className="ml-auto">
          {selected.size > 0 && (
            <a
              href={`/documents/tally/vouchers/export?${selectedQuery}`}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Download voucher XML ({selected.size})
            </a>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="w-8 px-3 py-2"></th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Vendor</th>
              <th className="px-3 py-2 font-medium">Invoice</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-right font-medium">TDS</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Exported</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const hold = holdReasons[r.reviewId];
              return (
                <tr key={r.reviewId} className={`border-b border-slate-100 last:border-0 ${hold ? "bg-amber-50" : ""}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.reviewId)}
                      onChange={() => toggle(r.reviewId)}
                      disabled={!!hold}
                      aria-label={`Select ${r.vendorName}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-slate-900">{r.clientLabel}</td>
                  <td className="px-3 py-2 text-slate-900">{r.vendorName}</td>
                  <td className="px-3 py-2 text-slate-900">{r.invoiceNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-slate-900">{formatNumber(r.total)}</td>
                  <td className="px-3 py-2 text-right text-slate-900">{formatNumber(r.tdsAmount)}</td>
                  <td className="px-3 py-2 text-xs text-amber-700">{hold ?? ""}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {r.tallyExportedAt ? (
                      formatDate(r.tallyExportedAt)
                    ) : hold ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">On hold</span>
                    ) : (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">New</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                  Nothing to export.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
