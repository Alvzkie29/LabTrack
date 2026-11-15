import { apiRequest } from "./client";

export interface MyAttendanceRow {
  attendanceId: number;
  section: string;
  workstation: string;
  loginTime: string;
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
  pcIdentifier: string;
  loginTime: string;
  notes: string | null;
}

export interface AttendanceReportFilters {
  sectionId?: number;
  labId?: number;
  from?: string;
  to?: string;
}

export function getAttendanceReport(filters: AttendanceReportFilters) {
  const params = new URLSearchParams();
  if (filters.sectionId) params.set("sectionId", String(filters.sectionId));
  if (filters.labId) params.set("labId", String(filters.labId));
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const qs = params.toString();
  return apiRequest<AttendanceReportRow[]>(`/api/attendancesessions/report${qs ? `?${qs}` : ""}`);
}

export interface LoginRow {
  attendanceId: number;
  studentId: string;
  schoolId: string;
  name: string;
  workstation: string;
  pcIdentifier: string;
  loginTime: string;
  notes: string | null;
}

export interface AbsentRow {
  studentId: string;
  schoolId: string;
  name: string;
}

export interface SectionAttendance {
  section: {
    sectionId: number;
    sectionCode: string;
    subjectCode: string;
    subjectTitle: string;
    meetings: { startTime: string; endTime: string; lab: string }[];
  };
  date: string;
  rosterCount: number;
  presentCount: number;
  absentCount: number;
  present: LoginRow[];
  absent: AbsentRow[];
  notOnRoster: LoginRow[];
}

export function getSectionAttendance(sectionId: number, date?: string) {
  const qs = date ? `?date=${date}` : "";
  return apiRequest<SectionAttendance>(`/api/attendancesessions/by-section/${sectionId}${qs}`);
}

export interface AttendanceDay {
  date: string;
  presentCount: number;
  rosterCount: number;
  workstations: number; // active PCs in the lab(s) the class met in that day
  confirmed: boolean;
  hoursCredited: number | null;
}

/** One row per class day that has at least one login. */
export function getAttendanceHistory(sectionId: number) {
  return apiRequest<AttendanceDay[]>(`/api/attendancesessions/by-section/${sectionId}/history`);
}

export interface WorkstationLogin {
  attendanceId: number;
  student: string;
  schoolId: string;
  section: string;     // the class code
  subjectCode: string;
  loginTime: string;   // Philippine time
  notes: string | null;
}

export interface WorkstationLoginHistory {
  workstation: { workstationId: number; seatLabel: string; pcIdentifier: string; lab: string; isActive: boolean };
  total: number;
  logins: WorkstationLogin[];
}

/** Every student login recorded on one PC, newest first. Dates are yyyy-mm-dd. */
export function getWorkstationLogins(workstationId: number, opts: { from?: string; to?: string } = {}) {
  const params = new URLSearchParams();
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);
  const qs = params.toString();
  return apiRequest<WorkstationLoginHistory>(`/api/attendancesessions/by-workstation/${workstationId}${qs ? `?${qs}` : ""}`);
}
