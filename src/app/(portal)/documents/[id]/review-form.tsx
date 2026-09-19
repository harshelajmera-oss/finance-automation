"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitReview } from "../actions";
import { TextInput, EditableExtractedFields, LedgerTdsFields, PaymentRouteField } from "./field-editors";
import { formatNumber } from "@/lib/format";
import type { ExtractedFields, ValidationFlag } from "@/lib/extraction/schema";
import type { PaymentRoute, TdsCode, TdsTreatment, Vendor } from "@/lib/supabase/types";

export default function ReviewForm({
  documentId,
  initialFields,
  flags,
  vendorMatch,
  possibleNameMatches,
  tdsCodes,
  rejectionComment,
}: {
  documentId: string;
  initialFields: ExtractedFields;
  flags: ValidationFlag[];
  vendorMatch: Vendor | null;
  possibleNameMatches: Vendor[];
  tdsCodes: TdsCode[];
  rejectionComment?: string | null;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<ExtractedFields>(initialFields);
  const payout = initialFields.payout ?? null;
  const payoutTdsCodeGuess = payout
    ? tdsCodes.find((c) => payout.tds_rate_percent !== null && Math.abs(c.default_rate - payout.tds_rate_percent) < 0.5)
    : null;

  const [expenseLedger, setExpenseLedger] = useState(vendorMatch?.default_expense_ledger ?? "");
  const [newVendorName, setNewVendorName] = useState(initialFields.vendor.name ?? "");
  const [newVendorLedger, setNewVendorLedger] = useState("");
  const [newVendorTreatment, setNewVendorTreatment] = useState<TdsTreatment>("deduct");
  const [tdsCode, setTdsCode] = useState(vendorMatch?.last_tds_code ?? payoutTdsCodeGuess?.code ?? "");
  const [tdsRate, setTdsRate] = useState<number | null>(
    vendorMatch?.last_tds_rate ?? payout?.tds_rate_percent ?? null,
  );
  const [tdsAmount, setTdsAmount] = useState<number | null>(payout?.tds ?? null);
  const [grossUp, setGrossUp] = useState(vendorMatch?.gross_up ?? Boolean(payout));
  const [netAmount, setNetAmount] = useState<number | null>(payout?.net ?? null);
  const [paymentRoute, setPaymentRoute] = useState<PaymentRoute>("portal");
  const [overrideReason, setOverrideReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasErrorFlags = flags.some((f) => f.severity === "error");

  function handleSubmit() {
    setError(null);

    if (hasErrorFlags && !overrideReason.trim()) {
      setError("There are unresolved red flags — write a reason to submit anyway, or fix the fields above.");
      return;
    }
    if (!vendorMatch && !newVendorName.trim()) {
      setError("Enter a vendor name.");
      return;
    }

    startTransition(async () => {
      try {
        await submitReview(documentId, {
          reviewedFields: fields,
          vendor: vendorMatch
            ? { id: vendorMatch.id, name: vendorMatch.name, tallyLedgerName: vendorMatch.tally_ledger_name ?? "", tdsTreatment: vendorMatch.tds_treatment }
            : { name: newVendorName, tallyLedgerName: newVendorLedger, tdsTreatment: newVendorTreatment },
          expenseLedger,
          tdsCode: tdsCode || null,
          tdsRate,
          tdsAmount,
          grossUp,
          paymentRoute,
          overrideReason: overrideReason.trim() || null,
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not submit for review.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {payout && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-medium">From the payout sheet: {payout.source_row_label}</p>
          <p className="mt-1">
            Gross ₹{payout.gross !== null ? formatNumber(payout.gross) : "—"}, TDS ₹
            {payout.tds !== null ? formatNumber(payout.tds) : "—"}, net ₹
            {payout.net !== null ? formatNumber(payout.net) : "—"}
            {payout.bank_account_name ? ` — bank account is in the name of ${payout.bank_account_name}` : ""}.
            Gross-up, the TDS rate and the amounts below are pre-filled from this — check them before submitting.
          </p>
        </div>
      )}

      {rejectionComment && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">Sent back by the checker:</p>
          <p className="mt-1 text-sm text-red-700">{rejectionComment}</p>
        </div>
      )}

      {flags.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Flags from extraction</h2>
          <ul className="space-y-1">
            {flags.map((f, i) => (
              <li key={i} className={`text-sm ${f.severity === "error" ? "text-red-700" : "text-amber-700"}`}>
                {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <EditableExtractedFields fields={fields} setFields={setFields} />

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Vendor match</h2>
        {vendorMatch ? (
          <p className="text-sm text-slate-700">
            Matched to an existing vendor: <span className="font-medium">{vendorMatch.name}</span>
            {vendorMatch.is_approved ? "" : " (pending approval)"} — its ledger and TDS history are used as the
            starting point below.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              No existing vendor matched by GSTIN or PAN. This will create a new vendor, pending a checker&apos;s
              approval.
            </p>
            {possibleNameMatches.length > 0 && (
              <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">
                Possibly the same as: {possibleNameMatches.map((v) => v.name).join(", ")} — check before treating
                this as new.
              </p>
            )}
            <TextInput label="Vendor name" value={newVendorName} onChange={setNewVendorName} />
            <TextInput label="Tally ledger name" value={newVendorLedger} onChange={setNewVendorLedger} />
            <div>
              <label className="mb-1 block text-xs text-slate-500">TDS treatment</label>
              <select
                value={newVendorTreatment}
                onChange={(e) => setNewVendorTreatment(e.target.value as TdsTreatment)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="deduct">Deduct at payment</option>
                <option value="pay_gross_recover">Pay gross and recover</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <LedgerTdsFields
        state={{ expenseLedger, setExpenseLedger, tdsCode, setTdsCode, tdsRate, setTdsRate, tdsAmount, setTdsAmount, grossUp, setGrossUp, netAmount, setNetAmount }}
        tdsCodes={tdsCodes}
        taxableValue={fields.amounts.taxable_value}
        total={fields.amounts.total}
      />

      <PaymentRouteField value={paymentRoute} onChange={setPaymentRoute} />

      {hasErrorFlags && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <label className="mb-1 block text-sm font-medium text-red-800">
            Reason for submitting despite the red flags above
          </label>
          <textarea
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-red-300 px-2 py-1.5 text-sm"
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {isPending ? "Submitting…" : "Submit to checker"}
      </button>
    </div>
  );
}
