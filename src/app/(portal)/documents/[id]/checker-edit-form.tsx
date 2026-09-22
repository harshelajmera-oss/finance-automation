"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { checkerDecide } from "../actions";
import { EditableExtractedFields, LedgerTdsFields, PaymentRouteField } from "./field-editors";
import { formatNumber } from "@/lib/format";
import type { ExtractedFields, ValidationFlag } from "@/lib/extraction/schema";
import type { ExpenseLedger, PaymentRoute, Review, TdsCode } from "@/lib/supabase/types";

export default function CheckerEditForm({
  review,
  flags,
  tdsCodes,
  expenseLedgers,
  vendorName,
  vendorPendingId,
}: {
  review: Review;
  flags: ValidationFlag[];
  tdsCodes: TdsCode[];
  expenseLedgers: ExpenseLedger[];
  vendorName: string | null;
  vendorPendingId: string | null;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<ExtractedFields>(review.reviewed_fields);
  const [expenseLedger, setExpenseLedger] = useState(review.expense_ledger ?? "");
  const [tdsCode, setTdsCode] = useState(review.tds_code ?? "");
  const [tdsRate, setTdsRate] = useState<number | null>(review.tds_rate);
  const [tdsAmount, setTdsAmount] = useState<number | null>(review.tds_amount);
  const [grossUp, setGrossUp] = useState(review.gross_up);
  const [netAmount, setNetAmount] = useState<number | null>(null);
  const [paymentRoute, setPaymentRoute] = useState<PaymentRoute>(review.payment_route);
  const [comment, setComment] = useState("");
  const [approveVendor, setApproveVendor] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function edits() {
    return { reviewedFields: fields, expenseLedger, tdsCode: tdsCode || null, tdsRate, tdsAmount, grossUp, paymentRoute };
  }

  function decide(status: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      try {
        await checkerDecide(
          review.id,
          status,
          comment,
          status === "approved" && approveVendor ? vendorPendingId : null,
          edits(),
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not record your decision.");
      }
    });
  }

  const payout = review.reviewed_fields.payout ?? null;

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
          </p>
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

      {review.override_reason && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Maker submitted despite open flags: {review.override_reason}
        </p>
      )}

      <p className="text-sm text-slate-500">
        Vendor: <span className="font-medium text-slate-900">{vendorName ?? "—"}</span> — vendor identity isn&apos;t
        editable here; use{" "}
        <Link href="/admin/vendors" className="underline">
          Manage vendors
        </Link>{" "}
        for that.
      </p>

      <EditableExtractedFields fields={fields} setFields={setFields} />

      <LedgerTdsFields
        state={{ expenseLedger, setExpenseLedger, tdsCode, setTdsCode, tdsRate, setTdsRate, tdsAmount, setTdsAmount, grossUp, setGrossUp, netAmount, setNetAmount }}
        tdsCodes={tdsCodes}
        expenseLedgers={expenseLedgers}
        taxableValue={fields.amounts.taxable_value}
        total={fields.amounts.total}
        amountAlreadyPaid={fields.amounts.amount_already_paid}
      />

      <PaymentRouteField value={paymentRoute} onChange={setPaymentRoute} />

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Your decision</h2>

        {vendorPendingId && (
          <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={approveVendor} onChange={(e) => setApproveVendor(e.target.checked)} />
            Also approve the new vendor
          </label>
        )}

        <label className="mb-1 block text-sm font-medium text-slate-700">
          Comment {"("}required to reject; if you changed anything above, say why{")"}
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          className="mb-3 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />

        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => decide("approved")}
            disabled={isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => decide("rejected")}
            disabled={isPending}
            className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
