import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Eye,
  FileText,
  Globe,
  Hash,
  KeyRound,
  ListFilter,
  Lock,
  RefreshCw,
  ScrollText,
  Settings2,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getAuditLog, AUDIT_ROLES, type AuditLogPage } from "@/api/auditLog";
import { ApiError } from "@/api/client";
import "./audit-log.css";

const PAGE_SIZE = 50;
const ALL = "all";

type Entry = AuditLogPage["items"][number];
type Category = "confirm" | "attendance" | "account" | "settings";

// The actions the backend writes, with a plain label and a category for each.
const ACTIONS: { value: string; label: string; category: Category }[] = [
  { value: "SessionFacultyConfirmed", label: "Faculty confirmed a session", category: "confirm" },
  { value: "SessionFinalConfirmed", label: "Final confirmation (hours credited)", category: "confirm" },
  { value: "AttendanceManuallyRecorded", label: "Attendance recorded manually", category: "attendance" },
  { value: "WorkstationStaffUnlocked", label: "Staff unlocked a PC", category: "attendance" },
  { value: "UserLoggedIn", label: "Login", category: "account" },
  { value: "PasswordChanged", label: "Password changed", category: "account" },
  { value: "UserCreated", label: "Account created", category: "account" },
  { value: "SessionStatusMarked", label: "Class status marked", category: "attendance" },
  { value: "ReportTemplateUploaded", label: "Report template uploaded", category: "settings" },
  { value: "ReportTemplateReset", label: "Report template reset", category: "settings" },
  { value: "AcademicYearCreated", label: "Semester added", category: "settings" },
  { value: "AcademicYearUpdated", label: "Semester edited", category: "settings" },
  { value: "AcademicYearActivated", label: "Semester made active", category: "settings" },
  { value: "AcademicYearDeleted", label: "Semester deleted", category: "settings" },
  { value: "MakeUpClassCreated", label: "Make-up class added", category: "attendance" },
  { value: "MakeUpClassDeleted", label: "Make-up class removed", category: "attendance" },
  { value: "RemindersAutoSendOn", label: "Automatic emails turned on", category: "settings" },
  { value: "RemindersAutoSendOff", label: "Automatic emails turned off", category: "settings" },
];
const labelFor = (action: string) => ACTIONS.find((a) => a.value === action)?.label ?? action;
const categoryFor = (action: string): Category => ACTIONS.find((a) => a.value === action)?.category ?? "settings";
const CATEGORY_ICON: Record<Category, ReactNode> = {
  confirm: <ClipboardCheck size={12} />,
  attendance: <UsersRound size={12} />,
  account: <KeyRound size={12} />,
  settings: <Settings2 size={12} />,
};

