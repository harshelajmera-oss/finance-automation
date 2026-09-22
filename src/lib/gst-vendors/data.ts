import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GstVendorMasterEntry } from "@/lib/supabase/types";

export async function fetchGstVendorMaster(
  supabase: SupabaseClient,
  clientId: string,
  options?: { includeInactive?: boolean; includeUnapproved?: boolean },
): Promise<GstVendorMasterEntry[]> {
  let query = supabase.from("gst_vendor_master").select("*").eq("client_id", clientId).order("party_name", { ascending: true });
  if (!options?.includeInactive) query = query.eq("is_active", true);
  if (!options?.includeUnapproved) query = query.eq("is_approved", true);
  const { data } = await query.returns<GstVendorMasterEntry[]>();
  return data ?? [];
}

export type GstCheckResult =
  | { status: "ok"; partyName: string }
  | { status: "not_found" }
  | { status: "name_mismatch"; expectedName: string };

/** Loose match: same alphanumeric content, case/space/punctuation-insensitive. */
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function checkGstin(
  supabase: SupabaseClient,
  clientId: string,
  gstin: string,
  invoiceVendorName: string | null,
): Promise<GstCheckResult> {
  const { data } = await supabase
    .from("gst_vendor_master")
    .select("party_name")
    .eq("client_id", clientId)
    .eq("gstin", gstin)
    .eq("is_active", true)
    .eq("is_approved", true)
    .maybeSingle<{ party_name: string }>();

  if (!data) return { status: "not_found" };
  if (invoiceVendorName && normalizeName(invoiceVendorName) !== normalizeName(data.party_name)) {
    return { status: "name_mismatch", expectedName: data.party_name };
  }
  return { status: "ok", partyName: data.party_name };
}
