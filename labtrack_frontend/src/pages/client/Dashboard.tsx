import { Link } from "react-router-dom";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Activity, Box, Building2, ChevronDown, Expand, LayoutGrid, Layers, LoaderCircle, Minus, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, RotateCcw, Server, SlidersHorizontal, X } from "lucide-react";
import { DashboardSummary } from "@/components/DashboardSummary";
import { DashboardAnalyticsView } from "@/components/DashboardAnalyticsView";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DashboardActivity, DashboardNodeInspector, DashboardOperationalPanels } from "@/components/DashboardOperationsPanels";
import type { TopologyView } from "@/components/LabTopology3D";
import { useDashboardOperations } from "@/utils/hooks/useDashboardOperations";
import { canAccess, useRole } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import "./dashboard.css";

const LabTopology3D = lazy(() => import("@/components/LabTopology3D").then((module) => ({ default: module.LabTopology3D })));

/** Stored values stay "network" | "cards" so existing saved preferences keep working; "cards" is shown as Analytics. */
type DashboardLayout = "network" | "cards";
const LAYOUT_OPTIONS: { value: DashboardLayout; label: string; icon: typeof Box }[] = [
  { value: "network", label: "3D Network", icon: Box },
  { value: "cards", label: "Analytics", icon: LayoutGrid },
];
function readLayout(key: string): DashboardLayout {
  try { return localStorage.getItem(key) === "cards" ? "cards" : "network"; }
  catch { return "network"; }
}

