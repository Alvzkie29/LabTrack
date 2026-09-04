import { apiRequest } from "./client";

export interface AttendanceLoginResult {
  attendanceId: number;
  loginTime: string;
}

export interface AttendanceLogoutResult {
  attendanceId: number;
  logoutTime: string;
  activityScore: number | null;
  presenceStatus: string | null;
}

export interface MyAttendanceRow {
  attendanceId: number;
  section: string;
  workstation: string;
  loginTime: string;
  logoutTime: string | null;
  activityScore: number | null;
}

/**
 * Records a student login at a specific workstation for a specific course section.
 * Requires the student to already be authenticated (call auth login first) — this is
 * the separate workstation/attendance layer, not the account login itself.
 */
export function loginAttendance(workstationId: number, sectionId: number) {
  return apiRequest<AttendanceLoginResult>("/api/attendancesessions/login", {
    method: "POST",
    body: { workstationId, sectionId },
  });
}

export function logoutAttendance(attendanceId: number) {
  return apiRequest<AttendanceLogoutResult>(`/api/attendancesessions/${attendanceId}/logout`, {
    method: "POST",
  });
}

export function getMyAttendance() {
  return apiRequest<MyAttendanceRow[]>("/api/attendancesessions/mine");
}

export interface AttendanceReportRow {
  attendanceId: number;
  student: string;
  studentSchoolId: string;
  section: string;
  workstation: string;
  loginTime: string;
  logoutTime: string | null;
  activityScore: number | null;
  presenceStatus: string | null;
  isReviewed: boolean;
  reviewOutcome: string | null;
}

export interface AttendanceReportFilters {
  sectionId?: number;
  labId?: number;
  from?: string; // ISO date
  to?: string; // ISO date
}

/**
 * Real filtered record set for reporting/export — there is no separate submission or
 * review workflow in the backend; this query result is the report.
 */
export function getAttendanceReport(filters: AttendanceReportFilters) {
  const params = new URLSearchParams();
  if (filters.sectionId) params.set("sectionId", String(filters.sectionId));
  if (filters.labId) params.set("labId", String(filters.labId));
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const qs = params.toString();
  return apiRequest<AttendanceReportRow[]>(`/api/attendancesessions/report${qs ? `?${qs}` : ""}`);
}

export interface FlaggedSessionRow {
  attendanceId: number;
  student: string;
  studentSchoolId: string;
  workstation: string;
  section: string;
  compositeScore: number;
  loginTime: string;
  logoutTime: string | null;
}

export function getFlaggedSessions() {
  return apiRequest<FlaggedSessionRow[]>("/api/attendancesessions/flagged");
}

export type ReviewOutcome = 0 | 1; // 0 = Accepted, 1 = Rejected

export interface ReviewSessionResult {
  attendanceId: number;
  isReviewed: boolean;
  reviewOutcome: ReviewOutcome;
  reviewedAt: string;
}

/**
 * Records a human decision on a flagged session. Never affects CHED-hour crediting — that's
 * independent, at the SessionConfirmation level. This only resolves the flag for monitoring
 * purposes and is written to the audit log server-side.
 */
export function reviewSession(attendanceId: number, outcome: ReviewOutcome, notes?: string) {
  return apiRequest<ReviewSessionResult>(`/api/attendancesessions/${attendanceId}/review`, {
    method: "POST",
    body: { outcome, notes },
  });
}