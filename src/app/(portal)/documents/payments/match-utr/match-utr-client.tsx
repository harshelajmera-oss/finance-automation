"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewBankStatement, confirmUtrMatches, type PreviewResult } from "./actions";
import { formatDate, formatNumber } from "@/lib/format";

export default function MatchUtrClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<number, string>>({}); // statement row index -> payment id
  const [file, setFile] = useState<File | null>(null);

  function handlePreview() {
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const result = await previewBankStatement(fd);
      if ("error" in result) {
        setError(result.error);
        setPreview(null);
        return;
      }
      setPreview(result);
      const initial: Record<number, string> = {};
      result.matches.forEach((m, i) => {
        if (m.matchedPaymentId) initial[i] = m.matchedPaymentId;
      });
      setSelections(initial);
    });
  }

  function handleConfirm() {
    if (!preview) return;
    const chosen = Object.entries(selections)
      .map(([idx, paymentId]) => {
        const m = preview.matches[Number(idx)];
        if (!m?.statementRow.utr) return null;
        return { paymentId, utr: m.statementRow.utr };
      })
      .filter((x): x is { paymentId: string; utr: string } => x !== null);

    if (chosen.length === 0) {
      setError("Nothing selected to confirm.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await confirmUtrMatches(chosen);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/documents/payments");
    });
  }

  const selectedCount = Object.keys(selections).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <button
          type="button"
          onClick={handlePreview}
          disabled={isPending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {isPending ? "Reading…" : "Preview matches"}
        </button>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {preview && (
        <>
          {preview.skippedBlankRows > 0 && (
            <p className="text-xs text-slate-400">Skipped {preview.skippedBlankRows} blank row(s).</p>
          )}
          {preview.matches.length === 0 && <p className="text-sm text-slate-500">No transaction rows found in this file.</p>}

          {preview.matches.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Statement date</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Beneficiary a/c</th>
                    <th className="px-3 py-2 font-medium">UTR</th>
                    <th className="px-3 py-2 font-medium">Match</th>
                    <th className="px-3 py-2 font-medium">Apply to payment</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.matches.map((m, i) => {
                    const candidateIds = m.candidatePaymentIds.length > 0 ? m.candidatePaymentIds : preview.pendingPayments.map((p) => p.id);
                    return (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="whitespace-nowrap px-3 py-2 text-slate-700">{m.statementRow.date ? formatDate(m.statementRow.date) : "—"}</td>
                        <td className="px-3 py-2 text-right text-slate-900">
                          {m.statementRow.amount !== null ? formatNumber(m.statementRow.amount) : "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{m.statementRow.beneficiaryAccount ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-700">
                          {m.statementRow.utr ?? "—"}
                          {m.statementRow.utrGuessed && <span className="ml-1 text-xs text-amber-600">(guessed)</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">{m.reason}</td>
                        <td className="px-3 py-2">
                          <select
                            value={selections[i] ?? ""}
                            onChange={(e) =>
                              setSelections((prev) => {
                                const next = { ...prev };
                                if (e.target.value) next[i] = e.target.value;
                                else delete next[i];
                                return next;
                              })
                            }
                            className="w-56 rounded-md border border-slate-300 px-2 py-1 text-sm"
                          >
                            <option value="">— don&apos;t apply —</option>
                            {candidateIds.map((id) => {
                              const p = preview.pendingPayments.find((pp) => pp.id === id);
                              if (!p) return null;
                              return (
                                <option key={id} value={id}>
                                  {formatDate(p.paymentDate)} · {formatNumber(p.netAmount)} · {p.vendorNames.join(", ") || "—"}
                                </option>
                              );
                            })}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending || selectedCount === 0}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {isPending ? "Saving…" : `Confirm ${selectedCount} match${selectedCount === 1 ? "" : "es"}`}
          </button>
        </>
      )}
    </div>
  );
}
