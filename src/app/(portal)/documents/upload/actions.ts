"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fiscalYearFor, receivedMonthFor, sanitizeFilename } from "@/lib/documents/fiscal-year";

const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "xls", "xlsx"];
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

export async function uploadDocument(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not signed in.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

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
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new Error(`"${extension}" files aren't accepted. Use PDF, JPG, PNG, XLS or XLSX.`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("That file is larger than 25 MB.");
  }

  const { data: client } = await supabase
    .from("clients")
    .select("id, code")
    .eq("id", clientId)
    .single();

  if (!client) throw new Error("Client not found.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(bytes).digest("hex");

  const { data: existingMatch } = await supabase
    .from("documents")
    .select("id")
    .eq("org_id", profile.org_id)
    .eq("file_hash", fileHash)
    .limit(1)
    .maybeSingle();

  const receivedAt = new Date();
  const fiscalYear = fiscalYearFor(receivedAt);
  const receivedMonth = receivedMonthFor(receivedAt);
  const safeName = sanitizeFilename(file.name);

  const documentId = crypto.randomUUID();
  const storagePath = `${profile.org_id}/${client.code}/${fiscalYear}/${receivedMonth}/${documentId}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, bytes, { contentType: file.type || undefined });

  if (uploadError) throw new Error(uploadError.message);

  const { error: insertError } = await supabase.from("documents").insert({
    id: documentId,
    org_id: profile.org_id,
    client_id: client.id,
    uploaded_by: user.id,
    source: "upload",
    original_filename: file.name,
    storage_path: storagePath,
    file_hash: fileHash,
    file_size: file.size,
    received_at: receivedAt.toISOString(),
    fiscal_year: fiscalYear,
    received_month: receivedMonth,
    status: existingMatch ? "duplicate" : "received",
    duplicate_of: existingMatch?.id ?? null,
  });

  if (insertError) throw new Error(insertError.message);

  revalidatePath("/documents");

  return { documentId, isDuplicate: Boolean(existingMatch) };
}