const fmtTime = (v: string) => new Date(v).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const fmtDate = (v: string) => new Date(v).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
const fmtFull = (v: string) => new Date(v).toLocaleString([], { dateStyle: "full", timeStyle: "medium" });
function initials(name: string) {
  const parts = (name ?? "").replace(/,/g, " ").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function AuditLogPage() {
  const { role } = useRole();
  const allowed = role === "Administrator" || role === "Custodian";

  const [action, setAction] = useState("");
  const [role_, setRoleFilter] = useState("");
  const [withStudentLogins, setWithStudentLogins] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [data, setData] = useState<AuditLogPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<Entry["auditId"] | null>(null);
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  const [wide, setWide] = useState(() => window.matchMedia("(min-width:1600px)").matches);

  useEffect(() => {
    const media = window.matchMedia("(min-width:1600px)");
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false; // ignore a slower, older response if filters changed meanwhile
    setIsLoading(true);
    setError(null);
    getAuditLog({ action: action || undefined, role: role_ || undefined, includeStudentLogins: withStudentLogins, from: from || undefined, to: to || undefined, page, pageSize: PAGE_SIZE })
      .then((result) => { if (!cancelled) setData(result); })
      .catch((e) => { if (!cancelled) setError(e instanceof ApiError ? e.message : "Could not load the audit log."); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [allowed, action, role_, withStudentLogins, from, to, page, reloadKey]);

  if (!allowed) {
    return (
      <div className="audit-restricted">
        <div>Restricted</div>
        <p>This page is only available to the Custodian and Administrator roles.</p>
      </div>
    );
  }

  // Choosing the Student role shows their logins whatever the toggle says.
  const studentLoginsShown = withStudentLogins || role_ === "Student";
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = data?.items ?? [];
  const firstShown = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(page * PAGE_SIZE, total);
  const rangeInvalid = !!from && !!to && from > to;
  const hasFilters = action !== "" || role_ !== "" || withStudentLogins || from !== "" || to !== "";
  const selected = selectedId === null ? null : items.find((e) => e.auditId === selectedId) ?? null;

  // Changing a filter goes back to the first page.
  const filter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); setSelectedId(null); };
  function reset() {
    setAction(""); setRoleFilter(""); setWithStudentLogins(false); setFrom(""); setTo(""); setPage(1); setSelectedId(null);
  }
  function goTo(p: number) {
    setPage(p);
    setSelectedId(null);
  }
  function openEntry(entry: Entry, element: HTMLElement) {
    setReturnFocus(element);
    setSelectedId(entry.auditId);
  }
  function clickRow(event: MouseEvent<HTMLElement>, entry: Entry) {
    if ((event.target as HTMLElement).closest("button,a")) return;
    openEntry(entry, event.currentTarget.querySelector<HTMLButtonElement>(".audit-view") ?? event.currentTarget);
  }

  return (
    <div className="audit-page">
      <header className="audit-heading">
        <div>
          <p className="audit-eyebrow">SYSTEM ADMINISTRATION / AUDIT TRAIL</p>
          <div className="audit-heading-title">
            <h1>Audit Log</h1>
            <span className="audit-readonly"><Lock size={11} /> Read-only</span>
          </div>
          <p>
            Who did what, and when. Entries are written by the system and cannot be edited or deleted here.
            Student logins are left out by default, since there is one for every class on every PC.
          </p>
        </div>
        <button className="audit-refresh" onClick={() => setReloadKey((k) => k + 1)} disabled={isLoading}>
          <RefreshCw size={14} className={isLoading ? "audit-spin" : ""} /> Refresh
        </button>
      </header>

      <div className={`audit-layout ${selected && wide ? "has-inspector" : ""}`}>
        <section className="audit-workspace" aria-labelledby="audit-workspace-heading">
          {/* Filters */}
          <div className="audit-toolbar" role="group" aria-label="Audit log filters">
            <SearchableSelect
              ariaLabel="Action"
              value={action || ALL}
              onValueChange={(v: string) => filter(setAction)(v === ALL ? "" : v)}
              options={[{ value: ALL, label: "All actions" }, ...ACTIONS.map((a) => ({ value: a.value, label: a.label }))]}
              leadingIcon={<ListFilter size={15} />}
              searchPlaceholder="Search actions…"
            />
            <SearchableSelect
              ariaLabel="Role"
              value={role_ || ALL}
              onValueChange={(v: string) => filter(setRoleFilter)(v === ALL ? "" : v)}
              options={[{ value: ALL, label: "All roles" }, ...AUDIT_ROLES.map((r) => ({ value: r.value, label: r.label }))]}
              leadingIcon={<UserRound size={15} />}
              searchPlaceholder="Search roles…"
            />
            <div className={`audit-range ${rangeInvalid ? "is-invalid" : ""}`} title={rangeInvalid ? "Start date is after the end date" : "Leave blank for all dates"}>
              <CalendarRange size={15} />
              <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => filter(setFrom)(e.target.value)} />
              <span aria-hidden="true">→</span>
              <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => filter(setTo)(e.target.value)} />
              {(from || to) && (
                <button aria-label="Clear dates" onClick={() => { filter(setFrom)(""); setTo(""); }}>
                  <X size={13} />
                </button>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={studentLoginsShown}
              disabled={role_ === "Student"}
              onClick={() => filter(setWithStudentLogins)(!withStudentLogins)}
              className={`audit-switch ${studentLoginsShown ? "is-on" : ""}`}
              title={role_ === "Student" ? "Always shown when filtering by the Student role" : undefined}
            >
              <span className="audit-switch-track"><span /></span>
              Include student logins
            </button>
          </div>

          {/* Context */}
          <div className="audit-table-context">
            <div>
              <h2 id="audit-workspace-heading">Activity</h2>
              <span role="status">
                {isLoading && !data ? "Loading entries…" : error && !data ? "Entries unavailable" : `${total.toLocaleString()} ${total === 1 ? "entry" : "entries"}`}
              </span>
              {isLoading && data && <span className="audit-updating"><RefreshCw size={11} className="audit-spin" /> Updating</span>}
            </div>
            {hasFilters && <button className="audit-reset" onClick={reset}>Reset filters</button>}
          </div>

          {error && data && (
            <div className="audit-data-note" role="alert">
              <CircleAlert size={14} />
              <p>{error} The entries below are from the last successful load.</p>
              <button onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
            </div>
          )}

          {/* Body */}
          {error && !data ? (
            <div className="audit-page-state" role="alert">
              <CircleAlert size={29} />
              <h3>The audit log could not be loaded</h3>
              <p>{error}</p>
              <button onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
            </div>
          ) : !data ? (
            <div className="audit-skeleton" role="status">
              <span className="sr-only">Loading audit entries</span>
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} aria-hidden="true"><span /><span /><span /><span /></div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="audit-page-state">
              <ScrollText size={30} />
              <h3>No entries match these filters</h3>
              <p>Try another action, role, or date range{!studentLoginsShown ? ", or include student logins" : ""}.</p>
              {hasFilters && <button onClick={reset}>Reset filters</button>}
            </div>
          ) : (
            <div className={isLoading ? "audit-dim" : undefined}>
              <div className="audit-table-scroll">
                <table className="audit-table">
                  <caption className="sr-only">Audit log entries, newest first as returned by the server</caption>
                  <thead>
                    <tr>
                      <th scope="col">When</th>
                      <th scope="col">Who</th>
                      <th scope="col">Action</th>
                      <th scope="col">Details</th>
                      <th scope="col">From</th>
                      <th scope="col"><span className="sr-only">View entry</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((e) => {
                      const isSel = selectedId === e.auditId;
                      return (
                        <tr key={e.auditId} className={isSel ? "is-selected" : ""} onClick={(ev) => clickRow(ev, e)}>
                          <td>
                            <span className="audit-time">{fmtTime(e.timestamp)}</span>
                            <small>{fmtDate(e.timestamp)}</small>
                          </td>
                          <td>
                            <div className="audit-who">
                              <span className="audit-avatar">{initials(e.user)}</span>
                              <div>
                                <span className="audit-user">{e.user}</span>
                                {(e.userRole || e.userSchoolId) && <small>{[e.userRole, e.userSchoolId].filter(Boolean).join(" · ")}</small>}
                              </div>
                            </div>
                          </td>
                          <td><ActionBadge action={e.action} /></td>
                          <td>{e.details ? <span className="audit-details" title={e.details}>{e.details}</span> : <span className="audit-none">—</span>}</td>
                          <td><span className="audit-ip">{e.ipAddress ?? "—"}</span></td>
                          <td>
                            <button className="audit-view" aria-label={`View entry from ${fmtFull(e.timestamp)}`} aria-expanded={isSel} onClick={(ev) => openEntry(e, ev.currentTarget)}>
                              <Eye size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="audit-mobile-list">
                {items.map((e) => (
                  <article key={e.auditId} className={`audit-mobile-row ${selectedId === e.auditId ? "is-selected" : ""}`}>
                    <button className="audit-mobile-title" onClick={(ev) => openEntry(e, ev.currentTarget)}>
                      <ActionBadge action={e.action} />
                      <time>{fmtTime(e.timestamp)} · {fmtDate(e.timestamp)}</time>
                    </button>
                    <p className="audit-mobile-who"><strong>{e.user}</strong>{e.userRole && <span> · {e.userRole}</span>}</p>
                    {e.details && <p className="audit-mobile-details">{e.details}</p>}
                  </article>
                ))}
              </div>
            </div>
          )}

          <footer className="audit-workspace-footer">
            <span><ShieldCheck size={13} /> Entries are written by the system and cannot be changed from this page.</span>
            {data && total > 0 && (
              <nav className="audit-pager" aria-label="Audit log pages">
                <span>{firstShown.toLocaleString()}–{lastShown.toLocaleString()} of {total.toLocaleString()}</span>
                <button onClick={() => goTo(Math.max(1, page - 1))} disabled={page <= 1 || isLoading} aria-label="Previous page"><ChevronLeft size={15} /></button>
                <span className="audit-page-num">Page {page} of {lastPage}</span>
                <button onClick={() => goTo(Math.min(lastPage, page + 1))} disabled={page >= lastPage || isLoading} aria-label="Next page"><ChevronRight size={15} /></button>
              </nav>
            )}
          </footer>
        </section>

        <EntryInspector entry={selected} wide={wide} returnFocus={returnFocus} onClose={() => setSelectedId(null)} />
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const category = categoryFor(action);
  return (
    <span className={`audit-badge audit-badge-${category}`}>
      {CATEGORY_ICON[category]}
      {labelFor(action)}
    </span>
  );
}

function EntryInspector({ entry, wide, returnFocus, onClose }: { entry: Entry | null; wide: boolean; returnFocus: HTMLElement | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = entry !== null;

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

  if (!entry) return null;

  const panel = (
    <aside className={`audit-inspector ${wide ? "audit-inspector-inline" : "audit-inspector-drawer"}`} aria-label="Audit entry details" role={wide ? undefined : "dialog"} aria-modal={wide ? undefined : true}>
      <div className="audit-inspector-heading">
        <div>
          <p className="audit-eyebrow">AUDIT ENTRY</p>
          <h2>{labelFor(entry.action)}</h2>
          <p>{fmtFull(entry.timestamp)}</p>
        </div>
        <button ref={closeRef} aria-label="Close entry details" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="audit-inspector-body">
        <div className="audit-inspector-card">
          <h4><UserRound size={14} /> Performed by</h4>
          <div className="audit-inspector-user">
            <span className="audit-avatar is-large">{initials(entry.user)}</span>
            <div>
              <strong>{entry.user}</strong>
              <span>{[entry.userRole, entry.userSchoolId].filter(Boolean).join(" · ") || "No role recorded"}</span>
            </div>
          </div>
        </div>

        <div className="audit-details-panel">
          <h4><FileText size={14} /> Details</h4>
          {entry.details ? <p>{entry.details}</p> : <p className="audit-details-empty">No details were recorded for this entry.</p>}
        </div>

        <div className="audit-inspector-card">
          <h4><Hash size={14} /> Record</h4>
          <dl>
            <div><dt>Action</dt><dd><ActionBadge action={entry.action} /></dd></div>
            <div><dt>System code</dt><dd className="is-mono">{entry.action}</dd></div>
            <div><dt><Globe size={12} /> IP address</dt><dd className="is-mono">{entry.ipAddress ?? "—"}</dd></div>
            <div><dt>Entry ID</dt><dd className="is-mono">#{entry.auditId}</dd></div>
          </dl>
        </div>

        <p className="audit-inspector-note"><Lock size={12} /> This entry is read-only and kept for compliance review.</p>
      </div>
    </aside>
  );

  if (wide) return panel;
  return (
    <div className="audit-drawer-root">
      <div className="audit-drawer-overlay" onClick={onClose} aria-hidden="true" />
      {panel}
    </div>
  );
}