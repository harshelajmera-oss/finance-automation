"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extractInvoiceFields, isExtractable } from "@/lib/extraction/claude";
import { computeValidationFlags } from "@/lib/extraction/validate";

export async function runExtraction(documentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not signed in.");

  const { data: document } = await supabase
    .from("documents")
    .select("*, clients ( name, gstin )")
    .eq("id", documentId)
    .single();

  if (!document) throw new Error("Document not found.");

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
    const flags = computeValidationFlags(fields, document.clients, document);

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
}
