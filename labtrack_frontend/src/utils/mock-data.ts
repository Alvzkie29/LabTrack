// LabTrack mock data — network-based occupancy verification prototype.
// Everything is scoped to CourseSection, never to Faculty.

export type PCStatus = "Active" | "Idle" | "Offline";
export type ComplianceStatus = "Compliant" | "At Risk" | "Non-Compliant";

export type Faculty = { id: string; name: string; email: string };

export type LabPC = {
  pcId: string;      // e.g. "CL1-PC07"
  roomId: string;
  row: number;       // 0-indexed
  col: number;
};

export type Room = {
  id: string;
  name: string;      // e.g. "CL1"
  rows: number;
  cols: number;
};

export type Session = {
  id: string;
  courseSectionId: string;
  pcId: string;
  loginTimestamp: string;   // ISO
  lastHeartbeat: string;    // ISO
  status: PCStatus;
};

export type CourseSection = {
  id: string;
  code: string;               // e.g. "IT10-CL2-T1"
  subject: string;            // e.g. "IT10 — Fundamentals of Programming"
  requiredHours: number;
  verifiedHours: number;
  currentAssignedFacultyId: string;
  roomId: string;
  dayTime: string;            // e.g. "Tue/Thu 1:30–3:30 PM"
  status: ComplianceStatus;
  lastReminderAt?: string;    // ISO — used by At-Risk panel
};

export type AttendanceLogEntry = {
  courseSectionId: string;
  date: string;               // ISO date
  pcId: string;
  verifiedHours: number;
  sourceSessionIds: string[];
};

// ---------- Faculty ----------
export const FACULTY: Faculty[] = [
  { id: "F001", name: "Juan Dela Cruz", email: "j.delacruz@umindanao.edu.ph" },
  { id: "F002", name: "Maria Santos",   email: "m.santos@umindanao.edu.ph" },
  { id: "F003", name: "Jose Reyes",     email: "j.reyes@umindanao.edu.ph" },
  { id: "F004", name: "Ana Lim",        email: "a.lim@umindanao.edu.ph" },
  { id: "F005", name: "Carlos Gomez",   email: "c.gomez@umindanao.edu.ph" },
];

// ---------- Rooms (5 labs, expandable design) ----------
export const ROOMS: Room[] = [
  { id: "CL1", name: "CL1", rows: 2, cols: 4 }, // 8 PCs
  { id: "CL2", name: "CL2", rows: 2, cols: 4 }, // 8 PCs
  { id: "CL3", name: "CL3", rows: 2, cols: 3 }, // 6 PCs
  { id: "CL4", name: "CL4", rows: 2, cols: 4 }, // 8 PCs
  { id: "CL5", name: "CL5", rows: 3, cols: 3 }, // 9 PCs
];

// ---------- Lab Assistants (staff who monitor labs) ----------
export type LabAssistant = {
  id: string;
  name: string;
  email: string;
  assignedLabIds: string[];  // which labs they monitor
};

export const LAB_ASSISTANTS: LabAssistant[] = [
  { id: "LA-001", name: "Alex Rivera", email: "assistant@umindanao.edu.ph", assignedLabIds: ["CL2"] },
  { id: "LA-002", name: "Kim Ramos", email: "k.ramos@umindanao.edu.ph", assignedLabIds: ["CL1", "CL3"] },
  { id: "LA-003", name: "Taylor Cruz", email: "t.cruz@umindanao.edu.ph", assignedLabIds: [] },
];

function buildRoomPCs(): LabPC[] {
  const pcs: LabPC[] = [];
  for (const room of ROOMS) {
    let n = 1;
    for (let r = 0; r < room.rows; r++) {
      for (let c = 0; c < room.cols; c++) {
        pcs.push({
          pcId: `${room.id}-PC${String(n).padStart(2, "0")}`,
          roomId: room.id,
          row: r,
          col: c,
        });
        n++;
      }
    }
  }
  return pcs;
}

export const LAB_PCS: LabPC[] = buildRoomPCs();

