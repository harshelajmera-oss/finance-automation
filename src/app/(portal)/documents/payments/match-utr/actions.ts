"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseBankStatement, matchUtrRows, type UtrMatch } from "@/lib/extraction/bank-statement";
import { fetchPendingPayments, applyUtrMatches } from "@/lib/extraction/payments";

export interface PreviewResult {
  matches: UtrMatch[];
  missingColumns: string[];
  skippedBlankRows: number;
  pendingPayments: { id: string; paymentDate: string; netAmount: number; vendorNames: string[] }[];
}

export async function previewBankStatement(formData: FormData): Promise<PreviewResult | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a bank statement or payment status file first." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await parseBankStatement(buffer, file.name);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read this file." };
  }

  if (parsed.missingColumns.length > 0) {
    return { error: `Couldn't find a "Date" column in this file — check it's a transaction-level statement, not a summary.` };
  }

  const pending = await fetchPendingPayments(supabase);
  const matches = matchUtrRows(parsed.rows, pending);

  return {
    matches,
    missingColumns: parsed.missingColumns,
    skippedBlankRows: parsed.skippedBlankRows,
    pendingPayments: pending.map((p) => ({ id: p.id, paymentDate: p.paymentDate, netAmount: p.netAmount, vendorNames: p.vendorNames })),
  };
}

export async function confirmUtrMatches(
  selections: { paymentId: string; utr: string }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  if (selections.length === 0) return { ok: false, error: "Nothing to confirm." };

  const result = await applyUtrMatches(supabase, selections);
  if ("error" in result) return { ok: false, error: result.error };

  revalidatePath("/documents/payments");
  return { ok: true };
}
