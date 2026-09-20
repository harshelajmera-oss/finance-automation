import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentMode } from "@/lib/supabase/types";
import { payoutAmount, type ApprovedRow } from "@/lib/extraction/approved";

/** What's still owed on this row after everything already recorded as paid against it. */
export function outstandingAmount(row: ApprovedRow, paidByReview: Map<string, number>): number | null {
  const amount = payoutAmount(row);
  if (amount === null) return null;
  return Math.round((amount - (paidByReview.get(row.reviewId) ?? 0)) * 100) / 100;
}

/** Sum of everything already recorded as paid against each review, across all payments. */
export async function fetchPaidAmountsByReview(supabase: SupabaseClient, reviewIds?: string[]): Promise<Map<string, number>> {
  let query = supabase.from("payment_allocations").select("review_id, amount");
  if (reviewIds) query = query.in("review_id", reviewIds);
  const { data } = await query;

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    map.set(row.review_id as string, (map.get(row.review_id as string) ?? 0) + (row.amount as number));
  }
  return map;
}

export interface PaymentAllocationInput {
  reviewId: string;
  amount: number;
  grossAmount: number;
  tdsAmount: number;
}

export interface RecordPaymentInput {
  paymentDate: string;
  mode: PaymentMode;
  utr: string | null;
  reference: string | null;
  paidFromLedger: string | null;
  proofUrl: string | null;
  isAdvance: boolean;
  notes: string | null;
  allocations: PaymentAllocationInput[];
}

export async function recordPayment(supabase: SupabaseClient, input: RecordPaymentInput): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase.rpc("record_payment", {
    p_payment_date: input.paymentDate,
    p_mode: input.mode,
    p_utr: input.utr,
    p_reference: input.reference,
    p_paid_from_ledger: input.paidFromLedger,
    p_proof_url: input.proofUrl,
    p_is_advance: input.isAdvance,
    p_notes: input.notes,
    p_allocations: input.allocations.map((a) => ({
      review_id: a.reviewId,
      amount: a.amount,
      gross_amount: a.grossAmount,
      tds_amount: a.tdsAmount,
    })),
  });

  if (error) return { error: error.message };
  return { id: data as string };
}

export interface PaymentHistoryLine {
  reviewId: string;
  amount: number;
  vendorName: string;
  invoiceNumber: string | null;
  clientName: string;
}

export interface PaymentHistoryRow {
  id: string;
  paymentDate: string;
  mode: PaymentMode;
  utr: string | null;
  reference: string | null;
  paidFromLedger: string | null;
  proofUrl: string | null;
  isAdvance: boolean;
  notes: string | null;
  grossAmount: number;
  tdsAmount: number;
  netAmount: number;
  createdAt: string;
  lines: PaymentHistoryLine[];
}

export async function fetchPaymentHistory(supabase: SupabaseClient): Promise<PaymentHistoryRow[]> {
  const { data } = await supabase
    .from("payments")
    .select(
      "*, payment_allocations ( review_id, amount, reviews ( reviewed_fields, checker_edited_fields, vendors ( name ), documents ( clients ( name, code ) ) ) )",
    )
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => {
    const allocations = (row.payment_allocations ?? []) as unknown as {
      review_id: string;
      amount: number;
      reviews: {
        reviewed_fields: { document?: { invoice_number?: string | null }; vendor?: { name?: string | null } };
        checker_edited_fields: { document?: { invoice_number?: string | null }; vendor?: { name?: string | null } } | null;
        vendors: { name: string } | null;
        documents: { clients: { name: string; code: string } | null } | null;
      } | null;
    }[];

    const lines: PaymentHistoryLine[] = allocations.map((a) => {
      const fields = a.reviews?.checker_edited_fields ?? a.reviews?.reviewed_fields;
      const client = a.reviews?.documents?.clients;
      return {
        reviewId: a.review_id,
        amount: a.amount,
        vendorName: a.reviews?.vendors?.name ?? fields?.vendor?.name ?? "—",
        invoiceNumber: fields?.document?.invoice_number ?? null,
        clientName: client ? `${client.name} (${client.code})` : "—",
      };
    });

    return {
      id: row.id as string,
      paymentDate: row.payment_date as string,
      mode: row.mode as PaymentMode,
      utr: row.utr as string | null,
      reference: row.reference as string | null,
      paidFromLedger: row.paid_from_ledger as string | null,
      proofUrl: row.proof_url as string | null,
      isAdvance: row.is_advance as boolean,
      notes: row.notes as string | null,
      grossAmount: row.gross_amount as number,
      tdsAmount: row.tds_amount as number,
      netAmount: row.net_amount as number,
      createdAt: row.created_at as string,
      lines,
    };
  });
}
