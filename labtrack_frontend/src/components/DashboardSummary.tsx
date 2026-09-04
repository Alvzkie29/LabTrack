import { Gauge, Building2, Monitor, AlertCircle } from "lucide-react";
import type { CourseSectionSummary } from "@/api/courseSections";
import type { LaboratorySummary } from "@/api/laboratories";

const INK = "#0d1117";
const MUTED = "#57606a";
const BORDER = "#d1d9e0";
const MAROON = "#800000";

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "neutral" | "warning";
}) {
  return (
    <div
      className="flex items-center justify-between p-4"
      style={{ background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 6 }}
    >
      <div>
        <div className="font-mono text-[10.5px] uppercase tracking-wider" style={{ color: MUTED }}>
          {label}
        </div>
        <div className="mt-1" style={{ fontSize: 24, fontWeight: 600, color: INK, letterSpacing: -0.3 }}>
          {value}
        </div>
      </div>
      <div
        className="flex size-9 items-center justify-center rounded-md"
        style={{
          background: tone === "warning" ? "#fdecea" : "#f6f0dc",
          color: tone === "warning" ? "#b42318" : MAROON,
        }}
      >
        <Icon className="size-4" />
      </div>
    </div>
  );
}

/**
 * Real, currently-available stats only. The previous mock version also showed a
 * "peak time slot" card and two historical charts (room utilization by time-of-day,
 * weekly verified-hours trend) — those need a dedicated time-series/analytics
 * endpoint we haven't built yet (session dates/times aggregated over time), so
 * they're intentionally left out here rather than faked. Worth revisiting once
 * there's a reporting endpoint to back them.
 */
export function DashboardSummary({
  sections,
  labs,
  flaggedCount,
}: {
  sections: CourseSectionSummary[];
  labs: LaboratorySummary[];
  flaggedCount: number;
}) {
  const sectionsWithCompliance = sections.filter((s) => s.compliance !== null);
  const avgCompliance = sectionsWithCompliance.length
    ? Math.round(
        (sectionsWithCompliance.reduce(
          (sum, s) => sum + Math.min(1, s.compliance!.confirmedHoursTotal / Math.max(1, s.compliance!.requiredHours)),
          0,
        ) /
          sectionsWithCompliance.length) *
          100,
      )
    : 0;

  const atRiskCount = sectionsWithCompliance.filter(
    (s) => s.compliance!.status === "AtRisk" || s.compliance!.status === "NonCompliant",
  ).length;


  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard label="Avg compliance rate" value={`${avgCompliance}%`} icon={Gauge} />
      <StatCard label="At-risk sections" value={String(atRiskCount)} icon={AlertCircle} tone={atRiskCount > 0 ? "warning" : "neutral"} />
      <StatCard label="Laboratories" value={String(labs.length)} icon={Building2} />
      <StatCard
        label="Flagged sessions"
        value={String(flaggedCount)}
        icon={Monitor}
        tone={flaggedCount > 0 ? "warning" : "neutral"}
      />
    </div>
  );
}