import { useEffect, useState } from "react";
import { Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { getAcademicYears, type AcademicYear } from "@/api/academicYears";
import { getCourseSections, type CourseSectionSummary } from "@/api/courseSections";
import { importSchedule, importRoster } from "@/api/imports";
import { ApiError } from "@/api/client";

const MAROON = "#800000";
const GOLD = "#F4C430";
const MUTED = "#57606a";
const BORDER = "#d1d9e0";

export function ImportsPage() {
  const { role } = useRole();
  const canSchedule = role === "Custodian" || role === "Administrator";
  const canRoster = canSchedule || role === "LabAssistant";

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [sections, setSections] = useState<CourseSectionSummary[]>([]);

  const loadSections = () => getCourseSections().then(setSections).catch(() => setSections([]));

  useEffect(() => {
    getAcademicYears().then(setYears).catch(() => setYears([]));
    loadSections();
  }, []);

  if (!canRoster) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center" style={{ color: MUTED }}>
        <div className="mb-3 font-mono text-[13px] uppercase tracking-wider">Restricted</div>
        <p className="max-w-sm text-[13px]">This page is only available to staff.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>Setup</div>
        <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Import</h1>
        <p className="mt-0.5 max-w-2xl text-[13px]" style={{ color: MUTED }}>
          Load the semester's lab schedule first, then a class list for each class. Importing the same file twice adds nothing twice.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {canSchedule && <ScheduleCard years={years} onDone={loadSections} />}
        <RosterCard sections={sections} />
      </div>
    </div>
  );
}

function ScheduleCard({ years, onDone }: { years: AcademicYear[]; onDone: () => void }) {
  const [ayId, setAyId] = useState<number | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [problems, setProblems] = useState<string[]>([]);

  useEffect(() => {
    if (ayId === "" && years.length > 0) setAyId((years.find((y) => y.isActive) ?? years[0]).ayId);
  }, [years, ayId]);

  const submit = async () => {
    if (!file || !ayId) return;
    setBusy(true); setError(null); setLines([]); setProblems([]);
    try {
      const r = await importSchedule(Number(ayId), file);
      setLines([
        `${r.sectionsCreated} classes created`,
        `${r.meetingsAdded} lab meetings added` + (r.meetingsAlreadyThere ? ` (${r.meetingsAlreadyThere} already there)` : ""),
        ...(r.subjectsCreated ? [`${r.subjectsCreated} new subjects created`] : []),
      ]);
      setProblems(r.errors);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Lab schedule" hint="CSV with: ClassCode, SubjectCode, Description, Units, Term, Day, StartTime, EndTime, Lab. One row per lab meeting.">
      <Field label="Academic year">
        <select value={ayId} onChange={(e) => setAyId(e.target.value ? Number(e.target.value) : "")}
          className="w-full rounded-md px-3 py-2 text-[13px] outline-none" style={{ border: `1px solid ${BORDER}` }}>
          {years.length === 0 && <option value="">No academic year found</option>}
          {years.map((y) => (
            <option key={y.ayId} value={y.ayId}>
              {y.label} ({y.startDate.slice(0, 10)} to {y.endDate.slice(0, 10)}){y.isActive ? " · active" : ""}
            </option>
          ))}
        </select>
      </Field>
      <FilePick file={file} onPick={setFile} />
      <Go onClick={submit} disabled={!file || !ayId || busy}>{busy ? "Importing..." : "Import schedule"}</Go>
      <Result error={error} lines={lines} problems={problems} />
    </Card>
  );
}

function RosterCard({ sections }: { sections: CourseSectionSummary[] }) {
  const [sectionId, setSectionId] = useState<number | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [problems, setProblems] = useState<string[]>([]);

  const submit = async () => {
    if (!file || !sectionId) return;
    setBusy(true); setError(null); setLines([]); setProblems([]);
    try {
      const r = await importRoster(Number(sectionId), file);
      setLines([
        `${r.enrolled} students added to the class`,
        ...(r.accountsCreated ? [`${r.accountsCreated} new student accounts created`] : []),
        ...(r.alreadyOnRoster ? [`${r.alreadyOnRoster} were already on the class list`] : []),
      ]);
      setProblems(r.errors);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Class list" hint="CSV from the registrar with the student ID and name. New students get an account with a temporary password they must change at first login.">
      <Field label="Class">
        <select value={sectionId} onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
          className="w-full rounded-md px-3 py-2 text-[13px] outline-none" style={{ border: `1px solid ${BORDER}` }}>
          <option value="">Select a class...</option>
          {sections.map((s) => (
            <option key={s.sectionId} value={s.sectionId}>{s.sectionCode} — {s.subject.code} {s.subject.title}</option>
          ))}
        </select>
      </Field>
      <FilePick file={file} onPick={setFile} />
      <Go onClick={submit} disabled={!file || !sectionId || busy}>{busy ? "Importing..." : "Import class list"}</Go>
      <Result error={error} lines={lines} problems={problems} />
    </Card>
  );
}

function Card({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 6, padding: 18 }}>
      <div className="text-[14px] font-semibold">{title}</div>
      <p className="mt-0.5 mb-3.5 text-[12px]" style={{ color: MUTED }}>{hint}</p>
      <div className="space-y-3.5">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[12.5px] font-medium">{label}</label>
      {children}
    </div>
  );
}

function FilePick({ file, onPick }: { file: File | null; onPick: (f: File | null) => void }) {
  return (
    <Field label="CSV file">
      <input type="file" accept=".csv,text/csv" onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="w-full text-[12.5px]" />
      {file && <div className="mt-1 font-mono text-[11px]" style={{ color: MUTED }}>{file.name}</div>}
    </Field>
  );
}

function Go({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-semibold"
      style={{ background: MAROON, color: GOLD, opacity: disabled ? 0.6 : 1 }}>
      <Upload className="size-4" /> {children}
    </button>
  );
}

function Result({ error, lines, problems }: { error: string | null; lines: string[]; problems: string[] }) {
  return (
    <>
      {error && (
        <div className="flex items-start gap-1.5 text-[12.5px]" style={{ color: "#b42318" }}>
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {error}
        </div>
      )}
      {lines.length > 0 && (
        <div className="space-y-0.5 text-[12.5px]" style={{ color: "#1a7f37" }}>
          {lines.map((l) => (
            <div key={l} className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /> {l}</div>
          ))}
        </div>
      )}
      {problems.length > 0 && (
        <div className="rounded-md p-2.5 text-[12px]" style={{ background: "#fff8e6", color: "#7a5900" }}>
          <div className="mb-1 font-semibold">{problems.length} row{problems.length === 1 ? "" : "s"} skipped</div>
          <div className="max-h-40 space-y-0.5 overflow-auto">{problems.map((p, i) => <div key={i}>{p}</div>)}</div>
        </div>
      )}
    </>
  );
}
