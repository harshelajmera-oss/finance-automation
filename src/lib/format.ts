/**
 * Server-rendered pages and client components both call these — if the
 * locale isn't pinned explicitly, `toLocaleDateString()`/`toLocaleString()`
 * fall back to whatever locale the machine running the code defaults to.
 * The Node server and the browser rarely agree (e.g. en-US vs en-GB), which
 * produces a React hydration mismatch even though the underlying date is
 * identical. Pinning "en-IN" also matches how this firm actually writes
 * numbers (1,11,111 rather than 111,111) and dates.
 */
const LOCALE = "en-IN";

export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString(LOCALE, { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatNumber(value: number): string {
  return value.toLocaleString(LOCALE);
}
