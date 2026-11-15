import { useEffect, useMemo, useState } from "react";
import { getCourseSections, updateSectionFaculty, type CourseSectionSummary } from "@/api/courseSections";
import { getLaboratories, type LaboratorySummary } from "@/api/laboratories";
import { getFacultyOptions, type FacultyOption } from "@/api/sessionConfirmations";
import { useRole } from "@/contexts/RoleContext";
import { ApiError } from "@/api/client";

const MUTED = "#57606a";
const BORDER = "#d1d9e0";
const MAROON = "#800000";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const timeLabel = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

type Row = {
  key: string;
  section: CourseSectionSummary;
  day: string;
  start: string;
  end: string;
  labId: number;
  lab: string;
};

export function SchedulePage() {
  const { role } = useRole();
  const canAssign = role === "Custodian" || role === "Administrator";

  const [sections, setSections] = useState<CourseSectionSummary[]>([]);
  const [labs, setLabs] = useState<LaboratorySummary[]>([]);
  const [faculty, setFaculty] = useState<FacultyOption[]>([]);
  const [labFilter, setLabFilter] = useState<number | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = () => getCourseSections().then(setSections).finally(() => setIsLoading(false));

  useEffect(() => {
    load().catch(() => setSections([]));
    getLaboratories().then(setLabs).catch(() => setLabs([]));
    if (canAssign) getFacultyOptions().then(setFaculty).catch(() => setFaculty([]));
  }, [canAssign]);

  // One table row per lab meeting, in week order.
  const rows = useMemo<Row[]>(() => {
    const all: Row[] = sections.flatMap((s) =>
      s.meetings.map((m) => ({
        key: `${s.sectionId}-${m.scheduleId}`,
        section: s,
        day: m.dayOfWeek,
        start: m.startTime,
        end: m.endTime,
        labId: m.laboratory.labId,
        lab: m.laboratory.roomCode,
      })),
    );
    return all
      .filter((r) => labFilter === "all" || r.labId === labFilter)
      .sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start.localeCompare(b.start));
  }, [sections, labFilter]);

  const assign = async (sectionId: number, facultyId: string) => {
    setError(null);
    try {
      await updateSectionFaculty(sectionId, facultyId || null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update the Faculty.");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>
          Imported from the Custodian's lab schedule
        </div>
        <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Schedule</h1>
        <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
          LabTrack does not generate or edit the schedule. It shows the imported lab meetings and checks attendance against them.
          {canAssign && " Faculty are assigned here."}
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-md p-1" style={{ background: "#fff", border: `1px solid ${BORDER}`, width: "fit-content" }}>
        {([{ id: "all" as const, name: "All labs" }, ...labs.map((l) => ({ id: l.labId, name: l.roomCode }))]).map((l) => {
          const on = labFilter === l.id;
          return (
            <button key={String(l.id)} type="button" onClick={() => setLabFilter(l.id)}
              className="rounded-[4px] px-3 py-1 font-mono text-[12px]"
              style={{ background: on ? "#0d1117" : "transparent", color: on ? "#fff" : MUTED }}>
              {l.name}
            </button>
          );
        })}
      </div>

      {error && <div className="text-[12.5px]" style={{ color: "#b42318" }}>{error}</div>}

      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr style={{ background: "#f6f8fa", color: MUTED }}>
              {["Day", "Time", "Lab", "Class", "Subject", "Faculty"].map((h, i) => (
                <th key={h} className={`py-2.5 text-left font-mono text-[10.5px] uppercase tracking-wider ${i === 0 ? "pl-4" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={{ borderTop: "1px solid #e1e4e8" }}>
                <td className="py-2.5 pl-4">{r.day}</td>
                <td className="py-2.5 pr-3 font-mono text-[11.5px]">{timeLabel(r.start)} – {timeLabel(r.end)}</td>
                <td className="py-2.5 pr-3 font-mono text-[11.5px]">{r.lab}</td>
                <td className="py-2.5 pr-3 font-mono text-[11.5px]" style={{ color: MAROON, fontWeight: 600 }}>{r.section.sectionCode}</td>
                <td className="py-2.5 pr-3">{r.section.subject.code} {r.section.subject.title}</td>
                <td className="py-2.5 pr-4">
                  {canAssign ? (
                    <select
                      value={r.section.facultyId ?? ""}
                      onChange={(e) => assign(r.section.sectionId, e.target.value)}
                      className="rounded-md px-2 py-1 text-[12px] outline-none"
                      style={{ border: `1px solid ${BORDER}`, color: r.section.facultyId ? "#0d1117" : MAROON }}
                    >
                      <option value="">Unassigned</option>
                      {faculty.map((f) => <option key={f.id} value={f.id}>{f.fullName}</option>)}
                    </select>
                  ) : (
                    <span style={{ color: r.section.faculty ? MUTED : MAROON }}>{r.section.faculty ?? "Unassigned"}</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[13px]" style={{ color: MUTED }}>
                  {isLoading ? "Loading..." : "No lab meetings yet. Import the schedule first."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
