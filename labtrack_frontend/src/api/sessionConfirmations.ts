import { apiRequest } from "./client";
import { notifySessionReportsChanged } from "./sessionReportUpdates";

export interface Compliance {
  confirmedHoursTotal: number;
  requiredHours: number;
  status: "Compliant" | "AtRisk" | "NonCompliant";
}

export interface FacultyOption {
  id: string;
  fullName: string;
  schoolId: string;
  isAssigned: boolean;
}

export interface ConfirmationRow {
  confirmationId: number;
  sessionType: "Physical" | "Virtual";
  sessionDate: string;
  facultyConfirmedBy: string | null;
  facultyConfirmedAt: string | null;
  finalConfirmedBy: string | null;
  finalConfirmedAt: string | null;
  hoursCredited: number;
  notes: string | null;
}

export function getFacultyOptions(sectionId?: number) {
  const qs = sectionId ? `?sectionId=${sectionId}` : "";
  return apiRequest<FacultyOption[]>(`/api/sessionconfirmations/faculty${qs}`);
}

export function getConfirmationsBySection(sectionId: number) {
  return apiRequest<ConfirmationRow[]>(`/api/sessionconfirmations/by-section/${sectionId}`);
}

export async function facultyConfirm(payload: { sectionId: number; sessionDate: string; facultyId: string; pin: string }) {
  const result = await apiRequest<{ confirmationId: number; sessionDate: string; hoursCredited: number }>(
    "/api/sessionconfirmations/faculty-confirm",
    { method: "POST", body: payload, keepSessionOn401: true },
  );
  notifySessionReportsChanged();
  return result;
}

export async function finalConfirm(confirmationId: number, notes?: string) {
  const result = await apiRequest<{ confirmationId: number; hoursCredited: number; compliance: Compliance }>(
    `/api/sessionconfirmations/${confirmationId}/final-confirm`,
    { method: "POST", body: { notes } },
  );
  notifySessionReportsChanged();
  return result;
}

export async function createVirtualSession(payload: { sectionId: number; sessionDate: string; hoursCredited: number; notes?: string }) {
  const result = await apiRequest<{ confirmationId: number; hoursCredited: number; compliance: Compliance }>(
    "/api/sessionconfirmations/virtual",
    { method: "POST", body: payload },
  );
  notifySessionReportsChanged();
  return result;
}
