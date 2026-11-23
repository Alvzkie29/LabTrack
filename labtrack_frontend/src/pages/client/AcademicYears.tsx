import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle, CalendarClock, CalendarDays, CalendarPlus, CalendarRange, Check, CircleAlert, History, Info, Loader2,
  Pencil, Power, Trash2, X,
} from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import {
  activateAcademicYear, createAcademicYear, deleteAcademicYear, getAcademicYears, semesterName, updateAcademicYear,
  TERM_LABELS, type AcademicYear, type SaveAcademicYear, type TermType,
} from "@/api/academicYears";
import { ApiError } from "@/api/client";
import "./academic-years.css";

/* ── Dates: plain "YYYY-MM-DD" strings, read as local dates (no UTC shift) ── */
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");
const local = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const nice = (iso: string | null) =>
  iso ? local(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const short = (iso: string) => local(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const daysBetween = (a: string, b: string) => Math.round((local(b).getTime() - local(a).getTime()) / 86_400_000);
const weeks = (a: string, b: string) => Math.max(0, Math.round(daysBetween(a, b) / 7));
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A blank form for the semester after the newest one (unchanged). */
function nextSemester(years: AcademicYear[]): SaveAcademicYear {
  const y = new Date().getFullYear();
  const newest = years[0];
  if (!newest) return { label: `${y}-${y + 1}`, termType: "FirstSemester", startDate: "", endDate: "", secondTermStart: "" };
  const [a] = newest.label.split("-").map(Number);
  if (newest.termType === "FirstSemester")
    return { label: newest.label, termType: "SecondSemester", startDate: "", endDate: "", secondTermStart: "" };
  return { label: `${a + 1}-${a + 2}`, termType: "FirstSemester", startDate: "", endDate: "", secondTermStart: "" };
}

/* ── Presentation-only states, derived from the records and today's date ── */
type Phase = "active" | "upcoming" | "historical" | "current";
function phaseOf(y: AcademicYear, today: string): Phase {
  if (y.isActive) return "active";
  const start = day(y.startDate);
  const end = day(y.endDate);
  if (start && today < start) return "upcoming";
  if (end && today > end) return "historical";
  return "current"; // today is inside its dates but another semester is active
}
const PHASE_LABEL: Record<Phase, string> = { active: "Active", upcoming: "Upcoming", historical: "Historical", current: "In its dates, not active" };

/** What is missing for the calendar to be fully configured. */
function incompleteReasons(y: Pick<AcademicYear, "termType" | "startDate" | "endDate" | "secondTermStart">) {
  const out: string[] = [];
  if (!y.startDate || !y.endDate) out.push("start or end date missing");
  if (y.termType !== "Summer" && !y.secondTermStart) out.push("2nd term start not set");
  return out;
}

/** Other semesters whose dates share at least one day with [start, end] (inclusive). */
function overlapsOf(start: string, end: string, years: AcademicYear[], excludeId: number | null) {
  if (!start || !end || end < start) return [];
  return years
    .filter((o) => o.ayId !== excludeId && day(o.startDate) && day(o.endDate))
    .filter((o) => start <= day(o.endDate) && day(o.startDate) <= end)
    .map((o) => {
      const from = start > day(o.startDate) ? start : day(o.startDate);
      const to = end < day(o.endDate) ? end : day(o.endDate);
      return { other: o, from, to };
    });
}

/** Where today falls. Mirrors the documented rule: weeks restart on the day the 2nd term starts. Display only. */
function position(y: AcademicYear, today: string) {
  const start = day(y.startDate);
  const end = day(y.endDate);
  if (!start || !end || today < start || today > end) return null;
  const second = y.termType !== "Summer" ? day(y.secondTermStart) : "";
  const inSecond = second !== "" && today >= second;
  const termStart = inSecond ? second : start;
  return {
    week: Math.floor(daysBetween(termStart, today) / 7) + 1,
    term: y.termType === "Summer" ? "Summer term" : inSecond ? "2nd term" : "1st term",
    daysLeft: daysBetween(today, end),
  };
}

type Editing = { id: number | null; form: SaveAcademicYear; focusSecond?: boolean };
type Confirm = { kind: "activate" | "delete"; y: AcademicYear };

export function AcademicYearsPage() {
  const { role } = useRole();
  const allowed = role === "Custodian" || role === "Administrator";

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = () =>
    getAcademicYears()
      .then((ys) => { setYears(ys); setLoadState("ready"); })
      .catch(() => setLoadState((s) => (s === "ready" ? "ready" : "error")));
  useEffect(() => { if (allowed) load(); }, [allowed]);

  const today = todayIso();
  // API order (newest first), grouped by school year.
  const groups = useMemo(() => {
    const map = new Map<string, AcademicYear[]>();
    for (const y of years) map.set(y.label, [...(map.get(y.label) ?? []), y]);
    return [...map.entries()];
  }, [years]);
  const active = years.find((y) => y.isActive) ?? null;

  if (!allowed) {
    return <div className="ay-restricted">This page is only available to the Custodian and Administrator roles.</div>;
  }

  /** One change at a time. Success is shown only after the server confirms; failures stay in the open form/dialog. */
  const run = async (work: () => Promise<unknown>, done: string, where: "dialog" | "page") => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(null); setDialogError(null); setMessage(null);
    try {
      await work();
      setMessage(done);
      setEditing(null);
      setConfirm(null);
      await load();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Something went wrong.";
      if (where === "dialog") setDialogError(msg);
      else setError(msg);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const save = () => {
    if (!editing) return;
    const f = editing.form;
    const body: SaveAcademicYear = { ...f, label: f.label.trim(), secondTermStart: f.termType === "Summer" || !f.secondTermStart ? null : f.secondTermStart };
    const name = `${TERM_LABELS[f.termType]} ${body.label}`;
    return run(
      () => (editing.id === null ? createAcademicYear(body) : updateAcademicYear(editing.id, body)),
      editing.id === null ? `${name} added.` : `${name} saved.`,
      "dialog",
    );
  };

  const clearNotes = () => { setError(null); setDialogError(null); setMessage(null); };
  const openNew = () => { clearNotes(); setEditing({ id: null, form: nextSemester(years) }); };
  const openEdit = (y: AcademicYear, focusSecond = false) => {
    clearNotes();
    setEditing({ id: y.ayId, focusSecond, form: {
      label: y.label, termType: y.termType as TermType,
      startDate: day(y.startDate), endDate: day(y.endDate), secondTermStart: day(y.secondTermStart),
    } });
  };
  const ask = (kind: Confirm["kind"], y: AcademicYear) => { clearNotes(); setConfirm({ kind, y }); };
  const closeDialogs = () => { if (!busyRef.current) { setEditing(null); setConfirm(null); setDialogError(null); } };

  return (
    <div className="ay-page">
      <header className="ay-heading">
        <div>
          <p className="ay-eyebrow">SETUP / ACADEMIC PERIODS</p>
          <h1>Academic Years</h1>
          <p>
            Each semester keeps its own classes, sessions and reports. Add the new semester before importing its lab schedule,
            then make it active. Weeks are counted per term, starting again on the day the 2nd term starts.
          </p>
        </div>
        <button type="button" className="ay-btn is-primary is-lg" onClick={openNew} disabled={busy}>
          <CalendarPlus size={15} className="ay-gold" /> Add semester
        </button>
      </header>

      {message && (
        <div className="ay-alert is-ok" role="status">
          <Check size={14} /> <span>{message}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setMessage(null)}><X size={13} /></button>
        </div>
      )}
      {error && (
        <div className="ay-alert is-error" role="alert">
          <CircleAlert size={14} /> <span>{error}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setError(null)}><X size={13} /></button>
        </div>
      )}

      {loadState === "ready" && (active ? (
        <ActiveSemester y={active} today={today} years={years} onSetSecond={() => openEdit(active, true)} />
      ) : years.length > 0 ? (
        <div className="ay-alert is-warn"><AlertTriangle size={14} /> <span>No semester is active. Pages that use the current semester will have nothing to show until one is made active.</span></div>
      ) : null)}

      <section className="ay-card" aria-label="Semesters">
        {loadState === "loading" ? (
          <div className="ay-skeleton" role="status">
            <span className="sr-only">Loading academic periods</span>
            {Array.from({ length: 3 }, (_, i) => <div key={i} aria-hidden="true"><span /><span /><span /></div>)}
          </div>
        ) : loadState === "error" ? (
          <div className="ay-state" role="alert">
            <CircleAlert size={26} />
            <h3>Academic periods could not be loaded</h3>
            <p>This is a connection or server problem, not an empty list.</p>
            <button type="button" className="ay-btn" onClick={() => { setLoadState("loading"); load(); }}>Try again</button>
          </div>
        ) : years.length === 0 ? (
          <div className="ay-state">
            <span className="ay-state-icon"><CalendarRange size={24} /></span>
            <h3>No semesters yet</h3>
            <p>Add the current semester first. Its lab schedule can be imported once it exists.</p>
            <button type="button" className="ay-btn is-primary" onClick={openNew}><CalendarPlus size={14} className="ay-gold" /> Add semester</button>
          </div>
        ) : (
          groups.map(([label, list]) => (
            <div key={label} className="ay-group">
              <div className="ay-group-head"><span>School year</span><b>{label}</b></div>
              <ul>
                {list.map((y) => (
                  <SemesterRow key={y.ayId} y={y} years={years} today={today} busy={busy}
                    onEdit={() => openEdit(y)} onSetSecond={() => openEdit(y, true)}
                    onActivate={() => ask("activate", y)} onDelete={() => ask("delete", y)} />
                ))}
              </ul>
            </div>
          ))
        )}
        {loadState === "ready" && years.length > 0 && (
          <footer className="ay-card-foot">
            <Info size={12} /> States are worked out from each semester's dates; only the semester you make active is used as the default across LabTrack. A semester can be deleted only when it is not active and has no classes.
          </footer>
        )}
      </section>

      {editing && (
        <SemesterDrawer editing={editing} years={years} busy={busy} error={dialogError}
          onChange={(form) => setEditing({ ...editing, form })} onSave={save} onCancel={closeDialogs} />
      )}

      {confirm?.kind === "activate" && (
        <ConfirmDialog
          title="Make this semester active?"
          confirmLabel="Make active"
          icon={<Power size={18} />}
          busy={busy}
          error={dialogError}
          onConfirm={() => run(() => activateAcademicYear(confirm.y.ayId), `${semesterName(confirm.y)} is now active.`, "dialog")}
          onCancel={closeDialogs}
        >
          <p><b>{semesterName(confirm.y)}</b> ({nice(confirm.y.startDate)} – {nice(confirm.y.endDate)}) becomes the default academic period across LabTrack: Schedule, Courses, Class Status, reports and the PC Agent will use it{active ? <>, instead of <b>{semesterName(active)}</b></> : ""}.</p>
          <p>Nothing is deleted or copied. Earlier semesters keep their classes, attendance and confirmed hours.</p>
          <ActivationWarnings y={confirm.y} years={years} today={today} />
        </ConfirmDialog>
      )}

      {confirm?.kind === "delete" && (
        <ConfirmDialog
          title="Delete this semester?"
          confirmLabel="Delete semester"
          tone="danger"
          icon={<Trash2 size={18} />}
          busy={busy}
          error={dialogError}
          onConfirm={() => run(() => deleteAcademicYear(confirm.y.ayId), `${semesterName(confirm.y)} deleted.`, "dialog")}
          onCancel={closeDialogs}
        >
          <p>Delete <b>{semesterName(confirm.y)}</b>? It has no classes. This cannot be undone.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/* ── Active semester: compact, fully labelled ── */
function ActiveSemester({ y, today, years, onSetSecond }: { y: AcademicYear; today: string; years: AcademicYear[]; onSetSecond: () => void }) {
  const pos = position(y, today);
  const start = day(y.startDate);
  const end = day(y.endDate);
  const second = y.termType !== "Summer" ? day(y.secondTermStart) : "";
  const missing = incompleteReasons(y);
  const overlaps = overlapsOf(start, end, years, y.ayId);
  const total = start && end ? daysBetween(start, end) : 0;
  const pct = (d: string) => Math.min(100, Math.max(0, (daysBetween(start, d) / Math.max(1, total)) * 100));
  const inside = start !== "" && end !== "" && today >= start && today <= end;

  return (
    <section className="ay-active" aria-label="Active semester">
      <div className="ay-active-main">
        <span className="ay-active-dot" aria-hidden="true" />
        <div>
          <p className="ay-active-label">Active semester</p>
          <h2>{semesterName(y)}</h2>
          <p className="ay-active-now">
            {pos ? <><b>Week {pos.week}</b> of the {pos.term}{missing.length ? " (weeks counted from the semester start)" : ""} · {pos.daysLeft} days left</>
              : today < start ? <>Starts {nice(y.startDate)}</> : <>Its dates ended {nice(y.endDate)}</>}
          </p>
        </div>
      </div>

      {total > 0 && (
        <div className="ay-timeline" aria-label={`Semester runs ${nice(y.startDate)} to ${nice(y.endDate)}${second ? `, 2nd term from ${nice(second)}` : ""}`}>
          <div className="ay-timeline-track">
            {second && second > start && second <= end ? (
              <>
                <span className="ay-tl-t1" style={{ width: `${pct(second)}%` }} />
                <span className="ay-tl-t2" style={{ left: `${pct(second)}%`, right: 0 }} />
                <i className="ay-tl-tick" style={{ left: `${pct(second)}%` }} />
              </>
            ) : (
              <span className="ay-tl-t1 is-whole" style={{ width: "100%" }} />
            )}
            {inside && <i className="ay-tl-today" style={{ left: `${pct(today)}%` }}><em>Today</em></i>}
          </div>
          <div className="ay-timeline-labels">
            <span><b>Start</b>{short(start)}</span>
            {second && second > start && second <= end
              ? <span className="is-mid" style={{ left: `${pct(second)}%` }}><b>2nd term</b>{short(second)}</span>
              : y.termType !== "Summer" && <span className="is-missing"><AlertTriangle size={11} /> 2nd term not set</span>}
            <span className="is-end"><b>End</b>{short(end)}</span>
          </div>
        </div>
      )}

      {(missing.length > 0 || overlaps.length > 0) && (
        <div className="ay-active-warn">
          {missing.length > 0 && (
            <p><AlertTriangle size={12} /> Incomplete configuration: {missing.join(", ")}. Week numbers can't restart for the 2nd term until it is set.
              {y.termType !== "Summer" && !y.secondTermStart && <button type="button" onClick={onSetSecond}>Set 2nd term start</button>}
            </p>
          )}
          {overlaps.map((o) => (
            <p key={o.other.ayId}><AlertTriangle size={12} /> Dates overlap {semesterName(o.other)} from {nice(o.from)} to {nice(o.to)}.</p>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── One semester in the directory ── */
function SemesterRow({ y, years, today, busy, onEdit, onSetSecond, onActivate, onDelete }: {
  y: AcademicYear; years: AcademicYear[]; today: string; busy: boolean;
  onEdit: () => void; onSetSecond: () => void; onActivate: () => void; onDelete: () => void;
}) {
  const phase = phaseOf(y, today);
  const missing = incompleteReasons(y);
  const overlaps = overlapsOf(day(y.startDate), day(y.endDate), years, y.ayId);
  const canDelete = !y.isActive && !y.classes;
  const start = day(y.startDate);
  const end = day(y.endDate);
  const second = day(y.secondTermStart);
  const PhaseIcon = phase === "active" ? Check : phase === "upcoming" ? CalendarClock : phase === "historical" ? History : CalendarDays;

  return (
    <li className={`ay-row is-${phase}`}>
      <div className="ay-row-name">
        <strong>{TERM_LABELS[y.termType as TermType] ?? y.termType}</strong>
        <div className="ay-badges">
          <span className={`ay-badge is-${phase}`}><PhaseIcon size={11} /> {PHASE_LABEL[phase]}</span>
          {missing.length > 0 && <span className="ay-badge is-incomplete"><AlertTriangle size={11} /> Incomplete</span>}
        </div>
      </div>

      <div className="ay-row-dates">
        <span className="ay-row-range"><CalendarDays size={12} /> {nice(y.startDate)} – {nice(y.endDate)}</span>
        {y.termType === "Summer" ? (
          <span className="ay-terms">Single term{start && end ? ` · ${weeks(start, end)} weeks` : ""}</span>
        ) : second ? (
          <span className="ay-terms">
            Term 1 from {short(start || second)}{start ? ` (${weeks(start, second)} wk)` : ""} · Term 2 from {short(second)}{end ? ` (${weeks(second, end)} wk)` : ""}
          </span>
        ) : (
          <span className="ay-terms is-missing">
            <AlertTriangle size={11} /> 2nd term start not set
            <button type="button" onClick={onSetSecond} disabled={busy}>Set it</button>
          </span>
        )}
        {overlaps.map((o) => (
          <span key={o.other.ayId} className="ay-terms is-missing">
            <AlertTriangle size={11} /> Overlaps {semesterName(o.other)}: {short(o.from)} – {nice(o.to)}
          </span>
        ))}
      </div>

      <div className="ay-row-classes" title="Course sections in this semester">
        <b>{y.classes ?? "—"}</b>
        <span>{y.classes === 1 ? "section" : "sections"}</span>
      </div>

      <div className="ay-row-actions">
        {!y.isActive && (
          <button type="button" className="ay-btn is-sm" disabled={busy} onClick={onActivate}><Power size={13} /> Make active</button>
        )}
        <button type="button" className="ay-icon-btn" aria-label={`Edit ${semesterName(y)}`} title="Edit" disabled={busy} onClick={onEdit}>
          <Pencil size={15} />
        </button>
        {canDelete && (
          <button type="button" className="ay-icon-btn is-danger" aria-label={`Delete ${semesterName(y)}`} title="Delete" disabled={busy} onClick={onDelete}>
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </li>
  );
}

/* ── Warnings shown in the activation dialog (advisory; the server decides) ── */
function ActivationWarnings({ y, years, today }: { y: AcademicYear; years: AcademicYear[]; today: string }) {
  const missing = incompleteReasons(y);
  const overlaps = overlapsOf(day(y.startDate), day(y.endDate), years, y.ayId);
  const phase = phaseOf({ ...y, isActive: false }, today);
  const notes: string[] = [
    ...missing.map((m) => `Configuration is incomplete: ${m}.`),
    ...overlaps.map((o) => `Its dates overlap ${semesterName(o.other)} (${nice(o.from)} – ${nice(o.to)}).`),
    ...(phase === "historical" ? ["Its dates have already ended."] : []),
    ...(phase === "upcoming" ? [`It has not started yet (starts ${nice(y.startDate)}).`] : []),
  ];
  if (!notes.length) return null;
  return (
    <div className="ay-alert is-warn ay-dialog-warn">
      <AlertTriangle size={14} />
      <div>
        <b>Check before continuing</b>
        <ul>{notes.map((n) => <li key={n}>{n}</li>)}</ul>
        <small>The server applies its own rules when you confirm.</small>
      </div>
    </div>
  );
}

/* ── Shared modal behaviour: focus in, Escape out, Tab kept inside, focus returned ── */
function useModal(onClose: () => void, initial?: () => HTMLElement | null) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement;
    (initial?.() ?? panel.current?.querySelector<HTMLElement>("input, button"))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab" && panel.current) {
        const items = panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])");
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return panel;
}

function ConfirmDialog({ title, confirmLabel, tone = "primary", icon, busy, error, onConfirm, onCancel, children }: {
  title: string; confirmLabel: string; tone?: "primary" | "danger"; icon: ReactNode; busy: boolean; error: string | null;
  onConfirm: () => void; onCancel: () => void; children: ReactNode;
}) {
  const panel = useModal(onCancel, () => panel.current?.querySelector<HTMLElement>("[data-cancel]") ?? null);
  return (
    <div className="ay-modal-root">
      <div className="ay-drawer-backdrop" onClick={onCancel} aria-hidden="true" />
      <div ref={panel} className="ay-modal" role="alertdialog" aria-modal="true" aria-labelledby="ay-modal-title">
        <span className={`ay-modal-icon is-${tone}`}>{icon}</span>
        <h2 id="ay-modal-title">{title}</h2>
        <div className="ay-modal-body">{children}</div>
        {error && <p className="ay-alert is-error" role="alert"><CircleAlert size={14} /> <span>{error}</span></p>}
        <div className="ay-modal-actions">
          <button type="button" data-cancel className="ay-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={`ay-btn ${tone === "danger" ? "is-danger" : "is-primary"}`} onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 size={14} className="ay-spin" />} {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Add / edit drawer ── */
function SemesterDrawer({ editing, years, busy, error, onChange, onSave, onCancel }: {
  editing: Editing; years: AcademicYear[]; busy: boolean; error: string | null;
  onChange: (f: SaveAcademicYear) => void; onSave: () => void; onCancel: () => void;
}) {
  const form = editing.form;
  const set = (patch: Partial<SaveAcademicYear>) => onChange({ ...form, ...patch });
  const summer = form.termType === "Summer";
  const second = form.secondTermStart ?? "";
  const secondInput = useRef<HTMLInputElement>(null);
  const panel = useModal(onCancel, () => (editing.focusSecond ? secondInput.current : null));

  const label = form.label.trim();
  const labelOk = /^\d{4}-\d{4}$/.test(label);
  const [ya, yb] = label.split("-").map(Number);
  const labelHint = labelOk && yb !== ya + 1 ? "School years usually span consecutive years, e.g. 2026-2027." : null;
  const rangeBad = form.startDate !== "" && form.endDate !== "" && form.endDate <= form.startDate;
  // 2nd term must start after the semester starts and on or before it ends.
  const secondBad = !summer && second !== "" && form.startDate !== "" && form.endDate !== "" && (second <= form.startDate || second > form.endDate);
  const duplicate = years.find((y) => y.ayId !== editing.id && y.label === label && y.termType === form.termType);
  const overlaps = rangeBad ? [] : overlapsOf(form.startDate, form.endDate, years, editing.id);
  // Same required fields as before (label, both dates, and the 2nd-term date unless Summer), plus date order.
  const ready = labelOk && !!form.startDate && !!form.endDate && (summer || !!second) && !rangeBad && !secondBad;

  return (
    <div className="ay-drawer-root">
      <div className="ay-drawer-backdrop" onClick={onCancel} aria-hidden="true" />
      <div ref={panel} className="ay-drawer" role="dialog" aria-modal="true" aria-label={editing.id === null ? "Add semester" : "Edit semester"}>
        <header className="ay-drawer-head">
          <div>
            <p className="ay-eyebrow">{editing.id === null ? "Add semester" : "Edit semester"}</p>
            <h2>{labelOk ? `${TERM_LABELS[form.termType]} ${label}` : editing.id === null ? "New semester" : "Edit semester"}</h2>
          </div>
          <button type="button" className="ay-icon-btn" aria-label="Close" onClick={onCancel} disabled={busy}><X size={17} /></button>
        </header>

        <div className="ay-drawer-body">
          <label className="ay-field">
            <span>School year</span>
            <input value={form.label} onChange={(e) => set({ label: e.target.value })} placeholder="2026-2027"
              className={form.label && !labelOk ? "is-invalid" : ""} aria-invalid={!!form.label && !labelOk} />
            {form.label && !labelOk ? <small className="is-error">Use the format 2026-2027.</small>
              : labelHint ? <small className="is-warn">{labelHint}</small> : <small>Written as YYYY-YYYY.</small>}
          </label>

          <div className="ay-field">
            <span>Semester</span>
            <div className="ay-seg" role="radiogroup" aria-label="Semester">
              {(Object.keys(TERM_LABELS) as TermType[]).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={form.termType === t} className={form.termType === t ? "is-on" : ""} onClick={() => set({ termType: t })}>
                  {TERM_LABELS[t]}
                </button>
              ))}
            </div>
            {duplicate && <small className="is-warn">{semesterName(duplicate)} already exists. The server will decide whether a second one is allowed.</small>}
          </div>

          <fieldset className="ay-fieldset">
            <legend>Semester dates</legend>
            <div className="ay-grid-2">
              <label className="ay-field">
                <span>Starts</span>
                <input type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} className={rangeBad ? "is-invalid" : ""} aria-invalid={rangeBad} />
              </label>
              <label className="ay-field">
                <span>Ends</span>
                <input type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => set({ endDate: e.target.value })} className={rangeBad ? "is-invalid" : ""} aria-invalid={rangeBad} />
              </label>
              {rangeBad && <small className="ay-span-2 is-error">The end date must be after the start date.</small>}
            </div>
          </fieldset>

          {!summer ? (
            <fieldset className="ay-fieldset">
              <legend>Terms</legend>
              <div className="ay-terms-grid">
                <div className="ay-term-box">
                  <span>Term 1 starts</span>
                  <b>{form.startDate ? nice(form.startDate) : "Semester start"}</b>
                  <small>Same as the semester start.</small>
                </div>
                <label className="ay-field">
                  <span>Term 2 starts</span>
                  <input ref={secondInput} type="date" value={second} min={form.startDate || undefined} max={form.endDate || undefined}
                    onChange={(e) => set({ secondTermStart: e.target.value })} className={secondBad ? "is-invalid" : ""} aria-invalid={secondBad} />
                </label>
              </div>
              {secondBad ? <small className="is-error">Term 2 must start after {nice(form.startDate)} and no later than {nice(form.endDate)}.</small>
                : !second ? <small className="is-warn">Required. Week numbers start again from 1 on this day.</small>
                : <small>Term 1: {weeks(form.startDate || second, second)} weeks · Term 2: {form.endDate ? weeks(second, form.endDate) : "—"} weeks. Week numbers restart on {nice(second)}.</small>}
            </fieldset>
          ) : (
            <p className="ay-note"><Info size={12} /> Summer has a single term, so no 2nd-term date is needed.</p>
          )}

          {overlaps.length > 0 && (
            <div className="ay-alert is-warn" role="status">
              <AlertTriangle size={14} />
              <div>
                <b>These dates overlap another semester</b>
                <ul>
                  {overlaps.map((o) => (
                    <li key={o.other.ayId}>
                      {semesterName(o.other)}{o.other.label === label ? " (same school year)" : ""}: {nice(o.other.startDate)} – {nice(o.other.endDate)}. Shared days: {nice(o.from)} to {nice(o.to)}.
                    </li>
                  ))}
                </ul>
                <small>Usually one semester ends before the next begins. You can still save; the server applies its own rules.</small>
              </div>
            </div>
          )}
        </div>

        <footer className="ay-drawer-foot">
          {error && <p className="ay-alert is-error" role="alert"><CircleAlert size={14} /> <span>{error}</span></p>}
          <div className="ay-drawer-actions">
            <span className="ay-ready">{busy ? "Saving to the server…" : ready ? (overlaps.length ? "Ready, with warnings." : "Ready to save.") : "Fill in the required fields."}</span>
            <button type="button" className="ay-btn" onClick={onCancel} disabled={busy}>Cancel</button>
            <button type="button" className="ay-btn is-primary" onClick={onSave} disabled={!ready || busy}>
              {busy ? <Loader2 size={14} className="ay-spin" /> : <Check size={14} />} {busy ? "Saving…" : "Save semester"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}