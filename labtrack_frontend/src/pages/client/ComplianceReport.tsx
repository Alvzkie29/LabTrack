import { Link } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  CalendarDays,
  CircleAlert,
  Clock,
  Eye,
  FileSpreadsheet,
  FlaskConical,
  Gauge,
  Info,
  Layers,
  MapPin,
  Printer,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getAcademicYears, semesterName, type AcademicYear } from "@/api/academicYears";
import { getCourseSections, getSectionUtilization, type CourseSectionSummary, type SectionUtilization } from "@/api/courseSections";
import { getLaboratories, type LaboratorySummary } from "@/api/laboratories";
import { downloadCsv } from "@/utils/csv";
import { snackbar } from "@/utils/snackbar";
import "./compliance-report.css";

type TermFilter = "all" | "1" | "2" | "sem";
type Status = NonNullable<CourseSectionSummary["compliance"]>["status"];

const STATUS_LABEL = { Compliant: "Compliant", AtRisk: "At risk", NonCompliant: "Non-compliant" } as const;
const STATUS_DISPLAY: Record<Status, string> = { Compliant: "Compliant", AtRisk: "At Risk", NonCompliant: "Non-Compliant" };
const ALL = "all";
const TERM_OPTIONS: { value: TermFilter; label: string }[] = [
  { value: "all", label: "All classes" },
  { value: "1", label: "1st term classes" },
  { value: "2", label: "2nd term classes" },
  { value: "sem", label: "Whole-semester classes" },
];
const UTIL_HELP =
  "Average share of the laboratory's registered PCs in use during confirmed physical sessions. The number in brackets is how many confirmed sessions the average covers.";

/** confirmedHoursTotal ÷ requiredHours × 100. Null when required hours are missing, zero, or not a number. */
function verifiedPercent(c: CourseSectionSummary["compliance"]) {
  if (!c || !Number.isFinite(c.requiredHours) || c.requiredHours <= 0 || !Number.isFinite(c.confirmedHoursTotal)) return null;
  return (c.confirmedHoursTotal / c.requiredHours) * 100;
}
const fmtPct = (p: number) => (p > 0 && p < 10 ? p.toFixed(1) : String(Math.round(p * 10) / 10));
const clamp = (p: number) => Math.max(0, Math.min(100, p));

