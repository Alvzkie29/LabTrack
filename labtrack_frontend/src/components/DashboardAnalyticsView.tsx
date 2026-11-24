import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight, BarChart3, Building2, CalendarClock, CalendarDays, CheckCircle2, ClipboardCheck, FileText,
  Gauge, Monitor, ShieldAlert, ShieldCheck, Video,
} from "lucide-react";
import { canAccess, type Role } from "@/contexts/RoleContext";
import type { DashboardOperations } from "@/utils/hooks/useDashboardOperations";
import { pendingConfirmationsPath } from "@/utils/sessionConfirmationLink";

/**
 * Analytics layout for the dashboard. Presentation only: every value comes from the
 * shared useDashboardOperations() result owned by DashboardPage, so switching views
 * never fetches anything new.
 */

type Section = DashboardOperations["sections"][number];
type ComplianceStatus = NonNullable<Section["compliance"]>["status"];

const fmt = (value: number | null, suffix = "") => value === null ? "—" : `${Math.round(value * 10) / 10}${suffix}`;
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const timeLabel = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
};
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" })
  .format(new Date(`${value.slice(0, 10)}T12:00:00+08:00`));
const longDate = (value: string) => new Intl.DateTimeFormat("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })
  .format(new Date(`${value}T12:00:00+08:00`));
const completionOf = (section: Section) => section.compliance
  ? Math.min(1, section.compliance.confirmedHoursTotal / Math.max(1, section.compliance.requiredHours)) : null;

const STATUS: Record<ComplianceStatus, { label: string; tone: string }> = {
  Compliant: { label: "Compliant", tone: "ok" },
  AtRisk: { label: "At risk", tone: "warn" },
  NonCompliant: { label: "Non-compliant", tone: "bad" },
};

export function DashboardAnalyticsView({ data, role, header }: { data: DashboardOperations; role: Role; header: ReactNode }) {
  return (
    <div className="dashboard-analytics">
      {header}
      {data.issues.length > 0 && (
        <div className="analytics-alert" role="status">
          <ShieldAlert size={16} aria-hidden="true" />
          <span>{data.issues[0]}{data.issues.length > 1 ? ` (${data.issues.length} data sources affected)` : ""}</span>
          <button type="button" onClick={data.refresh} disabled={data.refreshing}>Retry</button>
        </div>
      )}
      <div className="analytics-grid">
        <UtilizationCard data={data} role={role} />
        <InventoryCard data={data} role={role} />
        <SessionsCard data={data} role={role} />
        <ComplianceCard data={data} role={role} />
        <ComparisonCard data={data} />
        <ActivityCard data={data} role={role} />
        <QuickActionsCard data={data} role={role} />
      </div>
    </div>
  );
}

/* ── Shared pieces ─────────────────────────────────────────────────── */

function CardHead({ id, title, caption, to, linkLabel, role }: { id: string; title: string; caption?: string; to?: string; linkLabel?: string; role: Role }) {
  const allowed = to && canAccess(role, to.split("?")[0]);
  return (
    <div className="analytics-card-head">
      <div>
        <h2 id={id}>{title}</h2>
        {caption && <p>{caption}</p>}
      </div>
      {allowed && (
        <Link className="analytics-open" to={to} aria-label={linkLabel ?? `Open ${title}`} title={linkLabel ?? `Open ${title}`}>
          <ArrowUpRight size={17} />
        </Link>
      )}
    </div>
  );
}

function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="analytics-skeleton" role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, index) => <span key={index} style={{ width: `${92 - index * 18}%` }} />)}
    </div>
  );
}

function Unavailable({ children }: { children: ReactNode }) {
  return <p className="analytics-unavailable">{children}</p>;
}

/* ── Row 2: featured utilization ───────────────────────────────────── */

