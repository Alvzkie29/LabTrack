import { apiRequest } from "./client";

export interface ConfirmSessionPayload {
  sectionId: number;
  sessionDate: string; // ISO date string
  hoursCredited: number;
  notes?: string;
}

export interface ConfirmSessionResult {
  confirmationId: number;
  sessionDate: string;
  hoursCredited: number;
  compliance: {
    confirmedHoursTotal: number;
    requiredHours: number;
    status: "Compliant" | "AtRisk" | "NonCompliant";
  };
}

/**
 * The core "session trustworthiness" action — a Lab Assistant or Custodian confirming that a
 * scheduled class session took place. This IS the CHED-hour crediting step; it happens
 * independently of any student workstation activity.
 */
export function confirmSession(payload: ConfirmSessionPayload) {
  return apiRequest<ConfirmSessionResult>("/api/sessionconfirmations", {
    method: "POST",
    body: payload,
  });
}