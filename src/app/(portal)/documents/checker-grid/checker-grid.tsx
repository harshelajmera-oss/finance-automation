"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { checkerDecide } from "../actions";
import { computeGrossUp } from "@/lib/tds/gross-up";
import type { ExtractedFields } from "@/lib/extraction/schema";
import type { PaymentRoute, TdsCode, Vendor } from "@/lib/supabase/types";

export interface CheckerGridRow {
  reviewId: string;
  documentId: string;
  originalFilename: string;
  clientName: string;
  clientCode: string;
  clientGstin: string | null;
  fields: ExtractedFields;
  vendor: Vendor | null;
  vendorPendingId: string | null;
  expenseLedger: string | null;
  tdsCode: string | null;
  tdsRate: number | null;
  tdsAmount: number | null;
  grossUp: boolean;
  paymentRoute: PaymentRoute;
  overrideReason: string | null;
}

interface RowState {
  vendorName: string;
  vendorGstin: string;
  vendorPan: string;
  billedToName: string;
  natureOfService: string;
  total: number | null;
  igst: number | null;
  cgst: number | null;
  sgst: number | null;
  bankAccount: string;
  ifsc: string;
  grossUp: boolean;
  netAmount: number | null;
  tdsCode: string;
  tdsRate: number | null;
  tdsAmount: number | null;
  paymentRoute: PaymentRoute;
  comment: string;
  approveVendor: boolean;
}

interface Outcome {
  reviewId: string;
  label: string;
  status: "ok" | "error";
  error?: string;
}

function computeTds(state: Pick<RowState, "tdsRate" | "grossUp" | "netAmount" | "total" | "tdsAmount">): number | null {
  if (state.tdsRate === null) return state.tdsAmount;
  if (state.grossUp && state.netAmount !== null) return computeGrossUp(state.netAmount, state.tdsRate).tds;
  if (state.total !== null) return Math.round((state.total * state.tdsRate) / 100);
  return state.tdsAmount;
}

function initRowState(row: CheckerGridRow): RowState {
  return {
    vendorName: row.fields.vendor.name ?? "",
    vendorGstin: row.fields.vendor.gstin ?? "",
    vendorPan: row.fields.vendor.pan ?? "",
    billedToName: row.fields.billed_to.name ?? "",
    natureOfService: row.fields.service.description ?? "",
    total: row.fields.amounts.total,
    igst: row.fields.amounts.igst,
    cgst: row.fields.amounts.cgst,
    sgst: row.fields.amounts.sgst,
    bankAccount: row.fields.vendor.bank_account ?? "",
    ifsc: row.fields.vendor.ifsc ?? "",
    grossUp: row.grossUp,
    netAmount: row.fields.payout?.net ?? null,
    tdsCode: row.tdsCode ?? "",
    tdsRate: row.tdsRate,
    tdsAmount: row.tdsAmount,
    paymentRoute: row.paymentRoute,
    comment: "",
    approveVendor: true,
  };
}

function Cell({ children, width = "w-28" }: { children: React.ReactNode; width?: string }) {
  return <td className={`border-r border-slate-100 px-1.5 py-1 align-top ${width}`}>{children}</td>;
}

const inputClass = "w-full rounded border border-slate-300 px-1.5 py-1 text-xs";

