import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Clock3, FileText, GraduationCap, RefreshCw, Search, Users, UserRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRole, canAccess } from "@/contexts/RoleContext";
import { Restricted } from "@/components/Restricted";
import { getCourseRoster, getCourseSection } from "@/api/courseSections";
import { getSectionAttendance } from "@/api/attendance";
import { ApiError } from "@/api/client";
import { courseProgress, courseStatusLabels, hoursLabel } from "@/components/courses/CourseProgress";
import "./course-section.css";

const PAGE_SIZE = 20;
const EMPTY_ROSTER: Awaited<ReturnType<typeof getCourseRoster>> = [];
function todayInManila() {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function dateLabel(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
// These endpoint values already represent Philippine local meeting/login times.
function timeLabel(value: string) {
  const match = (value.includes("T") ? value.split("T")[1] : value).match(/^(\d{2}):(\d{2})/);
  if (!match) return "Time unavailable";
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}
function initials(name: string) { return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join(""); }
function QueryError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="section-error" role="alert"><CircleAlert size={18} aria-hidden="true" /><p>{message}</p><button type="button" onClick={retry}>Try again</button></div>;
}
function PanelHeading({ id, icon, title, description, children }: { id: string; icon: ReactNode; title: string; description: string; children?: ReactNode }) {
  return <div className="section-panel-heading"><div><h2 id={id}>{icon}{title}</h2><p>{description}</p></div>{children}</div>;
}

export function CourseDetailPage() {
  const { sectionId } = useParams<{ sectionId: string }>();
  const { role } = useRole();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const id = Number(sectionId);
  const allowed = canAccess(role, "/courses");
  const validId = Number.isInteger(id) && id > 0;
  const prefix = ["full-course-section", user?.userId, role, id];
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [attendanceDate, setAttendanceDate] = useState(todayInManila);
  const sectionQuery = useQuery({ queryKey: [...prefix, "details"], queryFn: () => getCourseSection(id), enabled: allowed && validId, staleTime: 30_000, retry: false });
  const rosterQuery = useQuery({ queryKey: [...prefix, "roster"], queryFn: () => getCourseRoster(id), enabled: allowed && validId && sectionQuery.isSuccess, staleTime: 30_000, retry: false });
  const attendanceQuery = useQuery({ queryKey: [...prefix, "attendance", attendanceDate], queryFn: () => getSectionAttendance(id, attendanceDate), enabled: allowed && validId && sectionQuery.isSuccess && /^\d{4}-\d{2}-\d{2}$/.test(attendanceDate), staleTime: 30_000, retry: false });
  const roster = rosterQuery.data ?? EMPTY_ROSTER;
  const filteredRoster = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return roster.filter((student) => !query || [student.name, student.schoolId, student.email ?? ""].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [roster, search]);
  const logins = useMemo(() => new Map(attendanceQuery.data?.present.map((entry) => [entry.studentId, entry]) ?? []), [attendanceQuery.data]);
  const pages = Math.max(1, Math.ceil(filteredRoster.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const firstRow = (currentPage - 1) * PAGE_SIZE;
  const isRefreshing = sectionQuery.isFetching || rosterQuery.isFetching || attendanceQuery.isFetching;
  const back = <Link to="/courses" className="section-back"><ArrowLeft size={16} aria-hidden="true" />Back to courses</Link>;

  if (!allowed) return <Restricted path="/courses" title="Courses is restricted" />;
  if (!validId || (sectionQuery.error instanceof ApiError && sectionQuery.error.status === 404)) return <div className="section-page">{back}<div className="section-empty"><BookOpen size={30} /><h1>Course section not found</h1><p>Return to Courses and select an available section.</p></div></div>;
  if (sectionQuery.isPending) return <div className="section-page section-loading" role="status"><RefreshCw size={22} /><p>Loading course section…</p></div>;
  if (sectionQuery.isError || !sectionQuery.data) return <div className="section-page">{back}<QueryError message="Course details could not be loaded. Your class records have not been changed." retry={() => void sectionQuery.refetch()} /></div>;

  const section = sectionQuery.data;
  const progress = courseProgress(section.compliance, section.subject.requiredHours);
  const status = section.compliance?.status ?? "Unassessed";
  const faculty = section.facultyDetails;
  const attendance = attendanceQuery.data;
  const hasMeetings = !!attendance?.section.meetings.length;
  const metrics = [
    { icon: Clock3, label: "Confirmed laboratory hours", value: `${hoursLabel(progress.confirmed)} / ${hoursLabel(progress.required)} h`, note: progress.percent === null ? "Awaiting a compliance record" : `${progress.percent}% of required hours complete`, showProgress: true },
    { icon: BookOpen, label: "Hours remaining", value: `${hoursLabel(progress.remaining)} h`, note: "Based on confirmed sessions" },
    { icon: Users, label: "Students enrolled", value: rosterQuery.isSuccess ? String(roster.length) : "—", note: rosterQuery.isPending ? "Loading class list…" : rosterQuery.isError ? "Class list unavailable" : "Students on this section’s roster" },
    { icon: CheckCircle2, label: "Finalized sessions", value: String(section.sessionConfirmations.filter((session) => session.finalConfirmedAt).length), note: "With final confirmation recorded" },
  ];

  return <div className="section-page">
    {back}
    <header className="section-header"><div><p className="section-eyebrow">Course section {section.sectionCode}</p><h1>{section.subject.title}</h1><p>{section.subject.code} · {section.academicYear.label} · {section.term}</p></div><div className="section-actions">
      <span className="section-status" data-status={status}>{courseStatusLabels[status]}</span>
      <button type="button" className="section-button" disabled={isRefreshing} onClick={() => void queryClient.invalidateQueries({ queryKey: prefix })}><RefreshCw size={16} aria-hidden="true" />{isRefreshing ? "Refreshing…" : "Refresh"}</button>
      <button type="button" className="section-button primary" onClick={() => window.print()}><FileText size={16} aria-hidden="true" />Print report</button>
    </div></header>
    <section className="section-metrics" aria-label="Section summary">{metrics.map(({ icon: Icon, label, value, note, showProgress }) => <article className="section-metric" key={label}><Icon size={20} aria-hidden="true" /><div><span>{label}</span><strong>{value}</strong><small>{note}</small>{showProgress && progress.percent !== null && <div className="section-progress" role="progressbar" aria-label="Confirmed hours completion" aria-valuenow={progress.barPercent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress.barPercent}%` }} /></div>}</div></article>)}</section>
    {!section.compliance && <p className="section-note">No compliance record is available yet. Required hours come from the subject; confirmed hours and compliance status are not assumed.</p>}

    <div className="section-detail-grid">
      <section className="section-panel" aria-labelledby="section-faculty-title">
        <PanelHeading id="section-faculty-title" icon={<UserRound size={18} />} title="Assigned faculty" description="Instructor and academic information for this section." />
        <div className="section-person"><span className="section-avatar" aria-hidden="true">{section.faculty ? initials(section.faculty) : <UserRound size={22} />}</span><div><h3>{faculty?.fullName ?? section.faculty ?? "Faculty not assigned"}</h3><p>{faculty ? faculty.isActive ? "Active faculty account" : "Inactive faculty account" : section.faculty ? "Faculty member" : "Ask your custodian to assign an instructor."}</p></div></div>
        <dl className="section-meta"><div><dt>School ID</dt><dd>{faculty?.schoolId || "Not provided"}</dd></div><div><dt>Email address</dt><dd>{faculty?.email ? <a className="section-inline-link" href={`mailto:${faculty.email}`}>{faculty.email}</a> : "Not provided"}</dd></div><div><dt>Academic year</dt><dd>{section.academicYear.label}</dd></div><div><dt>Term</dt><dd>{section.term}</dd></div><div><dt>Semester dates</dt><dd>{dateLabel(section.academicYear.startDate)} – {dateLabel(section.academicYear.endDate)}</dd></div></dl>
      </section>
      <section className="section-panel" aria-labelledby="section-schedule-title">
        <PanelHeading id="section-schedule-title" icon={<CalendarDays size={18} />} title="Laboratory schedule" description="Meeting days and times · Philippine time"><span className="section-count">{section.meetings.length} weekly {section.meetings.length === 1 ? "meeting" : "meetings"}</span></PanelHeading>
        {section.meetings.length ? <ul className="section-meeting-list">{section.meetings.map((meeting) => <li className="section-meeting" key={meeting.scheduleId}><div><strong>{meeting.dayOfWeek}</strong><span>{timeLabel(meeting.startTime)} – {timeLabel(meeting.endTime)}</span></div><div><strong>{meeting.laboratory.roomCode}</strong><span>{meeting.laboratory.name}</span></div></li>)}</ul> : <p className="section-note">No regular laboratory meetings have been recorded.</p>}
        {!!section.makeUps.length && <div className="section-makeups"><h3>Make-up sessions</h3>{section.makeUps.map((meeting) => <div className="section-meeting" key={meeting.makeUpId}><div><strong>{dateLabel(meeting.date)}</strong><span>{timeLabel(meeting.startTime)} – {timeLabel(meeting.endTime)}</span></div><div><strong>{meeting.roomCode}</strong><span>{meeting.reason || "Make-up class"}</span></div></div>)}</div>}
      </section>
    </div>

    <section className="section-panel" aria-labelledby="section-attendance-title">
      <PanelHeading id="section-attendance-title" icon={<CalendarDays size={18} />} title="Daily attendance" description="Review the class list and recorded logins for a selected date."><label className="section-date-field">Attendance date<input type="date" value={attendanceDate} onChange={(event) => { if (event.target.value) setAttendanceDate(event.target.value); }} /></label></PanelHeading>
      {attendanceQuery.isPending ? <p className="section-note" role="status">Loading attendance for {dateLabel(attendanceDate)}…</p> : attendanceQuery.isError ? <QueryError message="Attendance could not be loaded for this date. The class list remains available below." retry={() => void attendanceQuery.refetch()} /> : attendance && <>
        <div className="section-attendance-stats"><div><strong>{attendance.presentCount}</strong><span>Students with a login</span></div><div><strong>{attendance.absentCount}</strong><span>Rostered students without a login</span></div><div><strong>{attendance.notOnRoster.length}</strong><span>Logins outside the current roster</span></div></div>
        <p className="section-note">{hasMeetings ? `${attendance.section.meetings.map((meeting) => `${meeting.lab}: ${timeLabel(meeting.startTime)}–${timeLabel(meeting.endTime)}`).join(" · ")}.` : "No laboratory meeting is scheduled on this date."} Login records do not automatically credit CHED hours.</p>
      </>}
    </section>

    <section className="section-panel" aria-labelledby="section-roster-title">
      <PanelHeading id="section-roster-title" icon={<Users size={18} />} title="Class list" description={`Enrolled students · attendance shown for ${dateLabel(attendanceDate)}`}>{canAccess(role, "/imports") && <Link className="section-button" to="/imports">Import class list</Link>}</PanelHeading>
      {rosterQuery.isPending ? <p className="section-note" role="status">Loading enrolled students…</p> : rosterQuery.isError ? <QueryError message="The enrolled student list could not be loaded. This does not mean the roster is empty." retry={() => void rosterQuery.refetch()} /> : !roster.length ? <div className="section-empty"><GraduationCap size={30} /><h3>No students enrolled yet</h3><p>Import the class list for section {section.sectionCode} to assign students to its laboratory sessions.</p></div> : <>
        <div className="section-toolbar"><label className="section-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search enrolled students</span><input type="search" placeholder="Search student name, school ID, or email…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label><span className="section-count" role="status">{filteredRoster.length} of {roster.length} students</span></div>
        {!filteredRoster.length ? <div className="section-empty"><Search size={26} /><h3>No matching students</h3><p>Try another name, school ID, or email address.</p><button className="section-button" type="button" onClick={() => { setSearch(""); setPage(1); }}>Clear search</button></div> : <>
          <div className="section-table-scroll"><table className="section-table"><caption className="sr-only">Students enrolled in section {section.sectionCode} and their login status on {dateLabel(attendanceDate)}</caption><thead><tr><th scope="col">Student name</th><th scope="col">School ID</th><th scope="col">Email address</th><th scope="col">Attendance</th><th scope="col">Login / workstation</th></tr></thead><tbody>{filteredRoster.map((student, index) => {
            const login = logins.get(student.studentId);
            return <tr key={student.studentId} className={index < firstRow || index >= firstRow + PAGE_SIZE ? "section-row-outside-page" : undefined}><td><strong>{student.name}</strong></td><td className="section-id">{student.schoolId}</td><td>{student.email || "Not provided"}</td><td>{attendanceQuery.isSuccess ? <span className={`section-flag ${login ? "present" : "pending"}`}>{login ? "Login recorded" : hasMeetings ? "No login recorded" : "No meeting scheduled"}</span> : <span className="section-flag pending">{attendanceQuery.isPending ? "Loading…" : "Unavailable"}</span>}</td><td>{attendanceQuery.isSuccess && login ? `${timeLabel(login.loginTime)} · ${login.workstation || login.pcIdentifier}` : "—"}</td></tr>;
          })}</tbody></table></div>
          <div className="section-pagination"><span>Showing {firstRow + 1}–{Math.min(firstRow + PAGE_SIZE, filteredRoster.length)} of {filteredRoster.length} students</span><div><button type="button" className="section-button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} />Previous</button><span>Page {currentPage} of {pages}</span><button type="button" className="section-button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next<ChevronRight size={16} /></button></div></div>
        </>}
      </>}
    </section>

    <section className="section-panel" aria-labelledby="section-confirmations-title">
      <PanelHeading id="section-confirmations-title" icon={<CheckCircle2 size={18} />} title="Session confirmations" description="Faculty review, final confirmation, and credited hours."><span className="section-count">{section.sessionConfirmations.length} records</span></PanelHeading>
      {!section.sessionConfirmations.length ? <div className="section-empty"><CheckCircle2 size={28} /><h3>No session confirmations yet</h3><p>Reviewed sessions will appear here when faculty or staff record their confirmations.</p></div> : <div className="section-table-scroll"><table className="section-table"><caption className="sr-only">Session confirmations for section {section.sectionCode}</caption><thead><tr><th scope="col">Date</th><th scope="col">Session / faculty</th><th scope="col">Final confirmation</th><th scope="col">Credited hours</th><th scope="col">Notes</th></tr></thead><tbody>{section.sessionConfirmations.map((session) => <tr key={session.confirmationId}><td>{dateLabel(session.sessionDate)}</td><td><strong>{session.sessionType}</strong><small>{session.facultyConfirmedBy ?? "Faculty review pending"}</small></td><td>{session.finalConfirmedAt ? <><span className="section-flag present">Confirmed</span><small>{session.finalConfirmedBy ?? "Staff"}</small></> : <span className="section-flag pending">Awaiting final confirmation</span>}</td><td>{session.finalConfirmedAt && session.hoursCredited !== null ? `${hoursLabel(session.hoursCredited)} h` : "—"}</td><td>{session.notes || "No notes"}</td></tr>)}</tbody></table></div>}
    </section>
    <footer className="section-footer">Section {section.sectionCode} · {section.subject.code} · {section.academicYear.label}. Student enrollment and attendance are shown separately from confirmed laboratory hours.</footer>
  </div>;
}
