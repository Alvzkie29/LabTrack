import { CalendarDays, Clock3 } from "lucide-react";
import type { StatusWeek } from "@/api/sessionStatus";
import { dateLabel, meetingTone, placeDay, StatusBadge, timelineLayout, timeLabel, type CalendarMeeting } from "./calendar-data";

interface Props { week: StatusWeek; meetings: CalendarMeeting[]; selectedId: string | null; onSelect: (meeting: CalendarMeeting, element: HTMLElement) => void; day: string; onDayChange: (day: string) => void; view: "week" | "day"; today: string; }
function MeetingCard({ meeting, selected, onSelect, compact = false }: { meeting: CalendarMeeting; selected: boolean; onSelect: Props["onSelect"]; compact?: boolean }) {
  const label = `${meeting.row.subjectCode}, section ${meeting.row.sectionCode}, ${dateLabel(meeting.cell.date)}, ${meeting.start === null ? "time unavailable" : `${timeLabel(meeting.start)} to ${timeLabel(meeting.end!)}`}, ${meeting.cell.status ?? "unmarked"}${meeting.cell.awaitingFinal ? ", awaiting final confirmation" : ""}`;
  return <button type="button" className={`cs-meeting cs-meeting-${meetingTone(meeting.cell)} ${selected ? "is-selected" : ""} ${compact ? "is-compact" : ""}`} aria-label={label} aria-expanded={selected} title={label} onClick={e => onSelect(meeting, e.currentTarget)}>
    <span className="cs-meeting-title">
      <strong>{meeting.row.subjectCode}</strong>
      <small>{meeting.row.sectionCode}</small>
    </span>
    <span className="cs-meeting-time">{meeting.start === null ? "Time unavailable" : `${timeLabel(meeting.start)}–${timeLabel(meeting.end!)}`}</span>
    {!compact && <span className="cs-meeting-faculty">{meeting.row.faculty ?? "Faculty unassigned"}</span>}
    <span className="cs-meeting-status">
      <StatusBadge cell={meeting.cell} />{meeting.cell.awaitingFinal && <small>Awaiting final</small>}{meeting.makeUp && <small>Make-up</small>}</span>
  </button>;
}
export function ClassStatusCalendar({ week, meetings, selectedId, onSelect, day, onDayChange, view, today }: Props) {
  const layout = timelineLayout(meetings); const placed = new Map(week.days.map(date => [date, placeDay(meetings.filter(m => m.cell.date === date))]));
  const unknown = meetings.filter(m => m.start === null || m.end === null);
  const selectedDay = week.days.includes(day) ? day : week.days[0];
  const dayMeetings = meetings.filter(m => m.cell.date === selectedDay).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity) || a.row.sectionCode.localeCompare(b.row.sectionCode));
  const template = `88px ${week.days.map(date => `minmax(${Math.max(185, Math.max(1, ...(placed.get(date) ?? []).map(e => e.lanes)) * 150)}px,1fr)`).join(" ")}`;
  return <div className={`cs-calendar-content ${view === "day" ? "is-day-view" : ""}`}>
    <div className="cs-day-agenda">
      <nav className="cs-day-navigation" aria-label="Choose calendar day">{week.days.map(date =>
        <button key={date} type="button" aria-pressed={date === selectedDay} className={date === selectedDay ? "is-active" : ""} onClick={() => onDayChange(date)}>
          <span>{dateLabel(date, { weekday: "short" })}</span>
          <strong className={date === today ? "is-today" : ""}>{dateLabel(date, { day: "numeric" })}</strong>
        </button>)}</nav>
      <h3>{dateLabel(selectedDay)}</h3>
      {dayMeetings.length ? <div className="cs-agenda-list">{dayMeetings.map(meeting =>
        <div key={meeting.id} className="cs-agenda-entry">
          <span className="cs-agenda-time">{meeting.start === null ? <Clock3 size={16} /> : timeLabel(meeting.start)}</span>
          <MeetingCard meeting={meeting} selected={selectedId === meeting.id} onSelect={onSelect} />
        </div>)}</div> : <div className="cs-day-empty">
        <CalendarDays size={24} />
        <p>No laboratory meetings are scheduled for this day.</p>
      </div>}
    </div>
    <div className="cs-week-timeline">
      {unknown.length > 0 && <div className="cs-unknown-times">
        <h3>
          <Clock3 size={14} /> Meetings with unavailable times</h3>
        <p>The weekly status records remain available. Reload meeting times to position these meetings on the timeline.</p>
        <div>{unknown.map(meeting =>
          <button key={meeting.id} type="button" onClick={e => onSelect(meeting, e.currentTarget)}>{dateLabel(meeting.cell.date, { weekday: "short" })} · {meeting.row.subjectCode} · {meeting.row.sectionCode}<StatusBadge cell={meeting.cell} />
          </button>)}</div>
      </div>}
      {layout && <div className="cs-calendar-scroll" tabIndex={0} role="region" aria-label="Monday to Friday laboratory calendar">
        <div className="cs-calendar-grid" style={{ gridTemplateColumns: template }}>
          <div className="cs-timezone">PHT</div>{week.days.map(date =>
            <div className={`cs-day-heading ${date === today ? "is-today" : ""}`} key={date}>
              <span>{dateLabel(date, { weekday: "long" })}</span>
              <strong>{dateLabel(date, { day: "numeric" })}</strong>
            </div>)}
          <div className="cs-time-axis" style={{ height: layout.height + 16 }}>{layout.times.map((time, index) =>
            <span key={time} style={{ top: layout.offsets.get(time), transform: index === 0 ? "none" : "translateY(-50%)" }}>{timeLabel(time)}</span>)}</div>
          {week.days.map(date =>
            <div className={`cs-day-track ${date === today ? "is-today" : ""}`} key={date} style={{ height: layout.height + 16 }}>{layout.times.map(time =>
              <span key={time} className="cs-grid-line" style={{ top: layout.offsets.get(time) }} />)}{(placed.get(date) ?? []).map(({ meeting, lane, lanes }) => {
const top = layout.offsets.get(meeting.start!)!; const height = layout.offsets.get(meeting.end!)! - top - 5; return <div className="cs-event-position" key={meeting.id} style={{ top: top + 3, height, left: `calc(${lane / lanes * 100}% + 4px)`, width: `calc(${100 / lanes}% - 8px)` }}>
                  <MeetingCard meeting={meeting} selected={selectedId === meeting.id} onSelect={onSelect} compact={height < 115} />
                </div>
})}</div>)}
        </div>
      </div>}
    </div>
  </div>;
}
