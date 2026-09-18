"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not signed in.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    throw new Error("Only admins can do this.");
  }

  return { supabase, orgId: profile.org_id as string };
}

export async function addTdsCode(
  code: string,
  description: string,
  defaultRate: number,
  tallyLedgerName: string,
) {
  const { supabase, orgId } = await requireAdmin();

  const { error } = await supabase.from("tds_codes").insert({
    org_id: orgId,
    code: code.trim(),
    description: description.trim(),
    default_rate: defaultRate,
    tally_ledger_name: tallyLedgerName.trim() || null,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error(`TDS code "${code.trim()}" already exists.`);
    }
    throw new Error(error.message);
  }

  revalidatePath("/admin/tds-codes");
}
