"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { checkerDecide, getDocumentViewUrl } from "../actions";
import { computeGrossUp } from "@/lib/tds/gross-up";
import { formatNumber } from "@/lib/format";
import type { ExtractedFields } from "@/lib/extraction/schema";
import type { ExpenseLedger, PaymentRoute, TdsCode, Vendor } from "@/lib/supabase/types";

export interface CheckerGridRow {
  reviewId: string;
  documentId: string;
  clientId: string;
  originalFilename: string;
  hasFile: boolean;
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
  submittedAt: string;
}

interface RowState {
  vendorName: string;
  vendorGstin: string;
  vendorPan: string;
  billedToName: string;
  natureOfService: string;
  expenseLedgerName: string;
  taxableValue: number | null;
  igst: number | null;
  cgst: number | null;
  sgst: number | null;
  total: number | null;
  amountAlreadyPaid: number | null;
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

function computeTotal(
  s: Pick<RowState, "taxableValue" | "cgst" | "sgst" | "igst" | "grossUp" | "netAmount" | "tdsRate" | "total">,
): number | null {
  if (s.grossUp) {
    // Gross-up rows have no taxable value — the gross total is worked
    // backwards from the fixed net amount instead, once both are known.
    if (s.netAmount !== null && s.tdsRate !== null) return computeGrossUp(s.netAmount, s.tdsRate).gross;
    return s.total;
  }
  if (s.taxableValue === null) return null;
  return s.taxableValue + (s.cgst ?? 0) + (s.sgst ?? 0) + (s.igst ?? 0);
}

function computeTds(
  s: Pick<RowState, "tdsRate" | "grossUp" | "netAmount" | "taxableValue" | "total" | "tdsAmount">,
): number | null {
  if (s.tdsRate === null) return s.tdsAmount;
  if (s.grossUp && s.netAmount !== null) return computeGrossUp(s.netAmount, s.tdsRate).tds;
  const base = s.taxableValue ?? s.total;
  if (base !== null) return Math.round((base * s.tdsRate) / 100);
  return s.tdsAmount;
}

function computeNetPayable(s: Pick<RowState, "total" | "tdsAmount" | "amountAlreadyPaid">): number | null {
  if (s.total === null || s.tdsAmount === null) return null;
  return s.total - s.tdsAmount - (s.amountAlreadyPaid ?? 0);
}

/** Recomputes Total from taxable value + GST, then TDS from the result — the two auto-fills that chain together. */
function recalcAmounts(s: RowState): RowState {
  const total = computeTotal(s);
  const withTotal = { ...s, total };
  return { ...withTotal, tdsAmount: computeTds(withTotal) };
}

/**
 * A vendor either charges IGST, or CGST+SGST together (never both) — and
 * when they do charge CGST/SGST, the two are always equal. Editing one tax
 * field keeps the others consistent instead of leaving it to the checker to
 * remember the rule.
 */
function applyGstEdit(s: RowState, field: "cgst" | "sgst" | "igst", value: number | null): RowState {
  const hasValue = value !== null && value !== 0;
  if (field === "igst") {
    return { ...s, igst: value, cgst: hasValue ? null : s.cgst, sgst: hasValue ? null : s.sgst };
  }
  return { ...s, cgst: value, sgst: value, igst: hasValue ? null : s.igst };
}

function initRowState(row: CheckerGridRow): RowState {
  return {
    vendorName: row.fields.vendor.name ?? "",
    vendorGstin: row.fields.vendor.gstin ?? "",
    vendorPan: row.fields.vendor.pan ?? "",
    billedToName: row.fields.billed_to.name ?? "",
    natureOfService: row.fields.service.description ?? "",
    expenseLedgerName: row.expenseLedger ?? "",
    taxableValue: row.fields.amounts.taxable_value,
    igst: row.fields.amounts.igst,
    cgst: row.fields.amounts.cgst,
    sgst: row.fields.amounts.sgst,
    total: row.fields.amounts.total,
    amountAlreadyPaid: row.fields.amounts.amount_already_paid,
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

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</label>
      {children}
    </div>
  );
}

const inputClass = "w-full rounded border border-slate-300 px-2 py-1.5 text-sm";

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

export default function CheckerGrid({
  rows,
  tdsCodes,
  expenseLedgersByClient,
}: {
  rows: CheckerGridRow[];
  tdsCodes: TdsCode[];
  expenseLedgersByClient: Record<string, ExpenseLedger[]>;
}) {
  const router = useRouter();
  const [states, setStates] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(rows.map((r) => [r.reviewId, initRowState(r)])),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [viewingId, setViewingId] = useState<string | null>(null);

  const rowsById = useMemo(() => new Map(rows.map((r) => [r.reviewId, r])), [rows]);

  function handleView(documentId: string) {
    setViewingId(documentId);
    getDocumentViewUrl(documentId)
      .then((url) => window.open(url, "_blank", "noopener,noreferrer"))
      .catch((err) => alert(err instanceof Error ? err.message : "Could not open that file."))
      .finally(() => setViewingId(null));
  }

  function rowState(id: string): RowState {
    const existing = states[id];
    if (existing) return existing;
    const row = rowsById.get(id);
    return row ? initRowState(row) : ({} as RowState);
  }

  function patch(id: string, updater: (s: RowState) => RowState) {
    setStates((prev) => ({ ...prev, [id]: updater(prev[id] ?? rowState(id)) }));
  }

  function patchAndRecalc(id: string, updater: (s: RowState) => RowState) {
    patch(id, (s) => recalcAmounts(updater(s)));
  }

  function handleRecalc(id: string) {
    patch(id, (s) => recalcAmounts(s));
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
      amounts: {
        ...row.fields.amounts,
        taxable_value: state.taxableValue,
        total: state.total,
        igst: state.igst,
        cgst: state.cgst,
        sgst: state.sgst,
        amount_already_paid: state.amountAlreadyPaid,
      },
    };
    return {
      reviewedFields: fields,
      expenseLedger: state.expenseLedgerName || "",
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
    const state = rowState(row.reviewId);
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
    const state = rowState(row.reviewId);
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
        if (!row) continue;
        const state = rowState(id);
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

      <div className="space-y-4">
        {rows.map((row) => {
          const state = states[row.reviewId] ?? initRowState(row);
          const netPayable = state.grossUp ? null : computeNetPayable(state);
          const expenseLedgers = expenseLedgersByClient[row.clientId] ?? [];
          return (
            <div key={row.reviewId} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-slate-100 pb-3">
                <input
                  type="checkbox"
                  checked={selected.has(row.reviewId)}
                  onChange={() => toggle(row.reviewId)}
                  aria-label={`Select ${row.originalFilename}`}
                />
                <span className="font-medium text-slate-900">
                  {row.clientName} ({row.clientCode})
                </span>
                <span className="text-sm text-slate-400">{row.originalFilename}</span>
                {row.vendorPendingId && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">new vendor (pending)</span>
                )}
                <div className="ml-auto flex gap-2">
                  {row.hasFile && (
                    <button
                      type="button"
                      onClick={() => handleView(row.documentId)}
                      disabled={viewingId === row.documentId}
                      className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {viewingId === row.documentId ? "Opening…" : "View invoice"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleApproveOne(row)}
                    disabled={isPending}
                    className="rounded bg-green-700 px-2 py-1 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(row)}
                    disabled={isPending}
                    className="rounded bg-red-700 px-2 py-1 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <Link
                    href={`/documents/${row.documentId}`}
                    className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Open
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                <Field label="Vendor name">
                  <GText value={state.vendorName} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, vendorName: v }))} />
                </Field>
                <Field label="Vendor GSTIN">
                  <GText value={state.vendorGstin} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, vendorGstin: v }))} />
                </Field>
                <Field label="Vendor PAN">
                  <GText value={state.vendorPan} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, vendorPan: v }))} />
                </Field>
                <Field label="Billed to">
                  <GText value={state.billedToName} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, billedToName: v }))} />
                </Field>
                <Field label="Client GSTIN">
                  <GText value={row.clientGstin ?? ""} onChange={() => {}} />
                </Field>
                <Field label="Nature of service">
                  <GText value={state.natureOfService} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, natureOfService: v }))} />
                </Field>
                <Field label="Expense ledger">
                  <select
                    value={state.expenseLedgerName}
                    onChange={(e) => patch(row.reviewId, (s) => ({ ...s, expenseLedgerName: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="">— none —</option>
                    {expenseLedgers.map((l) => (
                      <option key={l.id} value={l.name}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Taxable value">
                  <GNumber
                    value={state.taxableValue}
                    onChange={(v) => patchAndRecalc(row.reviewId, (s) => ({ ...s, taxableValue: v }))}
                  />
                </Field>
                <Field label="IGST">
                  <GNumber value={state.igst} onChange={(v) => patchAndRecalc(row.reviewId, (s) => applyGstEdit(s, "igst", v))} />
                </Field>
                <Field label="CGST">
                  <GNumber value={state.cgst} onChange={(v) => patchAndRecalc(row.reviewId, (s) => applyGstEdit(s, "cgst", v))} />
                </Field>
                <Field label="SGST">
                  <GNumber value={state.sgst} onChange={(v) => patchAndRecalc(row.reviewId, (s) => applyGstEdit(s, "sgst", v))} />
                </Field>
                <Field label="Total">
                  <GNumber value={state.total} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, total: v }))} />
                </Field>
                <Field label="Bank account">
                  <GText value={state.bankAccount} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, bankAccount: v }))} />
                </Field>
                <Field label="IFSC">
                  <GText value={state.ifsc} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, ifsc: v }))} />
                </Field>

                <Field label="Gross-up">
                  <input
                    type="checkbox"
                    checked={state.grossUp}
                    onChange={(e) => patchAndRecalc(row.reviewId, (s) => ({ ...s, grossUp: e.target.checked }))}
                    className="mt-1.5"
                  />
                </Field>
                <Field label="TDS code">
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
                </Field>
                <Field label="TDS rate">
                  <GNumber value={state.tdsRate} onChange={(v) => patchAndRecalc(row.reviewId, (s) => ({ ...s, tdsRate: v }))} />
                </Field>
                <Field label="TDS amt">
                  <GNumber value={state.tdsAmount} onChange={(v) => patch(row.reviewId, (s) => ({ ...s, tdsAmount: v }))} />
                </Field>
                <Field label="Already paid">
                  <GNumber
                    value={state.amountAlreadyPaid}
                    onChange={(v) => patchAndRecalc(row.reviewId, (s) => ({ ...s, amountAlreadyPaid: v }))}
                  />
                </Field>
                <Field label="Net amt">
                  {state.grossUp ? (
                    <GNumber
                      value={state.netAmount}
                      onChange={(v) => patchAndRecalc(row.reviewId, (s) => ({ ...s, netAmount: v }))}
                    />
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="block px-1 py-1.5 text-slate-500">
                        {netPayable !== null ? formatNumber(netPayable) : "—"}
                      </span>
                      <button
                        type="button"
                        title="Recalculate from Taxable value, GST, TDS and Already paid"
                        onClick={() => handleRecalc(row.reviewId)}
                        className="rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        ↻
                      </button>
                    </div>
                  )}
                </Field>
                <Field label="Payment route">
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
                </Field>
                <Field label="Comment" className="sm:col-span-2">
                  <textarea
                    value={state.comment}
                    onChange={(e) => patch(row.reviewId, (s) => ({ ...s, comment: e.target.value }))}
                    placeholder="Required to reject"
                    rows={1}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </Field>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
