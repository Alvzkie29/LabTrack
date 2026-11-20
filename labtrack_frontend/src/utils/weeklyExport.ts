/**
 * Gathers one week's data for every laboratory and fills the office's Excel template with it.
 * ExcelJS is loaded only when someone downloads, so it does not slow down the dashboard.
 */
import { getLaboratories } from "@/api/laboratories";
import { getStatusWeek, type StatusWeek } from "@/api/sessionStatus";
import { getWeeklyReport, type WeeklyReport } from "@/api/reports";
import { getCourseSections } from "@/api/courseSections";
import { getWeeklyTemplate } from "@/api/reportTemplates";
import { buildWeeklyWorkbook, officeTime, type DailyLine, type LabWeek } from "./weeklyWorkbook";

const round = (n: number) => Number(n.toFixed(2));
const withLabSuffix = (code: string) => (/\/L$/i.test(code) ? code : `${code}/L`);

export interface ExportOptions {
  ayId: number;
  weekStart: string; // Monday, yyyy-mm-dd
  reportDate: string;
  title: string;
  department: string;
  preparedBy: string;
  dateCovered: (mondayIso: string, saturdayIso: string) => string;
}

export async function downloadWeeklyWorkbook(opts: ExportOptions): Promise<string> {
  const [ExcelJS, template, labs, sections] = await Promise.all([
    import("exceljs").then((m) => m.default),
    getWeeklyTemplate(),
    getLaboratories(),
    getCourseSections({ ayId: opts.ayId }),
  ]);
  const required = new Map(sections.map((s) => [s.sectionId, s.compliance?.requiredHours ?? null]));

  const perLab = await Promise.all(
    [...labs].sort((a, b) => a.roomCode.localeCompare(b.roomCode, undefined, { numeric: true })).map(async (lab) => {
      const [status, report] = await Promise.all([
        getStatusWeek(lab.labId, opts.ayId, opts.weekStart),
        getWeeklyReport(lab.labId, opts.ayId, opts.weekStart),
      ]);
      return { status, report };
    }),
  );

  // Labs with no classes this term are left out, unless every lab is empty.
  const used = perLab.filter((p) => p.report.rows.length > 0 || p.status.rows.length > 0);
  const chosen = used.length > 0 ? used : perLab;
  const first = chosen[0];
  if (!first) throw new Error("There are no laboratories to report on.");

  const labWeeks: LabWeek[] = chosen.map(({ status, report }) => toLabWeek(status, report, required));
  const dateCovered = opts.dateCovered(first.report.weekStart, first.report.weekEnd);
  const week = first.report.weekNumber;

  const data = await buildWeeklyWorkbook(ExcelJS, template.data, {
    weekNumber: week,
    days: first.status.days,
    dateCovered,
    reportDate: opts.reportDate,
    title: opts.title,
    department: opts.department,
    preparedBy: opts.preparedBy,
    labs: labWeeks,
  });

  const fileName = `LABMO Week ${week} (${dateCovered}).xlsx`;
  const url = URL.createObjectURL(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return fileName;
}

function toLabWeek(status: StatusWeek, report: WeeklyReport, required: Map<number, number | null>): LabWeek {
  const hours = new Map(report.rows.map((r) => [r.sectionId, r]));

  const daily: DailyLine[] = [...status.rows]
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.sectionCode.localeCompare(b.sectionCode))
    .map((row) => {
      const h = hours.get(row.sectionId);
      const total = h ? round(h.subTotal) : 0;
      const need = required.get(row.sectionId);
      return {
        shift: row.shift,
        time: `${officeTime(row.startTime)}-${officeTime(row.endTime)}`,
        faculty: row.faculty ?? "",
        code: row.sectionCode,
        course: withLabSuffix(row.subjectCode),
        room: row.lectureRoom ?? "", // the lecture room, from the lab schedule's LectureRoom column
        students: row.students || null, // students on the class list
        days: row.cells.map((c) => (c.meets ? c.status : null)),
        current: h ? round(h.currentHours) : 0,
        previous: h ? round(h.previousHours) : 0,
        total,
        remaining: need == null ? null : Math.max(0, round(need - total)),
      };
    });

  return {
    roomCode: report.laboratory.roomCode,
    name: report.laboratory.name,
    weekly: report.rows.map((r) => ({
      faculty: r.faculty ?? "",
      code: r.sectionCode,
      subject: withLabSuffix(r.subjectCode),
      previous: round(r.previousHours),
      current: round(r.currentHours),
      subTotal: round(r.subTotal),
      remarks: r.remarks,
    })),
    daily,
  };
}
