import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { getCourseSections, updateSectionFaculty, type CourseSectionSummary, type Meeting } from "@/api/courseSections";
import { getLaboratories, type LaboratorySummary } from "@/api/laboratories";
import { getFacultyOptions, type FacultyOption } from "@/api/sessionConfirmations";
import { useRole } from "@/contexts/RoleContext";
import { ApiError } from "@/api/client";

const MUTED = "#57606a";
const BORDER = "#d1d9e0";
const MAROON = "#800000";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const timeLabel = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

const inWeekOrder = (meetings: Meeting[]) =>
  [...meetings].sort((a, b) => DAYS.indexOf(a.dayOfWeek) - DAYS.indexOf(b.dayOfWeek) || a.startTime.localeCompare(b.startTime));

/**
 * One line per distinct time slot. A class that meets Mon in CL2 and Thu in CL1 at the same
 * time reads "Mon, Thu · 7:30 – 9:30 PM · CL2, CL1": days and labs are in the same order.
 */
function meetingLines(meetings: Meeting[]) {
  const bySlot = new Map<string, Meeting[]>();
  for (const m of inWeekOrder(meetings)) {
    const slot = `${m.startTime}-${m.endTime}`;
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), m]);
  }
  return [...bySlot.values()].map((group) => {
    const labs = group.map((m) => m.laboratory.roomCode);
    const sameLab = labs.every((l) => l === labs[0]);
    return {
      days: group.map((m) => m.dayOfWeek.slice(0, 3)).join(", "),
      time: `${timeLabel(group[0].startTime)} – ${timeLabel(group[0].endTime)}`,
      labs: sameLab ? labs[0] : labs.join(", "),
    };
  });
}

