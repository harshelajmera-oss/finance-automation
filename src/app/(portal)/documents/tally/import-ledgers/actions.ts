"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseTallyLedgerList, type TallyLedgerGroup } from "@/lib/tally/ledger-list-import";

async function requireMakerCheckerOrAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: profile } = await supabase.from("profiles").select("role, org_id").eq("id", user.id).single();
  if (!profile || !["maker", "checker", "admin"].includes(profile.role)) {
    throw new Error("Not permitted.");
  }
  return { supabase, user, orgId: profile.org_id as string };
}

export async function previewTallyLedgerList(formData: FormData): Promise<TallyLedgerGroup[] | { error: string }> {
  await requireMakerCheckerOrAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file first." };

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    return await parseTallyLedgerList(buffer);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read this file." };
  }
}

export async function importAsVendors(
  clientId: string,
  names: string[],
): Promise<{ created: number; skipped: number }> {
  const { supabase, user, orgId } = await requireMakerCheckerOrAdmin();

  const { data: existing } = await supabase.from("vendors").select("name").eq("client_id", clientId);
  const existingNames = new Set((existing ?? []).map((v) => (v.name as string).trim().toLowerCase()));

  const toInsert = [...new Set(names.map((n) => n.trim()).filter(Boolean))].filter(
    (n) => !existingNames.has(n.toLowerCase()),
  );
  const skipped = names.length - toInsert.length;

  if (toInsert.length === 0) return { created: 0, skipped };

  const { error } = await supabase.from("vendors").insert(
    toInsert.map((name) => ({
      org_id: orgId,
      client_id: clientId,
      name,
      tally_ledger_name: name,
      tds_treatment: "deduct" as const,
      created_by: user.id,
    })),
  );
  if (error) throw new Error(error.message);

  revalidatePath("/admin/vendors");
  return { created: toInsert.length, skipped };
}

export async function importAsExpenseLedgers(
  clientId: string,
  entries: { name: string; category: string }[],
): Promise<{ created: number; skipped: number }> {
  const { supabase, user, orgId } = await requireMakerCheckerOrAdmin();

  const { data: existing } = await supabase.from("expense_ledgers").select("name").eq("client_id", clientId);
  const existingNames = new Set((existing ?? []).map((e) => (e.name as string).trim().toLowerCase()));

  const seen = new Set<string>();
  const toInsert = entries.filter((e) => {
    const key = e.name.trim().toLowerCase();
    if (!e.name.trim() || existingNames.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const skipped = entries.length - toInsert.length;

  if (toInsert.length === 0) return { created: 0, skipped };

  const { error } = await supabase.from("expense_ledgers").insert(
    toInsert.map((e) => ({
      org_id: orgId,
      client_id: clientId,
      name: e.name.trim(),
      category: e.category || null,
      created_by: user.id,
    })),
  );
  if (error) throw new Error(error.message);

  revalidatePath("/documents/expense-ledgers");
  return { created: toInsert.length, skipped };
}
