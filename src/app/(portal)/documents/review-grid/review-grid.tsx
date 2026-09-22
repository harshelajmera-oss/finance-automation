"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { submitReview, getDocumentViewUrl, archiveDocument } from "../actions";
import LineItemsPopover from "../line-items-popover";
import { computeGrossUp } from "@/lib/tds/gross-up";
import { formatNumber } from "@/lib/format";
import { GstinBadge, GstMasterProposeButton, clientGstinStatus, vendorGstinStatus } from "@/lib/validation/gstin-match";
import { ensureTaxableValueFromLineItems } from "@/lib/extraction/line-items";
import type { ExtractedFields, ValidationFlag } from "@/lib/extraction/schema";
import type { ExpenseLedger, PaymentRoute, TdsCode, TdsTreatment, Vendor } from "@/lib/supabase/types";

export interface GridDocRow {
  documentId: string;
  clientId: string;
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
  overrideReason: string;
  newVendorLedger: string;
  newVendorTreatment: TdsTreatment;
}

interface Outcome {
  documentId: string;
  label: string;
  status: "ok" | "error";
  error?: string;
  action: "submit" | "archive";
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
  const fields = ensureTaxableValueFromLineItems(row.fields);
  const payout = fields.payout ?? null;
  const vendorMatch = row.vendorMatch;
  const tdsRate = vendorMatch?.last_tds_rate ?? payout?.tds_rate_percent ?? null;
  const payoutCodeGuess = payout ? tdsCodes.find((c) => tdsRate !== null && Math.abs(c.default_rate - tdsRate) < 0.5) : null;

  return {
    vendorName: row.fields.vendor.name ?? "",
    vendorGstin: row.fields.vendor.gstin ?? "",
    vendorPan: row.fields.vendor.pan ?? "",
    billedToName: row.fields.billed_to.name ?? "",
    natureOfService: row.fields.service.description ?? "",
    expenseLedgerName: vendorMatch?.default_expense_ledger ?? "",
    taxableValue: fields.amounts.taxable_value,
    igst: fields.amounts.igst,
    cgst: fields.amounts.cgst,
    sgst: fields.amounts.sgst,
    total: fields.amounts.total,
    amountAlreadyPaid: fields.amounts.amount_already_paid,
    bankAccount: row.fields.vendor.bank_account ?? "",
    ifsc: row.fields.vendor.ifsc ?? "",
    grossUp: vendorMatch?.gross_up ?? payout?.is_gross_up ?? false,
    netAmount: payout?.net ?? null,
    tdsCode: vendorMatch?.last_tds_code ?? payoutCodeGuess?.code ?? "",
    tdsRate,
    tdsAmount: payout?.tds ?? null,
    paymentRoute: "portal",
    overrideReason: "",
    newVendorLedger: "",
    newVendorTreatment: "deduct",
  };
}

