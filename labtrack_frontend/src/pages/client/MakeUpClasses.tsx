import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, CircleAlert, Eye, FileText, Search, Trash2, X } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { getCourseSections, type CourseSectionSummary } from "@/api/courseSections";
import { getLaboratories, type LaboratorySummary } from "@/api/laboratories";
import {
  createMakeUpClass, deleteMakeUpClass, getMakeUpClasses, openMakeUpAttachment, type MakeUpClass,
} from "@/api/makeUpClasses";
import { ApiError } from "@/api/client";
import { snackbar } from "@/utils/snackbar";
import { MakeUpForm, type MakeUpPayload } from "./makeup/MakeUpForm";
import { MakeUpDetails } from "./makeup/MakeUpDetails";
import { SessionBadge } from "./makeup/SessionBadge";
import { dateLabel, durationText, parseLocalDate, timeLabel } from "./makeup/timeSlots";
import "./makeup-classes.css";

type SessionFilter = "all" | "none" | "progress" | "confirmed";
const FILTERS: { value: SessionFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "none", label: "Not confirmed" },
  { value: "progress", label: "In progress" },
  { value: "confirmed", label: "Confirmed" },
];
const sessionKind = (m: MakeUpClass): SessionFilter => (m.session === "Confirmed" ? "confirmed" : m.session ? "progress" : "none");

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function MakeUpClassesPage() {
  const { role } = useRole();
  const allowed = role === "Custodian" || role === "Administrator" || role === "LabAssistant";

  const [list, setList] = useState<MakeUpClass[]>([]);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [sections, setSections] = useState<CourseSectionSummary[]>([]);
  const [sectionsFailed, setSectionsFailed] = useState(false);
  const [labs, setLabs] = useState<LaboratorySummary[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // blocks a second submit before React re-renders
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<MakeUpClass["makeUpId"] | null>(null);
  const [opening, setOpening] = useState(false);

  const [search, setSearch] = useState("");
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>("all");

  const load = () =>
    getMakeUpClasses()
      .then((rows) => { setList(rows); setListState("ready"); })
      .catch(() => setListState((s) => (s === "ready" ? "ready" : "error")));

  useEffect(() => {
    if (!allowed) return;
    load();
    getCourseSections().then((s) => { setSections(s); setSectionsFailed(false); }).catch(() => { setSections([]); setSectionsFailed(true); });
    getLaboratories().then(setLabs).catch(() => setLabs([]));
  }, [allowed]);

  const counts = useMemo(() => {
    const c: Record<SessionFilter, number> = { all: list.length, none: 0, progress: 0, confirmed: 0 };
    for (const m of list) c[sessionKind(m)]++;
    return c;
  }, [list]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((m) =>
      (sessionFilter === "all" || sessionKind(m) === sessionFilter) &&
      (!q || [m.sectionCode, m.subjectCode, m.subjectTitle, m.faculty ?? "", m.roomCode, m.reason ?? "", m.createdBy].some((v) => v.toLowerCase().includes(q))));
  }, [list, search, sessionFilter]);

  const selected = selectedId === null ? null : list.find((m) => m.makeUpId === selectedId) ?? null;

  if (!allowed) {
    return <div className="py-24 text-center text-[13px]" style={{ color: "#57606a" }}>This page is only available to staff.</div>;
  }

  const openForm = () => { setShowForm(true); setFormError(null); };

  const save = async (p: MakeUpPayload) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setFormError(null);
    try {
      await createMakeUpClass({
        sectionId: p.sectionId, labId: p.labId, date: p.date,
        startTime: p.startTime, endTime: p.endTime, reason: p.reason, attachment: p.attachment,
      });
      const s = sections.find((x) => x.sectionId === p.sectionId);
      snackbar.success(`Make-up class for ${s?.sectionCode ?? "the class"} on ${dateLabel(p.date)} saved. Students can log in for it on the PC Agent that day.`);
      setShowForm(false);
      await load();
    } catch (e) {
      // Keep the drawer open with everything filled in, so the user can fix and retry.
      setFormError(e instanceof ApiError ? e.message : "Could not save the make-up class.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const remove = async (m: MakeUpClass) => {
    if (busyRef.current) return;
    if (!window.confirm(`Remove the make-up class for ${m.sectionCode} on ${dateLabel(m.date)}?`)) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await deleteMakeUpClass(m.makeUpId);
      snackbar.success("Make-up class removed.");
      setSelectedId(null);
      await load();
    } catch (e) {
      snackbar.error(e instanceof ApiError ? e.message : "Could not remove it.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const openAttachment = (m: MakeUpClass) => {
    setOpening(true);
    openMakeUpAttachment(m.makeUpId)
      .catch((e) => snackbar.error(e instanceof ApiError ? e.message : "Could not open the attachment."))
      .finally(() => setOpening(false));
  };

  const today = todayIso();
  const hasFilters = search.trim() !== "" || sessionFilter !== "all";

  return (
    <div className="mk-page">
      <header className="mk-heading">
        <div>
          <p className="mk-eyebrow">ACADEMIC MANAGEMENT / MAKE-UP SESSIONS</p>
          <h1>Make-up Classes</h1>
          <p>Manage approved make-up laboratory sessions, scheduled time slots, and supporting documents.</p>
        </div>
        <button type="button" className="mk-btn is-primary is-lg" onClick={openForm}>
          <CalendarPlus size={15} className="mk-gold" /> Add Make-up Class
        </button>
      </header>

      <section className="mk-card">
        {listState === "ready" && list.length > 0 && (
          <div className="mk-toolbar">
            <label className="mk-search">
              <Search size={15} />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search class, subject, faculty, lab or reason…" aria-label="Search make-up classes" />
              {search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")}><X size={13} /></button>}
            </label>
            <div className="mk-seg" role="group" aria-label="Session status">
              {FILTERS.map((f) => (
                <button key={f.value} type="button" aria-pressed={sessionFilter === f.value} className={sessionFilter === f.value ? "is-on" : ""} onClick={() => setSessionFilter(f.value)}>
                  {f.label} <span>{counts[f.value]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {listState === "loading" ? (
          <div className="mk-skeleton" role="status">
            <span className="sr-only">Loading make-up classes</span>
            {Array.from({ length: 5 }, (_, i) => <div key={i} aria-hidden="true"><span /><span /><span /><span /></div>)}
          </div>
        ) : listState === "error" ? (
          <div className="mk-state" role="alert">
            <CircleAlert size={28} />
            <h3>Make-up classes could not be loaded</h3>
            <p>This is a connection or server problem, not an empty list.</p>
            <button type="button" className="mk-btn" onClick={() => { setListState("loading"); load(); }}>Try again</button>
          </div>
        ) : list.length === 0 ? (
          <div className="mk-state">
            <span className="mk-state-icon"><CalendarPlus size={24} /></span>
            <h3>No make-up classes this semester</h3>
            <p>When a make-up request is approved, record it here with the approved request attached. It then works like a regular lab meeting on that date.</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="mk-state">
            <Search size={24} />
            <h3>No matching make-up classes</h3>
            <p>Try another class, subject, faculty, lab, or session status.</p>
            {hasFilters && <button type="button" className="mk-btn" onClick={() => { setSearch(""); setSessionFilter("all"); }}>Clear filters</button>}
          </div>
        ) : (
          <div className="mk-table-scroll">
            <table className="mk-table">
              <caption className="sr-only">Recorded make-up classes</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Time</th>
                  <th scope="col">Class</th>
                  <th scope="col">Lab</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Approved request</th>
                  <th scope="col">Session</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const day = m.date.slice(0, 10);
                  const when = day === today ? "Today" : parseLocalDate(day) > parseLocalDate(today) ? "Upcoming" : null;
                  return (
                    <tr key={m.makeUpId} className={selectedId === m.makeUpId ? "is-selected" : ""}
                      onClick={(e) => { if (!(e.target as HTMLElement).closest("button,a")) setSelectedId(m.makeUpId); }}>
                      <td>
                        <span className="mk-date">{dateLabel(m.date)}</span>
                        {when && <span className={`mk-when ${when === "Today" ? "is-today" : ""}`}>{when}</span>}
                      </td>
                      <td>
                        <span className="mk-time">{timeLabel(m.startTime)} – {timeLabel(m.endTime)}</span>
                        <small>{durationText(m.startTime, m.endTime) ?? `${m.hours}h`}</small>
                      </td>
                      <td>
                        <span className="mk-class"><b>{m.sectionCode}</b> {m.subjectCode}</span>
                        <span className="mk-class-title">{m.subjectTitle}</span>
                        <small>{m.faculty ?? "No faculty assigned"}</small>
                      </td>
                      <td><span className="mk-lab">{m.roomCode}</span></td>
                      <td className="mk-reason">{m.reason ? <span title={m.reason}>{m.reason}</span> : <span className="mk-muted">—</span>}</td>
                      <td>
                        <button type="button" className="mk-attach" onClick={() => openAttachment(m)} disabled={opening} title={m.attachmentName}>
                          <FileText size={13} /> <span>{m.attachmentName}</span>
                        </button>
                        <small>by {m.createdBy}</small>
                      </td>
                      <td><SessionBadge session={m.session} /></td>
                      <td className="mk-actions">
                        <button type="button" className="mk-icon-btn" aria-label={`View make-up class ${m.sectionCode} on ${dateLabel(m.date)}`} onClick={() => setSelectedId(m.makeUpId)}>
                          <Eye size={15} />
                        </button>
                        {!m.session && (
                          <button type="button" className="mk-icon-btn is-danger" title="Remove" aria-label={`Remove make-up class ${m.sectionCode} on ${dateLabel(m.date)}`} disabled={busy} onClick={() => remove(m)}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {listState === "ready" && list.length > 0 && (
          <footer className="mk-card-foot">
            Showing {rows.length} of {list.length}. Saving a make-up class does not credit hours; they count after the session's final confirmation.
          </footer>
        )}
      </section>

      {showForm && (
        <MakeUpForm
          sections={sections}
          sectionsFailed={sectionsFailed}
          labs={labs}
          existing={list}
          busy={busy}
          error={formError}
          onSave={save}
          onCancel={() => { if (!busyRef.current) { setShowForm(false); setFormError(null); } }}
        />
      )}

      {selected && !showForm && (
        <MakeUpDetails
          item={selected}
          busy={busy}
          opening={opening}
          onOpenAttachment={() => openAttachment(selected)}
          onRemove={() => remove(selected)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
