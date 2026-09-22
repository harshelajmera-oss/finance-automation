"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { entityTypeFromPan } from "@/lib/vendors/entity-type";
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

  return { supabase, user, orgId: profile.org_id as string };
}

/**
 * Ordinary vendor fields — name, GSTIN, PAN, state, ledger, TDS defaults,
 * approval — are a normal single-person edit. Bank account and IFSC are
 * deliberately NOT here: SPEC.md calls those out as the most common
 * payment-fraud route, so they go through requestBankChange/decideBankChange
 * instead, which needs a second person to confirm.
 */
export async function updateVendor(
  vendorId: string,
  updates: {
    name: string;
    gstin: string;
    pan: string;
    state: string;
    udyam_number: string;
    tally_ledger_name: string;
    default_expense_ledger: string;
    default_tds_code: string;
    default_tds_rate: number | null;
    gross_up: boolean;
    tds_treatment: TdsTreatment;
    is_approved: boolean;
  },
) {
  const { supabase } = await requireAdminOrChecker();

  const { error } = await supabase
    .from("vendors")
    .update({
      name: updates.name.trim(),
      gstin: updates.gstin.trim() || null,
      pan: updates.pan.trim() || null,
      entity_type: entityTypeFromPan(updates.pan.trim() || null),
      state: updates.state.trim() || null,
      udyam_number: updates.udyam_number.trim() || null,
      tally_ledger_name: updates.tally_ledger_name.trim() || null,
      default_expense_ledger: updates.default_expense_ledger.trim() || null,
      default_tds_code: updates.default_tds_code.trim() || null,
      default_tds_rate: updates.default_tds_rate,
      gross_up: updates.gross_up,
      tds_treatment: updates.tds_treatment,
      is_approved: updates.is_approved,
    })
    .eq("id", vendorId);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/vendors");
  revalidatePath(`/admin/vendors/${vendorId}`);
}

export async function requestBankChange(vendorId: string, proposedBankAccount: string, proposedIfsc: string) {
  const { supabase, user, orgId } = await requireAdminOrChecker();

  const { error } = await supabase.from("vendor_bank_change_requests").insert({
    org_id: orgId,
    vendor_id: vendorId,
    proposed_bank_account: proposedBankAccount.trim() || null,
    proposed_ifsc: proposedIfsc.trim() || null,
    requested_by: user.id,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/vendors/${vendorId}`);
}

export async function decideBankChange(requestId: string, status: "confirmed" | "rejected") {
  const { supabase } = await requireAdminOrChecker();

  const { data: request } = await supabase
    .from("vendor_bank_change_requests")
    .select("vendor_id")
    .eq("id", requestId)
    .single();

  const { error } = await supabase.from("vendor_bank_change_requests").update({ status }).eq("id", requestId);

  if (error) throw new Error(error.message);

  if (request) revalidatePath(`/admin/vendors/${request.vendor_id}`);
}
