import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRole, canAccess } from "@/contexts/RoleContext";
import { Restricted } from "@/components/Restricted";
import { getCourseSection, type CourseSectionDetail } from "@/api/courseSections";

const MAROON = "#800000";
const MUTED = "#57606a";
const BORDER = "#d1d9e0";

function SectionNotFound() {
  return (
    <div className="max-w-md">
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>Course section not found</h1>
      <Link to="/courses" className="mt-3 inline-block font-mono text-[12px]" style={{ color: MAROON }}>
        ← back to courses
      </Link>
    </div>
  );
}

/**
 * Real pace projection: compares hours actually confirmed-per-week-elapsed against the
 * required hours-per-week the subject needs to hit its total by the end of the term.
 * weeksElapsed is derived from the academic year's real StartDate, clamped to [1, termWeeks]
 * so a section doesn't divide by zero on day one or show >100% denominators after the term ends.
 */
function computePaceProjection(section: CourseSectionDetail) {
  const termWeeks = section.subject.termWeeks;
  const requiredHours = section.compliance?.requiredHours ?? section.subject.requiredHours;
  const confirmedHours = section.compliance?.confirmedHoursTotal ?? 0;

  if (termWeeks <= 0 || requiredHours <= 0) return null;

  const startDate = new Date(section.academicYear.startDate).getTime();
  const now = Date.now();
  const rawWeeksElapsed = (now - startDate) / (7 * 24 * 60 * 60 * 1000);
  const weeksElapsed = Math.min(termWeeks, Math.max(1, Math.round(rawWeeksElapsed)));

  const requiredPerWeek = requiredHours / termWeeks;
  const loggedPerWeek = confirmedHours / weeksElapsed;
  const projectedPct = Math.round((loggedPerWeek / requiredPerWeek) * 100);

  return { termWeeks, weeksElapsed, requiredPerWeek, loggedPerWeek, projectedPct };
}

