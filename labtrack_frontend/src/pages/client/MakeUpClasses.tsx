import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Check, FileText, Paperclip, Trash2, X } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { getCourseSections, type CourseSectionSummary } from "@/api/courseSections";
import { getLaboratories, type LaboratorySummary } from "@/api/laboratories";
import {
  createMakeUpClass, deleteMakeUpClass, getMakeUpClasses, openMakeUpAttachment, type MakeUpClass,
} from "@/api/makeUpClasses";
import { ApiError } from "@/api/client";

const MAROON = "#800000";
const GOLD = "#F4C430";
const MUTED = "#57606a";
const BORDER = "#d1d9e0";
const INPUT = "w-full rounded-md bg-white px-2.5 py-1.5 text-[13px] outline-none";

const timeLabel = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const dateLabel = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

interface Form {
  sectionId: number | "";
  labId: number | "";
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  file: File | null;
}
const EMPTY: Form = { sectionId: "", labId: "", date: "", startTime: "", endTime: "", reason: "", file: null };

export function MakeUpClassesPage() {
  const { role } = useRole();
  const allowed = role === "Custodian" || role === "Administrator" || role === "LabAssistant";

  const [list, setList] = useState<MakeUpClass[]>([]);
  const [sections, setSections] = useState<CourseSectionSummary[]>([]);
  const [labs, setLabs] = useState<LaboratorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => getMakeUpClasses().then(setList).catch(() => setList([])).finally(() => setLoading(false));

  useEffect(() => {
    if (!allowed) return;
    load();
    getCourseSections().then(setSections).catch(() => setSections([]));
    getLaboratories().then(setLabs).catch(() => setLabs([]));
  }, [allowed]);

  if (!allowed) {
    return <div className="py-24 text-center text-[13px]" style={{ color: MUTED }}>This page is only available to staff.</div>;
  }

  const save = async () => {
    if (!form || form.sectionId === "" || form.labId === "" || !form.file) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await createMakeUpClass({
        sectionId: form.sectionId, labId: form.labId, date: form.date,
        startTime: form.startTime, endTime: form.endTime, reason: form.reason, attachment: form.file,
      });
      const s = sections.find((x) => x.sectionId === form.sectionId);
      setMessage(`Make-up class for ${s?.sectionCode ?? "the class"} on ${dateLabel(form.date)} saved. Students can log in for it on the PC Agent that day.`);
      setForm(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the make-up class.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: MakeUpClass) => {
    if (!window.confirm(`Remove the make-up class for ${m.sectionCode} on ${dateLabel(m.date)}?`)) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await deleteMakeUpClass(m.makeUpId);
      setMessage("Make-up class removed.");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not remove it.");
    } finally {
      setBusy(false);
    }
  };

  const open = (m: MakeUpClass) =>
    openMakeUpAttachment(m.makeUpId).catch((e) => setError(e instanceof ApiError ? e.message : "Could not open the attachment."));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>Schedule</div>
          <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Make-up Classes</h1>
          <p className="mt-0.5 max-w-2xl text-[13px]" style={{ color: MUTED }}>
            Record an approved make-up class with the request attached. On that date it works like a regular lab
            meeting: students log in on the PC Agent, the faculty confirms the session, and its hours count once finally confirmed.
          </p>
        </div>
        {!form && (
          <button type="button" onClick={() => { setForm(EMPTY); setError(null); setMessage(null); }}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium" style={{ background: MAROON, color: GOLD }}>
            <CalendarPlus className="size-3.5" /> Add make-up class
          </button>
        )}
      </div>

      {message && <div className="text-[12.5px]" style={{ color: "#1a7f37" }}>{message}</div>}
      {error && <div className="text-[12.5px]" style={{ color: "#b42318" }}>{error}</div>}

      {form && (
        <MakeUpForm form={form} sections={sections} labs={labs} busy={busy}
          onChange={setForm} onSave={save} onCancel={() => { setForm(null); setError(null); }} />
      )}

      <div className="overflow-x-auto" style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr style={{ background: "#f6f8fa", color: MUTED }}>
              {["Date", "Time", "Class", "Lab", "Reason", "Approved request", "Session", ""].map((h, i) => (
                <th key={i} className={`py-2.5 pr-3 text-left font-mono text-[10.5px] uppercase tracking-wider ${i === 0 ? "pl-4" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.makeUpId} style={{ borderTop: "1px solid #e1e4e8" }}>
                <td className="whitespace-nowrap py-2.5 pl-4 pr-3 align-top">{dateLabel(m.date)}</td>
                <td className="whitespace-nowrap py-2.5 pr-3 align-top font-mono text-[11.5px]">
                  {timeLabel(m.startTime)} – {timeLabel(m.endTime)}
                  <div style={{ color: MUTED }}>{m.hours}h</div>
                </td>
                <td className="py-2.5 pr-3 align-top">
                  <span className="font-mono" style={{ color: MAROON, fontWeight: 600 }}>{m.sectionCode}</span>{" "}
                  <span className="font-mono text-[11.5px]">{m.subjectCode}</span> {m.subjectTitle}
                  <div style={{ color: MUTED }}>{m.faculty ?? "No faculty assigned"}</div>
                </td>
                <td className="py-2.5 pr-3 align-top font-mono text-[11.5px]">{m.roomCode}</td>
                <td className="py-2.5 pr-3 align-top" style={{ color: m.reason ? undefined : MUTED }}>{m.reason ?? "—"}</td>
                <td className="py-2.5 pr-3 align-top">
                  <button type="button" onClick={() => open(m)} className="inline-flex max-w-[180px] items-center gap-1 text-left hover:underline" style={{ color: MAROON }}>
                    <FileText className="size-3.5 shrink-0" /> <span className="truncate">{m.attachmentName}</span>
                  </button>
                  <div className="text-[11px]" style={{ color: MUTED }}>by {m.createdBy}</div>
                </td>
                <td className="py-2.5 pr-3 align-top">
                  {m.session === "Confirmed" ? (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "#dafbe1", color: "#1a7f37" }}>
                      <Check className="size-3" /> Confirmed
                    </span>
                  ) : m.session ? (
                    <span className="text-[11.5px]" style={{ color: "#9a6700" }}>{m.session}</span>
                  ) : (
                    <span className="text-[11.5px]" style={{ color: MUTED }}>Not confirmed yet</span>
                  )}
                </td>
                <td className="py-2.5 pr-4 text-right align-top">
                  {!m.session && (
                    <button type="button" title="Remove" disabled={busy} onClick={() => remove(m)}
                      className="rounded p-1 hover:bg-[#fff4f4]" style={{ color: "#b42318" }}>
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-[13px]" style={{ color: MUTED }}>
                  {loading ? "Loading..." : "No make-up classes this semester."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MakeUpForm({ form, sections, labs, busy, onChange, onSave, onCancel }: {
  form: Form;
  sections: CourseSectionSummary[];
  labs: LaboratorySummary[];
  busy: boolean;
  onChange: (f: Form) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const set = (patch: Partial<Form>) => onChange({ ...form, ...patch });

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      [...sections]
        .filter((s) => !q || s.sectionCode.toLowerCase().includes(q) || s.subject.code.toLowerCase().includes(q)
          || s.subject.title.toLowerCase().includes(q) || (s.faculty ?? "").toLowerCase().includes(q))
        .sort((a, b) => a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true })),
    [sections, q],
  );

  // Picking a class fills in its usual lab and time, which can then be changed.
  const pickSection = (id: number | "") => {
    const s = sections.find((x) => x.sectionId === id);
    const m = s?.meetings[0];
    set({
      sectionId: id,
      labId: m ? m.laboratory.labId : form.labId,
      startTime: m ? m.startTime.slice(0, 5) : form.startTime,
      endTime: m ? m.endTime.slice(0, 5) : form.endTime,
    });
  };

  const sunday = form.date !== "" && new Date(`${form.date}T00:00:00`).getDay() === 0;
  const ready = form.sectionId !== "" && form.labId !== "" && form.date !== "" && !sunday
    && form.startTime !== "" && form.endTime !== "" && form.endTime > form.startTime && form.file !== null;

  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 6, padding: 18 }}>
      <div className="mb-3 text-[14px] font-semibold">New make-up class</div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Class">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search class code, subject or faculty"
            className={`${INPUT} mb-1.5`} style={{ border: `1px solid ${BORDER}` }} />
          <select value={form.sectionId} onChange={(e) => pickSection(e.target.value ? Number(e.target.value) : "")}
            className={INPUT} style={{ border: `1px solid ${BORDER}` }}>
            <option value="">Select a class... ({matches.length})</option>
            {matches.map((s) => (
              <option key={s.sectionId} value={s.sectionId}>
                {s.sectionCode} · {s.subject.code} {s.subject.title}{s.faculty ? ` · ${s.faculty}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} className={INPUT} style={{ border: `1px solid ${BORDER}` }} />
            {sunday && <span className="mt-1 block text-[11.5px]" style={{ color: "#b42318" }}>Make-up classes can be Monday to Saturday.</span>}
          </Field>
          <Field label="Laboratory">
            <select value={form.labId} onChange={(e) => set({ labId: e.target.value ? Number(e.target.value) : "" })}
              className={INPUT} style={{ border: `1px solid ${BORDER}` }}>
              <option value="">Select...</option>
              {labs.map((l) => <option key={l.labId} value={l.labId}>{l.roomCode} · {l.name}</option>)}
            </select>
          </Field>
          <Field label="Starts">
            <input type="time" value={form.startTime} onChange={(e) => set({ startTime: e.target.value })} className={INPUT} style={{ border: `1px solid ${BORDER}` }} />
          </Field>
          <Field label="Ends">
            <input type="time" value={form.endTime} onChange={(e) => set({ endTime: e.target.value })} className={INPUT} style={{ border: `1px solid ${BORDER}` }} />
          </Field>
        </div>
        <Field label="Reason (optional)">
          <input value={form.reason} maxLength={300} onChange={(e) => set({ reason: e.target.value })}
            placeholder="e.g. Class missed on Nov 11 (holiday)" className={INPUT} style={{ border: `1px solid ${BORDER}` }} />
        </Field>
        <Field label="Approved request (PDF, JPG or PNG, up to 5 MB)">
          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px]" style={{ border: `1px dashed ${BORDER}` }}>
            <Paperclip className="size-3.5" style={{ color: MUTED }} />
            <span className="truncate" style={{ color: form.file ? "#0d1117" : MUTED }}>{form.file ? form.file.name : "Choose the file..."}</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden"
              onChange={(e) => set({ file: e.target.files?.[0] ?? null })} />
          </label>
        </Field>
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