export function DashboardPage() {
  const { role } = useRole();
  const { user } = useAuth();
  const layoutKey = `labtrack.dashboardLayout.${user?.userId ?? "default"}`;
  // Remember which key the layout was read from: if the signed-in user arrives after the first
  // render, the right account's saved choice is loaded without writing over anyone's preference.
  const [layoutState, setLayoutState] = useState(() => ({ key: layoutKey, value: readLayout(layoutKey) }));
  if (layoutState.key !== layoutKey) setLayoutState({ key: layoutKey, value: readLayout(layoutKey) });
  const layout = layoutState.key === layoutKey ? layoutState.value : readLayout(layoutKey);
  function changeLayout(next: DashboardLayout) {
    if (next === layout) return;
    if (next === "cards" && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setLayoutState({ key: layoutKey, value: next });
    try { localStorage.setItem(layoutKey, next); } catch { /* Layout remains usable without storage. */ }
  }
  const [selectedNodeId, setSelectedNodeId] = useState("SERVER");
  const selectedLabId = selectedNodeId.startsWith("LAB-") ? Number(selectedNodeId.slice(4)) : null;
  const data = useDashboardOperations(selectedLabId);
  const [viewMode, setViewMode] = useState<TopologyView>(() => window.matchMedia("(max-width: 767px), (prefers-reduced-motion: reduce)").matches ? "2d" : "3d");
  const [zoom, setZoom] = useState(1);
  const [showConnections, setShowConnections] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const [showMetrics, setShowMetrics] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [showActivity, setShowActivity] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const reportsRef = useRef<HTMLDialogElement>(null);
  const isNetwork = layout === "network";

  useEffect(() => {
    if (!data.topologyLoading && data.topologyAvailable && selectedLabId !== null && !data.labs.some((lab) => lab.labId === selectedLabId)) setSelectedNodeId("SERVER");
  }, [data.topologyLoading, data.topologyAvailable, data.labs, selectedLabId]);

  function selectNode(id: string) {
    if (id !== "SERVER" && !data.labs.some((lab) => `LAB-${lab.labId}` === id)) return;
    setSelectedNodeId(id);
    setShowInspector(true);
  }
  function resetView() {
    setZoom(1);
    setResetKey((value) => value + 1);
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await workspaceRef.current?.requestFullscreen();
    } catch { /* The full-page workspace remains usable when fullscreen is unavailable. */ }
  }
  const sceneLoading = <div className="network-empty" role="status"><LoaderCircle className="dashboard-spinner" size={28} /><p>Preparing the laboratory topology…</p></div>;

  // Shared by both headers; only the active view renders it, so there is one set of controls on the page.
  const headerActions = <div className="dashboard-heading-actions">
    <div className="dashboard-layout-switch" role="group" aria-label="Dashboard layout">
      {LAYOUT_OPTIONS.map(({ value, label, icon: Icon }) => <button key={value} type="button"
        aria-pressed={layout === value} onClick={() => changeLayout(value)}>
        <Icon size={14} aria-hidden="true" />{label}
      </button>)}
    </div>
    <SearchableSelect
      ariaLabel="Select laboratory" value={selectedNodeId} onValueChange={selectNode}
      searchPlaceholder="Search laboratories…" emptyMessage="No matching laboratories."
      leadingIcon={<Building2 size={16} />} className="dashboard-lab-select"
      options={[{ value: "SERVER", label: isNetwork ? "Application server · all labs" : "All laboratories", description: "Central application server", keywords: ["all laboratories", "overview"], icon: <Server size={16} /> },
        ...data.labs.map((lab) => ({ value: `LAB-${lab.labId}`, label: `${lab.roomCode} · ${lab.name}`, description: "Laboratory Master PC", keywords: [lab.roomCode, lab.name], icon: <Building2 size={16} /> }))]} />
    <button type="button" className="dashboard-report-button" onClick={() => reportsRef.current?.showModal()}><Activity size={16} />Overview & reports</button>
    <button type="button" className="dashboard-refresh" aria-label="Refresh operational data" title="Refresh operational data" onClick={data.refresh} disabled={data.refreshing}><RefreshCw size={16} className={data.refreshing ? "dashboard-spinner" : ""} /></button>
  </div>;

  return <div className={`lab-dashboard layout-${layout} ${showActivity ? "" : "activity-collapsed"}`}>
    {/* The network workspace stays mounted while Analytics is shown, so the 3D scene, camera,
        zoom and inspector state survive switching. Hidden with display:none, the demand-driven
        canvas does no rendering work. */}
    <div className={`operations-workspace ${showInspector ? "" : "inspector-hidden"} ${isNetwork ? "" : "is-parked"}`} ref={workspaceRef}
      aria-hidden={!isNetwork || undefined} inert={!isNetwork}>
      <section className="network-card" aria-label="Laboratory network architecture">
        <div className="network-map"><Suspense fallback={sceneLoading}>
          {data.topologyLoading ? sceneLoading : data.topologyAvailable ? <LabTopology3D laboratories={data.labs} selectedNodeId={selectedNodeId} onSelectNode={selectNode}
            viewMode={viewMode} zoom={zoom} showConnections={showConnections} resetKey={resetKey} /> : <div className="network-empty" role="status"><Server size={28} /><p>Laboratory data is unavailable. Use Refresh to try again.</p></div>}
        </Suspense></div>
        {!data.topologyLoading && data.topologyAvailable && data.labs.length === 0 && <p className="empty-topology-note">No laboratories are available to display. The application server is shown on its own.</p>}
        <div className="network-controls" aria-label="Map controls">
          <div role="group" aria-label="Map view">{(["2d", "3d"] as const).map((mode) => <button key={mode} type="button" aria-label={`Switch to ${mode.toUpperCase()} view`}
            aria-pressed={viewMode === mode} className={viewMode === mode ? "is-active" : ""} onClick={() => setViewMode(mode)}>{mode.toUpperCase()}</button>)}</div>
          <div><button type="button" aria-label={showConnections ? "Hide network lines" : "Show network lines"} title="Toggle network lines" aria-pressed={showConnections}
            className={showConnections ? "is-active" : ""} onClick={() => setShowConnections((value) => !value)}><Layers size={17} /></button>
            <button type="button" aria-label="Reset view" title="Reset view" onClick={resetView}><RotateCcw size={17} /></button>
            <button type="button" aria-label="Zoom in" title="Zoom in" disabled={zoom >= 1.6} onClick={() => setZoom((value) => Math.min(1.6, Math.round((value + .15) * 100) / 100))}><Plus size={18} /></button>
            <button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoom <= .55} onClick={() => setZoom((value) => Math.max(.55, Math.round((value - .15) * 100) / 100))}><Minus size={18} /></button></div>
          <div className="desktop-map-tools"><button type="button" aria-label="Toggle operational panels" title="Toggle operational panels" aria-pressed={showMetrics} onClick={() => setShowMetrics((value) => !value)}>{showMetrics ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button>
            <button type="button" aria-label="Toggle device inspector" title="Toggle device inspector" aria-pressed={showInspector} onClick={() => setShowInspector((value) => !value)}><SlidersHorizontal size={17} /></button>
            <button type="button" aria-label="Toggle fullscreen map" title="Fullscreen map" onClick={() => void toggleFullscreen()}><Expand size={17} /></button></div>
        </div>
        <div className="network-footer"><span><i />Selected laboratory</span><span><i className="is-muted" />Topology connection</span>
          <button type="button" className="activity-toggle" aria-expanded={showActivity} aria-controls="dashboard-activity" onClick={() => setShowActivity((visible) => !visible)}>
            <ChevronDown size={14} className={showActivity ? "rotate-180" : ""} />{showActivity ? "Hide activity cards" : "Show activity cards"}
          </button></div>
      </section>

      {isNetwork && <header className="dashboard-heading">
        <div className="dashboard-identity"><div><p className="dashboard-eyebrow">Operations center</p><h1>Laboratory Network</h1></div></div>
        {headerActions}
      </header>}
      <div className="dashboard-context"><span className="architecture-badge">Architecture view</span><span className="context-divider" /><span>{data.topologyAvailable ? `${data.labs.length} ${data.labs.length === 1 ? "laboratory" : "laboratories"} · one Master PC per lab` : data.topologyLoading ? "Loading laboratory registry" : "Laboratory registry unavailable"}</span></div>
      {isNetwork && data.issues.length > 0 && <div className="dashboard-error" role="status"><span>{data.issues[0]}{data.issues.length > 1 ? ` (${data.issues.length} data sources affected)` : ""}</span><button type="button" onClick={data.refresh}>Retry</button></div>}

      <aside className={`metrics-rail ${showMetrics ? "" : "is-hidden"}`} aria-label="Laboratory operational panels"><DashboardOperationalPanels data={data} role={role} /></aside>
      <aside className={`device-inspector ${showInspector ? "" : "is-hidden"}`} ref={inspectorRef} tabIndex={-1} aria-label="Selected node inspector">
        <DashboardNodeInspector data={data} role={role} serverSelected={selectedNodeId === "SERVER"} onClose={() => setShowInspector(false)} />
      </aside>
    </div>

    <div id="dashboard-activity" hidden={!isNetwork || !showActivity}><DashboardActivity data={data} role={role} /></div>

    {!isNetwork && <DashboardAnalyticsView data={data} role={role} header={<header className="analytics-header">
      <div>
        <p className="dashboard-eyebrow">Operations center</p>
        <h1>Laboratory Overview</h1>
        <p className="analytics-header-context">
          <span className="analytics-badge">Active semester</span>
          <span>{data.selectedLab ? `${data.selectedLab.roomCode} · ${data.selectedLab.name}` : "All laboratories"}</span>
          {data.refreshing && <span className="analytics-updating" role="status">Updating…</span>}
        </p>
      </div>
      {headerActions}
    </header>} />}

    <dialog ref={reportsRef} className="dashboard-reports-dialog" aria-labelledby="reports-heading">
      <div className="reports-heading"><div><p className="dashboard-eyebrow">Active-semester overview</p><h2 id="reports-heading">Overview & reports</h2></div><button type="button" className="card-icon-button" onClick={() => reportsRef.current?.close()} aria-label="Close reports"><X size={22} /></button></div>
      <DashboardSummary sections={data.sections} labs={data.labs} />
      <p className="reports-context">Official completion uses the existing confirmed-hours rollup. The dashboard does not credit hours from raw student logins.</p>
      <div className="report-navigation">{[{ to: "/attendance-report", label: "Attendance reports" }, { to: "/compliance-report", label: "CHED compliance report" }, { to: "/weekly-report", label: "Weekly report" }, { to: "/confirm-session", label: "Confirm Sessions" }, { to: "/workstation", label: "Workstations" }, { to: "/schedule", label: "Schedule" }]
        .filter((item) => canAccess(role, item.to)).map((item) => <Link key={item.to} to={item.to}>{item.label}</Link>)}</div>
    </dialog>
  </div>;
}