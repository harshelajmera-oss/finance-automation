/**
 * Indian financial year runs April to March. For a date received in month
 * M of year Y: April–December belongs to FY "Y-(Y+1)"; January–March
 * belongs to FY "(Y-1)-Y". Used to file documents the same way the firm's
 * own Client / FY / Month folders do.
 */
export function fiscalYearFor(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12

  const startYear = month >= 4 ? year : year - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");

  return `${startYear}-${endYearShort}`;
}

/** "2026-09" style month key, matching the received-date folder. */
export function receivedMonthFor(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Keeps filenames filesystem- and URL-safe, same idea as the spec's file naming rule. */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "-");
}