function UtilizationCard({ data, role }: { data: DashboardOperations; role: Role }) {
  const { utilization } = data;
  const percent = utilization.recordedPercent;
  const unusedShare = percent === null ? 0 : Math.max(0, 100 - percent);
  const scope = data.selectedLab ? `${data.selectedLab.roomCode} · ${data.selectedLab.name}` : "All registered laboratories";
  const reason = utilization.active === 0 ? "No active workstations are registered in this selection."
    : "Recorded usage is unavailable for this selection right now.";

  return (
    <section className="analytics-card analytics-card-featured analytics-utilization" aria-labelledby="an-util">
      <div className="analytics-card-head">
        <div>
          <p className="analytics-kicker"><Gauge size={14} /> Laboratory utilization</p>
          <h2 id="an-util" className="analytics-featured-title">{scope}</h2>
        </div>
        {canAccess(role, "/workstation") && (
          <Link className="analytics-open" to={data.selectedLab ? `/workstation?lab=${data.selectedLab.labId}` : "/workstation"}
            aria-label="View registered workstations" title="View registered workstations"><ArrowUpRight size={17} /></Link>
        )}
      </div>

      {data.loading ? <Skeleton lines={4} /> : (
        <div className="analytics-util-body">
          <div className="analytics-util-main">
            <div className="analytics-hero">
              <strong>{fmt(percent, "%")}</strong>
              <span>of active workstations recorded a login today</span>
            </div>
            {percent === null ? <Unavailable>{reason}</Unavailable> : (
              <div className="analytics-split" role="img"
                aria-label={`${utilization.usedToday} of ${utilization.active} active workstations recorded a login today (${percent}%).`}>
                <div className="analytics-split-bars" aria-hidden="true">
                  {percent > 0 && <span className="is-used" style={{ flexGrow: percent }}><em>Used</em></span>}
                  {unusedShare > 0 && <span className="is-idle" style={{ flexGrow: unusedShare }}><em>No login</em></span>}
                </div>
                <div className="analytics-scale" aria-hidden="true"><span>0%</span><span>50%</span><span>100%</span></div>
              </div>
            )}
          </div>

          <div className="analytics-util-side">
          <dl className="analytics-chips">
            <div><dt>PCs used today</dt><dd>{fmt(utilization.usedToday)}</dd></div>
            <div><dt>Active workstations</dt><dd>{fmt(utilization.active)}</dd></div>
            <div><dt>Registered</dt><dd>{data.topologyAvailable ? utilization.registered : "—"}</dd></div>
          </dl>

          <div className="analytics-secondary">
            <div className="analytics-secondary-head">
              <span>Confirmed section average</span>
              <strong>{fmt(utilization.historicalPercent, "%")}</strong>
            </div>
            <div className="analytics-thin gold" role="meter" aria-label="Average utilization across finally confirmed sessions"
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={utilization.historicalPercent ?? undefined}
              aria-valuetext={utilization.historicalPercent === null ? "Not available" : `${utilization.historicalPercent}%`}>
              <span style={{ width: `${Math.min(100, utilization.historicalPercent ?? 0)}%` }} />
            </div>
            <p>
              {utilization.historicalAvailable
                ? `Across ${plural(utilization.confirmedSessions, "finally confirmed session")} this semester.`
                : "Confirmed-session averages are unavailable."}
            </p>
          </div>
          </div>
        </div>
      )}
      <p className="analytics-footnote">Based on recorded logins, not live occupancy. Daily history isn't provided by the API, so no trend is drawn.</p>
    </section>
  );
}

/* ── Row 2: inventory ──────────────────────────────────────────────── */

