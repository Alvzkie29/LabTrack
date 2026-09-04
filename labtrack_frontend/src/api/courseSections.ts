import { apiRequest } from "./client";

export interface CourseSectionSummary {
  sectionId: number;
  sectionCode: string;
  subject: { subjectId: number; code: string; title: string };
  academicYear: string;
  instructorName: string | null;
  hasInstructorAssigned: boolean;
  compliance: {
    confirmedHoursTotal: number;
    requiredHours: number;
    status: "Compliant" | "AtRisk" | "NonCompliant";
  } | null;
}

export function getCourseSections(params?: { ayId?: number; pendingInstructorOnly?: boolean }) {
  const query = new URLSearchParams();
  if (params?.ayId) query.set("ayId", String(params.ayId));
  if (params?.pendingInstructorOnly) query.set("pendingInstructorOnly", "true");
  const qs = query.toString();
  return apiRequest<CourseSectionSummary[]>(`/api/coursesections${qs ? `?${qs}` : ""}`);
}

export interface SessionConfirmationRow {
  confirmationId: number;
  sessionDate: string;
  confirmedBy: string;
  hoursCredited: number;
  notes: string | null;
}

// The detail endpoint returns a richer shape than the list endpoint — notably
// academicYear is a full object here (with StartDate, needed for pace projection),
// not just the display label the list endpoint returns. Kept as a separate type
// rather than extending CourseSectionSummary to avoid a conflicting academicYear shape.
export interface CourseSectionDetail {
  sectionId: number;
  sectionCode: string;
  subject: { subjectId: number; code: string; title: string; requiredHours: number; termWeeks: number };
  academicYear: { label: string; startDate: string; endDate: string };
  instructorName: string | null;
  hasInstructorAssigned: boolean;
  compliance: {
    confirmedHoursTotal: number;
    requiredHours: number;
    status: "Compliant" | "AtRisk" | "NonCompliant";
    updatedAt: string;
  } | null;
  sessionConfirmations: SessionConfirmationRow[];
}

export function getCourseSection(id: number) {
  return apiRequest<CourseSectionDetail>(`/api/coursesections/${id}`);
}