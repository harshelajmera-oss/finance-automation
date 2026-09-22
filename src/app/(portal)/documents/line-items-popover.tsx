"use client";

import { useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/format";
import type { ExtractedFields } from "@/lib/extraction/schema";

/**
 * A small "view items" link next to a grid's Taxable value field — opens a
 * popover with the nature-of-service description and the line items behind
 * that total, without leaving the grid to open the full document.
 */
export default function LineItemsPopover({
  description,
  lineItems,
}: {
  description: string | null;
  lineItems: ExtractedFields["service"]["line_items"];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!description && lineItems.length === 0) return null;

  return (
    <span className="relative ml-1 inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="normal-case tracking-normal text-[10px] font-medium text-blue-600 underline hover:text-blue-800"
      >
        view items
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-md border border-slate-200 bg-white p-3 text-xs normal-case tracking-normal text-slate-700 shadow-lg">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute right-1.5 top-1.5 text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
          {description && <p className="mb-2 pr-4 font-medium text-slate-900">{description}</p>}
          {lineItems.length > 0 ? (
            <table className="w-full text-left">
              <thead className="text-slate-400">
                <tr>
                  <th className="pr-2 pb-1 font-medium">Description</th>
                  <th className="pr-2 pb-1 text-right font-medium">Qty</th>
                  <th className="pr-2 pb-1 text-right font-medium">Rate</th>
                  <th className="pb-1 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((l, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-1 pr-2">{l.description || "—"}</td>
                    <td className="py-1 pr-2 text-right">{l.qty ?? "—"}</td>
                    <td className="py-1 pr-2 text-right">{l.rate !== null ? formatNumber(l.rate) : "—"}</td>
                    <td className="py-1 text-right text-slate-900">{l.amount !== null ? formatNumber(l.amount) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-slate-400">No line items.</p>
          )}
        </div>
      )}
    </span>
  );
}
