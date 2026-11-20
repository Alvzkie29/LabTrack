import { apiRequest } from "./client";

export type TermType = "FirstSemester" | "SecondSemester" | "Summer";

export interface AcademicYear {
  ayId: number;
  label: string;          // the school year, "2026-2027"
  termType: string;       // TermType
  startDate: string;
  endDate: string;
  secondTermStart: string | null;
  isActive: boolean;
  classes?: number;
}

export interface SaveAcademicYear {
  label: string;
  termType: TermType;
  startDate: string;      // yyyy-mm-dd
  endDate: string;
  secondTermStart: string | null;
}

export const TERM_LABELS: Record<TermType, string> = {
  FirstSemester: "1st Semester",
  SecondSemester: "2nd Semester",
  Summer: "Summer",
};

/** "1st Semester 2026-2027" */
export const semesterName = (ay: Pick<AcademicYear, "label" | "termType">) =>
  `${TERM_LABELS[ay.termType as TermType] ?? ay.termType} ${ay.label}`;

export function getAcademicYears() {
  return apiRequest<AcademicYear[]>("/api/academicyears");
}

export function createAcademicYear(body: SaveAcademicYear) {
  return apiRequest<{ ayId: number }>("/api/academicyears", { method: "POST", body });
}

export function updateAcademicYear(ayId: number, body: SaveAcademicYear) {
  return apiRequest<void>(`/api/academicyears/${ayId}`, { method: "PUT", body });
}

export function activateAcademicYear(ayId: number) {
  return apiRequest<void>(`/api/academicyears/${ayId}/activate`, { method: "POST" });
}

export function deleteAcademicYear(ayId: number) {
  return apiRequest<void>(`/api/academicyears/${ayId}`, { method: "DELETE" });
}
