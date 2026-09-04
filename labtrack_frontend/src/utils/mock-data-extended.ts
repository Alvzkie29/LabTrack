// LabTrack — extended mock data for the additional prototype screens.
// Additive only: imports from the existing mock-data.ts rather than replacing it.

import { COURSE_SECTIONS, ROOMS, facultyName, type ComplianceStatus } from "@/utils/mock-data";
import type { Role } from "@/contexts/RoleContext";

// ---------- Users (Table 8) ----------
export type UserAccount = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  lastActive: string; // ISO
};

export const USERS: UserAccount[] = [
  { id: "U-001", name: "Dr. Elena Cruz",  email: "admin@labtrack.edu",      role: "Administrator", isActive: true,  lastActive: "2026-07-16T08:12:00Z" },
  { id: "U-002", name: "Pedro Bautista",  email: "custodian@labtrack.edu",  role: "Laboratory Custodian",      isActive: true,  lastActive: "2026-07-16T07:40:00Z" },
  { id: "U-003", name: "Alex Rivera",     email: "a.rivera@labtrack.edu",   role: "Laboratory Assistant",  isActive: true,  lastActive: "2026-07-16T08:02:00Z" },
  { id: "U-004", name: "Miguel Torres",   email: "m.torres@labtrack.edu",   role: "Laboratory Assistant",  isActive: true,  lastActive: "2026-07-15T16:20:00Z" },
  { id: "U-005", name: "Grace Alvarez",   email: "g.alvarez@labtrack.edu",  role: "Laboratory Assistant",  isActive: false, lastActive: "2026-06-28T10:05:00Z" },
  { id: "U-006", name: "Jamie Cortez",    email: "jamie.cortez@umindanao.edu.ph", role: "Student",  isActive: true,  lastActive: "2026-07-16T09:15:00Z" },
];

export function userById(id?: string): UserAccount | undefined {
  return USERS.find((u) => u.id === id);
}

export function assistants(): UserAccount[] {
  return USERS.filter((u) => u.role === "Laboratory Assistant");
}

// ---------- Laboratory Assignments (Table 9 relationship) ----------
export type LabAssignment = {
  roomId: string;
  assistantId?: string; // U-xxx, undefined = unassigned
};

export const LAB_ASSIGNMENTS: LabAssignment[] = [
  { roomId: "CL1", assistantId: "U-003" },
  { roomId: "CL2", assistantId: "U-004" },
  { roomId: "CL3", assistantId: undefined },
];

export function assignedRoomsFor(assistantId: string): string[] {
  return LAB_ASSIGNMENTS.filter((a) => a.assistantId === assistantId).map((a) => a.roomId);
}

export function assistantForRoom(roomId: string): UserAccount | undefined {
  const found = LAB_ASSIGNMENTS.find((a) => a.roomId === roomId);
  return found?.assistantId ? userById(found.assistantId) : undefined;
}

// ---------- Activity Scores / Flagged Sessions (Table 15) ----------
export type PresenceStatus = "Active" | "Idle" | "Flagged";

export type FlaggedSession = {
  id: string;
  pcId: string;
  courseSectionId: string;
  studentName: string;
  presenceStatus: PresenceStatus;
  activityScore: number; // 0-100, composite of keystroke/mouse telemetry
  flaggedAt: string; // ISO
  note?: string;
  resolved: boolean;
};

export const FLAGGED_SESSIONS: FlaggedSession[] = [
  { id: "FS-001", pcId: "CL1-PC03", courseSectionId: "CS-02", studentName: "Ramon Uy",      presenceStatus: "Flagged", activityScore: 6,  flaggedAt: "2026-07-16T09:20:00Z", note: "No keyboard/mouse input for 18 min while marked logged-in.", resolved: false },
  { id: "FS-002", pcId: "CL2-PC06", courseSectionId: "CS-01", studentName: "Bea Fernandez", presenceStatus: "Idle",    activityScore: 22, flaggedAt: "2026-07-16T09:05:00Z", note: "Intermittent activity, below idle threshold twice.",        resolved: false },
  { id: "FS-003", pcId: "CL1-PC07", courseSectionId: "CS-02", studentName: "Noel Basilio",  presenceStatus: "Flagged", activityScore: 3,  flaggedAt: "2026-07-15T14:42:00Z", note: "Possible proxy login — zero input for full session.",       resolved: false },
  { id: "FS-004", pcId: "CL2-PC03", courseSectionId: "CS-01", studentName: "Divine Santos", presenceStatus: "Idle",    activityScore: 31, flaggedAt: "2026-07-14T11:10:00Z", resolved: true },
];

