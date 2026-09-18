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
  created_at: string;
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
