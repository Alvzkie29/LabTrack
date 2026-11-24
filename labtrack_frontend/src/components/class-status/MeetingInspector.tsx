import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CheckCircle2, Clock3, Info, Loader2, MapPin, ShieldCheck, Users } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { canAccess, useRole } from "@/contexts/RoleContext";
import type { StatusWeek } from "@/api/sessionStatus";
import { dateLabel, StatusBadge, timeLabel, type CalendarMeeting } from "./calendar-data";
import { confirmationSessionPath } from "@/utils/sessionConfirmationLink";

interface Props { meeting: CalendarMeeting | null; week: StatusWeek | null; academicYearId?: number; busy: boolean; error: string | null; today: string; onClose: () => void; returnFocus: HTMLElement | null; onSave: (meeting: CalendarMeeting, status: string, note?: string) => Promise<boolean>; }
export function MeetingInspector(props: Props) {
  return <Sheet open={props.meeting !== null} onOpenChange={open => { if (!open) props.onClose(); }}>
    <SheetContent side="right" className="cs-inspector" onCloseAutoFocus={event => { if (props.returnFocus?.isConnected) { event.preventDefault(); props.returnFocus.focus({ preventScroll: true }); } }}>
      <div className="cs-inspector-heading">
        <p className="cs-eyebrow">Weekly meeting record</p>
        <SheetTitle>Meeting details</SheetTitle>
        <SheetDescription>Review the scheduled meeting and its existing class status.</SheetDescription>
      </div>
      {props.meeting && props.week && <InspectorBody key={props.meeting.id} {...props} meeting={props.meeting} week={props.week} />}
    </SheetContent>
  </Sheet>;
}
function InspectorBody({ meeting, week, academicYearId, busy, error, today, onSave }: Props & { meeting: CalendarMeeting; week: StatusWeek }) {
  const { role } = useRole(); const [noteFor, setNoteFor] = useState(false); const [note, setNote] = useState("");
  const { row, cell } = meeting; const confirmation = cell.source === "confirmation";
  const statuses = week.statuses.filter(status => status !== "On-site" && status !== "Virtual");
  async function saveReason() { if (await onSave(meeting, "Others", note.trim())) setNoteFor(false); }
  return <div className="cs-inspector-body">
    <div className="cs-meeting-identity">
      <span className="cs-inspector-icon">
        <CalendarDays size={23} />
      </span>
      <p>{row.subjectCode}<span>Section {row.sectionCode}</span>
      </p>
      <h3>{row.subjectTitle}</h3>
      <StatusBadge cell={cell} />{meeting.makeUp && <span className="cs-makeup-label">Make-up class</span>}</div>
    <dl className="cs-meeting-facts">
      <div>
        <dt>
          <CalendarDays size={14} />Date</dt>
        <dd>{dateLabel(cell.date)}</dd>
      </div>
      <div>
        <dt>
          <Clock3 size={14} />Time</dt>
        <dd>{meeting.start === null ? "Meeting time unavailable" : `${timeLabel(meeting.start)}–${timeLabel(meeting.end!)}`}</dd>
      </div>
      <div>
        <dt>
          <MapPin size={14} />Laboratory</dt>
        <dd>{week.laboratory.name}<span>{week.laboratory.roomCode}</span>
        </dd>
      </div>
      <div>
        <dt>Faculty</dt>
        <dd>{row.faculty ?? "Not assigned"}</dd>
      </div>
      <div>
        <dt>
          <Users size={14} />Enrolled students</dt>
        <dd>{Number.isFinite(row.students) && row.students >= 0 ? row.students : "Unavailable"}</dd>
      </div>{row.lectureRoom && <div>
        <dt>Lecture room</dt>
        <dd>{row.lectureRoom}</dd>
      </div>}</dl>
    {meeting.makeUp && meeting.reason && <div className="cs-approved-reason">
      <strong>Make-up request reason</strong>
      <p>{meeting.reason}</p>
    </div>}
    {confirmation ? <section className={`cs-confirmation-note ${cell.awaitingFinal ? "is-pending" : ""}`}>
      <ShieldCheck size={19} />
      <h4>{cell.awaitingFinal ? "Awaiting final confirmation" : cell.status === "Virtual" ? "Recorded virtual session" : "Final confirmation recorded"}</h4>
      <p>{cell.awaitingFinal ? "Faculty confirmation has been recorded. Final confirmation and credited hours remain part of Confirm Sessions." : "This status comes from a session confirmation. It cannot be changed through manual class status controls."}</p>{canAccess(role, "/confirm-session") && <Link to={confirmationSessionPath({ sectionId: row.sectionId, date: cell.date, labId: week.laboratory.labId, ayId: academicYearId })}>Open Confirm Sessions</Link>}</section> : <section className="cs-status-editor">
      <h4>Manual status / reason</h4>
      <p>For a meeting without a session confirmation, record why it was not held.</p>
      {cell.date > today && !cell.status && <p className="cs-upcoming-note">
        <Info size={13} />This future meeting is not counted as overdue.</p>}
      <SearchableSelect ariaLabel="Meeting manual status" value={noteFor ? "Others" : cell.status ?? "clear"} onValueChange={value => { if (value === "Others") { setNoteFor(true); setNote(cell.status === "Others" ? cell.note ?? "" : ""); } else { setNoteFor(false); void onSave(meeting, value === "clear" ? "" : value); } }} disabled={busy} options={[{ value: "clear", label: "No manual mark (clear)" }, ...statuses.map(status => ({ value: status, label: status }))]} searchPlaceholder="Search supported reasons…" />
      {noteFor && <div className="cs-reason-editor">
        <label htmlFor="cs-reason">Reason for Others <span>Required · up to 300 characters</span>
        </label>
        <textarea id="cs-reason" value={note} onChange={e => setNote(e.target.value)} maxLength={300} rows={3} disabled={busy} placeholder="Describe why the meeting was not held" onKeyDown={e => { if (e.key === "Escape" && !busy) { e.stopPropagation(); setNoteFor(false); } }} />
        <div>
          <button className="cs-primary" disabled={busy || !note.trim()} onClick={() => void saveReason()}>{busy ? <Loader2 size={14} className="cs-spin" /> : <CheckCircle2 size={14} />}Save reason</button>
          <button disabled={busy} className="cs-cancel" onClick={() => setNoteFor(false)}>Cancel</button>
        </div>
      </div>}
      {cell.status === "Others" && cell.note && !noteFor && <div className="cs-recorded-note">
        <strong>Recorded reason</strong>
        <p>{cell.note}</p>
        <button disabled={busy} onClick={() => { setNoteFor(true); setNote(cell.note ?? ""); }}>Edit reason</button>
      </div>}
      {!cell.status && cell.suggestion && !noteFor && <div className="cs-single-suggestion">
        <span>Existing suggestion</span>
        <strong>{cell.suggestion}</strong>
        <button disabled={busy} onClick={() => void onSave(meeting, cell.suggestion!)}>Use this suggestion</button>
      </div>}
      <small>Choosing a reason or clearing a mark saves through the existing class status workflow.</small>
    </section>}
    {!confirmation && cell.note && cell.status !== "Others" && <div className="cs-recorded-note">
      <strong>Recorded remarks</strong>
      <p>{cell.note}</p>
    </div>}
    {error && <div className="cs-notice is-error" role="alert">{error}</div>}
    <div className="cs-shared-note">
      <Info size={14} />
      <p>Class status is recorded once per section and date. If this section has multiple meetings that day, they share the same status and remarks.</p>
    </div>
    <div className="cs-report-note">
      <ShieldCheck size={15} />
      <p>Saved reasons and notes feed the existing Weekly Report remarks.</p>{canAccess(role, "/weekly-report") && <Link to="/weekly-report">Weekly Report</Link>}</div>
  </div>;
}
