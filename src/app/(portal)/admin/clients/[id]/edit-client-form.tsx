"use client";

import { useState, useTransition, type FormEvent } from "react";
import { updateClient } from "../actions";
import type { Client } from "@/lib/supabase/types";

export default function EditClientForm({ client }: { client: Client }) {
  const [name, setName] = useState(client.name);
  const [code, setCode] = useState(client.code);
  const [gstin, setGstin] = useState(client.gstin ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await updateClient(client.id, name, code, gstin);
        setMessage("Saved.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save changes.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Client name</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Code</label>
        <input
          type="text"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm uppercase"
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
