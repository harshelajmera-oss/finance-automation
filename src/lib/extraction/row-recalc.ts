import { computeGrossUp } from "@/lib/tds/gross-up";

/**
 * The auto-fill chain shared by every place that edits Taxable value, GST,
 * TDS and gross-up together — the single-document forms and both grids all
 * need exactly this math, kept here once instead of copied per screen.
 */
export interface RowAmounts {
  taxableValue: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  total: number | null;
  grossUp: boolean;
  netAmount: number | null;
  tdsRate: number | null;
  tdsAmount: number | null;
  amountAlreadyPaid: number | null;
}

export function computeTotal(s: Pick<RowAmounts, "taxableValue" | "cgst" | "sgst" | "igst" | "grossUp" | "netAmount" | "tdsRate" | "total">): number | null {
  if (s.grossUp) {
    // Gross-up rows have no taxable value — the gross total is worked
    // backwards from the fixed net amount instead, once both are known.
    if (s.netAmount !== null && s.tdsRate !== null) return computeGrossUp(s.netAmount, s.tdsRate).gross;
    return s.total;
  }
  if (s.taxableValue === null) return null;
  return s.taxableValue + (s.cgst ?? 0) + (s.sgst ?? 0) + (s.igst ?? 0);
}

export function computeTds(s: Pick<RowAmounts, "tdsRate" | "grossUp" | "netAmount" | "taxableValue" | "total" | "tdsAmount">): number | null {
  if (s.tdsRate === null) return s.tdsAmount;
  if (s.grossUp && s.netAmount !== null) return computeGrossUp(s.netAmount, s.tdsRate).tds;
  const base = s.taxableValue ?? s.total;
  if (base !== null) return Math.round((base * s.tdsRate) / 100);
  return s.tdsAmount;
}

export function computeNetPayable(s: Pick<RowAmounts, "total" | "tdsAmount" | "amountAlreadyPaid">): number | null {
  if (s.total === null || s.tdsAmount === null) return null;
  return s.total - s.tdsAmount - (s.amountAlreadyPaid ?? 0);
}

/** Recomputes Total from taxable value + GST (or from gross-up), then TDS from the result. */
export function recalcAmounts<T extends RowAmounts>(s: T): T {
  const total = computeTotal(s);
  const withTotal = { ...s, total };
  return { ...withTotal, tdsAmount: computeTds(withTotal) };
}

/**
 * A vendor either charges IGST, or CGST+SGST together (never both) — and
 * when they do charge CGST/SGST, the two are always equal. Editing one tax
 * field keeps the others consistent instead of leaving it to whoever's
 * editing to remember the rule.
 */
export function applyGstEdit<T extends Pick<RowAmounts, "cgst" | "sgst" | "igst">>(
  s: T,
  field: "cgst" | "sgst" | "igst",
  value: number | null,
): T {
  const hasValue = value !== null && value !== 0;
  if (field === "igst") {
    return { ...s, igst: value, cgst: hasValue ? null : s.cgst, sgst: hasValue ? null : s.sgst };
  }
  return { ...s, cgst: value, sgst: value, igst: hasValue ? null : s.igst };
}
