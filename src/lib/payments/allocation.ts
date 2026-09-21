/**
 * Pure, client-safe (no "server-only") — used by both the single-payment
 * form and the bulk payment-entry grid to split gross/TDS proportionally
 * across a part-payment, so the split still sums correctly across an
 * invoice's full payment history. See src/lib/extraction/approved.ts's
 * payoutAmount() for why "pay_gross_recover" pays the full total.
 */
export interface AllocationSourceRow {
  paymentRoute: string;
  outstanding: number | null;
  paidSoFar: number;
  total: number | null;
  tdsAmount: number | null;
}

export function allocationAmounts(row: AllocationSourceRow, amount: number): { grossAmount: number; tdsAmount: number } {
  if (row.paymentRoute === "pay_gross_recover") {
    // The full amount is paid out; TDS is recovered separately, not deducted here.
    return { grossAmount: amount, tdsAmount: 0 };
  }
  const fullPayable = row.outstanding !== null ? row.outstanding + row.paidSoFar : null;
  if (fullPayable && fullPayable > 0 && row.total !== null) {
    const fraction = amount / fullPayable;
    return {
      grossAmount: Math.round(row.total * fraction * 100) / 100,
      tdsAmount: Math.round((row.tdsAmount ?? 0) * fraction * 100) / 100,
    };
  }
  return { grossAmount: amount, tdsAmount: 0 };
}
