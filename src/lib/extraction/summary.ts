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
  invoiceNumber: string | null;
  invoiceDate: string | null;
  taxableValue: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  total: number | null;
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

  return Array.from(latestByDocument.values())
    .map((row) => {
      const fields = row.fields as ExtractedFields | null;
      const flags = (row.flags ?? []) as ValidationFlag[];
      const doc = row.documents as unknown as {
        original_filename: string;
        received_at: string;
        clients: { name: string; code: string } | null;
      } | null;

      return {
        documentId: row.document_id,
        receivedAt: doc?.received_at ?? "",
        clientName: doc?.clients?.name ?? "",
        clientCode: doc?.clients?.code ?? "",
        fileName: doc?.original_filename ?? "",
        vendorName: fields?.vendor?.name ?? null,
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
