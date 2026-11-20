import { apiRequest } from "./client";

/**
 * One day of one class. Source "confirmation" = On-site or Virtual from a session confirmation
 * (read-only); "marked" = picked by staff; null = nothing recorded, with a Suggestion when the
 * day has passed.
 */
export interface StatusCell {
  date: string; // yyyy-mm-dd
  meets: boolean; // the class has a lab meeting in this lab on this day
  status: string | null;
  source: "confirmation" | "marked" | null;
  note: string | null;
  suggestion: string | null;
  awaitingFinal: boolean;
  makeUp: boolean; // a make-up class is set for this day
}

export interface StatusRow {
  sectionId: number;
  sectionCode: string;
  subjectCode: string;
  subjectTitle: string;
  faculty: string | null;
  startTime: string;
  endTime: string;
  shift: "Morning" | "Afternoon" | "Evening";
  students: number;
  lectureRoom: string | null; // the "Virtual Lab" column of the office's sheet
  cells: StatusCell[];
}

export interface StatusWeek {
  laboratory: { labId: number; name: string; roomCode: string };
  weekStart: string;
  days: string[]; // Monday to Friday
  statuses: string[]; // the values staff can pick
  unmarked: number; // past meetings with nothing recorded
  rows: StatusRow[];
}

export function getStatusWeek(labId: number, ayId: number, weekStart: string) {
  const params = new URLSearchParams({ labId: String(labId), ayId: String(ayId), weekStart });
  return apiRequest<StatusWeek>(`/api/sessionstatus/week?${params.toString()}`);
}

/** Mark one class meeting. An empty status clears the mark. "Others" needs a note. */
export function markStatus(payload: { sectionId: number; sessionDate: string; status: string; note?: string }) {
  return apiRequest<{ status: string | null; note: string | null }>("/api/sessionstatus", { method: "PUT", body: payload });
}
