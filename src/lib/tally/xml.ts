import "server-only";

/**
 * Tally's XML import format (ENVELOPE/HEADER/BODY/IMPORTDATA/TALLYMESSAGE)
 * is well documented and stable, but this codebase has no live TallyPrime
 * instance to actually test an import against — treat every file this
 * produces as unverified until you've imported it into a TEST/backup
 * company first, never straight into live books. In particular the
 * debit-is-negative sign convention on <AMOUNT> below (ISDEEMEDPOSITIVE
 * "Yes"/negative for a debit, "No"/positive for a credit) is the standard
 * one, but a wrong sign there would flip real accounting entries silently,
 * so it's exactly the kind of thing to check against a test import first.
 */

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** "YYYY-MM-DD" -> "YYYYMMDD", the date format Tally's XML import expects. */
export function tallyDate(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function wrapEnvelope(reportName: "All Masters" | "Vouchers", messages: string[]): string {
  return `<ENVELOPE>
<HEADER>
<TALLYREQUEST>Import Data</TALLYREQUEST>
</HEADER>
<BODY>
<IMPORTDATA>
<REQUESTDESC>
<REPORTNAME>${reportName}</REPORTNAME>
</REQUESTDESC>
<REQUESTDATA>
${messages.join("\n")}
</REQUESTDATA>
</IMPORTDATA>
</BODY>
</ENVELOPE>
`;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "YYYY-MM-DD" -> "Sep 2026", for narrations. Pure arithmetic, no Intl. */
export function monthLabel(dateStr: string): string {
  const [yStr, mStr] = dateStr.split("-");
  const m = Number(mStr);
  return `${MONTH_NAMES[(m - 1 + 12) % 12]} ${yStr}`;
}

/** "YYYY-MM-DD" -> "FY26-27" (Apr-Mar Indian financial year). */
export function financialYearLabel(dateStr: string | null): string {
  if (!dateStr) return "FY";
  const [yStr, mStr] = dateStr.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const startYear = m >= 4 ? y : y - 1;
  const endYear = startYear + 1;
  return `FY${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}
