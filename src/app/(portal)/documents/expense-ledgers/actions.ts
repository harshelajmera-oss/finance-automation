"use server";

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";

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

export async function addExpenseLedger(clientId: string, name: string, category: string) {
  const { supabase, user, orgId } = await requireMakerCheckerOrAdmin();

  if (!name.trim()) throw new Error("Enter a ledger name.");

  const { error } = await supabase.from("expense_ledgers").insert({
    org_id: orgId,
    client_id: clientId,
    name: name.trim(),
    category: category.trim() || null,
    created_by: user.id,
  });
  if (error) throw new Error(error.message.includes("duplicate") ? "That ledger name already exists for this client." : error.message);

  revalidatePath("/documents/expense-ledgers");
}

export async function setExpenseLedgerActive(id: string, isActive: boolean) {
  const { supabase } = await requireMakerCheckerOrAdmin();

  const { error } = await supabase.from("expense_ledgers").update({ is_active: isActive }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/documents/expense-ledgers");
}

interface UploadSummary {
  created: number;
  updated: number;
  skippedBlankRows: number;
  missingColumns: string[];
}

function normalizeHeader(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

export async function uploadExpenseLedgers(clientId: string, formData: FormData): Promise<UploadSummary> {
  const { supabase, user, orgId } = await requireMakerCheckerOrAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file first.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new Error(
      "This file couldn't be read. If any cell has a comment or note attached, remove it (right-click the cell → Delete Comment) and re-save, then upload again.",
    );
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("No sheet found in this file.");

  const headerRow = sheet.getRow(1);
  let nameCol: number | null = null;
  let categoryCol: number | null = null;
  headerRow.eachCell((cell, colNumber) => {
    const header = normalizeHeader(cell.value);
    if (header.includes("ledger name") || header === "name") nameCol = colNumber;
    if (header.includes("category") || header.includes("group")) categoryCol = colNumber;
  });

  const missingColumns = nameCol === null ? ["Ledger Name"] : [];
  if (missingColumns.length > 0) {
    return { created: 0, updated: 0, skippedBlankRows: 0, missingColumns };
  }

  const rows: { name: string; category: string | null }[] = [];
  let skippedBlankRows = 0;
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const nameCell = row.getCell(nameCol!);
    const name = String(nameCell.value ?? "").trim();
    if (!name) {
      skippedBlankRows++;
      continue;
    }
    const category = categoryCol ? String(row.getCell(categoryCol).value ?? "").trim() || null : null;
    rows.push({ name, category });
  }

  if (rows.length === 0) {
    return { created: 0, updated: 0, skippedBlankRows, missingColumns: [] };
  }

  const { data: existing } = await supabase.from("expense_ledgers").select("name").eq("client_id", clientId);
  const existingNames = new Set((existing ?? []).map((r) => r.name as string));

  const { error } = await supabase.from("expense_ledgers").upsert(
    rows.map((r) => ({
      org_id: orgId,
      client_id: clientId,
      name: r.name,
      category: r.category,
      is_active: true,
      created_by: user.id,
    })),
    { onConflict: "client_id,name" },
  );
  if (error) throw new Error(error.message);

  const created = rows.filter((r) => !existingNames.has(r.name)).length;
  const updated = rows.length - created;

  revalidatePath("/documents/expense-ledgers");
  return { created, updated, skippedBlankRows, missingColumns: [] };
}
