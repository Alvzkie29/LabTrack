import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle, BookOpen, CalendarDays, Check, CircleAlert, Clock, FileText, FlaskConical, Loader2,
  Paperclip, RefreshCw, Search, Trash2, Upload, X,
} from "lucide-react";
import type { CourseSectionSummary } from "@/api/courseSections";
import type { LaboratorySummary } from "@/api/laboratories";
import type { MakeUpClass } from "@/api/makeUpClasses";
import { Drawer } from "./Drawer";
import {
  ACCEPT, TIME_SLOTS, dateLabel, durationText, fileError, fileSize, isSunday, overlapping, presetFor,
  resolveTimes, timeError, timeLabel, toHHmm, weekdayName, type Booking, type SlotChoice,
} from "./timeSlots";

export interface MakeUpPayload {
  sectionId: number;
  labId: number;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  attachment: File;
}

export function MakeUpForm({
  sections,
  sectionsFailed,
  labs,
  existing,
  busy,
  error,
  onSave,
  onCancel,
}: {
  sections: CourseSectionSummary[];
  sectionsFailed: boolean;
  labs: LaboratorySummary[];
  existing: MakeUpClass[];
  busy: boolean;
  error: string | null;
  onSave: (p: MakeUpPayload) => void;
  onCancel: () => void;
}) {
  const [sectionId, setSectionId] = useState<number | "">("");
  const [query, setQuery] = useState("");
  const [labId, setLabId] = useState<number | "">("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<SlotChoice>("");
  const [custom, setCustom] = useState({ start: "", end: "" });
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const section = sections.find((s) => s.sectionId === sectionId) ?? null;
  const lab = labs.find((l) => l.labId === labId) ?? null;
  const { startTime, endTime } = resolveTimes(slot, custom);
  const tError = timeError(slot, startTime, endTime);
  const sunday = isSunday(date);
  const duration = durationText(startTime, endTime);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      [...sections]
        .filter((s) => !q || s.sectionCode.toLowerCase().includes(q) || s.subject.code.toLowerCase().includes(q)
          || s.subject.title.toLowerCase().includes(q) || (s.faculty ?? "").toLowerCase().includes(q))
        .sort((a, b) => a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true })),
    [sections, q],
  );

  // As before: picking a class fills in its usual lab and time, which can then be changed.
  const pickSection = (s: CourseSectionSummary) => {
    setSectionId(s.sectionId);
    setQuery("");
    const m = s.meetings[0];
    if (!m) return;
    setLabId(m.laboratory.labId);
    const start = toHHmm(m.startTime);
    const end = toHHmm(m.endTime);
    const preset = presetFor(start, end);
    if (preset) setSlot(preset);
    else {
      setCustom({ start, end });
      setSlot("custom");
    }
    setPrefilled(true);
  };

  const chooseFile = (f: File | null) => {
    if (!f) return;
    const problem = fileError(f);
    setFileProblem(problem);
    setFile(problem ? null : f);
    if (fileInput.current) fileInput.current.value = "";
  };

  // Advisory only: other make-up classes in that lab on that date, and weekly classes in that lab on that weekday.
  const overlaps = useMemo(() => {
    if (!lab || !date || tError) return [];
    const day = weekdayName(date);
    const bookings: Booking[] = [
      ...existing
        .filter((m) => m.date.slice(0, 10) === date && m.roomCode === lab.roomCode)
        .map((m) => ({ kind: "makeup" as const, label: `Make-up class · ${m.sectionCode} ${m.subjectCode}`, start: m.startTime, end: m.endTime })),
      ...sections.flatMap((s) =>
        s.meetings
          .filter((m) => m.laboratory?.labId === lab.labId && m.dayOfWeek === day)
          .map((m) => ({ kind: "weekly" as const, label: `Regular ${day} class · ${s.sectionCode} ${s.subject.code}`, start: m.startTime, end: m.endTime })),
      ),
    ];
    return overlapping(startTime, endTime, bookings);
  }, [lab, date, tError, existing, sections, startTime, endTime]);

  const missing = [
    sectionId === "" && "class",
    date === "" && "date",
    labId === "" && "laboratory",
    slot === "" && "time slot",
    !file && "approved request",
  ].filter(Boolean) as string[];
  const ready = missing.length === 0 && !sunday && !tError;

  const submit = () => {
    if (!ready || busy || sectionId === "" || labId === "" || !file) return;
    onSave({ sectionId, labId, date, startTime: toHHmm(startTime), endTime: toHHmm(endTime), reason, attachment: file });
  };

  const footer = (
    <div className="mk-form-foot">
      {error && <p className="mk-alert is-error" role="alert"><CircleAlert size={14} /> {error}</p>}
      <div className="mk-form-actions">
        <span className="mk-missing" aria-live="polite">
          {busy ? "Saving to the server…" : missing.length ? `Still needed: ${missing.join(", ")}` : sunday || tError ? "Fix the highlighted fields." : "Ready to save."}
        </span>
        <button type="button" className="mk-btn" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="mk-btn is-primary" onClick={submit} disabled={!ready || busy}>
          {busy ? <Loader2 size={14} className="mk-spin" /> : <Check size={14} />}
          {busy ? "Saving…" : "Save make-up class"}
        </button>
      </div>
    </div>
  );

  return (
    <Drawer title="New make-up class" eyebrow="Make-up sessions" onClose={onCancel} locked={busy} footer={footer} wide
      subtitle="Record an approved make-up class. It becomes an extra lab meeting on that date; hours count only after final confirmation.">
      {/* A. Class */}
      <section className="mk-step">
        <h3><span>1</span> Class information</h3>
        {section ? (
          <div className="mk-picked">
            <BookOpen size={16} />
            <div>
              <strong>{section.subject.code} — {section.subject.title}</strong>
              <small>Section {section.sectionCode}{section.faculty ? ` · ${section.faculty}` : " · No faculty assigned"}</small>
            </div>
            <button type="button" className="mk-link" onClick={() => { setSectionId(""); setPrefilled(false); }} disabled={busy}>Change</button>
          </div>
        ) : sectionsFailed ? (
          <p className="mk-alert is-error"><CircleAlert size={14} /> The class list could not be loaded. Close this form and try again.</p>
        ) : (
          <div className="mk-section-picker">
            <label className="mk-search">
              <Search size={15} />
              <input data-autofocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search class code, subject or faculty" aria-label="Search classes" />
              {query && <button type="button" aria-label="Clear" onClick={() => setQuery("")}><X size={13} /></button>}
            </label>
            <div className="mk-section-list" role="listbox" aria-label="Classes">
              {matches.map((s) => (
                <button key={s.sectionId} type="button" role="option" aria-selected={false} onClick={() => pickSection(s)}>
                  <b>{s.sectionCode}</b>
                  <span>{s.subject.code} {s.subject.title}</span>
                  <small>{s.faculty ?? "No faculty"}</small>
                </button>
              ))}
              {matches.length === 0 && <p className="mk-muted">{sections.length ? `No class matches “${query}”.` : "Loading classes…"}</p>}
            </div>
          </div>
        )}
      </section>

      {/* B. Schedule */}
      <section className="mk-step">
        <h3><span>2</span> Meeting schedule</h3>
        {prefilled && <p className="mk-hint">Lab and time were filled in from this class's usual meeting. Change them if the make-up is different.</p>}

        <div className="mk-grid-2">
          <label className="mk-field">
            <span className="mk-label"><CalendarDays size={13} /> Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={sunday ? "is-invalid" : ""} aria-invalid={sunday} />
            {sunday ? <span className="mk-field-error">Make-up classes can be Monday to Saturday.</span>
              : date && <span className="mk-field-help">{weekdayName(date)}</span>}
          </label>
          <div className="mk-field">
            <span className="mk-label"><FlaskConical size={13} /> Laboratory</span>
            <div className="mk-labs" role="radiogroup" aria-label="Laboratory">
              {labs.map((l) => (
                <button key={l.labId} type="button" role="radio" aria-checked={labId === l.labId} className={labId === l.labId ? "is-on" : ""} onClick={() => setLabId(l.labId)} title={l.name}>
                  {l.roomCode}
                </button>
              ))}
              {labs.length === 0 && <span className="mk-muted">Loading labs…</span>}
            </div>
            {lab && <span className="mk-field-help">{lab.name}</span>}
          </div>
        </div>

        <div className="mk-field">
          <span className="mk-label"><Clock size={13} /> Time slot</span>
          <div className="mk-slots" role="radiogroup" aria-label="Time slot">
            {(["Morning", "Afternoon", "Evening"] as const).map((group) => (
              <div key={group} className="mk-slot-group">
                <span className="mk-slot-group-label">{group}</span>
                {TIME_SLOTS.filter((t) => t.group === group).map((t) => (
                  <button key={t.id} type="button" role="radio" aria-checked={slot === t.id} className={`mk-slot ${slot === t.id ? "is-on" : ""}`} onClick={() => setSlot(t.id)}>
                    <span className="mk-slot-text"><b>{t.label}</b><small>2 hours</small></span>
                    <span className="mk-slot-check">{slot === t.id && <Check size={12} />}</span>
                  </button>
                ))}
              </div>
            ))}
            <div className="mk-slot-group">
              <span className="mk-slot-group-label">Other</span>
              <button type="button" role="radio" aria-checked={slot === "custom"} className={`mk-slot ${slot === "custom" ? "is-on" : ""}`} onClick={() => setSlot("custom")}>
                <span className="mk-slot-text"><b>Custom time</b><small>Set your own start and end</small></span>
                <span className="mk-slot-check">{slot === "custom" && <Check size={12} />}</span>
              </button>
            </div>
          </div>

          {slot === "custom" && (
            <div className="mk-custom">
              <label className="mk-field">
                <span className="mk-label">Start time</span>
                <input type="time" value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} className={tError && custom.start && custom.end ? "is-invalid" : ""} />
              </label>
              <label className="mk-field">
                <span className="mk-label">End time</span>
                <input type="time" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} className={tError && custom.start && custom.end ? "is-invalid" : ""} />
              </label>
              {(custom.start || custom.end) && tError && <span className="mk-field-error mk-span-2">{tError}</span>}
            </div>
          )}

          {slot !== "" && !tError && (
            <p className="mk-selected-time"><Clock size={13} /> {timeLabel(startTime)} – {timeLabel(endTime)} <span>{duration}</span></p>
          )}
        </div>

        {overlaps.length > 0 && (
          <div className="mk-alert is-warn" role="status">
            <AlertTriangle size={14} />
            <div>
              <b>Possible overlap in {lab?.roomCode} (advisory)</b>
              <ul>{overlaps.map((o, i) => <li key={i}>{o.label}, {timeLabel(o.start)} – {timeLabel(o.end)}</li>)}</ul>
              <small>Based on the records loaded on this page. Weekly classes only clash if they actually meet that day. The server's own rules still apply when you save.</small>
            </div>
          </div>
        )}
      </section>

      {/* C. Supporting details */}
      <section className="mk-step">
        <h3><span>3</span> Supporting details</h3>
        <label className="mk-field">
          <span className="mk-label">Reason <em>optional</em></span>
          <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Class missed on Nov 11 (holiday)" />
          <span className="mk-field-help mk-right">{reason.length}/300</span>
        </label>

        <div className="mk-field">
          <span className="mk-label"><Paperclip size={13} /> Approved request <em>required</em></span>
          <input ref={fileInput} type="file" accept={ACCEPT} className="sr-only" id="mk-file" onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} disabled={busy} />
          {file ? (
            <div className="mk-file">
              <FileText size={18} />
              <div>
                <strong title={file.name}>{file.name}</strong>
                <small>{fileSize(file.size)}</small>
              </div>
              <label htmlFor="mk-file" className="mk-link"><RefreshCw size={12} /> Replace</label>
              <button type="button" className="mk-link is-quiet" onClick={() => setFile(null)} disabled={busy}><Trash2 size={12} /> Remove</button>
            </div>
          ) : (
            <label
              htmlFor="mk-file"
              className={`mk-drop ${fileProblem ? "is-invalid" : ""}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); chooseFile(e.dataTransfer.files?.[0] ?? null); }}
            >
              <Upload size={20} />
              <span><b>Choose the approved request</b> or drop it here</span>
              <small>PDF, JPG or PNG · up to 5 MB</small>
            </label>
          )}
          {fileProblem && <span className="mk-field-error">{fileProblem}</span>}
        </div>
      </section>

      {/* D. Review */}
      <section className="mk-step mk-review">
        <h3><span>4</span> Review</h3>
        <dl>
          <div><dt>Class</dt><dd>{section ? `${section.sectionCode} · ${section.subject.code} ${section.subject.title}` : "—"}</dd></div>
          <div><dt>Laboratory</dt><dd>{lab ? `${lab.roomCode} · ${lab.name}` : "—"}</dd></div>
          <div><dt>Date</dt><dd className={sunday ? "is-error" : ""}>{date ? dateLabel(date) : "—"}</dd></div>
          <div><dt>Time</dt><dd className={slot !== "" && tError ? "is-error" : ""}>{slot === "" ? "—" : tError ? tError : `${timeLabel(startTime)} – ${timeLabel(endTime)}`}</dd></div>
          <div><dt>Duration</dt><dd>{duration ?? "—"}</dd></div>
          <div><dt>Approved request</dt><dd>{file ? <span className="mk-ok"><Check size={12} /> Attached</span> : "Not attached"}</dd></div>
        </dl>
        <p className="mk-note">Saving records the make-up meeting only. Hours are credited after the faculty confirms the session and the Assistant or Custodian gives final confirmation.</p>
      </section>
    </Drawer>
  );
}
