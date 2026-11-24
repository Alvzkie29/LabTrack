import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownWideNarrow,
  BookOpen,
  CalendarRange,
  CircleAlert,
  ClipboardList,
  Clock,
  Download,
  Eye,
  FileSearch,
  FlaskConical,
  Hash,
  Loader2,
  Monitor,
  Play,
  Search,
  StickyNote,
  UserRound,
  X,
} from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getCourseSections, type CourseSectionSummary } from "@/api/courseSections";
import { getLaboratories, type LaboratorySummary } from "@/api/laboratories";
import { getAttendanceReport, type AttendanceReportRow } from "@/api/attendance";
import { downloadCsv } from "@/utils/csv";
import { snackbar } from "@/utils/snackbar";
import "./attendance-report.css";

type Sort = "latest" | "earliest" | "student" | "section" | "workstation";
const ALL = "all";
const EMPTY_SECTIONS: CourseSectionSummary[] = [];
const EMPTY_LABS: LaboratorySummary[] = [];
const sortOptions: { value: Sort; label: string }[] = [
  { value: "latest", label: "Latest login first" },
  { value: "earliest", label: "Earliest login first" },
  { value: "student", label: "Student name A–Z" },
  { value: "section", label: "Section code" },
  { value: "workstation", label: "Workstation" },
];

