export type UserRole = "maker" | "checker" | "admin";

export interface Profile {
  id: string;
  org_id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  org_id: string;
  name: string;
  code: string;
  gstin: string | null;
  created_at: string;
}

export type DocumentStatus = "received" | "duplicate";
export type ExtractionStatus = "pending" | "completed" | "failed";
export type ReviewStatus = "not_submitted" | "submitted" | "approved" | "rejected";

export interface Document {
  id: string;
  org_id: string;
  client_id: string;
  uploaded_by: string | null;
  source: string;
  original_filename: string;
  storage_path: string;
  file_hash: string;
  file_size: number;
  received_at: string;
  fiscal_year: string;
  received_month: string;
  status: DocumentStatus;
  duplicate_of: string | null;
  extraction_status: ExtractionStatus;
  review_status: ReviewStatus;
  created_at: string;
}

export type EntityType = "Individual" | "Firm or LLP" | "Company" | "HUF";
export type TdsTreatment = "deduct" | "pay_gross_recover";

export interface Vendor {
  id: string;
  org_id: string;
  name: string;
  tally_ledger_name: string | null;
  gstin: string | null;
  pan: string | null;
  entity_type: EntityType | null;
  state: string | null;
  udyam_number: string | null;
  bank_account: string | null;
  ifsc: string | null;
  default_expense_ledger: string | null;
  last_tds_code: string | null;
  last_tds_rate: number | null;
  gross_up: boolean;
  tds_treatment: TdsTreatment;
  is_approved: boolean;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TdsCode {
  id: string;
  org_id: string;
  code: string;
  description: string;
  default_rate: number;
  tally_ledger_name: string | null;
  created_at: string;
}

export type PaymentRoute = "portal" | "card" | "employee" | "auto_debit" | "pay_gross_recover";
export type ReviewDecisionStatus = "submitted" | "approved" | "rejected";

export interface Review {
  id: string;
  document_id: string;
  org_id: string;
  submitted_by: string;
  submitted_at: string;
  reviewed_fields: import("@/lib/extraction/schema").ExtractedFields;
  vendor_id: string | null;
  expense_ledger: string | null;
  tds_code: string | null;
  tds_rate: number | null;
  tds_amount: number | null;
  gross_up: boolean;
  payment_route: PaymentRoute;
  override_reason: string | null;
  status: ReviewDecisionStatus;
  checker_id: string | null;
  checker_comment: string | null;
  checker_edited_fields: import("@/lib/extraction/schema").ExtractedFields | null;
  decided_at: string | null;
}

export type BankChangeRequestStatus = "pending" | "confirmed" | "rejected";

export interface VendorBankChangeRequest {
  id: string;
  org_id: string;
  vendor_id: string;
  proposed_bank_account: string | null;
  proposed_ifsc: string | null;
  requested_by: string;
  requested_at: string;
  status: BankChangeRequestStatus;
  confirmed_by: string | null;
  decided_at: string | null;
}

export interface Extraction {
  id: string;
  document_id: string;
  org_id: string;
  model: string;
  status: "completed" | "failed";
  fields: import("@/lib/extraction/schema").ExtractedFields | null;
  flags: import("@/lib/extraction/schema").ValidationFlag[];
  error_message: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  actor_email: string | null;
  org_id: string | null;
  action: string;
  table_name: string;
  record_id: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
}
