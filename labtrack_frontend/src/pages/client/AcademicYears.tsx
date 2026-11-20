import { useEffect, useState } from "react";
import { CalendarPlus, Check, Pencil, Trash2, X } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import {
  activateAcademicYear, createAcademicYear, deleteAcademicYear, getAcademicYears, semesterName, updateAcademicYear,
  TERM_LABELS, type AcademicYear, type SaveAcademicYear, type TermType,
} from "@/api/academicYears";
import { ApiError } from "@/api/client";

const MAROON = "#800000";
const GOLD = "#F4C430";
const MUTED = "#57606a";
const BORDER = "#d1d9e0";
const INPUT = "w-full rounded-md bg-white px-2.5 py-1.5 text-[13px] outline-none";

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const nice = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

/** A blank form for the semester after the newest one. */
function nextSemester(years: AcademicYear[]): SaveAcademicYear {
  const y = new Date().getFullYear();
  const newest = years[0];
  if (!newest) return { label: `${y}-${y + 1}`, termType: "FirstSemester", startDate: "", endDate: "", secondTermStart: "" };
  const [a] = newest.label.split("-").map(Number);
  if (newest.termType === "FirstSemester")
    return { label: newest.label, termType: "SecondSemester", startDate: "", endDate: "", secondTermStart: "" };
  return { label: `${a + 1}-${a + 2}`, termType: "FirstSemester", startDate: "", endDate: "", secondTermStart: "" };
}

