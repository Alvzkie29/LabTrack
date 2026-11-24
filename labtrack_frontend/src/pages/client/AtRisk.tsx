import { Link } from "react-router-dom";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownWideNarrow, CircleAlert, Eye, GraduationCap, Info, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { useRole, canAccess } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { Restricted } from "@/components/Restricted";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getCourseSections, type CourseSectionSummary } from "@/api/courseSections";
import { getRemedialRecommendations, type RemedialRecommendationRow } from "@/api/remedial";
import { getAcademicYears, semesterName } from "@/api/academicYears";
import { RiskInspector } from "@/components/at-risk/RiskInspector";
import { availableNumber, displayNumber, latestRecommendation, recommendationDate, RiskProgress, RiskStatus, verifiedProgress } from "@/components/at-risk/risk-data";
import "./at-risk.css";

type Filter = "all" | "AtRisk" | "NonCompliant";
type Sort = "deficit" | "progress" | "subject" | "section" | "sessions";
const EMPTY_SECTIONS: CourseSectionSummary[] = [];
const filters: { value: Filter; label: string }[] = [{ value: "all", label: "All Flagged Sections" }, { value: "AtRisk", label: "At Risk" }, { value: "NonCompliant", label: "Non-Compliant" }];
const sortOptions: { value: Sort; label: string }[] = [{ value: "deficit", label: "Largest available deficit" }, { value: "progress", label: "Smallest compliance progress" }, { value: "subject", label: "Subject name A–Z" }, { value: "section", label: "Section code" }, { value: "sessions", label: "Most remedial sessions" }];
function compareAvailable(a: number | null, b: number | null, descending = true) { return a === null ? b === null ? 0 : 1 : b === null ? -1 : descending ? b - a : a - b; }

