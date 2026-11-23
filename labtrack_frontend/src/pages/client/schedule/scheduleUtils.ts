import type { CourseSectionSummary, Meeting } from "@/api/courseSections";

/* Pure helpers for the Schedule page. Nothing here mutates API data. */

export const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const BASE_DAYS = WEEK.slice(0, 5);

export const dayIndex = (day: string) => {
  const i = WEEK.indexOf(day);
  return i < 0 ? 99 : i;
};
export const shortDay = (day: string) => day.slice(0, 3);

/** "08:00" or "08:00:00" → minutes after midnight. Null for anything else. */
export function toMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minutesLabel(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export const timeLabel = (t: string) => {
  const m = toMinutes(t);
  return m === null ? t || "—" : minutesLabel(m);
};

export const timeRange = (m: Meeting) => `${timeLabel(m.startTime)} – ${timeLabel(m.endTime)}`;

/** One imported meeting, with a stable key (section + its position in the API's list). */
export interface MeetingRef {
  key: string;
  section: CourseSectionSummary;
  meeting: Meeting;
  start: number | null;
  end: number | null;
  /** Start and end parse, end is after start, and the meeting has a laboratory. */
  valid: boolean;
}

export function meetingRefs(section: CourseSectionSummary): MeetingRef[] {
  return section.meetings
    .map((meeting, index) => {
      const start = toMinutes(meeting.startTime);
      const end = toMinutes(meeting.endTime);
      return {
        key: `${section.sectionId}:${index}`,
        section,
        meeting,
        start,
        end,
        valid: start !== null && end !== null && end > start && meeting.laboratory?.labId != null,
      };
    })
    .sort((a, b) => dayIndex(a.meeting.dayOfWeek) - dayIndex(b.meeting.dayOfWeek) || (a.start ?? 0) - (b.start ?? 0));
}

export const flattenMeetings = (sections: CourseSectionSummary[]) => sections.flatMap(meetingRefs);

export interface ScheduleFilters {
  search: string;
  labId: number | "all";
  onlyUnassigned: boolean;
}

export function matchesSearch(s: CourseSectionSummary, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [s.sectionCode, s.subject.code, s.subject.title, s.faculty ?? ""].some((v) => v.toLowerCase().includes(q));
}

/** A section matches a lab when ANY of its meetings is held there. Returns a new, sorted array. */
export function filterSections(sections: CourseSectionSummary[], f: ScheduleFilters) {
  return sections
    .filter((s) => f.labId === "all" || s.meetings.some((m) => m.laboratory?.labId === f.labId))
    .filter((s) => !f.onlyUnassigned || !s.facultyId)
    .filter((s) => matchesSearch(s, f.search))
    .sort((a, b) => a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true }));
}

/* ── Conflicts ──────────────────────────────────────────── */

export interface Conflict {
  key: string;
  day: string;
  labId: number;
  roomCode: string;
  a: MeetingRef;
  b: MeetingRef;
  overlapStart: number;
  overlapEnd: number;
}

/**
 * Two distinct meetings, same day, same lab, with overlapping times (startA < endB && startB < endA).
 * Back-to-back meetings do not overlap. Only meetings with valid times and a lab are compared, and
 * the caller passes sections from a single academic period.
 */
export function findConflicts(sections: CourseSectionSummary[]): Conflict[] {
  const groups = new Map<string, MeetingRef[]>();
  const seen = new Set<string>();
  for (const ref of flattenMeetings(sections)) {
    if (!ref.valid) continue;
    // The same meeting listed twice for one section is one meeting, not two.
    const identity = `${ref.section.sectionId}|${ref.meeting.dayOfWeek}|${ref.meeting.laboratory.labId}|${ref.start}|${ref.end}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const k = `${ref.meeting.dayOfWeek}|${ref.meeting.laboratory.labId}`;
    groups.set(k, [...(groups.get(k) ?? []), ref]);
  }
  const out: Conflict[] = [];
  for (const refs of groups.values()) {
    for (let i = 0; i < refs.length; i++) {
      for (let j = i + 1; j < refs.length; j++) {
        const a = refs[i];
        const b = refs[j];
        if (a.start! < b.end! && b.start! < a.end!) {
          out.push({
            key: `${a.key}~${b.key}`,
            day: a.meeting.dayOfWeek,
            labId: a.meeting.laboratory.labId,
            roomCode: a.meeting.laboratory.roomCode,
            a,
            b,
            overlapStart: Math.max(a.start!, b.start!),
            overlapEnd: Math.min(a.end!, b.end!),
          });
        }
      }
    }
  }
  return out.sort((x, y) => dayIndex(x.day) - dayIndex(y.day) || x.overlapStart - y.overlapStart);
}

/** meeting key → conflicts that meeting is part of */
export function conflictsByMeeting(conflicts: Conflict[]) {
  const map = new Map<string, Conflict[]>();
  for (const c of conflicts) {
    map.set(c.a.key, [...(map.get(c.a.key) ?? []), c]);
    map.set(c.b.key, [...(map.get(c.b.key) ?? []), c]);
  }
  return map;
}

/** "2 h" / "1 h 30 min" for a valid meeting, otherwise null (never guessed). */
export function durationLabel(ref: MeetingRef): string | null {
  if (!ref.valid) return null;
  const mins = ref.end! - ref.start!;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}
