import { Link } from "react-router-dom";
import { useMemo, useState, type MouseEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpDown, BookOpen, ChevronRight, CircleAlert, Eye, GraduationCap, ListFilter, RefreshCw, Search, X } from "lucide-react";
import { useRole, canAccess } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { Restricted } from "@/components/Restricted";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CourseDetailsDrawer } from "@/components/courses/CourseDetailsDrawer";
import { CourseProgress, CourseStatusBadge, courseProgress, courseStatusLabels, hoursLabel, type CourseStatus } from "@/components/courses/CourseProgress";
import { getCourseSections, type CourseSectionSummary } from "@/api/courseSections";
import { getAcademicYears, semesterName } from "@/api/academicYears";
import "./courses.css";

type StatusFilter = "all" | CourseStatus;
type SortKey = "subject" | "section" | "progress" | "status";
const EMPTY_SECTIONS: CourseSectionSummary[] = [];
const statusOrder: Record<CourseStatus, number> = { NonCompliant: 0, AtRisk: 1, Compliant: 2, Unassessed: 3 };
const navigation: { value: StatusFilter; label: string }[] = [{ value: "all", label: "All Sections" }, { value: "Compliant", label: "Compliant" }, { value: "AtRisk", label: "At Risk" }, { value: "NonCompliant", label: "Non-Compliant" }];
const statusOptions = [{ value: "all" as StatusFilter, label: "All statuses" }, ...Object.entries(courseStatusLabels).map(([value, label]) => ({ value: value as StatusFilter, label }))];
const sortOptions: { value: SortKey; label: string }[] = [{ value: "subject", label: "Subject A–Z" }, { value: "section", label: "Section code" }, { value: "progress", label: "Progress: highest first" }, { value: "status", label: "Compliance priority" }];

