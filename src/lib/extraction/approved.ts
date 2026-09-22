import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ApprovedRow {
  documentId: string;
  reviewId: string;
  receivedAt: string;
  clientName: string;
  clientCode: string;
  fileName: string;
  vendorId: string | null;
  vendorName: string;
  vendorGstin: string | null;
  vendorPan: string | null;
  bankAccount: string | null;
  ifsc: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  taxableValue: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  total: number | null;
  tdsCode: string | null;
  tdsRate: number | null;
  tdsAmount: number | null;
  netPayable: number | null;
  paymentRoute: string;
  approvedAt: string | null;
  exportedAt: string | null;
}

export interface ApprovedRowFilters {
  reviewIds?: string[];
  vendorId?: string;
  receivedFrom?: string;
  receivedTo?: string;
  approvedFrom?: string;
  approvedTo?: string;
  onlyNotExported?: boolean;
}

function inRange(dateStr: string | null, from?: string, to?: string): boolean {
  if (!dateStr) return !from && !to;
  const t = new Date(dateStr).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1) return false;
  return true;
}

/**
 * One row per approved document, sourced from the review (not the raw
 * extraction) — an approved review is the confirmed record, so it's the
 * right source for anything payment-facing (bank account, IFSC, TDS, net
 * payable). Uses the checker's edited fields when present, otherwise the
 * maker's submitted fields.
 */
export async function fetchApprovedRows(supabase: SupabaseClient, filters?: ApprovedRowFilters): Promise<ApprovedRow[]> {
  const { data } = await supabase
    .from("reviews")
    .select(
      "*, documents ( id, original_filename, received_at, clients ( name, code ) ), vendors ( id, name, gstin, pan, bank_account, ifsc )",
    )
    .eq("status", "approved")
    .order("decided_at", { ascending: false });

  const rows = (data ?? []).map((row) => {
    const fields = row.checker_edited_fields ?? row.reviewed_fields;
    const total = fields?.amounts?.total ?? null;
    const tdsAmount = row.tds_amount as number | null;
    const amountAlreadyPaid = fields?.amounts?.amount_already_paid ?? null;
    const netPayable = total !== null ? total - (tdsAmount ?? 0) - (amountAlreadyPaid ?? 0) : null;
    const doc = row.documents as unknown as {
      id: string;
      original_filename: string;
      received_at: string;
      clients: { name: string; code: string } | null;
    } | null;
    const vendor = row.vendors as unknown as {
      id: string;
      name: string;
      gstin: string | null;
      pan: string | null;
      bank_account: string | null;
      ifsc: string | null;
    } | null;

    return {
      documentId: doc?.id ?? row.document_id,
      reviewId: row.id,
      receivedAt: doc?.received_at ?? "",
      clientName: doc?.clients?.name ?? "",
      clientCode: doc?.clients?.code ?? "",
      fileName: doc?.original_filename ?? "",
      vendorId: vendor?.id ?? row.vendor_id ?? null,
      vendorName: vendor?.name ?? fields?.vendor?.name ?? "",
      vendorGstin: vendor?.gstin ?? fields?.vendor?.gstin ?? null,
      vendorPan: vendor?.pan ?? fields?.vendor?.pan ?? null,
      bankAccount: vendor?.bank_account ?? null,
      ifsc: vendor?.ifsc ?? null,
      invoiceNumber: fields?.document?.invoice_number ?? null,
      invoiceDate: fields?.document?.invoice_date ?? null,
      taxableValue: fields?.amounts?.taxable_value ?? null,
      cgst: fields?.amounts?.cgst ?? null,
      sgst: fields?.amounts?.sgst ?? null,
      igst: fields?.amounts?.igst ?? null,
      total,
      tdsCode: row.tds_code as string | null,
      tdsRate: row.tds_rate as number | null,
      tdsAmount,
      netPayable,
      paymentRoute: row.payment_route as string,
      approvedAt: row.decided_at as string | null,
      exportedAt: row.exported_at as string | null,
    };
  });

  if (!filters) return rows;

  return rows.filter((r) => {
    if (filters.reviewIds && !filters.reviewIds.includes(r.reviewId)) return false;
    if (filters.vendorId && r.vendorId !== filters.vendorId) return false;
    if (filters.onlyNotExported && r.exportedAt) return false;
    if (!inRange(r.receivedAt, filters.receivedFrom, filters.receivedTo)) return false;
    if (!inRange(r.approvedAt, filters.approvedFrom, filters.approvedTo)) return false;
    return true;
  });
}

// Routes where the portal itself moves the money (directly, or gross with TDS
// recovered later) — the only ones that belong in a payment batch. "card",
// "employee" and "auto_debit" were already paid outside the portal, so per
// spec they never enter a batch.
const PAYOUT_ELIGIBLE_ROUTES = new Set(["portal", "pay_gross_recover"]);

export function isPayoutEligibleRoute(route: string): boolean {
  return PAYOUT_ELIGIBLE_ROUTES.has(route);
}

/**
 * The amount that should actually move for this row. "pay_gross_recover"
 * pays the full invoice total — TDS is recovered separately later, not
 * deducted from this payment — every other route pays the net-of-TDS figure.
 */
export function payoutAmount(row: ApprovedRow): number | null {
  if (row.paymentRoute === "pay_gross_recover") return row.total;
  return row.netPayable;
}

/** Spec rule: items on hold (PAN missing, bank details unverified) cannot enter a payment batch. */
export function payoutHoldReason(row: ApprovedRow): string | null {
  if (!row.bankAccount) return "Bank account missing";
  if (!row.ifsc) return "IFSC missing";
  if (!row.vendorPan) return "Vendor PAN missing";
  const amount = payoutAmount(row);
  if (amount === null || amount <= 0) return "Payable amount is zero or unknown";
  return null;
}
