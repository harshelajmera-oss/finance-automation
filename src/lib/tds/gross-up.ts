/**
 * Gross-up: the agreed NET amount is fixed, so the gross and TDS are worked
 * backwards from it. TDS is rounded to the nearest rupee, matching
 * SPEC.md's worked example (₹1,00,000 net @ 10% → ₹1,11,111 gross,
 * ₹11,111 TDS, ₹1,00,000 paid).
 */
export function computeGrossUp(netAmount: number, ratePercent: number): { gross: number; tds: number } {
  const gross = Math.round(netAmount / (1 - ratePercent / 100));
  const tds = gross - netAmount;
  return { gross, tds };
}