// ---------- Course Sections ----------
export const COURSE_SECTIONS: CourseSection[] = [
  {
    id: "CS-01",
    code: "IT10-CL2-T1",
    subject: "IT10 — Fundamentals of Programming",
    requiredHours: 54,
    verifiedHours: 44,
    currentAssignedFacultyId: "F001",
    roomId: "CL2",
    dayTime: "Tue/Thu 1:30–3:30 PM",
    status: "Compliant",
  },
  {
    id: "CS-02",
    code: "CS30-CL1-T1",
    subject: "CS30 — Data Structures",
    requiredHours: 54,
    verifiedHours: 22,
    currentAssignedFacultyId: "F002",
    roomId: "CL1",
    dayTime: "Mon/Wed 10:00 AM–12:00 NN",
    status: "At Risk",
    lastReminderAt: "2026-07-11T09:00:00Z",
  },
  {
    id: "CS-03",
    code: "IT40-CL2-T1",
    subject: "IT40 — Network Security",
    requiredHours: 54,
    verifiedHours: 12,
    currentAssignedFacultyId: "F003",
    roomId: "CL2",
    dayTime: "Thu 1:30–5:30 PM",
    status: "Non-Compliant",
    lastReminderAt: "2026-07-12T09:00:00Z",
  },
  {
    id: "CS-04",
    code: "CS20-CL3-T1",
    subject: "CS20 — Object-Oriented Programming",
    requiredHours: 36,
    verifiedHours: 30,
    currentAssignedFacultyId: "F004",
    roomId: "CL3",
    dayTime: "Fri 8:00 AM–12:00 NN",
    status: "Compliant",
  },
  {
    id: "CS-05",
    code: "IT20-CL1-T1",
    subject: "IT20 — Web Systems",
    requiredHours: 54,
    verifiedHours: 27,
    currentAssignedFacultyId: "F005",
    roomId: "CL1",
    dayTime: "Mon/Wed 3:30–5:30 PM",
    status: "At Risk",
    lastReminderAt: "2026-07-10T09:00:00Z",
  },
  {
    id: "CS-06",
    code: "CS50-CL4-T1",
    subject: "CS50 — Algorithms",
    requiredHours: 54,
    verifiedHours: 35,
    currentAssignedFacultyId: "F001",
    roomId: "CL4",
    dayTime: "Mon/Wed 1:30–3:30 PM",
    status: "Compliant",
  },
  {
    id: "CS-07",
    code: "IT30-CL5-T1",
    subject: "IT30 — Database Systems",
    requiredHours: 54,
    verifiedHours: 48,
    currentAssignedFacultyId: "F002",
    roomId: "CL5",
    dayTime: "Tue/Thu 10:00 AM–12:00 NN",
    status: "Compliant",
  },
];

// ---------- Live session state (per PC) ----------
// Seeded so the dashboard "looks alive" on first load.
export const LIVE_SESSIONS: Record<string, { status: PCStatus; courseSectionId?: string; sinceMin?: number }> = {
  // CL1
  "CL1-PC01": { status: "Active",  courseSectionId: "CS-02", sinceMin: 42 },
  "CL1-PC02": { status: "Active",  courseSectionId: "CS-02", sinceMin: 42 },
  "CL1-PC03": { status: "Idle",    courseSectionId: "CS-02", sinceMin: 8 },
  "CL1-PC04": { status: "Active",  courseSectionId: "CS-02", sinceMin: 41 },
  "CL1-PC05": { status: "Offline" },
  "CL1-PC06": { status: "Active",  courseSectionId: "CS-02", sinceMin: 39 },
  "CL1-PC07": { status: "Idle",    courseSectionId: "CS-02", sinceMin: 12 },
  "CL1-PC08": { status: "Active",  courseSectionId: "CS-02", sinceMin: 40 },
  // CL2
  "CL2-PC01": { status: "Active",  courseSectionId: "CS-01", sinceMin: 68 },
  "CL2-PC02": { status: "Active",  courseSectionId: "CS-01", sinceMin: 68 },
  "CL2-PC03": { status: "Active",  courseSectionId: "CS-01", sinceMin: 67 },
  "CL2-PC04": { status: "Active",  courseSectionId: "CS-01", sinceMin: 66 },
  "CL2-PC05": { status: "Active",  courseSectionId: "CS-01", sinceMin: 64 },
  "CL2-PC06": { status: "Idle",    courseSectionId: "CS-01", sinceMin: 15 },
  "CL2-PC07": { status: "Offline" },
  "CL2-PC08": { status: "Active",  courseSectionId: "CS-01", sinceMin: 61 },
  // CL3
  "CL3-PC01": { status: "Offline" },
  "CL3-PC02": { status: "Offline" },
  "CL3-PC03": { status: "Offline" },
  "CL3-PC04": { status: "Offline" },
  "CL3-PC05": { status: "Offline" },
  "CL3-PC06": { status: "Offline" },
  // CL4
  "CL4-PC01": { status: "Active",  courseSectionId: "CS-06", sinceMin: 28 },
  "CL4-PC02": { status: "Active",  courseSectionId: "CS-06", sinceMin: 27 },
  "CL4-PC03": { status: "Active",  courseSectionId: "CS-06", sinceMin: 26 },
  "CL4-PC04": { status: "Idle",    courseSectionId: "CS-06", sinceMin: 5 },
  "CL4-PC05": { status: "Active",  courseSectionId: "CS-06", sinceMin: 25 },
  "CL4-PC06": { status: "Active",  courseSectionId: "CS-06", sinceMin: 24 },
  "CL4-PC07": { status: "Offline" },
  "CL4-PC08": { status: "Active",  courseSectionId: "CS-06", sinceMin: 23 },
  // CL5
  "CL5-PC01": { status: "Active",  courseSectionId: "CS-07", sinceMin: 52 },
  "CL5-PC02": { status: "Active",  courseSectionId: "CS-07", sinceMin: 51 },
  "CL5-PC03": { status: "Active",  courseSectionId: "CS-07", sinceMin: 50 },
  "CL5-PC04": { status: "Active",  courseSectionId: "CS-07", sinceMin: 49 },
  "CL5-PC05": { status: "Active",  courseSectionId: "CS-07", sinceMin: 48 },
  "CL5-PC06": { status: "Active",  courseSectionId: "CS-07", sinceMin: 47 },
  "CL5-PC07": { status: "Idle",    courseSectionId: "CS-07", sinceMin: 10 },
  "CL5-PC08": { status: "Active",  courseSectionId: "CS-07", sinceMin: 46 },
  "CL5-PC09": { status: "Active",  courseSectionId: "CS-07", sinceMin: 45 },
};

