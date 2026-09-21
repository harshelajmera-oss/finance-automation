"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitPayment } from "../actions";
import { allocationAmounts } from "@/lib/payments/allocation";
import { formatDate, formatNumber } from "@/lib/format";
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

const MODE_OPTIONS: { value: PaymentMode; label: string }[] = [
  { value: "neft", label: "NEFT" },
  { value: "rtgs", label: "RTGS" },
  { value: "imps", label: "IMPS" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "auto_debit", label: "Auto-debit" },
  { value: "employee_paid", label: "Employee-paid" },
];

const inputClass = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function RecordPaymentForm({ rows }: { rows: PayableRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [included, setIncluded] = useState<Set<string>>(
    new Set(rows.filter((r) => (r.outstanding ?? 0) > 0).map((r) => r.reviewId)),
  );
  const [amounts, setAmounts] = useState<Record<string, number>>(
    Object.fromEntries(rows.map((r) => [r.reviewId, r.outstanding ?? 0])),
  );

  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [mode, setMode] = useState<PaymentMode>("neft");
  const [utr, setUtr] = useState("");
  const [reference, setReference] = useState("");
  const [paidFromLedger, setPaidFromLedger] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [isAdvance, setIsAdvance] = useState(false);
  const [notes, setNotes] = useState("");

  const includedRows = rows.filter((r) => included.has(r.reviewId));
  const netTotal = includedRows.reduce((sum, r) => sum + (amounts[r.reviewId] || 0), 0);

  const invoiceDates = includedRows.map((r) => r.invoiceDate).filter((d): d is string => !!d);
  const earliestInvoiceDate = invoiceDates.length > 0 ? invoiceDates.reduce((min, d) => (d < min ? d : min)) : null;

  const dateWarning =
    !isAdvance && earliestInvoiceDate && paymentDate < earliestInvoiceDate
      ? `Payment date is before the earliest invoice date (${formatDate(earliestInvoiceDate)}) — tick "This is an advance" if that's intended.`
      : null;

  function toggle(id: string) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit() {
    setError(null);
    if (includedRows.length === 0) {
      setError("Tick at least one row to pay.");
      return;
    }
    if (dateWarning) {
      setError(dateWarning);
      return;
    }
    for (const row of includedRows) {
      const amt = amounts[row.reviewId];
      if (!amt || amt <= 0) {
        setError(`Enter a positive amount for ${row.vendorName}.`);
        return;
      }
    }

    const allocations = includedRows.map((row) => {
      const amount = amounts[row.reviewId];
      const { grossAmount, tdsAmount } = allocationAmounts(row, amount);
      return { reviewId: row.reviewId, amount, grossAmount, tdsAmount };
    });

    startTransition(async () => {
      const result = await submitPayment({
        paymentDate,
        mode,
        utr: utr.trim() || null,
        reference: reference.trim() || null,
        paidFromLedger: paidFromLedger.trim() || null,
        proofUrl: proofUrl.trim() || null,
        isAdvance,
        notes: notes.trim() || null,
        allocations,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/documents/payments");
    });
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="w-8 px-3 py-2"></th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Vendor</th>
              <th className="px-3 py-2 font-medium">Invoice</th>
              <th className="px-3 py-2 text-right font-medium">Already paid</th>
              <th className="px-3 py-2 text-right font-medium">Outstanding</th>
              <th className="px-3 py-2 text-right font-medium">Amount now</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isIncluded = included.has(row.reviewId);
              const fullyPaid = (row.outstanding ?? 0) <= 0;
              return (
                <tr key={row.reviewId} className={`border-b border-slate-100 last:border-0 ${fullyPaid ? "bg-slate-50 text-slate-400" : ""}`}>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={isIncluded} onChange={() => toggle(row.reviewId)} disabled={fullyPaid} />
                  </td>
                  <td className="px-3 py-2">{row.clientLabel}</td>
                  <td className="px-3 py-2">{row.vendorName}</td>
                  <td className="px-3 py-2">{row.invoiceNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(row.paidSoFar)}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {row.outstanding !== null ? formatNumber(row.outstanding) : "—"}
                    {fullyPaid && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Paid in full</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="0.01"
                      className="w-28 rounded-md border border-slate-300 px-2 py-1 text-right text-sm disabled:bg-slate-100"
                      value={amounts[row.reviewId] ?? ""}
                      disabled={!isIncluded}
                      onChange={(e) =>
                        setAmounts((prev) => ({ ...prev, [row.reviewId]: e.target.value === "" ? 0 : Number(e.target.value) }))
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Payment details</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Payment date</label>
            <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)} className={inputClass}>
              {MODE_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">UTR</label>
            <input type="text" value={utr} onChange={(e) => setUtr(e.target.value)} className={inputClass} placeholder="From bank statement" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Reference</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className={inputClass}
              placeholder="Razorpay payout ID / batch ref"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Paid from</label>
            <input
              type="text"
              value={paidFromLedger}
              onChange={(e) => setPaidFromLedger(e.target.value)}
              className={inputClass}
              placeholder="e.g. HDFC 2511"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Proof (Drive link)</label>
            <input type="text" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs text-slate-500">Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isAdvance} onChange={(e) => setIsAdvance(e.target.checked)} />
          This is an advance (payment date may be before the invoice date)
        </label>
      </div>

      {dateWarning && !error && <p className="text-sm text-amber-700">{dateWarning}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {isPending ? "Recording…" : `Record payment of ${formatNumber(netTotal)}`}
        </button>
      </div>
    </div>
  );
}
