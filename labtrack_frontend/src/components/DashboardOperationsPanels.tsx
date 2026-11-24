import { Link } from "react-router-dom";
import { Activity, CalendarDays, CheckCircle2, CircleAlert, Gauge, Monitor, Server } from "lucide-react";
import { canAccess, type Role } from "@/contexts/RoleContext";
import type { DashboardOperations } from "@/utils/hooks/useDashboardOperations";
import { pendingConfirmationsPath } from "@/utils/sessionConfirmationLink";

const number = (value: number | null, suffix = "") => value === null ? "—" : `${Math.round(value * 10) / 10}${suffix}`;
const timeLabel = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
};
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" }).format(new Date(`${value.slice(0, 10)}T12:00:00+08:00`));

export function DashboardOperationalPanels({ data, role }: { data: DashboardOperations; role: Role }) {
  const { utilization, sessions, compliance } = data;
  const latest = sessions.recent[0];
  return <>
    <section className="dashboard-card utilization-card" aria-labelledby="utilization-heading">
      <div className="card-heading"><h2 id="utilization-heading">Laboratory utilization</h2><Gauge size={17} /></div>
      <p className="card-caption">{data.selectedLab?.name ?? "All registered laboratories"}</p>
      <div className="operational-value"><strong>{data.loading ? "—" : number(utilization.recordedPercent, "%")}</strong><span>recorded usage today</span></div>
      <div className="utilization-track" role="meter" aria-label="Active workstations with recorded attendance today" aria-valuemin={0} aria-valuemax={100} aria-valuenow={utilization.recordedPercent ?? undefined}
        aria-valuetext={utilization.recordedPercent === null ? "Usage data unavailable" : `${utilization.usedToday} of ${utilization.active} active workstations used today`}><span style={{ width: `${utilization.recordedPercent ?? 0}%` }} /></div>
      <dl className="panel-facts"><div><dt>PCs used today</dt><dd>{number(utilization.usedToday)}</dd></div><div><dt>Active workstations</dt><dd>{number(utilization.active)}</dd></div>
        <div><dt>Total registered</dt><dd>{data.topologyAvailable ? utilization.registered : "—"}</dd></div></dl>
      <div className="historical-utilization"><span>Confirmed section average</span><strong>{number(utilization.historicalPercent, "%")}</strong></div>
      <details className="panel-explanation"><summary>How usage is measured</summary><p className="panel-footnote">Today's usage is based on recorded logins, not live occupancy. The section average uses finally confirmed physical sessions; a section may meet in multiple labs.</p></details>
      {canAccess(role, "/workstation") && <Link className="card-text-link" to={data.selectedLab ? `/workstation?lab=${data.selectedLab.labId}` : "/workstation"}>View registered workstations</Link>}
    </section>

    <section className="dashboard-card sessions-card" aria-labelledby="sessions-heading">
      <div className="card-heading"><h2 id="sessions-heading">Session confirmations</h2><CheckCircle2 size={17} /></div>
      <p className="card-caption">{data.selectedLab?.roomCode ?? "All laboratories"} · active semester</p>
      <dl className="panel-facts session-queue"><div><dt>Awaiting faculty review today</dt><dd>{number(sessions.awaitingFacultyToday)}</dd></div><div><dt>Pending final confirmation</dt><dd>{number(sessions.pendingFinal)}</dd></div>
        <div><dt>Latest confirmed session</dt><dd>{latest ? dateLabel(latest.sessionDate) : sessions.complete ? "None yet" : "—"}</dd></div></dl>
      <details className="panel-explanation"><summary>How review counts are calculated</summary><p className="panel-footnote">Faculty review counts today's recorded class-days without a faculty-confirmed physical or final virtual session. Only final confirmation credits CHED hours.</p></details>
      {canAccess(role, "/confirm-session") && <Link className="card-text-link" to={pendingConfirmationsPath({ labId: data.selectedLab?.labId, ayId: data.academicYearId })}>Open Confirm Sessions</Link>}
    </section>

    <section className="dashboard-card compliance-card" aria-labelledby="compliance-heading">
      <div className="card-heading"><h2 id="compliance-heading">CHED compliance</h2><Activity size={17} /></div>
      <p className="card-caption">{data.selectedLab ? `Sections scheduled in ${data.selectedLab.roomCode}` : "All current-semester sections"}</p>
      <div className="compliance-gauge" role="img" aria-label={compliance.averagePercent === null ? "No assessed compliance data" : `Average confirmed-hours completion ${compliance.averagePercent}%`}>
        <svg viewBox="0 0 160 132" aria-hidden="true"><path className="gauge-track" d="M 24 106 A 65 65 0 1 1 136 106" pathLength="100" /><path className="gauge-progress" d="M 24 106 A 65 65 0 1 1 136 106" pathLength="100" strokeDasharray={`${compliance.averagePercent ?? 0} 100`} />
          <text x="80" y="80" textAnchor="middle" className="gauge-value">{number(compliance.averagePercent, "%")}</text><text x="80" y="101" textAnchor="middle" className="gauge-caption">average completion</text>
          <text x="17" y="129" className="gauge-caption">0%</text><text x="143" y="129" textAnchor="end" className="gauge-caption">100%</text></svg>
      </div>
      <dl className="compliance-key"><div><dt>Compliant</dt><dd>{data.sectionsAvailable ? compliance.compliant : "—"}</dd></div><div><dt>At risk</dt><dd>{data.sectionsAvailable ? compliance.atRisk : "—"}</dd></div><div><dt>Non-compliant</dt><dd>{data.sectionsAvailable ? compliance.nonCompliant : "—"}</dd></div><div><dt>Unassessed</dt><dd>{data.sectionsAvailable ? compliance.unassessed : "—"}</dd></div></dl>
      <div className="panel-links">{canAccess(role, "/at-risk") && <Link className="card-text-link" to="/at-risk">At Risk</Link>}{canAccess(role, "/compliance-report") && <Link className="card-text-link" to="/compliance-report">Compliance Report</Link>}</div>
    </section>
  </>;
}

