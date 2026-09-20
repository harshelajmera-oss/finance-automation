import "server-only";
import ExcelJS from "exceljs";
import { Readable } from "stream";

/**
 * Bank statement / payment status file parsing — deterministic, no AI, same
 * approach as the bulk payout sheet parser. Unlike that parser, this one
 * hasn't been checked against a real sample file from the firm's actual
 * bank or from RazorpayX's payout report, since none was available while
 * building it. Header matching is deliberately tolerant (several candidate
 * spellings per column) so it has the best chance of working first try, but
 * treat its output as a proposal to review, not a guaranteed-correct read —
 * same caution the Razorpay payout file's own notes sheet gives for the
 * reverse direction.
 */

export interface BankStatementRow {
  rowNumber: number;
  date: string | null;
  amount: number | null;
  beneficiaryAccount: string | null;
  utr: string | null;
  utrGuessed: boolean;
  narration: string | null;
}

export interface BankStatementParseResult {
  rows: BankStatementRow[];
  missingColumns: string[];
  skippedBlankRows: number;
}

const COLUMN_MATCHERS: Record<string, string[]> = {
  date: ["date"],
  debit: ["debit amount", "withdrawal amt", "withdrawal amount", "debit"],
  amount: ["amount"],
  beneficiaryAccount: [
    "beneficiary account",
    "beneficiary a/c",
    "to account",
    "credit a/c no",
    "credit account",
    "account number",
    "fund account number",
    "payee account",
  ],
  utr: ["utr", "rrn", "reference no", "reference number", "txn ref", "cheque/ref no", "payout id", "unique transaction reference"],
  narration: ["narration", "description", "particulars", "remarks"],
};

// The columns matching still works without: an outgoing-only payment status
// file (RazorpayX's payouts report, for example) has no separate debit
// column, and a UTR can sometimes be read out of the narration instead.
const REQUIRED_FOR_ANY_MATCH = ["date"];

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
      if (result === null || result === undefined || typeof result === "object") return null;
      return String(result).trim() || null;
    }
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : isoDate(v);
    return null;
  }
  const s = String(v).trim();
  return s === "" ? null : s;
}

function cellNumber(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object") {
    if ("result" in v) {
      const result = (v as { result: unknown }).result;
      return typeof result === "number" ? result : null;
    }
    if (v instanceof Date) return null;
  }
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function cellDate(cell: ExcelJS.Cell): string | null {
  const v = cell.value;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : isoDate(v);
  const text = cellText(cell);
  if (!text) return null;
  // Common bank formats: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD.
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const ymd = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  return null;
}

/** Best-effort fallback when there's no dedicated UTR/reference column — picks the longest alphanumeric token. */
function extractUtrFromNarration(narration: string | null): string | null {
  if (!narration) return null;
  const tokens = narration.match(/[A-Za-z0-9]{10,23}/g);
  if (!tokens || tokens.length === 0) return null;
  return tokens.reduce((longest, t) => (t.length > longest.length ? t : longest), tokens[0]);
}

async function loadWorksheet(buffer: Buffer, filename: string): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  try {
    if (filename.toLowerCase().endsWith(".csv")) {
      return await workbook.csv.read(Readable.from(buffer));
    }
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new Error(
      "This file couldn't be read. If any cell has a comment or note attached, remove it (right-click the cell → Delete Comment) and re-save, then upload again.",
    );
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("No sheet found in the uploaded file.");
  return sheet;
}

export async function parseBankStatement(buffer: Buffer, filename: string): Promise<BankStatementParseResult> {
  const sheet = await loadWorksheet(buffer, filename);

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

  const missingColumns = REQUIRED_FOR_ANY_MATCH.filter((k) => columnIndex[k as keyof typeof COLUMN_MATCHERS] === undefined);

  const rows: BankStatementRow[] = [];
  let skippedBlankRows = 0;

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (row.cellCount === 0 || row.values === undefined) continue;

    const get = (key: keyof typeof COLUMN_MATCHERS) => {
      const col = columnIndex[key];
      return col ? row.getCell(col) : null;
    };

    let hasAnyValue = false;
    row.eachCell(() => {
      hasAnyValue = true;
    });
    if (!hasAnyValue) {
      skippedBlankRows++;
      continue;
    }

    const dateCell = get("date");
    const date = dateCell ? cellDate(dateCell) : null;

    const debitCell = get("debit");
    const amountCell = get("amount");
    const amount = debitCell ? cellNumber(debitCell) : amountCell ? cellNumber(amountCell) : null;

    const beneficiaryCell = get("beneficiaryAccount");
    const beneficiaryAccount = beneficiaryCell ? cellText(beneficiaryCell) : null;

    const narrationCell = get("narration");
    const narration = narrationCell ? cellText(narrationCell) : null;

    const utrCell = get("utr");
    const explicitUtr = utrCell ? cellText(utrCell) : null;
    const utr = explicitUtr ?? extractUtrFromNarration(narration);

    if (!date && amount === null && !utr) {
      skippedBlankRows++;
      continue;
    }

    rows.push({
      rowNumber: r,
      date,
      amount: amount !== null && amount > 0 ? amount : null,
      beneficiaryAccount,
      utr,
      utrGuessed: !explicitUtr && utr !== null,
      narration,
    });
  }

  return { rows, missingColumns, skippedBlankRows };
}

function normalizeAccountDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export interface PendingPaymentForMatch {
  id: string;
  paymentDate: string;
  netAmount: number;
  vendorNames: string[];
  bankAccounts: string[];
}

export interface UtrMatch {
  statementRow: BankStatementRow;
  matchedPaymentId: string | null;
  candidatePaymentIds: string[];
  reason: string;
}

const AMOUNT_TOLERANCE = 0.5;

export function matchUtrRows(rows: BankStatementRow[], pending: PendingPaymentForMatch[]): UtrMatch[] {
  return rows.map((row) => {
    if (!row.utr) {
      return { statementRow: row, matchedPaymentId: null, candidatePaymentIds: [], reason: "No UTR value found on this row." };
    }
    if (row.amount === null) {
      return { statementRow: row, matchedPaymentId: null, candidatePaymentIds: [], reason: "No payout amount found on this row." };
    }

    const byAmount = pending.filter((p) => Math.abs(p.netAmount - row.amount!) < AMOUNT_TOLERANCE);
    if (byAmount.length === 0) {
      return { statementRow: row, matchedPaymentId: null, candidatePaymentIds: [], reason: "No pending payment for this amount." };
    }

    const acctDigits = row.beneficiaryAccount ? normalizeAccountDigits(row.beneficiaryAccount) : null;
    const byAccount = acctDigits
      ? byAmount.filter((p) => p.bankAccounts.some((a) => normalizeAccountDigits(a) === acctDigits))
      : [];
    const candidates = byAccount.length > 0 ? byAccount : byAmount;

    if (candidates.length === 1) {
      return {
        statementRow: row,
        matchedPaymentId: candidates[0].id,
        candidatePaymentIds: candidates.map((p) => p.id),
        reason:
          byAccount.length > 0
            ? "Matched by amount and beneficiary account."
            : "Matched by amount only — the statement row's beneficiary account wasn't found or didn't match a pending payment's vendor; verify before confirming.",
      };
    }

    return {
      statementRow: row,
      matchedPaymentId: null,
      candidatePaymentIds: candidates.map((p) => p.id),
      reason: `Ambiguous — ${candidates.length} pending payments share this amount${byAccount.length > 0 ? " and account" : ""}. Pick the right one.`,
    };
  });
}
