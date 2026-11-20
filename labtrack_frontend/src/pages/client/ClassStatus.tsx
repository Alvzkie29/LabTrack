import { Fragment, useEffect, useMemo, useState } from "react";
import { Wand2 } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { getLaboratories, type LaboratorySummary } from "@/api/laboratories";
import { getAcademicYears, semesterName, type AcademicYear } from "@/api/academicYears";
import { termWeeks } from "@/utils/termWeeks";
import { getStatusWeek, markStatus, type StatusWeek, type StatusRow, type StatusCell } from "@/api/sessionStatus";
import { ApiError } from "@/api/client";

const MUTED = "#57606a";
const BORDER = "#d1d9e0";
const MAROON = "#800000";
const GOLD = "#F4C430";

// ---------- dates (local, no time zone shifts) ----------
const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
const short = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });

const timeLabel = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`;
};

const SHIFTS: StatusRow["shift"][] = ["Morning", "Afternoon", "Evening"];

export function ClassStatusPage() {
  const { role } = useRole();
  const allowed = role === "Custodian" || role === "Administrator" || role === "LabAssistant";

  const [labs, setLabs] = useState<LaboratorySummary[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [labId, setLabId] = useState<number | "">("");
  const [ayId, setAyId] = useState<number | "">("");
  const [weekStart, setWeekStart] = useState("");

  const [week, setWeek] = useState<StatusWeek | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    getLaboratories().then((ls) => { setLabs(ls); setLabId((c) => c || ls[0]?.labId || ""); }).catch(() => setLabs([]));
    getAcademicYears().then((ys) => {
      setYears(ys);
      setAyId((c) => c || (ys.find((y) => y.isActive) ?? ys[0])?.ayId || "");
    }).catch(() => setYears([]));
  }, [allowed]);

  const ay = years.find((y) => y.ayId === ayId);

  const weeks = useMemo(() => (ay ? termWeeks(ay, 4) : []), [ay]);

  // Default to this week (on a Sunday, the week that just ended), kept inside the term.
  useEffect(() => {
    if (weeks.length === 0) return;
    const current = toIso(mondayOf(new Date()));
    setWeekStart(weeks.some((w) => w.iso === current) ? current : current < weeks[0].iso ? weeks[0].iso : weeks[weeks.length - 1].iso);
  }, [weeks]);

  const load = () => {
    if (!labId || !ayId || !weekStart) return Promise.resolve();
    setLoading(true);
    return getStatusWeek(Number(labId), Number(ayId), weekStart)
      .then(setWeek)
      .catch((e) => { setWeek(null); setError(e instanceof ApiError ? e.message : "Could not load the week."); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { setError(null); setMessage(null); load(); }, [labId, ayId, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!allowed) {
    return <div className="py-24 text-center text-[13px]" style={{ color: MUTED }}>This page is only available to laboratory staff.</div>;
  }

  /** Save one cell, then update it in place so the grid does not jump. */
  const save = async (row: StatusRow, cell: StatusCell, status: string, note?: string) => {
    setError(null);
    setMessage(null);
    try {
      const r = await markStatus({ sectionId: row.sectionId, sessionDate: cell.date, status, note });
      setWeek((w) => {
        if (!w) return w;
        const wasUnmarked = cell.status === null && cell.suggestion !== null;
        const nowUnmarked = r.status === null && cell.suggestion !== null;
        return {
          ...w,
          unmarked: w.unmarked + (nowUnmarked ? 1 : 0) - (wasUnmarked ? 1 : 0),
          rows: w.rows.map((x) => x.sectionId !== row.sectionId ? x : {
            ...x,
            cells: x.cells.map((c) => c.date !== cell.date ? c : {
              ...c, status: r.status, note: r.note, source: r.status ? "marked" : null,
            }),
          }),
        };
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save that status.");
    }
  };

  /** Accept every suggestion this week in one go. */
  const fillSuggestions = async () => {
    if (!week) return;
    const todo = week.rows.flatMap((r) => r.cells.filter((c) => c.meets && !c.status && c.suggestion).map((c) => ({ r, c })));
    setBusy(true);
    setError(null);
    let saved = 0;
    for (const { r, c } of todo) {
      try { await markStatus({ sectionId: r.sectionId, sessionDate: c.date, status: c.suggestion! }); saved++; }
      catch { /* reported below by what is still unmarked */ }
    }
    await load();
    setBusy(false);
    setMessage(`${saved} of ${todo.length} suggestion${todo.length === 1 ? "" : "s"} saved. Change any that are wrong, for example to Fieldwork or On Leave.`);
  };

  const suggestionsLeft = week ? week.rows.reduce((n, r) => n + r.cells.filter((c) => c.meets && !c.status && c.suggestion).length, 0) : 0;

  return (
    <div className="space-y-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>Monitoring</div>
        <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Class Status</h1>
        <p className="mt-0.5 max-w-3xl text-[13px]" style={{ color: MUTED }}>
          Every lab meeting of the week, Monday to Friday. <b>On-site</b> comes from the session confirmation and
          cannot be picked by hand. For a meeting with no confirmation, mark why it was not held. Complete the week by
          Friday or Saturday; the weekly report's remarks come from here.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Pick label="Laboratory">
          <select value={labId} onChange={(e) => setLabId(e.target.value ? Number(e.target.value) : "")} className={SELECT} style={{ border: `1px solid ${BORDER}` }}>
            {labs.map((l) => <option key={l.labId} value={l.labId}>{l.roomCode} — {l.name}</option>)}
          </select>
        </Pick>
        <Pick label="Term">
          <select value={ayId} onChange={(e) => setAyId(e.target.value ? Number(e.target.value) : "")} className={SELECT} style={{ border: `1px solid ${BORDER}` }}>
            {years.map((y) => <option key={y.ayId} value={y.ayId}>{semesterName(y)}{y.isActive ? " (active)" : ""}</option>)}
          </select>
        </Pick>
        <Pick label="Week">
          <select value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className={SELECT} style={{ border: `1px solid ${BORDER}` }}>
            {weeks.map((w) => <option key={w.iso} value={w.iso}>{w.label}</option>)}
          </select>
        </Pick>
        <button type="button" onClick={fillSuggestions} disabled={busy || suggestionsLeft === 0}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium"
          style={{ background: MAROON, color: GOLD, opacity: busy || suggestionsLeft === 0 ? 0.6 : 1 }}>
          <Wand2 className="size-3.5" /> {busy ? "Saving..." : `Use the ${suggestionsLeft} suggestion${suggestionsLeft === 1 ? "" : "s"}`}
        </button>
      </div>

      {week && (
        <div className="rounded-md px-3 py-2 text-[12.5px]"
          style={week.unmarked > 0
            ? { background: "#fff8e6", color: "#7a5900", border: "1px solid #f0d9a0" }
            : { background: "#eef8f0", color: "#1a7f37", border: "1px solid #b8e0c2" }}>
          {week.unmarked > 0
            ? `${week.unmarked} past meeting${week.unmarked === 1 ? "" : "s"} this week still need${week.unmarked === 1 ? "s" : ""} a status.`
            : "Every past meeting this week has a status."}
        </div>
      )}
      {error && <div className="text-[12.5px]" style={{ color: "#b42318" }}>{error}</div>}
      {message && <div className="text-[12.5px]" style={{ color: "#1a7f37" }}>{message}</div>}

      {week && (
        <div className="overflow-x-auto" style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
          <table className="w-full min-w-[1100px] text-[12px]">
            <thead>
              <tr style={{ background: "#f6f8fa", color: MUTED }}>
                {["Time", "Faculty", "Code", "Course", "Students"].map((h, i) => (
                  <th key={h} className={`py-2.5 pr-3 text-left font-mono text-[10.5px] uppercase tracking-wider ${i === 0 ? "pl-4" : ""}`}>{h}</th>
                ))}
                {week.days.map((d) => (
                  <th key={d} className="w-[150px] py-2.5 pr-2 text-left font-mono text-[10.5px] uppercase tracking-wider">
                    {fromIso(d).toLocaleDateString("en-US", { weekday: "short" })} {short(fromIso(d))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SHIFTS.map((shift) => {
                const rows = week.rows.filter((r) => r.shift === shift);
                if (rows.length === 0) return null;
                return (
                  <Fragment key={shift}>
                    <tr>
                      <td colSpan={5 + week.days.length} className="py-1.5 pl-4 font-mono text-[10.5px] font-semibold uppercase tracking-wider"
                        style={{ background: "#fbeeee", color: MAROON, borderTop: "1px solid #e1e4e8" }}>
                        {shift}
                      </td>
                    </tr>
                    {rows.map((r) => (
                      <tr key={r.sectionId} style={{ borderTop: "1px solid #e1e4e8" }}>
                        <td className="whitespace-nowrap py-2 pl-4 pr-3 align-top font-mono text-[11px]">{timeLabel(r.startTime)}–{timeLabel(r.endTime)}</td>
                        <td className="py-2 pr-3 align-top" style={{ color: r.faculty ? undefined : MAROON }}>{r.faculty ?? "Unassigned"}</td>
                        <td className="py-2 pr-3 align-top font-mono text-[11.5px]" style={{ color: MAROON, fontWeight: 600 }}>{r.sectionCode}</td>
                        <td className="py-2 pr-3 align-top font-mono text-[11.5px]" title={r.subjectTitle}>{r.subjectCode}</td>
                        <td className="py-2 pr-3 align-top font-mono text-[11.5px]">{r.students}</td>
                        {r.cells.map((c) => (
                          <td key={c.date} className="py-1.5 pr-2 align-top">
                            <Cell cell={c} statuses={week.statuses} onSave={(s, n) => save(r, c, s, n)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              {week.rows.length === 0 && (
                <tr><td colSpan={5 + week.days.length} className="py-8 text-center text-[13px]" style={{ color: MUTED }}>
                  No classes meet in this laboratory this term.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {!week && !error && <div className="py-12 text-center text-[13px]" style={{ color: MUTED }}>{loading ? "Loading..." : "Choose a laboratory, term and week."}</div>}
    </div>
  );
}

const SELECT = "rounded-md bg-white px-2.5 py-1.5 text-[12.5px] outline-none";

function Pick({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>{label}</span>
      {children}
    </label>
  );
}

/** One day of one class: read-only when it comes from a confirmation, a dropdown otherwise. */
function Cell({ cell, statuses, onSave }: {
  cell: StatusCell;
  statuses: string[];
  onSave: (status: string, note?: string) => Promise<void>;
}) {
  const [noteFor, setNoteFor] = useState<string | null>(null); // "Others" chosen, note being typed
  const [note, setNote] = useState("");

  if (!cell.meets) return <div className="h-7 rounded" style={{ background: "#f6f8fa" }} />;

  const makeUpTag = cell.makeUp && (
    <div className="mb-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider" style={{ color: MAROON }}>Make-up class</div>
  );

  if (cell.source === "confirmation") {
    const virtual = cell.status === "Virtual";
    return (
      <div>
        {makeUpTag}
        <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={virtual ? { background: "#e7f1fb", color: "#0b5cad" } : { background: "#e5f4e4", color: "#1a7f37" }}>
          {cell.status}
        </span>
        {cell.awaitingFinal && <div className="mt-0.5 text-[10.5px]" style={{ color: "#9a6700" }}>awaiting final confirmation</div>}
      </div>
    );
  }

  const unmarked = !cell.status && cell.suggestion;

  return (
    <div>
      {makeUpTag}
      <select
        value={noteFor ?? cell.status ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "Others") { setNoteFor(v); setNote(cell.status === "Others" ? cell.note ?? "" : ""); return; }
          setNoteFor(null);
          onSave(v);
        }}
        className="w-full rounded px-1.5 py-1 text-[11.5px] outline-none"
        style={{ border: `1px solid ${unmarked ? "#d4a72c" : BORDER}`, background: "#fff", color: cell.status ? "#0d1117" : MUTED }}
        title={cell.suggestion ? `Suggested: ${cell.suggestion}` : undefined}
      >
        <option value="">—</option>
        {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      {unmarked && noteFor === null && (
        <button type="button" onClick={() => onSave(cell.suggestion!)} title="Use this suggestion"
          className="mt-0.5 block text-left text-[10.5px] leading-tight hover:underline" style={{ color: "#9a6700" }}>
          Suggested: {cell.suggestion}
        </button>
      )}

      {cell.status === "Others" && cell.note && noteFor === null && (
        <div className="mt-0.5 truncate text-[10.5px]" style={{ color: MUTED }} title={cell.note}>{cell.note}</div>
      )}

      {noteFor === "Others" && (
        <div className="mt-1 flex gap-1">
          <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Reason"
            onKeyDown={(e) => { if (e.key === "Enter" && note.trim()) { onSave("Others", note.trim()); setNoteFor(null); } if (e.key === "Escape") setNoteFor(null); }}
            className="w-full rounded px-1.5 py-0.5 text-[11px] outline-none" style={{ border: `1px solid ${MAROON}` }} />
          <button type="button" disabled={!note.trim()} onClick={() => { onSave("Others", note.trim()); setNoteFor(null); }}
            className="rounded px-1.5 text-[11px] font-semibold" style={{ background: MAROON, color: GOLD, opacity: note.trim() ? 1 : 0.5 }}>
            Save
          </button>
        </div>
      )}
    </div>
  );
}