export function DashboardNodeInspector({ data, role, serverSelected, onClose }: {
  data: DashboardOperations; role: Role; serverSelected: boolean; onClose: () => void;
}) {
  const lab = data.selectedLab;
  const registered = data.labs.reduce((total, item) => total + item.workstationCount, 0);
  return <section className="dashboard-card device-card" aria-labelledby="device-heading">
    <div className="card-heading"><h2 id="device-heading">Node inspector</h2><button type="button" className="card-icon-button" aria-label="Close device inspector" onClick={onClose}><span aria-hidden="true">×</span></button></div>
    <div className="device-title" aria-live="polite"><span className="device-type-icon">{serverSelected ? <Server size={24} /> : <Monitor size={24} />}</span><h3>{serverSelected ? "Application server" : lab?.name ?? "Laboratory"}</h3><p>{serverSelected ? "Central Application Server" : "Laboratory Master PC"}</p></div>
    <dl className="device-facts">{serverSelected ? <>
      <div><dt>Registered laboratories</dt><dd>{data.topologyAvailable ? data.labs.length : "—"}</dd></div><div><dt>Registered workstations</dt><dd>{data.topologyAvailable ? registered : "—"}</dd></div><div><dt>Course sections</dt><dd>{data.sectionsAvailable ? data.sections.length : "—"}</dd></div>
    </> : <>
      <div><dt>Room code</dt><dd>{lab?.roomCode || "Not provided"}</dd></div><div><dt>Laboratory ID</dt><dd>{lab?.labId ?? "—"}</dd></div><div><dt>Registered workstations</dt><dd>{lab?.workstationCount ?? "—"}</dd></div><div><dt>Capacity</dt><dd>{lab?.capacity ?? "—"}</dd></div>
    </>}</dl>
    <p className="device-preview-note">{serverSelected ? "Shared attendance, session verification, and reporting services." : "Master PC for this laboratory. Student PCs are listed in Workstations."}</p>
    <div className="panel-links">{canAccess(role, "/workstation") && <Link className="card-text-link" to={lab && !serverSelected ? `/workstation?lab=${lab.labId}` : "/workstation"}>Workstations</Link>}
      {canAccess(role, "/attendance-report") && <Link className="card-text-link" to={lab && !serverSelected ? `/attendance-report?lab=${lab.labId}` : "/attendance-report"}>Attendance records</Link>}</div>
    <details className="panel-explanation"><summary>About this architecture view</summary><p className="panel-footnote">IP addresses, hardware details, and live connection telemetry are not supplied by the API.</p></details>
  </section>;
}

