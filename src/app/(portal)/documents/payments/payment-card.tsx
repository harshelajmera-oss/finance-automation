"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editPayment } from "./actions";
import { formatDate, formatNumber } from "@/lib/format";
import type { PaymentHistoryRow } from "@/lib/extraction/payments";
import type { PaymentMode } from "@/lib/supabase/types";

const MODE_LABELS: Record<string, string> = {
  neft: "NEFT",
  rtgs: "RTGS",
  imps: "IMPS",
  upi: "UPI",
  card: "Card",
  auto_debit: "Auto-debit",
  employee_paid: "Employee-paid",
};

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

export default function PaymentCard({ payment }: { payment: PaymentHistoryRow }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [paymentDate, setPaymentDate] = useState(payment.paymentDate);
  const [mode, setMode] = useState<PaymentMode>(payment.mode);
  const [utr, setUtr] = useState(payment.utr ?? "");
  const [reference, setReference] = useState(payment.reference ?? "");
  const [paidFromLedger, setPaidFromLedger] = useState(payment.paidFromLedger ?? "");
  const [proofUrl, setProofUrl] = useState(payment.proofUrl ?? "");
  const [isAdvance, setIsAdvance] = useState(payment.isAdvance);
  const [notes, setNotes] = useState(payment.notes ?? "");

  function cancel() {
    setPaymentDate(payment.paymentDate);
    setMode(payment.mode);
    setUtr(payment.utr ?? "");
    setReference(payment.reference ?? "");
    setPaidFromLedger(payment.paidFromLedger ?? "");
    setProofUrl(payment.proofUrl ?? "");
    setIsAdvance(payment.isAdvance);
    setNotes(payment.notes ?? "");
    setError(null);
    setIsEditing(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await editPayment({
        paymentId: payment.id,
        paymentDate,
        mode,
        utr: utr.trim() || null,
        reference: reference.trim() || null,
        paidFromLedger: paidFromLedger.trim() || null,
        proofUrl: proofUrl.trim() || null,
        isAdvance,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIsEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      {isEditing ? (
        <div className="space-y-3">
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
              <input type="text" value={utr} onChange={(e) => setUtr(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Reference</label>
              <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Paid from</label>
              <input type="text" value={paidFromLedger} onChange={(e) => setPaidFromLedger(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Proof (Drive link)</label>
              <input type="text" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Notes</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isAdvance} onChange={(e) => setIsAdvance(e.target.checked)} />
            This is an advance
          </label>
          <p className="text-xs text-slate-400">
            The amount and which invoices this payment covers can&apos;t be changed here — only the details above. To
            fix the amount or allocation, contact an admin.
          </p>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={isPending}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-medium text-slate-900">{formatDate(payment.paymentDate)}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              {MODE_LABELS[payment.mode] ?? payment.mode}
            </span>
            {payment.isAdvance && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Advance</span>
            )}
            {payment.utr ? (
              <span className="text-slate-500">UTR {payment.utr}</span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">No UTR yet</span>
            )}
            {payment.reference && <span className="text-slate-500">Ref {payment.reference}</span>}
            {payment.paidFromLedger && <span className="text-slate-500">from {payment.paidFromLedger}</span>}
            {payment.proofUrl && (
              <a href={payment.proofUrl} target="_blank" rel="noreferrer" className="text-slate-500 underline hover:text-slate-900">
                Proof
              </a>
            )}
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Edit
            </button>
            <span className="ml-auto text-right font-semibold text-slate-900">
              Net {formatNumber(payment.netAmount)} (Gross {formatNumber(payment.grossAmount)}, TDS {formatNumber(payment.tdsAmount)})
            </span>
          </div>
          {payment.notes && <p className="mb-2 text-sm text-slate-500">{payment.notes}</p>}
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="py-1 font-medium">Client</th>
                <th className="py-1 font-medium">Vendor</th>
                <th className="py-1 font-medium">Invoice</th>
                <th className="py-1 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payment.lines.map((line) => (
                <tr key={line.reviewId} className="border-t border-slate-100">
                  <td className="py-1 text-slate-700">{line.clientName}</td>
                  <td className="py-1 text-slate-700">{line.vendorName}</td>
                  <td className="py-1 text-slate-700">{line.invoiceNumber ?? "—"}</td>
                  <td className="py-1 text-right text-slate-900">{formatNumber(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
