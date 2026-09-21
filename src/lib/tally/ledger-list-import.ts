import "server-only";
import ExcelJS from "exceljs";

/**
 * Tally's own "List of Ledgers" export (Display -> Statements of Accounts
 * -> List of Ledgers, exported to Excel) is one flat column with no
 * indentation markers — but a group heading (Sundry Creditors, Domestic
 * Parties, Professional Expenses, ...) is always bold, and an actual
 * ledger name is always plain. That's the only reliable signal in the
 * file, confirmed against a real export.
 *
 * A ledger's group can be nested arbitrarily deep (Sundry Creditors ->
 * Domestic Parties -> Amazon), and nothing in the file says how deep any
 * given bold row sits — so rather than guess, this surfaces every bold
 * group with the plain-text rows directly under it (before the next bold
 * row), and leaves picking which groups to import to the person doing it.
 * Ticking "Domestic Parties" gets the vendor names; ticking "Sundry
 * Creditors" itself would get nothing, since its own direct rows are all
 * further group headings, not ledgers — a person can see that from the
 * item count and tick the right one.
 */
export interface TallyLedgerGroup {
  index: number;
  name: string;
  leaves: string[];
}

export async function parseTallyLedgerList(buffer: Buffer): Promise<TallyLedgerGroup[]> {
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

  const groups: TallyLedgerGroup[] = [];
  let current: TallyLedgerGroup | null = null;

  for (let r = 1; r <= sheet.rowCount; r++) {
    const cell = sheet.getRow(r).getCell(1);
    const value = String(cell.value ?? "").replace(/\r\n?/g, " ").trim();
    if (!value) continue;

    if (cell.font?.bold) {
      current = { index: groups.length, name: value, leaves: [] };
      groups.push(current);
    } else if (current) {
      current.leaves.push(value);
    }
  }

  return groups.filter((g) => g.leaves.length > 0);
}
