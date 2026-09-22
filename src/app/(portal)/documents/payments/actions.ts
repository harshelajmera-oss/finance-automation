"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordPayment, editPayment as editPaymentRecord, type RecordPaymentInput, type EditPaymentInput } from "@/lib/extraction/payments";

export async function submitPayment(input: RecordPaymentInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  if (input.allocations.length === 0) {
    return { ok: false, error: "Select at least one approved item to pay." };
  }

  const result = await recordPayment(supabase, input);
  if ("error" in result) return { ok: false, error: result.error };

  revalidatePath("/documents/approved");
  revalidatePath("/documents/payments");
  return { ok: true };
}

export async function editPayment(input: EditPaymentInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const result = await editPaymentRecord(supabase, input);
  if ("error" in result) return { ok: false, error: result.error };

  revalidatePath("/documents/payments");
  return { ok: true };
}
