"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitReview } from "../actions";
import { computeGrossUp } from "@/lib/tds/gross-up";
import type { ExtractedFields, ValidationFlag } from "@/lib/extraction/schema";
import type { PaymentRoute, TdsCode, TdsTreatment, Vendor } from "@/lib/supabase/types";

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-500">{label}</label>
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-500">{label}</label>
      <input
        type="number"
        step="0.01"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
    </div>
  );
}

function CheckboxInput({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

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
  const [expenseLedger, setExpenseLedger] = useState(vendorMatch?.default_expense_ledger ?? "");
  const [newVendorName, setNewVendorName] = useState(initialFields.vendor.name ?? "");
  const [newVendorLedger, setNewVendorLedger] = useState("");
  const [newVendorTreatment, setNewVendorTreatment] = useState<TdsTreatment>("deduct");
  const [tdsCode, setTdsCode] = useState(vendorMatch?.last_tds_code ?? "");
  const [tdsRate, setTdsRate] = useState<number | null>(vendorMatch?.last_tds_rate ?? null);
  const [tdsAmount, setTdsAmount] = useState<number | null>(null);
  const [grossUp, setGrossUp] = useState(vendorMatch?.gross_up ?? false);
  const [netAmount, setNetAmount] = useState<number | null>(null);
  const [paymentRoute, setPaymentRoute] = useState<PaymentRoute>("portal");
  const [overrideReason, setOverrideReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasErrorFlags = flags.some((f) => f.severity === "error");
  const grossUpResult = grossUp && tdsRate !== null && netAmount !== null ? computeGrossUp(netAmount, tdsRate) : null;

  function recalculateTds() {
    if (tdsRate === null) return;
    if (grossUp && netAmount !== null) {
      setTdsAmount(computeGrossUp(netAmount, tdsRate).tds);
    } else if (fields.amounts.taxable_value !== null) {
      setTdsAmount(Math.round((fields.amounts.taxable_value * tdsRate) / 100));
    }
  }

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

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Document</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <TextInput label="Type" value={fields.document.type} onChange={(v) => setFields((f) => ({ ...f, document: { ...f.document, type: v } }))} />
          <TextInput label="Invoice number" value={fields.document.invoice_number} onChange={(v) => setFields((f) => ({ ...f, document: { ...f.document, invoice_number: v } }))} />
          <TextInput label="Invoice date" value={fields.document.invoice_date} onChange={(v) => setFields((f) => ({ ...f, document: { ...f.document, invoice_date: v } }))} />
          <TextInput label="Due date" value={fields.document.due_date} onChange={(v) => setFields((f) => ({ ...f, document: { ...f.document, due_date: v } }))} />
          <TextInput label="IRN" value={fields.document.irn} onChange={(v) => setFields((f) => ({ ...f, document: { ...f.document, irn: v } }))} />
          <TextInput label="Currency" value={fields.document.currency} onChange={(v) => setFields((f) => ({ ...f, document: { ...f.document, currency: v } }))} />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Vendor</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <TextInput label="Name" value={fields.vendor.name} onChange={(v) => setFields((f) => ({ ...f, vendor: { ...f.vendor, name: v } }))} />
          <TextInput label="GSTIN" value={fields.vendor.gstin} onChange={(v) => setFields((f) => ({ ...f, vendor: { ...f.vendor, gstin: v } }))} />
          <TextInput label="PAN" value={fields.vendor.pan} onChange={(v) => setFields((f) => ({ ...f, vendor: { ...f.vendor, pan: v } }))} />
          <TextInput label="State" value={fields.vendor.state} onChange={(v) => setFields((f) => ({ ...f, vendor: { ...f.vendor, state: v } }))} />
          <TextInput label="Bank account" value={fields.vendor.bank_account} onChange={(v) => setFields((f) => ({ ...f, vendor: { ...f.vendor, bank_account: v } }))} />
          <TextInput label="IFSC" value={fields.vendor.ifsc} onChange={(v) => setFields((f) => ({ ...f, vendor: { ...f.vendor, ifsc: v } }))} />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Billed to</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <TextInput label="Name" value={fields.billed_to.name} onChange={(v) => setFields((f) => ({ ...f, billed_to: { ...f.billed_to, name: v } }))} />
          <TextInput label="GSTIN" value={fields.billed_to.gstin} onChange={(v) => setFields((f) => ({ ...f, billed_to: { ...f.billed_to, gstin: v } }))} />
          <TextInput label="Place of supply" value={fields.billed_to.place_of_supply} onChange={(v) => setFields((f) => ({ ...f, billed_to: { ...f.billed_to, place_of_supply: v } }))} />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Service</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <TextInput label="Description" value={fields.service.description} onChange={(v) => setFields((f) => ({ ...f, service: { ...f.service, description: v } }))} />
          <TextInput label="SAC / HSN" value={fields.service.sac_hsn} onChange={(v) => setFields((f) => ({ ...f, service: { ...f.service, sac_hsn: v } }))} />
          <TextInput label="Period from" value={fields.service.service_period_from} onChange={(v) => setFields((f) => ({ ...f, service: { ...f.service, service_period_from: v } }))} />
          <TextInput label="Period to" value={fields.service.service_period_to} onChange={(v) => setFields((f) => ({ ...f, service: { ...f.service, service_period_to: v } }))} />
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Line items</span>
            <button
              type="button"
              onClick={() =>
                setFields((f) => ({
                  ...f,
                  service: {
                    ...f.service,
                    line_items: [...f.service.line_items, { description: "", qty: null, rate: null, amount: null }],
                  },
                }))
              }
              className="text-xs text-slate-600 underline hover:text-slate-900"
            >
              Add line
            </button>
          </div>
          <div className="space-y-2">
            {fields.service.line_items.map((line, i) => (
              <div key={i} className="grid grid-cols-5 items-end gap-2">
                <div className="col-span-2">
                  <TextInput
                    label="Description"
                    value={line.description}
                    onChange={(v) =>
                      setFields((f) => ({
                        ...f,
                        service: {
                          ...f.service,
                          line_items: f.service.line_items.map((l, idx) => (idx === i ? { ...l, description: v } : l)),
                        },
                      }))
                    }
                  />
                </div>
                <NumberInput
                  label="Qty"
                  value={line.qty}
                  onChange={(v) =>
                    setFields((f) => ({
                      ...f,
                      service: { ...f.service, line_items: f.service.line_items.map((l, idx) => (idx === i ? { ...l, qty: v } : l)) },
                    }))
                  }
                />
                <NumberInput
                  label="Rate"
                  value={line.rate}
                  onChange={(v) =>
                    setFields((f) => ({
                      ...f,
                      service: { ...f.service, line_items: f.service.line_items.map((l, idx) => (idx === i ? { ...l, rate: v } : l)) },
                    }))
                  }
                />
                <div className="flex items-end gap-1">
                  <NumberInput
                    label="Amount"
                    value={line.amount}
                    onChange={(v) =>
                      setFields((f) => ({
                        ...f,
                        service: { ...f.service, line_items: f.service.line_items.map((l, idx) => (idx === i ? { ...l, amount: v } : l)) },
                      }))
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setFields((f) => ({
                        ...f,
                        service: { ...f.service, line_items: f.service.line_items.filter((_, idx) => idx !== i) },
                      }))
                    }
                    className="mb-0.5 text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {fields.service.line_items.length === 0 && <p className="text-xs text-slate-400">No line items.</p>}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Amounts</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <NumberInput label="Taxable value" value={fields.amounts.taxable_value} onChange={(v) => setFields((f) => ({ ...f, amounts: { ...f.amounts, taxable_value: v } }))} />
          <NumberInput label="CGST" value={fields.amounts.cgst} onChange={(v) => setFields((f) => ({ ...f, amounts: { ...f.amounts, cgst: v } }))} />
          <NumberInput label="SGST" value={fields.amounts.sgst} onChange={(v) => setFields((f) => ({ ...f, amounts: { ...f.amounts, sgst: v } }))} />
          <NumberInput label="IGST" value={fields.amounts.igst} onChange={(v) => setFields((f) => ({ ...f, amounts: { ...f.amounts, igst: v } }))} />
          <NumberInput label="Total" value={fields.amounts.total} onChange={(v) => setFields((f) => ({ ...f, amounts: { ...f.amounts, total: v } }))} />
          <NumberInput label="Already paid" value={fields.amounts.amount_already_paid} onChange={(v) => setFields((f) => ({ ...f, amounts: { ...f.amounts, amount_already_paid: v } }))} />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Notes</h2>
        <div className="space-y-2">
          <CheckboxInput label="TDS mentioned on document" checked={fields.notes.tds_mentioned} onChange={(v) => setFields((f) => ({ ...f, notes: { ...f.notes, tds_mentioned: v } }))} />
          <CheckboxInput label="Reverse charge mentioned" checked={fields.notes.reverse_charge_mentioned} onChange={(v) => setFields((f) => ({ ...f, notes: { ...f.notes, reverse_charge_mentioned: v } }))} />
          <TextInput label="Credit lines against earlier invoices" value={fields.notes.credit_lines_against_earlier_invoices} onChange={(v) => setFields((f) => ({ ...f, notes: { ...f.notes, credit_lines_against_earlier_invoices: v } }))} />
        </div>
      </div>

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

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Ledger, TDS and gross-up</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <TextInput label="Expense ledger" value={expenseLedger} onChange={setExpenseLedger} />
          <div>
            <label className="mb-1 block text-xs text-slate-500">TDS code</label>
            <select
              value={tdsCode}
              onChange={(e) => {
                const code = e.target.value;
                setTdsCode(code);
                const match = tdsCodes.find((c) => c.code === code);
                if (match) setTdsRate(match.default_rate);
              }}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">— none —</option>
              {tdsCodes.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.code} — {c.description} ({c.default_rate}%)
                </option>
              ))}
            </select>
          </div>
          <NumberInput label="TDS rate %" value={tdsRate} onChange={setTdsRate} />
        </div>

        <div className="mt-3">
          <CheckboxInput label="Gross-up (agreed amount is net of TDS)" checked={grossUp} onChange={setGrossUp} />
        </div>

        {grossUp ? (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <NumberInput label="Agreed net amount" value={netAmount} onChange={setNetAmount} />
            <div>
              <label className="mb-1 block text-xs text-slate-500">Gross (computed)</label>
              <p className="rounded-md bg-slate-50 px-2 py-1.5 text-sm text-slate-700">
                {grossUpResult ? grossUpResult.gross.toLocaleString() : "—"}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex items-end gap-3">
          <NumberInput label="TDS amount" value={tdsAmount} onChange={setTdsAmount} />
          <button
            type="button"
            onClick={recalculateTds}
            className="mb-0.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Recalculate
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Payment route</h2>
        <select
          value={paymentRoute}
          onChange={(e) => setPaymentRoute(e.target.value as PaymentRoute)}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm sm:w-1/2"
        >
          <option value="portal">Pay via portal</option>
          <option value="card">Already paid by card</option>
          <option value="employee">Already paid by employee</option>
          <option value="auto_debit">Auto-debit</option>
          <option value="pay_gross_recover">Pay gross and recover TDS</option>
        </select>
      </div>

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
