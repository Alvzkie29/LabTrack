import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, CalendarDays, FileSpreadsheet, FileText, Loader2, Printer } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { downloadWeeklyWorkbook } from "@/utils/weeklyExport";
import { getLaboratories } from "@/api/laboratories";
import { getAcademicYears, semesterName, TERM_LABELS, type AcademicYear, type TermType } from "@/api/academicYears";
import { termWeeks } from "@/utils/termWeeks";
import { getWeeklyReport } from "@/api/reports";
import { listenForSessionReportChanges } from "@/api/sessionReportUpdates";
import { ApiError } from "@/api/client";
import { REPORT_HEADER } from "@/utils/reportHeader";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { WeeklyReportDocument } from "@/components/weekly-report/WeeklyReportDocument";
import { WeeklyReportPreview, WeeklyReportPrintStyles } from "@/components/weekly-report/WeeklyReportPreview";
import { WeeklyTemplateSettings } from "@/components/weekly-report/WeeklyTemplateSettings";
import { addDays, dateCovered, fromIso, mondayOf, toIso } from "@/components/weekly-report/report-format";
import { snackbar } from "@/utils/snackbar";
import "./weekly-report.css";

function defaultTitle(ay: AcademicYear, term: string) {
  const semester = TERM_LABELS[ay.termType as TermType] ?? "";
  const words = ay.termType === "Summer" ? semester : `${term}, ${semester}`;
  return `${words} ${ay.label}`.trim().toUpperCase();
}
const titleKey = (ayId: number, term: string) => `labtrack.weeklyReportTitle.${ayId}.${term}`;
const readTitle = (ayId: number, term: string) => { try { return localStorage.getItem(titleKey(ayId, term)); } catch { return null; } };
const writeTitle = (ayId: number, term: string, value: string) => { try { localStorage.setItem(titleKey(ayId, term), value); } catch { /* Browser memory remains optional. */ } };
const manilaToday = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(fromIso(value).getTime());

