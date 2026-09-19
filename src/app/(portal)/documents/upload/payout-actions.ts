"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fiscalYearFor, receivedMonthFor, sanitizeFilename } from "@/lib/documents/fiscal-year";
import { parsePayoutSheet } from "@/lib/extraction/payout-sheet";
import { emptyExtractedFields } from "@/lib/extraction/schema";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

export interface PayoutUploadResult {
  batchId: string;
  rowCount: number;
  onHoldCount: number;
  warningCount: number;
  skippedBlankRows: number;
  missingColumns: string[];
}

/**
 * A bulk payout sheet (many payees, no invoices) isn't sent through AI
 * extraction — it's parsed deterministically, and every payee row becomes
 * its own ordinary document + extraction, so it flows through the same
 * maker/checker/vendor-master/approved pipeline as any other document.
 */
export async function uploadPayoutSheet(formData: FormData): Promise<PayoutUploadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not signed in.");

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) throw new Error("No profile found for this account.");

  const clientId = formData.get("clientId");
  const file = formData.get("file");

  if (typeof clientId !== "string" || !clientId) {
    throw new Error("Choose a client before uploading.");
  }
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a file to upload.");
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (extension !== "xls" && extension !== "xlsx") {
    throw new Error("Payout sheets must be XLS or XLSX.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("That file is larger than 25 MB.");
  }

  const { data: client } = await supabase.from("clients").select("id, code").eq("id", clientId).single();
  if (!client) throw new Error("Client not found.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(bytes).digest("hex");

  const { data: existingBatch } = await supabase
    .from("payout_batches")
    .select("id")
    .eq("org_id", profile.org_id)
    .eq("file_hash", fileHash)
    .limit(1)
    .maybeSingle();

  if (existingBatch) {
    throw new Error(
      "This exact sheet has already been imported. If it has new or updated rows, save it under a new file name first.",
    );
  }

  const parsed = await parsePayoutSheet(bytes);
  if (parsed.rows.length === 0) {
    throw new Error(
      "No payee rows were found. Check that row 1 has the column headers and payees start on row 2.",
    );
  }

  const receivedAt = new Date();
  const fiscalYear = fiscalYearFor(receivedAt);
  const receivedMonth = receivedMonthFor(receivedAt);
  const safeName = sanitizeFilename(file.name);
  const batchId = crypto.randomUUID();
  const storagePath = `${profile.org_id}/${client.code}/${fiscalYear}/${receivedMonth}/payout-${batchId}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, bytes, { contentType: file.type || undefined });
  if (uploadError) throw new Error(uploadError.message);

  const { error: batchError } = await supabase.from("payout_batches").insert({
    id: batchId,
    org_id: profile.org_id,
    client_id: client.id,
    uploaded_by: user.id,
    original_filename: file.name,
    storage_path: storagePath,
    file_hash: fileHash,
    row_count: parsed.rows.length,
  });
  if (batchError) throw new Error(batchError.message);

  let onHoldCount = 0;
  let warningCount = 0;

  for (const row of parsed.rows) {
    if (row.hold) onHoldCount++;
    if (row.flags.some((f) => f.severity === "warning")) warningCount++;

    const fields = emptyExtractedFields();
    fields.vendor.name = row.payeeName;
    fields.vendor.pan = row.pan;
    fields.vendor.address = row.address;
    fields.vendor.bank_account = row.bankAccount;
    fields.vendor.ifsc = row.ifsc;
    fields.vendor.email = row.email;
    fields.amounts.total = row.gross;
    fields.payout = {
      gross: row.gross,
      net: row.net,
      tds: row.tds,
      tds_rate_percent: row.tdsRatePercent,
      bank_account_name: row.bankAccountName,
      source_row_label: row.rowLabel,
    };

    const documentId = crypto.randomUUID();
    const { error: docError } = await supabase.from("documents").insert({
      id: documentId,
      org_id: profile.org_id,
      client_id: client.id,
      uploaded_by: user.id,
      source: "bulk_payout",
      original_filename: `${file.name} — ${row.rowLabel}`,
      storage_path: storagePath,
      file_hash: `${fileHash}:${row.rowIndex}`,
      file_size: file.size,
      received_at: receivedAt.toISOString(),
      fiscal_year: fiscalYear,
      received_month: receivedMonth,
      status: "received",
      payout_batch_id: batchId,
      payout_row_index: row.rowIndex,
    });
    if (docError) throw new Error(`Row "${row.rowLabel}": ${docError.message}`);

    const { error: extractionError } = await supabase.from("extractions").insert({
      document_id: documentId,
      org_id: profile.org_id,
      model: "bulk-payout-parser",
      status: "completed",
      fields,
      flags: row.flags,
    });
    if (extractionError) throw new Error(`Row "${row.rowLabel}": ${extractionError.message}`);
  }

  revalidatePath("/documents");
  revalidatePath("/documents/review-grid");

  return {
    batchId,
    rowCount: parsed.rows.length,
    onHoldCount,
    warningCount,
    skippedBlankRows: parsed.skippedBlankRows,
    missingColumns: parsed.missingColumns,
  };
}
