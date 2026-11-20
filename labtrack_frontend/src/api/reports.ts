import { apiRequest } from "./client";

export interface WeeklyReportRow {
  sectionId: number;
  sectionCode: string;      // the class code; the template's "SUBJECT CODE" column
  subjectCode: string;      // e.g. "CS 26"; the template's "SUBJECT TITLE" column
  subjectTitle: string;
  faculty: string | null;
  previousHours: number;    // credited before this week
  currentHours: number;     // credited this week (Monday to Saturday)
  subTotal: number;
  remarks: string; // "Completed", or each missed date with its status from Class Status; "" while the week is still running
}

export interface WeeklyReport {
  academicYear: { ayId: number; label: string; termType: string; startDate: string; endDate: string; secondTermStart: string | null };
  term: string;             // "1st Term", "2nd Term" or "Summer"; weekNumber counts from its start
  laboratory: { labId: number; name: string; roomCode: string };
  weekNumber: number;
  weekStart: string; // Monday, yyyy-mm-dd
  weekEnd: string;   // Saturday
  rows: WeeklyReportRow[];
}

export function getWeeklyReport(labId: number, ayId: number, weekStart?: string) {
  const params = new URLSearchParams({ labId: String(labId), ayId: String(ayId) });
  if (weekStart) params.set("weekStart", weekStart);
  return apiRequest<WeeklyReport>(`/api/reports/weekly?${params.toString()}`);
}
