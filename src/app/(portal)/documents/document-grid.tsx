"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { submitReview, checkerDecide, getDocumentViewUrl, archiveDocument } from "./actions";
import LineItemsPopover from "./line-items-popover";
import { computeNetPayable, recalcAmounts, applyGstEdit, type RowAmounts } from "@/lib/extraction/row-recalc";
import { ensureTaxableValueFromLineItems } from "@/lib/extraction/line-items";
import { formatNumber } from "@/lib/format";
import { GstinBadge, GstMasterProposeButton, clientGstinStatus, vendorGstinStatus } from "@/lib/validation/gstin-match";
import type { ExtractedFields, ValidationFlag } from "@/lib/extraction/schema";
import type { ExpenseLedger, PaymentRoute, TdsCode, TdsTreatment, Vendor } from "@/lib/supabase/types";

export type GridMode = "review" | "approve";

/**
 * One shape for both grids. A row from the Review grid (not yet submitted)
 * simply leaves the review-only fields null — initRowState() falls back to
 * the vendor's own defaults for those, exactly as it always did.
 */
export interface GridRow {
  documentId: string;
  reviewId: string | null;
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
  /** The checker's comment on an earlier rejected attempt at this same document (review mode). */
  rejectionComment: string | null;
  /** The maker's own reason for submitting despite red flags (approve mode, read-only context). */
  overrideReason: string | null;
  expenseLedger: string | null;
  tdsCode: string | null;
  tdsRate: number | null;
  tdsAmount: number | null;
  grossUp: boolean | null;
  paymentRoute: PaymentRoute | null;
}

interface RowState extends RowAmounts {
  vendorName: string;
  vendorGstin: string;
  vendorPan: string;
  billedToName: string;
  natureOfService: string;
  expenseLedgerName: string;
  bankAccount: string;
  ifsc: string;
  tdsCode: string;
  paymentRoute: PaymentRoute;
  overrideReason: string;
  comment: string;
  approveVendor: boolean;
  newVendorLedger: string;
  newVendorTreatment: TdsTreatment;
}

interface Outcome {
  id: string;
  label: string;
  status: "ok" | "error";
  error?: string;
  action: "submit" | "approve" | "reject" | "archive";
}