export function DashboardActivity({ data, role }: { data: DashboardOperations; role: Role }) {
  const flagged = data.scopedSections.filter((section) => section.compliance?.status === "AtRisk" || section.compliance?.status === "NonCompliant");
  return <div className="operations-bottom" aria-label="Laboratory activity and navigation">
    <section className="activity-card"><div className="activity-heading"><h2><CalendarDays size={15} />Today's sessions</h2><span>{data.today}</span></div>
      {data.todaySchedule.length ? <ul>{data.todaySchedule.slice(0, 2).map((meeting) => <li key={meeting.key}><span><strong>{meeting.subjectTitle}</strong><small>{meeting.sectionCode} · {meeting.roomCode}{meeting.makeUp ? " · Make-up" : ""}</small></span><time>{timeLabel(meeting.startTime)}</time></li>)}</ul>
        : <p className="activity-empty">{data.loading ? "Loading schedule…" : data.scheduleAvailable ? "No laboratory sessions scheduled today." : "Today's schedule is unavailable."}</p>}
      {canAccess(role, "/schedule") && <Link to="/schedule">View schedule</Link>}
    </section>
    <section className="activity-card"><div className="activity-heading"><h2><CheckCircle2 size={15} />Recently confirmed</h2></div>
      {data.sessions.recent.length ? <ul>{data.sessions.recent.slice(0, 2).map((session) => <li key={session.confirmationId}><span><strong>{session.subjectTitle}</strong><small>{session.sectionCode} · {dateLabel(session.sessionDate)}</small></span><span className="credited-hours">{session.hoursCredited}h credited</span></li>)}</ul>
        : <p className="activity-empty">{data.loading ? "Loading sessions…" : data.sessions.complete ? "No finally confirmed sessions yet." : "Confirmation activity is unavailable."}</p>}
      {canAccess(role, "/confirm-session") && <Link to="/confirm-session">Review confirmations</Link>}
    </section>
    <section className="activity-card"><div className="activity-heading"><h2><CircleAlert size={15} />At-risk sections</h2><span>{flagged.length}</span></div>
      {flagged.length ? <ul>{flagged.slice(0, 2).map((section) => <li key={section.sectionId}><span><strong>{section.subject.title}</strong><small>{section.sectionCode}</small></span><b>{section.compliance?.status === "AtRisk" ? "At risk" : "Non-compliant"}</b></li>)}</ul>
        : <p className="activity-empty">{data.loading ? "Loading course sections…" : data.sectionsAvailable ? "No flagged sections in this selection." : "Course section data is unavailable."}</p>}
      {canAccess(role, "/at-risk") && <Link to="/at-risk">View At Risk</Link>}
    </section>
    <section className="activity-card navigation-card"><div className="activity-heading"><h2><Monitor size={15} />Workspace</h2></div><div className="activity-navigation">
      {[{ to: "/attendance-report", label: "Attendance reports" }, { to: data.selectedLab ? `/workstation?lab=${data.selectedLab.labId}` : "/workstation", label: "Workstations" }, { to: "/schedule", label: "Schedule" }]
        .filter((item) => canAccess(role, item.to.split("?")[0])).map((item) => <Link key={item.to} to={item.to}>{item.label}</Link>)}
    </div></section>
  </div>;
}
