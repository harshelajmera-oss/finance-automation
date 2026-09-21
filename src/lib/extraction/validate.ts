import type { Client, Document } from "@/lib/supabase/types";
import type { ExtractedFields, ValidationFlag } from "./schema";
import type { GstCheckResult } from "@/lib/gst-vendors/data";

const GSTIN_FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// GST state codes currently in use. Not exhaustive of every union territory
// code ever issued, but covers the ones a client is realistically in.
const VALID_STATE_CODES = new Set([
  "01","02","03","04","05","06","07","08","09","10",
  "11","12","13","14","15","16","17","18","19","20",
  "21","22","23","24","25","26","27","28","29","30",
  "31","32","33","34","35","36","37","38","97",
]);

function amountsClose(a: number | null, b: number | null, tolerance = 1): boolean {
  if (a === null || b === null) return true; // nothing to compare — not this check's job
  return Math.abs(a - b) <= tolerance;
}

function flag(check: string, severity: ValidationFlag["severity"], message: string): ValidationFlag {
  return { check, severity, message };
}

/**
 * Runs the automatic checks from SPEC.md's "Extraction and validation"
 * table against what Claude read. Two checks from that table aren't here
 * yet because they need a further connection: IFSC lookup (Razorpay's
 * database) and the GSTIN check-digit algorithm (format is checked, the
 * checksum math is not) — both noted as gaps rather than silently skipped.
 */
export function computeValidationFlags(
  fields: ExtractedFields,
  client: Pick<Client, "name" | "gstin"> | null,
  document: Pick<Document, "received_month">,
  gstCheck?: GstCheckResult,
): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  const { vendor, billed_to, service, amounts, document: doc, notes } = fields;
  const clientGstin = client?.gstin ?? null;
  const clientName = client?.name ?? null;

  // GSTIN format
  if (vendor.gstin && !GSTIN_FORMAT.test(vendor.gstin)) {
    flags.push(flag("gstin_format", "error", `Vendor GSTIN "${vendor.gstin}" doesn't match the standard 15-character format.`));
  } else if (vendor.gstin && !VALID_STATE_CODES.has(vendor.gstin.slice(0, 2))) {
    flags.push(flag("gstin_format", "warning", `Vendor GSTIN starts with an unrecognized state code (${vendor.gstin.slice(0, 2)}).`));
  }

  // GSTIN vs PAN
  if (vendor.gstin && vendor.pan && vendor.gstin.length === 15) {
    const embeddedPan = vendor.gstin.slice(2, 12);
    if (embeddedPan !== vendor.pan) {
      flags.push(flag("gstin_vs_pan", "error", `Vendor GSTIN and PAN don't match (GSTIN implies PAN ${embeddedPan}, document shows ${vendor.pan}).`));
    }
  }

  // Tax type: vendor state vs client state, via GSTIN prefix
  if (vendor.gstin && clientGstin && vendor.gstin.length >= 2 && clientGstin.length >= 2) {
    const sameState = vendor.gstin.slice(0, 2) === clientGstin.slice(0, 2);
    const hasCgstSgst = (amounts.cgst ?? 0) > 0 || (amounts.sgst ?? 0) > 0;
    const hasIgst = (amounts.igst ?? 0) > 0;

    if (sameState && hasIgst && !hasCgstSgst) {
      flags.push(flag("tax_type", "error", "Vendor and client are in the same state, but IGST is charged instead of CGST+SGST."));
    } else if (!sameState && hasCgstSgst && !hasIgst) {
      flags.push(flag("tax_type", "error", "Vendor and client are in different states, but CGST+SGST is charged instead of IGST."));
    }
  }

  // Tax + subtotal arithmetic, within ₹1
  const taxSum = (amounts.cgst ?? 0) + (amounts.sgst ?? 0) + (amounts.igst ?? 0);
  if (amounts.taxable_value !== null && amounts.total !== null) {
    if (!amountsClose(amounts.taxable_value + taxSum, amounts.total)) {
      flags.push(
        flag(
          "tax_amount",
          "error",
          `Taxable value + tax (₹${(amounts.taxable_value + taxSum).toFixed(2)}) doesn't match the stated total (₹${amounts.total.toFixed(2)}).`,
        ),
      );
    }
  }

  // Line item arithmetic
  let lineSum = 0;
  let hasLineAmounts = false;
  for (const line of service.line_items) {
    if (line.qty !== null && line.rate !== null && line.amount !== null) {
      hasLineAmounts = true;
      lineSum += line.amount;
      if (!amountsClose(line.qty * line.rate, line.amount)) {
        flags.push(
          flag(
            "line_arithmetic",
            "warning",
            `Line "${line.description ?? "—"}": ${line.qty} × ${line.rate} doesn't equal the stated amount ${line.amount}.`,
          ),
        );
      }
    }
  }
  if (hasLineAmounts && amounts.taxable_value !== null && !amountsClose(lineSum, amounts.taxable_value)) {
    flags.push(flag("line_arithmetic", "warning", `Line items sum to ₹${lineSum.toFixed(2)}, which doesn't match the taxable value ₹${amounts.taxable_value.toFixed(2)}.`));
  }

  // Billed-to matches the client
  if (
    billed_to.name &&
    clientName &&
    !billed_to.name.toLowerCase().includes(clientName.toLowerCase().split(" ")[0].toLowerCase())
  ) {
    flags.push(flag("billed_to", "warning", `Document is billed to "${billed_to.name}", which doesn't obviously match client "${clientName}".`));
  }
  if (billed_to.gstin && clientGstin && billed_to.gstin !== clientGstin) {
    flags.push(flag("billed_to", "error", `Billed-to GSTIN (${billed_to.gstin}) doesn't match the client's GSTIN (${clientGstin}).`));
  }

  // Invoice completeness
  const looksLikeGstInvoice = Boolean(vendor.gstin) || (doc.type ?? "").toLowerCase().includes("gst");
  if (looksLikeGstInvoice && (!service.sac_hsn || !billed_to.place_of_supply)) {
    flags.push(flag("invoice_completeness", "warning", "GST invoice is missing SAC/HSN or place of supply."));
  }

  // Dates
  if (doc.invoice_date) {
    const invoiceDate = new Date(doc.invoice_date);
    if (!Number.isNaN(invoiceDate.getTime()) && invoiceDate > new Date()) {
      flags.push(flag("dates", "error", `Invoice date (${doc.invoice_date}) is in the future.`));
    }

    // Late receipt: invoice dated in an earlier month than the document arrived
    const invoiceMonth = doc.invoice_date.slice(0, 7);
    if (invoiceMonth && invoiceMonth < document.received_month) {
      flags.push(flag("late_receipt", "warning", `Invoice is dated ${doc.invoice_date}, an earlier month than when it was received.`));
    }
  }

  // GST Vendor Master cross-check
  if (gstCheck) {
    if (gstCheck.status === "not_found") {
      flags.push(flag("gst_vendor_master", "warning", "Vendor GSTIN isn't in the GST Vendor Master — unregistered or not yet added."));
    } else if (gstCheck.status === "name_mismatch") {
      flags.push(
        flag(
          "gst_vendor_master",
          "warning",
          `Vendor GSTIN is registered in the GST Vendor Master under a different name ("${gstCheck.expectedName}").`,
        ),
      );
    }
  }

  // Tax flags
  if (notes.reverse_charge_mentioned) {
    flags.push(flag("tax_flags", "warning", "Document mentions reverse charge — confirm RCM treatment."));
  }
  if (notes.tds_mentioned) {
    flags.push(flag("tax_flags", "warning", "Document mentions TDS — confirm the code and rate."));
  }

  return flags;
}
