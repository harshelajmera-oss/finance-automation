"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addExpenseLedger, setExpenseLedgerActive, uploadExpenseLedgers } from "./actions";
import type { Client, ExpenseLedger } from "@/lib/supabase/types";

export default function ExpenseLedgerManager({
  clients,
  clientId,
  ledgers,
  showAll,
}: {
  clients: Client[];
  clientId: string;
  ledgers: ExpenseLedger[];
  showAll: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  function handleClientChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(`/documents/expense-ledgers?clientId=${e.target.value}${showAll ? "&showAll=1" : ""}`);
  }

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      try {
        await addExpenseLedger(clientId, name, category);
        setName("");
        setCategory("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add that ledger.");
      }
    });
  }

  function handleToggle(id: string, isActive: boolean) {
    startTransition(async () => {
      await setExpenseLedgerActive(id, isActive);
      router.refresh();
    });
  }

  function handleUpload() {
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setError(null);
    setUploadMessage(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      try {
        const result = await uploadExpenseLedgers(clientId, fd);
        if (result.missingColumns.length > 0) {
          setError(`Couldn't find a "Ledger Name" column in this file.`);
          return;
        }
        setUploadMessage(
          `Added ${result.created}, updated ${result.updated}${result.skippedBlankRows ? `, skipped ${result.skippedBlankRows} blank row(s)` : ""}.`,
        );
        setFile(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Client</label>
          <select
            value={clientId}
            onChange={handleClientChange}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>
        <a
          href={`/documents/expense-ledgers?clientId=${clientId}${showAll ? "" : "&showAll=1"}`}
          className="text-sm text-slate-500 underline hover:text-slate-900"
        >
          {showAll ? "Hide archived" : "Show archived too"}
        </a>
        <Link href="/documents/expense-ledgers/template" className="ml-auto text-sm text-slate-600 underline hover:text-slate-900">
          Download blank template
        </Link>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Add a ledger</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Ledger name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-64 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Category (optional)</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-64 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={isPending || !name.trim()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Bulk upload</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          <button
            type="button"
            onClick={handleUpload}
            disabled={isPending}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Upload
          </button>
        </div>
        {uploadMessage && <p className="mt-2 text-sm text-green-700">{uploadMessage}</p>}
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Ledger name</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {ledgers.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 text-slate-900">{l.name}</td>
                <td className="px-3 py-2 text-slate-500">{l.category ?? "—"}</td>
                <td className="px-3 py-2">
                  {l.is_active ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Active</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Archived</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => handleToggle(l.id, !l.is_active)}
                    disabled={isPending}
                    className="text-sm text-slate-500 underline hover:text-slate-900"
                  >
                    {l.is_active ? "Archive" : "Restore"}
                  </button>
                </td>
              </tr>
            ))}
            {ledgers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                  No expense ledgers for this client yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
