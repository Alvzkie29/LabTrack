import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarDays, CircleAlert, ExternalLink, RefreshCw, UserRound } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { canAccess, useRole } from "@/contexts/RoleContext";
import { getCourseSection, type CourseSectionSummary } from "@/api/courseSections";
import { apiRequest } from "@/api/client";
import type { RemedialRecommendationRow } from "@/api/remedial";
import { CourseProgress, CourseStatusBadge, courseProgress, hoursLabel } from "./CourseProgress";

type SectionRecommendation = Pick<RemedialRecommendationRow, "recommendationId" | "hourDeficit" | "additionalSessionsNeeded" | "generatedAt"> & { sectionId: number };
const timeLabel = (time: string) => { const [hour, minute] = time.split(":").map(Number); return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`; };

export function CourseDetailsDrawer({ section, onClose, returnFocusElement }: { section: CourseSectionSummary | null; onClose: () => void; returnFocusElement: HTMLElement | null }) {
  return <Sheet open={section !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent side="right" className="course-details-drawer" onCloseAutoFocus={(event) => { if (returnFocusElement?.isConnected) { event.preventDefault(); returnFocusElement.focus({ preventScroll: true }); } }}>
      <div className="course-drawer-header"><p className="course-eyebrow">Section inspector</p><SheetTitle>Course details</SheetTitle><SheetDescription>Verified hours, compliance, and the section's current academic context.</SheetDescription></div>
      {section && <CourseDetails key={section.sectionId} section={section} />}
    </SheetContent>
  </Sheet>;
}
function CourseDetails({ section }: { section: CourseSectionSummary }) {
  const { user } = useAuth();
  const { role } = useRole();
  const allowed = canAccess(role, "/courses");
  const query = useQuery({ queryKey: ["courses-workspace", user?.userId, role, "detail", section.sectionId], queryFn: () => getCourseSection(section.sectionId), enabled: allowed, staleTime: 60_000, retry: false });
  const recommendations = useQuery({ queryKey: ["courses-workspace", user?.userId, role, "recommendations", section.sectionId],
    // Existing read-only by-section endpoint: this also handles historical semesters correctly.
    queryFn: () => apiRequest<SectionRecommendation[]>(`/api/remedialrecommendations/by-section/${section.sectionId}`), enabled: allowed, staleTime: 60_000, retry: false });
  const detail = query.isError ? undefined : query.data;
  const compliance = detail ? detail.compliance : section.compliance;
  const progress = courseProgress(compliance, detail?.subject.requiredHours);
  const latestRecommendation = recommendations.data?.slice().sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
  const meetings = detail?.meetings ?? section.meetings;
  const faculty = detail ? detail.faculty : section.faculty;
  const subject = detail?.subject ?? section.subject;
  return <div className="course-drawer-body">
    <div className="course-subject-identity"><span className="course-subject-icon"><BookOpen size={24} strokeWidth={1.5} /></span><p className="course-subject-code">{subject.code} <span>Section {section.sectionCode}</span></p><h3>{subject.title}</h3><CourseStatusBadge status={compliance?.status} /></div>
    {query.isPending && <p className="course-detail-loading" role="status"><RefreshCw size={13} className="course-spin" />Loading section details…</p>}
    {query.isError && <div className="course-inline-error" role="alert"><p>Additional section details could not be loaded. The listed section summary remains available.</p><button type="button" onClick={() => void query.refetch()}>Retry details</button></div>}
    <section className="course-hours-panel" aria-labelledby="course-hours-heading"><h4 id="course-hours-heading">Verified laboratory hours</h4><CourseProgress compliance={compliance} knownRequired={detail?.subject.requiredHours} showHours />
      <dl><div><dt>Required hours</dt><dd>{hoursLabel(progress.required)}</dd></div><div><dt>Confirmed hours</dt><dd>{hoursLabel(progress.confirmed)}</dd></div><div><dt>Remaining hours</dt><dd>{hoursLabel(progress.remaining)}</dd></div><div><dt>Completion</dt><dd>{progress.percent === null ? "—" : `${progress.percent}%`}</dd></div></dl>
      {!compliance && <p className="course-detail-note">No compliance record has been supplied. Confirmed hours and status are not assumed.</p>}
    </section>
    <section className="course-context-section"><h4><UserRound size={15} />Academic context</h4><dl className="course-context-facts"><div><dt>Section</dt><dd>{section.sectionCode}</dd></div><div><dt>Assigned faculty</dt><dd className={!faculty ? "course-unassigned" : ""}>{faculty ?? "Not assigned"}</dd></div><div><dt>Academic year</dt><dd>{detail?.academicYear.label ?? section.academicYear}</dd></div><div><dt>Term</dt><dd>{section.term}</dd></div></dl></section>
    <section className="course-context-section"><h4><CalendarDays size={15} />Laboratory schedule</h4>{meetings.length ? <ul className="course-meetings">{meetings.map((meeting) => <li key={meeting.scheduleId}><span><strong>{meeting.dayOfWeek}</strong><span>{meeting.laboratory.name} · {meeting.laboratory.roomCode}</span></span><time>{timeLabel(meeting.startTime)}–{timeLabel(meeting.endTime)}</time></li>)}</ul> : <p className="course-detail-note">No laboratory meetings have been provided.</p>}
      {!!detail?.makeUps?.length && <div className="course-makeups"><h5>Approved make-up classes</h5>{detail.makeUps.map((meeting) => <p key={meeting.makeUpId}>{meeting.date.slice(0, 10)} · {meeting.roomCode} · {timeLabel(meeting.startTime)}–{timeLabel(meeting.endTime)}</p>)}</div>}
    </section>
    <section className="course-context-section"><h4><CircleAlert size={15} />Existing recommendation</h4>{recommendations.isPending ? <p className="course-detail-note" role="status">Loading recommendation…</p> : recommendations.isError ? <div className="course-inline-error" role="status"><p>Recommendation information is unavailable.</p><button type="button" onClick={() => void recommendations.refetch()}>Retry</button></div> : latestRecommendation ? <div className="course-recommendation"><p><strong>{latestRecommendation.additionalSessionsNeeded}</strong> additional sessions recommended</p><p>{latestRecommendation.hourDeficit} hours remaining when generated.</p><small>Recorded {latestRecommendation.generatedAt.slice(0, 10)}. This is the saved recommendation, not a new calculation.</small></div> : <p className="course-detail-note">No remedial recommendation has been recorded for this section.</p>}</section>
    <div className="course-drawer-actions"><Link to={`/courses/${section.sectionId}`} className="course-primary-link"><ExternalLink size={15} />Open full section</Link>{canAccess(role, "/schedule") && <Link to="/schedule">Schedule</Link>}{canAccess(role, "/compliance-report") && <Link to="/compliance-report">Compliance Report</Link>}{canAccess(role, "/at-risk") && <Link to="/at-risk">At Risk</Link>}</div>
  </div>;
}