export function AtRiskPage() {
  const { role } = useRole(); const { user } = useAuth(); const allowed = canAccess(role, "/at-risk");
  const [filter, setFilter] = useState<Filter>("all"); const [sort, setSort] = useState<Sort>("deficit"); const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null); const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  const [wide, setWide] = useState(() => window.matchMedia("(min-width:1600px)").matches);
  useEffect(() => { const media = window.matchMedia("(min-width:1600px)"); const update = () => setWide(media.matches); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  const client = useQueryClient(); const prefix = ["risk-workspace", user?.userId, role];
  // Both endpoints use the same active-semester default; no historical records are mixed in.
  const sectionsQuery = useQuery({ queryKey: [...prefix, "sections"], queryFn: () => getCourseSections(), enabled: allowed, staleTime: 60_000, retry: false });
  const recQuery = useQuery({ queryKey: [...prefix, "recommendations"], queryFn: getRemedialRecommendations, enabled: allowed, staleTime: 60_000, retry: false });
  const yearsQuery = useQuery({ queryKey: [...prefix, "semester-label"], queryFn: getAcademicYears, enabled: allowed, staleTime: 60_000, retry: false });
  const sections = sectionsQuery.data ?? EMPTY_SECTIONS;
  const flagged = useMemo(() => sections.filter(s => s.compliance?.status === "AtRisk" || s.compliance?.status === "NonCompliant"), [sections]);
  const recommendationMap = useMemo(() => {
    const grouped = new Map<string, RemedialRecommendationRow[]>(); const counts = new Map<string, number>();
    for (const section of sections) counts.set(section.sectionCode, (counts.get(section.sectionCode) ?? 0) + 1);
    for (const rec of recQuery.data ?? []) { if (counts.get(rec.section) !== 1) continue; const list = grouped.get(rec.section) ?? []; list.push(rec); grouped.set(rec.section, list); }
    const latest = new Map<string, RemedialRecommendationRow>(); for (const [code, rows] of grouped) { const row = latestRecommendation(rows); if (row) latest.set(code, row); } return latest;
  }, [recQuery.data, sections]);
  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return flagged.filter(s => (filter === "all" || s.compliance?.status === filter) && [s.sectionCode, s.subject.code, s.subject.title, s.faculty ?? ""].some(value => value.toLocaleLowerCase().includes(query)))
      .sort((a, b) => {
const ar = recQuery.isError ? undefined : recommendationMap.get(a.sectionCode), br = recQuery.isError ? undefined : recommendationMap.get(b.sectionCode); let result = 0;
        if (sort === "deficit") result = compareAvailable(availableNumber(ar?.hourDeficit), availableNumber(br?.hourDeficit));
        if (sort === "sessions") result = compareAvailable(availableNumber(ar?.additionalSessionsNeeded), availableNumber(br?.additionalSessionsNeeded));
        if (sort === "progress") result = compareAvailable(verifiedProgress(a.compliance).percent, verifiedProgress(b.compliance).percent, false);
        if (sort === "subject") result = a.subject.title.localeCompare(b.subject.title, undefined, { sensitivity: "base" });
        if (sort === "section") result = a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true });
        return result || a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true });
});
  }, [flagged, filter, search, sort, recommendationMap, recQuery.isError]);
  const selected = selectedId === null ? null : flagged.find(s => s.sectionId === selectedId) ?? null;
  const missing = sections.filter(s => !s.compliance).length;
  const activeYear = yearsQuery.data?.find(y => y.isActive);
  const recUnavailable = recQuery.isPending ? "Loading recommendation…" : recQuery.isError ? "Unavailable — load failed" : "No recommendation";
  function openSection(section: CourseSectionSummary, element: HTMLElement) { setReturnFocus(element); setSelectedId(section.sectionId); }
  function clickRow(event: MouseEvent<HTMLTableRowElement>, section: CourseSectionSummary) { if ((event.target as HTMLElement).closest("button,a")) return; openSection(section, event.currentTarget.querySelector<HTMLButtonElement>(".risk-view") ?? event.currentTarget); }
  function reset() { setFilter("all"); setSearch(""); setSort("deficit"); setSelectedId(null); }
  const hasFilters = filter !== "all" || search.trim() !== "" || sort !== "deficit";
  if (!allowed) return <Restricted path="/at-risk" title="At Risk is restricted" />;
  return <div className="risk-page">
    <header className="risk-heading">
      <div>
        <p className="risk-eyebrow">CHED COMPLIANCE / INTERVENTION MONITORING</p>
        <div className="risk-heading-title">
          <h1>At Risk</h1>{sectionsQuery.isSuccess && <span className="risk-flag-count">{flagged.length} Flagged</span>}</div>
        <p>Identify course sections falling behind required laboratory hours and review recommended corrective actions.</p>
      </div>
      <button className="risk-refresh" onClick={() => void client.invalidateQueries({ queryKey: prefix })} disabled={sectionsQuery.isFetching || recQuery.isFetching}>
        <RefreshCw size={14} className={sectionsQuery.isFetching ? "risk-spin" : ""} /> Refresh</button>
    </header>
    <div className={`risk-layout ${selected && wide ? "has-inspector" : ""}`}>
      <section className="risk-workspace" aria-labelledby="risk-workspace-heading">
        <nav className="risk-status-nav" aria-label="Filter flagged sections">{filters.map(f =>
          <button key={f.value} className={filter === f.value ? "is-active" : ""} aria-pressed={filter === f.value} onClick={() => { setFilter(f.value); setSelectedId(null); }}>{f.label}{sectionsQuery.isSuccess && <span>{f.value === "all" ? flagged.length : flagged.filter(s => s.compliance?.status === f.value).length}</span>}</button>)}</nav>
        <div className="risk-toolbar">
          <label className="risk-search">
            <Search size={16} />
            <input type="search" aria-label="Search flagged sections" placeholder="Search section, subject, or faculty…" value={search} onChange={e => { setSearch(e.target.value); setSelectedId(null); }} />{search && <button aria-label="Clear flagged search" onClick={() => setSearch("")}>
              <X size={14} />
            </button>}</label>
          <SearchableSelect ariaLabel="Sort flagged sections" value={sort} onValueChange={setSort} options={sortOptions} leadingIcon={<ArrowDownWideNarrow size={15} />} searchPlaceholder="Search sorting options…" />
        </div>
        <div className="risk-table-context">
          <div>
            <h2 id="risk-workspace-heading">Intervention priorities</h2>
            <span role="status">{sectionsQuery.isPending ? "Loading flagged sections…" : sectionsQuery.isError ? "Records unavailable" : `${rows.length} matching ${rows.length === 1 ? "section" : "sections"}`}</span>
          </div>
          <span>
            <GraduationCap size={14} />{activeYear ? semesterName(activeYear) : "Current API semester"}</span>
        </div>
        {recQuery.isError && <div className="risk-data-note" role="alert">
          <CircleAlert size={14} />
          <p>Saved recommendations could not be loaded. Compliance records remain available.</p>
          <button onClick={() => void recQuery.refetch()}>Retry recommendations</button>
        </div>}
        {yearsQuery.isError && <div className="risk-data-note">
          <Info size={14} />
          <p>The semester label is unavailable. Records retain the API’s active-semester scope.</p>
          <button onClick={() => void yearsQuery.refetch()}>Retry label</button>
        </div>}
        {sectionsQuery.isError ? <div className="risk-page-state" role="alert">
          <CircleAlert size={29} />
          <h3>Flagged sections could not be loaded</h3>
          <p>Please retry. Your search and filters have been preserved.</p>
          <button onClick={() => void sectionsQuery.refetch()}>Try again</button>
        </div> : sectionsQuery.isPending ? <div className="risk-skeleton" role="status">
          <span className="sr-only">Loading compliance records</span>{Array.from({ length: 5 }, (_, i) =>
            <div key={i} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>)}</div> : rows.length === 0 ? <div className="risk-page-state">
              <ShieldCheck size={30} />
              <h3>{flagged.length ? "No matching flagged sections" : "No sections are currently flagged"}</h3>
              <p>{flagged.length ? "Try another subject, faculty name, section code, or status." : missing ? "Some sections have no compliance record yet. They are not classified as at risk." : "No At Risk or Non-Compliant records were returned for the current semester."}</p>{hasFilters && <button onClick={reset}>Reset filters</button>}</div> : <>
          <div className="risk-table-scroll">
            <table className="risk-table">
              <caption className="sr-only">Flagged course sections, verified CHED hours, and latest saved remedial recommendations</caption>
              <thead>
                <tr>
                  <th scope="col">Section / Subject</th>
                  <th scope="col">Assigned Faculty</th>
                  <th scope="col">Verified Hours</th>
                  <th scope="col">Compliance Progress</th>
                  <th scope="col">Hour Deficit</th>
                  <th scope="col">Recommended Sessions</th>
                  <th scope="col">Compliance Status</th>
                  <th scope="col">
                    <span className="sr-only">View Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>{rows.map(section => {
const rec = recQuery.isError ? undefined : recommendationMap.get(section.sectionCode); return <tr key={section.sectionId} className={selectedId === section.sectionId ? "is-selected" : ""} onClick={e => clickRow(e, section)}>
                  <td>
                    <Link to={`/courses/${section.sectionId}`} className="risk-section-code">{section.sectionCode}</Link>
                    <button className="risk-subject" onClick={e => openSection(section, e.currentTarget)}>{section.subject.title}</button>
                    <small>{section.subject.code} · {section.term}</small>
                  </td>
                  <td>
                    <span className={section.faculty ? "risk-faculty" : "risk-unassigned"}>{section.faculty ?? "Not assigned"}</span>
                  </td>
                  <td>
                    <span className="risk-hours-value">
                      <strong>{displayNumber(section.compliance?.confirmedHoursTotal)}</strong> / {displayNumber(section.compliance?.requiredHours)}<small>confirmed hours</small>
                    </span>
                  </td>
                  <td>
                    <RiskProgress compliance={section.compliance} />
                  </td>
                  <td>
                    <span className="risk-deficit">{displayNumber(rec?.hourDeficit)}{availableNumber(rec?.hourDeficit) !== null ? " hrs" : ""}</span>
                    <small>{rec ? "Saved recommendation" : recUnavailable}</small>
                  </td>
                  <td>
                    <span className="risk-session-count">{displayNumber(rec?.additionalSessionsNeeded)}</span>
                    <small>{rec ? recommendationDate(rec.generatedAt) : recUnavailable}</small>
                  </td>
                  <td>
                    <RiskStatus status={section.compliance?.status} />
                  </td>
                  <td>
                    <button className="risk-view" aria-label={`Review section ${section.sectionCode}`} aria-expanded={selectedId === section.sectionId} onClick={e => openSection(section, e.currentTarget)}>
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
})}</tbody>
            </table>
          </div>
          <div className="risk-mobile-list">{rows.map(section => {
const rec = recQuery.isError ? undefined : recommendationMap.get(section.sectionCode); return <article key={section.sectionId} className={`risk-mobile-row ${selectedId === section.sectionId ? "is-selected" : ""}`}>
              <div className="risk-mobile-title">
                <button onClick={e => openSection(section, e.currentTarget)}>
                  <small>{section.subject.code} · Section {section.sectionCode}</small>
                  <strong>{section.subject.title}</strong>
                </button>
                <RiskStatus status={section.compliance?.status} />
              </div>
              <p>{section.faculty ?? "Faculty not assigned"}</p>
              <div className="risk-mobile-hours">
                <span>Verified hours</span>
                <strong>{displayNumber(section.compliance?.confirmedHoursTotal)} / {displayNumber(section.compliance?.requiredHours)} hrs</strong>
              </div>
              <RiskProgress compliance={section.compliance} />
              <dl>
                <div>
                  <dt>Recorded deficit</dt>
                  <dd>{displayNumber(rec?.hourDeficit)}{availableNumber(rec?.hourDeficit) !== null ? " hrs" : ""}</dd>
                </div>
                <div>
                  <dt>Recommended sessions</dt>
                  <dd>{displayNumber(rec?.additionalSessionsNeeded)}</dd>
                </div>
              </dl>{!rec && <p className="risk-mobile-rec-state">{recUnavailable}</p>}<div className="risk-mobile-actions">
                <Link to={`/courses/${section.sectionId}`}>Course records</Link>
                <button aria-label={`Review section ${section.sectionCode}`} onClick={e => openSection(section, e.currentTarget)}>Review recommendation <Eye size={14} />
                </button>
              </div>
            </article>
})}</div>
        </>}
        <footer className="risk-workspace-footer">
          <span>
            <ShieldCheck size={13} /> Only confirmed laboratory hours count toward compliance.</span>{hasFilters && <button onClick={reset}>Reset filters</button>}{missing > 0 && <p>{missing} {missing === 1 ? "section has" : "sections have"} no compliance record and {missing === 1 ? "is" : "are"} not classified as flagged.</p>}</footer>
      </section>
      <RiskInspector section={selected} wide={wide} onClose={() => setSelectedId(null)} returnFocus={returnFocus} />
    </div>
  </div>;
}
