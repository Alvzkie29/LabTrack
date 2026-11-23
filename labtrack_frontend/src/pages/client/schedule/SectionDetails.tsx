import { AlertTriangle, ArrowLeft, CalendarDays, Check, CircleAlert, Clock, FlaskConical, Loader2, Lock, RotateCcw, Save, UserRound, UserRoundX } from "lucide-react";
import type { CourseSectionSummary } from "@/api/courseSections";
import type { LaboratorySummary } from "@/api/laboratories";
import type { FacultyOption } from "@/api/sessionConfirmations";
import { FacultyPicker, type OptionsState } from "./FacultyPicker";
import { durationLabel, meetingRefs, minutesLabel, timeLabel, type Conflict } from "./scheduleUtils";

export type SaveStatus = { kind: "saved" } | { kind: "error"; message: string };

export function SectionDetails({
  section,
  periodLabel,
  labs,
  labFilter,
  conflictMap,
  canAssign,
  faculty,
  facultyState,
  draft,
  saving,
  status,
  onDraft,
  onSave,
  onRevert,
  onRetryOptions,
  onBack,
}: {
  section: CourseSectionSummary;
  periodLabel: string;
  labs: LaboratorySummary[];
  labFilter: number | "all";
  conflictMap: Map<string, Conflict[]>;
  canAssign: boolean;
  faculty: FacultyOption[];
  facultyState: OptionsState;
  /** undefined = no unsaved change */
  draft: string | null | undefined;
  saving: boolean;
  status: SaveStatus | undefined;
  onDraft: (facultyId: string | null) => void;
  onSave: () => void;
  onRevert: () => void;
  onRetryOptions: () => void;
  onBack?: () => void;
}) {
  const refs = meetingRefs(section);
  const labName = (labId: number) => labs.find((l) => l.labId === labId)?.name;
  const chosen = draft === undefined ? section.facultyId : draft;
  const dirty = draft !== undefined && draft !== section.facultyId;
  const draftName = draft ? faculty.find((f) => f.id === draft)?.fullName ?? "the selected faculty" : "Unassigned";

  return (
    <div className="sch-details">
      {onBack && (
        <button type="button" className="sch-back" onClick={onBack}>
          <ArrowLeft size={15} /> All course sections
        </button>
      )}

      {/* A. Identity */}
      <header className="sch-identity">
        <p className="sch-eyebrow">Section {section.sectionCode}</p>
        <h2>{section.subject.title}</h2>
        <p className="sch-identity-sub">
          <span>{section.subject.code}</span> · <span>Section {section.sectionCode}</span>
          {section.term && <em>{section.term}</em>}
        </p>
        <div className="sch-identity-facts">
          <span><CalendarDays size={13} /> {periodLabel}</span>
          <span className={section.facultyId ? "" : "is-missing"}>
            {section.facultyId ? <UserRound size={13} /> : <UserRoundX size={13} />}
            {section.faculty ?? "No faculty assigned"}
          </span>
          <span><Clock size={13} /> {refs.length} {refs.length === 1 ? "meeting" : "meetings"} per week</span>
        </div>
      </header>

      {/* B. Faculty assignment */}
      <section className="sch-block" aria-labelledby="sch-fac-heading">
        <div className="sch-block-head">
          <h3 id="sch-fac-heading"><UserRound size={15} /> Faculty assignment</h3>
          {!canAssign && <span className="sch-readonly-tag"><Lock size={11} /> Read-only</span>}
        </div>

        {canAssign ? (
          <>
            <div className="sch-fac-row">
              <FacultyPicker
                value={chosen}
                fallbackLabel={section.faculty}
                options={faculty}
                optionsState={facultyState}
                disabled={saving}
                onChange={onDraft}
              />
              <button type="button" className="sch-save" onClick={onSave} disabled={!dirty || saving}>
                {saving ? <Loader2 size={14} className="sch-spin" /> : <Save size={14} />}
                {saving ? "Saving…" : "Save assignment"}
              </button>
            </div>

            <div className="sch-fac-feedback" aria-live="polite">
              {facultyState === "error" && (
                <p className="is-error"><CircleAlert size={13} /> The faculty list could not be loaded. <button type="button" onClick={onRetryOptions}>Retry</button></p>
              )}
              {saving && <p><Loader2 size={13} className="sch-spin" /> Saving {draftName} to this section…</p>}
              {!saving && status?.kind === "error" && (
                <p className="is-error">
                  <CircleAlert size={13} /> Not saved: {status.message} Your choice is kept, so you can try again.
                  {dirty && <button type="button" onClick={onRevert}><RotateCcw size={11} /> Revert</button>}
                </p>
              )}
              {!saving && status?.kind === "saved" && !dirty && <p className="is-ok"><Check size={13} /> Saved. The server confirmed the assignment.</p>}
              {!saving && dirty && status?.kind !== "error" && (
                <p className="is-pending">
                  Unsaved change: currently <b>{section.faculty ?? "Unassigned"}</b>.
                  <button type="button" onClick={onRevert}><RotateCcw size={11} /> Revert</button>
                </p>
              )}
            </div>
            <p className="sch-note">Faculty belong to the whole section and apply to every meeting below. Saving does not change the schedule, attendance, or confirmed hours.</p>
          </>
        ) : (
          <p className={`sch-fac-readonly ${section.facultyId ? "" : "is-missing"}`}>
            {section.faculty ?? "No faculty assigned yet."}
          </p>
        )}
      </section>

      {/* C. Imported meetings */}
      <section className="sch-block" aria-labelledby="sch-meet-heading">
        <div className="sch-block-head">
          <h3 id="sch-meet-heading"><FlaskConical size={15} /> Weekly lab meetings</h3>
          <span className="sch-readonly-tag"><Lock size={11} /> Imported</span>
        </div>

        {refs.length === 0 ? (
          <p className="sch-muted">No lab meetings were imported for this section.</p>
        ) : (
          <ol className="sch-slots">
            {refs.map((r) => {
              const conflicts = conflictMap.get(r.key) ?? [];
              const name = labName(r.meeting.laboratory.labId);
              const dur = durationLabel(r);
              const matches = labFilter !== "all" && r.meeting.laboratory.labId === labFilter;
              return (
                <li key={r.key} className={`sch-slot ${matches ? "is-match" : ""}`}>
                  <span className="sch-slot-day">{r.meeting.dayOfWeek}</span>
                  <span className="sch-slot-time">
                    {timeLabel(r.meeting.startTime)} <i>–</i> {timeLabel(r.meeting.endTime)}
                    {dur && <small>{dur}</small>}
                  </span>
                  <span className="sch-slot-lab">
                    <b>{r.meeting.laboratory.roomCode}</b>
                    {name && name !== r.meeting.laboratory.roomCode && <small>{name}</small>}
                  </span>
                  {!r.valid && <span className="sch-slot-note">Time could not be read from the import.</span>}
                  {conflicts.map((c) => {
                    const other = c.a.section.sectionId === section.sectionId ? c.b : c.a;
                    return (
                      <span key={c.key} className="sch-slot-warn">
                        <AlertTriangle size={12} /> Overlaps section {other.section.sectionCode} ({other.section.subject.code}) in {c.roomCode}, {minutesLabel(c.overlapStart)} – {minutesLabel(c.overlapEnd)}
                      </span>
                    );
                  })}
                </li>
              );
            })}
          </ol>
        )}
        <p className="sch-note"><Lock size={11} /> Days, times, and labs come from the Custodian's imported schedule and are read-only here. Attendance is matched against them.</p>
      </section>
    </div>
  );
}
