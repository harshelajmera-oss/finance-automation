/**
 * The fields Claude extracts from a document, matching the groups in
 * SPEC.md's "Extraction and validation" section. Kept deliberately flat
 * and honest about what's here today — vendor-master lookups, TDS
 * recommendation and gross-up are later steps, not part of extraction.
 */
export interface ExtractedFields {
  document: {
    type: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    due_date: string | null;
    irn: string | null;
    currency: string | null;
  };
  vendor: {
    name: string | null;
    address: string | null;
    state: string | null;
    gstin: string | null;
    pan: string | null;
    udyam_number: string | null;
    bank_account: string | null;
    ifsc: string | null;
    upi_id: string | null;
    email: string | null;
  };
  billed_to: {
    name: string | null;
    gstin: string | null;
    place_of_supply: string | null;
  };
  service: {
    description: string | null;
    sac_hsn: string | null;
    service_period_from: string | null;
    service_period_to: string | null;
    line_items: Array<{
      description: string | null;
      qty: number | null;
      rate: number | null;
      amount: number | null;
    }>;
  };
  amounts: {
    taxable_value: number | null;
    cgst: number | null;
    sgst: number | null;
    igst: number | null;
    total: number | null;
    amount_already_paid: number | null;
  };
  notes: {
    tds_mentioned: boolean;
    reverse_charge_mentioned: boolean;
    credit_lines_against_earlier_invoices: string | null;
  };
  low_confidence_fields: string[];
  /**
   * Only present for a row parsed from a bulk payout sheet (never set by
   * Claude or manual entry). Carries the gross-up numbers worked out
   * deterministically at import time, so the maker's review screen can
   * start from them instead of recomputing by hand.
   */
  payout?: {
    gross: number | null;
    net: number | null;
    tds: number | null;
    tds_rate_percent: number | null;
    bank_account_name: string | null;
    source_row_label: string;
    /** False for a GST-registered row (taxable value + GST given directly) — those aren't gross-up, they're an ordinary invoice. */
    is_gross_up: boolean;
  } | null;
}

/** A blank starting point for manual entry — same shape a completed extraction has. */
export function emptyExtractedFields(): ExtractedFields {
  return {
    document: { type: null, invoice_number: null, invoice_date: null, due_date: null, irn: null, currency: null },
    vendor: {
      name: null,
      address: null,
      state: null,
      gstin: null,
      pan: null,
      udyam_number: null,
      bank_account: null,
      ifsc: null,
      upi_id: null,
      email: null,
    },
    billed_to: { name: null, gstin: null, place_of_supply: null },
    service: { description: null, sac_hsn: null, service_period_from: null, service_period_to: null, line_items: [] },
    amounts: { taxable_value: null, cgst: null, sgst: null, igst: null, total: null, amount_already_paid: null },
    notes: { tds_mentioned: false, reverse_charge_mentioned: false, credit_lines_against_earlier_invoices: null },
    low_confidence_fields: [],
    payout: null,
  };
}

/** A Claude tool schema forcing the exact shape above back as valid JSON. */
export const EXTRACTION_TOOL = {
  name: "record_extraction",
  description:
    "Record the fields read from this financial document (invoice, receipt, or bill). Use null for anything not present or not legible — never guess a value.",
  input_schema: {
    type: "object" as const,
    properties: {
      document: {
        type: "object",
        properties: {
          type: { type: ["string", "null"], description: "e.g. 'GST invoice', 'receipt', 'debit note'" },
          invoice_number: { type: ["string", "null"] },
          invoice_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
          due_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
          irn: { type: ["string", "null"], description: "e-invoice IRN, if present" },
          currency: { type: ["string", "null"], description: "ISO code, e.g. INR, USD" },
        },
        required: ["type", "invoice_number", "invoice_date", "due_date", "irn", "currency"],
        additionalProperties: false,
      },
      vendor: {
        type: "object",
        properties: {
          name: { type: ["string", "null"] },
          address: { type: ["string", "null"] },
          state: { type: ["string", "null"] },
          gstin: { type: ["string", "null"] },
          pan: { type: ["string", "null"] },
          udyam_number: { type: ["string", "null"] },
          bank_account: { type: ["string", "null"], description: "As printed, kept as text" },
          ifsc: { type: ["string", "null"] },
          upi_id: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
        },
        required: [
          "name",
          "address",
          "state",
          "gstin",
          "pan",
          "udyam_number",
          "bank_account",
          "ifsc",
          "upi_id",
          "email",
        ],
        additionalProperties: false,
      },
      billed_to: {
        type: "object",
        properties: {
          name: { type: ["string", "null"] },
          gstin: { type: ["string", "null"] },
          place_of_supply: { type: ["string", "null"] },
        },
        required: ["name", "gstin", "place_of_supply"],
        additionalProperties: false,
      },
      service: {
        type: "object",
        properties: {
          description: { type: ["string", "null"] },
          sac_hsn: { type: ["string", "null"] },
          service_period_from: { type: ["string", "null"], description: "YYYY-MM-DD" },
          service_period_to: { type: ["string", "null"], description: "YYYY-MM-DD" },
          line_items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: ["string", "null"] },
                qty: { type: ["number", "null"] },
                rate: { type: ["number", "null"] },
                amount: { type: ["number", "null"] },
              },
              required: ["description", "qty", "rate", "amount"],
              additionalProperties: false,
            },
          },
        },
        required: ["description", "sac_hsn", "service_period_from", "service_period_to", "line_items"],
        additionalProperties: false,
      },
      amounts: {
        type: "object",
        properties: {
          taxable_value: { type: ["number", "null"] },
          cgst: { type: ["number", "null"] },
          sgst: { type: ["number", "null"] },
          igst: { type: ["number", "null"] },
          total: { type: ["number", "null"] },
          amount_already_paid: { type: ["number", "null"] },
        },
        required: ["taxable_value", "cgst", "sgst", "igst", "total", "amount_already_paid"],
        additionalProperties: false,
      },
      notes: {
        type: "object",
        properties: {
          tds_mentioned: { type: "boolean" },
          reverse_charge_mentioned: { type: "boolean" },
          credit_lines_against_earlier_invoices: { type: ["string", "null"] },
        },
        required: ["tds_mentioned", "reverse_charge_mentioned", "credit_lines_against_earlier_invoices"],
        additionalProperties: false,
      },
      low_confidence_fields: {
        type: "array",
        items: { type: "string" },
        description: "Dot-paths of fields you're unsure about, e.g. 'amounts.igst'",
      },
    },
    required: ["document", "vendor", "billed_to", "service", "amounts", "notes", "low_confidence_fields"],
    additionalProperties: false,
  },
};

export interface ValidationFlag {
  check: string;
  severity: "error" | "warning";
  message: string;
}
