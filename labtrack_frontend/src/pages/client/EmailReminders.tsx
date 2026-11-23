import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, CircleAlert, Clock, FileText, FlaskConical, Info, Loader2,
  Mail, MailCheck, MailWarning, MailX, Search, Send, Settings2, UserRound, X,
} from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { getReminders, sendRemindersNow, sendTestReminder, setAutoSend, type RemindersPreview } from "@/api/reminders";
import { ApiError } from "@/api/client";
import "./email-reminders.css";

type ReminderClass = RemindersPreview["classes"][number];
type Filter = "all" | "pending" | "sent" | "attention";

/* Formatting only; every number comes from the API as-is. */
const h = (n: number) => String(Number(n.toFixed(2)));
const day = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dayLong = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const hourLabel = (hr: number) => `${((hr + 11) % 12) + 1}:00 ${hr >= 12 ? "PM" : "AM"}`;

/* Delivery state for this week, read straight from sentAt / error / email (same rules as before). */
type Delivery = "sent" | "failed" | "pending" | "noEmail";
const deliveryOf = (c: ReminderClass): Delivery => (c.sentAt ? "sent" : c.error ? "failed" : c.email ? "pending" : "noEmail");
// Same rule the Send now button has always used: not sent yet this week and has an email.
const isPending = (c: ReminderClass) => !c.sentAt && !!c.email;

