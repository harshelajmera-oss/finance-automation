/**
 * Pure, client-safe (no "server-only") — live per-field GSTIN match
 * indicators shown next to the vendor GSTIN and billed-to GSTIN inputs
 * themselves, in the single-document forms and both grids. Separate from
 * (and a live, editable-field version of) the frozen extraction-time
 * validation flags computed once in src/lib/extraction/validate.ts.
 */

function normalizeGstin(v: string): string {
  return v.trim().toUpperCase();
}

export type GstinMatchStatus = "match" | "mismatch" | "not_in_master" | "unknown";

/** Billed-to GSTIN should equal the client's own GSTIN on file. */
export function clientGstinStatus(billedToGstin: string | null, clientGstin: string | null): GstinMatchStatus {
  if (!billedToGstin || !clientGstin) return "unknown";
  return normalizeGstin(billedToGstin) === normalizeGstin(clientGstin) ? "match" : "mismatch";
}

/** Vendor GSTIN should be a known entry in that client's GST Vendor Master. */
export function vendorGstinStatus(vendorGstin: string | null, masterGstins: string[]): GstinMatchStatus {
  if (!vendorGstin) return "unknown";
  if (masterGstins.length === 0) return "unknown";
  return masterGstins.some((g) => normalizeGstin(g) === normalizeGstin(vendorGstin)) ? "match" : "not_in_master";
}

const STYLES: Record<Exclude<GstinMatchStatus, "unknown">, { className: string; label: string }> = {
  match: { className: "bg-green-100 text-green-800", label: "✓ match" },
  mismatch: { className: "bg-red-100 text-red-800", label: "✗ mismatch" },
  not_in_master: { className: "bg-amber-100 text-amber-800", label: "not in master" },
};

export function GstinBadge({ status }: { status: GstinMatchStatus }) {
  if (status === "unknown") return null;
  const { className, label } = STYLES[status];
  return <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${className}`}>{label}</span>;
}
