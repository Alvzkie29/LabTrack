import { apiRequest } from "./client";

export interface AuditLogEntry {
  auditId: number;
  user: string;
  userRole: string | null;     // already a friendly label, e.g. "Laboratory Assistant"
  userSchoolId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  details: string | null;
  ipAddress: string | null;
  timestamp: string; // Philippine time
}

export interface AuditLogPage {
  total: number;
  page: number;
  pageSize: number;
  items: AuditLogEntry[];
}

/** The stored role names, with the label shown in the dropdown. */
export const AUDIT_ROLES: { value: string; label: string }[] = [
  { value: "Administrator", label: "Administrator" },
  { value: "Custodian", label: "Laboratory Custodian" },
  { value: "LabAssistant", label: "Laboratory Assistant" },
  { value: "Faculty", label: "Faculty" },
  { value: "Student", label: "Student" },
];

export interface AuditLogFilters {
  action?: string;
  role?: string;
  /** Student logins are left out by default: there is one for every class, on every PC. */
  includeStudentLogins?: boolean;
  from?: string; // yyyy-mm-dd
  to?: string;
  page?: number;
  pageSize?: number;
}

export function getAuditLog(filters: AuditLogFilters = {}) {
  const params = new URLSearchParams();
  if (filters.action) params.set("action", filters.action);
  if (filters.role) params.set("role", filters.role);
  if (filters.includeStudentLogins) params.set("includeStudentLogins", "true");
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("page", String(filters.page ?? 1));
  params.set("pageSize", String(filters.pageSize ?? 50));
  return apiRequest<AuditLogPage>(`/api/auditlog?${params.toString()}`);
}
