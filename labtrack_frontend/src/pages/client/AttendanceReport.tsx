import { useEffect, useState } from "react";
import { Download, Search } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { getCourseSections, type CourseSectionSummary } from "@/api/courseSections";
import { getLaboratories, type LaboratorySummary } from "@/api/laboratories";
import { getAttendanceReport, type AttendanceReportRow } from "@/api/attendance";
import { downloadCsv } from "@/utils/csv";

const MAROON = "#800000";
const MUTED = "#57606a";
const BORDER = "#d1d9e0";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function weekAgoIso() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export function AttendanceReportsPage() {
  const { role } = useRole();
  const allowed = role === "LabAssistant" || role === "Custodian" || role === "Administrator";

  const [sections, setSections] = useState<CourseSectionSummary[]>([]);
  const [labs, setLabs] = useState<LaboratorySummary[]>([]);
  const [sectionId, setSectionId] = useState<number | "">("");
  const [labId, setLabId] = useState<number | "">("");
  const [from, setFrom] = useState(weekAgoIso());
  const [to, setTo] = useState(todayIso());

  const [rows, setRows] = useState<AttendanceReportRow[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    getCourseSections().then(setSections);
    getLaboratories().then(setLabs);
  }, [allowed]);

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center" style={{ color: MUTED }}>
        <div className="mb-3 text-[13px] font-mono uppercase tracking-wider">Restricted</div>
        <p className="max-w-sm text-[13px]">
          Attendance reporting is only available to the Laboratory Assistant, Laboratory Custodian, and Administrator roles.
        </p>
      </div>
    );
  }

  const runReport = async () => {
    setIsLoading(true);
    setHasSearched(true);
    try {
      const result = await getAttendanceReport({
        sectionId: sectionId || undefined,
        labId: labId || undefined,
        from,
        to,
      });
      setRows(result);
    } finally {
      setIsLoading(false);
    }
  };

  const exportCsv = () => {
    downloadCsv(
      `attendance-report_${from}_to_${to}`,
      rows.map((r) => ({
        Student: r.student,
        "School ID": r.studentSchoolId,
        Section: r.section,
        Workstation: r.workstation,
        "Login Time": new Date(r.loginTime).toLocaleString(),
        "Logout Time": r.logoutTime ? new Date(r.logoutTime).toLocaleString() : "",
        "Activity Score": r.activityScore ?? "",
        "Presence Status": r.presenceStatus ?? "",
        Reviewed: r.isReviewed ? "Yes" : "No",
        "Review Outcome": r.reviewOutcome ?? "",
      })),
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>
          Reporting
        </div>
        <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>
          Attendance Report
        </h1>
        <p className="mt-0.5 max-w-2xl text-[13px]" style={{ color: MUTED }}>
          Pull the verified attendance record for a section and date range — the exported table is the report
          itself, ready to print or hand off for CHED documentation.
        </p>
      </div>

      {/* Filters */}
      <div
        className="flex flex-wrap items-center gap-2.5"
        style={{ background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 6, padding: 14 }}
      >
        <select
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
          className="rounded-md px-2.5 py-1.5 text-[12.5px]"
          style={{ border: `1px solid ${BORDER}`, color: "#0d1117" }}
        >
          <option value="">All sections</option>
          {sections.map((s) => (
            <option key={s.sectionId} value={s.sectionId}>{s.sectionCode}</option>
          ))}
        </select>

        <select
          value={labId}
          onChange={(e) => setLabId(e.target.value ? Number(e.target.value) : "")}
          className="rounded-md px-2.5 py-1.5 text-[12.5px]"
          style={{ border: `1px solid ${BORDER}`, color: "#0d1117" }}
        >
          <option value="">All labs</option>
          {labs.map((l) => (
            <option key={l.labId} value={l.labId}>{l.name}</option>
          ))}
        </select>

        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-md px-2.5 py-1.5 text-[12.5px]"
          style={{ border: `1px solid ${BORDER}`, color: "#0d1117" }}
        />
        <span className="text-[12px]" style={{ color: MUTED }}>to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-md px-2.5 py-1.5 text-[12.5px]"
          style={{ border: `1px solid ${BORDER}`, color: "#0d1117" }}
        />

        <button
          onClick={runReport}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold"
          style={{ border: `1px solid ${BORDER}`, color: "#0d1117", opacity: isLoading ? 0.6 : 1 }}
        >
          <Search className="size-3.5" /> {isLoading ? "Running..." : "Run report"}
        </button>

        <button
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold"
          style={{ background: MAROON, color: "#F4C430", opacity: rows.length === 0 ? 0.5 : 1 }}
        >
          <Download className="size-3.5" /> Export CSV
        </button>
      </div>

      {/* Results */}
      <div style={{ background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <div
          className="px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider"
          style={{ background: "#f6f8fa", color: MUTED, borderBottom: "1px solid #e1e4e8" }}
        >
          {rows.length} record{rows.length === 1 ? "" : "s"}
        </div>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr style={{ background: "#f6f8fa", color: MUTED }}>
              <th className="py-2 pl-4 text-left font-mono text-[10.5px] uppercase tracking-wider">Student</th>
              <th className="py-2 text-left font-mono text-[10.5px] uppercase tracking-wider">Section</th>
              <th className="py-2 text-left font-mono text-[10.5px] uppercase tracking-wider">Workstation</th>
              <th className="py-2 text-left font-mono text-[10.5px] uppercase tracking-wider">Login</th>
              <th className="py-2 text-left font-mono text-[10.5px] uppercase tracking-wider">Logout</th>
              <th className="py-2 pr-4 text-right font-mono text-[10.5px] uppercase tracking-wider">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.attendanceId} style={{ borderTop: "1px solid #e1e4e8" }}>
                <td className="py-2 pl-4">
                  {r.student}
                  <div className="font-mono text-[10.5px]" style={{ color: MUTED }}>{r.studentSchoolId}</div>
                </td>
                <td className="py-2 pr-3 font-mono" style={{ color: MAROON, fontWeight: 600 }}>{r.section}</td>
                <td className="py-2 pr-3 font-mono">{r.workstation}</td>
                <td className="py-2 pr-3 font-mono text-[11.5px]">{new Date(r.loginTime).toLocaleString()}</td>
                <td className="py-2 pr-3 font-mono text-[11.5px]" style={{ color: MUTED }}>
                  {r.logoutTime ? new Date(r.logoutTime).toLocaleString() : "still active"}
                </td>
                <td className="py-2 pr-4 text-right font-mono">{r.activityScore?.toFixed(0) ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[13px]" style={{ color: MUTED }}>
                  {!hasSearched ? "Set your filters and run the report." : "No records match these filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}