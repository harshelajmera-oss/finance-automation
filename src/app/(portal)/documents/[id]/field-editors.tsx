"use client";

import { computeGrossUp } from "@/lib/tds/gross-up";
import type { ExtractedFields } from "@/lib/extraction/schema";
import type { PaymentRoute, TdsCode } from "@/lib/supabase/types";

export function TextInput({
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

export function NumberInput({
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

export function CheckboxInput({
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

/** The document/vendor/billed-to/service/amounts/notes groups — shared between the maker's and the checker's editing screens. */
export function EditableExtractedFields({
  fields,
  setFields,
}: {
  fields: ExtractedFields;
  setFields: (updater: (f: ExtractedFields) => ExtractedFields) => void;
}) {
  return (
    <>
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
    </>
  );
}

export interface LedgerTdsState {
  expenseLedger: string;
  setExpenseLedger: (v: string) => void;
  tdsCode: string;
  setTdsCode: (v: string) => void;
  tdsRate: number | null;
  setTdsRate: (v: number | null) => void;
  tdsAmount: number | null;
  setTdsAmount: (v: number | null) => void;
  grossUp: boolean;
  setGrossUp: (v: boolean) => void;
  netAmount: number | null;
  setNetAmount: (v: number | null) => void;
}

/** Expense ledger, TDS code/rate/amount, and gross-up — shared between maker and checker editing. */
export function LedgerTdsFields({ state, tdsCodes, taxableValue }: { state: LedgerTdsState; tdsCodes: TdsCode[]; taxableValue: number | null }) {
  const { expenseLedger, setExpenseLedger, tdsCode, setTdsCode, tdsRate, setTdsRate, tdsAmount, setTdsAmount, grossUp, setGrossUp, netAmount, setNetAmount } = state;
  const grossUpResult = grossUp && tdsRate !== null && netAmount !== null ? computeGrossUp(netAmount, tdsRate) : null;

  function recalculateTds() {
    if (tdsRate === null) return;
    if (grossUp && netAmount !== null) {
      setTdsAmount(computeGrossUp(netAmount, tdsRate).tds);
    } else if (taxableValue !== null) {
      setTdsAmount(Math.round((taxableValue * tdsRate) / 100));
    }
  }

  return (
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
  );
}

export function PaymentRouteField({ value, onChange }: { value: PaymentRoute; onChange: (v: PaymentRoute) => void }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Payment route</h2>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PaymentRoute)}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm sm:w-1/2"
      >
        <option value="portal">Pay via portal</option>
        <option value="card">Already paid by card</option>
        <option value="employee">Already paid by employee</option>
        <option value="auto_debit">Auto-debit</option>
        <option value="pay_gross_recover">Pay gross and recover TDS</option>
      </select>
    </div>
  );
}