/* Local dates (toISOString() is UTC, which made "today" yesterday before 8 AM in Manila). */
function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayIso() {
  return localIso(new Date());
}
function weekAgoIso() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return localIso(d);
}
const fmtDate = (v: string) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const fmtLongDate = (v: string) => new Date(v).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const fmtTime = (v: string) => new Date(v).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
function fmtRange(from: string, to: string) {
  const f = new Date(`${from}T00:00:00`), t = new Date(`${to}T00:00:00`);
  return `${f.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${t.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}
function initials(name: string) {
  const parts = name.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function AttendanceReportsPage() {
  const { role } = useRole();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedLabId = Number(searchParams.get("lab"));
  const queryLabId = Number.isSafeInteger(requestedLabId) && requestedLabId > 0 ? requestedLabId : "";
  const allowed = role === "LabAssistant" || role === "Custodian" || role === "Administrator";

  const [sectionId, setSectionId] = useState<number | "">("");
  const [labId, setLabId] = useState<number | "">(queryLabId);
  const [from, setFrom] = useState(weekAgoIso());
  const [to, setTo] = useState(todayIso());

  const [rows, setRows] = useState<AttendanceReportRow[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [ranWith, setRanWith] = useState<{ from: string; to: string; section: string; lab: string } | null>(null);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("latest");
  const [selectedId, setSelectedId] = useState<AttendanceReportRow["attendanceId"] | null>(null);
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  const [wide, setWide] = useState(() => window.matchMedia("(min-width:1600px)").matches);

  useEffect(() => {
    const media = window.matchMedia("(min-width:1600px)");
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setLabId(queryLabId);
  }, [queryLabId]);

  const prefix = ["attendance-report", user?.userId, role];
  const sectionsQuery = useQuery({ queryKey: [...prefix, "sections"], queryFn: () => getCourseSections(), enabled: allowed, staleTime: 60_000, retry: false });
  const labsQuery = useQuery({ queryKey: [...prefix, "labs"], queryFn: () => getLaboratories(), enabled: allowed, staleTime: 60_000, retry: false });
  const sections = sectionsQuery.data ?? EMPTY_SECTIONS;
  const labs = labsQuery.data ?? EMPTY_LABS;

  // Report rows carry the section code only; link back to the section when the code is unambiguous.
  const sectionByCode = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sections) counts.set(s.sectionCode, (counts.get(s.sectionCode) ?? 0) + 1);
    const map = new Map<string, CourseSectionSummary>();
    for (const s of sections) if (counts.get(s.sectionCode) === 1) map.set(s.sectionCode, s);
    return map;
  }, [sections]);

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return rows
      .filter((r) => !q || [r.student, r.studentSchoolId, r.section, r.workstation, r.pcIdentifier, r.notes ?? ""].some((v) => (v ?? "").toLocaleLowerCase().includes(q)))
      .sort((a, b) => {
        const time = new Date(a.loginTime).getTime() - new Date(b.loginTime).getTime();
        let result = 0;
        if (sort === "latest") result = -time;
        if (sort === "earliest") result = time;
        if (sort === "student") result = a.student.localeCompare(b.student, undefined, { sensitivity: "base" });
        if (sort === "section") result = a.section.localeCompare(b.section, undefined, { numeric: true });
        if (sort === "workstation") result = a.workstation.localeCompare(b.workstation, undefined, { numeric: true });
        return result || -time;
      });
  }, [rows, search, sort]);

  const selected = selectedId === null ? null : rows.find((r) => r.attendanceId === selectedId) ?? null;

  if (!allowed) {
    return (
      <div className="att-restricted">
        <div>Restricted</div>
        <p>Attendance reporting is only available to the Laboratory Assistant, Laboratory Custodian, and Administrator roles.</p>
      </div>
    );
  }

  const rangeInvalid = !from || !to || from > to;

  const runReport = async () => {
    if (rangeInvalid) return;
    setIsLoading(true);
    setHasSearched(true);
    setLoadFailed(false);
    setSelectedId(null);
    try {
      const result = await getAttendanceReport({
        sectionId: sectionId || undefined,
        labId: labId || undefined,
        from,
        to,
      });
      setRows(result);
      setRanWith({
        from,
        to,
        section: sections.find((s) => s.sectionId === sectionId)?.sectionCode ?? "All sections",
        lab: labs.find((l) => l.labId === labId)?.name ?? "All laboratories",
      });
    } catch {
      setRows([]);
      setRanWith(null);
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  const exportCsv = () => {
    try { downloadCsv(
      `attendance-report_${from}_to_${to}`,
      rows.map((r) => ({
        Student: r.student,
        "School ID": r.studentSchoolId,
        Section: r.section,
        Workstation: r.workstation,
        "Login Time": new Date(r.loginTime).toLocaleString(),
        "PC": r.pcIdentifier,
        Notes: r.notes ?? "",
      })),
    ); } catch (error) { snackbar.error(error instanceof Error ? error.message : "Could not prepare the attendance CSV."); }
  };

  function openRecord(row: AttendanceReportRow, element: HTMLElement) {
    setReturnFocus(element);
    setSelectedId(row.attendanceId);
  }
  function clickRow(event: MouseEvent<HTMLElement>, row: AttendanceReportRow) {
    if ((event.target as HTMLElement).closest("button,a")) return;
    openRecord(row, event.currentTarget.querySelector<HTMLButtonElement>(".att-view") ?? event.currentTarget);
  }
  function resetView() {
    setSearch("");
    setSort("latest");
    setSelectedId(null);
  }
  const hasViewFilters = search.trim() !== "" || sort !== "latest";

  const statusText = isLoading
    ? "Running report…"
    : loadFailed
      ? "Records unavailable"
      : !hasSearched
        ? "No report run yet"
        : search.trim()
          ? `${visible.length} of ${rows.length} records`
          : `${rows.length} ${rows.length === 1 ? "record" : "records"}`;

  return (
    <div className="att-page">
      <header className="att-heading">
        <div>
          <p className="att-eyebrow">LABORATORY MANAGEMENT / ATTENDANCE RECORDS</p>
          <div className="att-heading-title">
            <h1>Attendance Report</h1>
            {ranWith && !isLoading && <span className="att-count">{rows.length} {rows.length === 1 ? "Record" : "Records"}</span>}
          </div>
          <p>Explore recorded laboratory attendance, review workstation usage, and export attendance records.</p>
        </div>
      </header>

      <div className={`att-layout ${selected && wide ? "has-inspector" : ""}`}>
        <section className="att-workspace" aria-labelledby="att-workspace-heading">
          {/* Report filters */}
          <div className="att-toolbar" role="group" aria-label="Report filters">
            <div className="att-filters">
              <SearchableSelect
                ariaLabel="Course section"
                value={sectionId === "" ? ALL : String(sectionId)}
                onValueChange={(v: string) => setSectionId(v === ALL ? "" : Number(v))}
                options={[{ value: ALL, label: "All sections" }, ...sections.map((s) => ({ value: String(s.sectionId), label: `${s.sectionCode} · ${s.subject.code}` }))]}
                leadingIcon={<BookOpen size={15} />}
                searchPlaceholder="Search section or subject…"
              />
              <SearchableSelect
                ariaLabel="Laboratory"
                value={labId === "" ? ALL : String(labId)}
                onValueChange={(v: string) => setLabId(v === ALL ? "" : Number(v))}
                options={[{ value: ALL, label: "All laboratories" }, ...labs.map((l) => ({ value: String(l.labId), label: l.name }))]}
                leadingIcon={<FlaskConical size={15} />}
                searchPlaceholder="Search laboratories…"
              />
              <div className={`att-range ${rangeInvalid ? "is-invalid" : ""}`} title={rangeInvalid ? "Start date must be on or before the end date" : undefined}>
                <CalendarRange size={15} />
                <input type="date" aria-label="Start date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
                <span aria-hidden="true">→</span>
                <input type="date" aria-label="End date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
            <div className="att-actions">
              <button className="att-run" onClick={runReport} disabled={isLoading || rangeInvalid}>
                {isLoading ? <Loader2 size={14} className="att-spin" /> : <Play size={14} />}
                {isLoading ? "Running…" : "Run report"}
              </button>
              <button className="att-export" onClick={exportCsv} disabled={rows.length === 0}>
                <Download size={14} /> Export CSV
              </button>
            </div>
          </div>

          {/* Context + in-results tools */}
          <div className="att-table-context">
            <div>
              <h2 id="att-workspace-heading">Attendance records</h2>
              <span role="status">{statusText}</span>
              {ranWith && (
                <div className="att-chips">
                  <span><CalendarRange size={12} /> {fmtRange(ranWith.from, ranWith.to)}</span>
                  <span>{ranWith.section}</span>
                  <span>{ranWith.lab}</span>
                </div>
              )}
            </div>
            {rows.length > 0 && (
              <div className="att-result-tools">
                <label className="att-search">
                  <Search size={15} />
                  <input
                    type="search"
                    aria-label="Search within results"
                    placeholder="Search student, ID, or PC…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setSelectedId(null);
                    }}
                  />
                  {search && (
                    <button aria-label="Clear search" onClick={() => setSearch("")}>
                      <X size={13} />
                    </button>
                  )}
                </label>
                <SearchableSelect
                  ariaLabel="Sort records"
                  value={sort}
                  onValueChange={(v: string) => setSort(v as Sort)}
                  options={sortOptions}
                  leadingIcon={<ArrowDownWideNarrow size={15} />}
                  searchPlaceholder="Search sorting options…"
                />
              </div>
            )}
          </div>

          {/* Body */}
          {loadFailed ? (
            <div className="att-page-state" role="alert">
              <CircleAlert size={29} />
              <h3>The report could not be loaded</h3>
              <p>Check the connection to the LabTrack server and try again. Your filters have been kept.</p>
              <button onClick={runReport}>Try again</button>
            </div>
          ) : isLoading ? (
            <div className="att-skeleton" role="status">
              <span className="sr-only">Loading attendance records</span>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : !hasSearched ? (
            <div className="att-page-state">
              <ClipboardList size={30} />
              <h3>Set your filters and run the report</h3>
              <p>Choose a course section, laboratory, and date range, then select Run report to load the recorded attendance.</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="att-page-state">
              <FileSearch size={30} />
              <h3>{rows.length ? "No matching records" : "No attendance recorded"}</h3>
              <p>{rows.length ? "Try another student name, school ID, section, or workstation." : "No attendance was recorded for these filters. Try a wider date range or another laboratory."}</p>
              {hasViewFilters && <button onClick={resetView}>Clear search</button>}
            </div>
          ) : (
            <>
              <div className="att-table-scroll">
                <table className="att-table">
                  <caption className="sr-only">Recorded laboratory attendance for the selected section, laboratory, and date range</caption>
                  <thead>
                    <tr>
                      <th scope="col">Student</th>
                      <th scope="col">Section / Subject</th>
                      <th scope="col">Workstation</th>
                      <th scope="col">Login</th>
                      <th scope="col">Notes</th>
                      <th scope="col"><span className="sr-only">View details</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => {
                      const sec = sectionByCode.get(r.section);
                      const isSel = selectedId === r.attendanceId;
                      return (
                        <tr key={r.attendanceId} className={isSel ? "is-selected" : ""} onClick={(e) => clickRow(e, r)}>
                          <td>
                            <div className="att-student">
                              <span className="att-avatar">{initials(r.student)}</span>
                              <div>
                                <button className="att-student-name" onClick={(e) => openRecord(r, e.currentTarget)}>{r.student}</button>
                                <small>{r.studentSchoolId}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            {sec ? <Link to={`/courses/${sec.sectionId}`} className="att-section-code">{r.section}</Link> : <span className="att-section-code">{r.section}</span>}
                            {sec && <small>{sec.subject.code} · {sec.subject.title}</small>}
                          </td>
                          <td>
                            <span className="att-workstation"><Monitor size={13} /> {r.workstation}</span>
                            {r.pcIdentifier && <small>{r.pcIdentifier}</small>}
                          </td>
                          <td>
                            <span className="att-time">{fmtTime(r.loginTime)}</span>
                            <small>{fmtDate(r.loginTime)}</small>
                          </td>
                          <td>
                            {r.notes ? <span className="att-note" title={r.notes}><StickyNote size={12} />{r.notes}</span> : <span className="att-none">—</span>}
                          </td>
                          <td>
                            <button className="att-view" aria-label={`View record for ${r.student}`} aria-expanded={isSel} onClick={(e) => openRecord(r, e.currentTarget)}>
                              <Eye size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="att-mobile-list">
                {visible.map((r) => (
                  <article key={r.attendanceId} className={`att-mobile-row ${selectedId === r.attendanceId ? "is-selected" : ""}`}>
                    <button className="att-mobile-title" onClick={(e) => openRecord(r, e.currentTarget)}>
                      <span className="att-avatar">{initials(r.student)}</span>
                      <span>
                        <strong>{r.student}</strong>
                        <small>{r.studentSchoolId} · Section {r.section}</small>
                      </span>
                    </button>
                    <dl>
                      <div><dt>Workstation</dt><dd>{r.workstation}</dd></div>
                      <div><dt>Login</dt><dd>{fmtTime(r.loginTime)} · {fmtDate(r.loginTime)}</dd></div>
                    </dl>
                    {r.notes && <p className="att-mobile-note"><StickyNote size={12} /> {r.notes}</p>}
                  </article>
                ))}
              </div>
            </>
          )}

          <footer className="att-workspace-footer">
            <span><Download size={13} /> Export CSV always includes every record in the report, regardless of search or sort.</span>
            {hasViewFilters && rows.length > 0 && <button onClick={resetView}>Reset view</button>}
          </footer>
        </section>

        <RecordInspector
          record={selected}
          rows={rows}
          section={selected ? sectionByCode.get(selected.section) ?? null : null}
          wide={wide}
          returnFocus={returnFocus}
          onClose={() => setSelectedId(null)}
          onFocusStudent={(id) => {
            setSearch(id);
          }}
        />
      </div>
    </div>
  );
}

/* ─────────────────────────── Inspector ─────────────────────────── */

function RecordInspector({
  record,
  rows,
  section,
  wide,
  returnFocus,
  onClose,
  onFocusStudent,
}: {
  record: AttendanceReportRow | null;
  rows: AttendanceReportRow[];
  section: CourseSectionSummary | null;
  wide: boolean;
  returnFocus: HTMLElement | null;
  onClose: () => void;
  onFocusStudent: (schoolId: string) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = record !== null;

  useEffect(() => {
    if (!open) return;
    if (!wide) closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, wide, onClose]);

  useEffect(() => {
    if (!open && returnFocus?.isConnected) returnFocus.focus();
  }, [open, returnFocus]);

  if (!record) return null;

  const studentCount = rows.filter((r) => r.studentSchoolId === record.studentSchoolId).length;
  const stationCount = rows.filter((r) => r.workstation === record.workstation).length;

  const panel = (
    <aside className={`att-inspector ${wide ? "att-inspector-inline" : "att-inspector-drawer"}`} aria-label="Attendance record details" role={wide ? undefined : "dialog"} aria-modal={wide ? undefined : true}>
      <div className="att-inspector-heading">
        <div>
          <p className="att-eyebrow">ATTENDANCE RECORD</p>
          <h2>{record.student}</h2>
          <p>{record.studentSchoolId}</p>
        </div>
        <button ref={closeRef} aria-label="Close record details" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="att-inspector-body">
        <div className="att-inspector-identity">
          <span className="att-inspector-icon"><UserRound size={19} /></span>
          <p>
            {record.section}
            {section && <span>{section.subject.code} · {section.term}</span>}
          </p>
          {section && <h3>{section.subject.title}</h3>}
          {section?.faculty && <p className="att-inspector-faculty">Faculty: {section.faculty}</p>}
        </div>

        <div className="att-inspector-card">
          <h4><Clock size={14} /> Login</h4>
          <p className="att-inspector-time">
            <strong>{fmtTime(record.loginTime)}</strong>
            <span>{fmtLongDate(record.loginTime)}</span>
          </p>
          <dl>
            <div><dt><Monitor size={12} /> Workstation</dt><dd>{record.workstation}</dd></div>
            <div><dt><Hash size={12} /> PC identifier</dt><dd>{record.pcIdentifier || "—"}</dd></div>
            <div><dt><BookOpen size={12} /> Section</dt><dd>{record.section}</dd></div>
          </dl>
        </div>

        <div className="att-notes-panel">
          <h4><StickyNote size={14} /> Notes</h4>
          {record.notes ? <p>{record.notes}</p> : <p className="att-notes-empty">No notes were added to this record.</p>}
        </div>

        <div className="att-inspector-card">
          <h4><ClipboardList size={14} /> In this report</h4>
          <div className="att-inspector-stats">
            <div><strong>{studentCount}</strong><span>{studentCount === 1 ? "login" : "logins"} by this student</span></div>
            <div><strong>{stationCount}</strong><span>{stationCount === 1 ? "record" : "records"} on {record.workstation}</span></div>
          </div>
        </div>

        <div className="att-inspector-links">
          {section && <Link to={`/courses/${section.sectionId}`}>Course records</Link>}
          <button onClick={() => onFocusStudent(record.studentSchoolId)}><Search size={13} /> Show only this student</button>
        </div>
      </div>
    </aside>
  );

  if (wide) return panel;
  return (
    <div className="att-drawer-root">
      <div className="att-drawer-overlay" onClick={onClose} aria-hidden="true" />
      {panel}
    </div>
  );
}