function Field({
  label,
  children,
  className = "",
  labelExtra,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  labelExtra?: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
        {labelExtra}
      </label>
      {children}
    </div>
  );
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

export default function ReviewGrid({
  rows,
  tdsCodes,
  expenseLedgersByClient,
  vendorGstinsByClient,
}: {
  rows: GridDocRow[];
  tdsCodes: TdsCode[];
  expenseLedgersByClient: Record<string, ExpenseLedger[]>;
  vendorGstinsByClient: Record<string, string[]>;
}) {
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
      : { name: state.vendorName.trim(), tallyLedgerName: state.newVendorLedger.trim(), tdsTreatment: state.newVendorTreatment };

    return {
      reviewedFields: fields,
      vendor,
      expenseLedger: state.expenseLedgerName || "",
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

      <div className="space-y-4">
        {rows.map((row) => {
          const state = states[row.documentId] ?? initRowState(row, tdsCodes);
          const hasErrorFlags = row.flags.some((f) => f.severity === "error");
          const expenseLedgers = expenseLedgersByClient[row.clientId] ?? [];
          const vendorGstins = vendorGstinsByClient[row.clientId] ?? [];
          const vendorGstinStat = vendorGstinStatus(state.vendorGstin, vendorGstins);
          return (
            <div
              key={row.documentId}
              className={`rounded-lg border p-4 shadow-sm ${hasErrorFlags ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}
            >
              <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-slate-100 pb-3">
                <input
                  type="checkbox"
                  checked={selected.has(row.documentId)}
                  onChange={() => toggle(row.documentId)}
                  aria-label={`Select ${row.originalFilename}`}
                />
                <span className="font-medium text-slate-900">
                  {row.clientName} ({row.clientCode})
                </span>
                {row.fields.billed_to.gstin && (
                  <span className="text-xs text-slate-400">
                    billed-to GSTIN
                    <GstinBadge status={clientGstinStatus(row.fields.billed_to.gstin, row.clientGstin)} />
                  </span>
                )}
                <span className="text-sm text-slate-400">{row.originalFilename}</span>
                {row.vendorMatch ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                    matched{row.vendorMatch.is_approved ? "" : " (pending)"}
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">new vendor</span>
                )}
                {row.flags.length > 0 && (
                  <span
                    title={row.flags.map((f) => f.message).join("\n")}
                    className={`cursor-help rounded-full px-2 py-0.5 text-xs font-medium ${hasErrorFlags ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}
                  >
                    {row.flags.length} flag{row.flags.length === 1 ? "" : "s"}
                  </span>
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
                    onClick={() => handleArchiveOne(row.documentId, state.vendorName || row.originalFilename)}
                    disabled={isArchiving}
                    className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Archive
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
                  <GText value={state.vendorName} onChange={(v) => patch(row.documentId, (s) => ({ ...s, vendorName: v }))} />
                </Field>
                <Field
                  label="Vendor GSTIN"
                  labelExtra={
                    <>
                      <GstinBadge status={vendorGstinStat} />
                      {vendorGstinStat === "not_in_master" && state.vendorGstin && (
                        <GstMasterProposeButton clientId={row.clientId} gstin={state.vendorGstin} vendorName={state.vendorName} />
                      )}
                    </>
                  }
                >
                  <GText value={state.vendorGstin} onChange={(v) => patch(row.documentId, (s) => ({ ...s, vendorGstin: v }))} />
                </Field>
                <Field label="Vendor PAN">
                  <GText value={state.vendorPan} onChange={(v) => patch(row.documentId, (s) => ({ ...s, vendorPan: v }))} />
                </Field>
                <Field label="Billed to">
                  <GText value={state.billedToName} onChange={(v) => patch(row.documentId, (s) => ({ ...s, billedToName: v }))} />
                </Field>
                <Field label="Nature of service" className="sm:col-span-2">
                  <GText
                    value={state.natureOfService}
                    onChange={(v) => patch(row.documentId, (s) => ({ ...s, natureOfService: v }))}
                  />
                </Field>
                <Field label="Expense ledger">
                  <select
                    value={state.expenseLedgerName}
                    onChange={(e) => patch(row.documentId, (s) => ({ ...s, expenseLedgerName: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="">— none —</option>
                    {state.expenseLedgerName && !expenseLedgers.some((l) => l.name === state.expenseLedgerName) && (
                      <option value={state.expenseLedgerName}>{state.expenseLedgerName} (not in master list)</option>
                    )}
                    {expenseLedgers.map((l) => (
                      <option key={l.id} value={l.name}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="Taxable value"
                  labelExtra={<LineItemsPopover description={row.fields.service.description} lineItems={row.fields.service.line_items} />}
                >
                  <GNumber
                    value={state.taxableValue}
                    onChange={(v) => patchAndRecalc(row.documentId, (s) => ({ ...s, taxableValue: v }))}
                  />
                </Field>
                <Field label="IGST">
                  <GNumber value={state.igst} onChange={(v) => patchAndRecalc(row.documentId, (s) => applyGstEdit(s, "igst", v))} />
                </Field>
                <Field label="CGST">
                  <GNumber value={state.cgst} onChange={(v) => patchAndRecalc(row.documentId, (s) => applyGstEdit(s, "cgst", v))} />
                </Field>
                <Field label="SGST">
                  <GNumber value={state.sgst} onChange={(v) => patchAndRecalc(row.documentId, (s) => applyGstEdit(s, "sgst", v))} />
                </Field>
                <Field label="Total">
                  <GNumber value={state.total} onChange={(v) => patch(row.documentId, (s) => ({ ...s, total: v }))} />
                </Field>
                <Field label="Bank account">
                  <GText value={state.bankAccount} onChange={(v) => patch(row.documentId, (s) => ({ ...s, bankAccount: v }))} />
                </Field>
                <Field label="IFSC">
                  <GText value={state.ifsc} onChange={(v) => patch(row.documentId, (s) => ({ ...s, ifsc: v }))} />
                </Field>

                <Field label="Gross-up">
                  <input
                    type="checkbox"
                    checked={state.grossUp}
                    onChange={(e) => patchAndRecalc(row.documentId, (s) => ({ ...s, grossUp: e.target.checked }))}
                    className="mt-1.5"
                  />
                </Field>
                <Field label="TDS code">
                  <select
                    value={state.tdsCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      const match = tdsCodes.find((c) => c.code === code);
                      patchAndRecalc(row.documentId, (s) => ({ ...s, tdsCode: code, tdsRate: match ? match.default_rate : 0 }));
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
                  <GNumber value={state.tdsRate} onChange={(v) => patchAndRecalc(row.documentId, (s) => ({ ...s, tdsRate: v }))} />
                </Field>
                <Field label="Net amt">
                  {state.grossUp ? (
                    <GNumber
                      value={state.netAmount}
                      onChange={(v) => patchAndRecalc(row.documentId, (s) => ({ ...s, netAmount: v }))}
                    />
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="block px-1 py-1.5 text-slate-500">
                        {(() => {
                          const net =
                            state.total !== null && state.tdsAmount !== null
                              ? state.total - state.tdsAmount - (state.amountAlreadyPaid ?? 0)
                              : null;
                          return net !== null ? formatNumber(net) : "—";
                        })()}
                      </span>
                      <button
                        type="button"
                        title="Recalculate from Taxable value, GST, TDS and Already paid"
                        onClick={() => handleRecalc(row.documentId)}
                        className="rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        ↻
                      </button>
                    </div>
                  )}
                </Field>
                <Field label="TDS amt">
                  <GNumber value={state.tdsAmount} onChange={(v) => patch(row.documentId, (s) => ({ ...s, tdsAmount: v }))} />
                </Field>
                <Field label="Already paid">
                  <GNumber
                    value={state.amountAlreadyPaid}
                    onChange={(v) => patch(row.documentId, (s) => ({ ...s, amountAlreadyPaid: v }))}
                  />
                </Field>
                <Field label="Payment route">
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
                </Field>
              </div>

              {!row.vendorMatch && (
                <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-2 text-xs font-medium text-amber-800">
                    New vendor — Tally ledger name and TDS treatment (optional; leave ledger name blank to use vendor name)
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Field label="Tally ledger name">
                      <GText
                        value={state.newVendorLedger}
                        onChange={(v) => patch(row.documentId, (s) => ({ ...s, newVendorLedger: v }))}
                      />
                    </Field>
                    <Field label="TDS treatment">
                      <select
                        value={state.newVendorTreatment}
                        onChange={(e) =>
                          patch(row.documentId, (s) => ({ ...s, newVendorTreatment: e.target.value as TdsTreatment }))
                        }
                        className={inputClass}
                      >
                        <option value="deduct">Deduct at payment</option>
                        <option value="pay_gross_recover">Pay gross and recover</option>
                      </select>
                    </Field>
                  </div>
                </div>
              )}

              {hasErrorFlags && (
                <textarea
                  value={state.overrideReason}
                  onChange={(e) => patch(row.documentId, (s) => ({ ...s, overrideReason: e.target.value }))}
                  placeholder="Reason to submit anyway"
                  rows={2}
                  className="mt-3 w-full rounded border border-red-300 px-2 py-1.5 text-sm"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