// ---------- Session Confirmations (Table 16) ----------
export type SessionConfirmation = {
  id: string;
  courseSectionId: string;
  sessionDate: string; // ISO date
  studentsPresent: number;
  studentsEnrolled: number;
  hoursCredited: number;
  status: "Pending" | "Confirmed";
  confirmedById?: string; // U-xxx
  confirmedAt?: string;
};

export const SESSION_CONFIRMATIONS: SessionConfirmation[] = [
  { id: "SC-101", courseSectionId: "CS-01", sessionDate: "2026-07-16", studentsPresent: 27, studentsEnrolled: 30, hoursCredited: 2, status: "Pending" },
  { id: "SC-102", courseSectionId: "CS-02", sessionDate: "2026-07-16", studentsPresent: 18, studentsEnrolled: 25, hoursCredited: 2, status: "Pending" },
  { id: "SC-103", courseSectionId: "CS-04", sessionDate: "2026-07-15", studentsPresent: 22, studentsEnrolled: 24, hoursCredited: 4, status: "Confirmed", confirmedById: "U-002", confirmedAt: "2026-07-15T17:05:00Z" },
  { id: "SC-104", courseSectionId: "CS-01", sessionDate: "2026-07-13", studentsPresent: 29, studentsEnrolled: 30, hoursCredited: 2, status: "Confirmed", confirmedById: "U-004", confirmedAt: "2026-07-13T15:40:00Z" },
];

export function pendingConfirmations(): SessionConfirmation[] {
  return SESSION_CONFIRMATIONS.filter((s) => s.status === "Pending");
}

// ---------- Remedial Recommendations (Table 18) ----------
// Rule: a section below required trajectory is flagged; make-up sessions are
// calculated from the projected hour deficit at a fixed session length.
const SESSION_LENGTH_HOURS = 2;

export type RemedialRecommendation = {
  courseSectionId: string;
  hourDeficit: number;
  additionalSessionsNeeded: number;
  generatedAt: string;
  status: ComplianceStatus;
};

export const REMEDIAL_RECOMMENDATIONS: RemedialRecommendation[] = COURSE_SECTIONS
  .filter((cs) => cs.status !== "Compliant")
  .map((cs) => {
    const deficit = Math.max(0, cs.requiredHours - cs.verifiedHours);
    return {
      courseSectionId: cs.id,
      hourDeficit: deficit,
      additionalSessionsNeeded: Math.ceil(deficit / SESSION_LENGTH_HOURS),
      generatedAt: "2026-07-16T06:00:00Z",
      status: cs.status,
    };
  });

export { SESSION_LENGTH_HOURS };

// ---------- Attendance Reports (Custodian inbox / Excel export) ----------
export type AttendanceReport = {
  id: string;
  roomId: string;
  assistantId: string;
  sectionCode: string;
  dateFrom: string;
  dateTo: string;
  rowCount: number;
  status: "Pending Review" | "Reviewed";
  submittedAt: string;
};

export const ATTENDANCE_REPORTS: AttendanceReport[] = [
  { id: "AR-201", roomId: "CL1", assistantId: "U-003", sectionCode: "CS30-CL1-T1", dateFrom: "2026-07-07", dateTo: "2026-07-13", rowCount: 46, status: "Pending Review", submittedAt: "2026-07-14T08:30:00Z" },
  { id: "AR-202", roomId: "CL2", assistantId: "U-004", sectionCode: "IT10-CL2-T1", dateFrom: "2026-07-07", dateTo: "2026-07-13", rowCount: 58, status: "Reviewed",      submittedAt: "2026-07-13T17:10:00Z" },
  { id: "AR-203", roomId: "CL1", assistantId: "U-003", sectionCode: "IT20-CL1-T1", dateFrom: "2026-07-01", dateTo: "2026-07-06", rowCount: 30, status: "Reviewed",      submittedAt: "2026-07-07T09:00:00Z" },
];

// Default Excel template the Custodian has set — export uses this if present.
export const DEFAULT_ATTENDANCE_TEMPLATE: { filename: string; uploadedAt: string } | null = {
  filename: "CCE-Attendance-Format-2026.xlsx",
  uploadedAt: "2026-06-30T10:00:00Z",
};

export function reportsForAssistant(assistantId: string): AttendanceReport[] {
  return ATTENDANCE_REPORTS.filter((r) => r.assistantId === assistantId);
}

export function sectionCodeById(id: string): string {
  return COURSE_SECTIONS.find((cs) => cs.id === id)?.code ?? id;
}

export { facultyName, ROOMS };