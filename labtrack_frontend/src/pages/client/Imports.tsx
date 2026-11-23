import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ChevronDown, FileSpreadsheet, FileUp, Info, Loader2, RefreshCw, ShieldCheck, Upload, Users, X } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { getAcademicYears, semesterName, type AcademicYear } from "@/api/academicYears";
import { getCourseSections, type CourseSectionSummary } from "@/api/courseSections";
import { importSchedule, importRoster } from "@/api/imports";
import { ApiError } from "@/api/client";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CsvPreview } from "@/components/imports/CsvPreview";
import "./imports.css";

type ImportKind = "schedule" | "roster";
const columns = {
  schedule: ["ClassCode", "SubjectCode", "Description", "Units", "Term", "Day", "StartTime", "EndTime", "Lab", "LectureRoom"],
  roster: ["StudentId", "LastName", "FirstName", "FullName", "MiddleName", "Email"],
};
const message = (error: unknown, fallback: string) => error instanceof ApiError ? error.message : fallback;

export function ImportsPage() {
  const { role } = useRole();
  const canSchedule = role === "Custodian" || role === "Administrator";
  const canRoster = canSchedule || role === "LabAssistant";
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [reload, setReload] = useState(0);
  const [activeStage, setActiveStage] = useState<ImportKind>("schedule");
  const stage = canSchedule ? activeStage : "roster";
  const [semester, setSemester] = useState<Record<ImportKind, string>>({ schedule: "", roster: "" });
  const [importing, setImporting] = useState<ImportKind | null>(null);

  useEffect(() => {
    if (!canRoster) return;
    let cancelled = false;
    setLoading(true); setError(null);
    getAcademicYears().then((rows) => { if (!cancelled) setYears(rows); })
      .catch((e) => { if (!cancelled) setError(message(e, "Could not load semesters.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [canRoster, retry]);

  useEffect(() => {
    if (!years.length) return;
    const fallback = String((years.find((y) => y.isActive) ?? years[0]).ayId);
    setSemester((current) => ({
      schedule: years.some((y) => String(y.ayId) === current.schedule) ? current.schedule : fallback,
      roster: years.some((y) => String(y.ayId) === current.roster) ? current.roster : fallback,
    }));
  }, [years]);

  function openStage(next: ImportKind) {
    setActiveStage(next);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`#imports-open-${next}`)?.focus({ preventScroll: true }));
  }

  if (!canRoster) return <div className="imports-restricted">
    <ShieldCheck size={28} />
    <h1>Staff access only</h1>
    <p>This page is available to laboratory staff and administrators.</p>
  </div>;

  return <div className="imports-page">
    <header className="imports-heading">
      <div>
        <p className="imports-eyebrow">ACADEMIC MANAGEMENT / DATA IMPORT</p>
        <h1>Semester Setup</h1>
        <p>Import laboratory schedules and enroll students into their assigned course sections.</p>
      </div>
      <div className="imports-heading-controls">
        <div>
          <label htmlFor="imports-semester">Semester / {stage === "schedule" ? "Schedule" : "Class list"}</label>
          <SearchableSelect id="imports-semester" ariaLabel={`${stage === "schedule" ? "Schedule" : "Class list"} semester`} value={semester[stage]} onValueChange={(value) => setSemester((current) => ({ ...current, [stage]: value }))} disabled={loading || !!error || !!importing || !years.length} placeholder={loading ? "Loading semesters…" : "No semesters available"} options={years.map((y) => ({ value: String(y.ayId), label: semesterName(y), description: `${y.startDate.slice(0, 10)} to ${y.endDate.slice(0, 10)}${y.isActive ? " · Active" : ""}` }))} />
        </div>
        <button className="imports-secondary" aria-label="Refresh import options" disabled={loading || !!importing} onClick={() => { setRetry((n) => n + 1); setReload((n) => n + 1); }}>
          <RefreshCw size={15} />
        </button>
      </div>
    </header>
    <div className="imports-workflow-intro">
      <span>
        <FileSpreadsheet size={16} /> {canSchedule ? "Two stages. One prepared semester." : "Student enrollment import"}</span>
      <p>{canSchedule ? "Start with a schedule, or go straight to a class list if your course sections already exist." : "Select an existing course section to import its student class list."}</p>
    </div>
    {error && <div className="imports-notice is-error" role="alert">
      <AlertTriangle size={17} />
      <span>{error}</span>
      <button onClick={() => setRetry((n) => n + 1)}>Try again</button>
    </div>}
    {!loading && !error && years.length === 0 && <div className="imports-notice" role="status">
      <Info size={17} />
      <span>No semesters found. Set up an academic year before importing files.</span>
    </div>}
    {!loading && !error && years.length > 0 && !years.some((y) => y.isActive) && <div className="imports-notice" role="status">
      <Info size={17} />
      <span>No semester is marked active. Review the selected semester before importing.</span>
    </div>}
    <div className="imports-stages">
      {canSchedule && <ImportPanel kind="schedule" ayId={semester.schedule} active={stage === "schedule"} onActivate={() => openStage("schedule")} onAdvance={() => openStage("roster")} years={years} loadingYears={loading || !!error} reload={reload} importing={importing} onImporting={setImporting} onDone={() => setReload((n) => n + 1)} />}
      <ImportPanel kind="roster" ayId={semester.roster} active={stage === "roster"} onActivate={() => openStage("roster")} years={years} loadingYears={loading || !!error} reload={reload} importing={importing} onImporting={setImporting} onDone={() => { }} />
    </div>
    <footer className="imports-footer">
      <Info size={14} />
      <p>Use a CSV exported from your spreadsheet. Review the destination before importing; the results will show what was added and which rows were skipped.</p>
    </footer>
  </div>;
}

function ImportPanel({ kind, ayId, active, onActivate, onAdvance, years, loadingYears, reload, importing, onImporting, onDone }: {
  kind: ImportKind; ayId: string; active: boolean; onActivate: () => void; onAdvance?: () => void; years: AcademicYear[]; loadingYears: boolean; reload: number;
  importing: ImportKind | null; onImporting: (kind: ImportKind | null) => void; onDone: () => void;
}) {
  const id = useId();
  const roster = kind === "roster";
  const [sectionId, setSectionId] = useState("");
  const [sectionsSemester, setSectionsSemester] = useState("");
  const [sections, setSections] = useState<CourseSectionSummary[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [sectionRetry, setSectionRetry] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const lock = useRef(false);
  const busy = importing === kind;
  const disabled = importing !== null;
  const year = years.find((y) => String(y.ayId) === ayId);
  const section = sectionsSemester === ayId ? sections.find((s) => String(s.sectionId) === sectionId) : undefined;

  useEffect(() => {
    setSectionId("");
    setError(null); setLines([]); setProblems([]);
  }, [ayId]);

  useEffect(() => {
    if (!roster || !ayId) return;
    let cancelled = false;
    setLoadingSections(true); setSectionError(null); setSections([]);
    getCourseSections({ ayId: Number(ayId) }).then((rows) => {
      if (cancelled) return;
      setSections(rows); setSectionsSemester(ayId);
      setSectionId((current) => rows.some((s) => String(s.sectionId) === current) ? current : "");
    }).catch((e) => { if (!cancelled) { setSectionId(""); setSectionError(message(e, "Could not load course sections.")); } })
      .finally(() => { if (!cancelled) setLoadingSections(false); });
    return () => { cancelled = true; };
  }, [roster, ayId, reload, sectionRetry]);

  function clearResult() { setError(null); setLines([]); setProblems([]); }
  const canSubmit = !!file && !!year && !loadingYears && !disabled && (!roster || !!section && !loadingSections && !sectionError);
  async function submit() {
    if (!canSubmit || !file || lock.current) return;
    lock.current = true;
    onImporting(kind); clearResult();
    try {
      if (roster) {
        const r = await importRoster(Number(sectionId), file);
        setLines([`${r.enrolled} students added to the class`, ...(r.accountsCreated ? [`${r.accountsCreated} new student accounts created`] : []), ...(r.alreadyOnRoster ? [`${r.alreadyOnRoster} already on the class list`] : [])]);
        setProblems(r.errors);
      } else {
        const r = await importSchedule(Number(ayId), file);
        setLines([`${r.sectionsCreated} classes created`, `${r.meetingsAdded} laboratory meetings added`, ...(r.meetingsAlreadyThere ? [`${r.meetingsAlreadyThere} meetings already registered`] : []), ...(r.subjectsCreated ? [`${r.subjectsCreated} new subjects created`] : [])]);
        setProblems(r.errors); onDone();
      }
    } catch (e) { setError(message(e, "Upload failed. Please try again.")); }
    finally { lock.current = false; onImporting(null); }
  }

  return <section className="imports-card" aria-labelledby={`${id}-title`} aria-busy={busy}>
    <header className="imports-card-header">
      <h2>
        <button id={`imports-open-${kind}`} type="button" className="imports-stage-toggle" aria-expanded={active} aria-controls={`${id}-content`} disabled={disabled} onClick={onActivate}>
          <span className={`imports-stage-number ${lines.length ? "is-complete" : ""}`}>{lines.length ? <CheckCircle2 size={21} /> : roster ? "02" : "01"}</span>
          <span className="imports-stage-identity">
            <small>{roster ? "Student enrollment" : "Semester foundation"}</small>
            <strong id={`${id}-title`}>{roster ? "Class List" : "Laboratory Schedule"}</strong>
            <span>{roster ? "Enroll students into an existing course section." : "Create course sections and laboratory meeting records."}</span>
          </span>
          <span className="imports-stage-status">{busy ? "Importing…" : lines.length ? problems.length ? "Review skipped rows" : "Import complete" : active ? "Ready to set up" : "Open stage"}</span>
          <ChevronDown size={17} />
        </button>
      </h2>
    </header>
    <div id={`${id}-content`} hidden={!active} className="imports-stage-content">
      <div className="imports-card-body">
        <div className="imports-form-main">
          <div className="imports-selected-semester">
            <CalendarDays size={15} />
            <div>
              <span>Selected semester</span>
              <strong>{year ? semesterName(year) : loadingYears ? "Loading semesters…" : "Choose a semester above"}</strong>
            </div>
          </div>
          {roster && <div className="imports-field">
            <label htmlFor={`${id}-class`}>Course section <span>Required</span>
            </label>
            <SearchableSelect id={`${id}-class`} ariaLabel="Class list course section" value={sectionId} onValueChange={(v) => { setSectionId(v); clearResult(); }} disabled={disabled || loadingYears || loadingSections || !!sectionError || !ayId} placeholder={loadingSections ? "Loading course sections…" : "Select a course section"} searchPlaceholder="Search section code or subject…" emptyMessage="No course sections in this semester." options={sections.map((s) => ({ value: String(s.sectionId), label: `${s.sectionCode} · ${s.subject.code}`, description: s.subject.title }))} />
            {sectionError && <div className="imports-field-error" role="alert">{sectionError}<button disabled={disabled} onClick={() => setSectionRetry((n) => n + 1)}>Try again</button>
            </div>}
            {!loadingYears && !loadingSections && !sectionError && ayId && !sections.length && <p className="imports-field-help">No classes found. Import the semester’s laboratory schedule first.</p>}
          </div>}
          <FilePick kind={kind} file={file} disabled={disabled} onPick={(next) => { setFile(next); clearResult(); }} />
          {file && <CsvPreview file={file} />}
        </div>
        <aside className="imports-guidance" aria-label="CSV import guidance">
          <details className="imports-format">
            <summary>
              <span>
                <FileSpreadsheet size={15} /> CSV format guide</span>
              <ChevronDown size={14} />
            </summary>
            <div>
              <p>{roster ? "StudentId is required. New accounts need LastName and FirstName, or a FullName column with the last name first. MiddleName and Email are optional." : "Use one row per laboratory meeting. ClassCode, SubjectCode, Day, StartTime, EndTime, and Lab are required. Description and Units are used to create missing subjects."}</p>
              <div className="imports-columns">{columns[kind].map((column) => <code key={column}>{column}</code>)}</div>
              <p>{roster ? "New student accounts receive a temporary password and must change it at first login." : "Term accepts 1st Term, 2nd Term, or Sem. Use a registered laboratory room code in Lab. LectureRoom is optional."}</p>
            </div>
          </details>
          <div className="imports-process-note">
            <ShieldCheck size={17} />
            <strong>What happens when you import?</strong>
            <p>{roster ? "Students are added to this course section. Existing enrollments are skipped; new students may receive an account." : "Course sections and meetings are added to the selected semester. Existing entries are skipped."}</p>
            <p>Your original file is sent to the server, which validates every row.</p>
          </div>
        </aside>
      </div>
      <div className="imports-action-area">
        <div className="imports-destination">
          <ArrowRight size={15} />
          <div>
            <span>Import destination</span>
            <strong>{year ? semesterName(year) : "Choose a semester"}{roster && section ? ` / ${section.sectionCode}` : roster ? " / Choose a class" : ""}</strong>
          </div>
        </div>
        <p className="imports-duplicate-note">
          <Info size={13} />{roster ? "Students already enrolled in this section are skipped." : "Existing schedule entries are skipped rather than added twice."}</p>
        <button type="button" className="imports-submit" onClick={submit} disabled={!canSubmit}>{busy ? <Loader2 className="imports-spin" size={16} /> : <Upload size={16} />}{busy ? "Importing file…" : roster ? "Import Class List" : "Import Schedule"}</button>
      </div>
      <Result error={error} lines={lines} problems={problems} />
      {!roster && lines.length > 0 && <button className="imports-next" onClick={onAdvance} disabled={disabled}>Continue to Class List <ArrowRight size={15} />
      </button>}
    </div>
  </section>;
}

function FilePick({ kind, file, disabled, onPick }: { kind: ImportKind; file: File | null; disabled: boolean; onPick: (file: File | null) => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function pick(files: File[]) {
    if (disabled) return;
    setDragging(false);
    if (files.length !== 1) { onPick(null); setError("Choose one CSV file at a time."); return; }
    const next = files[0];
    if (!next.name.toLowerCase().endsWith(".csv")) { onPick(null); setError("Please choose a .csv file. Export Excel workbooks as CSV first."); return; }
    if (!next.size) { onPick(null); setError("This file is empty. Choose a CSV with a header and data rows."); return; }
    setError(null); onPick(next);
  }
  return <div className="imports-upload-field">
    <div className="imports-upload-label" id={`${id}-label`}>CSV file <span>Required</span>
    </div>
    <div className={`imports-dropzone ${dragging && !disabled ? "is-dragging" : ""} ${file ? "has-file" : ""}`} onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }} onDrop={(e) => { e.preventDefault(); pick(Array.from(e.dataTransfer.files)); }}>
      <input ref={input} type="file" accept=".csv,text/csv" aria-label={`${kind === "schedule" ? "Schedule" : "Class list"} CSV file`} disabled={disabled} onChange={(e) => { const next = e.target.files?.[0]; if (next) pick([next]); e.target.value = ""; }} className="imports-file-input" />
      {file ? <>
        <FileSpreadsheet size={29} />
        <strong className="imports-file-name">{file.name}</strong>
        <p>{new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(file.size / 1024)} KB · Selected for review</p>
        <div className="imports-file-actions">
          <button disabled={disabled} onClick={() => input.current?.click()}>Replace file</button>
          <button disabled={disabled} aria-label={`Remove ${kind} file`} onClick={() => { onPick(null); setError(null); }}>
            <X size={13} /> Remove</button>
        </div>
      </> : <>
        <FileUp size={29} />
        <strong>Drop your CSV file here</strong>
        <p>CSV files only · Browse or drop one file</p>
        <button className="imports-browse" disabled={disabled} onClick={() => input.current?.click()}>Browse files</button>
      </>}
    </div>
    {error && <p className="imports-field-error" role="alert">
      <AlertTriangle size={13} />{error}</p>}
  </div>;
}

function Result({ error, lines, problems }: { error: string | null; lines: string[]; problems: string[] }) {
  return <div className="imports-results">
    {error && <div className="imports-notice is-error" role="alert">
      <AlertTriangle size={17} />
      <span>{error}</span>
    </div>}
    {lines.length > 0 && <div className="imports-result-success" role="status">
      <div>
        <CheckCircle2 size={17} />
        <strong>{problems.length ? "Import finished with skipped rows" : "Import complete"}</strong>
      </div>
      <ul>{lines.map((line) => <li className={line.includes("already") ? "imports-existing-record" : undefined} key={line}>{line}</li>)}</ul>
    </div>}
    {problems.length > 0 && <div className="imports-result-problems" role="status">
      <div>
        <AlertTriangle size={16} />
        <strong>{problems.length} {problems.length === 1 ? "row" : "rows"} skipped</strong>
      </div>
      <p>Review these rows in your CSV before importing them again.</p>
      <ul>{problems.map((problem, i) => <li key={`${i}-${problem}`}>{problem}</li>)}</ul>
    </div>}
  </div>;
}
