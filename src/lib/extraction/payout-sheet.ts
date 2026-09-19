import "server-only";
import ExcelJS from "exceljs";
import type { ValidationFlag } from "./schema";

export interface PayoutRow {
  rowIndex: number;
  rowLabel: string;
  payeeName: string | null;
  pan: string | null;
  gstin: string | null;
  email: string | null;
  address: string | null;
  bankAccountName: string | null;
  bankAccount: string | null;
  bankAccountSuspect: boolean;
  bankName: string | null;
  branch: string | null;
  ifsc: string | null;
  taxableValue: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  amountAlreadyPaid: number | null;
  /** False when GST columns were given — that's an ordinary invoiced amount, not a gross-up scenario. */
  isGrossUp: boolean;
  gross: number | null;
  net: number | null;
  tds: number | null;
  tdsRatePercent: number | null;
  flags: ValidationFlag[];
  hold: boolean;
}

export interface PayoutSheetParseResult {
  rows: PayoutRow[];
  skippedBlankRows: number;
  missingColumns: string[];
}

// Column headers vary slightly sheet to sheet — matched by a substring
// that's been stable across every sample seen so far, not an exact string.
// Required columns are flagged when missing; optional ones (GST, advance)
// are quietly left blank for sheets that don't carry them — most payout
// sheets are individuals below the GST threshold.
const REQUIRED_COLUMN_MATCHERS: Record<string, string[]> = {
  email: ["email"],
  payeeName: ["name as it appears in pan", "name as per pan"],
  pan: ["pan number", "pan no"],
  address: ["address"],
  bankAccountName: ["name as it appears on the bank", "name as per bank"],
  bankAccount: ["bank account number", "account number"],
  bankName: ["bank name"],
  branch: ["branch"],
  ifsc: ["ifsc"],
  amountPaid: ["amount paid"],
  tdsDeducted: ["tds deducted", "tds amount"],
  grossAmount: ["gross amount"],
};

const OPTIONAL_COLUMN_MATCHERS: Record<string, string[]> = {
  gstin: ["gstin"],
  taxableValue: ["taxable value", "taxable amount"],
  cgst: ["cgst"],
  sgst: ["sgst"],
  igst: ["igst"],
  advance: ["advance", "already paid"],
};

const COLUMN_MATCHERS: Record<string, string[]> = { ...REQUIRED_COLUMN_MATCHERS, ...OPTIONAL_COLUMN_MATCHERS };

const TDS_TOLERANCE_RUPEES = 2;

function normalizeHeader(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function cellText(cell: ExcelJS.Cell): string | null {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray((v as { richText: { text: string }[] }).richText)) {
      return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("").trim() || null;
    }
    if ("text" in v) return String((v as { text: unknown }).text).trim() || null;
    if ("result" in v) {
      const result = (v as { result: unknown }).result;
      if (result === null || result === undefined || (typeof result === "object")) return null;
      return String(result).trim() || null;
    }
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
    return null;
  }
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Returns the number and whether the cell looks like it lost precision or errored out. */
function cellNumber(cell: ExcelJS.Cell): { value: number | null; suspect: boolean } {
  const v = cell.value;
  if (v === null || v === undefined) return { value: null, suspect: false };
  if (typeof v === "number") return { value: v, suspect: false };
  if (typeof v === "object") {
    if ("result" in v) {
      const result = (v as { result: unknown }).result;
      if (typeof result === "number") return { value: result, suspect: false };
      if (result && typeof result === "object" && "error" in result) return { value: null, suspect: true };
      return { value: null, suspect: false };
    }
    if ("error" in v) return { value: null, suspect: true };
    if (v instanceof Date) return { value: null, suspect: true };
  }
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    return { value: Number.isFinite(n) ? n : null, suspect: false };
  }
  return { value: null, suspect: false };
}

/**
 * Bank account numbers as text (as printed) — flagging when the source
 * cell was numeric, since Excel silently drops leading zeros and can push
 * a long digit string into scientific notation. There's no reliable way to
 * reconstruct the original text from a lossy float, so this is surfaced as
 * a flag for the maker to verify against the original sheet, not "fixed."
 */
function cellBankAccount(cell: ExcelJS.Cell): { value: string | null; suspect: boolean } {
  const v = cell.value;
  if (v === null || v === undefined) return { value: null, suspect: false };
  if (typeof v === "object" && "result" in v) {
    const result = (v as { result: unknown }).result;
    if (result && typeof result === "object" && "error" in result) return { value: null, suspect: true };
    if (typeof result === "number") return { value: String(result), suspect: true };
    if (typeof result === "string") return { value: result.trim() || null, suspect: false };
    return { value: null, suspect: true };
  }
  if (typeof v === "number") return { value: String(v), suspect: true };
  if (v instanceof Date) return { value: null, suspect: true };
  const text = cellText(cell);
  return { value: text, suspect: false };
}

