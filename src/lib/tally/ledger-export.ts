import "server-only";
import { escapeXml, wrapEnvelope } from "./xml";

export interface LedgerExportVendor {
  id: string;
  name: string;
  tallyLedgerName: string | null;
  gstin: string | null;
  pan: string | null;
  state: string | null;
}

/**
 * The exact "Sundry Creditors (Domestic)" / "Sundry Creditors (Foreign
 * Parties)" group names are a guess at the firm's own chart of accounts,
 * following SPEC.md's wording literally — verify these match real group
 * names in the Tally company before importing, and rename in the XML (or
 * in Tally afterwards) if not.
 */
function parentGroupFor(v: LedgerExportVendor): string {
  return v.gstin || v.pan ? "Sundry Creditors (Domestic)" : "Sundry Creditors (Foreign Parties)";
}

export function ledgerNameFor(v: Pick<LedgerExportVendor, "name" | "tallyLedgerName">): string {
  return v.tallyLedgerName?.trim() || v.name;
}

export function buildLedgerCreationXml(vendors: LedgerExportVendor[]): string {
  const messages = vendors.map((v) => {
    const name = escapeXml(ledgerNameFor(v));
    const parent = parentGroupFor(v);
    const extra: string[] = [];
    if (v.gstin) extra.push(`<PARTYGSTIN>${escapeXml(v.gstin)}</PARTYGSTIN>`);
    if (v.pan) extra.push(`<INCOMETAXNUMBER>${escapeXml(v.pan)}</INCOMETAXNUMBER>`);
    if (v.state) extra.push(`<LEDSTATENAME>${escapeXml(v.state)}</LEDSTATENAME>`);

    return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
<LEDGER NAME="${name}" ACTION="Create">
<PARENT>${escapeXml(parent)}</PARENT>
<NAME>${name}</NAME>
<ISBILLWISEON>Yes</ISBILLWISEON>
${extra.join("\n")}
</LEDGER>
</TALLYMESSAGE>`;
  });

  return wrapEnvelope("All Masters", messages);
}
