import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ledgerNameFor } from "./ledger-export";
import type { PurchaseVoucherInput } from "./purchase-voucher-export";

export interface TallyVendorRow {
  id: string;
  name: string;
  tallyLedgerName: string | null;
  gstin: string | null;
  pan: string | null;
  state: string | null;
  tallyExportedAt: string | null;
}

export async function fetchVendorsForLedgerExport(supabase: SupabaseClient): Promise<TallyVendorRow[]> {
  const { data } = await supabase
    .from("vendors")
    .select("id, name, tally_ledger_name, gstin, pan, state, tally_exported_at")
    .eq("is_approved", true)
    .order("name");

  return (data ?? []).map((v) => ({
    id: v.id as string,
    name: v.name as string,
    tallyLedgerName: v.tally_ledger_name as string | null,
    gstin: v.gstin as string | null,
    pan: v.pan as string | null,
    state: v.state as string | null,
    tallyExportedAt: v.tally_exported_at as string | null,
  }));
}

export interface TallyVoucherRow extends Omit<PurchaseVoucherInput, "expenseLedgerName" | "vendorLedgerName" | "tdsLedgerName"> {
  expenseLedgerName: string | null;
  vendorLedgerName: string | null;
  tdsLedgerName: string | null;
  tallyExportedAt: string | null;
  vendorName: string;
  clientLabel: string;
}

export async function fetchReviewsForVoucherExport(supabase: SupabaseClient): Promise<TallyVoucherRow[]> {
  const [{ data: reviews }, { data: tdsCodes }] = await Promise.all([
    supabase
      .from("reviews")
      .select("*, documents ( clients ( name, code ) ), vendors ( name, tally_ledger_name, default_expense_ledger )")
      .eq("status", "approved")
      .order("decided_at", { ascending: true }),
    supabase.from("tds_codes").select("code, tally_ledger_name"),
  ]);

  const tdsLedgerByCode = new Map((tdsCodes ?? []).map((c) => [c.code as string, c.tally_ledger_name as string | null]));

  return (reviews ?? []).map((row) => {
    const fields = row.checker_edited_fields ?? row.reviewed_fields;
    const vendor = row.vendors as { name: string; tally_ledger_name: string | null; default_expense_ledger: string | null } | null;
    const client = (row.documents as { clients: { name: string; code: string } | null } | null)?.clients;
    const vendorLedgerName = vendor ? ledgerNameFor({ name: vendor.name, tallyLedgerName: vendor.tally_ledger_name }) : null;
    const tdsCode = row.tds_code as string | null;

    return {
      reviewId: row.id as string,
      invoiceNumber: fields?.document?.invoice_number ?? null,
      invoiceDate: fields?.document?.invoice_date ?? null,
      vendorLedgerName,
      expenseLedgerName: (row.expense_ledger as string | null) || vendor?.default_expense_ledger || null,
      taxableValue: fields?.amounts?.taxable_value ?? null,
      total: fields?.amounts?.total ?? 0,
      cgst: fields?.amounts?.cgst ?? null,
      sgst: fields?.amounts?.sgst ?? null,
      igst: fields?.amounts?.igst ?? null,
      tdsLedgerName: tdsCode ? (tdsLedgerByCode.get(tdsCode) ?? null) : null,
      tdsAmount: (row.tds_amount as number | null) ?? 0,
      amountAlreadyPaid: fields?.amounts?.amount_already_paid ?? 0,
      paymentRoute: row.payment_route as string,
      tallyExportedAt: row.tally_exported_at as string | null,
      vendorName: vendor?.name ?? fields?.vendor?.name ?? "—",
      clientLabel: client ? `${client.name} (${client.code})` : "—",
    };
  });
}

/** Mirrors approved.ts's payoutHoldReason — a row with a real gap is excluded from the voucher file, not guessed at. */
export function voucherHoldReason(row: TallyVoucherRow): string | null {
  if (!row.vendorLedgerName) return "No vendor ledger name — vendor wasn't matched or has no name.";
  if (!row.expenseLedgerName) return "No expense ledger set on this vendor or review.";
  if (!row.total || row.total <= 0) return "No invoice total to book.";
  if (row.tdsAmount > 0 && !row.tdsLedgerName) return "TDS applies but its TDS code has no Tally ledger name set (see TDS codes admin page).";
  return null;
}
