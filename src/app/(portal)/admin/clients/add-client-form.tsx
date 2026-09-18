"use client";

import { useState, useTransition, type FormEvent } from "react";
import { addClient } from "./actions";

export default function AddClientForm() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [gstin, setGstin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await addClient(name, code, gstin);
        setMessage(`Added ${name}.`);
        setName("");
        setCode("");
        setGstin("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add client.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="min-w-[220px] flex-1">
        <label className="mb-1 block text-sm font-medium text-slate-700">Client name</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Elemento Learning Technologies Private Limited"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="w-32">
        <label className="mb-1 block text-sm font-medium text-slate-700">Code</label>
        <input
          type="text"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ELEM"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm uppercase"
        />
      </div>
      <div className="w-56">
        <label className="mb-1 block text-sm font-medium text-slate-700">GSTIN (optional)</label>
        <input
          type="text"
          value={gstin}
          onChange={(e) => setGstin(e.target.value)}
          placeholder="29AAGCE4102N1ZI"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add client"}
      </button>
      {message && <p className="w-full text-sm text-green-600">{message}</p>}
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
