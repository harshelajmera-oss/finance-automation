import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExpenseLedger } from "@/lib/supabase/types";

export async function fetchExpenseLedgers(
  supabase: SupabaseClient,
  clientId: string,
  options?: { includeInactive?: boolean },
): Promise<ExpenseLedger[]> {
  let query = supabase.from("expense_ledgers").select("*").eq("client_id", clientId).order("name", { ascending: true });
  if (!options?.includeInactive) query = query.eq("is_active", true);
  const { data } = await query.returns<ExpenseLedger[]>();
  return data ?? [];
}