function InventoryCard({ data, role }: { data: DashboardOperations; role: Role }) {
  const labs = data.labs;
  const total = labs.reduce((sum, lab) => sum + lab.workstationCount, 0);
  const max = Math.max(1, ...labs.map((lab) => lab.workstationCount));

  return (
    <section className="analytics-card analytics-inventory" aria-labelledby="an-inv">
      <CardHead id="an-inv" title="Laboratory inventory" caption="Registered equipment" to="/workstation" linkLabel="Open Workstations" role={role} />
      {data.topologyLoading ? <Skeleton /> : !data.topologyAvailable ? <Unavailable>Laboratories could not be loaded.</Unavailable> : (
        <>
          <div className="analytics-pair">
            <div><strong>{labs.length}</strong><span>{labs.length === 1 ? "laboratory" : "laboratories"}</span></div>
            <div><strong>{total}</strong><span>workstations</span></div>
          </div>
          {labs.length === 0 ? <Unavailable>No laboratories are registered yet.</Unavailable> : (
            <ul className="analytics-dist" aria-label="Registered workstations by laboratory">
              {labs.map((lab) => {
                const selected = data.selectedLab?.labId === lab.labId;
                return (
                  <li key={lab.labId} className={selected ? "is-selected" : ""} aria-current={selected || undefined}>
                    <div><span title={lab.name}>{lab.roomCode || lab.name}</span><b>{plural(lab.workstationCount, "PC")}</b></div>
                    <i aria-hidden="true"><span style={{ width: `${lab.workstationCount / max * 100}%` }} /></i>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/* ── Row 2: session confirmations ──────────────────────────────────── */

function SessionsCard({ data, role }: { data: DashboardOperations; role: Role }) {
  const { sessions } = data;
  const latest = sessions.recent[0];
  const link = pendingConfirmationsPath({ labId: data.selectedLab?.labId, ayId: data.academicYearId });

  return (
    <section className="analytics-card analytics-sessions" aria-labelledby="an-sess">
      <div className="analytics-card-head">
        <div><h2 id="an-sess">Session confirmations</h2><p>{data.selectedLab?.roomCode ?? "All laboratories"} · active semester</p></div>
        {canAccess(role, "/confirm-session") && (
          <Link className="analytics-open" to={link} aria-label="Open Confirm Sessions" title="Open Confirm Sessions"><ArrowUpRight size={17} /></Link>
        )}
      </div>
      {data.loading ? <Skeleton /> : (
        <>
          <div className="analytics-big">
            <strong>{fmt(sessions.pendingFinal)}</strong>
            <span>pending final confirmation</span>
          </div>
          <dl className="analytics-rows">
            <div><dt>Awaiting faculty review today</dt><dd>{fmt(sessions.awaitingFacultyToday)}</dd></div>
            <div><dt>Latest confirmed session</dt><dd>{latest ? dateLabel(latest.sessionDate) : sessions.complete ? "None yet" : "—"}</dd></div>
          </dl>
          {!sessions.complete && <Unavailable>Some confirmations couldn't be loaded, so counts may be missing.</Unavailable>}
        </>
      )}
      <p className="analytics-footnote">Only final confirmation credits CHED hours.</p>
    </section>
  );
}

/* ── Row 3: academic compliance ────────────────────────────────────── */

function ComplianceCard({ data, role }: { data: DashboardOperations; role: Role }) {
  const [view, setView] = useState<"behind" | "flagged">("behind");
  const { compliance } = data;
  const total = data.scopedSections.length;
  const segments = [
    { key: "ok", label: "Compliant", value: compliance.compliant },
    { key: "warn", label: "At risk", value: compliance.atRisk },
    { key: "bad", label: "Non-compliant", value: compliance.nonCompliant },
    { key: "none", label: "Unassessed", value: compliance.unassessed },
  ];
  const rows = useMemo(() => {
    const assessed = data.scopedSections.filter((section) => section.compliance !== null);
    const list = view === "flagged" ? assessed.filter((section) => section.compliance!.status !== "Compliant") : assessed;
    return [...list].sort((a, b) => (completionOf(a) ?? 0) - (completionOf(b) ?? 0) || a.sectionCode.localeCompare(b.sectionCode));
  }, [data.scopedSections, view]);
  const shown = rows.slice(0, 6);

  return (
    <section className="analytics-card analytics-compliance" aria-labelledby="an-comp">
      <div className="analytics-card-head">
        <div>
          <h2 id="an-comp">Academic compliance</h2>
          <p>{data.selectedLab ? `Sections scheduled in ${data.selectedLab.roomCode}` : "All current-semester sections"}</p>
        </div>
        {canAccess(role, "/compliance-report") && (
          <Link className="analytics-open" to="/compliance-report" aria-label="Open CHED compliance report" title="Open CHED compliance report"><ArrowUpRight size={17} /></Link>
        )}
      </div>

      {data.loading ? <Skeleton lines={5} /> : !data.sectionsAvailable ? <Unavailable>Course sections and compliance could not be loaded.</Unavailable> : total === 0 ? (
        <Unavailable>No course sections in this selection.</Unavailable>
      ) : (
        <>
          <div className="analytics-comp-top">
            <div className="analytics-big">
              <strong>{total}</strong>
              <span>{total === 1 ? "course section" : "course sections"}</span>
            </div>
            <div className="analytics-completion">
              <div className="analytics-secondary-head">
                <span>Average confirmed-hours completion</span>
                <strong>{fmt(compliance.averagePercent, "%")}</strong>
              </div>
              <div className="analytics-thin gold" role="meter" aria-label="Average confirmed-hours completion" aria-valuemin={0} aria-valuemax={100}
                aria-valuenow={compliance.averagePercent ?? undefined} aria-valuetext={compliance.averagePercent === null ? "No assessed sections" : `${compliance.averagePercent}% completed`}>
                <span style={{ width: `${compliance.averagePercent ?? 0}%` }} />
              </div>
            </div>
          </div>

          <div className="analytics-stack" role="img"
            aria-label={`Compliance status: ${segments.map((segment) => `${segment.value} ${segment.label.toLowerCase()}`).join(", ")}.`}>
            <div className="analytics-stack-bar" aria-hidden="true">
              {segments.filter((segment) => segment.value > 0).map((segment) => (
                <span key={segment.key} className={`is-${segment.key}`} style={{ flexGrow: segment.value }} />
              ))}
            </div>
            <ul className="analytics-legend" aria-hidden="true">
              {segments.map((segment) => <li key={segment.key}><i className={`is-${segment.key}`} />{segment.label}<b>{segment.value}</b></li>)}
            </ul>
          </div>

          <div className="analytics-subhead">
            <h3>Section completion</h3>
            <div className="analytics-tabs" role="group" aria-label="Sections to show">
              <button type="button" aria-pressed={view === "behind"} onClick={() => setView("behind")}>Lowest first</button>
              <button type="button" aria-pressed={view === "flagged"} onClick={() => setView("flagged")}>Flagged only</button>
            </div>
          </div>
          {shown.length === 0 ? (
            <Unavailable>{view === "flagged" ? "No at-risk or non-compliant sections in this selection." : "No sections have been assessed yet."}</Unavailable>
          ) : (
            <ul className="analytics-sections">
              {shown.map((section) => {
                const c = section.compliance!;
                const pct = Math.round((completionOf(section) ?? 0) * 100);
                const status = STATUS[c.status] ?? { label: c.status, tone: "none" };
                return (
                  <li key={section.sectionId}>
                    <div className="analytics-section-name"><strong>{section.sectionCode}</strong><span title={section.subject.title}>{section.subject.title}</span></div>
                    <div className="analytics-section-bar">
                      <div className="analytics-thin gold" role="meter" aria-label={`${section.sectionCode} confirmed hours`} aria-valuemin={0} aria-valuemax={100}
                        aria-valuenow={pct} aria-valuetext={`${c.confirmedHoursTotal} of ${c.requiredHours} required hours confirmed`}>
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <small>{Math.round(c.confirmedHoursTotal * 10) / 10} / {c.requiredHours} h</small>
                    </div>
                    <span className={`analytics-status is-${status.tone}`}>{status.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {rows.length > shown.length && <p className="analytics-more">+{rows.length - shown.length} more in the compliance report</p>}
        </>
      )}
      <p className="analytics-footnote">Status comes from the backend classification; the gold bars show confirmed hours only.</p>
    </section>
  );
}

/* ── Row 3: laboratory comparison ──────────────────────────────────── */

function ComparisonCard({ data }: { data: DashboardOperations }) {
  const labs = data.labs;
  const sectionsPerLab = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const section of data.sections) for (const meeting of section.meetings) {
      const set = map.get(meeting.laboratory.labId) ?? new Set<number>();
      set.add(section.sectionId);
      map.set(meeting.laboratory.labId, set);
    }
    return map;
  }, [data.sections]);
  const capacityOf = (lab: (typeof labs)[number]) => (typeof lab.capacity === "number" && lab.capacity > 0 ? lab.capacity : null);
  const scale = Math.max(1, ...labs.map((lab) => Math.max(lab.workstationCount, capacityOf(lab) ?? 0)));
  const anyCapacity = labs.some((lab) => capacityOf(lab) !== null);

  return (
    <section className="analytics-card analytics-comparison" aria-labelledby="an-cmp">
      <div className="analytics-card-head">
        <div><h2 id="an-cmp">Laboratory comparison</h2><p>Registered PCs{anyCapacity ? " against room capacity" : ""}</p></div>
        <BarChart3 size={17} className="analytics-head-icon" aria-hidden="true" />
      </div>
      {data.topologyLoading ? <Skeleton lines={4} /> : !data.topologyAvailable ? <Unavailable>Laboratories could not be loaded.</Unavailable>
        : labs.length === 0 ? <Unavailable>No laboratories to compare.</Unavailable> : (
          <>
            <div className="analytics-columns" role="list">
              {labs.map((lab) => {
                const capacity = capacityOf(lab);
                const selected = data.selectedLab?.labId === lab.labId;
                const sectionCount = data.sectionsAvailable ? sectionsPerLab.get(lab.labId)?.size ?? 0 : null;
                const label = `${lab.name}: ${plural(lab.workstationCount, "registered PC")}${capacity !== null ? ` of ${capacity} capacity` : ""}${sectionCount !== null ? `, ${plural(sectionCount, "section")} with weekly meetings` : ""}`;
                return (
                  <div key={lab.labId} role="listitem" aria-label={label} className={`analytics-column ${selected ? "is-selected" : ""}`}>
                    <div className="analytics-column-track" aria-hidden="true">
                      {capacity !== null && capacity > lab.workstationCount && (
                        <span className="is-room" style={{ height: `${(capacity - lab.workstationCount) / scale * 100}%` }} />
                      )}
                      <span className="is-pcs" style={{ height: `${Math.max(lab.workstationCount ? 6 : 0, lab.workstationCount / scale * 100)}%` }}>
                        <b>{lab.workstationCount}</b>
                      </span>
                    </div>
                    <strong aria-hidden="true">{lab.roomCode || lab.name}</strong>
                    <small aria-hidden="true">{sectionCount === null ? "—" : plural(sectionCount, "section")}</small>
                  </div>
                );
              })}
            </div>
            <ul className="analytics-legend" aria-hidden="true">
              <li><i className="is-pcs" />Registered PCs</li>
              {anyCapacity && <li><i className="is-room" />Remaining capacity</li>}
            </ul>
          </>
        )}
      <p className="analytics-footnote">Per-laboratory usage isn't provided by the API, so labs are compared by registered equipment and weekly sections.</p>
    </section>
  );
}

/* ── Row 4: activity ───────────────────────────────────────────────── */

function ActivityCard({ data, role }: { data: DashboardOperations; role: Role }) {
  const schedule = data.todaySchedule;
  const recent = data.sessions.recent;
  return (
    <section className="analytics-card analytics-activity" aria-labelledby="an-act">
      <div className="analytics-card-head">
        <div><h2 id="an-act">Recent activity</h2><p>{longDate(data.today)}</p></div>
        <CalendarClock size={17} className="analytics-head-icon" aria-hidden="true" />
      </div>
      <div className="analytics-activity-cols">
        <div>
          <h3><CalendarDays size={14} aria-hidden="true" /> Today's sessions</h3>
          {schedule.length ? (
            <ol className="analytics-timeline">
              {schedule.slice(0, 5).map((entry) => (
                <li key={entry.key}>
                  <time>{timeLabel(entry.startTime)}</time>
                  <span><strong>{entry.subjectTitle}</strong><small>{entry.sectionCode} · {entry.roomCode}{entry.makeUp ? " · Make-up" : ""}</small></span>
                </li>
              ))}
            </ol>
          ) : data.loading ? <Skeleton /> : (
            <Unavailable>{data.scheduleAvailable ? "No laboratory sessions scheduled today." : "Today's schedule is unavailable."}</Unavailable>
          )}
          {schedule.length > 5 && <p className="analytics-more">+{schedule.length - 5} more today</p>}
          {canAccess(role, "/schedule") && <Link className="analytics-link" to="/schedule">View schedule</Link>}
        </div>
        <div>
          <h3><CheckCircle2 size={14} aria-hidden="true" /> Recently confirmed</h3>
          {recent.length ? (
            <ol className="analytics-feed">
              {recent.map((session) => (
                <li key={session.confirmationId}>
                  <span className="analytics-feed-icon" aria-hidden="true">{session.sessionType === "Virtual" ? <Video size={14} /> : <Monitor size={14} />}</span>
                  <span><strong>{session.subjectTitle}</strong><small>{session.sectionCode} · {session.sessionType} · {dateLabel(session.sessionDate)}</small></span>
                  <b>{session.hoursCredited}h</b>
                </li>
              ))}
            </ol>
          ) : data.loading ? <Skeleton /> : (
            <Unavailable>{data.sessions.complete ? "No finally confirmed sessions yet." : "Confirmation activity is unavailable."}</Unavailable>
          )}
          {canAccess(role, "/confirm-session") && <Link className="analytics-link" to="/confirm-session">Review confirmations</Link>}
        </div>
      </div>
    </section>
  );
}

/* ── Row 4: quick actions ──────────────────────────────────────────── */

function QuickActionsCard({ data, role }: { data: DashboardOperations; role: Role }) {
  const lab = data.selectedLab;
  const actions = [
    { to: lab ? `/workstation?lab=${lab.labId}` : "/workstation", label: "Workstations", hint: lab ? lab.roomCode : "All laboratories", icon: Monitor },
    { to: "/schedule", label: "Schedule", hint: "Weekly timetable", icon: CalendarDays },
    { to: pendingConfirmationsPath({ labId: lab?.labId, ayId: data.academicYearId }), label: "Confirm Sessions", hint: "Review and finalize", icon: ClipboardCheck },
    { to: lab ? `/attendance-report?lab=${lab.labId}` : "/attendance-report", label: "Attendance reports", hint: "Recorded logins", icon: FileText },
    { to: "/weekly-report", label: "Weekly report", hint: "Week summary", icon: BarChart3 },
    { to: "/compliance-report", label: "CHED compliance", hint: "Hours per section", icon: ShieldCheck },
    { to: "/at-risk", label: "At Risk", hint: "Flagged sections", icon: ShieldAlert },
  ].filter((action) => canAccess(role, action.to.split("?")[0]));

  return (
    <section className="analytics-card analytics-quick-actions" aria-labelledby="an-quick">
      <div className="analytics-card-head">
        <div><h2 id="an-quick">Quick actions</h2><p>{lab ? `Filtered to ${lab.roomCode} where supported` : "Go to a workspace"}</p></div>
        <Building2 size={17} className="analytics-head-icon" aria-hidden="true" />
      </div>
      {actions.length === 0 ? <Unavailable>No shortcuts are available for your role.</Unavailable> : (
        <nav aria-label="Dashboard shortcuts">
          <ul className="analytics-actions">
            {actions.map(({ to, label, hint, icon: Icon }) => (
              <li key={label}>
                <Link to={to}>
                  <span className="analytics-action-icon" aria-hidden="true"><Icon size={16} /></span>
                  <span><strong>{label}</strong><small>{hint}</small></span>
                  <ArrowUpRight size={15} className="analytics-action-arrow" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </section>
  );
}