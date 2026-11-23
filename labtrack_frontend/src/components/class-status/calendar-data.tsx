import { CalendarClock, CheckCircle2, CircleDashed, CircleX, Video } from "lucide-react";
import type { StatusCell, StatusRow, StatusWeek } from "@/api/sessionStatus";
import type { CourseSectionSummary } from "@/api/courseSections";
import type { MakeUpClass } from "@/api/makeUpClasses";

export const fromIso = (value: string) => { const [y, m, d] = value.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const pad = (n: number) => String(n).padStart(2, "0");
export const toIso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const addDays = (date: Date, n: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
export const mondayOf = (date: Date) => addDays(date, -((date.getDay() + 6) % 7));
export const manilaToday = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
export const dateLabel = (iso: string, options: Intl.DateTimeFormatOptions = { weekday: "long", month: "short", day: "numeric", year: "numeric" }) => fromIso(iso).toLocaleDateString("en-US", options);
export function timeMinutes(value: string) {
  const [h, m] = value.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) && h >= 0 && (h < 24 || h === 24 && m === 0) && m >= 0 && m < 60 ? h * 60 + m : null;
}
export function timeLabel(value: string | number) { const minutes = typeof value === "number" ? value : timeMinutes(value); if (minutes === null) return "Time unavailable"; const h = Math.floor(minutes / 60) % 24; return `${h % 12 || 12}:${pad(Math.floor(minutes % 60))} ${h >= 12 ? "PM" : "AM"}`; }
export interface CalendarMeeting { id: string; row: StatusRow; cell: StatusCell; start: number | null; end: number | null; makeUp: boolean; reason?: string | null; }
export function calendarMeetings(week: StatusWeek | null, sections: CourseSectionSummary[] | undefined, makeUps: MakeUpClass[] | undefined): CalendarMeeting[] {
  if (!week) return [];
  const byId = new Map((sections ?? []).map(s => [s.sectionId, s]));
  const result: CalendarMeeting[] = [];
  function add(row: StatusRow, cell: StatusCell, id: string, startTime: string, endTime: string, makeUp: boolean, reason?: string | null) {
    const start = timeMinutes(startTime), end = timeMinutes(endTime);
    result.push({ id: `${row.sectionId}-${cell.date}-${id}`, row, cell, start: start !== null && end !== null && end > start ? start : null, end: start !== null && end !== null && end > start ? end : null, makeUp, reason });
  }
  for (const row of week.rows) {
    for (const cell of row.cells) {
      if (!cell.meets || !week.days.includes(cell.date)) continue;
      if (cell.makeUp) {
        const actual = makeUps?.filter(m => m.sectionId === row.sectionId && m.labId === week.laboratory.labId && m.date.slice(0, 10) === cell.date);
        if (actual?.length) { for (const m of actual) add(row, cell, `makeup-${m.makeUpId}`, m.startTime, m.endTime, true, m.reason); continue; }
      } else {
        const day = dateLabel(cell.date, { weekday: "long" });
        const actual = byId.get(row.sectionId)?.meetings.filter(m => m.laboratory.labId === week.laboratory.labId && m.dayOfWeek === day);
        if (actual?.length) { for (const m of actual) add(row, cell, `schedule-${m.scheduleId}`, m.startTime, m.endTime, false); continue; }
      }
      // Do not guess a date's time from the status API's representative class time.
      result.push({ id: `${row.sectionId}-${cell.date}-unknown`, row, cell, start: null, end: null, makeUp: cell.makeUp });
    }
  }
  return result;
}
export function meetingTone(cell: StatusCell) { return cell.source === "confirmation" ? cell.awaitingFinal ? "pending" : cell.status === "Virtual" ? "virtual" : "onsite" : cell.status ? "marked" : cell.suggestion ? "needs-status" : "unmarked"; }
export function StatusBadge({ cell }: { cell: StatusCell }) {
  const tone = meetingTone(cell); const Icon = tone === "pending" ? CalendarClock : tone === "onsite" ? CheckCircle2 : tone === "virtual" ? Video : tone === "marked" ? CircleX : CircleDashed;
  return <span className={`cs-status cs-status-${tone}`}>
    <Icon size={12} />
    <span>{cell.status ?? "Unmarked"}</span>
  </span>;
}
export function timelineLayout(events: CalendarMeeting[]) {
  const valid = events.filter((e): e is CalendarMeeting & { start: number; end: number } => e.start !== null && e.end !== null);
  if (!valid.length) return null;
  const first = Math.floor(Math.min(...valid.map(e => e.start)) / 60) * 60;
  const last = Math.ceil(Math.max(...valid.map(e => e.end)) / 60) * 60;
  const points = new Set<number>([first, last]);
  for (let t = first; t <= last; t += 60)points.add(t);
  for (const e of valid) { points.add(e.start); points.add(e.end); }
  const times = [...points].sort((a, b) => a - b); const offsets = new Map<number, number>(); let height = 0;
  times.forEach((time, i) => { offsets.set(time, height); if (i < times.length - 1) height += Math.max(60, (times[i + 1] - time) * 1.15); });
  return { times, offsets, height };
}
export interface PlacedMeeting { meeting: CalendarMeeting; lane: number; lanes: number; }
export function placeDay(events: CalendarMeeting[]): PlacedMeeting[] {
  const sorted = events.filter(e => e.start !== null && e.end !== null).slice().sort((a, b) => a.start! - b.start! || a.end! - b.end! || a.id.localeCompare(b.id));
  const result: PlacedMeeting[] = []; let group: PlacedMeeting[] = []; let ends: number[] = []; let groupEnd = -1;
  function flush() { for (const event of group) event.lanes = ends.length; result.push(...group); group = []; ends = []; }
  for (const meeting of sorted) {
    if (group.length && meeting.start! >= groupEnd) { flush(); groupEnd = -1; }
    let lane = ends.findIndex(end => end <= meeting.start!); if (lane < 0) lane = ends.length; ends[lane] = meeting.end!;
    group.push({ meeting, lane, lanes: 1 }); groupEnd = Math.max(groupEnd, meeting.end!);
  }
  flush(); return result;
}
