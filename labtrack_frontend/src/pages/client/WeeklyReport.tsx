import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Printer, RotateCcw, Upload } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { getWeeklyTemplate, resetWeeklyTemplate, uploadWeeklyTemplate } from "@/api/reportTemplates";
import { downloadWeeklyWorkbook } from "@/utils/weeklyExport";
import { getLaboratories, type LaboratorySummary } from "@/api/laboratories";
import { getAcademicYears, semesterName, TERM_LABELS, type AcademicYear, type TermType } from "@/api/academicYears";
import { termWeeks } from "@/utils/termWeeks";
import { getWeeklyReport, type WeeklyReport } from "@/api/reports";
import { ApiError } from "@/api/client";
import { REPORT_HEADER } from "@/utils/reportHeader";

const MUTED = "#57606a";
const BORDER = "#d1d9e0";
const MAROON = "#800000";
const GOLD = "#F4C430";

// The template's colours.
const CELL_BORDER = "1px solid #000";
const HEAD_FILL = "#d9d9d9";
const GREEN_FILL = "#d9ead3";

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

// ---------- dates (all local, no time zone shifts) ----------

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

/** "NOVEMBER 09 - 14, 2026", or across a month or year boundary, the fuller forms. */
function dateCovered(mondayIso: string, saturdayIso: string) {
  const a = fromIso(mondayIso);
  const b = fromIso(saturdayIso);
  const m = (d: Date) => MONTHS[d.getMonth()];
  if (a.getFullYear() !== b.getFullYear())
    return `${m(a)} ${pad(a.getDate())}, ${a.getFullYear()} - ${m(b)} ${pad(b.getDate())}, ${b.getFullYear()}`;
  if (a.getMonth() !== b.getMonth())
    return `${m(a)} ${pad(a.getDate())} - ${m(b)} ${pad(b.getDate())}, ${b.getFullYear()}`;
  return `${m(a)} ${pad(a.getDate())} - ${pad(b.getDate())}, ${b.getFullYear()}`;
}

