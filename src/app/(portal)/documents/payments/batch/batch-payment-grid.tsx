"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitPayment } from "../actions";
import { allocationAmounts } from "@/lib/payments/allocation";
import { formatNumber } from "@/lib/format";
import type { PaymentMode } from "@/lib/supabase/types";

export interface PayableRow {
  reviewId: string;
  vendorName: string;
  clientLabel: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  total: number | null;
  tdsAmount: number | null;
  paymentRoute: string;
  paidSoFar: number;
  outstanding: number | null;
}

interface RowPaymentState {
  include: boolean;
  amount: number;
  paymentDate: string;
  mode: PaymentMode;
  utr: string;
  reference: string;
  paidFromLedger: string;
  proofUrl: string;
  isAdvance: boolean;
  notes: string;
}

interface RowOutcome {
  reviewId: string;
  label: string;
  status: "ok" | "error";
  error?: string;
}

const MODE_OPTIONS: { value: PaymentMode; label: string }[] = [
  { value: "neft", label: "NEFT" },
  { value: "rtgs", label: "RTGS" },
  { value: "imps", label: "IMPS" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "auto_debit", label: "Auto-debit" },
  { value: "employee_paid", label: "Employee-paid" },
];

const inputClass = "w-full rounded border border-slate-300 px-2 py-1 text-sm";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function initRowState(row: PayableRow): RowPaymentState {
  return {
    include: (row.outstanding ?? 0) > 0,
    amount: row.outstanding ?? 0,
    paymentDate: todayIso(),
    mode: "neft",
    utr: "",
    reference: "",
    paidFromLedger: "",
    proofUrl: "",
    isAdvance: false,
    notes: "",
  };
}

