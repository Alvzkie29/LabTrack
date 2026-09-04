import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useRole, canAccess } from "@/contexts/RoleContext";
import { Restricted } from "@/components/Restricted";
import { getCourseSections, type CourseSectionSummary } from "@/api/courseSections";

const MAROON = "#800000";
const MUTED = "#57606a";
const BORDER = "#d1d9e0";

export function CoursesPage() {
  const { role } = useRole();
  const [sections, setSections] = useState<CourseSectionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getCourseSections()
      .then(setSections)
      .finally(() => setIsLoading(false));
  }, []);

  if (!canAccess(role, "/courses")) return <Restricted path="/courses" title="Courses is restricted" />;

  return (
    <div className="space-y-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>
          Course sections · {sections.length}
        </div>
        <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Courses</h1>
        <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
          Verified attendance is tracked against the course section — not the instructor.
        </p>
      </div>

      <div style={{ background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr style={{ background: "#f6f8fa", color: MUTED }}>
              <th className="py-2.5 pl-4 text-left font-mono text-[10.5px] uppercase tracking-wider">Code</th>
              <th className="py-2.5 text-left font-mono text-[10.5px] uppercase tracking-wider">Subject</th>
              <th className="py-2.5 text-left font-mono text-[10.5px] uppercase tracking-wider">Instructor</th>
              <th className="py-2.5 text-left font-mono text-[10.5px] uppercase tracking-wider">Academic Year</th>
              <th className="py-2.5 w-48 text-left font-mono text-[10.5px] uppercase tracking-wider">Progress</th>
              <th className="py-2.5 pr-4 text-left font-mono text-[10.5px] uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((cs) => {
              const confirmed = cs.compliance?.confirmedHoursTotal ?? 0;
              const required = cs.compliance?.requiredHours ?? 0;
              const pct = required > 0 ? Math.min(100, Math.round((confirmed / required) * 100)) : 0;
              return (
                <tr key={cs.sectionId} style={{ borderTop: "1px solid #e1e4e8" }}>
                  <td className="py-2.5 pl-4">
                    <Link
                      to={`/courses/${cs.sectionId}`}
                      className="font-mono text-[11.5px]"
                      style={{ color: MAROON, fontWeight: 600 }}
                    >
                      {cs.sectionCode}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3">{cs.subject.title}</td>
                  <td className="py-2.5 pr-3" style={{ color: cs.hasInstructorAssigned ? MUTED : MAROON }}>
                    {cs.instructorName ?? "Unassigned"}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[11.5px]" style={{ color: "#0d1117" }}>
                    {cs.academicYear}
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div style={{ flex: 1, height: 5, background: "#e1e4e8", borderRadius: 999, maxWidth: 140 }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: MAROON, borderRadius: 999 }} />
                      </div>
                      <span className="font-mono text-[11px]" style={{ color: MUTED }}>
                        {confirmed}/{required}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4">
                    <StatusPill status={cs.compliance?.status ?? "NonCompliant"} />
                  </td>
                </tr>
              );
            })}
            {sections.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-[12.5px]" style={{ color: MUTED }}>
                  {isLoading ? "Loading..." : "No course sections found."}
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