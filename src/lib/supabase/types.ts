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
