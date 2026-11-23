import { CalendarDays, Clock, ExternalLink, FileText, FlaskConical, Info, Loader2, Trash2, UserRound } from "lucide-react";
import type { MakeUpClass } from "@/api/makeUpClasses";
import { Drawer } from "./Drawer";
import { durationText, longDateLabel, timeLabel } from "./timeSlots";
import { SessionBadge } from "./SessionBadge";

export function MakeUpDetails({
  item,
  busy,
  opening,
  onOpenAttachment,
  onRemove,
  onClose,
}: {
  item: MakeUpClass;
  busy: boolean;
  opening: boolean;
  onOpenAttachment: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const duration = durationText(item.startTime, item.endTime);
  return (
    <Drawer
      title={item.subjectTitle}
      eyebrow={`Make-up class · Section ${item.sectionCode}`}
      subtitle={<span className="mk-mono">{item.subjectCode} · Section {item.sectionCode}</span>}
      onClose={onClose}
      locked={busy}
      footer={
        !item.session ? (
          <div className="mk-form-actions">
            <span className="mk-missing">Can be removed until its session is confirmed.</span>
            <button type="button" className="mk-btn is-danger" onClick={onRemove} disabled={busy}>
              {busy ? <Loader2 size={14} className="mk-spin" /> : <Trash2 size={14} />} Remove
            </button>
          </div>
        ) : undefined
      }
    >
      <section className="mk-step">
        <div className="mk-detail-when">
          <div>
            <span className="mk-label"><CalendarDays size={13} /> Date</span>
            <strong>{longDateLabel(item.date)}</strong>
          </div>
          <div>
            <span className="mk-label"><Clock size={13} /> Time</span>
            <strong>{timeLabel(item.startTime)} – {timeLabel(item.endTime)}</strong>
            <small>{duration ?? `${item.hours} h`}</small>
          </div>
        </div>
        <dl className="mk-dl">
          <div><dt><FlaskConical size={12} /> Laboratory</dt><dd className="mk-mono">{item.roomCode}</dd></div>
          <div><dt><UserRound size={12} /> Faculty</dt><dd>{item.faculty ?? "No faculty assigned"}</dd></div>
          <div><dt>Hours</dt><dd className="mk-mono">{item.hours} h</dd></div>
          <div><dt>Session</dt><dd><SessionBadge session={item.session} /></dd></div>
        </dl>
      </section>

      <section className="mk-step">
        <h3 className="mk-h3-plain">Reason</h3>
        <p className={item.reason ? "mk-body" : "mk-muted"}>{item.reason ?? "No reason was given."}</p>
      </section>

      <section className="mk-step">
        <h3 className="mk-h3-plain">Approved request</h3>
        <div className="mk-file">
          <FileText size={18} />
          <div>
            <strong title={item.attachmentName}>{item.attachmentName}</strong>
            <small>Added by {item.createdBy}</small>
          </div>
          <button type="button" className="mk-link" onClick={onOpenAttachment} disabled={opening}>
            {opening ? <Loader2 size={12} className="mk-spin" /> : <ExternalLink size={12} />} Open
          </button>
        </div>
      </section>

      <p className="mk-note"><Info size={12} /> On this date the make-up works like a regular lab meeting: students log in on the PC Agent, the faculty confirms with their PIN, and the hours count once the session is finally confirmed.</p>
    </Drawer>
  );
}
