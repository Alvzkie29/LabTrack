import { apiRequest } from "./client";

export interface ScheduleImportResult {
  sectionsCreated: number;
  subjectsCreated: number;
  meetingsAdded: number;
  meetingsAlreadyThere: number;
  errors: string[];
}

export interface RosterImportResult {
  enrolled: number;
  accountsCreated: number;
  alreadyOnRoster: number;
  errors: string[];
}

function toForm(file: File) {
  const form = new FormData();
  form.append("file", file);
  return form;
}

/** Custodian's lab schedule: one row per lab meeting. */
export function importSchedule(ayId: number, file: File) {
  return apiRequest<ScheduleImportResult>(`/api/coursesections/schedule/import?ayId=${ayId}`, {
    method: "POST",
    body: toForm(file),
  });
}

/** One class's student list. */
export function importRoster(sectionId: number, file: File) {
  return apiRequest<RosterImportResult>(`/api/coursesections/${sectionId}/roster/import`, {
    method: "POST",
    body: toForm(file),
  });
}
