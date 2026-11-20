import { API_BASE_URL, ApiError, apiRequest, getToken } from "./client";

export interface MakeUpClass {
  makeUpId: number;
  sectionId: number;
  sectionCode: string;
  subjectCode: string;
  subjectTitle: string;
  faculty: string | null;
  labId: number;
  laboratory: string;
  roomCode: string;
  date: string;        // yyyy-mm-dd
  startTime: string;   // HH:mm:ss
  endTime: string;
  hours: number;
  reason: string | null;
  attachmentName: string;
  createdBy: string;
  createdAt: string;
  /** null until the faculty confirms; then "Awaiting final confirmation" or "Confirmed". */
  session: string | null;
}

export interface NewMakeUpClass {
  sectionId: number;
  labId: number;
  date: string;
  startTime: string; // HH:mm
  endTime: string;
  reason: string;
  attachment: File;
}

/** The make-up classes of a semester; the active one when ayId is left out. */
export function getMakeUpClasses(ayId?: number) {
  return apiRequest<MakeUpClass[]>(`/api/makeupclasses${ayId ? `?ayId=${ayId}` : ""}`);
}

export function createMakeUpClass(m: NewMakeUpClass) {
  const form = new FormData();
  form.append("sectionId", String(m.sectionId));
  form.append("labId", String(m.labId));
  form.append("date", m.date);
  form.append("startTime", m.startTime);
  form.append("endTime", m.endTime);
  form.append("reason", m.reason);
  form.append("attachment", m.attachment);
  return apiRequest<{ makeUpId: number }>("/api/makeupclasses", { method: "POST", body: form, keepSessionOn401: true });
}

export function deleteMakeUpClass(id: number) {
  return apiRequest<void>(`/api/makeupclasses/${id}`, { method: "DELETE" });
}

/** Opens the attached approved request in a new tab (it needs the sign-in token, so it is fetched first). */
export async function openMakeUpAttachment(id: number) {
  const token = getToken();
  const tab = window.open("", "_blank"); // opened now, while the click still counts, so it is not blocked
  const res = await fetch(`${API_BASE_URL}/api/makeupclasses/${id}/attachment`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    tab?.close();
    throw new ApiError(res.status, "Could not open the attachment.");
  }
  const url = URL.createObjectURL(await res.blob());
  if (tab) tab.location.href = url;
  else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