// ---------- Attendance log ----------
export const ATTENDANCE_LOG: AttendanceLogEntry[] = [
  { courseSectionId: "CS-01", date: "2026-07-08", pcId: "CL2-PC01", verifiedHours: 2, sourceSessionIds: ["S-1001"] },
  { courseSectionId: "CS-01", date: "2026-07-10", pcId: "CL2-PC01", verifiedHours: 2, sourceSessionIds: ["S-1010"] },
  { courseSectionId: "CS-01", date: "2026-07-13", pcId: "CL2-PC02", verifiedHours: 2, sourceSessionIds: ["S-1017"] },
  { courseSectionId: "CS-02", date: "2026-07-07", pcId: "CL1-PC01", verifiedHours: 2, sourceSessionIds: ["S-1002"] },
  { courseSectionId: "CS-02", date: "2026-07-09", pcId: "CL1-PC02", verifiedHours: 2, sourceSessionIds: ["S-1011"] },
  { courseSectionId: "CS-03", date: "2026-07-02", pcId: "CL2-PC05", verifiedHours: 2, sourceSessionIds: ["S-1005"] },
  { courseSectionId: "CS-04", date: "2026-07-11", pcId: "CL3-PC01", verifiedHours: 4, sourceSessionIds: ["S-1012"] },
  { courseSectionId: "CS-05", date: "2026-07-08", pcId: "CL1-PC05", verifiedHours: 2, sourceSessionIds: ["S-1006"] },
];

// ---------- Schedule (read-only) ----------
export type ScheduleEntry = {
  courseSectionId: string;
  code: string;
  subject: string;
  room: string;
  dayTime: string;
  faculty: string;
};

export const SCHEDULE: ScheduleEntry[] = COURSE_SECTIONS.map((cs) => ({
  courseSectionId: cs.id,
  code: cs.code,
  subject: cs.subject,
  room: cs.roomId,
  dayTime: cs.dayTime,
  faculty: FACULTY.find((f) => f.id === cs.currentAssignedFacultyId)?.name ?? "—",
}));

export function facultyName(id: string): string {
  return FACULTY.find((f) => f.id === id)?.name ?? "Unassigned";
}

export function sectionById(id: string): CourseSection | undefined {
  return COURSE_SECTIONS.find((s) => s.id === id);
}

export function pcsForRoom(roomId: string): LabPC[] {
  return LAB_PCS.filter((p) => p.roomId === roomId);
}

export function assistantById(id: string): LabAssistant | undefined {
  return LAB_ASSISTANTS.find((a) => a.id === id);
}

export function assistantsForLab(labId: string): LabAssistant[] {
  return LAB_ASSISTANTS.filter((a) => a.assignedLabIds.includes(labId));
}
