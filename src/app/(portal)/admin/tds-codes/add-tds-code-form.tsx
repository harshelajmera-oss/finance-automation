"use client";

import { useState, useTransition, type FormEvent } from "react";
import { addTdsCode } from "./actions";

export default function AddTdsCodeForm() {
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [rate, setRate] = useState("");
  const [ledger, setLedger] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await addTdsCode(code, description, Number(rate), ledger);
        setMessage(`Added ${code}.`);
        setCode("");
        setDescription("");
        setRate("");
        setLedger("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add TDS code.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="w-28">
        <label className="mb-1 block text-sm font-medium text-slate-700">Code</label>
        <input
          type="text"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="1027"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="min-w-[200px] flex-1">
        <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
        <input
          type="text"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Professional fees"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="w-24">
        <label className="mb-1 block text-sm font-medium text-slate-700">Rate %</label>
        <input
          type="number"
          step="0.01"
          required
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="10"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="min-w-[200px] flex-1">
        <label className="mb-1 block text-sm font-medium text-slate-700">Tally ledger (optional)</label>
        <input
          type="text"
          value={ledger}
          onChange={(e) => setLedger(e.target.value)}
          placeholder="TDS on Professional Fees"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add code"}
      </button>
      {message && <p className="w-full text-sm text-green-600">{message}</p>}
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
