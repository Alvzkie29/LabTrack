import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { PCStatusDot } from "@/components/StatusBadge";
import { DashboardSummary } from "@/components/DashboardSummary";
import { useAuth } from "@/contexts/AuthContext";
import { getCourseSections, type CourseSectionSummary } from "@/api/courseSections";
import { getLaboratories, getLabBlueprint, type LaboratorySummary, type LabBlueprint } from "@/api/laboratories";
import { getFlaggedSessions } from "@/api/attendance";
import type { PCStatus } from "@/utils/mock-data";
import { ArrowRight } from "lucide-react";

const INK = "#0d1117";
const MUTED = "#57606a";
const BORDER = "#d1d9e0";
const MAROON = "#800000";

export function DashboardPage() {
  const { user } = useAuth();

  const [sections, setSections] = useState<CourseSectionSummary[]>([]);
  const [labs, setLabs] = useState<LaboratorySummary[]>([]);
  const [blueprints, setBlueprints] = useState<LabBlueprint[]>([]);
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const [sectionsRes, labsRes] = await Promise.all([getCourseSections(), getLaboratories()]);
        if (cancelled) return;
        setSections(sectionsRes);
        setLabs(labsRes);

        // Blueprint gives per-workstation live status per lab — fetched per lab since
        // there's no single "all labs' workstations" endpoint.
        const blueprintResults = await Promise.all(labsRes.map((l) => getLabBlueprint(l.labId)));
        if (cancelled) return;
        setBlueprints(blueprintResults);

        // Flagged sessions is staff-only; Students never see the dashboard at all
        // (route is gated by RequireAuth + role already), but guard anyway.
        try {
          const flagged = await getFlaggedSessions();
          if (!cancelled) setFlaggedCount(flagged.length);
        } catch {
          // ignore — role without permission, or none flagged
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const roomCounts = blueprints.map((bp) => {
    const counts = bp.workstations.reduce(
      (acc, w) => {
        acc[w.status] = (acc[w.status] ?? 0) + 1;
        return acc;
      },
      { Active: 0, Idle: 0, Offline: 0 } as Record<PCStatus, number>,
    );
    return { lab: bp, counts, total: bp.workstations.length };
  });

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>
            {isLoading ? "Loading..." : "Live"}
          </div>
          <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>
            Dashboard
          </h1>
          <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
            Welcome back, {user?.fullName ?? "—"}. Compliance and utilization overview across every laboratory.
          </p>
        </div>

        <Link
          to="/workstation"
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium"
          style={{ background: MAROON, color: "#F4C430" }}
        >
          View workstations <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {/* Stat cards */}
      <DashboardSummary sections={sections} labs={labs} flaggedCount={flaggedCount} />

      {/* Per-lab live status strip */}
      <div style={{ background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{ borderBottom: "1px solid #e1e4e8" }}
        >
          <span className="text-[13px] font-semibold" style={{ color: INK }}>Laboratory status</span>
          <Link to="/workstation" className="font-mono text-[11px]" style={{ color: MAROON }}>
            seating view →
          </Link>
        </div>
        <div className="grid divide-y" style={{ borderColor: "#e1e4e8" }}>
          {roomCounts.map(({ lab, counts, total }) => (
            <Link
              key={lab.labId}
              to={`/workstation?lab=${lab.labId}`}
              className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-[#f6f8fa]"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px]" style={{ color: INK }}>{lab.name}</span>
                <span className="text-[11.5px]" style={{ color: MUTED }}>{total} workstations</span>
              </div>
              <div className="flex items-center gap-4 text-[11.5px]">
                <RoomLegend n={counts.Active} kind="Active" />
                <RoomLegend n={counts.Idle} kind="Idle" />
                <RoomLegend n={counts.Offline} kind="Offline" />
              </div>
            </Link>
          ))}
          {roomCounts.length === 0 && !isLoading && (
            <div className="px-4 py-6 text-center text-[12.5px]" style={{ color: MUTED }}>
              No laboratories set up yet.
            </div>
          )}
        </div>
      </div>

      {/* Course sections overview */}
      <div style={{ background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{ borderBottom: "1px solid #e1e4e8" }}
        >
          <span className="text-[13px] font-semibold" style={{ color: INK }}>Course sections</span>
          <Link to="/courses" className="font-mono text-[11px]" style={{ color: MAROON }}>
            view all →
          </Link>
        </div>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr style={{ background: "#f6f8fa", color: MUTED }}>
              <th className="py-2 pl-4 text-left font-mono text-[10.5px] uppercase tracking-wider">Code</th>
              <th className="py-2 text-left font-mono text-[10.5px] uppercase tracking-wider">Subject</th>
              <th className="py-2 text-left font-mono text-[10.5px] uppercase tracking-wider">Instructor</th>
              <th className="py-2 text-left font-mono text-[10.5px] uppercase tracking-wider">Status</th>
              <th className="py-2 pr-4 text-right font-mono text-[10.5px] uppercase tracking-wider">Hours</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((cs) => (
              <tr key={cs.sectionId} style={{ borderTop: "1px solid #e1e4e8" }}>
                <td className="py-2 pl-4 font-mono text-[11.5px]">{cs.sectionCode}</td>
                <td className="py-2 pr-3" style={{ color: INK }}>{cs.subject.title}</td>
                <td className="py-2 pr-3" style={{ color: cs.hasInstructorAssigned ? MUTED : MAROON }}>
                  {cs.instructorName ?? "Unassigned"}
                </td>
                <td className="py-2 pr-3">
                  <StatusPill status={cs.compliance?.status ?? "NonCompliant"} />
                </td>
                <td className="py-2 pr-4 text-right font-mono">
                  {cs.compliance ? `${cs.compliance.confirmedHoursTotal}/${cs.compliance.requiredHours}` : "—"}
                </td>
              </tr>
            ))}
            {sections.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-[12px]" style={{ color: MUTED }}>
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

function RoomLegend({ n, kind }: { n: number; kind: PCStatus }) {
  return (
    <div className="flex items-center gap-1.5">
      <PCStatusDot status={kind} />
      <span className="font-mono" style={{ color: INK }}>{n}</span>
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