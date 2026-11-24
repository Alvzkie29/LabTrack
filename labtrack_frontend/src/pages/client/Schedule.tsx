import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpenText, CalendarDays, CircleAlert, RefreshCw, Search, Upload, UserRoundX, X } from "lucide-react";
import { getCourseSections, updateSectionFaculty, type CourseSectionSummary } from "@/api/courseSections";
import { getLaboratories, type LaboratorySummary } from "@/api/laboratories";
import { getFacultyOptions, type FacultyOption } from "@/api/sessionConfirmations";
import { getAcademicYears, semesterName, type AcademicYear } from "@/api/academicYears";
import { useRole, canAccess } from "@/contexts/RoleContext";
import { ApiError } from "@/api/client";
import { snackbar } from "@/utils/snackbar";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { conflictsByMeeting, filterSections, findConflicts } from "./schedule/scheduleUtils";
import { SectionDirectory } from "./schedule/SectionDirectory";
import { SectionDetails, type SaveStatus } from "./schedule/SectionDetails";
import type { OptionsState } from "./schedule/FacultyPicker";
import "./schedule.css";

type LoadState = "loading" | "ready" | "error";

function useMedia(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function SchedulePage() {
  const { role } = useRole();
  const canAssign = role === "Custodian" || role === "Administrator";
  const canImport = canAccess(role, "/imports");
  const narrow = useMedia("(max-width: 899px)");

  /* ── Academic period ─────────────────────────────────── */
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearsState, setYearsState] = useState<LoadState>("loading");
  // undefined = not decided yet; null = semester list unavailable, so use the API's default (active) semester.
  const [ayId, setAyId] = useState<number | null | undefined>(undefined);
  const ayIdRef = useRef(ayId);
  ayIdRef.current = ayId;

  useEffect(() => {
    getAcademicYears()
      .then((ys) => {
        setYears(ys);
        setYearsState("ready");
        setAyId((ys.find((y) => y.isActive) ?? ys[0])?.ayId ?? null);
      })
      .catch(() => {
        setYearsState("error");
        setAyId(null);
      });
  }, []);

  /* ── Course sections (one period at a time) ──────────── */
  const [sections, setSections] = useState<CourseSectionSummary[]>([]);
  const [sectionsState, setSectionsState] = useState<LoadState>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);
  const fetchSections = useCallback(
    (id: number | null | undefined) => (id == null ? getCourseSections() : getCourseSections({ ayId: id })),
    [],
  );

  useEffect(() => {
    if (ayId === undefined) return;
    const req = ++requestId.current;
    setSections([]); // never show one semester's sections under another's label
    setSectionsState("loading");
    fetchSections(ayId)
      .then((rows) => {
        if (req !== requestId.current) return;
        setSections(rows);
        setSectionsState("ready");
      })
      .catch(() => {
        if (req === requestId.current) setSectionsState("error");
      });
  }, [ayId, reloadKey, fetchSections]);

  /* ── Labs + faculty options ──────────────────────────── */
  const [labs, setLabs] = useState<LaboratorySummary[]>([]);
  useEffect(() => {
    getLaboratories().then(setLabs).catch(() => setLabs([]));
  }, []);

  const [faculty, setFaculty] = useState<FacultyOption[]>([]);
  const [facultyState, setFacultyState] = useState<OptionsState>("loading");
  const [facultyKey, setFacultyKey] = useState(0);
  useEffect(() => {
    if (!canAssign) return;
    setFacultyState("loading");
    getFacultyOptions()
      .then((f) => { setFaculty(f); setFacultyState("ready"); })
      .catch(() => setFacultyState("error"));
  }, [canAssign, facultyKey]);

  /* ── Filters ─────────────────────────────────────────── */
  const [search, setSearch] = useState("");
  const [labFilter, setLabFilter] = useState<number | "all">("all");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  // A section just saved stays listed even if it no longer matches "No faculty yet", until filters change.
  const [stickyId, setStickyId] = useState<number | null>(null);
  useEffect(() => setStickyId(null), [search, labFilter, onlyUnassigned, ayId]);

  const filtered = useMemo(() => {
    const rows = filterSections(sections, { search, labId: labFilter, onlyUnassigned });
    if (stickyId === null || rows.some((s) => s.sectionId === stickyId)) return rows;
    const sticky = sections.find((s) => s.sectionId === stickyId);
    return sticky ? filterSections([...rows, sticky], { search: "", labId: "all", onlyUnassigned: false }) : rows;
  }, [sections, search, labFilter, onlyUnassigned, stickyId]);

  const unassignedCount = useMemo(() => sections.filter((s) => !s.facultyId).length, [sections]);
  const conflictMap = useMemo(() => conflictsByMeeting(findConflicts(sections)), [sections]);
  const labCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of sections) for (const id of new Set(s.meetings.map((m) => m.laboratory?.labId))) if (id != null) map.set(id, (map.get(id) ?? 0) + 1);
    return map;
  }, [sections]);

  /* ── Selection ───────────────────────────────────────── */
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = selectedId === null ? null : filtered.find((s) => s.sectionId === selectedId) ?? null;
  // If filters hide the selected section, drop the selection instead of showing stale details.
  useEffect(() => {
    if (selectedId !== null && sectionsState === "ready" && !filtered.some((s) => s.sectionId === selectedId)) setSelectedId(null);
  }, [filtered, selectedId, sectionsState]);

  /* ── Faculty drafts + saving ─────────────────────────── */
  const [drafts, setDrafts] = useState<Record<number, string | null>>({});
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const savingRef = useRef<Set<number>>(new Set());
  const [status, setStatus] = useState<Record<number, SaveStatus>>({});
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  useEffect(() => {
    // New semester: start clean.
    setSelectedId(null);
    setDrafts({});
    setStatus({});
  }, [ayId]);

  const setRowStatus = (id: number, value: SaveStatus | null, clearAfter?: number) => {
    clearTimeout(timers.current[id]);
    setStatus((prev) => {
      const next = { ...prev };
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });
    if (value && clearAfter) timers.current[id] = setTimeout(() => setRowStatus(id, null), clearAfter);
  };

  const setDraft = (id: number, facultyId: string | null) => {
    const saved = sections.find((s) => s.sectionId === id)?.facultyId ?? null;
    setDrafts((prev) => {
      const next = { ...prev };
      if (facultyId === saved) delete next[id];
      else next[id] = facultyId;
      return next;
    });
    setRowStatus(id, null);
  };

  const revert = (id: number) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setRowStatus(id, null);
  };

  const save = async (id: number) => {
    if (!(id in drafts) || savingRef.current.has(id)) return; // nothing to save, or already saving
    const facultyId = drafts[id];
    savingRef.current.add(id);
    setSaving(new Set(savingRef.current));
    setRowStatus(id, null);
    try {
      await updateSectionFaculty(id, facultyId);
      // Confirmed by the server: show it, keep the section selected and listed, then reconcile.
      const picked = faculty.find((f) => f.id === facultyId);
      setSections((prev) => prev.map((s) => (s.sectionId === id ? { ...s, facultyId, faculty: facultyId ? picked?.fullName ?? s.faculty : null } : s)));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setStickyId(id);
      setRowStatus(id, null);
      snackbar.success(`Faculty assignment saved for section ${sections.find((section) => section.sectionId === id)?.sectionCode ?? id}.`);
      const req = ++requestId.current;
      fetchSections(ayIdRef.current)
        .then((rows) => {
          if (req !== requestId.current) return;
          setSections(rows);
          setSectionsState("ready");
        })
        .catch(() => {
          if (req === requestId.current) setSectionsState("ready"); // keep the confirmed value already shown
        });
    } catch (e) {
      snackbar.error(e instanceof ApiError ? e.message : "The server did not accept the faculty change.");
      setRowStatus(id, { kind: "error", message: e instanceof ApiError ? e.message : "The server did not accept the change." });
    } finally {
      savingRef.current.delete(id);
      setSaving(new Set(savingRef.current));
    }
  };

  /* ── Labels ──────────────────────────────────────────── */
  const ay = years.find((y) => y.ayId === ayId);
  const periodLabel = ay ? semesterName(ay) : yearsState === "loading" ? "Loading semester…" : "Current semester";
  const hasFilters = search.trim() !== "" || labFilter !== "all" || onlyUnassigned;
  const clearFilters = () => { setSearch(""); setLabFilter("all"); setOnlyUnassigned(false); };
  const unsavedIds = useMemo(() => new Set(Object.keys(drafts).map(Number)), [drafts]);

  /* ── Panels ──────────────────────────────────────────── */
  const directoryBody =
    sectionsState === "error" ? (
      <div className="sch-state" role="alert">
        <CircleAlert size={26} />
        <h3>Course sections could not be loaded</h3>
        <p>This is a connection or server problem, not an empty schedule.</p>
        <button type="button" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
      </div>
    ) : sectionsState === "loading" ? (
      <div className="sch-skeleton" role="status">
        <span className="sr-only">Loading course sections</span>
        {Array.from({ length: 6 }, (_, i) => <div key={i} aria-hidden="true"><span /><span /><span /></div>)}
      </div>
    ) : sections.length === 0 ? (
      <div className="sch-state">
        <Upload size={26} />
        <h3>No imported schedule</h3>
        <p>No course sections have been imported for {periodLabel}. LabTrack does not create schedules; they come from the Custodian's import.</p>
        {canImport && <Link to="/imports" className="sch-state-link">Go to Imports</Link>}
      </div>
    ) : filtered.length === 0 ? (
      <div className="sch-state">
        <Search size={24} />
        <h3>{onlyUnassigned && unassignedCount === 0 ? "Every section has a faculty" : "No matching sections"}</h3>
        <p>{onlyUnassigned && unassignedCount === 0 ? "No section in this semester is waiting for a faculty assignment." : "Try another section code, subject, faculty name, or laboratory."}</p>
        <button type="button" onClick={clearFilters}>Clear filters</button>
      </div>
    ) : (
      <SectionDirectory sections={filtered} selectedId={selectedId} labFilter={labFilter} unsavedIds={unsavedIds} onSelect={setSelectedId} />
    );

  const details = selected ? (
    <SectionDetails
      key={selected.sectionId}
      section={selected}
      periodLabel={periodLabel}
      labs={labs}
      labFilter={labFilter}
      conflictMap={conflictMap}
      canAssign={canAssign}
      faculty={faculty}
      facultyState={facultyState}
      draft={selected.sectionId in drafts ? drafts[selected.sectionId] : undefined}
      saving={saving.has(selected.sectionId)}
      status={status[selected.sectionId]}
      onDraft={(id) => setDraft(selected.sectionId, id)}
      onSave={() => void save(selected.sectionId)}
      onRevert={() => revert(selected.sectionId)}
      onRetryOptions={() => setFacultyKey((k) => k + 1)}
      onBack={narrow ? () => setSelectedId(null) : undefined}
    />
  ) : (
    <div className="sch-empty-select">
      <span><BookOpenText size={22} /></span>
      <h3>Select a course section</h3>
      <p>Choose a section from the left to view its imported schedule and faculty assignment.</p>
    </div>
  );

  const showDetailsOnly = narrow && selected !== null;

  return (
    <div className="sch-page">
      <header className="sch-heading">
        <div>
          <p className="sch-eyebrow">ACADEMIC MANAGEMENT / LABORATORY SCHEDULE</p>
          <h1>
            Schedule
            {sectionsState === "ready" && <span className="sch-count">· {sections.length} Course {sections.length === 1 ? "Section" : "Sections"}</span>}
          </h1>
          <p>Review imported laboratory schedules and manage faculty assignments.</p>
        </div>
        <button className="sch-refresh" onClick={() => setReloadKey((k) => k + 1)} disabled={sectionsState === "loading" || ayId === undefined}>
          <RefreshCw size={14} className={sectionsState === "loading" ? "sch-spin" : ""} /> Refresh
        </button>
      </header>

      <div className="sch-split">
        {!showDetailsOnly && (
          <section className="sch-dir" aria-label="Course section directory">
            <div className="sch-dir-tools">
              {yearsState === "ready" && years.length > 0 ? (
                <SearchableSelect
                  ariaLabel="Academic period"
                  value={ayId == null ? "" : String(ayId)}
                  onValueChange={(v: string) => setAyId(v ? Number(v) : null)}
                  options={years.map((y) => ({ value: String(y.ayId), label: `${semesterName(y)}${y.isActive ? " (active)" : ""}` }))}
                  leadingIcon={<CalendarDays size={15} />}
                  searchPlaceholder="Search semesters…"
                />
              ) : (
                <span className="sch-period-text"><CalendarDays size={14} /> {periodLabel}</span>
              )}

              <label className="sch-search">
                <Search size={15} />
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Section, subject or faculty…" aria-label="Search course sections" />
                {search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")}><X size={13} /></button>}
              </label>

              <div className="sch-labs" role="group" aria-label="Laboratory">
                <button type="button" className={labFilter === "all" ? "is-active" : ""} aria-pressed={labFilter === "all"} onClick={() => setLabFilter("all")}>
                  All labs
                </button>
                {labs.map((l) => (
                  <button key={l.labId} type="button" className={labFilter === l.labId ? "is-active" : ""} aria-pressed={labFilter === l.labId} onClick={() => setLabFilter(l.labId)} title={l.name}>
                    {l.roomCode} <span>{labCounts.get(l.labId) ?? 0}</span>
                  </button>
                ))}
              </div>

              <div className="sch-dir-sub">
                <button type="button" className={`sch-toggle ${onlyUnassigned ? "is-on" : ""}`} aria-pressed={onlyUnassigned} onClick={() => setOnlyUnassigned((v) => !v)}>
                  <UserRoundX size={13} /> No faculty yet <span>{sectionsState === "ready" ? unassignedCount : "–"}</span>
                </button>
                <span className="sch-dir-count-label" role="status">
                  {sectionsState === "ready" ? `${filtered.length} of ${sections.length}` : ""}
                  {hasFilters && <button type="button" onClick={clearFilters}>Clear</button>}
                </span>
              </div>
            </div>
            {directoryBody}
          </section>
        )}

        {(!narrow || showDetailsOnly) && (
          <section className="sch-panel" aria-label="Selected course section">
            {details}
          </section>
        )}
      </div>
    </div>
  );
}
