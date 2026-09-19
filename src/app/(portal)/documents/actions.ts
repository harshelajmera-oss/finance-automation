"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extractInvoiceFields, isExtractable } from "@/lib/extraction/claude";
import { computeValidationFlags } from "@/lib/extraction/validate";
import { entityTypeFromPan } from "@/lib/vendors/entity-type";
import type { ExtractedFields } from "@/lib/extraction/schema";
import type { PaymentRoute, TdsTreatment } from "@/lib/supabase/types";

/**
 * Files live in a private storage bucket, so viewing one means minting a
 * short-lived signed URL rather than linking to it directly. The lookup
 * goes through the same Row Level Security as everything else, so this
 * only ever succeeds for a document in the caller's own organization.
 */
export async function getDocumentViewUrl(documentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not signed in.");

  const { data: document } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .single();

  if (!document) throw new Error("Document not found.");
  if (!document.storage_path) throw new Error("This was entered manually — there's no file attached to view.");

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(document.storage_path, 60);

  if (error) throw new Error(error.message);

  return data.signedUrl;
}

export async function runExtraction(documentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not signed in.");

  const { data: document } = await supabase.from("documents").select("*").eq("id", documentId).single();

  if (!document) throw new Error("Document not found.");
  if (!document.storage_path) throw new Error("This was entered manually — there's no file to extract from.");

  // Fetched explicitly by id rather than via an embedded join — cheap
  // insurance against depending on Supabase's relationship-embedding
  // resolving the way we expect in every code path.
  const { data: client } = await supabase
    .from("clients")
    .select("name, gstin")
    .eq("id", document.client_id)
    .maybeSingle();

  const extension = document.original_filename.split(".").pop()?.toLowerCase() ?? "";

  if (!isExtractable(extension)) {
    const { error } = await supabase.from("extractions").insert({
      document_id: document.id,
      org_id: document.org_id,
      model: "n/a",
      status: "failed",
      error_message: `"${extension}" files aren't read automatically yet — only PDF, JPG and PNG are.`,
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/documents/${documentId}`);
    revalidatePath("/documents");
    revalidatePath("/documents/review-grid");
    return;
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from("documents")
    .download(document.storage_path);

  if (downloadError || !fileData) {
    throw new Error(downloadError?.message ?? "Could not download the file.");
  }

  const bytes = new Uint8Array(await fileData.arrayBuffer());

  try {
    const fields = await extractInvoiceFields(bytes, extension);
    const flags = computeValidationFlags(fields, client ?? null, document);

    const { error } = await supabase.from("extractions").insert({
      document_id: document.id,
      org_id: document.org_id,
      model: "claude-sonnet-5",
      status: "completed",
      fields,
      flags,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    const { error } = await supabase.from("extractions").insert({
      document_id: document.id,
      org_id: document.org_id,
      model: "claude-sonnet-5",
      status: "failed",
      error_message: err instanceof Error ? err.message : "Extraction failed.",
    });
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/documents");
  revalidatePath("/documents/review-grid");
}

interface SubmitReviewPayload {
  reviewedFields: ExtractedFields;
  vendor:
    | { id: string; name: string; tallyLedgerName: string; tdsTreatment: TdsTreatment }
    | { name: string; tallyLedgerName: string; tdsTreatment: TdsTreatment };
  expenseLedger: string;
  tdsCode: string | null;
  tdsRate: number | null;
  tdsAmount: number | null;
  grossUp: boolean;
  paymentRoute: PaymentRoute;
  overrideReason: string | null;
}

export async function submitReview(documentId: string, payload: SubmitReviewPayload) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not signed in.");

  const { data: profile } = await supabase.from("profiles").select("role, org_id").eq("id", user.id).single();

  if (!profile || profile.role !== "maker") {
    throw new Error("Only makers can submit documents for review.");
  }

  let vendorId = "id" in payload.vendor ? payload.vendor.id : null;

  if (!vendorId) {
    const { data: newVendor, error: vendorError } = await supabase
      .from("vendors")
      .insert({
        org_id: profile.org_id,
        name: payload.vendor.name,
        gstin: payload.reviewedFields.vendor.gstin,
        pan: payload.reviewedFields.vendor.pan,
        entity_type: entityTypeFromPan(payload.reviewedFields.vendor.pan),
        state: payload.reviewedFields.vendor.state,
        bank_account: payload.reviewedFields.vendor.bank_account,
        ifsc: payload.reviewedFields.vendor.ifsc,
        tally_ledger_name: payload.vendor.tallyLedgerName || null,
        default_expense_ledger: payload.expenseLedger || null,
        last_tds_code: payload.tdsCode,
        last_tds_rate: payload.tdsRate,
        gross_up: payload.grossUp,
        tds_treatment: payload.vendor.tdsTreatment,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (vendorError) throw new Error(vendorError.message);
    vendorId = newVendor.id;
  }

  const { error } = await supabase.from("reviews").insert({
    document_id: documentId,
    org_id: profile.org_id,
    submitted_by: user.id,
    reviewed_fields: payload.reviewedFields,
    vendor_id: vendorId,
    expense_ledger: payload.expenseLedger || null,
    tds_code: payload.tdsCode,
    tds_rate: payload.tdsRate,
    tds_amount: payload.tdsAmount,
    gross_up: payload.grossUp,
    payment_route: payload.paymentRoute,
    override_reason: payload.overrideReason,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/documents");
  revalidatePath("/documents/review-grid");
  revalidatePath("/documents/checker-queue");
  revalidatePath("/documents/checker-grid");
}

interface CheckerEdits {
  reviewedFields: ExtractedFields;
  expenseLedger: string;
  tdsCode: string | null;
  tdsRate: number | null;
  tdsAmount: number | null;
  grossUp: boolean;
  paymentRoute: PaymentRoute;
}

/**
 * A checker can now edit anything before deciding, not only reject back to
 * the maker. The edit is stored on its own column (checker_edited_fields),
 * separate from the maker's original reviewed_fields, so the record always
 * shows who changed what rather than a silently merged final value.
 */
export async function checkerDecide(
  reviewId: string,
  status: "approved" | "rejected",
  comment: string,
  approveVendorId: string | null,
  edits: CheckerEdits | null,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not signed in.");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (!profile || profile.role !== "checker") {
    throw new Error("Only checkers can approve or reject a submission.");
  }

  if (status === "rejected" && !comment.trim()) {
    throw new Error("A comment is required to reject.");
  }

  const { data: review } = await supabase
    .from("reviews")
    .select("document_id, reviewed_fields")
    .eq("id", reviewId)
    .single();

  const updatePayload: Record<string, unknown> = { status, checker_comment: comment.trim() || null };

  if (edits) {
    const changedFields = JSON.stringify(edits.reviewedFields) !== JSON.stringify(review?.reviewed_fields);
    updatePayload.checker_edited_fields = changedFields ? edits.reviewedFields : null;
    updatePayload.expense_ledger = edits.expenseLedger || null;
    updatePayload.tds_code = edits.tdsCode;
    updatePayload.tds_rate = edits.tdsRate;
    updatePayload.tds_amount = edits.tdsAmount;
    updatePayload.gross_up = edits.grossUp;
    updatePayload.payment_route = edits.paymentRoute;
  }

  const { error } = await supabase.from("reviews").update(updatePayload).eq("id", reviewId);

  if (error) throw new Error(error.message);

  if (status === "approved" && approveVendorId) {
    await supabase.from("vendors").update({ is_approved: true }).eq("id", approveVendorId);
  }

  revalidatePath("/documents/checker-queue");
  revalidatePath("/documents/checker-grid");
  revalidatePath("/documents/review-grid");
  revalidatePath("/documents");
  revalidatePath("/documents/approved");
  revalidatePath("/documents/my-attention");
  if (review) revalidatePath(`/documents/${review.document_id}`);
}

/**
 * A manual fallback for when extraction fails or isn't wanted — the maker
 * types the fields directly instead of Claude reading them. Stored as a
 * regular completed extraction (model: "manual"), so it flows into the
 * same review pipeline as an AI-read one, automatic checks included.
 */
export async function submitManualExtraction(documentId: string, fields: ExtractedFields) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not signed in.");

  const { data: document } = await supabase.from("documents").select("*").eq("id", documentId).single();

  if (!document) throw new Error("Document not found.");

  const { data: client } = await supabase
    .from("clients")
    .select("name, gstin")
    .eq("id", document.client_id)
    .maybeSingle();

  const flags = computeValidationFlags(fields, client ?? null, document);

  const { error } = await supabase.from("extractions").insert({
    document_id: document.id,
    org_id: document.org_id,
    model: "manual",
    status: "completed",
    fields,
    flags,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/documents");
  revalidatePath("/documents/review-grid");
}

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") throw new Error("Only an admin can do this.");
  return user;
}

/**
 * Nothing in this app is ever hard-deleted — a wrongly-uploaded document is
 * archived instead: hidden from the normal lists, but the row, its file and
 * every linked extraction/review stay in the database and can be restored.
 */
export async function archiveDocument(documentId: string) {
  const supabase = await createClient();
  const user = await requireAdmin(supabase);

  const { error } = await supabase
    .from("documents")
    .update({ archived_at: new Date().toISOString(), archived_by: user.id })
    .eq("id", documentId);
  if (error) throw new Error(error.message);

  revalidatePath("/documents");
  revalidatePath("/documents/review-grid");
}

export async function restoreDocument(documentId: string) {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const { error } = await supabase
    .from("documents")
    .update({ archived_at: null, archived_by: null })
    .eq("id", documentId);
  if (error) throw new Error(error.message);

  revalidatePath("/documents");
  revalidatePath("/documents/review-grid");
}

/** Corrects a document filed under the wrong client — logged like any other change, not silently overwritten. */
export async function reassignDocumentClient(documentId: string, clientId: string) {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const { error } = await supabase.from("documents").update({ client_id: clientId }).eq("id", documentId);
  if (error) throw new Error(error.message);

  revalidatePath("/documents");
  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/documents/review-grid");
}
