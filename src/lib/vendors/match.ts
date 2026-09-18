import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Vendor } from "@/lib/supabase/types";

/**
 * Match on GSTIN first, then PAN — never on name alone, per SPEC.md
 * ("A similar name is shown as a warning only"). A same-name hit when
 * neither identifier matched is surfaced as `possibleNameMatches` so the
 * maker can double check before treating this as a genuinely new vendor.
 */
export async function findVendorMatch(
  supabase: SupabaseClient,
  orgId: string,
  gstin: string | null,
  pan: string | null,
  name: string | null,
): Promise<{ vendor: Vendor | null; possibleNameMatches: Vendor[] }> {
  if (gstin) {
    const { data } = await supabase
      .from("vendors")
      .select("*")
      .eq("org_id", orgId)
      .eq("gstin", gstin)
      .limit(1)
      .maybeSingle<Vendor>();
    if (data) return { vendor: data, possibleNameMatches: [] };
  }

  if (pan) {
    const { data } = await supabase
      .from("vendors")
      .select("*")
      .eq("org_id", orgId)
      .eq("pan", pan)
      .limit(1)
      .maybeSingle<Vendor>();
    if (data) return { vendor: data, possibleNameMatches: [] };
  }

  let possibleNameMatches: Vendor[] = [];
  if (name && name.trim().length > 2) {
    const firstWord = name.trim().split(/\s+/)[0];
    const { data } = await supabase
      .from("vendors")
      .select("*")
      .eq("org_id", orgId)
      .ilike("name", `%${firstWord}%`)
      .limit(5)
      .returns<Vendor[]>();
    possibleNameMatches = data ?? [];
  }

  return { vendor: null, possibleNameMatches };
}
