import { useEffect, useMemo, useState } from "react";
import { Printer, FileSpreadsheet } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { getAcademicYears, type AcademicYear } from "@/api/academicYears";
import { getCourseSections, type CourseSectionSummary } from "@/api/courseSections";
import { getLaboratories, type LaboratorySummary } from "@/api/laboratories";
import { downloadCsv } from "@/utils/csv";

const MAROON = "#800000";
const GOLD = "#F4C430";
const MUTED = "#57606a";
const BORDER = "#d1d9e0";

const STATUS_LABEL = { Compliant: "Compliant", AtRisk: "At risk", NonCompliant: "Non-compliant" } as const;

export function ComplianceReportPage() {
  const { role } = useRole();
  const allowed = role === "Custodian" || role === "Administrator";

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [ayId, setAyId] = useState<number | "">("");
  const [sections, setSections] = useState<CourseSectionSummary[]>([]);
  const [labs, setLabs] = useState<LaboratorySummary[]>([]);
  const [labId, setLabId] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAcademicYears().then((ys) => {
      setYears(ys);
      setAyId((ys.find((y) => y.isActive) ?? ys[0])?.ayId ?? "");
    }).catch(() => setYears([]));
    getLaboratories().then(setLabs).catch(() => setLabs([]));
  }, []);

  useEffect(() => {
    if (!ayId) return;
    setLoading(true);
    // A class is counted in a lab when at least one of its meetings is held there.
    getCourseSections({ ayId: Number(ayId), labId: labId || undefined })
      .then(setSections).catch(() => setSections([])).finally(() => setLoading(false));
  }, [ayId, labId]);

  const ay = years.find((y) => y.ayId === ayId);
  const labRoom = labs.find((l) => l.labId === labId)?.roomCode ?? "";

  const rows = useMemo(
    () => [...sections].sort((a, b) => a.subject.code.localeCompare(b.subject.code) || a.sectionCode.localeCompare(b.sectionCode)),
    [sections],
  );

  const totals = useMemo(() => {
    const withData = rows.filter((r) => r.compliance);
    return {
      classes: rows.length,
      compliant: withData.filter((r) => r.compliance!.status === "Compliant").length,
      atRisk: withData.filter((r) => r.compliance!.status === "AtRisk").length,
      non: withData.filter((r) => r.compliance!.status === "NonCompliant").length,
    };
  }, [rows]);

  if (!allowed) {
    return (
      <div className="py-24 text-center text-[13px]" style={{ color: MUTED }}>
        This page is only available to the Custodian and Administrator roles.
      </div>
    );
  }

  const meetings = (r: CourseSectionSummary) =>
    r.meetings.map((m) => `${m.dayOfWeek.slice(0, 3)} ${m.laboratory.roomCode}`).join(", ");

  const exportCsv = () =>
    downloadCsv(
      `ched-compliance_${ay?.label ?? "report"}${labRoom ? `_${labRoom}` : ""}`,
      rows.map((r) => ({
        "Class code": r.sectionCode,
        Subject: `${r.subject.code} ${r.subject.title}`,
        Faculty: r.faculty ?? "Unassigned",
        Meetings: meetings(r),
        "Required hours": r.compliance?.requiredHours ?? "",
        "Confirmed hours": r.compliance?.confirmedHoursTotal ?? "",
        "Hours remaining": r.compliance ? Math.max(0, r.compliance.requiredHours - r.compliance.confirmedHoursTotal) : "",
        Status: r.compliance ? STATUS_LABEL[r.compliance.status] : "",
      })),
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>Reporting</div>
          <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>CHED Compliance Report</h1>
          <p className="mt-0.5 max-w-2xl text-[13px]" style={{ color: MUTED }}>
            Confirmed laboratory hours against the required hours for every class in the semester
            {labRoom ? ` held in ${labRoom}` : ""}.
          </p>
        </div>
        <div className="no-print flex items-center gap-2">
          <select value={labId} onChange={(e) => setLabId(e.target.value ? Number(e.target.value) : "")}
            className="rounded-md px-3 py-1.5 text-[12.5px] outline-none" style={{ border: `1px solid ${BORDER}` }}>
            <option value="">All laboratories</option>
            {labs.map((l) => <option key={l.labId} value={l.labId}>{l.roomCode}</option>)}
          </select>
          <select value={ayId} onChange={(e) => setAyId(e.target.value ? Number(e.target.value) : "")}
            className="rounded-md px-3 py-1.5 text-[12.5px] outline-none" style={{ border: `1px solid ${BORDER}` }}>
            {years.map((y) => <option key={y.ayId} value={y.ayId}>{y.label}{y.isActive ? " (active)" : ""}</option>)}
          </select>
          <button onClick={exportCsv} disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium"
            style={{ border: `1px solid ${BORDER}`, background: "#fff", opacity: rows.length === 0 ? 0.6 : 1 }}>
            <FileSpreadsheet className="size-3.5" /> Export CSV
          </button>
          <button onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium"
            style={{ background: MAROON, color: GOLD }}>
            <Printer className="size-3.5" /> Print
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Classes" value={totals.classes} />
        <Stat label="Compliant" value={totals.compliant} color="#1a7f37" />
        <Stat label="At risk" value={totals.atRisk} color="#9a6700" />
        <Stat label="Non-compliant" value={totals.non} color="#b42318" />
      </div>

      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr style={{ background: "#f6f8fa", color: MUTED }}>
              {["Class", "Subject", "Faculty", "Meetings", "Confirmed / Required", "Remaining", "Status"].map((h, i) => (
                <th key={h} className={`py-2.5 text-left font-mono text-[10.5px] uppercase tracking-wider ${i === 0 ? "pl-4" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = r.compliance;
              return (
                <tr key={r.sectionId} style={{ borderTop: "1px solid #e1e4e8" }}>
                  <td className="py-2 pl-4 font-mono text-[11.5px]" style={{ color: MAROON, fontWeight: 600 }}>{r.sectionCode}</td>
                  <td className="py-2 pr-3">{r.subject.code} {r.subject.title}</td>
                  <td className="py-2 pr-3" style={{ color: r.faculty ? MUTED : MAROON }}>{r.faculty ?? "Unassigned"}</td>
                  <td className="py-2 pr-3 font-mono text-[11px]" style={{ color: MUTED }}>{meetings(r)}</td>
                  <td className="py-2 pr-3 font-mono">{c ? `${c.confirmedHoursTotal} / ${c.requiredHours}h` : "—"}</td>
                  <td className="py-2 pr-3 font-mono">{c ? `${Math.max(0, c.requiredHours - c.confirmedHoursTotal)}h` : "—"}</td>
                  <td className="py-2 pr-4">{c ? STATUS_LABEL[c.status] : "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-[13px]" style={{ color: MUTED }}>
                {loading ? "Loading..." : labRoom ? `No classes meet in ${labRoom} this semester.` : "No classes for this semester."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "12px 14px" }}>
      <div className="font-mono text-[10.5px] uppercase tracking-wider" style={{ color: MUTED }}>{label}</div>
      <div className="mt-1 font-mono" style={{ fontSize: 22, fontWeight: 600, color: color ?? "#0d1117" }}>{value}</div>
    </div>
  );
}
