"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { submitReview, getDocumentViewUrl, archiveDocument } from "../actions";
import { computeGrossUp } from "@/lib/tds/gross-up";
import { formatNumber } from "@/lib/format";
import type { ExtractedFields, ValidationFlag } from "@/lib/extraction/schema";
import type { PaymentRoute, TdsCode, Vendor } from "@/lib/supabase/types";

export interface GridDocRow {
  documentId: string;
  originalFilename: string;
  hasFile: boolean;
  clientName: string;
  clientCode: string;
  clientGstin: string | null;
  fields: ExtractedFields;
  flags: ValidationFlag[];
  vendorMatch: Vendor | null;
  possibleNameMatches: Vendor[];
  rejectionComment: string | null;
}

interface RowState {
  vendorName: string;
  vendorGstin: string;
  vendorPan: string;
  billedToName: string;
  natureOfService: string;
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
  overrideReason: string;
}

interface Outcome {
  documentId: string;
  label: string;
  status: "ok" | "error";
  error?: string;
  action: "submit" | "archive";
}

function computeTotal(s: Pick<RowState, "taxableValue" | "cgst" | "sgst" | "igst">): number | null {
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

/** Recomputes Total from taxable value + GST, then TDS from the result — the two auto-fills that chain together. */
function recalcAmounts(s: RowState): RowState {
  const total = computeTotal(s);
  const withTotal = { ...s, total };
  return { ...withTotal, tdsAmount: computeTds(withTotal) };
}

/**
 * A vendor either charges IGST, or CGST+SGST together (never both) — and
 * when they do charge CGST/SGST, the two are always equal. Editing one tax
 * field keeps the others consistent instead of leaving it to the maker to
 * remember the rule.
 */
function applyGstEdit(s: RowState, field: "cgst" | "sgst" | "igst", value: number | null): RowState {
  const hasValue = value !== null && value !== 0;
  if (field === "igst") {
    return { ...s, igst: value, cgst: hasValue ? null : s.cgst, sgst: hasValue ? null : s.sgst };
  }
  return { ...s, cgst: value, sgst: value, igst: hasValue ? null : s.igst };
}

function initRowState(row: GridDocRow, tdsCodes: TdsCode[]): RowState {
  const payout = row.fields.payout ?? null;
  const vendorMatch = row.vendorMatch;
  const tdsRate = vendorMatch?.last_tds_rate ?? payout?.tds_rate_percent ?? null;
  const payoutCodeGuess = payout ? tdsCodes.find((c) => tdsRate !== null && Math.abs(c.default_rate - tdsRate) < 0.5) : null;

  return {
    vendorName: row.fields.vendor.name ?? "",
    vendorGstin: row.fields.vendor.gstin ?? "",
    vendorPan: row.fields.vendor.pan ?? "",
    billedToName: row.fields.billed_to.name ?? "",
    natureOfService: row.fields.service.description ?? "",
    taxableValue: row.fields.amounts.taxable_value,
    igst: row.fields.amounts.igst,
    cgst: row.fields.amounts.cgst,
    sgst: row.fields.amounts.sgst,
    total: row.fields.amounts.total,
    amountAlreadyPaid: row.fields.amounts.amount_already_paid,
    bankAccount: row.fields.vendor.bank_account ?? "",
    ifsc: row.fields.vendor.ifsc ?? "",
    grossUp: vendorMatch?.gross_up ?? payout?.is_gross_up ?? false,
    netAmount: payout?.net ?? null,
    tdsCode: vendorMatch?.last_tds_code ?? payoutCodeGuess?.code ?? "",
    tdsRate,
    tdsAmount: payout?.tds ?? null,
    paymentRoute: "portal",
    overrideReason: "",
  };
}

function Cell({ children, width = "w-32" }: { children: React.ReactNode; width?: string }) {
  return <td className={`border-r border-slate-100 px-2 py-1.5 align-top ${width}`}>{children}</td>;
}

const inputClass = "w-full rounded border border-slate-300 px-2 py-1.5 text-sm";

function GText({ value, onChange, readOnly }: { value: string; onChange?: (v: string) => void; readOnly?: boolean }) {
  return (
    <input
      type="text"
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange?.(e.target.value)}
      className={`${inputClass} ${readOnly ? "bg-slate-50 text-slate-500" : ""}`}
    />
  );
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

export default function ReviewGrid({ rows, tdsCodes }: { rows: GridDocRow[]; tdsCodes: TdsCode[] }) {
  const router = useRouter();
  const [states, setStates] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(rows.map((r) => [r.documentId, initRowState(r, tdsCodes)])),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [isArchiving, startArchiveTransition] = useTransition();

  const rowsById = useMemo(() => new Map(rows.map((r) => [r.documentId, r])), [rows]);

  function handleView(documentId: string) {
    setViewingId(documentId);
    getDocumentViewUrl(documentId)
      .then((url) => window.open(url, "_blank", "noopener,noreferrer"))
      .catch((err) => alert(err instanceof Error ? err.message : "Could not open that file."))
      .finally(() => setViewingId(null));
  }

  function handleArchiveOne(documentId: string, label: string) {
    if (!confirm(`Archive "${label}"? It'll disappear from this grid but nothing is deleted — an admin can restore it from the Documents list.`)) return;
    startArchiveTransition(async () => {
      try {
        await archiveDocument(documentId);
        router.refresh();
      } catch (err) {
        setOutcomes([{ documentId, label, status: "error", action: "archive", error: err instanceof Error ? err.message : "Could not archive." }]);
      }
    });
  }

  function handleArchiveSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Archive ${ids.length} selected row${ids.length === 1 ? "" : "s"}? Nothing is deleted — an admin can restore any of them from the Documents list.`)) return;

    setOutcomes(null);
    startArchiveTransition(async () => {
      const results: Outcome[] = [];
      for (const id of ids) {
        const row = rowsById.get(id);
        const label = row ? rowState(id).vendorName || row.originalFilename : id;
        try {
          await archiveDocument(id);
          results.push({ documentId: id, label, status: "ok", action: "archive" });
        } catch (err) {
          results.push({ documentId: id, label, status: "error", action: "archive", error: err instanceof Error ? err.message : "Failed." });
        }
      }
      setOutcomes(results);
      setSelected((prev) => {
        const next = new Set(prev);
        for (const r of results) if (r.status === "ok") next.delete(r.documentId);
        return next;
      });
      router.refresh();
    });
  }

  function rowState(id: string): RowState {
    const existing = states[id];
    if (existing) return existing;
    const row = rowsById.get(id);
    return row ? initRowState(row, tdsCodes) : ({} as RowState);
  }

  function patch(id: string, updater: (s: RowState) => RowState) {
    setStates((prev) => ({ ...prev, [id]: updater(prev[id] ?? rowState(id)) }));
  }

  function patchAndRecalc(id: string, updater: (s: RowState) => RowState) {
    patch(id, (s) => recalcAmounts(updater(s)));
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
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.documentId))));
  }

  function buildPayload(row: GridDocRow, state: RowState) {
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
    const vendor = row.vendorMatch
      ? {
          id: row.vendorMatch.id,
          name: row.vendorMatch.name,
          tallyLedgerName: row.vendorMatch.tally_ledger_name ?? "",
          tdsTreatment: row.vendorMatch.tds_treatment,
        }
      : { name: state.vendorName.trim(), tallyLedgerName: "", tdsTreatment: "deduct" as const };

    return {
      reviewedFields: fields,
      vendor,
      expenseLedger: row.vendorMatch?.default_expense_ledger ?? "",
      tdsCode: state.tdsCode || null,
      tdsRate: state.tdsRate,
      tdsAmount: state.tdsAmount,
      grossUp: state.grossUp,
      paymentRoute: state.paymentRoute,
      overrideReason: state.overrideReason.trim() || null,
    };
  }

  function handleSubmitSelected() {
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
        const hasErrorFlags = row.flags.some((f) => f.severity === "error");

        if (hasErrorFlags && !state.overrideReason.trim()) {
          results.push({ documentId: id, label, status: "error", action: "submit", error: "Open red flag — write an override reason first." });
          continue;
        }
        if (!row.vendorMatch && !state.vendorName.trim()) {
          results.push({ documentId: id, label, status: "error", action: "submit", error: "Enter a vendor name." });
          continue;
        }

        try {
          await submitReview(id, buildPayload(row, state));
          results.push({ documentId: id, label, status: "ok", action: "submit" });
        } catch (err) {
          results.push({ documentId: id, label, status: "error", action: "submit", error: err instanceof Error ? err.message : "Failed." });
        }
      }

      setOutcomes(results);
      setSelected((prev) => {
        const next = new Set(prev);
        for (const r of results) if (r.status === "ok") next.delete(r.documentId);
        return next;
      });
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-400">Nothing to review right now.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={toggleAll} className="text-sm text-slate-600 underline hover:text-slate-900">
          {selected.size === rows.length ? "Clear selection" : `Select all (${rows.length})`}
        </button>
        {selected.size > 0 && (
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={handleArchiveSelected}
              disabled={isArchiving}
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {isArchiving ? "Archiving…" : `Archive selected (${selected.size})`}
            </button>
            <button
              type="button"
              onClick={handleSubmitSelected}
              disabled={isPending}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {isPending ? "Submitting…" : `Submit selected (${selected.size})`}
            </button>
          </div>
        )}
      </div>

      {outcomes && (
        <ul className="mb-4 space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
          {outcomes.map((o) => (
            <li key={o.documentId} className={o.status === "error" ? "text-red-600" : "text-green-600"}>
              <span className="font-medium">{o.label}</span>
              {": "}
              {o.action === "archive"
                ? o.status === "ok"
                  ? "archived."
                  : `not archived — ${o.error}`
                : o.status === "ok"
                  ? "submitted."
                  : `not submitted — ${o.error}`}
            </li>
          ))}
        </ul>
      )}

      <p className="mb-2 text-xs text-slate-400">
        New vendors submitted from here get a blank Tally ledger name and &quot;deduct at payment&quot; TDS treatment —
        open the document to set those precisely before or after submitting.
      </p>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 w-8 bg-slate-50 px-2 py-2"></th>
              <th className="px-2 py-2 font-medium">Client</th>
              <th className="px-2 py-2 font-medium">Vendor name</th>
              <th className="px-2 py-2 font-medium">Vendor GSTIN</th>
              <th className="px-2 py-2 font-medium">Vendor PAN</th>
              <th className="px-2 py-2 font-medium">Billed to</th>
              <th className="px-2 py-2 font-medium">Nature of service</th>
              <th className="px-2 py-2 font-medium">Taxable value</th>
              <th className="px-2 py-2 font-medium">IGST</th>
              <th className="px-2 py-2 font-medium">CGST</th>
              <th className="px-2 py-2 font-medium">SGST</th>
              <th className="px-2 py-2 font-medium">Total</th>
              <th className="px-2 py-2 font-medium">Bank account</th>
              <th className="px-2 py-2 font-medium">IFSC</th>
              <th className="px-2 py-2 font-medium">Gross-up</th>
              <th className="px-2 py-2 font-medium">TDS code</th>
              <th className="px-2 py-2 font-medium">TDS rate</th>
              <th className="px-2 py-2 font-medium">Net amt</th>
              <th className="px-2 py-2 font-medium">TDS amt</th>
              <th className="px-2 py-2 font-medium">Already paid</th>
              <th className="px-2 py-2 font-medium">Payment route</th>
              <th className="px-2 py-2 font-medium">Flags</th>
              <th className="sticky right-0 z-10 bg-slate-50 px-2 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const state = states[row.documentId] ?? initRowState(row, tdsCodes);
              const hasErrorFlags = row.flags.some((f) => f.severity === "error");
              return (
                <tr
                  key={row.documentId}
                  className={`border-b border-slate-100 last:border-0 ${hasErrorFlags ? "bg-red-50" : ""}`}
                >
                  <td className={`sticky left-0 z-10 px-2 py-1 align-top ${hasErrorFlags ? "bg-red-50" : "bg-white"}`}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.documentId)}
                      onChange={() => toggle(row.documentId)}
                      aria-label={`Select ${row.originalFilename}`}
                    />
                  </td>
                  <Cell width="w-36">
                    <span className="block px-1 py-1 text-slate-700">
                      {row.clientName} ({row.clientCode})
                    </span>
                  </Cell>
                  <Cell width="w-48">
                    <GText value={state.vendorName} onChange={(v) => patch(row.documentId, (s) => ({ ...s, vendorName: v }))} />
                    {row.vendorMatch ? (
                      <span className="mt-0.5 block text-[10px] text-green-700">
                        matched{row.vendorMatch.is_approved ? "" : " (pending)"}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-[10px] text-amber-700">new vendor</span>
                    )}
                  </Cell>
                  <Cell width="w-36">
                    <GText value={state.vendorGstin} onChange={(v) => patch(row.documentId, (s) => ({ ...s, vendorGstin: v }))} />
                  </Cell>
                  <Cell width="w-32">
                    <GText value={state.vendorPan} onChange={(v) => patch(row.documentId, (s) => ({ ...s, vendorPan: v }))} />
                  </Cell>
                  <Cell width="w-40">
                    <GText value={state.billedToName} onChange={(v) => patch(row.documentId, (s) => ({ ...s, billedToName: v }))} />
                  </Cell>
                  <Cell width="w-48">
                    <GText
                      value={state.natureOfService}
                      onChange={(v) => patch(row.documentId, (s) => ({ ...s, natureOfService: v }))}
                    />
                  </Cell>
                  <Cell width="w-28">
                    <GNumber
                      value={state.taxableValue}
                      onChange={(v) => patchAndRecalc(row.documentId, (s) => ({ ...s, taxableValue: v }))}
                    />
                  </Cell>
                  <Cell width="w-24">
                    <GNumber value={state.igst} onChange={(v) => patchAndRecalc(row.documentId, (s) => applyGstEdit(s, "igst", v))} />
                  </Cell>
                  <Cell width="w-24">
                    <GNumber value={state.cgst} onChange={(v) => patchAndRecalc(row.documentId, (s) => applyGstEdit(s, "cgst", v))} />
                  </Cell>
                  <Cell width="w-24">
                    <GNumber value={state.sgst} onChange={(v) => patchAndRecalc(row.documentId, (s) => applyGstEdit(s, "sgst", v))} />
                  </Cell>
                  <Cell width="w-28">
                    <GNumber value={state.total} onChange={(v) => patch(row.documentId, (s) => ({ ...s, total: v }))} />
                  </Cell>
                  <Cell width="w-36">
                    <GText value={state.bankAccount} onChange={(v) => patch(row.documentId, (s) => ({ ...s, bankAccount: v }))} />
                  </Cell>
                  <Cell width="w-28">
                    <GText value={state.ifsc} onChange={(v) => patch(row.documentId, (s) => ({ ...s, ifsc: v }))} />
                  </Cell>
                  <Cell width="w-16">
                    <input
                      type="checkbox"
                      checked={state.grossUp}
                      onChange={(e) => patchAndRecalc(row.documentId, (s) => ({ ...s, grossUp: e.target.checked }))}
                    />
                  </Cell>
                  <Cell width="w-36">
                    <select
                      value={state.tdsCode}
                      onChange={(e) => {
                        const code = e.target.value;
                        const match = tdsCodes.find((c) => c.code === code);
                        patchAndRecalc(row.documentId, (s) => ({ ...s, tdsCode: code, tdsRate: match ? match.default_rate : s.tdsRate }));
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
                  <Cell width="w-20">
                    <GNumber value={state.tdsRate} onChange={(v) => patchAndRecalc(row.documentId, (s) => ({ ...s, tdsRate: v }))} />
                  </Cell>
                  <Cell width="w-28">
                    {state.grossUp ? (
                      <GNumber
                        value={state.netAmount}
                        onChange={(v) => patchAndRecalc(row.documentId, (s) => ({ ...s, netAmount: v }))}
                      />
                    ) : (
                      <span className="block px-1 py-1 text-slate-500">
                        {(() => {
                          const net =
                            state.total !== null && state.tdsAmount !== null
                              ? state.total - state.tdsAmount - (state.amountAlreadyPaid ?? 0)
                              : null;
                          return net !== null ? formatNumber(net) : "—";
                        })()}
                      </span>
                    )}
                  </Cell>
                  <Cell width="w-28">
                    <GNumber value={state.tdsAmount} onChange={(v) => patch(row.documentId, (s) => ({ ...s, tdsAmount: v }))} />
                  </Cell>
                  <Cell width="w-28">
                    <GNumber
                      value={state.amountAlreadyPaid}
                      onChange={(v) => patch(row.documentId, (s) => ({ ...s, amountAlreadyPaid: v }))}
                    />
                  </Cell>
                  <Cell width="w-36">
                    <select
                      value={state.paymentRoute}
                      onChange={(e) => patch(row.documentId, (s) => ({ ...s, paymentRoute: e.target.value as PaymentRoute }))}
                      className={inputClass}
                    >
                      <option value="portal">Portal</option>
                      <option value="card">Card</option>
                      <option value="employee">Employee</option>
                      <option value="auto_debit">Auto-debit</option>
                      <option value="pay_gross_recover">Gross &amp; recover</option>
                    </select>
                  </Cell>
                  <Cell width="w-48">
                    {row.flags.length === 0 ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <span
                        title={row.flags.map((f) => f.message).join("\n")}
                        className={`block cursor-help rounded px-1 py-0.5 text-[11px] ${hasErrorFlags ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}
                      >
                        {row.flags.length} flag{row.flags.length === 1 ? "" : "s"}
                      </span>
                    )}
                    {hasErrorFlags && (
                      <textarea
                        value={state.overrideReason}
                        onChange={(e) => patch(row.documentId, (s) => ({ ...s, overrideReason: e.target.value }))}
                        placeholder="Reason to submit anyway"
                        rows={2}
                        className="mt-1 w-full rounded border border-red-300 px-1 py-1 text-[11px]"
                      />
                    )}
                  </Cell>
                  <td className={`sticky right-0 z-10 border-l border-slate-200 px-2 py-1.5 align-top ${hasErrorFlags ? "bg-red-50" : "bg-white"}`}>
                    <div className="flex w-28 flex-col gap-1">
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
                        onClick={() => handleArchiveOne(row.documentId, state.vendorName || row.originalFilename)}
                        disabled={isArchiving}
                        className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Archive
                      </button>
                      <Link href={`/documents/${row.documentId}`} className="text-center text-xs text-slate-500 underline hover:text-slate-900">
                        Open
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
