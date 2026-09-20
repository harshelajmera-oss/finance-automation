import "server-only";
import { escapeXml, wrapEnvelope, tallyDate, round2, monthLabel, financialYearLabel } from "./xml";

export interface PurchaseVoucherInput {
  reviewId: string;
  invoiceNumber: string | null;
  invoiceDate: string | null; // YYYY-MM-DD — falls back to today's voucher date if missing
  vendorLedgerName: string;
  expenseLedgerName: string;
  taxableValue: number | null;
  total: number;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  tdsLedgerName: string | null;
  tdsAmount: number;
  amountAlreadyPaid: number;
  /** "pay_gross_recover" gets the spec's own special treatment — see buildEntries. */
  paymentRoute: string;
}

interface LedgerEntry {
  ledgerName: string;
  isDebit: boolean;
  amount: number;
}

/**
 * Ledger lines for one invoice's booking voucher. Always balances by
 * construction (debit total always equals credit total) — see the two
 * branches' comments for why. This does not touch RCM: this app has no RCM
 * flag anywhere yet, so an RCM invoice would need its GST treated as an
 * ordinary purchase for now, and someone should adjust it in Tally by hand.
 */
function buildEntries(input: PurchaseVoucherInput): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  const fy = financialYearLabel(input.invoiceDate);
  const expenseAmount = input.taxableValue ?? input.total;

  entries.push({ ledgerName: input.expenseLedgerName, isDebit: true, amount: expenseAmount });
  if (input.cgst) entries.push({ ledgerName: `Input CGST ${fy}`, isDebit: true, amount: input.cgst });
  if (input.sgst) entries.push({ ledgerName: `Input SGST ${fy}`, isDebit: true, amount: input.sgst });
  if (input.igst) entries.push({ ledgerName: `Input IGST ${fy}`, isDebit: true, amount: input.igst });

  if (input.tdsAmount > 0 && input.tdsLedgerName) {
    if (input.paymentRoute === "pay_gross_recover") {
      // SPEC.md: "TDS is debited to 'TDS Recoverable' instead of reducing
      // the payable... the TDS payable ledger is credited as usual." The
      // vendor is credited the full total since the whole invoice gets paid.
      entries.push({ ledgerName: `TDS Recoverable – ${input.vendorLedgerName}`, isDebit: true, amount: input.tdsAmount });
      entries.push({ ledgerName: input.tdsLedgerName, isDebit: false, amount: input.tdsAmount });
      entries.push({ ledgerName: input.vendorLedgerName, isDebit: false, amount: input.total });
    } else {
      entries.push({ ledgerName: input.tdsLedgerName, isDebit: false, amount: input.tdsAmount });
      entries.push({ ledgerName: input.vendorLedgerName, isDebit: false, amount: input.total - input.tdsAmount });
    }
  } else {
    entries.push({ ledgerName: input.vendorLedgerName, isDebit: false, amount: input.total });
  }

  if (input.amountAlreadyPaid > 0) {
    // Nets an advance paid earlier against this invoice: debiting the
    // vendor here (reducing what's now owed) and crediting the advance
    // asset ledger (clearing it) — assumes that ledger is named "Advance
    // to <vendor>"; rename in the XML if the original advance was booked
    // under a different ledger.
    entries.push({ ledgerName: input.vendorLedgerName, isDebit: true, amount: input.amountAlreadyPaid });
    entries.push({ ledgerName: `Advance to ${input.vendorLedgerName}`, isDebit: false, amount: input.amountAlreadyPaid });
  }

  return entries;
}

function buildVoucherXml(input: PurchaseVoucherInput, fallbackDate: string): string {
  const date = input.invoiceDate ?? fallbackDate;
  const narration = `Invoice ${input.invoiceNumber ?? "—"} - ${monthLabel(date)}`;
  const entries = buildEntries(input);

  const entryXml = entries
    .map(
      (e) => `<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>${escapeXml(e.ledgerName)}</LEDGERNAME>
<ISDEEMEDPOSITIVE>${e.isDebit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
<AMOUNT>${e.isDebit ? -round2(e.amount) : round2(e.amount)}</AMOUNT>
</ALLLEDGERENTRIES.LIST>`,
    )
    .join("\n");

  return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="Journal" ACTION="Create">
<DATE>${tallyDate(date)}</DATE>
<NARRATION>${escapeXml(narration)}</NARRATION>
<VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
<PARTYLEDGERNAME>${escapeXml(input.vendorLedgerName)}</PARTYLEDGERNAME>
${entryXml}
</VOUCHER>
</TALLYMESSAGE>`;
}

export function buildPurchaseVoucherXml(inputs: PurchaseVoucherInput[], fallbackDate: string): string {
  const messages = inputs.map((i) => buildVoucherXml(i, fallbackDate));
  return wrapEnvelope("Vouchers", messages);
}