export function WeeklyReportPage() {
  useEffect(listenForSessionReportChanges, []);
  const { role } = useRole(); const { user } = useAuth(); const allowed = role === "Custodian" || role === "Administrator";
  const [selectedLab, setSelectedLab] = useState<number | null>(null); const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null); const [weekStart, setWeekStart] = useState("");
  const [reportDate, setReportDate] = useState(manilaToday); const [title, setTitle] = useState("");
  const [exporting, setExporting] = useState(false); const exportLock = useRef(false); const [templateBusy, setTemplateBusy] = useState(false);
  const client = useQueryClient(); const prefix = ["weekly-report-workspace", user?.userId, role];
  const labsQuery = useQuery({ queryKey: [...prefix, "laboratories"], queryFn: getLaboratories, enabled: allowed, staleTime: 60_000, retry: false });
  const yearsQuery = useQuery({ queryKey: [...prefix, "academic-periods"], queryFn: getAcademicYears, enabled: allowed, staleTime: 60_000, retry: false });
  const labs = labsQuery.data ?? []; const years = yearsQuery.data ?? [];
  const labId = selectedLab ?? labs[0]?.labId; const lab = labs.find(l => l.labId === labId);
  const ayId = selectedPeriod ?? (years.find(y => y.isActive) ?? years[0])?.ayId; const ay = years.find(y => y.ayId === ayId);
  const weeks = useMemo(() => ay ? termWeeks(ay, 5) : [], [ay]); const selectedWeek = weeks.find(w => w.iso === weekStart); const term = selectedWeek?.term ?? "1st Term";
  const currentMonday = toIso(mondayOf(fromIso(manilaToday())));
  const currentWeekInPeriod = weeks.some(w => w.iso === currentMonday);
  useEffect(() => {
    if (!ay || !weeks.length) { setWeekStart(""); return; }
    setWeekStart(current => weeks.some(w => w.iso === current) ? current : currentWeekInPeriod ? currentMonday : currentMonday < weeks[0].iso ? weeks[0].iso : weeks[weeks.length - 1].iso);
  }, [ay, weeks, currentMonday, currentWeekInPeriod]);
  useEffect(() => { if (ay) setTitle(readTitle(ay.ayId, term) ?? defaultTitle(ay, term)); }, [ayId, term]);
  const enabled = allowed && !!lab && !!ay && !!selectedWeek;
  const reportQuery = useQuery({ queryKey: [...prefix, "report", labId, ayId, weekStart], queryFn: () => getWeeklyReport(labId!, ayId!, weekStart), enabled, staleTime: 0, refetchOnMount: "always", retry: false });
  const report = enabled && !reportQuery.isError ? reportQuery.data ?? null : null;
  const setupLoading = labsQuery.isPending || yearsQuery.isPending;
  const loading = setupLoading || enabled && reportQuery.isPending;
  const dateValid = validDate(reportDate); const locked = exporting || templateBusy;
  const previewReady = !!report && dateValid && !loading;

  async function downloadExcel() {
    if (!ayId || !weekStart || !selectedWeek || !dateValid || exportLock.current || templateBusy) return;
    exportLock.current = true; setExporting(true);
    try {
      // Preserve the existing all-laboratory workbook generator and its exact options.
      const name = await downloadWeeklyWorkbook({ ayId: Number(ayId), weekStart, reportDate, title, department: REPORT_HEADER.department, preparedBy: user?.fullName ?? "", dateCovered });
      snackbar.success(`Excel file prepared: ${name}`);
    } catch (e) { snackbar.error(e instanceof Error ? e.message : "Could not make the Excel file."); }
    finally { exportLock.current = false; setExporting(false); }
  }
  function printReport() { if (!previewReady || reportQuery.isFetching) return; try { window.print(); } catch (e) { snackbar.error(e instanceof Error ? e.message : "The browser could not open the print dialog."); } }
  const refreshReport = () => { if (enabled) void reportQuery.refetch(); else void client.invalidateQueries({ queryKey: prefix }); };
  if (!allowed) return <div className="wr-restricted">
    <FileText size={28} />
    <h1>Weekly Report is restricted</h1>
    <p>This page is only available to the Custodian and Administrator roles.</p>
  </div>;
  const error = labsQuery.isError || yearsQuery.isError || enabled && reportQuery.isError;
  return <div className="wr-page">
    <WeeklyReportPrintStyles />
    <div className="wr-controls no-print">
      <header className="wr-heading">
        <div>
          <p className="wr-eyebrow">LABORATORY MANAGEMENT / REPORT GENERATION</p>
          <h1>Weekly Report</h1>
          <p>Generate and review laboratory utilization reports from confirmed sessions and recorded class statuses.</p>
        </div>
        <span className="wr-document-type">
          <FileText size={16} />Official document workspace</span>
      </header>
      <section className="wr-configuration" aria-label="Report configuration">
        <div className="wr-config-field">
          <label htmlFor="wr-lab">Laboratory</label>
          <SearchableSelect id="wr-lab" ariaLabel="Weekly report laboratory" value={labId ? String(labId) : ""} onValueChange={value => setSelectedLab(Number(value))} disabled={locked || labsQuery.isPending || labsQuery.isError} placeholder={labsQuery.isPending ? "Loading laboratories…" : "Choose laboratory"} leadingIcon={<Building2 size={15} />} options={labs.map(l => ({ value: String(l.labId), label: l.name, description: l.roomCode }))} />
        </div>
        <div className="wr-config-field">
          <label htmlFor="wr-period">Academic term</label>
          <SearchableSelect id="wr-period" ariaLabel="Weekly report academic term" value={ayId ? String(ayId) : ""} onValueChange={value => { setSelectedPeriod(Number(value)); setWeekStart(""); }} disabled={locked || yearsQuery.isPending || yearsQuery.isError} placeholder={yearsQuery.isPending ? "Loading academic terms…" : "Choose academic term"} options={years.map(y => ({ value: String(y.ayId), label: semesterName(y), description: y.isActive ? "Active academic period" : "Historical academic period" }))} />
        </div>
        <div className="wr-config-field">
          <label htmlFor="wr-week">Week</label>
          <SearchableSelect id="wr-week" ariaLabel="Weekly report week" value={weekStart} onValueChange={setWeekStart} disabled={locked || !weeks.length} placeholder="Choose week" searchPlaceholder="Search weeks and dates…" options={weeks.map(w => ({ value: w.iso, label: `${w.term} · Week ${w.number}`, description: w.label }))} />
        </div>
        <div className="wr-config-field">
          <label htmlFor="wr-date">Report date</label>
          <input id="wr-date" type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} disabled={locked} />
        </div>
        <div className="wr-config-field wr-title-field">
          <label htmlFor="wr-title">Title line</label>
          <input id="wr-title" value={title} onChange={e => { setTitle(e.target.value); if (ay) writeTitle(ay.ayId, term, e.target.value); }} placeholder="Enter report title" disabled={locked} />
        </div>
      </section>
      <div className="wr-action-bar">
        <div className="wr-document-context">
          <CalendarDays size={15} />
          <span>{selectedWeek ? `${selectedWeek.term} · Week ${selectedWeek.number} · Monday–Saturday` : "Select a laboratory, term and week"}</span>
          <button type="button" className="wr-current-week" aria-label="Show this week's report" onClick={() => setWeekStart(currentMonday)} disabled={locked || !currentWeekInPeriod || weekStart === currentMonday} title={currentWeekInPeriod ? "View the current Philippine reporting week" : "This week is outside the selected academic term"}>This week</button>
        </div>
        <div className="wr-report-actions">
          <button type="button" className="wr-primary" onClick={printReport} disabled={!previewReady || reportQuery.isFetching || locked}>
            <Printer size={15} />Print / Save as PDF</button>
          <button type="button" className="wr-secondary" onClick={() => void downloadExcel()} disabled={!ay || !selectedWeek || !dateValid || locked} title="Every laboratory’s weekly report and the daily monitoring sheet, using the existing Excel template">{exporting ? <Loader2 size={15} className="wr-spin" /> : <FileSpreadsheet size={15} />} {exporting ? "Making the file…" : "Download Excel (all labs)"}</button>
        </div>
      </div>
      {selectedWeek && <div className="wr-hours-context" aria-label="Weekly hours calculation">
        <strong>Date covered: {dateCovered(weekStart, toIso(addDays(fromIso(weekStart), 5)))}</strong>
        <p>Current includes finally confirmed hours for session dates in this Monday–Saturday range. Previous contains earlier confirmed hours. The report date changes the printed date only.</p>
      </div>}
      {(labsQuery.isError || yearsQuery.isError) && <div className="wr-notice is-error" role="alert">
        <AlertTriangle size={15} />
        <span>{labsQuery.isError ? "Laboratories could not be loaded." : "Academic terms could not be loaded."}</span>
        <button onClick={() => { void labsQuery.refetch(); void yearsQuery.refetch(); }}>Try again</button>
      </div>}
      {enabled && reportQuery.isError && <div className="wr-notice is-error" role="alert">
        <AlertTriangle size={15} />
        <span>{reportQuery.error instanceof ApiError ? reportQuery.error.message : "Could not load the report."}</span>
        <button onClick={() => void reportQuery.refetch()}>Retry report</button>
      </div>}
      {!dateValid && <div className="wr-notice is-warning" role="status">
        <CalendarDays size={15} />
        <span>Choose a valid report date to preview, print, or export this document.</span>
      </div>}
      <WeeklyTemplateSettings disabled={exporting} onBusyChange={setTemplateBusy} />
    </div>
    <WeeklyReportPreview ready={previewReady} loading={loading} error={error} empty={!!report && !report.rows.length} refreshing={setupLoading || reportQuery.isFetching} onRefresh={refreshReport}>
      {previewReady && report ? <WeeklyReportDocument report={report} title={title} reportDate={reportDate} /> : <div className="wr-preview-state">{loading ? <Loader2 size={30} className="wr-spin" /> : <FileText size={30} />}<h2>{loading ? "Preparing report preview…" : error ? "The report could not be loaded" : !lab ? "No laboratory selected" : !ay || !weeks.length ? "No valid academic period" : !dateValid ? "Choose a report date" : "Select a reporting week"}</h2>
        <p>{loading ? "Retrieving the official weekly reporting records." : error ? "Retry loading the report using the controls above." : !lab ? "Choose a registered laboratory to view its weekly report." : !ay || !weeks.length ? "Select an academic period with valid reporting dates." : !dateValid ? "The document will appear when the report date is valid." : "Report data will appear here after a laboratory, academic term, and week are selected."}</p>
      </div>}
    </WeeklyReportPreview>
  </div>;
}
