/* Make-up class time helpers. Presets are a form convenience only: the API still receives
   plain startTime/endTime ("HH:mm"), exactly as before. Nothing here is saved as a slot ID. */

export const TIME_SLOTS = [
  { id: "morning-1", label: "8:00 AM – 10:00 AM", start: "08:00", end: "10:00", group: "Morning" },
  { id: "morning-2", label: "10:00 AM – 12:00 PM", start: "10:00", end: "12:00", group: "Morning" },
  { id: "afternoon-1", label: "1:30 PM – 3:30 PM", start: "13:30", end: "15:30", group: "Afternoon" },
  { id: "afternoon-2", label: "3:30 PM – 5:30 PM", start: "15:30", end: "17:30", group: "Afternoon" },
  { id: "evening-1", label: "5:30 PM – 7:30 PM", start: "17:30", end: "19:30", group: "Evening" },
  { id: "evening-2", label: "7:30 PM – 9:30 PM", start: "19:30", end: "21:30", group: "Evening" },
] as const;

export type PresetId = (typeof TIME_SLOTS)[number]["id"];
export type SlotChoice = PresetId | "custom" | "";

/** "8:00" / "08:00" / "08:00:00" → minutes after midnight, or null. */
export function toMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

/** Normalise to the "HH:mm" the form has always sent. */
export function toHHmm(t: string) {
  const m = toMinutes(t);
  return m === null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function timeLabel(t: string) {
  const m = toMinutes(t);
  if (m === null) return t || "—";
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function durationText(start: string, end: string) {
  const a = toMinutes(start);
  const b = toMinutes(end);
  if (a === null || b === null || b <= a) return null;
  const mins = b - a;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h ? `${h} ${h === 1 ? "hour" : "hours"}` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

/** The preset whose times match exactly, if any (never rounds a custom time to a preset). */
export function presetFor(start: string, end: string): PresetId | null {
  const s = toHHmm(start);
  const e = toHHmm(end);
  return TIME_SLOTS.find((p) => p.start === s && p.end === e)?.id ?? null;
}

/** Start/end to submit for the current choice. Custom values are kept separately so switching back restores them. */
export function resolveTimes(choice: SlotChoice, custom: { start: string; end: string }) {
  if (choice === "custom") return { startTime: custom.start, endTime: custom.end };
  const preset = TIME_SLOTS.find((p) => p.id === choice);
  return preset ? { startTime: preset.start, endTime: preset.end } : { startTime: "", endTime: "" };
}

export function timeError(choice: SlotChoice, startTime: string, endTime: string): string | null {
  if (choice === "") return "Choose a time slot.";
  if (!startTime || !endTime) return "Enter both a start and an end time.";
  const a = toMinutes(startTime);
  const b = toMinutes(endTime);
  if (a === null || b === null) return "Enter a valid time.";
  if (b <= a) return "The end time must be later than the start time.";
  return null;
}

/* ── Dates (kept as "YYYY-MM-DD" strings; no UTC conversion) ── */

export const parseLocalDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
export const isSunday = (iso: string) => iso !== "" && parseLocalDate(iso).getDay() === 0;
export const weekdayName = (iso: string) => parseLocalDate(iso).toLocaleDateString("en-US", { weekday: "long" });
export const dateLabel = (iso: string) =>
  parseLocalDate(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
export const longDateLabel = (iso: string) =>
  parseLocalDate(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

/* ── Attachment (mirrors the limits the page has always stated; the server still validates) ── */

export const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
export const MAX_BYTES = 5 * 1024 * 1024;

export function fileError(file: File): string | null {
  const okExt = /\.(pdf|jpe?g|png)$/i.test(file.name);
  const okType = !file.type || ["application/pdf", "image/jpeg", "image/png"].includes(file.type);
  if (!okExt || !okType) return "Use a PDF, JPG or PNG file.";
  if (file.size > MAX_BYTES) return "The file is larger than 5 MB.";
  if (file.size === 0) return "The file is empty.";
  return null;
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Advisory overlap check ─────────────────────────────── */

export interface Booking {
  kind: "makeup" | "weekly";
  label: string;
  start: string;
  end: string;
}

/** Bookings that overlap [start, end): startA < endB && startB < endA. Back-to-back is not an overlap. */
export function overlapping(start: string, end: string, bookings: Booking[]) {
  const a = toMinutes(start);
  const b = toMinutes(end);
  if (a === null || b === null || b <= a) return [];
  return bookings.filter((x) => {
    const s = toMinutes(x.start);
    const e = toMinutes(x.end);
    return s !== null && e !== null && e > s && a < e && s < b;
  });
}
