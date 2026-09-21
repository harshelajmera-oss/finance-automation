"use client";

import { useState, useTransition } from "react";
import { previewTallyLedgerList, importAsVendors, importAsExpenseLedgers } from "./actions";
import type { TallyLedgerGroup } from "@/lib/tally/ledger-list-import";
import type { Client } from "@/lib/supabase/types";

export default function ImportLedgersClient({ clients }: { clients: Client[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<TallyLedgerGroup[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  function handlePreview() {
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setError(null);
    setResultMessage(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const result = await previewTallyLedgerList(fd);
      if ("error" in result) {
        setError(result.error);
        setGroups(null);
        return;
      }
      setGroups(result);
      setSelected(new Set());
    });
  }

  function toggle(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function selectedNamesAndLeaves(): { groupName: string; leaves: string[] }[] {
    if (!groups) return [];
    return groups.filter((g) => selected.has(g.index)).map((g) => ({ groupName: g.name, leaves: g.leaves }));
  }

  function handleImportVendors() {
    const picked = selectedNamesAndLeaves();
    if (picked.length === 0 || !clientId) return;
    setError(null);
    setResultMessage(null);
    const names = picked.flatMap((p) => p.leaves);
    startTransition(async () => {
      try {
        const result = await importAsVendors(clientId, names);
        setResultMessage(`Created ${result.created} vendor(s)${result.skipped ? `, skipped ${result.skipped} already there` : ""}.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed.");
      }
    });
  }

  function handleImportExpenseLedgers() {
    const picked = selectedNamesAndLeaves();
    if (picked.length === 0 || !clientId) return;
    setError(null);
    setResultMessage(null);
    const entries = picked.flatMap((p) => p.leaves.map((name) => ({ name, category: p.groupName })));
    startTransition(async () => {
      try {
        const result = await importAsExpenseLedgers(clientId, entries);
        setResultMessage(`Created ${result.created} expense ledger(s)${result.skipped ? `, skipped ${result.skipped} already there` : ""}.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Import into client</label>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>
        <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
        <button
          type="button"
          onClick={handlePreview}
          disabled={isPending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {isPending ? "Reading…" : "Preview groups"}
        </button>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {resultMessage && <p className="text-sm text-green-700">{resultMessage}</p>}

      {groups && (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="w-8 px-3 py-2"></th>
                  <th className="px-3 py-2 font-medium">Group</th>
                  <th className="px-3 py-2 text-right font-medium">Items</th>
                  <th className="px-3 py-2 font-medium">Example</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.index} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(g.index)} onChange={() => toggle(g.index)} />
                    </td>
                    <td className="px-3 py-2 text-slate-900">{g.name}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{g.leaves.length}</td>
                    <td className="px-3 py-2 text-slate-500">{g.leaves[0] ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleImportVendors}
              disabled={isPending || selected.size === 0}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Import selected as vendors
            </button>
            <button
              type="button"
              onClick={handleImportExpenseLedgers}
              disabled={isPending || selected.size === 0}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Import selected as expense ledgers
            </button>
          </div>
        </>
      )}
    </div>
  );
}
