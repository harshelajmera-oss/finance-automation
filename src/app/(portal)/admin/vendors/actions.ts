"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TdsTreatment } from "@/lib/supabase/types";

async function requireAdminOrChecker() {
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

  if (!profile || !["admin", "checker"].includes(profile.role)) {
    throw new Error("Only admins or checkers can do this.");
  }

  return { supabase };
}

export async function updateVendor(
  vendorId: string,
  updates: {
    tally_ledger_name: string;
    default_expense_ledger: string;
    gross_up: boolean;
    tds_treatment: TdsTreatment;
    is_approved: boolean;
  },
) {
  const { supabase } = await requireAdminOrChecker();

  const { error } = await supabase
    .from("vendors")
    .update({
      tally_ledger_name: updates.tally_ledger_name.trim() || null,
      default_expense_ledger: updates.default_expense_ledger.trim() || null,
      gross_up: updates.gross_up,
      tds_treatment: updates.tds_treatment,
      is_approved: updates.is_approved,
    })
    .eq("id", vendorId);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/vendors");
  revalidatePath(`/admin/vendors/${vendorId}`);
}
