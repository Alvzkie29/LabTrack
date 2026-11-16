import { apiRequest } from "./client";
import type { ConfirmationRow } from "./sessionConfirmations";

export interface Meeting {
  scheduleId: number;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  laboratory: { labId: number; name: string; roomCode: string };
}

export interface Compliance {
  confirmedHoursTotal: number;
  requiredHours: number;
  status: "Compliant" | "AtRisk" | "NonCompliant";
}

export interface CourseSectionSummary {
  sectionId: number;
  sectionCode: string;
  subject: { subjectId: number; code: string; title: string };
  academicYear: string;
  facultyId: string | null;
  faculty: string | null;
  hasInstructorAssigned: boolean;
  meetings: Meeting[];
  compliance: Compliance | null;
}

export function getCourseSections(params?: { ayId?: number; labId?: number; pendingFacultyOnly?: boolean }) {
  const query = new URLSearchParams();
  if (params?.ayId) query.set("ayId", String(params.ayId));
  if (params?.labId) query.set("labId", String(params.labId));
  if (params?.pendingFacultyOnly) query.set("pendingFacultyOnly", "true");
  const qs = query.toString();
  return apiRequest<CourseSectionSummary[]>(`/api/coursesections${qs ? `?${qs}` : ""}`);
}

export interface CourseSectionDetail {
  sectionId: number;
  sectionCode: string;
  subject: { subjectId: number; code: string; title: string; requiredHours: number; termWeeks: number };
  academicYear: { label: string; startDate: string; endDate: string };
  facultyId: string | null;
  faculty: string | null;
  hasInstructorAssigned: boolean;
  meetings: Meeting[];
  compliance: (Compliance & { updatedAt: string }) | null;
  sessionConfirmations: ConfirmationRow[];
}

export function getCourseSection(id: number) {
  return apiRequest<CourseSectionDetail>(`/api/coursesections/${id}`);
}

/** Assign (or clear, with null) the Faculty member of a class. Custodian and Administrator only. */
export function updateSectionFaculty(sectionId: number, facultyId: string | null) {
  return apiRequest<{ sectionId: number; facultyId: string | null; hasInstructorAssigned: boolean }>(
    `/api/coursesections/${sectionId}/faculty`,
    { method: "PATCH", body: { facultyId } },
  );
}

export interface SectionUtilization {
  sectionId: number;
  confirmedSessions: number;        // physical sessions with final confirmation
  utilizationPercent: number | null; // mean workstation occupancy; null when there are none yet
}

/** Mean workstation utilization per class, over its finally confirmed physical sessions. */
export function getSectionUtilization(params?: { ayId?: number; labId?: number }) {
  const query = new URLSearchParams();
  if (params?.ayId) query.set("ayId", String(params.ayId));
  if (params?.labId) query.set("labId", String(params.labId));
  const qs = query.toString();
  return apiRequest<SectionUtilization[]>(`/api/coursesections/utilization${qs ? `?${qs}` : ""}`);
}