/** "November 16, 2026" */
const longDate = (iso: string) =>
  fromIso(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

/** 2 rather than 2.00; 1.5 stays 1.5. */
const hours = (n: number) => String(Number(n.toFixed(2)));

/** The template writes the lab part of a subject: "CS 26/L". The schedule import stores "CS 26". */
const withLabSuffix = (code: string) => (/\/L$/i.test(code) ? code : `${code}/L`);

/** "2ND TERM, 1ST SEMESTER 2026-2027", or "SUMMER 2026-2027", as on the office's reports. */
function defaultTitle(ay: AcademicYear, term: string) {
  const semester = TERM_LABELS[ay.termType as TermType] ?? "";
  const words = ay.termType === "Summer" ? semester : `${term}, ${semester}`;
  return `${words} ${ay.label}`.trim().toUpperCase();
}

// Small per-browser memory for the title line, per semester and term; the page works the same without it.
const titleKey = (ayId: number, term: string) => `labtrack.weeklyReportTitle.${ayId}.${term}`;
const readTitle = (ayId: number, term: string) => { try { return localStorage.getItem(titleKey(ayId, term)); } catch { return null; } };
const writeTitle = (ayId: number, term: string, v: string) => { try { localStorage.setItem(titleKey(ayId, term), v); } catch { /* ignore */ } };

export function WeeklyReportPage() {
  const { role } = useRole();
  const allowed = role === "Custodian" || role === "Administrator";

  const [labs, setLabs] = useState<LaboratorySummary[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [labId, setLabId] = useState<number | "">("");
  const [ayId, setAyId] = useState<number | "">("");
  const [weekStart, setWeekStart] = useState("");
  const [reportDate, setReportDate] = useState(toIso(new Date()));
  const [title, setTitle] = useState("");

  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function downloadExcel() {
    if (!ayId || !weekStart) return;
    setExporting(true);
    setExportMsg(null);
    try {
      const name = await downloadWeeklyWorkbook({
        ayId: Number(ayId), weekStart, reportDate, title,
        department: REPORT_HEADER.department,
        preparedBy: user?.fullName ?? "",
        dateCovered,
      });
      setExportMsg({ ok: true, text: `Downloaded ${name}` });
    } catch (e) {
      setExportMsg({ ok: false, text: e instanceof Error ? e.message : "Could not make the Excel file." });
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    if (!allowed) return;
    getLaboratories().then((ls) => { setLabs(ls); setLabId((cur) => cur || ls[0]?.labId || ""); }).catch(() => setLabs([]));
    getAcademicYears().then((ys) => {
      setYears(ys);
      setAyId((cur) => cur || (ys.find((y) => y.isActive) ?? ys[0])?.ayId || "");
    }).catch(() => setYears([]));
  }, [allowed]);

  const ay = years.find((y) => y.ayId === ayId);

  // Every Monday of the semester, numbered per term like the office's sheets.
  const weeks = useMemo(() => (ay ? termWeeks(ay, 5) : []), [ay]);
  const term = weeks.find((w) => w.iso === weekStart)?.term ?? "1st Term";

  // Default to the last completed week, since the report is submitted the Monday after the week
  // it covers (or the closest week of the term), and to the saved title. On a Sunday the week
  // that just ended (Monday to Saturday) is already complete.
  useEffect(() => {
    if (!ay || weeks.length === 0) return;
    const today = new Date();
    const lastWeek = toIso(today.getDay() === 0 ? mondayOf(today) : addDays(mondayOf(today), -7));
    const inTerm = weeks.some((w) => w.iso === lastWeek);
    setWeekStart(inTerm ? lastWeek : lastWeek < weeks[0].iso ? weeks[0].iso : weeks[weeks.length - 1].iso);
  }, [ay, weeks]);

  // The title line follows the term of the chosen week.
  useEffect(() => {
    if (ay) setTitle(readTitle(ay.ayId, term) ?? defaultTitle(ay, term));
  }, [ay, term]);

  useEffect(() => {
    if (!labId || !ayId || !weekStart) return;
    setLoading(true);
    setError(null);
    getWeeklyReport(Number(labId), Number(ayId), weekStart)
      .then(setReport)
      .catch((e) => { setReport(null); setError(e instanceof ApiError ? e.message : "Could not load the report."); })
      .finally(() => setLoading(false));
  }, [labId, ayId, weekStart]);

  if (!allowed) {
    return (
      <div className="py-24 text-center text-[13px]" style={{ color: MUTED }}>
        This page is only available to the Custodian and Administrator roles.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Landscape A4, and keep the template's fills when printing. Only while this page is open. */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          html, body, main, #root { background: #fff !important; }
          .weekly-sheet { box-shadow: none !important; border: none !important; padding: 0 !important; }
        }
        .weekly-sheet, .weekly-sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>

      <div className="no-print space-y-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>Reporting</div>
          <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Weekly Laboratory Report</h1>
          <p className="mt-0.5 max-w-2xl text-[13px]" style={{ color: MUTED }}>
            The Laboratory Management Office's weekly report, one laboratory at a time. Hours come from finally
            confirmed sessions; the remarks come from the Class Status page.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Pick label="Laboratory">
            <select value={labId} onChange={(e) => setLabId(e.target.value ? Number(e.target.value) : "")} className={SELECT} style={{ border: `1px solid ${BORDER}` }}>
              {labs.map((l) => <option key={l.labId} value={l.labId}>{l.roomCode} — {l.name}</option>)}
            </select>
          </Pick>
          <Pick label="Term">
            <select value={ayId} onChange={(e) => setAyId(e.target.value ? Number(e.target.value) : "")} className={SELECT} style={{ border: `1px solid ${BORDER}` }}>
              {years.map((y) => <option key={y.ayId} value={y.ayId}>{semesterName(y)}{y.isActive ? " (active)" : ""}</option>)}
            </select>
          </Pick>
          <Pick label="Week">
            <select value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className={SELECT} style={{ border: `1px solid ${BORDER}` }}>
              {weeks.map((w) => <option key={w.iso} value={w.iso}>{w.label}</option>)}
            </select>
          </Pick>
          <Pick label="Report date">
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className={SELECT} style={{ border: `1px solid ${BORDER}` }} />
          </Pick>
          <Pick label="Title line">
            <input value={title} onChange={(e) => { setTitle(e.target.value); if (ay) writeTitle(ay.ayId, term, e.target.value); }}
              placeholder="2ND TERM, 1ST SEMESTER 2026-2027" className={`${SELECT} w-72`} style={{ border: `1px solid ${BORDER}` }} />
          </Pick>
          <button type="button" onClick={() => window.print()} disabled={!report}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium"
            style={{ background: MAROON, color: GOLD, opacity: report ? 1 : 0.6 }}>
            <Printer className="size-3.5" /> Print or save as PDF
          </button>
          <button type="button" onClick={downloadExcel} disabled={!weekStart || !ayId || exporting}
            title="Every laboratory's weekly report and the daily monitoring sheet, in the office's Excel template"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium"
            style={{ border: `1px solid ${MAROON}`, color: MAROON, background: "#fff", opacity: weekStart && !exporting ? 1 : 0.6 }}>
            <FileSpreadsheet className="size-3.5" /> {exporting ? "Making the file..." : "Download Excel (all labs)"}
          </button>
        </div>

        {exportMsg && <div className="text-[12.5px]" style={{ color: exportMsg.ok ? "#1a7f37" : "#b42318" }}>{exportMsg.text}</div>}
        {error && <div className="text-[12.5px]" style={{ color: "#b42318" }}>{error}</div>}
        <TemplatePanel />
      </div>

      {report && (
        <Sheet report={report} title={title} reportDate={reportDate} />
      )}
      {!report && !error && (
        <div className="py-12 text-center text-[13px]" style={{ color: MUTED }}>{loading ? "Loading..." : "Choose a laboratory, term and week."}</div>
      )}
    </div>
  );
}

/** Which Excel template the download uses, and the Custodian's controls to change it. */
function TemplatePanel() {
  const [uploaded, setUploaded] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => getWeeklyTemplate().then((t) => setUploaded(t.uploaded)).catch(() => setUploaded(null));
  useEffect(() => { refresh(); }, []);

  async function download() {
    try {
      const t = await getWeeklyTemplate();
      const url = URL.createObjectURL(new Blob([t.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = t.uploaded ? "weekly-report-template.xlsx" : "labmo-weekly-template.xlsx";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not download the template." });
    }
  }

  async function upload(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("The file is larger than 5 MB.");
      const [{ default: ExcelJS }, { checkTemplate }] = await Promise.all([import("exceljs"), import("@/utils/weeklyWorkbook")]);
      const problems = await checkTemplate(ExcelJS, await file.arrayBuffer());
      if (problems.length > 0) throw new Error(`This template can't be used: ${problems.join(" ")}`);
      await uploadWeeklyTemplate(file);
      setMsg({ ok: true, text: "Template saved. Downloads now use it." });
      await refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not upload the template." });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function reset() {
    setBusy(true);
    setMsg(null);
    try {
      await resetWeeklyTemplate();
      setMsg({ ok: true, text: "Back to the default template." });
      await refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not reset the template." });
    } finally {
      setBusy(false);
    }
  }

  const link = "inline-flex items-center gap-1 text-[12px] font-medium underline-offset-2 hover:underline disabled:opacity-60";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md px-3 py-2 text-[12px]" style={{ border: `1px dashed ${BORDER}`, color: MUTED }}>
      <span>
        Excel template: <b style={{ color: "#1f2328" }}>{uploaded === null ? "..." : uploaded ? "uploaded by the office" : "default"}</b>
      </span>
      <button type="button" className={link} style={{ color: MAROON }} onClick={download}><Download className="size-3" /> Download template</button>
      <button type="button" className={link} style={{ color: MAROON }} disabled={busy} onClick={() => fileInput.current?.click()}>
        <Upload className="size-3" /> {busy ? "Checking..." : "Upload template"}
      </button>
      {uploaded && (
        <button type="button" className={link} style={{ color: MAROON }} disabled={busy} onClick={reset}><RotateCcw className="size-3" /> Use the default</button>
      )}
      <input ref={fileInput} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      {msg && <span style={{ color: msg.ok ? "#1a7f37" : "#b42318" }}>{msg.text}</span>}
    </div>
  );
}

const SELECT = "rounded-md bg-white px-2.5 py-1.5 text-[12.5px] outline-none";

function Pick({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>{label}</span>
      {children}
    </label>
  );
}

/** The report itself, laid out like the office's spreadsheet. This is what prints. */
function Sheet({ report, title, reportDate }: {
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
