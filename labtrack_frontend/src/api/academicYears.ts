import { apiRequest } from "./client";

export interface AcademicYear {
  ayId: number;
  label: string;
  termType: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export function getAcademicYears() {
  return apiRequest<AcademicYear[]>("/api/academicyears");
}
