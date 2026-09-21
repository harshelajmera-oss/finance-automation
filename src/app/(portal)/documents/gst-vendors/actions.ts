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

const GSTIN_FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export async function addGstVendor(clientId: string, gstin: string, partyName: string) {
  const { supabase, user, orgId } = await requireMakerCheckerOrAdmin();

  const cleanGstin = gstin.trim().toUpperCase();
  if (!GSTIN_FORMAT.test(cleanGstin)) throw new Error("That doesn't look like a valid 15-character GSTIN.");
  if (!partyName.trim()) throw new Error("Enter a party name.");

  const { error } = await supabase.from("gst_vendor_master").insert({
    org_id: orgId,
    client_id: clientId,
    gstin: cleanGstin,
    party_name: partyName.trim(),
    created_by: user.id,
  });
  if (error) throw new Error(error.message.includes("duplicate") ? "That GSTIN already exists for this client." : error.message);

  revalidatePath("/documents/gst-vendors");
}

export async function setGstVendorActive(id: string, isActive: boolean) {
  const { supabase } = await requireMakerCheckerOrAdmin();

  const { error } = await supabase.from("gst_vendor_master").update({ is_active: isActive }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/documents/gst-vendors");
}

interface UploadSummary {
  created: number;
  updated: number;
  skippedBlankRows: number;
  invalidGstinCount: number;
  missingColumns: string[];
}

function normalizeHeader(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

export async function uploadGstVendors(clientId: string, formData: FormData): Promise<UploadSummary> {
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
  let gstinCol: number | null = null;
  let nameCol: number | null = null;
  headerRow.eachCell((cell, colNumber) => {
    const header = normalizeHeader(cell.value);
    if (header.includes("gstin")) gstinCol = colNumber;
    if (header.includes("party name") || header.includes("vendor name") || header === "name") nameCol = colNumber;
  });

  const missingColumns = [gstinCol === null ? "GSTIN" : null, nameCol === null ? "Party Name" : null].filter(
    (c): c is string => c !== null,
  );
  if (missingColumns.length > 0) {
    return { created: 0, updated: 0, skippedBlankRows: 0, invalidGstinCount: 0, missingColumns };
  }

  const rows: { gstin: string; partyName: string }[] = [];
  let skippedBlankRows = 0;
  let invalidGstinCount = 0;
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const gstin = String(row.getCell(gstinCol!).value ?? "").trim().toUpperCase();
    const partyName = String(row.getCell(nameCol!).value ?? "").trim();
    if (!gstin && !partyName) {
      skippedBlankRows++;
      continue;
    }
    if (!GSTIN_FORMAT.test(gstin)) {
      invalidGstinCount++;
      continue;
    }
    rows.push({ gstin, partyName });
  }

  if (rows.length === 0) {
    return { created: 0, updated: 0, skippedBlankRows, invalidGstinCount, missingColumns: [] };
  }

  const { data: existing } = await supabase.from("gst_vendor_master").select("gstin").eq("client_id", clientId);
  const existingGstins = new Set((existing ?? []).map((r) => r.gstin as string));

  const { error } = await supabase.from("gst_vendor_master").upsert(
    rows.map((r) => ({
      org_id: orgId,
      client_id: clientId,
      gstin: r.gstin,
      party_name: r.partyName,
      is_active: true,
      created_by: user.id,
    })),
    { onConflict: "client_id,gstin" },
  );
  if (error) throw new Error(error.message);

  const created = rows.filter((r) => !existingGstins.has(r.gstin)).length;
  const updated = rows.length - created;

  revalidatePath("/documents/gst-vendors");
  return { created, updated, skippedBlankRows, invalidGstinCount, missingColumns: [] };
}
