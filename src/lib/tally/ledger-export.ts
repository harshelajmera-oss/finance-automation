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
 * "Domestic Parties" and "Foreign Parties" — confirmed against a real
 * export of Elemento's own Tally chart of accounts, where both sit as
 * sub-groups directly under Sundry Creditors. A different company's Tally
 * setup could still use different names; verify before importing if so.
 */
function parentGroupFor(v: LedgerExportVendor): string {
  return v.gstin || v.pan ? "Domestic Parties" : "Foreign Parties";
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
