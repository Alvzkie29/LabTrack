import { Link, useSearchParams } from "react-router-dom";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpDown, Building2, CheckCircle2, ChevronRight, CircleAlert, Clock3, History, Monitor, MonitorOff, RefreshCw, Search, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { canAccess, useRole } from "@/contexts/RoleContext";
import { Restricted } from "@/components/Restricted";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { WorkstationHistoryDrawer } from "@/components/workstations/WorkstationHistoryDrawer";
import { getLaboratories, getLabWorkstations, type LaboratorySummary, type WorkstationEntry } from "@/api/laboratories";
import { getAttendanceReport } from "@/api/attendance";
import "./workstation.css";

const MasterPcPreview = lazy(() => import("@/components/workstations/MasterPcPreview"));
const EMPTY_LABS: LaboratorySummary[] = [];
const EMPTY_WORKSTATIONS: WorkstationEntry[] = [];
const DAY_MS = 86_400_000;
const todayInManila = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
const utcTimestamp = (value: string) => Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`);

export function WorkstationsPage() {
  const { user } = useAuth();
  const { role } = useRole();
  const allowed = canAccess(role, "/workstation");
  const [searchParams] = useSearchParams();
  const requestedLab = Number(searchParams.get("lab"));
  const queryLabId = Number.isSafeInteger(requestedLab) && requestedLab > 0 ? requestedLab : null;
  const [selectedLabId, setSelectedLabId] = useState<number | null>(queryLabId);
  const [selection, setSelection] = useState<{ labId: number; workstationId: number } | null>(null);
  const [returnFocusElement, setReturnFocusElement] = useState<HTMLElement | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"seat" | "identifier">("seat");
  const [today, setToday] = useState(todayInManila);
  const queryClient = useQueryClient();
  const prefix = ["workstations-page", user?.userId, role] as const;
  const queryOptions = { staleTime: 60_000, retry: false as const };

  useEffect(() => {
    setSelectedLabId(queryLabId);
    setSelection(null);
    setSearch("");
  }, [queryLabId]);
  useEffect(() => {
    const nextMidnight = Date.parse(`${today}T00:00:00+08:00`) + DAY_MS;
    const timer = window.setTimeout(() => setToday(todayInManila()), Math.max(100, nextMidnight - Date.now() + 100));
    return () => window.clearTimeout(timer);
  }, [today]);

  const labsQuery = useQuery({ ...queryOptions, queryKey: [...prefix, "laboratories"], queryFn: getLaboratories, enabled: allowed });
  const labs = labsQuery.data ?? EMPTY_LABS;
  const activeLab = labs.find((lab) => lab.labId === selectedLabId) ?? labs[0];
  const activeLabId = activeLab?.labId;
  const workstationsQuery = useQuery({ ...queryOptions, queryKey: [...prefix, "workstations", activeLabId],
    queryFn: () => getLabWorkstations(activeLabId!), enabled: allowed && activeLabId !== undefined });
  const workstations = workstationsQuery.data ?? EMPTY_WORKSTATIONS;
  const todayStart = Date.parse(`${today}T00:00:00+08:00`);
  const attendanceQuery = useQuery({ ...queryOptions, queryKey: [...prefix, "today-logins", activeLabId, today],
    queryFn: () => getAttendanceReport({ labId: activeLabId!, from: new Date(todayStart).toISOString(), to: new Date(todayStart).toISOString() }),
    enabled: allowed && activeLabId !== undefined });
  const loginsToday = attendanceQuery.isSuccess ? attendanceQuery.data.filter((record) => {
    const timestamp = utcTimestamp(record.loginTime);
    return timestamp >= todayStart && timestamp < todayStart + DAY_MS;
  }).length : null;
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return workstations.filter((workstation) => !query || workstation.pcIdentifier.toLocaleLowerCase().includes(query) || workstation.seatLabel.toLocaleLowerCase().includes(query))
      .sort((a, b) => (sort === "seat" ? a.seatLabel.localeCompare(b.seatLabel, undefined, { numeric: true, sensitivity: "base" }) : a.pcIdentifier.localeCompare(b.pcIdentifier, undefined, { numeric: true, sensitivity: "base" })) || a.workstationId - b.workstationId);
  }, [workstations, search, sort]);
  const selectedWorkstation = selection?.labId === activeLabId ? workstations.find((workstation) => workstation.workstationId === selection.workstationId) ?? null : null;
  const loadingPcs = !!activeLab && workstationsQuery.isPending;
  const refreshing = labsQuery.isFetching || workstationsQuery.isFetching || attendanceQuery.isFetching;
  const registeredTotal = labsQuery.isSuccess ? labs.reduce((total, lab) => total + lab.workstationCount, 0) : null;

  function selectLaboratory(id: number) {
    if (!labs.some((lab) => lab.labId === id)) return;
    setSelectedLabId(id);
    setSelection(null);
    setSearch("");
  }
  function refresh() { void queryClient.invalidateQueries({ queryKey: prefix }); }

  if (!allowed) return <Restricted path="/workstation" />;

  return <div className="workstations-page">
    <header className="ws-page-heading"><div><p className="ws-eyebrow">Laboratory management / Registered workstations</p><h1>Workstations</h1><p className="ws-page-subtitle">Manage registered laboratory computers and review student attendance records.</p></div>
      <button type="button" className="ws-refresh-button" onClick={refresh} disabled={refreshing}><RefreshCw size={15} className={refreshing ? "ws-spin" : ""} />Refresh</button></header>

    <div className="ws-summary" aria-label="Workstation summary">
      {[{ label: "Registered Workstations", value: registeredTotal, note: "Across all laboratories", icon: Monitor },
        { label: "Total Laboratories", value: labsQuery.isSuccess ? labs.length : null, note: "Registered in the system", icon: Building2 },
        { label: "Recorded Logins Today", value: loginsToday, note: `${activeLab?.roomCode ?? "Selected laboratory"} · active semester · Philippine time`, icon: Clock3 }].map(({ label, value, note, icon: Icon }) =>
          <section className="ws-summary-card" key={label}><span className="ws-summary-icon"><Icon size={19} strokeWidth={1.6} /></span><div><h2>{label}</h2><strong>{value ?? "—"}</strong><p>{note}</p></div></section>)}
    </div>
    {attendanceQuery.isError && <p className="ws-metric-error" role="status"><CircleAlert size={14} />Today's login count is unavailable.<button type="button" onClick={() => void attendanceQuery.refetch()}>Retry</button></p>}

    {labsQuery.isError ? <div className="ws-state ws-state-error" role="alert"><CircleAlert size={28} /><h2>Laboratories could not be loaded</h2><p>Please try again to view registered computers.</p><button type="button" onClick={() => void labsQuery.refetch()}>Retry loading laboratories</button></div>
      : labsQuery.isPending ? <div className="ws-loading-labs" role="status"><span className="ws-skeleton" /><span className="ws-skeleton" /><span className="sr-only">Loading laboratories…</span></div>
      : labs.length === 0 ? <div className="ws-state"><Building2 size={30} /><h2>No laboratories registered</h2><p>Registered laboratories and their computers will appear here.</p></div>
      : <>
        <div className="ws-laboratory-toolbar"><div className="ws-lab-tabs" role="group" aria-label="Select laboratory">{labs.map((lab) => <button type="button" key={lab.labId}
          aria-pressed={lab.labId === activeLabId} onClick={() => selectLaboratory(lab.labId)} className={lab.labId === activeLabId ? "is-selected" : ""}><Building2 size={15} /><span>{lab.name}</span><small>{lab.workstationCount}</small></button>)}</div>
          <div className="ws-mobile-lab-select"><SearchableSelect ariaLabel="Select laboratory" options={labs.map((lab) => ({ value: String(lab.labId), label: lab.name, description: lab.roomCode }))}
            value={String(activeLabId)} onValueChange={(value) => selectLaboratory(Number(value))} leadingIcon={<Building2 size={16} />} searchPlaceholder="Search laboratories…" /></div>
          <span className="ws-lab-scope">{activeLab?.roomCode} <span>laboratory records</span></span>
        </div>

        <div className="ws-content-layout">
          <section className="ws-master-profile" aria-labelledby="ws-master-heading">
            <div className="ws-profile-topline"><span className="ws-overline">Laboratory profile</span><span className="ws-visual-label">Master PC</span></div>
            <div className="ws-master-portrait"><Suspense fallback={<div className="ws-preview-loading" role="status"><Monitor size={48} strokeWidth={1} /><span>Loading computer illustration…</span></div>}><MasterPcPreview /></Suspense></div>
            <div className="ws-profile-body"><p className="ws-eyebrow">{activeLab?.roomCode}</p><h2 id="ws-master-heading">{activeLab?.name}</h2><p className="ws-profile-description">A visual reference for the laboratory's Master PC.</p>
              <dl className="ws-lab-facts"><div><dt>Room code</dt><dd>{activeLab?.roomCode || "Not provided"}</dd></div><div><dt>Registered computers</dt><dd>{workstationsQuery.isSuccess ? workstations.length : "—"}</dd></div><div><dt>Laboratory capacity</dt><dd>{activeLab?.capacity ?? "—"}</dd></div></dl>
              <p className="ws-profile-note">Student workstation registration and attendance history are listed separately.</p>
              {canAccess(role, "/attendance-report") && <Link to={`/attendance-report?lab=${activeLabId}`} className="ws-attendance-link"><History size={15} />Attendance reports</Link>}
            </div>
          </section>

          <section className="ws-inventory" aria-labelledby="ws-inventory-heading">
            <div className="ws-inventory-heading"><div><h2 id="ws-inventory-heading">Registered computers</h2><p>{activeLab?.name}</p></div><span className="ws-record-count">{workstationsQuery.isSuccess ? `${workstations.length} records` : "Loading records"}</span></div>
            <div className="ws-search-toolbar"><label className="ws-search-field"><Search size={16} /><input type="search" placeholder="Search PC identifier or seat label…" aria-label="Search workstations" value={search} onChange={(event) => setSearch(event.target.value)} />
              {search && <button type="button" aria-label="Clear workstation search" onClick={() => setSearch("")}><X size={14} /></button>}</label>
              <SearchableSelect ariaLabel="Sort workstations" className="ws-sort-select" value={sort} onValueChange={setSort} leadingIcon={<ArrowUpDown size={14} />}
                options={[{ value: "seat", label: "Seat number" }, { value: "identifier", label: "PC identifier" }]} searchPlaceholder="Search sort options…" />
            </div>
            <div className="ws-results-heading"><span aria-live="polite">{loadingPcs ? "Loading workstations…" : workstationsQuery.isError ? "Records unavailable" : `${filtered.length} of ${workstations.length} workstation${workstations.length === 1 ? "" : "s"}`}</span><span>Registration records</span></div>
            {workstationsQuery.isError ? <div className="ws-state ws-inventory-state" role="alert"><CircleAlert size={27} /><h3>Workstations could not be loaded</h3><p>Your laboratory selection is preserved.</p><button type="button" onClick={() => void workstationsQuery.refetch()}>Try again</button></div>
              : loadingPcs ? <div className="ws-pc-grid" role="status">{Array.from({ length: 6 }, (_, index) => <div key={index} className="ws-card-skeleton ws-skeleton" aria-hidden="true" />)}<span className="sr-only">Loading workstations</span></div>
              : filtered.length === 0 ? <div className="ws-state ws-inventory-state"><MonitorOff size={30} /><h3>{search ? "No matching workstations" : "No registered computers yet"}</h3><p>{search ? "Try another PC identifier or seat label." : "Computers registered to this laboratory will appear here."}</p>{search && <button type="button" onClick={() => setSearch("")}>Clear search</button>}</div>
              : <div className="ws-pc-grid">{filtered.map((workstation) => {
                const selected = selectedWorkstation?.workstationId === workstation.workstationId;
                const Icon = workstation.isActive ? Monitor : MonitorOff;
                return <button type="button" key={workstation.workstationId} className={`ws-pc-card ${selected ? "is-selected" : ""}`} aria-pressed={selected}
                  aria-label={`View history for ${workstation.seatLabel}, ${workstation.pcIdentifier}`}
                  onClick={(event) => { setReturnFocusElement(event.currentTarget); setSelection(selected ? null : { labId: activeLabId!, workstationId: workstation.workstationId }); }}>
                  <div className="ws-pc-card-heading"><h3>{workstation.seatLabel}</h3><span className={`ws-registration-badge ${workstation.isActive ? "" : "is-inactive"}`} title={workstation.isActive ? "Registration active" : "Registration inactive"}>{workstation.isActive ? <CheckCircle2 size={13} /> : <MonitorOff size={13} />}{workstation.isActive ? "Registered" : "Inactive"}</span></div>
                  <div className="ws-pc-illustration" aria-hidden="true"><Icon size={48} strokeWidth={1.15} /><span /></div>
                  <span className="ws-pc-identifier">{workstation.pcIdentifier}</span>
                  <span className="ws-view-history"><span><History size={13} />View history</span><ChevronRight size={14} /></span>
                </button>;
              })}</div>}
            <p className="ws-registration-note"><CircleAlert size={13} />Registration status does not indicate whether a computer is currently online.</p>
          </section>
        </div>
      </>}

    <WorkstationHistoryDrawer workstation={selectedWorkstation} laboratory={activeLab} onClose={() => setSelection(null)} returnFocusElement={returnFocusElement} />
  </div>;
}