export function EmailRemindersPage() {
  const { role } = useRole();
  const allowed = role === "Custodian" || role === "Administrator";

  const [data, setData] = useState<RemindersPreview | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "test" | "send" | "auto">(null);
  const busyRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "send" | "autoOn" | "autoOff">(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const previewRef = useRef<HTMLElement>(null);

  const load = () =>
    getReminders()
      .then((d) => { setData(d); setLoadState("ready"); setLoadError(null); })
      .catch((e) => {
        setLoadError(e instanceof ApiError ? e.message : "Could not load the reminders.");
        setLoadState((s) => (s === "ready" ? "ready" : "error"));
      });
  useEffect(() => { if (allowed) load(); }, [allowed]);

  const setup = data?.setup;
  const classes = useMemo(() => data?.classes ?? [], [data]);
  const pending = useMemo(() => classes.filter(isPending), [classes]);
  const pendingAddresses = useMemo(() => new Set(pending.map((c) => c.email!.toLowerCase())).size, [pending]);
  const counts = useMemo(() => {
    const c = { all: classes.length, pending: 0, sent: 0, attention: 0 };
    for (const x of classes) {
      const d = deliveryOf(x);
      if (d === "pending") c.pending++;
      if (d === "sent") c.sent++;
      if (d === "failed" || d === "noEmail") c.attention++;
    }
    return c;
  }, [classes]);
  const lastSent = useMemo(
    () => {
      const times = classes.map((c) => c.sentAt).filter((s): s is string => !!s).sort();
      return times.length ? times[times.length - 1] : null;
    },
    [classes],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return classes
      .filter((c) => {
        const d = deliveryOf(c);
        if (filter === "pending" && d !== "pending") return false;
        if (filter === "sent" && d !== "sent") return false;
        if (filter === "attention" && d !== "failed" && d !== "noEmail") return false;
        return !q || [c.sectionCode, c.subjectCode, c.subjectTitle, c.faculty ?? "", c.email ?? ""].some((v) => v.toLowerCase().includes(q));
      })
      // Group visually by faculty; each row is still one class, as the API returns it.
      .sort((a, b) => (a.faculty ?? "~").localeCompare(b.faculty ?? "~") || a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true }));
  }, [classes, search, filter]);

  const selected = selectedId === null ? null : classes.find((c) => c.sectionId === selectedId) ?? null;

  if (!allowed) {
    return <div className="er-restricted">This page is only available to the Custodian and Administrator roles.</div>;
  }

  /** One external action at a time; success text comes only from the server's response. */
  const run = async (kind: "test" | "send" | "auto", work: () => Promise<string>, inDialog: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind); setMessage(null); setError(null); setDialogError(null);
    try {
      const text = await work();
      setMessage(text);
      setDialog(null);
      await load();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Something went wrong.";
      if (inDialog) setDialogError(msg);
      else setError(msg);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const test = () => run("test", async () => (await sendTestReminder()).message, false);
  const sendNow = () =>
    run("send", async () => {
      const r = await sendRemindersNow();
      return [
        `${r.sent} sent`,
        r.failed ? `${r.failed} failed (tried again on the next run)` : "",
        r.noEmail ? `${r.noEmail} skipped: no faculty email` : "",
        r.alreadySent ? `${r.alreadySent} already sent this week` : "",
      ].filter(Boolean).join(" · ");
    }, true);
  const toggleAuto = (on: boolean) =>
    run("auto", async () => {
      await setAutoSend(on);
      return on ? "Automatic weekly emails are on." : "Automatic weekly emails are off. Send now still works.";
    }, true);

  const select = (id: number) => {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 1099px)").matches) requestAnimationFrame(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const canSend = !!setup?.configured && pending.length > 0 && !busy;
  const sendDisabledReason = !setup ? null : !setup.configured ? "The sending account isn't set up." : pending.length === 0 ? "No class is waiting for this week's reminder." : null;

  return (
    <div className="er-page">
      <header className="er-heading">
        <div>
          <p className="er-eyebrow">ACADEMIC MONITORING / FACULTY REMINDERS</p>
          <h1>Email Reminders</h1>
          <p>Review missed laboratory meetings, notify faculty, and manage weekly make-up reminders.</p>
        </div>
        <div className="er-heading-actions">
          <button type="button" className="er-btn" onClick={test} disabled={!!busy || !setup?.configured} title="Sends a sample to you, not to faculty">
            {busy === "test" ? <Loader2 size={14} className="er-spin" /> : <Mail size={14} />} {busy === "test" ? "Sending test…" : "Send me a test"}
          </button>
          <button type="button" className="er-btn is-primary" onClick={() => { setDialogError(null); setDialog("send"); }} disabled={!canSend} title={sendDisabledReason ?? undefined}>
            <Send size={14} className="er-gold" /> Review &amp; Send ({pending.length})
          </button>
        </div>
      </header>

      <details className="er-help">
        <summary><Info size={14} /> How weekly reminders work <ChevronDown size={14} className="er-help-chev" /></summary>
        <ul>
          <li>Once a week, faculty whose classes have missed lab meetings get an email with the dates, the hours to make up and the suggested make-up classes.</li>
          <li>Every Class Status reason counts as missed, including Fieldwork, Research Subject/OJT and On Leave. On-site comes from session confirmation.</li>
          <li>Make-up classes that were held count against the missed hours.</li>
          <li>Virtual lab hours are recorded at the end of the term, so the email says they are not included yet.</li>
          <li>Send now and the automatic weekly run use the same list; a class gets at most one reminder per week.</li>
        </ul>
        <p>The numbers on this page come from the server; this page does not recalculate them.</p>
      </details>

      {message && (
        <div className="er-alert is-ok" role="status">
          <CheckCircle2 size={14} /> <span>{message}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setMessage(null)}><X size={13} /></button>
        </div>
      )}
      {error && (
        <div className="er-alert is-error" role="alert">
          <CircleAlert size={14} /> <span>{error}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setError(null)}><X size={13} /></button>
        </div>
      )}

      <div className="er-layout">
        {/* ── Queue ─────────────────────────────── */}
        <section className="er-card er-queue" aria-label="Reminder queue">
          <div className="er-queue-head">
            <div>
              <h2>This week's reminders</h2>
              <p>
                {data ? <>Week from <b>{day(data.weekStart)}</b> · {classes.length} {classes.length === 1 ? "class" : "classes"} with hours to make up</> : loadState === "loading" ? "Loading…" : "Reminder data unavailable"}
              </p>
            </div>
            {classes.length > 0 && (
              <label className="er-search">
                <Search size={14} />
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Faculty, class or subject…" aria-label="Search reminders" />
                {search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")}><X size={12} /></button>}
              </label>
            )}
          </div>

          {classes.length > 0 && (
            <div className="er-filters" role="group" aria-label="Filter by this week's status">
              {([
                ["all", "All"],
                ["pending", "Not sent yet"],
                ["sent", "Sent this week"],
                ["attention", "Needs attention"],
              ] as [Filter, string][]).map(([v, l]) => (
                <button key={v} type="button" aria-pressed={filter === v} className={filter === v ? "is-on" : ""} onClick={() => setFilter(v)}>
                  {l} <span>{counts[v]}</span>
                </button>
              ))}
            </div>
          )}

          {loadState === "loading" ? (
            <div className="er-skeleton" role="status">
              <span className="sr-only">Loading reminders</span>
              {Array.from({ length: 4 }, (_, i) => <div key={i} aria-hidden="true"><span /><span /><span /></div>)}
            </div>
          ) : loadState === "error" ? (
            <div className="er-state" role="alert">
              <CircleAlert size={26} />
              <h3>Reminder data unavailable</h3>
              <p>{loadError ?? "The server could not be reached."} This does not mean there are no missed meetings.</p>
              <button type="button" className="er-btn" onClick={() => { setLoadState("loading"); load(); }}>Try again</button>
            </div>
          ) : classes.length === 0 ? (
            <div className="er-state">
              <span className="er-state-icon"><MailCheck size={24} /></span>
              <h3>No reminders needed this week</h3>
              <p>Based on the current reminder data, no class has missed lab meetings to make up, so there are no make-up reminders to send.</p>
              {setup?.countMissedFrom && <small><CalendarClock size={12} /> Missed meetings are counted from {dayLong(setup.countMissedFrom)}.</small>}
            </div>
          ) : rows.length === 0 ? (
            <div className="er-state">
              <Search size={24} />
              <h3>No matching reminders</h3>
              <p>Try another faculty name, class code, subject, or status.</p>
              <button type="button" className="er-btn" onClick={() => { setSearch(""); setFilter("all"); }}>Clear filters</button>
            </div>
          ) : (
            <div className="er-table-scroll">
              <table className="er-table">
                <caption className="sr-only">Classes with missed lab meetings this week and their reminder status</caption>
                <thead>
                  <tr>
                    <th scope="col">Class / Subject</th>
                    <th scope="col">Faculty</th>
                    <th scope="col">Missed meetings</th>
                    <th scope="col" className="is-num">To make up</th>
                    <th scope="col">Suggested</th>
                    <th scope="col">This week</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const d = deliveryOf(c);
                    return (
                      <tr key={c.sectionId} className={selectedId === c.sectionId ? "is-selected" : ""} onClick={() => select(c.sectionId)}>
                        <td>
                          <button type="button" className="er-class" onClick={(e) => { e.stopPropagation(); select(c.sectionId); }} aria-label={`Preview reminder for ${c.sectionCode}`}>
                            <b>{c.sectionCode}</b> <span>{c.subjectCode}</span>
                          </button>
                          <span className="er-sub">{c.subjectTitle}</span>
                          <small className="er-mono">{h(c.confirmedHours)}/{h(c.requiredHours)}h confirmed</small>
                        </td>
                        <td>
                          <span className="er-fac">{c.faculty ?? <i>No faculty</i>}</span>
                          <small className={c.email ? "" : "is-missing"}>{c.email ?? "No email on record"}</small>
                        </td>
                        <td>
                          <span className="er-missed-count">{c.missed.length} {c.missed.length === 1 ? "meeting" : "meetings"}</span>
                          <div className="er-chips">
                            {c.missed.slice(0, 3).map((m) => <span key={m.date} title={m.reason}>{day(m.date)}</span>)}
                            {c.missed.length > 3 && <span className="is-more">+{c.missed.length - 3}</span>}
                          </div>
                        </td>
                        <td className="is-num" data-label="To make up">
                          <span className="er-hours">{h(c.outstandingHours)}h</span>
                          {c.madeUpHours > 0 && <small>{h(c.madeUpHours)}h made up</small>}
                        </td>
                        <td data-label="Suggested"><span className="er-mono">{c.suggestedMakeUps} × {h(c.sessionHours)}h</span></td>
                        <td data-label="This week"><DeliveryBadge c={c} d={d} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {loadState === "ready" && classes.length > 0 && (
            <footer className="er-queue-foot">
              {pending.length > 0
                ? <><b>{pending.length}</b> {pending.length === 1 ? "class is" : "classes are"} waiting for this week's reminder, going to <b>{pendingAddresses}</b> faculty {pendingAddresses === 1 ? "address" : "addresses"}.</>
                : "Every class with an email on record has had this week's reminder."}
            </footer>
          )}
        </section>

        {/* ── Side panel ────────────────────────── */}
        <aside className="er-side">
          <section className="er-card er-panel" aria-label="Automatic emails">
            <h3><Settings2 size={14} /> Automatic weekly emails</h3>
            {!setup ? (
              <p className="er-muted">{loadState === "loading" ? "Loading settings…" : "Settings unavailable."}</p>
            ) : !setup.configured ? (
              <p className="er-alert is-error er-inline">
                <MailX size={14} />
                <span>The sending Gmail account isn't set up yet. Add it under "Email" in the API's appsettings.json, then restart the API. Until then nothing can be sent.</span>
              </p>
            ) : (
              <>
                <button
                  type="button" role="switch" aria-checked={setup.autoSend} disabled={!!busy}
                  className={`er-switch ${setup.autoSend ? "is-on" : ""}`}
                  onClick={() => { setDialogError(null); setDialog(setup.autoSend ? "autoOff" : "autoOn"); }}
                >
                  <span className="er-switch-track"><span /></span>
                  <span className="er-switch-text">
                    <b>{busy === "auto" ? "Updating…" : setup.autoSend ? "On" : "Off"}</b>
                    <small>{setup.autoSend ? `Every ${setup.sendDay} from ${hourLabel(setup.sendHour)}` : "Only Send now sends emails"}</small>
                  </span>
                </button>
                <dl className="er-dl">
                  <div><dt>Schedule</dt><dd>{setup.sendDay}s, from {hourLabel(setup.sendHour)}{setup.autoSend ? "" : " (when on)"}</dd></div>
                  <div><dt>Sent from</dt><dd className="er-break">{setup.from}</dd></div>
                  {data && <div><dt>Reporting week</dt><dd>From {day(data.weekStart)}</dd></div>}
                  {setup.countMissedFrom && <div><dt>Missed counted from</dt><dd>{dayLong(setup.countMissedFrom)}</dd></div>}
                </dl>
                <p className="er-note">The day and time are set on the server and can't be changed here. Turning this on does not send anything immediately.</p>
              </>
            )}
          </section>

          <section ref={previewRef} className="er-card er-panel er-preview" aria-label="Reminder preview">
            <h3><FileText size={14} /> Reminder summary</h3>
            {!selected ? (
              <p className="er-muted">{classes.length ? "Select a class in the list to see what its reminder covers." : "Nothing to preview this week."}</p>
            ) : (
              <>
                <p className="er-preview-label">Summary of the data the reminder uses. The email itself is written by the server, so its wording may differ.</p>
                <div className="er-mail">
                  <div className="er-mail-head">
                    <div><span>To</span><b>{selected.faculty ?? "No faculty"}</b>{selected.email ? <em>&lt;{selected.email}&gt;</em> : <em className="is-missing">no email on record</em>}</div>
                    <div><span>From</span><em>{setup?.from ?? "—"}</em></div>
                    <div><span>Class</span><b>{selected.sectionCode}</b> {selected.subjectCode} · {selected.subjectTitle}</div>
                  </div>
                  <div className="er-mail-body">
                    <p className="er-mail-section"><Clock size={13} /> Missed lab meetings</p>
                    <ul className="er-missed-list">
                      {selected.missed.map((m) => <li key={m.date}><b>{dayLong(m.date)}</b><span>{m.reason}</span></li>)}
                    </ul>
                    <div className="er-figures">
                      <div><span>Hours to make up</span><b>{h(selected.outstandingHours)}h</b></div>
                      <div><span>Made up already</span><b>{h(selected.madeUpHours)}h</b></div>
                      <div><span>Suggested make-ups</span><b>{selected.suggestedMakeUps} × {h(selected.sessionHours)}h</b></div>
                      <div><span>Confirmed so far</span><b>{h(selected.confirmedHours)} / {h(selected.requiredHours)}h</b></div>
                    </div>
                    <p className="er-mail-note"><FlaskConical size={12} /> Virtual lab hours are recorded at the end of the term and are not included yet.</p>
                  </div>
                </div>
                <div className="er-preview-status"><span>This week:</span> <DeliveryBadge c={selected} d={deliveryOf(selected)} showError /></div>
              </>
            )}
          </section>

          {setup?.configured && data && (
            <section className="er-card er-panel" aria-label="Delivery this week">
              <h3><MailCheck size={14} /> Delivery this week</h3>
              <dl className="er-dl">
                <div><dt>Sent</dt><dd>{counts.sent} {counts.sent === 1 ? "class" : "classes"}</dd></div>
                <div><dt>Waiting</dt><dd>{counts.pending}</dd></div>
                <div><dt>Failed</dt><dd className={classes.some((c) => deliveryOf(c) === "failed") ? "is-error" : ""}>{classes.filter((c) => deliveryOf(c) === "failed").length}</dd></div>
                <div><dt>No email on record</dt><dd className={classes.some((c) => !c.email) ? "is-warn" : ""}>{classes.filter((c) => !c.email).length}</dd></div>
                {lastSent && <div><dt>Last sent</dt><dd>{stamp(lastSent)}</dd></div>}
              </dl>
              <p className="er-note">"Sent" means the server handed the email to the mail account; it can't confirm it reached the inbox.</p>
            </section>
          )}
        </aside>
      </div>

      {dialog === "send" && (
        <Dialog
          title="Send this week's reminders now?"
          icon={<Send size={18} />}
          confirmLabel={`Send ${pending.length} ${pending.length === 1 ? "reminder" : "reminders"}`}
          busy={busy === "send"}
          error={dialogError}
          onConfirm={sendNow}
          onCancel={() => !busyRef.current && setDialog(null)}
        >
          <p>These classes haven't had a reminder this week and have a faculty email on record. Classes already sent this week are skipped by the server.</p>
          <ul className="er-review-list">
            {pending.map((c) => (
              <li key={c.sectionId}>
                <span><b>{c.sectionCode}</b> {c.subjectCode}</span>
                <span>{c.faculty ?? "No faculty"} · <em>{c.email}</em></span>
                <span className="er-mono">{h(c.outstandingHours)}h</span>
              </li>
            ))}
          </ul>
          <p className="er-note">Real emails go to faculty. The server decides the final recipients and reports how many were sent.</p>
        </Dialog>
      )}

      {dialog === "autoOn" && setup && (
        <Dialog title="Turn on automatic weekly emails?" icon={<CalendarClock size={18} />} confirmLabel="Turn on" busy={busy === "auto"} error={dialogError}
          onConfirm={() => toggleAuto(true)} onCancel={() => !busyRef.current && setDialog(null)}>
          <p>Every <b>{setup.sendDay}</b> from <b>{hourLabel(setup.sendHour)}</b>, faculty of classes on this list get their reminder automatically from <b>{setup.from}</b>.</p>
          <p>Nothing is sent right now. Send now keeps working.</p>
        </Dialog>
      )}

      {dialog === "autoOff" && (
        <Dialog title="Stop the automatic weekly emails?" icon={<AlertTriangle size={18} />} confirmLabel="Turn off" busy={busy === "auto"} error={dialogError}
          onConfirm={() => toggleAuto(false)} onCancel={() => !busyRef.current && setDialog(null)}>
          <p>Faculty won't get reminders until they're turned back on. Send now still works.</p>
        </Dialog>
      )}
    </div>
  );
}

function DeliveryBadge({ c, d, showError = false }: { c: ReminderClass; d: Delivery; showError?: boolean }) {
  if (d === "sent") return <span className="er-badge is-ok"><CheckCircle2 size={12} /> Sent {day(c.sentAt!)}</span>;
  if (d === "failed") return (
    <span className="er-badge-wrap">
      <span className="er-badge is-error" title={c.error ?? undefined}><MailWarning size={12} /> Failed</span>
      {showError && c.error && <small className="er-err-text">{c.error}</small>}
    </span>
  );
  if (d === "pending") return <span className="er-badge is-pending"><Clock size={12} /> Not sent yet</span>;
  return <span className="er-badge is-muted"><UserRound size={12} /> Can't send</span>;
}

function Dialog({ title, icon, confirmLabel, busy, error, onConfirm, onCancel, children }: {
  title: string; icon: ReactNode; confirmLabel: string; busy: boolean; error: string | null;
  onConfirm: () => void; onCancel: () => void; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => {
    const opener = document.activeElement;
    panel.current?.querySelector<HTMLElement>("[data-cancel]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelRef.current();
      if (e.key === "Tab" && panel.current) {
        const items = panel.current.querySelectorAll<HTMLElement>("button:not([disabled])");
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
  }, []);
  return (
    <div className="er-modal-root">
      <div className="er-backdrop" onClick={onCancel} aria-hidden="true" />
      <div ref={panel} className="er-modal" role="alertdialog" aria-modal="true" aria-labelledby="er-modal-title">
        <span className="er-modal-icon">{icon}</span>
        <h2 id="er-modal-title">{title}</h2>
        <div className="er-modal-body">{children}</div>
        {error && <p className="er-alert is-error er-inline" role="alert"><CircleAlert size={14} /> <span>{error}</span></p>}
        <div className="er-modal-actions">
          <button type="button" data-cancel className="er-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="er-btn is-primary" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 size={14} className="er-spin" />} {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}