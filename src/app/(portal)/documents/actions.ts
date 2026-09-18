"use server";

import { createClient } from "@/lib/supabase/server";

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

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(document.storage_path, 60);

  if (error) throw new Error(error.message);

  return data.signedUrl;
}
