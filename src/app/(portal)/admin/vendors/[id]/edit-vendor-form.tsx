"use client";

import { useState, useTransition, type FormEvent } from "react";
import { updateVendor } from "../actions";
import type { TdsCode, TdsTreatment, Vendor } from "@/lib/supabase/types";

export default function EditVendorForm({ vendor, tdsCodes }: { vendor: Vendor; tdsCodes: TdsCode[] }) {
  const [name, setName] = useState(vendor.name);
  const [gstin, setGstin] = useState(vendor.gstin ?? "");
  const [pan, setPan] = useState(vendor.pan ?? "");
  const [state, setState] = useState(vendor.state ?? "");
  const [udyamNumber, setUdyamNumber] = useState(vendor.udyam_number ?? "");
  const [tallyLedgerName, setTallyLedgerName] = useState(vendor.tally_ledger_name ?? "");
  const [defaultExpenseLedger, setDefaultExpenseLedger] = useState(vendor.default_expense_ledger ?? "");
  const [defaultTdsCode, setDefaultTdsCode] = useState(vendor.default_tds_code ?? "");
  const [defaultTdsRate, setDefaultTdsRate] = useState<number | null>(vendor.default_tds_rate);
  const [grossUp, setGrossUp] = useState(vendor.gross_up);
  const [tdsTreatment, setTdsTreatment] = useState<TdsTreatment>(vendor.tds_treatment);
  const [isApproved, setIsApproved] = useState(vendor.is_approved);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await updateVendor(vendor.id, {
          name,
          gstin,
          pan,
          state,
          udyam_number: udyamNumber,
          tally_ledger_name: tallyLedgerName,
          default_expense_ledger: defaultExpenseLedger,
          default_tds_code: defaultTdsCode,
          default_tds_rate: defaultTdsRate,
          gross_up: grossUp,
          tds_treatment: tdsTreatment,
          is_approved: isApproved,
        });
        setMessage("Saved.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save changes.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">State</label>
          <input
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">GSTIN</label>
          <input
            type="text"
            value={gstin}
            onChange={(e) => setGstin(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">PAN</label>
          <input
            type="text"
            value={pan}
            onChange={(e) => setPan(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">Udyam number</label>
          <input
            type="text"
            value={udyamNumber}
            onChange={(e) => setUdyamNumber(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Tally ledger name</label>
        <input
          type="text"
          value={tallyLedgerName}
          onChange={(e) => setTallyLedgerName(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Default expense ledger</label>
        <input
          type="text"
          value={defaultExpenseLedger}
          onChange={(e) => setDefaultExpenseLedger(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Recommended TDS code</label>
          <select
            value={defaultTdsCode}
            onChange={(e) => {
              const code = e.target.value;
              setDefaultTdsCode(code);
              const match = tdsCodes.find((c) => c.code === code);
              setDefaultTdsRate(match ? match.default_rate : null);
            }}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">— none —</option>
            {tdsCodes.map((c) => (
              <option key={c.id} value={c.code}>
                {c.code} — {c.description} ({c.default_rate}%)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Recommended TDS rate %</label>
          <input
            type="number"
            step="0.01"
            value={defaultTdsRate ?? ""}
            onChange={(e) => setDefaultTdsRate(e.target.value === "" ? null : Number(e.target.value))}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <p className="-mt-2 text-xs text-slate-400">
        Suggested automatically on this vendor&apos;s first invoice, before there&apos;s any history to learn
        from — always still editable per invoice, same as the rate itself.
      </p>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">TDS treatment</label>
        <select
          value={tdsTreatment}
          onChange={(e) => setTdsTreatment(e.target.value as TdsTreatment)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="deduct">Deduct at payment</option>
          <option value="pay_gross_recover">Pay gross and recover</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={grossUp} onChange={(e) => setGrossUp(e.target.checked)} />
        Gross-up by default for this vendor
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={isApproved} onChange={(e) => setIsApproved(e.target.checked)} />
        Approved
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-600">{message}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
