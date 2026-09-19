import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ApprovedRow {
  documentId: string;
  reviewId: string;
  receivedAt: string;
  clientName: string;
  clientCode: string;
  fileName: string;
  vendorName: string;
  vendorGstin: string | null;
  vendorPan: string | null;
  bankAccount: string | null;
  ifsc: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  total: number | null;
  tdsCode: string | null;
  tdsRate: number | null;
  tdsAmount: number | null;
  netPayable: number | null;
  paymentRoute: string;
  approvedAt: string | null;
}

/**
 * One row per approved document, sourced from the review (not the raw
 * extraction) — an approved review is the confirmed record, so it's the
 * right source for anything payment-facing (bank account, IFSC, TDS, net
 * payable). Uses the checker's edited fields when present, otherwise the
 * maker's submitted fields.
 */
export async function fetchApprovedRows(supabase: SupabaseClient): Promise<ApprovedRow[]> {
  const { data } = await supabase
    .from("reviews")
    .select(
      "*, documents ( id, original_filename, received_at, clients ( name, code ) ), vendors ( name, gstin, pan, bank_account, ifsc )",
    )
    .eq("status", "approved")
    .order("decided_at", { ascending: false });

  return (data ?? []).map((row) => {
    const fields = row.checker_edited_fields ?? row.reviewed_fields;
    const total = fields?.amounts?.total ?? null;
    const tdsAmount = row.tds_amount as number | null;
    const netPayable = total !== null ? total - (tdsAmount ?? 0) : null;
    const doc = row.documents as unknown as {
      id: string;
      original_filename: string;
      received_at: string;
      clients: { name: string; code: string } | null;
    } | null;
    const vendor = row.vendors as unknown as {
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
      vendorName: vendor?.name ?? fields?.vendor?.name ?? "",
      vendorGstin: vendor?.gstin ?? fields?.vendor?.gstin ?? null,
      vendorPan: vendor?.pan ?? fields?.vendor?.pan ?? null,
      bankAccount: vendor?.bank_account ?? null,
      ifsc: vendor?.ifsc ?? null,
      invoiceNumber: fields?.document?.invoice_number ?? null,
      invoiceDate: fields?.document?.invoice_date ?? null,
      total,
      tdsCode: row.tds_code as string | null,
      tdsRate: row.tds_rate as number | null,
      tdsAmount,
      netPayable,
      paymentRoute: row.payment_route as string,
      approvedAt: row.decided_at as string | null,
    };
  });
}
