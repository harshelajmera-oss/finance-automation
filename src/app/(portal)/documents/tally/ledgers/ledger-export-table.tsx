"use client";

import { useMemo, useState } from "react";
import type { TallyVendorRow } from "@/lib/tally/data";
import { formatDate } from "@/lib/format";

export default function LedgerExportTable({
  vendors,
  isAdmin,
  showAll,
}: {
  vendors: TallyVendorRow[];
  isAdmin: boolean;
  showAll: boolean;
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
    setSelected((prev) => (prev.size === vendors.length ? new Set() : new Set(vendors.map((v) => v.id))));
  }

  const selectedQuery = useMemo(() => new URLSearchParams({ ids: Array.from(selected).join(",") }).toString(), [selected]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={toggleAll} className="text-sm text-slate-600 underline hover:text-slate-900" disabled={vendors.length === 0}>
          {selected.size === vendors.length && vendors.length > 0 ? "Clear selection" : `Select all (${vendors.length})`}
        </button>
        {isAdmin && (
          <a href={`/documents/tally/ledgers${showAll ? "" : "?showAll=1"}`} className="text-sm text-slate-500 underline hover:text-slate-900">
            {showAll ? "Hide already-exported vendors" : "Admin override: show already-exported vendors too"}
          </a>
        )}
        <div className="ml-auto">
          {selected.size > 0 && (
            <a
              href={`/documents/tally/ledgers/export?${selectedQuery}`}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Download ledger XML ({selected.size})
            </a>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="w-8 px-3 py-2"></th>
              <th className="px-3 py-2 font-medium">Vendor</th>
              <th className="px-3 py-2 font-medium">Tally ledger name</th>
              <th className="px-3 py-2 font-medium">GSTIN</th>
              <th className="px-3 py-2 font-medium">PAN</th>
              <th className="px-3 py-2 font-medium">Exported</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} aria-label={`Select ${v.name}`} />
                </td>
                <td className="px-3 py-2 text-slate-900">{v.name}</td>
                <td className="px-3 py-2 text-slate-500">{v.tallyLedgerName ?? "—"}</td>
                <td className="px-3 py-2 text-slate-500">{v.gstin ?? "—"}</td>
                <td className="px-3 py-2 text-slate-500">{v.pan ?? "—"}</td>
                <td className="px-3 py-2 text-slate-500">
                  {v.tallyExportedAt ? (
                    formatDate(v.tallyExportedAt)
                  ) : (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">New</span>
                  )}
                </td>
              </tr>
            ))}
            {vendors.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
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
