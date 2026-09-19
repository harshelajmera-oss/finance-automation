/**
 * Deliberately NOT using `toLocaleDateString`/`toLocaleString`/`Intl` here,
 * even with an explicit locale — a Node build's ICU data can still disagree
 * with a browser's for the same locale string (e.g. one falls back to a
 * default ordering the other doesn't), which reintroduces the exact
 * server/client hydration mismatch this file exists to prevent. Every
 * function below is plain arithmetic and string building, so the server and
 * every browser produce byte-identical output no matter what's installed.
 *
 * Dates are shown in India Standard Time (UTC+5:30) regardless of which
 * timezone the server or the viewer's machine is actually set to — this is
 * an Indian firm's data, so "the date" means the IST calendar date, not
 * whatever the server happens to be running in (often UTC).
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function istParts(value: string | Date) {
  const shifted = new Date(new Date(value).getTime() + IST_OFFSET_MS);
  return {
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth() + 1,
    year: shifted.getUTCFullYear(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
}

export function formatDate(value: string | Date): string {
  const { day, month, year } = istParts(value);
  return `${pad2(day)}/${pad2(month)}/${year}`;
}

export function formatDateTime(value: string | Date): string {
  const { day, month, year, hours, minutes } = istParts(value);
  const h12 = hours % 12 || 12;
  const ampm = hours >= 12 ? "pm" : "am";
  return `${pad2(day)}/${pad2(month)}/${year}, ${h12}:${pad2(minutes)} ${ampm}`;
}

/** Indian digit grouping (lakhs/crores: 1,11,111) — built manually, not via Intl, for the same reason as above. */
export function formatNumber(value: number): string {
  const isNegative = value < 0;
  const fixed = Math.abs(value).toFixed(2);
  const [intPart, decPart] = fixed.split(".");

  let grouped = intPart;
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    grouped = `${rest},${last3}`;
  }

  const decimals = decPart === "00" ? "" : `.${decPart}`;
  return `${isNegative ? "-" : ""}${grouped}${decimals}`;
}
