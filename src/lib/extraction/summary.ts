import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedFields, ValidationFlag } from "./schema";

export interface ExtractionSummaryRow {
  documentId: string;
  receivedAt: string;
  clientName: string;
  clientCode: string;
  fileName: string;
  vendorName: string | null;
  vendorGstin: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  taxableValue: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  total: number | null;
  tdsAmount: number | null;
  netPayable: number | null;
  flagCount: number;
}

/**
 * One row per document, taken from its most recent completed extraction.
 * Re-running extraction adds new rows to the `extractions` table rather
 * than overwriting the last attempt, so "latest per document" is picked
 * here rather than assumed to be the only row.
 */
export async function fetchExtractionSummaryRows(
  supabase: SupabaseClient,
): Promise<ExtractionSummaryRow[]> {
  const { data } = await supabase
    .from("extractions")
    .select(
      "document_id, fields, flags, created_at, documents ( original_filename, received_at, clients ( name, code ) )",
    )
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  const extractions = data ?? [];
  const latestByDocument = new Map<string, (typeof extractions)[number]>();
  for (const row of extractions) {
    if (!latestByDocument.has(row.document_id)) {
      latestByDocument.set(row.document_id, row);
    }
  }

  const documentIds = Array.from(latestByDocument.keys());
  const latestReviewByDocument = new Map<string, { tds_amount: number | null; total: number | null; amount_already_paid: number | null }>();

  if (documentIds.length > 0) {
    const { data: reviews } = await supabase
      .from("reviews")
      .select("document_id, tds_amount, reviewed_fields, checker_edited_fields, submitted_at")
      .in("document_id", documentIds)
      .order("submitted_at", { ascending: false });

    for (const review of reviews ?? []) {
      if (latestReviewByDocument.has(review.document_id)) continue;
      const fields = (review.checker_edited_fields ?? review.reviewed_fields) as ExtractedFields | null;
      latestReviewByDocument.set(review.document_id, {
        tds_amount: review.tds_amount as number | null,
        total: fields?.amounts?.total ?? null,
        amount_already_paid: fields?.amounts?.amount_already_paid ?? null,
      });
    }
  }

  return Array.from(latestByDocument.values())
    .map((row) => {
      const fields = row.fields as ExtractedFields | null;
      const flags = (row.flags ?? []) as ValidationFlag[];
      const doc = row.documents as unknown as {
        original_filename: string;
        received_at: string;
        clients: { name: string; code: string } | null;
      } | null;
      const review = latestReviewByDocument.get(row.document_id) ?? null;
      const netPayable =
        review && review.total !== null && review.tds_amount !== null
          ? review.total - review.tds_amount - (review.amount_already_paid ?? 0)
          : null;

      return {
        documentId: row.document_id,
        receivedAt: doc?.received_at ?? "",
        clientName: doc?.clients?.name ?? "",
        clientCode: doc?.clients?.code ?? "",
        fileName: doc?.original_filename ?? "",
        vendorName: fields?.vendor?.name ?? null,
        vendorGstin: fields?.vendor?.gstin ?? null,
        tdsAmount: review?.tds_amount ?? null,
        netPayable,
        invoiceNumber: fields?.document?.invoice_number ?? null,
        invoiceDate: fields?.document?.invoice_date ?? null,
        taxableValue: fields?.amounts?.taxable_value ?? null,
        cgst: fields?.amounts?.cgst ?? null,
        sgst: fields?.amounts?.sgst ?? null,
        igst: fields?.amounts?.igst ?? null,
        total: fields?.amounts?.total ?? null,
        flagCount: flags.length,
      };
    })
    .sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
}