export function CourseDetailPage() {
  const { role } = useRole();
  const { sectionId } = useParams<{ sectionId: string }>();
  const [section, setSection] = useState<CourseSectionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!sectionId) return;
    getCourseSection(Number(sectionId))
      .then(setSection)
      .catch(() => setNotFound(true))
      .finally(() => setIsLoading(false));
  }, [sectionId]);

  if (!canAccess(role, "/courses")) return <Restricted path="/courses" title="Courses is restricted" />;
  if (isLoading) return <div className="py-10 text-center text-[13px]" style={{ color: MUTED }}>Loading...</div>;
  if (notFound || !section) return <SectionNotFound />;

  const confirmed = section.compliance?.confirmedHoursTotal ?? 0;
  const required = section.compliance?.requiredHours ?? 0;
  const pct = required > 0 ? Math.min(100, Math.round((confirmed / required) * 100)) : 0;
  const pace = computePaceProjection(section);

  return (
    <div className="space-y-5">
      <Link to="/courses" className="inline-flex items-center gap-1.5 font-mono text-[11.5px]" style={{ color: MUTED }}>
        <ArrowLeft className="size-3.5" /> back to courses
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[11.5px]" style={{ color: MUTED }}>{section.sectionCode}</div>
          <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>
            {section.subject.title}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[12.5px]" style={{ color: MUTED }}>
            <span>Instructor: <span style={{ color: section.hasInstructorAssigned ? "#0d1117" : MAROON }}>
              {section.instructorName ?? "Unassigned"}
            </span></span>
            <span>·</span>
            <span>Academic Year: <span className="font-mono" style={{ color: "#0d1117" }}>{section.academicYear.label}</span></span>
            <span>·</span>
            <span className="font-mono">{section.subject.code}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={section.compliance?.status ?? "NonCompliant"} />
          <Button size="sm" variant="outline" className="h-8">
            <FileText className="mr-1.5 size-3.5" /> Request report
          </Button>
        </div>
      </div>

      {/* Progress + pace */}
      <div className="grid gap-4 md:grid-cols-2">
        <div style={{ background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 6, padding: 18 }}>
          <div className="font-mono text-[10.5px] uppercase tracking-wider" style={{ color: MUTED }}>
            Confirmed CHED hours
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono" style={{ fontSize: 28, fontWeight: 600 }}>{confirmed}</span>
            <span className="font-mono text-[13px]" style={{ color: MUTED }}>/ {required} required</span>
          </div>
          <div style={{ marginTop: 12, height: 6, background: "#e1e4e8", borderRadius: 999 }}>
            <div style={{ width: `${pct}%`, height: "100%", background: MAROON, borderRadius: 999 }} />
          </div>
          <div className="mt-2 font-mono text-[11px]" style={{ color: MUTED }}>{pct}% complete</div>
        </div>

        <div style={{ background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 6, padding: 18 }}>
          <div className="font-mono text-[10.5px] uppercase tracking-wider" style={{ color: MUTED }}>Pace projection</div>
          {pace ? (
            <>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono" style={{ fontSize: 28, fontWeight: 600, color: pace.projectedPct >= 100 ? "#1a7f37" : pace.projectedPct >= 75 ? "#9a6700" : "#b42318" }}>
                  {pace.projectedPct}%
                </span>
                <span className="font-mono text-[13px]" style={{ color: MUTED }}>of required trajectory</span>
              </div>
              <svg viewBox="0 0 200 60" className="mt-3 w-full" style={{ height: 60 }} preserveAspectRatio="none">
                <line x1="0" y1="50" x2="200" y2="10" stroke="#d1d9e0" strokeDasharray="3 3" strokeWidth="1" />
                <line
                  x1="0" y1="50" x2="200"
                  y2={Math.max(2, 50 - Math.min(1.2, pace.projectedPct / 100) * 40)}
                  stroke={MAROON} strokeWidth="1.5"
                />
              </svg>
              <div className="mt-1 flex items-center gap-3 font-mono text-[10.5px]" style={{ color: MUTED }}>
                <span>— required</span>
                <span style={{ color: MAROON }}>— logged</span>
              </div>
              <div className="mt-2 font-mono text-[10.5px]" style={{ color: MUTED }}>
                Week {pace.weeksElapsed} of {pace.termWeeks} · {pace.loggedPerWeek.toFixed(1)}h/wk logged vs {pace.requiredPerWeek.toFixed(1)}h/wk required
              </div>
            </>
          ) : (
            <div className="mt-2 text-[12.5px]" style={{ color: MUTED }}>
              Not enough term/schedule data to project pace.
            </div>
          )}
        </div>
      </div>

      {/* Session confirmations */}
      <div style={{ background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <div className="px-4 py-2.5" style={{ borderBottom: "1px solid #e1e4e8" }}>
          <span className="text-[13px] font-semibold">Confirmed sessions</span>
          <span className="ml-2 font-mono text-[11px]" style={{ color: MUTED }}>
            {section.sessionConfirmations.length} entries
          </span>
        </div>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr style={{ background: "#f6f8fa", color: MUTED }}>
              <th className="py-2 pl-4 text-left font-mono text-[10.5px] uppercase tracking-wider">Date</th>
              <th className="py-2 text-left font-mono text-[10.5px] uppercase tracking-wider">Confirmed by</th>
              <th className="py-2 text-left font-mono text-[10.5px] uppercase tracking-wider">Hours credited</th>
              <th className="py-2 pr-4 text-left font-mono text-[10.5px] uppercase tracking-wider">Notes</th>
            </tr>
          </thead>
          <tbody>
            {section.sessionConfirmations.map((sc) => (
              <tr key={sc.confirmationId} style={{ borderTop: "1px solid #e1e4e8" }}>
                <td className="py-2 pl-4 font-mono">{new Date(sc.sessionDate).toLocaleDateString()}</td>
                <td className="py-2 font-mono" style={{ color: "#0d1117" }}>{sc.confirmedBy}</td>
                <td className="py-2 font-mono">{sc.hoursCredited}h</td>
                <td className="py-2 pr-4 text-[11.5px]" style={{ color: MUTED }}>{sc.notes ?? "—"}</td>
              </tr>
            ))}
            {section.sessionConfirmations.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-[12px]" style={{ color: MUTED }}>
                  No confirmed sessions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: "Compliant" | "AtRisk" | "NonCompliant" }) {
  const map = {
    Compliant: { label: "Compliant", bg: "#f0f9ee", color: "#1a7f37" },
    AtRisk: { label: "At Risk", bg: "#fff8e6", color: "#9a6700" },
    NonCompliant: { label: "Non-Compliant", bg: "#fdecea", color: "#b42318" },
  } as const;
  const s = map[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[11px] font-medium"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}