export function SchedulePage() {
  const { role } = useRole();
  const canAssign = role === "Custodian" || role === "Administrator";

  const [sections, setSections] = useState<CourseSectionSummary[]>([]);
  const [labs, setLabs] = useState<LaboratorySummary[]>([]);
  const [faculty, setFaculty] = useState<FacultyOption[]>([]);
  const [labFilter, setLabFilter] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = () => getCourseSections().then(setSections).finally(() => setIsLoading(false));

  useEffect(() => {
    load().catch(() => setSections([]));
    getLaboratories().then(setLabs).catch(() => setLabs([]));
    if (canAssign) getFacultyOptions().then(setFaculty).catch(() => setFaculty([]));
  }, [canAssign]);

  // One row per class code.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sections
      .filter((s) => labFilter === "all" || s.meetings.some((m) => m.laboratory.labId === labFilter))
      .filter((s) => !onlyUnassigned || !s.facultyId)
      .filter((s) =>
        !q ||
        s.sectionCode.toLowerCase().includes(q) ||
        s.subject.code.toLowerCase().includes(q) ||
        s.subject.title.toLowerCase().includes(q) ||
        (s.faculty ?? "").toLowerCase().includes(q))
      .sort((a, b) => a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true }));
  }, [sections, labFilter, search, onlyUnassigned]);

  const unassignedCount = sections.filter((s) => !s.facultyId).length;

  const assign = async (sectionId: number, facultyId: string | null) => {
    setError(null);
    try {
      await updateSectionFaculty(sectionId, facultyId);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update the Faculty.");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>
          Imported from the Custodian's lab schedule · {sections.length} classes
        </div>
        <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Schedule</h1>
        <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
          LabTrack does not generate or edit the schedule. It shows the imported lab meetings and checks attendance against them.
          {canAssign && " Faculty are assigned here."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-md p-1" style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
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

        <div className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5" style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
          <Search className="size-3.5" style={{ color: MUTED }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Class code, subject or faculty"
            className="w-56 text-[12.5px] outline-none" />
        </div>

        <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px]" style={{ color: MUTED }}>
          <input type="checkbox" checked={onlyUnassigned} onChange={(e) => setOnlyUnassigned(e.target.checked)} />
          No faculty yet ({unassignedCount})
        </label>
      </div>

      {error && <div className="text-[12.5px]" style={{ color: "#b42318" }}>{error}</div>}

      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr style={{ background: "#f6f8fa", color: MUTED }}>
              {["Class", "Subject", "Days", "Time", "Lab", "Faculty"].map((h, i) => (
                <th key={h} className={`py-2.5 text-left font-mono text-[10.5px] uppercase tracking-wider ${i === 0 ? "pl-4" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const lines = meetingLines(s.meetings);
              return (
                <tr key={s.sectionId} style={{ borderTop: "1px solid #e1e4e8" }}>
                  <td className="py-2.5 pl-4 pr-3 align-top font-mono text-[12px]" style={{ color: MAROON, fontWeight: 600 }}>{s.sectionCode}</td>
                  <td className="py-2.5 pr-3 align-top">
                    <span className="font-mono text-[11.5px]">{s.subject.code}</span> {s.subject.title}
                    {s.termPart && (
                      <span className="ml-1.5 rounded-full px-1.5 py-px font-mono text-[10px]" style={{ background: "#f6f8fa", border: `1px solid ${BORDER}`, color: MUTED }}>
                        {s.term}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 align-top">{lines.map((l, i) => <div key={i}>{l.days}</div>)}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 align-top font-mono text-[11.5px]">{lines.map((l, i) => <div key={i}>{l.time}</div>)}</td>
                  <td className="py-2.5 pr-3 align-top font-mono text-[11.5px]">{lines.map((l, i) => <div key={i}>{l.labs}</div>)}</td>
                  <td className="py-2 pr-4 align-top">
                    {canAssign ? (
                      <FacultyPicker
                        value={s.facultyId}
                        label={s.faculty}
                        options={faculty}
                        onChange={(id) => assign(s.sectionId, id)}
                      />
                    ) : (
                      <span style={{ color: s.faculty ? MUTED : MAROON }}>{s.faculty ?? "Unassigned"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[13px]" style={{ color: MUTED }}>
                  {isLoading ? "Loading..." : sections.length === 0 ? "No lab meetings yet. Import the schedule first." : "No classes match these filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A dropdown with a search box: type part of a name instead of scrolling the whole faculty list. */
function FacultyPicker({ value, label, options, onChange }: {
  value: string | null;
  label: string | null;
  options: FacultyOption[];
  onChange: (facultyId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Close when clicking elsewhere or pressing Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    input.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const matches = options.filter((f) => !q || f.fullName.toLowerCase().includes(q) || f.schoolId.toLowerCase().includes(q));

  const pick = (id: string | null) => {
    setOpen(false);
    setQuery("");
    if (id !== value) onChange(id);
  };

  return (
    <div ref={box} className="relative inline-block w-56">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[12px]"
        style={{ border: `1px solid ${BORDER}`, background: "#fff", color: value ? "#0d1117" : MAROON }}>
        <span className="truncate">{label ?? "Unassigned"}</span>
        <ChevronDown className="size-3.5 shrink-0" style={{ color: MUTED }} />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-md shadow-lg" style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-1.5 px-2.5 py-2" style={{ borderBottom: "1px solid #e1e4e8" }}>
            <Search className="size-3.5" style={{ color: MUTED }} />
            <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && matches.length === 1) pick(matches[0].id); }}
              placeholder="Search faculty..." className="w-full text-[12.5px] outline-none" />
          </div>
          <div className="max-h-56 overflow-auto py-1">
            <button type="button" onClick={() => pick(null)}
              className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-[#f6f8fa]" style={{ color: MAROON }}>
              Unassigned
            </button>
            {matches.map((f) => (
              <button key={f.id} type="button" onClick={() => pick(f.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-[#f6f8fa]"
                style={{ background: f.id === value ? "#fbeeee" : undefined }}>
                <span className="truncate">{f.fullName}</span>
                <span className="shrink-0 font-mono text-[10.5px]" style={{ color: MUTED }}>{f.schoolId}</span>
              </button>
            ))}
            {matches.length === 0 && (
              <div className="px-3 py-2 text-[12px]" style={{ color: MUTED }}>No faculty match "{query}".</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
