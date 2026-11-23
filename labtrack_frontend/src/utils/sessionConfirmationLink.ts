interface ConfirmationSessionTarget {
  sectionId: number;
  date: string;
  labId?: number;
  ayId?: number;
  pendingView?: boolean;
}

/** Carry the selected meeting without changing the existing confirmation route. */
export function confirmationSessionPath(target: ConfirmationSessionTarget) {
  const params = new URLSearchParams({ sectionId: String(target.sectionId), date: target.date });
  if (target.labId !== undefined) params.set("labId", String(target.labId));
  if (target.ayId !== undefined) params.set("ayId", String(target.ayId));
  if (target.pendingView) params.set("view", "pending");
  return `/confirm-session?${params.toString()}`;
}

export function pendingConfirmationsPath(context: { labId?: number; ayId?: number }) {
  const params = new URLSearchParams({ view: "pending" });
  if (context.labId !== undefined) params.set("labId", String(context.labId));
  if (context.ayId !== undefined) params.set("ayId", String(context.ayId));
  return `/confirm-session?${params.toString()}`;
}

function positiveId(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : undefined;
}
function calendarDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined;
}

export function readConfirmationSessionLink(params: URLSearchParams) {
  const sectionId = positiveId(params.get("sectionId"));
  const date = calendarDate(params.get("date"));
  const labId = positiveId(params.get("labId"));
  const ayId = positiveId(params.get("ayId"));
  const pendingView = params.get("view") === "pending";
  const hasContext = ["sectionId", "date", "labId", "ayId"].some(key => params.has(key));
  const hasTarget = params.has("sectionId") || params.has("date");
  const invalid = hasContext && ((hasTarget || !pendingView) && (!sectionId || !date)
    || params.has("labId") && !labId || params.has("ayId") && !ayId);
  return invalid ? { sectionId: undefined, date: undefined, labId: undefined, ayId: undefined, pendingView, invalid: true }
    : { sectionId, date, labId, ayId, pendingView, invalid: false };
}