const IFSC_PATTERN = /[A-Z]{4}0[A-Z0-9]{6}/;

/**
 * A real-world sheet had "IFSC-SBIN0001055" in the IFSC column — stray
 * prefixes like that are stripped rather than left to fail validation
 * downstream.
 */
function cleanIfsc(raw: string | null): { value: string | null; wasCleaned: boolean } {
  if (!raw) return { value: null, wasCleaned: false };
  const upper = raw.toUpperCase().trim();
  if (IFSC_PATTERN.test(upper) && upper.length === 11) return { value: upper, wasCleaned: false };
  const stripped = upper.replace(/[^A-Z0-9]/g, "");
  const match = stripped.match(IFSC_PATTERN);
  if (match) return { value: match[0], wasCleaned: true };
  return { value: upper || null, wasCleaned: false };
}

export async function parsePayoutSheet(bytes: Uint8Array): Promise<PayoutSheetParseResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    // The Excel-reading library this runs on can't parse cell comments/notes
    // added by some tools (including Excel itself, and openpyxl) — a file
    // that has any crashes the whole load with an unhelpful low-level error.
    throw new Error(
      "This file couldn't be read. If any cell has a comment or note attached, remove it (right-click the cell → Delete Comment) and re-save, then upload again.",
    );
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], skippedBlankRows: 0, missingColumns: Object.keys(COLUMN_MATCHERS) };

  const headerRow = sheet.getRow(1);
  const columnIndex: Partial<Record<keyof typeof COLUMN_MATCHERS, number>> = {};
  headerRow.eachCell((cell, colNumber) => {
    const header = normalizeHeader(cell.value);
    for (const [key, matchers] of Object.entries(COLUMN_MATCHERS)) {
      if (matchers.some((m) => header.includes(m))) {
        columnIndex[key as keyof typeof COLUMN_MATCHERS] = colNumber;
      }
    }
  });

  const missingColumns = Object.keys(REQUIRED_COLUMN_MATCHERS).filter(
    (k) => columnIndex[k as keyof typeof COLUMN_MATCHERS] === undefined,
  );

  const rows: PayoutRow[] = [];
  let skippedBlankRows = 0;
  let dataRowNumber = 0;

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (row.cellCount === 0 || row.values === undefined) continue;

    const get = (key: keyof typeof COLUMN_MATCHERS) => {
      const col = columnIndex[key];
      return col ? row.getCell(col) : null;
    };

    const payeeNameCell = get("payeeName");
    const payeeName = payeeNameCell ? cellText(payeeNameCell) : null;
    const emailCell = get("email");
    const email = emailCell ? cellText(emailCell) : null;

    let hasAnyValue = false;
    row.eachCell(() => {
      hasAnyValue = true;
    });
    const isBlankRow = !payeeName && !email && !hasAnyValue;
    if (isBlankRow) {
      skippedBlankRows++;
      continue;
    }

    dataRowNumber++;
    const rowLabel = payeeName ?? email ?? `Row ${r}`;
    const flags: ValidationFlag[] = [];

    const panCell = get("pan");
    const pan = panCell ? (cellText(panCell) ?? "").toUpperCase() || null : null;

    const bankAccountCell = get("bankAccount");
    const bankAccountResult = bankAccountCell ? cellBankAccount(bankAccountCell) : { value: null, suspect: false };

    const ifscCell = get("ifsc");
    const ifscRaw = ifscCell ? cellText(ifscCell) : null;
    const ifscCleaned = cleanIfsc(ifscRaw);
    const ifsc = ifscCleaned.value;
    if (ifscCleaned.wasCleaned) {
      flags.push({
        check: "ifsc_cleaned",
        severity: "warning",
        message: `IFSC for ${rowLabel} had extra characters removed (sheet had "${ifscRaw}") — verify it reads "${ifsc}".`,
      });
    }

    const amountPaidCell = get("amountPaid");
    const grossAmountCell = get("grossAmount");
    const tdsDeductedCell = get("tdsDeducted");
    const gstinCell = get("gstin");
    const taxableValueCell = get("taxableValue");
    const cgstCell = get("cgst");
    const sgstCell = get("sgst");
    const igstCell = get("igst");
    const advanceCell = get("advance");

    const amountPaid = amountPaidCell ? cellNumber(amountPaidCell) : { value: null, suspect: false };
    const grossAmountField = grossAmountCell ? cellNumber(grossAmountCell) : { value: null, suspect: false };
    const tdsDeducted = tdsDeductedCell ? cellNumber(tdsDeductedCell) : { value: null, suspect: false };
    const gstin = gstinCell ? (cellText(gstinCell) ?? "").toUpperCase() || null : null;
    const taxableValue = taxableValueCell ? cellNumber(taxableValueCell).value : null;
    const cgst = cgstCell ? cellNumber(cgstCell).value : null;
    const sgst = sgstCell ? cellNumber(sgstCell).value : null;
    const igst = igstCell ? cellNumber(igstCell).value : null;
    const amountAlreadyPaid = advanceCell ? cellNumber(advanceCell).value : null;

    // A GST-registered payee (a firm or company, not an individual mentor)
    // gives a taxable value and GST breakup directly — that's an ordinary
    // invoiced amount, not a gross-up scenario, so it's handled separately
    // from the Amount Paid/Gross Amount reconciliation below.
    const isGrossUp = taxableValue === null;
    let gross: number | null = null;
    let net: number | null = null;
    let tds: number | null = null;

    if (!isGrossUp) {
      gross = taxableValue! + (cgst ?? 0) + (sgst ?? 0) + (igst ?? 0);
      tds = tdsDeducted.value;
      net = tds !== null ? gross - tds - (amountAlreadyPaid ?? 0) : null;
    } else {
      // Column headers can't be trusted to say which of "Amount Paid" and
      // "Gross Amount" is actually the gross vs. the net figure — real
      // sample sheets have used both conventions. The larger of the two,
      // when both are present, is the gross (net is always <= gross once
      // TDS is deducted); the smaller is the net actually paid.
      const candidates = [amountPaid.value, grossAmountField.value].filter((n): n is number => n !== null);

      if (candidates.length === 2) {
        gross = Math.max(candidates[0], candidates[1]);
        net = Math.min(candidates[0], candidates[1]);
      } else if (candidates.length === 1) {
        gross = candidates[0];
        net = tdsDeducted.value !== null ? candidates[0] - tdsDeducted.value : null;
        flags.push({
          check: "payout_single_amount_column",
          severity: "warning",
          message: `Only one of "Amount Paid" / "Gross Amount" is filled in for ${rowLabel} — treated ${candidates[0].toLocaleString()} as the gross amount. Verify against the sheet.`,
        });
      }

      tds = tdsDeducted.value ?? (gross !== null && net !== null ? gross - net : null);

      if (gross !== null && net !== null && tds !== null) {
        const impliedTds = gross - net;
        if (Math.abs(impliedTds - tds) > TDS_TOLERANCE_RUPEES) {
          flags.push({
            check: "payout_tax_arithmetic",
            severity: "warning",
            message: `TDS on the sheet (₹${Math.round(tds).toLocaleString()}) for ${rowLabel} doesn't match gross minus net (₹${Math.round(impliedTds).toLocaleString()}) — verify manually.`,
          });
        }
      }
    }

    // The spec rounds gross-up figures to the nearest rupee — the source
    // sheet's own formulas (e.g. a per-session rate card divided unevenly)
    // can leave paise behind.
    gross = gross !== null ? Math.round(gross) : null;
    net = net !== null ? Math.round(net) : null;
    tds = tds !== null ? Math.round(tds) : null;

    // TDS is on the taxable value, excluding GST, per the spec's own rule —
    // for a gross-up row there's no separate taxable value, so the rate is
    // worked out against the gross fee instead.
    const tdsRateBase = isGrossUp ? gross : taxableValue;
    const tdsRatePercent = tdsRateBase && tdsRateBase > 0 && tds !== null ? Math.round((tds / tdsRateBase) * 1000) / 10 : null;

    if (!pan) {
      flags.push({
        check: "missing_pan",
        severity: "error",
        message: `No PAN for ${rowLabel} — on hold until PAN is obtained from the payee.`,
      });
    }

    const bankDetailsUnverified = bankAccountResult.value === null || !ifsc;
    if (bankDetailsUnverified) {
      flags.push({
        check: "bank_details_unverified",
        severity: "error",
        message: `Bank account or IFSC missing/unreadable for ${rowLabel} — on hold until bank details are confirmed.`,
      });
    } else if (bankAccountResult.suspect) {
      flags.push({
        check: "bank_account_suspect",
        severity: "warning",
        message: `Bank account for ${rowLabel} was stored as a number in the sheet, not text — leading zeros or precision may have been lost. Verify against the original file.`,
      });
    }

    const hold = flags.some((f) => f.severity === "error");

    rows.push({
      rowIndex: dataRowNumber,
      rowLabel,
      payeeName,
      pan,
      gstin,
      email,
      address: (() => {
        const c = get("address");
        return c ? cellText(c) : null;
      })(),
      bankAccountName: (() => {
        const c = get("bankAccountName");
        return c ? cellText(c) : null;
      })(),
      bankAccount: bankAccountResult.value,
      bankAccountSuspect: bankAccountResult.suspect,
      bankName: (() => {
        const c = get("bankName");
        return c ? cellText(c) : null;
      })(),
      branch: (() => {
        const c = get("branch");
        return c ? cellText(c) : null;
      })(),
      ifsc,
      taxableValue,
      cgst,
      sgst,
      igst,
      amountAlreadyPaid,
      isGrossUp,
      gross,
      net,
      tds,
      tdsRatePercent,
      flags,
      hold,
    });
  }

  return { rows, skippedBlankRows, missingColumns };
}