export function ComplianceReportPage() {
  const { role } = useRole();
  const allowed = role === "Custodian" || role === "Administrator";

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearsFailed, setYearsFailed] = useState(false);
  const [ayId, setAyId] = useState<number | "">("");
  // Which classes: all, the 1st- or 2nd-term classes, or the classes that run the whole semester.
  const [termFilter, setTermFilter] = useState<TermFilter>("all");
  const [sections, setSections] = useState<CourseSectionSummary[]>([]);
  const [sectionsFailed, setSectionsFailed] = useState(false);
  const [labs, setLabs] = useState<LaboratorySummary[]>([]);
  const [utilization, setUtilization] = useState<Record<number, SectionUtilization>>({});
  const [utilFailed, setUtilFailed] = useState(false);
  const [labId, setLabId] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  const [wide, setWide] = useState(() => window.matchMedia("(min-width:1600px)").matches);

  useEffect(() => {
    const media = window.matchMedia("(min-width:1600px)");
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    getAcademicYears().then((ys) => {
      setYears(ys);
      setYearsFailed(false);
      setAyId((ys.find((y) => y.isActive) ?? ys[0])?.ayId ?? "");
    }).catch(() => { setYears([]); setYearsFailed(true); });
    getLaboratories().then(setLabs).catch(() => setLabs([]));
  }, []);

  useEffect(() => {
    if (!ayId) return;
    let cancelled = false; // a slower response for an older semester/lab must not overwrite the current one
    setLoading(true);
    setSectionsFailed(false);
    setUtilFailed(false);
    setSelectedId(null);
    // A class is counted in a lab when at least one of its meetings is held there.
    getCourseSections({ ayId: Number(ayId), labId: labId || undefined })
      .then((s) => { if (!cancelled) setSections(s); })
      .catch(() => { if (!cancelled) { setSections([]); setSectionsFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    getSectionUtilization({ ayId: Number(ayId), labId: labId || undefined })
      .then((rows) => { if (!cancelled) setUtilization(Object.fromEntries(rows.map((r) => [r.sectionId, r]))); })
      .catch(() => { if (!cancelled) { setUtilization({}); setUtilFailed(true); } });
    return () => { cancelled = true; };
  }, [ayId, labId, reloadKey]);

  const ay = years.find((y) => y.ayId === ayId);
  const labRoom = labs.find((l) => l.labId === labId)?.roomCode ?? "";

  const rows = useMemo(
    () => [...sections]
      .filter((s) => termFilter === "all" || (termFilter === "sem" ? s.termPart === null : String(s.termPart) === termFilter))
      .sort((a, b) => a.subject.code.localeCompare(b.subject.code) || a.sectionCode.localeCompare(b.sectionCode)),
    [sections, termFilter],
  );

  // Counts come straight from the backend's status on each loaded row.
  const totals = useMemo(() => {
    const withData = rows.filter((r) => r.compliance);
    return {
      classes: rows.length,
      compliant: withData.filter((r) => r.compliance!.status === "Compliant").length,
      atRisk: withData.filter((r) => r.compliance!.status === "AtRisk").length,
      non: withData.filter((r) => r.compliance!.status === "NonCompliant").length,
      noRecord: rows.length - withData.length,
    };
  }, [rows]);

  const selected = selectedId === null ? null : rows.find((r) => r.sectionId === selectedId) ?? null;

  if (!allowed) {
    return (
      <div className="py-24 text-center text-[13px]" style={{ color: "#57606a" }}>
        This page is only available to the Custodian and Administrator roles.
      </div>
    );
  }

  // "45% (6)" = mean occupancy over 6 confirmed sessions; a dash when none are confirmed yet.
  const utilizationText = (sectionId: number) => {
    const u = utilization[sectionId];
    return u && u.utilizationPercent !== null ? `${Math.round(u.utilizationPercent)}% (${u.confirmedSessions})` : "—";
  };

  const meetings = (r: CourseSectionSummary) =>
    r.meetings.map((m) => `${m.dayOfWeek.slice(0, 3)} ${m.laboratory.roomCode}`).join(", ");

  const exportCsv = () => {
    try { downloadCsv(
      `ched-compliance_${ay?.label ?? "report"}${labRoom ? `_${labRoom}` : ""}`,
      rows.map((r) => ({
        "Class code": r.sectionCode,
        Subject: `${r.subject.code} ${r.subject.title}`,
        Faculty: r.faculty ?? "Unassigned",
        Meetings: meetings(r),
        "Required hours": r.compliance?.requiredHours ?? "",
        "Confirmed hours": r.compliance?.confirmedHoursTotal ?? "",
        "Hours remaining": r.compliance ? Math.max(0, r.compliance.requiredHours - r.compliance.confirmedHoursTotal) : "",
        Status: r.compliance ? STATUS_LABEL[r.compliance.status] : "",
        "Utilization % (confirmed sessions)": utilizationText(r.sectionId),
      })),
    ); } catch (error) { snackbar.error(error instanceof Error ? error.message : "Could not prepare the compliance CSV."); }
  };

  function openSection(section: CourseSectionSummary, element: HTMLElement) {
    setReturnFocus(element);
    setSelectedId(section.sectionId);
  }
  function clickRow(event: MouseEvent<HTMLElement>, section: CourseSectionSummary) {
    if ((event.target as HTMLElement).closest("button,a")) return;
    openSection(section, event.currentTarget.querySelector<HTMLButtonElement>(".ched-view") ?? event.currentTarget);
  }

  const periodLabel = ay ? semesterName(ay) : yearsFailed ? "Semester unavailable" : "Loading semester…";
  const termLabel = TERM_OPTIONS.find((t) => t.value === termFilter)!.label;
  const firstLoad = loading && sections.length === 0;

  return (
    <div className="ched-page">
      <header className="ched-heading">
        <p className="ched-eyebrow">ACADEMIC REPORTING / CHED COMPLIANCE</p>
        <h1>CHED Compliance Report</h1>
        <p>Review verified laboratory hours, workstation utilization, and compliance progress across course sections.</p>
      </header>

      {/* Shown only on paper: what this printout covers. */}
      <div className="ched-print-only ched-print-meta">
        <strong>{periodLabel}</strong> · {labRoom || "All laboratories"} · {termLabel} · Printed {new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
      </div>

      {/* Filters + actions */}
      <div className="ched-toolbar no-print ched-no-print" role="group" aria-label="Report filters">
        <div className="ched-filters">
          <SearchableSelect
            ariaLabel="Laboratory"
            value={labId === "" ? ALL : String(labId)}
            onValueChange={(v: string) => setLabId(v === ALL ? "" : Number(v))}
            options={[{ value: ALL, label: "All laboratories" }, ...labs.map((l) => ({ value: String(l.labId), label: l.roomCode }))]}
            leadingIcon={<FlaskConical size={15} />}
            searchPlaceholder="Search laboratories…"
          />
          <SearchableSelect
            ariaLabel="Classes"
            value={termFilter}
            onValueChange={(v: string) => { setTermFilter(v as TermFilter); setSelectedId(null); }}
            options={TERM_OPTIONS}
            leadingIcon={<Layers size={15} />}
            searchPlaceholder="Search…"
          />
          <SearchableSelect
            ariaLabel="Academic period"
            value={ayId === "" ? "" : String(ayId)}
            onValueChange={(v: string) => setAyId(v ? Number(v) : "")}
            options={years.map((y) => ({ value: String(y.ayId), label: `${semesterName(y)}${y.isActive ? " (active)" : ""}` }))}
            leadingIcon={<CalendarDays size={15} />}
            searchPlaceholder="Search semesters…"
          />
        </div>
        <div className="ched-actions">
          <button className="ched-btn" onClick={exportCsv} disabled={rows.length === 0}>
            <FileSpreadsheet size={14} /> Export CSV
          </button>
          <button className="ched-btn is-primary" onClick={() => window.print()}>
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      <div className={`ched-layout ${selected && wide ? "has-inspector" : ""}`}>
        <section className="ched-workspace" aria-labelledby="ched-overview-heading">
          {/* Overview strip */}
          <div className="ched-overview">
            {firstLoad ? (
              <div className="ched-overview-skeleton" role="status"><span className="sr-only">Loading compliance overview</span><span /><span /></div>
            ) : sectionsFailed ? (
              <div className="ched-overview-row">
                <h2 id="ched-overview-heading">Compliance overview</h2>
                <span className="ched-muted">Unavailable — the report could not be loaded</span>
              </div>
            ) : (
              <>
                <div className="ched-overview-row">
                  <div className="ched-overview-title">
                    <h2 id="ched-overview-heading">
                      <strong>{totals.classes}</strong> Course {totals.classes === 1 ? "Section" : "Sections"}
                    </h2>
                    <span className="ched-overview-scope">{periodLabel}{labRoom ? ` · ${labRoom}` : ""}{termFilter !== "all" ? ` · ${termLabel}` : ""}</span>
                  </div>
                  <ul className="ched-legend" aria-label="Compliance status counts">
                    <li className="is-ok"><i />Compliant <b>{totals.compliant}</b></li>
                    <li className="is-risk"><i />At Risk <b>{totals.atRisk}</b></li>
                    <li className="is-non"><i />Non-Compliant <b>{totals.non}</b></li>
                    {totals.noRecord > 0 && <li className="is-none"><i />No record <b>{totals.noRecord}</b></li>}
                  </ul>
                </div>
              </>
            )}
          </div>

          {utilFailed && !sectionsFailed && (
            <div className="ched-note no-print ched-no-print" role="alert">
              <CircleAlert size={14} />
              <p>Utilization figures could not be loaded. Hours and compliance status are unaffected.</p>
              <button onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
            </div>
          )}

          {sectionsFailed ? (
            <div className="ched-state" role="alert">
              <CircleAlert size={28} />
              <h3>The compliance report could not be loaded</h3>
              <p>Check the connection to the LabTrack server and try again. Your filters have been kept.</p>
              <button onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
            </div>
          ) : firstLoad ? (
            <div className="ched-skeleton" role="status">
              <span className="sr-only">Loading course sections</span>
              {Array.from({ length: 6 }, (_, i) => <div key={i} aria-hidden="true"><span /><span /><span /><span /></div>)}
            </div>
          ) : rows.length === 0 ? (
            <div className="ched-state">
              <ShieldCheck size={28} />
              <h3>No course sections to report</h3>
              <p>
                {!ayId && !yearsFailed ? "No semester has been set up yet." : labRoom ? `No classes meet in ${labRoom} this semester.` : "No classes for this semester."}
                {termFilter !== "all" && " Try showing all classes."}
              </p>
            </div>
          ) : (
            <div className={loading ? "ched-dim" : undefined}>
              <div className="ched-table-scroll">
                <table className="ched-table">
                  <caption className="sr-only">CHED compliance by course section: confirmed against required laboratory hours, utilization, and status</caption>
                  <thead>
                    <tr>
                      <th scope="col">Class</th>
                      <th scope="col">Subject</th>
                      <th scope="col">Faculty</th>
                      <th scope="col">Meetings</th>
                      <th scope="col">Confirmed / Required hours</th>
                      <th scope="col" className="is-num">Remaining</th>
                      <th scope="col">
                        <span className="ched-th-help" title={UTIL_HELP}>Utilization <Info size={11} /></span>
                      </th>
                      <th scope="col">Status</th>
                      <th scope="col" className="no-print ched-no-print"><span className="sr-only">View details</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const c = r.compliance;
                      const isSel = selectedId === r.sectionId;
                      return (
                        <tr key={r.sectionId} className={isSel ? "is-selected" : ""} onClick={(e) => clickRow(e, r)}>
                          <td><span className="ched-code">{r.sectionCode}</span></td>
                          <td>
                            <button className="ched-subject" onClick={(e) => openSection(r, e.currentTarget)}>
                              <small>{r.subject.code}</small>
                              {r.subject.title}
                            </button>
                          </td>
                          <td>{r.faculty ? <span className="ched-faculty">{r.faculty}</span> : <span className="ched-unassigned">Unassigned</span>}</td>
                          <td>
                            <div className="ched-meetings">
                              {r.meetings.map((m, i) => (
                                <span key={i}>{m.dayOfWeek.slice(0, 3)} <b>{m.laboratory.roomCode}</b></span>
                              ))}
                            </div>
                          </td>
                          <td><HoursCell compliance={c} /></td>
                          <td className="is-num">
                            {c ? <span className="ched-remaining">{Math.max(0, c.requiredHours - c.confirmedHoursTotal)}<small>h</small></span> : <span className="ched-none">—</span>}
                          </td>
                          <td><UtilCell u={utilization[r.sectionId]} failed={utilFailed} /></td>
                          <td><StatusBadge status={c?.status} /></td>
                          <td className="no-print ched-no-print">
                            <button className="ched-view" aria-label={`View details for class ${r.sectionCode}`} aria-expanded={isSel} onClick={(e) => openSection(r, e.currentTarget)}>
                              <Eye size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="ched-mobile-list no-print ched-no-print">
                {rows.map((r) => {
                  const c = r.compliance;
                  return (
                    <article key={r.sectionId} className={`ched-mobile-row ${selectedId === r.sectionId ? "is-selected" : ""}`}>
                      <button className="ched-mobile-title" onClick={(e) => openSection(r, e.currentTarget)}>
                        <span>
                          <small>{r.sectionCode} · {r.subject.code}</small>
                          <strong>{r.subject.title}</strong>
                        </span>
                        <StatusBadge status={c?.status} />
                      </button>
                      <HoursCell compliance={c} />
                      <dl>
                        <div><dt>Remaining</dt><dd>{c ? `${Math.max(0, c.requiredHours - c.confirmedHoursTotal)}h` : "—"}</dd></div>
                        <div><dt>Utilization</dt><dd>{utilizationText(r.sectionId)}</dd></div>
                      </dl>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          <footer className="ched-footer">
            <span><ShieldCheck size={13} /> Only laboratory hours from confirmed sessions count toward CHED compliance. Status is assigned by the system's compliance rules.</span>
          </footer>
        </section>

        <SectionInspector
          section={selected}
          util={selected ? utilization[selected.sectionId] : undefined}
          utilFailed={utilFailed}
          periodLabel={periodLabel}
          wide={wide}
          returnFocus={returnFocus}
          onClose={() => setSelectedId(null)}
        />
      </div>
    </div>
  );
}

/* ───────────────────────── Cells ───────────────────────── */

function HoursCell({ compliance: c }: { compliance: CourseSectionSummary["compliance"] }) {
  if (!c) return <span className="ched-none" title="No compliance record yet">No record</span>;
  const pct = verifiedPercent(c);
  return (
    <div className="ched-hours">
      <div className="ched-hours-value">
        <strong>{c.confirmedHoursTotal}</strong> / {c.requiredHours} h
      </div>
      <ProgressBar pct={pct} />
      <small>{pct === null ? "Required hours not set" : `${fmtPct(pct)}% completed`}</small>
    </div>
  );
}

/** Laboratory-hour completion. Same gold for every row: it shows hours, not compliance status. */
function ProgressBar({ pct, large = false }: { pct: number | null; large?: boolean }) {
  const width = pct === null || !Number.isFinite(pct) ? 0 : clamp(pct);
  return (
    <div className={`ched-bar${large ? " is-large" : ""}`} aria-hidden="true">
      {width > 0 && <span style={{ width: `${width}%` }} />}
    </div>
  );
}

function UtilCell({ u, failed }: { u: SectionUtilization | undefined; failed: boolean }) {
  if (!u || u.utilizationPercent === null) {
    // "—" means no figure (no confirmed physical session yet, or the load failed); a real 0% is shown as 0%.
    return <span className="ched-none" title={failed ? "Utilization could not be loaded" : "No confirmed physical sessions yet"}>—</span>;
  }
  const pct = Math.round(u.utilizationPercent);
  return (
    <div className="ched-util" title={UTIL_HELP}>
      <div className="ched-util-value">
        <strong>{pct}%</strong>
      </div>
      <small>{u.confirmedSessions} confirmed {u.confirmedSessions === 1 ? "session" : "sessions"}</small>
    </div>
  );
}

function StatusBadge({ status }: { status: Status | undefined }) {
  if (!status) return <span className="ched-status is-none"><i />No record</span>;
  return <span className={`ched-status is-${status}`}><i />{STATUS_DISPLAY[status]}</span>;
}

/* ───────────────────────── Inspector ───────────────────────── */

function SectionInspector({
  section,
  util,
  utilFailed,
  periodLabel,
  wide,
  returnFocus,
  onClose,
}: {
  section: CourseSectionSummary | null;
  util: SectionUtilization | undefined;
  utilFailed: boolean;
  periodLabel: string;
  wide: boolean;
  returnFocus: HTMLElement | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = section !== null;

  useEffect(() => {
    if (!open) return;
    if (!wide) closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, wide, onClose]);

  useEffect(() => {
    if (!open && returnFocus?.isConnected) returnFocus.focus();
  }, [open, returnFocus]);

  if (!section) return null;
  const c = section.compliance;
  const pct = verifiedPercent(c);

  const panel = (
    <aside className={`ched-inspector no-print ched-no-print ${wide ? "is-inline" : "is-drawer"}`} aria-label="Course section details" role={wide ? undefined : "dialog"} aria-modal={wide ? undefined : true}>
      <div className="ched-inspector-heading">
        <div>
          <p className="ched-eyebrow">CLASS {section.sectionCode}</p>
          <h2>{section.subject.title}</h2>
          <p>{section.subject.code}{section.term ? ` · ${section.term}` : ""}</p>
        </div>
        <button ref={closeRef} aria-label="Close section details" onClick={onClose}><X size={16} /></button>
      </div>

      <div className="ched-inspector-body">
        <dl className="ched-facts">
          <div><dt><UserRound size={12} /> Faculty</dt><dd>{section.faculty ?? <span className="ched-unassigned">Unassigned</span>}</dd></div>
          <div><dt><CalendarDays size={12} /> Period</dt><dd>{periodLabel}</dd></div>
          <div><dt><ShieldCheck size={12} /> Status</dt><dd><StatusBadge status={c?.status} /></dd></div>
        </dl>

        <div className="ched-card">
          <h4><Clock size={14} /> Laboratory hours</h4>
          {c ? (
            <>
              <p className="ched-big">
                <strong>{c.confirmedHoursTotal}</strong>
                <span>of {c.requiredHours} required hours confirmed</span>
              </p>
              <ProgressBar pct={pct} large />
              <dl>
                <div><dt>Completed</dt><dd>{pct === null ? "—" : `${fmtPct(pct)}%`}</dd></div>
                <div><dt>Remaining required</dt><dd>{Math.max(0, c.requiredHours - c.confirmedHoursTotal)} hours</dd></div>
              </dl>
              <small className="ched-card-note">Remaining required hours are not the same as the projected deficit used for remedial recommendations (see At Risk).</small>
            </>
          ) : (
            <p className="ched-card-empty">This class has no compliance record yet, so it is not classified.</p>
          )}
        </div>

        <div className="ched-card">
          <h4><Gauge size={14} /> Workstation utilization</h4>
          {util && util.utilizationPercent !== null ? (
            <>
              <p className="ched-big">
                <strong>{Math.round(util.utilizationPercent)}%</strong>
                <span>average over {util.confirmedSessions} confirmed {util.confirmedSessions === 1 ? "session" : "sessions"}</span>
              </p>
            </>
          ) : (
            <p className="ched-card-empty">{utilFailed ? "Utilization could not be loaded." : "No confirmed physical sessions yet."}</p>
          )}
          <small className="ched-card-note">{UTIL_HELP}</small>
        </div>

        <div className="ched-card">
          <h4><MapPin size={14} /> Scheduled lab meetings</h4>
          {section.meetings.length ? (
            <ul className="ched-meeting-list">
              {section.meetings.map((m, i) => (
                <li key={i}><span>{m.dayOfWeek}</span><b>{m.laboratory.roomCode}</b></li>
              ))}
            </ul>
          ) : (
            <p className="ched-card-empty">No lab meetings scheduled.</p>
          )}
        </div>

        <div className="ched-links">
          <Link to={`/courses/${section.sectionId}`}>Course records</Link>
        </div>
      </div>
    </aside>
  );

  if (wide) return panel;
  return (
    <div className="ched-drawer-root no-print ched-no-print">
      <div className="ched-drawer-overlay" onClick={onClose} aria-hidden="true" />
      {panel}
    </div>
  );
}