function initRowState(row: GridRow, tdsCodes: TdsCode[]): RowState {
  const fields = ensureTaxableValueFromLineItems(row.fields);
  const payout = fields.payout ?? null;
  const vendorMatch = row.vendorMatch;
  const tdsRate = row.tdsRate ?? vendorMatch?.last_tds_rate ?? payout?.tds_rate_percent ?? null;
  const payoutCodeGuess = payout ? tdsCodes.find((c) => tdsRate !== null && Math.abs(c.default_rate - tdsRate) < 0.5) : null;

  return {
    vendorName: row.fields.vendor.name ?? "",
    vendorGstin: row.fields.vendor.gstin ?? "",
    vendorPan: row.fields.vendor.pan ?? "",
    billedToName: row.fields.billed_to.name ?? "",
    natureOfService: row.fields.service.description ?? "",
    expenseLedgerName: row.expenseLedger ?? vendorMatch?.default_expense_ledger ?? "",
    taxableValue: fields.amounts.taxable_value,
    igst: fields.amounts.igst,
    cgst: fields.amounts.cgst,
    sgst: fields.amounts.sgst,
    total: fields.amounts.total,
    amountAlreadyPaid: fields.amounts.amount_already_paid,
    bankAccount: row.fields.vendor.bank_account ?? "",
    ifsc: row.fields.vendor.ifsc ?? "",
    grossUp: row.grossUp ?? vendorMatch?.gross_up ?? payout?.is_gross_up ?? false,
    netAmount: payout?.net ?? null,
    tdsCode: row.tdsCode ?? vendorMatch?.last_tds_code ?? payoutCodeGuess?.code ?? "",
    tdsRate,
    tdsAmount: row.tdsAmount ?? payout?.tds ?? null,
    paymentRoute: row.paymentRoute ?? "portal",
    overrideReason: "",
    comment: "",
    approveVendor: true,
    newVendorLedger: vendorMatch?.tally_ledger_name ?? "",
    newVendorTreatment: vendorMatch?.tds_treatment ?? "deduct",
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

export default function DocumentGrid({
  mode,
  rows,
  tdsCodes,
  expenseLedgersByClient,
  vendorGstinsByClient,
}: {
  mode: GridMode;
  rows: GridRow[];
  tdsCodes: TdsCode[];
  expenseLedgersByClient: Record<string, ExpenseLedger[]>;
  vendorGstinsByClient: Record<string, string[]>;
}) {
  const router = useRouter();
  const rowKey = mode === "review" ? "documentId" : "reviewId";

  const [states, setStates] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(rows.map((r) => [(r[rowKey] as string) ?? r.documentId, initRowState(r, tdsCodes)])),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isArchiving, startArchiveTransition] = useTransition();
  const [viewingId, setViewingId] = useState<string | null>(null);

  const rowsById = useMemo(() => new Map(rows.map((r) => [(r[rowKey] as string) ?? r.documentId, r])), [rows, rowKey]);

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
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => (r[rowKey] as string) ?? r.documentId))));
  }

  function buildReviewPayload(row: GridRow, state: RowState) {
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

  function buildCheckerEdits(row: GridRow, state: RowState) {
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

  function handleArchiveOne(documentId: string, label: string) {
    if (!confirm(`Archive "${label}"? It'll disappear from this grid but nothing is deleted — an admin can restore it from the Documents list.`)) return;
    startArchiveTransition(async () => {
      try {
        await archiveDocument(documentId);
        router.refresh();
      } catch (err) {
        setOutcomes([{ id: documentId, label, status: "error", action: "archive", error: err instanceof Error ? err.message : "Could not archive." }]);
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
          await archiveDocument(row?.documentId ?? id);
          results.push({ id, label, status: "ok", action: "archive" });
        } catch (err) {
          results.push({ id, label, status: "error", action: "archive", error: err instanceof Error ? err.message : "Failed." });
        }
      }
      setOutcomes(results);
      setSelected((prev) => {
        const next = new Set(prev);
        for (const r of results) if (r.status === "ok") next.delete(r.id);
        return next;
      });
      router.refresh();
    });
  }

  function submitOne(row: GridRow, state: RowState): Promise<void> {
    if (mode === "review") {
      return submitReview(row.documentId, buildReviewPayload(row, state));
    }
    const isPendingVendor = !row.vendorMatch || !row.vendorMatch.is_approved;
    const approvingVendor = state.approveVendor && isPendingVendor;
    return checkerDecide(
      row.reviewId!,
      "approved",
      state.comment,
      approvingVendor ? row.vendorMatch!.id : null,
      buildCheckerEdits(row, state),
      approvingVendor ? { tallyLedgerName: state.newVendorLedger, tdsTreatment: state.newVendorTreatment } : null,
    ).then(() => undefined);
  }

  function handleSubmitOne(row: GridRow) {
    const id = (row[rowKey] as string) ?? row.documentId;
    const state = rowState(id);
    const label = state.vendorName || row.originalFilename;
    const hasErrorFlags = row.flags.some((f) => f.severity === "error");

    if (mode === "review" && hasErrorFlags && !state.overrideReason.trim()) {
      setOutcomes([{ id, label, status: "error", action: "submit", error: "Open red flag — write an override reason first." }]);
      return;
    }
    if (mode === "review" && !row.vendorMatch && !state.vendorName.trim()) {
      setOutcomes([{ id, label, status: "error", action: "submit", error: "Enter a vendor name." }]);
      return;
    }

    startTransition(async () => {
      try {
        await submitOne(row, state);
        setOutcomes([{ id, label, status: "ok", action: mode === "review" ? "submit" : "approve" }]);
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        router.refresh();
      } catch (err) {
        setOutcomes([{ id, label, status: "error", action: mode === "review" ? "submit" : "approve", error: err instanceof Error ? err.message : "Failed." }]);
      }
    });
  }

  function handleReject(row: GridRow) {
    const id = row.reviewId!;
    const state = rowState(id);
    const label = state.vendorName || row.originalFilename;
    if (!state.comment.trim()) {
      setOutcomes([{ id, label, status: "error", action: "reject", error: "A comment is required to reject." }]);
      return;
    }
    startTransition(async () => {
      try {
        await checkerDecide(id, "rejected", state.comment, null, buildCheckerEdits(row, state), null);
        setOutcomes([{ id, label, status: "ok", action: "reject" }]);
        router.refresh();
      } catch (err) {
        setOutcomes([{ id, label, status: "error", action: "reject", error: err instanceof Error ? err.message : "Failed." }]);
      }
    });
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
        const action: Outcome["action"] = mode === "review" ? "submit" : "approve";

        if (mode === "review" && hasErrorFlags && !state.overrideReason.trim()) {
          results.push({ id, label, status: "error", action, error: "Open red flag — write an override reason first." });
          continue;
        }
        if (mode === "review" && !row.vendorMatch && !state.vendorName.trim()) {
          results.push({ id, label, status: "error", action, error: "Enter a vendor name." });
          continue;
        }

        try {
          await submitOne(row, state);
          results.push({ id, label, status: "ok", action });
        } catch (err) {
          results.push({ id, label, status: "error", action, error: err instanceof Error ? err.message : "Failed." });
        }
      }

      setOutcomes(results);
      setSelected((prev) => {
        const next = new Set(prev);
        for (const r of results) if (r.status === "ok") next.delete(r.id);
        return next;
      });
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-400">
        {mode === "review" ? "Nothing to review right now." : "Nothing waiting on you right now."}
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={toggleAll} className="text-sm text-slate-600 underline hover:text-slate-900">
          {selected.size === rows.length ? "Clear selection" : `Select all (${rows.length})`}
        </button>
        {selected.size > 0 && (
          <div className="ml-auto flex gap-2">
            {mode === "review" && (
              <button
                type="button"
                onClick={handleArchiveSelected}
                disabled={isArchiving}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {isArchiving ? "Archiving…" : `Archive selected (${selected.size})`}
              </button>
            )}
            <button
              type="button"
              onClick={handleSubmitSelected}
              disabled={isPending}
              className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
                mode === "review" ? "bg-slate-900 hover:bg-slate-800" : "bg-green-700 hover:bg-green-800"
              }`}
            >
              {isPending
                ? mode === "review"
                  ? "Submitting…"
                  : "Approving…"
                : mode === "review"
                  ? `Submit selected (${selected.size})`
                  : `Approve selected (${selected.size})`}
            </button>
          </div>
        )}
      </div>

      {outcomes && (
        <ul className="mb-4 space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
          {outcomes.map((o, i) => (
            <li key={`${o.id}-${i}`} className={o.status === "error" ? "text-red-600" : "text-green-600"}>
              <span className="font-medium">{o.label}</span>
              {": "}
              {o.status === "ok"
                ? { submit: "submitted.", approve: "approved.", reject: "rejected.", archive: "archived." }[o.action]
                : `not ${{ submit: "submitted", approve: "approved", reject: "rejected", archive: "archived" }[o.action]} — ${o.error}`}
            </li>
          ))}
        </ul>
      )}

      {mode === "review" && (
        <p className="mb-2 text-xs text-slate-400">
          New vendors submitted from here get a blank Tally ledger name and &quot;deduct at payment&quot; TDS treatment —
          open the document to set those precisely before or after submitting.
        </p>
      )}

      <div className="space-y-4">
        {rows.map((row) => {
          const id = (row[rowKey] as string) ?? row.documentId;
          const state = states[id] ?? initRowState(row, tdsCodes);
          const hasErrorFlags = row.flags.some((f) => f.severity === "error");
          const expenseLedgers = expenseLedgersByClient[row.clientId] ?? [];
          const vendorGstins = vendorGstinsByClient[row.clientId] ?? [];
          const vendorGstinStat = vendorGstinStatus(state.vendorGstin, vendorGstins);
          const netPayable = state.grossUp ? null : computeNetPayable(state);
          const isNewOrPendingVendor = !row.vendorMatch || !row.vendorMatch.is_approved;

          return (
            <div
              key={id}
              className={`rounded-lg border p-4 shadow-sm ${hasErrorFlags ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}
            >
              <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-slate-100 pb-3">
                <input
                  type="checkbox"
                  checked={selected.has(id)}
                  onChange={() => toggle(id)}
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
                {!row.vendorMatch ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">new vendor</span>
                ) : !row.vendorMatch.is_approved ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">matched (pending)</span>
                ) : (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">matched</span>
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
                  {mode === "review" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSubmitOne(row)}
                        disabled={isPending}
                        className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        Submit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchiveOne(row.documentId, state.vendorName || row.originalFilename)}
                        disabled={isArchiving}
                        className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Archive
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSubmitOne(row)}
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
                    </>
                  )}
                  <Link
                    href={`/documents/${row.documentId}`}
                    className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Open
                  </Link>
                </div>
              </div>

              {row.rejectionComment && (
                <p className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-700">
                  Sent back by the checker: {row.rejectionComment}
                </p>
              )}
              {row.overrideReason && (
                <p className="mb-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                  Maker submitted despite open flags: {row.overrideReason}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                <Field label="Vendor name">
                  <GText value={state.vendorName} onChange={(v) => patch(id, (s) => ({ ...s, vendorName: v }))} />
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
                  <GText value={state.vendorGstin} onChange={(v) => patch(id, (s) => ({ ...s, vendorGstin: v }))} />
                </Field>
                <Field label="Vendor PAN">
                  <GText value={state.vendorPan} onChange={(v) => patch(id, (s) => ({ ...s, vendorPan: v }))} />
                </Field>
                <Field label="Billed to">
                  <GText value={state.billedToName} onChange={(v) => patch(id, (s) => ({ ...s, billedToName: v }))} />
                </Field>
                {mode === "approve" && (
                  <Field label="Client GSTIN">
                    <GText value={row.clientGstin ?? ""} readOnly />
                  </Field>
                )}
                <Field label="Nature of service" className={mode === "review" ? "sm:col-span-2" : ""}>
                  <GText value={state.natureOfService} onChange={(v) => patch(id, (s) => ({ ...s, natureOfService: v }))} />
                </Field>
                <Field label="Expense ledger">
                  <select
                    value={state.expenseLedgerName}
                    onChange={(e) => patch(id, (s) => ({ ...s, expenseLedgerName: e.target.value }))}
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
                  <GNumber value={state.taxableValue} onChange={(v) => patchAndRecalc(id, (s) => ({ ...s, taxableValue: v }))} />
                </Field>
                <Field label="IGST">
                  <GNumber value={state.igst} onChange={(v) => patchAndRecalc(id, (s) => applyGstEdit(s, "igst", v))} />
                </Field>
                <Field label="CGST">
                  <GNumber value={state.cgst} onChange={(v) => patchAndRecalc(id, (s) => applyGstEdit(s, "cgst", v))} />
                </Field>
                <Field label="SGST">
                  <GNumber value={state.sgst} onChange={(v) => patchAndRecalc(id, (s) => applyGstEdit(s, "sgst", v))} />
                </Field>
                <Field label="Total">
                  <GNumber value={state.total} onChange={(v) => patch(id, (s) => ({ ...s, total: v }))} />
                </Field>
                <Field label="Bank account">
                  <GText value={state.bankAccount} onChange={(v) => patch(id, (s) => ({ ...s, bankAccount: v }))} />
                </Field>
                <Field label="IFSC">
                  <GText value={state.ifsc} onChange={(v) => patch(id, (s) => ({ ...s, ifsc: v }))} />
                </Field>

                <Field label="Gross-up">
                  <input
                    type="checkbox"
                    checked={state.grossUp}
                    onChange={(e) => patchAndRecalc(id, (s) => ({ ...s, grossUp: e.target.checked }))}
                    className="mt-1.5"
                  />
                </Field>
                <Field label="TDS code">
                  <select
                    value={state.tdsCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      const match = tdsCodes.find((c) => c.code === code);
                      patchAndRecalc(id, (s) => ({ ...s, tdsCode: code, tdsRate: match ? match.default_rate : 0 }));
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
                  <GNumber value={state.tdsRate} onChange={(v) => patchAndRecalc(id, (s) => ({ ...s, tdsRate: v }))} />
                </Field>
                <Field label="Net amt">
                  {state.grossUp ? (
                    <GNumber value={state.netAmount} onChange={(v) => patchAndRecalc(id, (s) => ({ ...s, netAmount: v }))} />
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="block px-1 py-1.5 text-slate-500">{netPayable !== null ? formatNumber(netPayable) : "—"}</span>
                      <button
                        type="button"
                        title="Recalculate from Taxable value, GST, TDS and Already paid"
                        onClick={() => handleRecalc(id)}
                        className="rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        ↻
                      </button>
                    </div>
                  )}
                </Field>
                <Field label="TDS amt">
                  <GNumber value={state.tdsAmount} onChange={(v) => patch(id, (s) => ({ ...s, tdsAmount: v }))} />
                </Field>
                <Field label="Already paid">
                  <GNumber value={state.amountAlreadyPaid} onChange={(v) => patchAndRecalc(id, (s) => ({ ...s, amountAlreadyPaid: v }))} />
                </Field>
                <Field label="Payment route">
                  <select
                    value={state.paymentRoute}
                    onChange={(e) => patch(id, (s) => ({ ...s, paymentRoute: e.target.value as PaymentRoute }))}
                    className={inputClass}
                  >
                    <option value="portal">Portal</option>
                    <option value="card">Card</option>
                    <option value="employee">Employee</option>
                    <option value="auto_debit">Auto-debit</option>
                    <option value="pay_gross_recover">Gross &amp; recover</option>
                  </select>
                </Field>
                {mode === "approve" && (
                  <Field label="Comment" className="sm:col-span-2">
                    <textarea
                      value={state.comment}
                      onChange={(e) => patch(id, (s) => ({ ...s, comment: e.target.value }))}
                      placeholder="Required to reject"
                      rows={1}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </Field>
                )}
              </div>

              {isNewOrPendingVendor && (
                <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-2 text-xs font-medium text-amber-800">
                    New vendor — Tally ledger name and TDS treatment (optional; leave ledger name blank to use vendor name)
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Field label="Tally ledger name">
                      <GText value={state.newVendorLedger} onChange={(v) => patch(id, (s) => ({ ...s, newVendorLedger: v }))} />
                    </Field>
                    <Field label="TDS treatment">
                      <select
                        value={state.newVendorTreatment}
                        onChange={(e) => patch(id, (s) => ({ ...s, newVendorTreatment: e.target.value as TdsTreatment }))}
                        className={inputClass}
                      >
                        <option value="deduct">Deduct at payment</option>
                        <option value="pay_gross_recover">Pay gross and recover</option>
                      </select>
                    </Field>
                  </div>
                </div>
              )}

              {mode === "review" && hasErrorFlags && (
                <textarea
                  value={state.overrideReason}
                  onChange={(e) => patch(id, (s) => ({ ...s, overrideReason: e.target.value }))}
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