export default function BatchPaymentGrid({ rows }: { rows: PayableRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [states, setStates] = useState<Record<string, RowPaymentState>>(() =>
    Object.fromEntries(rows.map((r) => [r.reviewId, initRowState(r)])),
  );
  const [outcomes, setOutcomes] = useState<RowOutcome[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function patch(id: string, updater: (s: RowPaymentState) => RowPaymentState) {
    setStates((prev) => ({ ...prev, [id]: updater(prev[id]) }));
  }

  const includedRows = rows.filter((r) => states[r.reviewId]?.include);

  function handleSubmit() {
    if (includedRows.length === 0) {
      setError("Tick at least one row.");
      return;
    }
    setError(null);
    setOutcomes(null);

    for (const row of includedRows) {
      const s = states[row.reviewId];
      if (!s.amount || s.amount <= 0) {
        setError(`Enter a positive amount for ${row.vendorName}.`);
        return;
      }
      if (!s.isAdvance && row.invoiceDate && s.paymentDate < row.invoiceDate) {
        setError(`${row.vendorName}: payment date is before the invoice date — tick "Advance" if that's intended.`);
        return;
      }
    }

    startTransition(async () => {
      const results: RowOutcome[] = [];
      for (const row of includedRows) {
        const s = states[row.reviewId];
        const { grossAmount, tdsAmount } = allocationAmounts(row, s.amount);
        const result = await submitPayment({
          paymentDate: s.paymentDate,
          mode: s.mode,
          utr: s.utr.trim() || null,
          reference: s.reference.trim() || null,
          paidFromLedger: s.paidFromLedger.trim() || null,
          proofUrl: s.proofUrl.trim() || null,
          isAdvance: s.isAdvance,
          notes: s.notes.trim() || null,
          allocations: [{ reviewId: row.reviewId, amount: s.amount, grossAmount, tdsAmount }],
        });
        results.push({
          reviewId: row.reviewId,
          label: row.vendorName,
          status: result.ok ? "ok" : "error",
          error: result.ok ? undefined : result.error,
        });
      }
      setOutcomes(results);
      if (results.every((r) => r.status === "ok")) {
        router.push("/documents/payments");
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-700">{error}</p>}
      {outcomes && (
        <ul className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
          {outcomes.map((o) => (
            <li key={o.reviewId} className={o.status === "error" ? "text-red-600" : "text-green-600"}>
              <span className="font-medium">{o.label}</span>: {o.status === "ok" ? "recorded." : o.error}
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 w-8 bg-slate-50 px-2 py-2"></th>
              <th className="px-2 py-2 font-medium">Client</th>
              <th className="px-2 py-2 font-medium">Vendor</th>
              <th className="px-2 py-2 font-medium">Invoice</th>
              <th className="px-2 py-2 text-right font-medium">Outstanding</th>
              <th className="px-2 py-2 font-medium">Amount now</th>
              <th className="px-2 py-2 font-medium">Payment date</th>
              <th className="px-2 py-2 font-medium">Mode</th>
              <th className="px-2 py-2 font-medium">UTR</th>
              <th className="px-2 py-2 font-medium">Reference</th>
              <th className="px-2 py-2 font-medium">Paid from</th>
              <th className="px-2 py-2 font-medium">Proof</th>
              <th className="px-2 py-2 font-medium">Advance</th>
              <th className="px-2 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const s = states[row.reviewId];
              const fullyPaid = (row.outstanding ?? 0) <= 0;
              return (
                <tr key={row.reviewId} className={`border-b border-slate-100 last:border-0 ${fullyPaid ? "bg-slate-50 text-slate-400" : ""}`}>
                  <td className="sticky left-0 z-10 bg-white px-2 py-1.5 align-top">
                    <input
                      type="checkbox"
                      checked={s.include}
                      onChange={(e) => patch(row.reviewId, (prev) => ({ ...prev, include: e.target.checked }))}
                      disabled={fullyPaid}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-top text-slate-700">{row.clientLabel}</td>
                  <td className="px-2 py-1.5 align-top text-slate-900">{row.vendorName}</td>
                  <td className="px-2 py-1.5 align-top text-slate-700">{row.invoiceNumber ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right align-top text-slate-700">
                    {row.outstanding !== null ? formatNumber(row.outstanding) : "—"}
                    {fullyPaid && <span className="ml-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800">Paid</span>}
                  </td>
                  <td className="w-28 px-2 py-1.5 align-top">
                    <input
                      type="number"
                      step="0.01"
                      value={s.amount}
                      disabled={!s.include}
                      onChange={(e) => patch(row.reviewId, (prev) => ({ ...prev, amount: Number(e.target.value) || 0 }))}
                      className={`${inputClass} disabled:bg-slate-100`}
                    />
                  </td>
                  <td className="w-36 px-2 py-1.5 align-top">
                    <input
                      type="date"
                      value={s.paymentDate}
                      disabled={!s.include}
                      onChange={(e) => patch(row.reviewId, (prev) => ({ ...prev, paymentDate: e.target.value }))}
                      className={`${inputClass} disabled:bg-slate-100`}
                    />
                  </td>
                  <td className="w-28 px-2 py-1.5 align-top">
                    <select
                      value={s.mode}
                      disabled={!s.include}
                      onChange={(e) => patch(row.reviewId, (prev) => ({ ...prev, mode: e.target.value as PaymentMode }))}
                      className={`${inputClass} disabled:bg-slate-100`}
                    >
                      {MODE_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="w-32 px-2 py-1.5 align-top">
                    <input
                      type="text"
                      value={s.utr}
                      disabled={!s.include}
                      onChange={(e) => patch(row.reviewId, (prev) => ({ ...prev, utr: e.target.value }))}
                      className={`${inputClass} disabled:bg-slate-100`}
                    />
                  </td>
                  <td className="w-32 px-2 py-1.5 align-top">
                    <input
                      type="text"
                      value={s.reference}
                      disabled={!s.include}
                      onChange={(e) => patch(row.reviewId, (prev) => ({ ...prev, reference: e.target.value }))}
                      className={`${inputClass} disabled:bg-slate-100`}
                    />
                  </td>
                  <td className="w-32 px-2 py-1.5 align-top">
                    <input
                      type="text"
                      value={s.paidFromLedger}
                      disabled={!s.include}
                      onChange={(e) => patch(row.reviewId, (prev) => ({ ...prev, paidFromLedger: e.target.value }))}
                      className={`${inputClass} disabled:bg-slate-100`}
                      placeholder="e.g. HDFC 2511"
                    />
                  </td>
                  <td className="w-36 px-2 py-1.5 align-top">
                    <input
                      type="text"
                      value={s.proofUrl}
                      disabled={!s.include}
                      onChange={(e) => patch(row.reviewId, (prev) => ({ ...prev, proofUrl: e.target.value }))}
                      className={`${inputClass} disabled:bg-slate-100`}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <input
                      type="checkbox"
                      checked={s.isAdvance}
                      disabled={!s.include}
                      onChange={(e) => patch(row.reviewId, (prev) => ({ ...prev, isAdvance: e.target.checked }))}
                    />
                  </td>
                  <td className="w-32 px-2 py-1.5 align-top">
                    <input
                      type="text"
                      value={s.notes}
                      disabled={!s.include}
                      onChange={(e) => patch(row.reviewId, (prev) => ({ ...prev, notes: e.target.value }))}
                      className={`${inputClass} disabled:bg-slate-100`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || includedRows.length === 0}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {isPending ? "Recording…" : `Submit ${includedRows.length} payment${includedRows.length === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}