function GText({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
}

function GNumber({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <input
      type="number"
      step="0.01"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className={inputClass}
    />
  );
}

export default function CheckerGrid({ rows, tdsCodes }: { rows: CheckerGridRow[]; tdsCodes: TdsCode[] }) {
  const router = useRouter();
  const [states, setStates] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(rows.map((r) => [r.reviewId, initRowState(r)])),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const rowsById = useMemo(() => new Map(rows.map((r) => [r.reviewId, r])), [rows]);

  function patch(id: string, updater: (s: RowState) => RowState) {
    setStates((prev) => ({ ...prev, [id]: updater(prev[id]) }));
  }

  function patchAndRecalc(id: string, updater: (s: RowState) => RowState) {
    patch(id, (s) => {
      const next = updater(s);
      return { ...next, tdsAmount: computeTds(next) };
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.reviewId))));
  }

  function buildEdits(row: CheckerGridRow, state: RowState) {
    const fields: ExtractedFields = {
      ...row.fields,
      vendor: {
        ...row.fields.vendor,
        name: state.vendorName.trim() || null,
        gstin: state.vendorGstin.trim() || null,
        pan: state.vendorPan.trim() || null,
        bank_account: state.bankAccount.trim() || null,
        ifsc: state.ifsc.trim() || null,
      },
      billed_to: { ...row.fields.billed_to, name: state.billedToName.trim() || null },
      service: { ...row.fields.service, description: state.natureOfService.trim() || null },
      amounts: { ...row.fields.amounts, total: state.total, igst: state.igst, cgst: state.cgst, sgst: state.sgst },
    };
    return {
      reviewedFields: fields,
      expenseLedger: row.expenseLedger ?? "",
      tdsCode: state.tdsCode || null,
      tdsRate: state.tdsRate,
      tdsAmount: state.tdsAmount,
      grossUp: state.grossUp,
      paymentRoute: state.paymentRoute,
    };
  }

  function decideOne(row: CheckerGridRow, state: RowState, status: "approved" | "rejected") {
    return checkerDecide(row.reviewId, status, state.comment, status === "approved" && state.approveVendor ? row.vendorPendingId : null, buildEdits(row, state));
  }

  function handleReject(row: CheckerGridRow) {
    const state = states[row.reviewId];
    if (!state.comment.trim()) {
      setOutcomes([{ reviewId: row.reviewId, label: state.vendorName || row.originalFilename, status: "error", error: "A comment is required to reject." }]);
      return;
    }
    startTransition(async () => {
      try {
        await decideOne(row, state, "rejected");
        setOutcomes([{ reviewId: row.reviewId, label: state.vendorName || row.originalFilename, status: "ok" }]);
        router.refresh();
      } catch (err) {
        setOutcomes([{ reviewId: row.reviewId, label: state.vendorName || row.originalFilename, status: "error", error: err instanceof Error ? err.message : "Failed." }]);
      }
    });
  }

  function handleApproveOne(row: CheckerGridRow) {
    const state = states[row.reviewId];
    startTransition(async () => {
      try {
        await decideOne(row, state, "approved");
        setOutcomes([{ reviewId: row.reviewId, label: state.vendorName || row.originalFilename, status: "ok" }]);
        router.refresh();
      } catch (err) {
        setOutcomes([{ reviewId: row.reviewId, label: state.vendorName || row.originalFilename, status: "error", error: err instanceof Error ? err.message : "Failed." }]);
      }
    });
  }

  function handleApproveSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    setOutcomes(null);
    startTransition(async () => {
      const results: Outcome[] = [];
      for (const id of ids) {
        const row = rowsById.get(id);
        const state = states[id];
        if (!row || !state) continue;
        const label = state.vendorName || row.originalFilename;
        try {
          await decideOne(row, state, "approved");
          results.push({ reviewId: id, label, status: "ok" });
        } catch (err) {
          results.push({ reviewId: id, label, status: "error", error: err instanceof Error ? err.message : "Failed." });
        }
      }
      setOutcomes(results);
      setSelected((prev) => {
        const next = new Set(prev);
        for (const r of results) if (r.status === "ok") next.delete(r.reviewId);
        return next;
      });
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-400">Nothing waiting on you right now.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={toggleAll} className="text-sm text-slate-600 underline hover:text-slate-900">
          {selected.size === rows.length ? "Clear selection" : `Select all (${rows.length})`}
        </button>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={handleApproveSelected}
            disabled={isPending}
            className="ml-auto rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {isPending ? "Approving…" : `Approve selected (${selected.size})`}
          </button>
        )}
      </div>

      {outcomes && (
        <ul className="mb-4 space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
          {outcomes.map((o, i) => (
            <li key={`${o.reviewId}-${i}`} className={o.status === "error" ? "text-red-600" : "text-green-600"}>
              <span className="font-medium">{o.label}</span>
              {": "}
              {o.status === "ok" ? "recorded." : o.error}
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="w-8 px-2 py-2"></th>
              <th className="px-2 py-2 font-medium">Client</th>
              <th className="px-2 py-2 font-medium">Vendor name</th>
              <th className="px-2 py-2 font-medium">Vendor GSTIN</th>
              <th className="px-2 py-2 font-medium">Vendor PAN</th>
              <th className="px-2 py-2 font-medium">Billed to</th>
              <th className="px-2 py-2 font-medium">Client GSTIN</th>
              <th className="px-2 py-2 font-medium">Nature of service</th>
              <th className="px-2 py-2 font-medium">Amount</th>
              <th className="px-2 py-2 font-medium">IGST</th>
              <th className="px-2 py-2 font-medium">CGST</th>
              <th className="px-2 py-2 font-medium">SGST</th>
              <th className="px-2 py-2 font-medium">Bank account</th>
              <th className="px-2 py-2 font-medium">IFSC</th>
              <th className="px-2 py-2 font-medium">Gross-up</th>
              <th className="px-2 py-2 font-medium">Net amt</th>
              <th className="px-2 py-2 font-medium">TDS code</th>
              <th className="px-2 py-2 font-medium">TDS rate</th>
              <th className="px-2 py-2 font-medium">TDS amt</th>
              <th className="px-2 py-2 font-medium">Payment route</th>
              <th className="px-2 py-2 font-medium">Comment</th>
              <th className="px-2 py-2 font-medium">Decide</th>
              <th className="px-2 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const state = states[row.reviewId];
              return (
                <tr key={row.reviewId} className="border-b border-slate-100 last:border-0">
                  <td className="px-2 py-1 align-top">
                    <input
                      type="checkbox"
                      checked={selected.has(row.reviewId)}
                      onChange={() => toggle(row.reviewId)}
                      aria-label={`Select ${row.originalFilename}`}
                    />
                  </td>
                  <Cell width="w-32">
                    <span className="block px-1 py-1 text-slate-700">
                      {row.clientName} ({row.clientCode})
                    </span>
                  </Cell>
                  <Cell width="w-40">
                    <GText value={state.vendorName} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, vendorName: v }))} />
                    {row.vendorPendingId && <span className="mt-0.5 block text-[10px] text-amber-700">new vendor (pending)</span>}
                  </Cell>
                  <Cell width="w-32">
                    <GText value={state.vendorGstin} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, vendorGstin: v }))} />
                  </Cell>
                  <Cell width="w-28">
                    <GText value={state.vendorPan} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, vendorPan: v }))} />
                  </Cell>
                  <Cell width="w-36">
                    <GText value={state.billedToName} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, billedToName: v }))} />
                  </Cell>
                  <Cell width="w-32">
                    <GText value={row.clientGstin ?? ""} onChange={() => {}} />
                  </Cell>
                  <Cell width="w-40">
                    <GText value={state.natureOfService} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, natureOfService: v }))} />
                  </Cell>
                  <Cell width="w-24">
                    <GNumber value={state.total} onChange={(v) => patchAndRecalc(row.reviewId, (s) => ({ ...s, total: v }))} />
                  </Cell>
                  <Cell width="w-20">
                    <GNumber value={state.igst} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, igst: v }))} />
                  </Cell>
                  <Cell width="w-20">
                    <GNumber value={state.cgst} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, cgst: v }))} />
                  </Cell>
                  <Cell width="w-20">
                    <GNumber value={state.sgst} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, sgst: v }))} />
                  </Cell>
                  <Cell width="w-32">
                    <GText value={state.bankAccount} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, bankAccount: v }))} />
                  </Cell>
                  <Cell width="w-24">
                    <GText value={state.ifsc} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, ifsc: v }))} />
                  </Cell>
                  <Cell width="w-14">
                    <input
                      type="checkbox"
                      checked={state.grossUp}
                      onChange={(e) => patchAndRecalc(row.reviewId, (s) => ({ ...s, grossUp: e.target.checked }))}
                    />
                  </Cell>
                  <Cell width="w-24">
                    <GNumber value={state.netAmount} onChange={(v) => patchAndRecalc(row.reviewId, (s) => ({ ...s, netAmount: v }))} />
                  </Cell>
                  <Cell width="w-32">
                    <select
                      value={state.tdsCode}
                      onChange={(e) => {
                        const code = e.target.value;
                        const match = tdsCodes.find((c) => c.code === code);
                        patchAndRecalc(row.reviewId, (s) => ({ ...s, tdsCode: code, tdsRate: match ? match.default_rate : s.tdsRate }));
                      }}
                      className={inputClass}
                    >
                      <option value="">— none —</option>
                      {tdsCodes.map((c) => (
                        <option key={c.id} value={c.code}>
                          {c.code} ({c.default_rate}%)
                        </option>
                      ))}
                    </select>
                  </Cell>
                  <Cell width="w-16">
                    <GNumber value={state.tdsRate} onChange={(v) => patchAndRecalc(row.reviewId, (s) => ({ ...s, tdsRate: v }))} />
                  </Cell>
                  <Cell width="w-24">
                    <GNumber value={state.tdsAmount} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, tdsAmount: v }))} />
                  </Cell>
                  <Cell width="w-32">
                    <select
                      value={state.paymentRoute}
                      onChange={(e) => patch(row.reviewId, (s) => ({ ...s, paymentRoute: e.target.value as PaymentRoute }))}
                      className={inputClass}
                    >
                      <option value="portal">Portal</option>
                      <option value="card">Card</option>
                      <option value="employee">Employee</option>
                      <option value="auto_debit">Auto-debit</option>
                      <option value="pay_gross_recover">Gross &amp; recover</option>
                    </select>
                  </Cell>
                  <Cell width="w-36">
                    <textarea
                      value={state.comment}
                      onChange={(e) => patch(row.reviewId, (s) => ({ ...s, comment: e.target.value }))}
                      placeholder="Required to reject"
                      rows={2}
                      className="w-full rounded border border-slate-300 px-1 py-1 text-[11px]"
                    />
                  </Cell>
                  <Cell width="w-32">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => handleApproveOne(row)}
                        disabled={isPending}
                        className="rounded bg-green-700 px-2 py-1 text-[11px] font-medium text-white hover:bg-green-800 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(row)}
                        disabled={isPending}
                        className="rounded bg-red-700 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-800 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </Cell>
                  <Cell width="w-16">
                    <Link href={`/documents/${row.documentId}`} className="text-slate-500 underline hover:text-slate-900">
                      Open
                    </Link>
                  </Cell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
