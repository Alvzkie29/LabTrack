import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarDays, CircleAlert, ExternalLink, Lightbulb, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { useRole, canAccess } from "@/contexts/RoleContext";
import { getCourseSection, type CourseSectionSummary } from "@/api/courseSections";
import { apiRequest } from "@/api/client";
import type { RemedialRecommendationRow } from "@/api/remedial";
import { availableNumber, displayNumber, latestRecommendation, recommendationDate, RiskProgress, RiskStatus, verifiedProgress } from "./risk-data";

type SectionRecommendation = Omit<RemedialRecommendationRow, "section" | "subject"> & { sectionId: number };
function timeLabel(value: string) {
  const [h, m] = value.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}` : "Time unavailable";
}
interface Props { section: CourseSectionSummary | null; wide: boolean; onClose: () => void; returnFocus: HTMLElement | null }
export function RiskInspector({ section, wide, onClose, returnFocus }: Props) {
  function restoreFocus() { if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); }
  if (wide) return section && <aside id="risk-inspector" className="risk-inspector risk-inspector-inline" aria-labelledby="risk-inspector-heading">
    <div className="risk-inspector-heading">
      <div>
        <p className="risk-eyebrow">Remedial recommendation</p>
        <h2 id="risk-inspector-heading">Section inspector</h2>
      </div>
      <button type="button" aria-label="Close section inspector" onClick={() => { onClose(); restoreFocus(); }}>
        <X size={17} />
      </button>
    </div>
    <InspectorContents key={section.sectionId} section={section} />
  </aside>;
  return <Sheet open={section !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent id="risk-inspector" side="right" className="risk-inspector risk-inspector-drawer" onCloseAutoFocus={(event) => { if (returnFocus?.isConnected) { event.preventDefault(); restoreFocus(); } }}>
      <div className="risk-inspector-heading">
        <div>
          <p className="risk-eyebrow">Remedial recommendation</p>
          <SheetTitle>Section inspector</SheetTitle>
          <SheetDescription>Review verified hours and the latest saved remedial recommendation.</SheetDescription>
        </div>
      </div>
      {section && <InspectorContents key={section.sectionId} section={section} />}
    </SheetContent>
  </Sheet>;
}
function InspectorContents({ section }: { section: CourseSectionSummary }) {
  const { user } = useAuth(); const { role } = useRole(); const allowed = canAccess(role, "/at-risk");
  const prefix = ["risk-workspace", user?.userId, role, "inspector", section.sectionId];
  const detailQuery = useQuery({ queryKey: [...prefix, "detail"], queryFn: () => getCourseSection(section.sectionId), enabled: allowed, staleTime: 60_000, retry: false });
  const recQuery = useQuery({ queryKey: [...prefix, "recommendations"], queryFn: () => apiRequest<SectionRecommendation[]>(`/api/remedialrecommendations/by-section/${section.sectionId}`), enabled: allowed, staleTime: 60_000, retry: false });
  const detail = detailQuery.isError ? undefined : detailQuery.data;
  const compliance = detail ? detail.compliance : section.compliance;
  const hours = verifiedProgress(compliance);
  const recommendation = recQuery.data ? latestRecommendation(recQuery.data) : undefined;
  const subject = detail?.subject ?? section.subject; const faculty = detail ? detail.faculty : section.faculty; const meetings = detail?.meetings ?? section.meetings;
  return <div className="risk-inspector-body">
    <div className="risk-inspector-identity">
      <span className="risk-inspector-icon">
        <BookOpen size={23} />
      </span>
      <p>{subject.code} <span>Section {section.sectionCode}</span>
      </p>
      <h3>{subject.title}</h3>
      <RiskStatus status={compliance?.status} />
      <p className="risk-inspector-faculty">{faculty ?? "Faculty not assigned"}</p>
    </div>
    {detailQuery.isPending && <p className="risk-inline-loading" role="status">
      <RefreshCw size={13} className="risk-spin" />Refreshing section details…</p>}
    {detailQuery.isError && <div className="risk-inline-error" role="alert">Section details could not be refreshed. Showing the current list’s records.<button onClick={() => void detailQuery.refetch()}>Retry details</button>
    </div>}
    <section className="risk-inspector-hours">
      <h4>
        <ShieldCheck size={15} /> Verified laboratory hours</h4>
      <p>
        <strong>{displayNumber(hours.confirmed)}</strong>
        <span>/ {displayNumber(hours.required)} required hours</span>
      </p>
      <RiskProgress compliance={compliance} />
      <dl>
        <div>
          <dt>Required hours</dt>
          <dd>{displayNumber(hours.required)}</dd>
        </div>
        <div>
          <dt>Confirmed hours</dt>
          <dd>{displayNumber(hours.confirmed)}</dd>
        </div>
        <div>
          <dt>Remaining requirement</dt>
          <dd>{displayNumber(hours.remaining)} hrs</dd>
        </div>
      </dl>
      <small>Remaining requirement is required minus confirmed hours. It is distinct from the saved recommendation’s deficit.</small>
    </section>
    <section className="risk-recommendation-panel">
      <h4>
        <Lightbulb size={16} /> Saved remedial recommendation</h4>
      {recQuery.isPending ? <p className="risk-inline-loading" role="status">
        <RefreshCw size={13} className="risk-spin" />Loading recommendation…</p> : recQuery.isError ? <div className="risk-inline-error" role="alert">The recommendation could not be loaded.<button onClick={() => void recQuery.refetch()}>Try again</button>
        </div> : !recommendation ? <p className="risk-no-recommendation">No remedial recommendation is available for this section.</p> : <>
          <div className="risk-recommended-sessions">
            <strong>{displayNumber(recommendation.additionalSessionsNeeded)}</strong>
            <span>{availableNumber(recommendation.additionalSessionsNeeded) === null ? "Session count unavailable" : "recommended additional sessions"}</span>
          </div>
          <dl>
            <div>
              <dt>Recorded hour deficit</dt>
              <dd>{displayNumber(recommendation.hourDeficit)} hrs</dd>
            </div>
            <div>
              <dt>Generated</dt>
              <dd>{recommendationDate(recommendation.generatedAt)}</dd>
            </div>
          </dl>
          <p className="risk-recommendation-note">This is the latest saved backend recommendation. It reflects the hours recorded when it was generated.</p>
        </>}
    </section>
    <section className="risk-inspector-schedule">
      <h4>
        <CalendarDays size={15} /> Laboratory schedule</h4>{meetings.length ? <ul>{meetings.map(m =>
          <li key={m.scheduleId}>
            <div>
              <strong>{m.dayOfWeek}</strong>
              <span>{m.laboratory.name} · {m.laboratory.roomCode}</span>
            </div>
            <time>{timeLabel(m.startTime)}–{timeLabel(m.endTime)}</time>
          </li>)}</ul> : <p>No laboratory meeting information is available.</p>}{detail?.makeUps?.length ? <div className="risk-makeups">
            <strong>Registered make-up classes</strong>{detail.makeUps.map(m =>
              <p key={m.makeUpId}>{m.date.slice(0, 10)} · {m.roomCode} · {timeLabel(m.startTime)}–{timeLabel(m.endTime)}</p>)}</div> : null}</section>
    <div className="risk-inspector-links">
      <Link to={`/courses/${section.sectionId}`}>
        <BookOpen size={14} /> Course records <ExternalLink size={12} />
      </Link>{canAccess(role, "/schedule") && <Link to="/schedule">
        <CalendarDays size={14} /> Schedule</Link>}{canAccess(role, "/compliance-report") && <Link to="/compliance-report">
          <CircleAlert size={14} /> Compliance report</Link>}</div>
  </div>;
}