export function AcademicYearsPage() {
  const { role } = useRole();
  const allowed = role === "Custodian" || role === "Administrator";

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id: number | null; form: SaveAcademicYear } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = () =>
    getAcademicYears().then(setYears).catch(() => setYears([])).finally(() => setLoading(false));
  useEffect(() => { if (allowed) load(); }, [allowed]);

  if (!allowed) {
    return <div className="py-24 text-center text-[13px]" style={{ color: MUTED }}>This page is only available to the Custodian and Administrator roles.</div>;
  }

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true); setError(null); setMessage(null);
    try {
      await work();
      setMessage(done);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!editing) return;
    const f = editing.form;
    const body: SaveAcademicYear = { ...f, label: f.label.trim(), secondTermStart: f.termType === "Summer" || !f.secondTermStart ? null : f.secondTermStart };
    const name = `${TERM_LABELS[f.termType]} ${body.label}`;
    return run(
      () => (editing.id === null ? createAcademicYear(body) : updateAcademicYear(editing.id, body)),
      editing.id === null ? `${name} added.` : `${name} saved.`,
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>Setup</div>
          <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Academic Years</h1>
          <p className="mt-0.5 max-w-2xl text-[13px]" style={{ color: MUTED }}>
            Each semester keeps its own classes, sessions and reports. Add the new semester before importing its lab schedule,
            then make it active. Weeks are counted per term, starting again on the day the 2nd term starts.
          </p>
        </div>
        {!editing && (
          <button type="button" onClick={() => { setEditing({ id: null, form: nextSemester(years) }); setError(null); setMessage(null); }}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium" style={{ background: MAROON, color: GOLD }}>
            <CalendarPlus className="size-3.5" /> Add semester
          </button>
        )}
      </div>

      {message && <div className="text-[12.5px]" style={{ color: "#1a7f37" }}>{message}</div>}
      {error && <div className="text-[12.5px]" style={{ color: "#b42318" }}>{error}</div>}

      {editing && (
        <SemesterForm
          title={editing.id === null ? "New semester" : "Edit semester"}
          form={editing.form}
          busy={busy}
          onChange={(form) => setEditing({ ...editing, form })}
          onSave={save}
          onCancel={() => { setEditing(null); setError(null); }}
        />
      )}

      <div className="overflow-x-auto" style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ background: "#f6f8fa", color: MUTED }} className="text-left text-[11.5px] uppercase tracking-wider">
              <th className="px-4 py-2.5 font-medium">Semester</th>
              <th className="px-4 py-2.5 font-medium">Dates</th>
              <th className="px-4 py-2.5 font-medium">2nd term starts</th>
              <th className="px-4 py-2.5 font-medium">Classes</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.ayId} style={{ borderTop: `1px solid ${BORDER}` }}>
                <td className="px-4 py-2.5 font-medium">{semesterName(y)}</td>
                <td className="px-4 py-2.5">{nice(y.startDate)} – {nice(y.endDate)}</td>
                <td className="px-4 py-2.5">{y.termType === "Summer" ? "—" : y.secondTermStart ? nice(y.secondTermStart) : <span style={{ color: "#b42318" }}>Not set</span>}</td>
                <td className="px-4 py-2.5 font-mono">{y.classes ?? "—"}</td>
                <td className="px-4 py-2.5">
                  {y.isActive ? (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: "#dafbe1", color: "#1a7f37" }}>
                      <Check className="size-3" /> Active
                    </span>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => run(() => activateAcademicYear(y.ayId), `${semesterName(y)} is now active.`)}
                      className="rounded-md px-2 py-0.5 text-[12px] font-medium" style={{ border: `1px solid ${BORDER}`, color: MAROON }}>
                      Make active
                    </button>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <button type="button" title="Edit" disabled={busy} className="rounded p-1 hover:bg-[#f6f8fa]" style={{ color: MUTED }}
                    onClick={() => {
                      setError(null); setMessage(null);
                      setEditing({ id: y.ayId, form: {
                        label: y.label, termType: y.termType as TermType,
                        startDate: day(y.startDate), endDate: day(y.endDate), secondTermStart: day(y.secondTermStart),
                      } });
                    }}>
                    <Pencil className="size-3.5" />
                  </button>
                  {!y.isActive && !y.classes && (
                    <button type="button" title="Delete" disabled={busy} className="ml-1 rounded p-1 hover:bg-[#fff4f4]" style={{ color: "#b42318" }}
                      onClick={() => { if (window.confirm(`Delete ${semesterName(y)}? It has no classes.`)) run(() => deleteAcademicYear(y.ayId), `${semesterName(y)} deleted.`); }}>
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {years.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center" style={{ color: MUTED }}>{loading ? "Loading..." : "No semesters yet. Add the current one."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SemesterForm({ title, form, busy, onChange, onSave, onCancel }: {
  title: string;
  form: SaveAcademicYear;
  busy: boolean;
  onChange: (f: SaveAcademicYear) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<SaveAcademicYear>) => onChange({ ...form, ...patch });
  const summer = form.termType === "Summer";
  const ready = /^\d{4}-\d{4}$/.test(form.label.trim()) && form.startDate && form.endDate && (summer || form.secondTermStart);

  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 6, padding: 18 }}>
      <div className="mb-3 text-[14px] font-semibold">{title}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="School year">
          <input value={form.label} onChange={(e) => set({ label: e.target.value })} placeholder="2026-2027" className={INPUT} style={{ border: `1px solid ${BORDER}` }} />
        </Field>
        <Field label="Semester">
          <select value={form.termType} onChange={(e) => set({ termType: e.target.value as TermType })} className={INPUT} style={{ border: `1px solid ${BORDER}` }}>
            {(Object.keys(TERM_LABELS) as TermType[]).map((t) => <option key={t} value={t}>{TERM_LABELS[t]}</option>)}
          </select>
        </Field>
        <Field label="Starts">
          <input type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} className={INPUT} style={{ border: `1px solid ${BORDER}` }} />
        </Field>
        <Field label="Ends">
          <input type="date" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} className={INPUT} style={{ border: `1px solid ${BORDER}` }} />
        </Field>
        {!summer && (
          <Field label="2nd term starts">
            <input type="date" value={form.secondTermStart ?? ""} min={form.startDate || undefined} max={form.endDate || undefined}
              onChange={(e) => set({ secondTermStart: e.target.value })} className={INPUT} style={{ border: `1px solid ${BORDER}` }} />
          </Field>
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onSave} disabled={!ready || busy}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium"
          style={{ background: MAROON, color: GOLD, opacity: ready && !busy ? 1 : 0.6 }}>
          <Check className="size-3.5" /> {busy ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px]"
          style={{ border: `1px solid ${BORDER}`, color: MUTED }}>
          <X className="size-3.5" /> Cancel
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>{label}</span>
      {children}
    </label>
  );
}
