import { useState } from "react";
import type { WeeklyReport } from "@/api/reports";
import { REPORT_HEADER } from "@/utils/reportHeader";
import { dateCovered, hours, longDate, withLabSuffix } from "./report-format";
const BORDER = "#d1d9e0";
const CELL_BORDER = "1px solid #000";
const HEAD_FILL = "#d9d9d9";
const GREEN_FILL = "#d9ead3";

/** The report itself, laid out like the office's spreadsheet. This is what prints. */
export function WeeklyReportDocument({ report, title, reportDate }: {
  report: WeeklyReport;
  title: string;
  reportDate: string;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const th: React.CSSProperties = { border: CELL_BORDER, background: HEAD_FILL, fontWeight: 700, padding: "4px 6px", textAlign: "center" };
  const td: React.CSSProperties = { border: CELL_BORDER, padding: "10px 6px", textAlign: "center", verticalAlign: "middle" };

  return (
    <div className="weekly-sheet mx-auto bg-white" style={{ maxWidth: 1100, padding: 24, border: `1px solid ${BORDER}`, borderRadius: 4, color: "#000", fontFamily: "Arial, Helvetica, sans-serif" }}>
      {/* Letterhead */}
      <div className="flex items-start justify-between gap-6">
        <div style={{ minHeight: 80 }}>
          {!logoFailed ? (
            <img src={REPORT_HEADER.logoPath} alt={REPORT_HEADER.institution} onError={() => setLogoFailed(true)} style={{ height: 88, objectFit: "contain" }} />
          ) : (
            <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 26, fontWeight: 700, color: "#a3222b", lineHeight: 1.1, paddingTop: 24 }}>
              {REPORT_HEADER.institution}
            </div>
          )}
        </div>
        <div className="text-right" style={{ fontStyle: "italic" }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{REPORT_HEADER.office}</div>
          {REPORT_HEADER.addressLines.map((line) => <div key={line} style={{ fontSize: 15 }}>{line}</div>)}
        </div>
      </div>
      <div style={{ height: 4, margin: "10px 0 18px", background: "linear-gradient(90deg, #f7e15a 0%, #e3a72f 22%, #a3222b 50%, #e3a72f 78%, #f7e15a 100%)" }} />

      <div className="text-center" style={{ fontSize: 16, fontWeight: 700, marginBottom: 18 }}>{title}</div>

      {/* Department on the left, date / week / date covered on the right */}
      <div className="flex items-end justify-between gap-6" style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
        <div>DEPARTMENT:&nbsp;&nbsp;{REPORT_HEADER.department} - {report.laboratory.name.toUpperCase()}</div>
        <table style={{ borderCollapse: "collapse" }}>
          <tbody>
            <tr><td style={{ paddingRight: 40 }}>DATE:</td><td className="text-center">{longDate(reportDate)}</td></tr>
            <tr><td style={{ paddingRight: 40 }}>WEEK:</td><td className="text-center">{report.weekNumber}</td></tr>
            <tr><td style={{ paddingRight: 40 }}>DATE COVERED:</td><td className="text-center">{dateCovered(report.weekStart, report.weekEnd)}</td></tr>
          </tbody>
        </table>
      </div>
      <div style={{ borderTop: "1px solid #bbb", marginBottom: 20 }} />

      {/* The table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <colgroup>
          <col style={{ width: "18%" }} /><col style={{ width: "9%" }} /><col style={{ width: "9%" }} />
          <col style={{ width: "8%" }} /><col style={{ width: "8%" }} /><col style={{ width: "8%" }} /><col />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2} style={th}>Faculty</th>
            <th rowSpan={2} style={th}>SUBJECT CODE</th>
            <th rowSpan={2} style={th}>SUBJECT TITLE</th>
            <th colSpan={3} style={th}>TOTAL LAB HOURS</th>
            <th rowSpan={2} style={th}>REMARKS</th>
          </tr>
          <tr>
            <th style={th}>Previous</th>
            <th style={th}>Current</th>
            <th style={th}>Sub Total</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.sectionId}>
              <td style={{ ...td, background: GREEN_FILL, textAlign: "left" }}>{r.faculty ?? ""}</td>
              <td style={td}>{r.sectionCode}</td>
              <td style={{ ...td, background: GREEN_FILL }} title={r.subjectTitle}>{withLabSuffix(r.subjectCode)}</td>
              <td style={td}>{hours(r.previousHours)}</td>
              <td style={td}>{hours(r.currentHours)}</td>
              <td style={td}>{hours(r.subTotal)}</td>
              <td style={td}>{r.remarks}</td>
            </tr>
          ))}
          {report.rows.length === 0 && (
            <tr><td colSpan={7} style={{ ...td, color: "#555" }}>No classes meet in this laboratory this term.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
