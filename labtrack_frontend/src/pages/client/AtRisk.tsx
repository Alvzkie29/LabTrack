import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useRole, canAccess } from "@/contexts/RoleContext";
import { Restricted } from "@/components/Restricted";
import { getCourseSections, type CourseSectionSummary } from "@/api/courseSections";
import { getRemedialRecommendations, type RemedialRecommendationRow } from "@/api/remedial";

const MAROON = "#800000";
const MUTED = "#57606a";

function daysAgo(iso?: string) {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (d <= 0) return "today";
  return `${d}d ago`;
}

export function AtRiskPage() {
  const { role } = useRole();
  const [sections, setSections] = useState<CourseSectionSummary[]>([]);
  const [recommendations, setRecommendations] = useState<RemedialRecommendationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([getCourseSections(), getRemedialRecommendations()])
      .then(([s, r]) => {
        setSections(s);
        setRecommendations(r);
      })
      .finally(() => setIsLoading(false));
  }, []);

  if (!canAccess(role, "/at-risk")) return <Restricted path="/at-risk" title="At Risk is restricted" />;

  const flagged = sections.filter((cs) => cs.compliance && cs.compliance.status !== "Compliant");

  // A section can have multiple historical recommendations (one generated per confirmation
  // while still behind) — only the most recently generated one is relevant here.
  const latestRecBySection = useMemo(() => {
    const map = new Map<string, RemedialRecommendationRow>();
    for (const rec of recommendations) {
      const existing = map.get(rec.section);
      if (!existing || new Date(rec.generatedAt) > new Date(existing.generatedAt)) {
        map.set(rec.section, rec);
      }
    }
    return map;
  }, [recommendations]);

  return (
    <div className="space-y-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>
          Monitoring · {flagged.length} flagged
        </div>
        <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>At Risk</h1>
        <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
          Course sections behind their required CHED hours, with the system's remedial recommendation.
        </p>
      </div>

      <div style={{ background: "#ffffff", border: "1px solid #d1d9e0", borderRadius: 6 }}>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr style={{ background: "#f6f8fa", color: MUTED }}>
              <th className="py-2 pl-4 text-left font-mono text-[10.5px] uppercase tracking-wider">Code</th>
              <th className="py-2 text-left font-mono text-[10.5px] uppercase tracking-wider">Subject</th>
              <th className="py-2 text-left font-mono text-[10.5px] uppercase tracking-wider">Instructor</th>
              <th className="py-2 text-left font-mono text-[10.5px] uppercase tracking-wider">Status</th>
              <th className="py-2 text-right font-mono text-[10.5px] uppercase tracking-wider">Hours</th>
              <th className="py-2 text-right font-mono text-[10.5px] uppercase tracking-wider">Deficit</th>
              <th className="py-2 pr-4 text-right font-mono text-[10.5px] uppercase tracking-wider">Sessions needed</th>
            </tr>
          </thead>
          <tbody>
            {flagged.map((cs) => {
              const rec = latestRecBySection.get(cs.sectionCode);
              return (
                <tr key={cs.sectionId} style={{ borderTop: "1px solid #e1e4e8" }}>
                  <td className="py-2 pl-4 font-mono text-[11.5px]">
                    <Link to={`/courses/${cs.sectionId}`} style={{ color: MAROON }}>
                      {cs.sectionCode}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">{cs.subject.title}</td>
                  <td className="py-2 pr-3" style={{ color: cs.hasInstructorAssigned ? MUTED : MAROON }}>
                    {cs.instructorName ?? "Unassigned"}
                  </td>
                  <td className="py-2 pr-3">
                    <StatusPill status={cs.compliance!.status} />
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {cs.compliance!.confirmedHoursTotal}/{cs.compliance!.requiredHours}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono" style={{ color: MAROON, fontWeight: 600 }}>
                    {rec ? `${rec.hourDeficit}h` : "—"}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-[11.5px]" style={{ color: MUTED }}>
                    {rec ? `${rec.additionalSessionsNeeded} (as of ${daysAgo(rec.generatedAt)})` : "—"}
                  </td>
                </tr>
              );
            })}
            {flagged.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-[12.5px]" style={{ color: MUTED }}>
                  {isLoading ? "Loading..." : "No sections are currently at risk."}
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
      className="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10.5px] font-medium"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}