export function CoursesPage() {
  const { role } = useRole();
  const { user } = useAuth();
  const allowed = canAccess(role, "/courses");
  const [academicYearId, setAcademicYearId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("subject");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  const queryClient = useQueryClient();
  const prefix = ["courses-workspace", user?.userId, role] as const;
  const yearsQuery = useQuery({ queryKey: [...prefix, "academic-years"], queryFn: getAcademicYears, enabled: allowed, staleTime: 60_000, retry: false });
  const sectionsQuery = useQuery({ queryKey: [...prefix, "sections", academicYearId], queryFn: () => getCourseSections(academicYearId === null ? undefined : { ayId: academicYearId }), enabled: allowed, staleTime: 60_000, retry: false });
  const sections = sectionsQuery.data ?? EMPTY_SECTIONS;
  const activeYear = yearsQuery.data?.find((year) => year.isActive);
  const selectedYear = yearsQuery.data?.find((year) => year.ayId === academicYearId) ?? (academicYearId === null ? activeYear : undefined);
  const yearOptions = (yearsQuery.data ?? []).map((year) => ({ value: String(year.ayId), label: semesterName(year), description: year.isActive ? "Current active semester" : "Registered academic period" }));
  if (!yearOptions.length) yearOptions.push({ value: "active", label: "Active semester", description: "The API's default academic period" });
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return sections.filter((section) => (status === "all" || (section.compliance?.status ?? "Unassessed") === status)
      && (!query || [section.sectionCode, section.subject.code, section.subject.title, section.faculty ?? ""].some((value) => value.toLocaleLowerCase().includes(query))))
      .sort((a, b) => {
        let result = 0;
        if (sort === "subject") result = a.subject.title.localeCompare(b.subject.title, undefined, { sensitivity: "base" });
        if (sort === "section") result = a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true });
        if (sort === "progress") { const left = courseProgress(a.compliance).percent, right = courseProgress(b.compliance).percent; result = left === null ? right === null ? 0 : 1 : right === null ? -1 : right - left; }
        if (sort === "status") result = statusOrder[a.compliance?.status ?? "Unassessed"] - statusOrder[b.compliance?.status ?? "Unassessed"];
        return result || a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true });
      });
  }, [sections, search, status, sort]);
  const selectedSection = selectedId === null ? null : sections.find((section) => section.sectionId === selectedId) ?? null;
  const hasFilters = search.trim() !== "" || status !== "all" || academicYearId !== null || sort !== "subject";
  function openSection(section: CourseSectionSummary, element: HTMLElement) { setReturnFocus(element); setSelectedId(section.sectionId); }
  function clickRow(event: MouseEvent<HTMLTableRowElement>, section: CourseSectionSummary) {
    if ((event.target as HTMLElement).closest("a,button")) return;
    openSection(section, event.currentTarget.querySelector<HTMLButtonElement>(".course-preview-button") ?? event.currentTarget);
  }
  function resetFilters() { setSearch(""); setStatus("all"); setSort("subject"); setAcademicYearId(null); setSelectedId(null); }
  function changeYear(value: string) { setAcademicYearId(value === "active" ? null : Number(value)); setSelectedId(null); }
  if (!allowed) return <Restricted path="/courses" title="Courses is restricted" />;

  return <div className="courses-page">
    <header className="courses-heading"><div><p className="course-eyebrow">Academic management / Course sections</p><h1>Courses</h1><p>Monitor laboratory course sections, verified hours, and CHED compliance progress.</p></div>
      <button type="button" className="courses-refresh" onClick={() => void queryClient.invalidateQueries({ queryKey: prefix })} disabled={sectionsQuery.isFetching || yearsQuery.isFetching}><RefreshCw size={15} className={sectionsQuery.isFetching ? "course-spin" : ""} />Refresh</button></header>

    <nav className="course-status-navigation" aria-label="Filter course sections by compliance">{navigation.map((filter) => <button type="button" key={filter.value} aria-pressed={status === filter.value} className={status === filter.value ? "is-active" : ""} onClick={() => setStatus(filter.value)}>
      {filter.label}{sectionsQuery.isSuccess && <span>{filter.value === "all" ? sections.length : sections.filter((section) => section.compliance?.status === filter.value).length}</span>}</button>)}</nav>

    <section className="courses-workspace" aria-labelledby="courses-table-heading">
      <div className="courses-toolbar"><label className="courses-search"><Search size={17} /><span className="sr-only">Search course sections</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search section, subject, or faculty…" aria-label="Search course sections" />{search && <button type="button" aria-label="Clear course search" onClick={() => setSearch("")}><X size={15} /></button>}</label>
        <SearchableSelect ariaLabel="Filter academic year" className="courses-year-select" value={String(academicYearId ?? activeYear?.ayId ?? "active")} onValueChange={changeYear} options={yearOptions} leadingIcon={<GraduationCap size={16} />} searchPlaceholder="Search academic periods…" disabled={yearsQuery.isPending || yearsQuery.isError} />
        <SearchableSelect ariaLabel="Filter compliance status" value={status} onValueChange={setStatus} options={statusOptions} leadingIcon={<ListFilter size={15} />} searchPlaceholder="Search statuses…" />
        <SearchableSelect ariaLabel="Sort course sections" value={sort} onValueChange={setSort} options={sortOptions} leadingIcon={<ArrowUpDown size={15} />} searchPlaceholder="Search sorting options…" />
      </div>
      {yearsQuery.isError && <div className="courses-period-error" role="status">Academic-year options could not be loaded. The current selection's course records remain available.<button type="button" onClick={() => void yearsQuery.refetch()}>Retry academic years</button></div>}
      <div className="courses-table-heading"><div><h2 id="courses-table-heading">Course sections</h2><span role="status">{sectionsQuery.isPending ? "Loading sections…" : sectionsQuery.isError ? "Records unavailable" : `${filtered.length} matching ${filtered.length === 1 ? "section" : "sections"}`}</span></div><div className="courses-table-context"><span>{selectedYear ? semesterName(selectedYear) : academicYearId === null ? "Active semester" : "Selected academic period"}</span>{hasFilters && <button type="button" onClick={resetFilters}>Reset filters</button>}</div></div>

      {sectionsQuery.isError ? <div className="course-page-state" role="alert"><CircleAlert size={28} /><h3>Course sections could not be loaded</h3><p>Please retry. Your filters have been preserved.</p><button type="button" onClick={() => void sectionsQuery.refetch()}>Try again</button></div>
        : sectionsQuery.isPending ? <div className="courses-skeleton" role="status"><span className="sr-only">Loading course sections</span>{Array.from({ length: 6 }, (_, index) => <div key={index} aria-hidden="true"><span /><span /><span /></div>)}</div>
        : filtered.length === 0 ? <div className="course-page-state"><BookOpen size={29} /><h3>{sections.length ? "No matching course sections" : "No course sections found"}</h3><p>{sections.length ? "Try another search, compliance status, or academic period." : "Course sections for this academic period will appear here when available."}</p>{hasFilters && <button type="button" onClick={resetFilters}>Reset filters</button>}</div>
        : <>
          <div className="courses-table-scroll"><table className="courses-table"><caption className="sr-only">Course sections, faculty assignments, verified laboratory hours, and backend compliance status</caption><thead><tr><th scope="col">Section code</th><th scope="col">Subject / course</th><th scope="col">Assigned faculty</th><th scope="col">Academic year</th><th scope="col">Verified hours</th><th scope="col">Compliance progress</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Row actions</span></th></tr></thead><tbody>
            {filtered.map((section) => { const progress = courseProgress(section.compliance); return <tr key={section.sectionId} className={selectedId === section.sectionId ? "is-selected" : ""} onClick={(event) => clickRow(event, section)}>
              <td><Link className="course-code-link" to={`/courses/${section.sectionId}`}>{section.sectionCode}</Link><small className="course-term-label">{section.term}</small></td>
              <td><button type="button" className="course-subject-button" onClick={(event) => openSection(section, event.currentTarget)}><strong>{section.subject.title}</strong><span>{section.subject.code}</span></button></td>
              <td><span className={`course-faculty ${section.faculty ? "" : "course-unassigned"}`}>{section.faculty ?? "Not assigned"}</span></td><td><span className="course-year-label">{section.academicYear}</span></td>
              <td><span className="course-row-hours"><strong>{hoursLabel(progress.confirmed)}</strong><span>/ {hoursLabel(progress.required)}</span></span><small className="course-unit-label">confirmed / required</small></td>
              <td><CourseProgress compliance={section.compliance} /></td><td><CourseStatusBadge status={section.compliance?.status} /></td>
              <td><button type="button" className="course-preview-button" aria-label={`Preview section ${section.sectionCode}`} onClick={(event) => openSection(section, event.currentTarget)}><Eye size={17} /></button></td>
            </tr>; })}
          </tbody></table></div>

          <div className="courses-mobile-list">{filtered.map((section) => <article key={section.sectionId} className={`course-mobile-row ${selectedId === section.sectionId ? "is-selected" : ""}`}><div className="course-mobile-title"><button type="button" onClick={(event) => openSection(section, event.currentTarget)}><small>{section.subject.code}</small><strong>{section.subject.title}</strong></button><CourseStatusBadge status={section.compliance?.status} /></div>
            <p className="course-mobile-faculty">{section.faculty ?? "Faculty not assigned"} <span>· {section.academicYear}</span></p><CourseProgress compliance={section.compliance} showHours />
            <div className="course-mobile-actions"><Link to={`/courses/${section.sectionId}`}>Section {section.sectionCode}</Link><button type="button" aria-label={`Preview section ${section.sectionCode}`} onClick={(event) => openSection(section, event.currentTarget)}>View details<ChevronRight size={14} /></button></div></article>)}</div>
        </>}
      <footer className="courses-workspace-footer"><span><BookOpen size={13} />Verified hours use the existing confirmed-hours record.</span><span>Status is supplied by the backend.</span></footer>
    </section>
    <CourseDetailsDrawer section={selectedSection} onClose={() => setSelectedId(null)} returnFocusElement={returnFocus} />
  </div>;
}
