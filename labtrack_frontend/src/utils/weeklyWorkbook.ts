/**
 * Builds the Laboratory Management Office's weekly workbook from their own Excel template.
 *
 * The template (see its "Template notes" sheet) has two sheets:
 *   CL - the weekly report for one laboratory. Copied once per lab, named like "CL3-W5".
 *        The row holding {{Faculty}} is repeated once per class; rows below it move down.
 *   W  - the daily monitoring sheet. One sheet for the week ("W5"), with a block per lab.
 *        A block starts at the row holding {{LabTitle}}; its data row (holding {{Shift}}) is
 *        repeated per class, grouped into Morning / Afternoon / Evening, followed by a footer
 *        row and a blank row. Labs take the template's blocks' styles in turn.
 * Everything else in the template (fonts, fills, borders, widths, the letterhead picture,
 * dropdown lists) is copied as it is. ExcelJS is passed in so the page can load it on demand.
 */
import type ExcelJSNamespace from "exceljs";
import type { Workbook, Worksheet, CellValue } from "exceljs";

type ExcelJS = typeof ExcelJSNamespace;
type Values = Record<string, string | number | Date | null>;

export interface WeeklyReportLine {
  faculty: string;
  code: string;
  subject: string;
  previous: number;
  current: number;
  subTotal: number;
  remarks: string;
}

export interface DailyLine {
  shift: "Morning" | "Afternoon" | "Evening";
  time: string;
  faculty: string;
  code: string;
  course: string;
  room: string;
  students: number | null;
  days: (string | null)[]; // Monday to Friday
  current: number;
  previous: number;
  total: number;
  remaining: number | null;
}

export interface LabWeek {
  roomCode: string; // "CL3"
  name: string;     // "Computing Laboratory 3"
  weekly: WeeklyReportLine[];
  daily: DailyLine[];
}

export interface WorkbookInput {
  weekNumber: number;
  days: string[];        // the five dates, yyyy-mm-dd
  dateCovered: string;   // "NOVEMBER 09 - 14, 2026"
  reportDate: string;    // yyyy-mm-dd
  title: string;         // "2ND TERM, 1ST SEMESTER 2026-2027"
  department: string;    // "CCE"
  preparedBy: string;
  labs: LabWeek[];
}

const SHIFTS: DailyLine["shift"][] = ["Morning", "Afternoon", "Evening"];

// ---------------------------------------------------------------- small helpers

/** A calendar date for Excel. Built in UTC so the day never shifts with the PC's time zone. */
const excelDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/** Sheet names: at most 31 characters, none of : \ / ? * [ ] */
const sheetName = (s: string) => s.replace(/[:\\/?*[\]]/g, "-").slice(0, 31);

/** Replaces {{Key}} placeholders. A cell that is exactly one placeholder takes the value's own type (number, date). */
function fill(value: CellValue, vals: Values): CellValue {
  const sub = (text: string) => text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    const v = vals[k];
    return v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  });
  if (typeof value === "string") {
    const whole = value.match(/^\s*\{\{(\w+)\}\}\s*$/);
    if (whole) return vals[whole[1]] ?? null;
    return value.includes("{{") ? sub(value) : value;
  }
  if (value && typeof value === "object" && "richText" in value) {
    return { richText: value.richText.map((run) => ({ ...run, text: sub(run.text) })) };
  }
  return value;
}

interface Box { top: number; left: number; bottom: number; right: number }

const colNumber = (letters: string) => letters.split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

function merges(ws: Worksheet): Box[] {
  const list: string[] = (ws.model as unknown as { merges?: string[] }).merges ?? [];
  return list.map((m) => {
    const [a, b] = m.split(":");
    const p = (ref: string) => { const x = ref.match(/^([A-Z]+)(\d+)$/)!; return { c: colNumber(x[1]), r: Number(x[2]) }; };
    const s = p(a), e = p(b ?? a);
    return { top: s.r, left: s.c, bottom: e.r, right: e.c };
  });
}

function merge(ws: Worksheet, top: number, left: number, bottom: number, right: number) {
  if (bottom > top || right > left) ws.mergeCells(top, left, bottom, right);
}

/** Rows that hold a given placeholder anywhere in them. */
function rowsWith(ws: Worksheet, placeholder: string): number[] {
  const found: number[] = [];
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      const text = typeof v === "string" ? v : v && typeof v === "object" && "richText" in v ? v.richText.map((t) => t.text).join("") : "";
      if (text.includes(placeholder) && !found.includes(r)) found.push(r);
    });
  });
  return found;
}

/** The last row holding a value (formatting alone does not count). */
function lastUsedRow(ws: Worksheet): number {
  let last = 0;
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    let has = false;
    row.eachCell({ includeEmpty: false }, (c) => { if (c.value !== null && c.value !== "") has = true; });
    if (has) last = r;
  });
  return last;
}

function lastUsedCol(ws: Worksheet): number {
  let last = 0;
  ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => { last = Math.max(last, Number(c.col)); }));
  for (const m of merges(ws)) last = Math.max(last, m.right);
  return last;
}

/** Copies one template row to the output: height, every cell's style and dropdown, and the filled-in values. */
function copyRow(src: Worksheet, srcRow: number, dst: Worksheet, dstRow: number, maxCol: number, vals: Values) {
  const s = src.getRow(srcRow);
  const d = dst.getRow(dstRow);
  if (s.height) d.height = s.height;
  for (let c = 1; c <= maxCol; c++) {
    const sc = s.getCell(c);
    const dc = d.getCell(c);
    dc.style = clone(sc.style);
    if (sc.dataValidation) dc.dataValidation = clone(sc.dataValidation);
    const isSlave = sc.isMerged && sc.master.address !== sc.address;
    if (!isSlave) dc.value = fill(sc.value, vals);
  }
}

/** Copies the template sheet's column widths, view (frozen panes) and print settings. */
function copySheetSettings(src: Worksheet, dst: Worksheet, maxCol: number) {
  for (let c = 1; c <= maxCol; c++) {
    const col = src.getColumn(c);
    if (col.width) dst.getColumn(c).width = col.width;
    if (col.hidden) dst.getColumn(c).hidden = true;
  }
  dst.views = clone(src.views);
  dst.pageSetup = { ...clone(src.pageSetup) };
  if (src.headerFooter) dst.headerFooter = clone(src.headerFooter);
}

/** Copies the template sheet's pictures (the letterhead), moving any below `afterRow` down by `shift` rows. */
function copyImages(tpl: Workbook, src: Worksheet, out: Workbook, dst: Worksheet, imageIds: Map<number, number>, afterRow: number, shift: number) {
  for (const img of src.getImages()) {
    const id = Number(img.imageId);
    if (!imageIds.has(id)) {
      const media = tpl.getImage(id) as unknown as { buffer: ArrayBuffer; extension: "png" | "jpeg" | "gif" };
      imageIds.set(id, out.addImage({ buffer: media.buffer as never, extension: media.extension }));
    }
    const range = img.range as unknown as {
      tl: { col: number; row: number }; br?: { col: number; row: number };
      ext?: { width: number; height: number }; editAs?: string;
    };
    const move = (p: { col: number; row: number }) => ({ col: p.col, row: p.row + (p.row >= afterRow ? shift : 0) });
    dst.addImage(imageIds.get(id)!, range.br
      ? { tl: move(range.tl), br: move(range.br), editAs: range.editAs } as never
      : { tl: move(range.tl), ext: range.ext!, editAs: range.editAs } as never);
  }
}

// ---------------------------------------------------------------- template check

/** Problems with an uploaded template, in plain words. An empty list means it can be used. */
export async function checkTemplate(Excel: ExcelJS, data: ArrayBuffer): Promise<string[]> {
  const wb = new Excel.Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    return ["The file could not be opened as an Excel (.xlsx) workbook."];
  }
  const problems: string[] = [];
  const cl = wb.getWorksheet("CL");
  const w = wb.getWorksheet("W");
  if (!cl) problems.push('There is no sheet named "CL" (the weekly report).');
  else if (rowsWith(cl, "{{Faculty}}").length === 0) problems.push('Sheet "CL" has no row with {{Faculty}}, so there is nowhere to list the classes.');
  if (!w) problems.push('There is no sheet named "W" (the daily monitoring sheet).');
  else {
    const blocks = rowsWith(w, "{{LabTitle}}");
    if (blocks.length === 0) problems.push('Sheet "W" has no {{LabTitle}}, so it has no laboratory block.');
    else if (blocks.some((b) => !rowsWith(w, "{{Shift}}").some((r) => r > b)))
      problems.push('A block in sheet "W" has no data row with {{Shift}} below its {{LabTitle}}.');
  }
  return problems;
}

// ---------------------------------------------------------------- the workbook

export async function buildWeeklyWorkbook(Excel: ExcelJS, template: ArrayBuffer, input: WorkbookInput): Promise<ArrayBuffer> {
  const tpl = new Excel.Workbook();
  await tpl.xlsx.load(template);
  const clTpl = tpl.getWorksheet("CL");
  const wTpl = tpl.getWorksheet("W");
  if (!clTpl || !wTpl) throw new Error('The template needs the sheets "CL" and "W".');

  const out = new Excel.Workbook();
  out.creator = "LabTrack";
  out.created = new Date();
  const imageIds = new Map<number, number>();
  const week = input.weekNumber;
  const dayDates = input.days.map(excelDate);

  // ---- one weekly report sheet per laboratory
  const clDataRow = rowsWith(clTpl, "{{Faculty}}")[0];
  const clLastRow = Math.max(lastUsedRow(clTpl), clDataRow);
  const clMaxCol = Math.max(lastUsedCol(clTpl), 8);
  const clMerges = merges(clTpl);

  for (const lab of input.labs) {
    const ws = out.addWorksheet(sheetName(`${lab.roomCode}-W${week}`));
    copySheetSettings(clTpl, ws, clMaxCol);

    const header: Values = {
      Title: input.title,
      Department: `${input.department} - ${lab.name.toUpperCase()}`,
      Date: excelDate(input.reportDate),
      Week: week,
      DateCovered: input.dateCovered,
      PreparedBy: input.preparedBy,
    };
    const lines = lab.weekly.length > 0 ? lab.weekly : [null];
    const shift = lines.length - 1; // rows added below the data row

    for (let r = 1; r < clDataRow; r++) copyRow(clTpl, r, ws, r, clMaxCol, header);
    lines.forEach((line, i) => {
      copyRow(clTpl, clDataRow, ws, clDataRow + i, clMaxCol, line ? {
        ...header,
        Faculty: line.faculty,
        Code: /^\d+$/.test(line.code) ? Number(line.code) : line.code,
        Subject: line.subject,
        Previous: line.previous,
        Current: line.current === 0 ? "-" : line.current, // the office writes "-" for a week with no hours
        SubTotal: line.subTotal,
        Remarks: line.remarks,
      } : {});
    });
    for (let r = clDataRow + 1; r <= clLastRow; r++) copyRow(clTpl, r, ws, r + shift, clMaxCol, header);

    for (const m of clMerges) {
      if (m.bottom < clDataRow) merge(ws, m.top, m.left, m.bottom, m.right);
      else if (m.top === clDataRow && m.bottom === clDataRow)
        lines.forEach((_, i) => merge(ws, m.top + i, m.left, m.bottom + i, m.right));
      else if (m.top > clDataRow) merge(ws, m.top + shift, m.left, m.bottom + shift, m.right);
    }
    copyImages(tpl, clTpl, out, ws, imageIds, clDataRow + 1, shift);
  }

  // ---- the daily monitoring sheet, one block per laboratory
  const ws = out.addWorksheet(sheetName(`W${week}`));
  const wMaxCol = Math.max(lastUsedCol(wTpl), 17);
  copySheetSettings(wTpl, ws, wMaxCol);
  const wMerges = merges(wTpl);
  const shiftRows = rowsWith(wTpl, "{{Shift}}");
  const blocks = rowsWith(wTpl, "{{LabTitle}}").map((start) => ({
    start,
    data: shiftRows.find((r) => r > start)!,
  }));

  let cursor = 1;
  input.labs.forEach((lab, i) => {
    const b = blocks[i % blocks.length];
    const header: Values = {
      LabTitle: lab.name.toUpperCase(),
      WeekLine: `WEEK ${week} - ${input.dateCovered}`,
      ...Object.fromEntries(dayDates.map((d, k) => [`Day${k + 1}`, d])),
    };

    // title, week line and column headers
    for (let r = b.start; r < b.data; r++) copyRow(wTpl, r, ws, cursor + (r - b.start), wMaxCol, header);
    for (const m of wMerges)
      if (m.top >= b.start && m.bottom < b.data)
        merge(ws, cursor + (m.top - b.start), m.left, cursor + (m.bottom - b.start), m.right);
    cursor += b.data - b.start;

    // the classes, grouped by shift; an empty shift keeps one blank row, as on the office's sheet
    const firstData = cursor;
    for (const shiftName of SHIFTS) {
      const group = lab.daily.filter((l) => l.shift === shiftName);
      const rows = group.length > 0 ? group : [null];
      const groupStart = cursor;
      rows.forEach((line, k) => {
        copyRow(wTpl, b.data, ws, cursor, wMaxCol, {
          ...header,
          Shift: k === 0 ? shiftName.toUpperCase() : null,
          ...(line ? {
            Time: line.time,
            Faculty: line.faculty,
            Code: /^\d+$/.test(line.code) ? Number(line.code) : line.code,
            Course: line.course,
            Room: line.room,
            Students: line.students,
            ...Object.fromEntries(line.days.map((s, d) => [`Day${d + 1}Status`, s])),
            Remarks: null,
            Current: line.current,
            Previous: line.previous,
            Total: line.total,
            Remaining: line.remaining,
          } : {}),
        });
        cursor++;
      });
      merge(ws, groupStart, 1, cursor - 1, 1); // SCHEDULE column, one cell per shift
    }
    // the REMARKS column is one tall cell for the whole lab, as on the office's sheet
    const remarksCol = (() => {
      let col = 0;
      wTpl.getRow(b.data).eachCell({ includeEmpty: false }, (c) => { if (c.value === "{{Remarks}}") col = Number(c.col); });
      return col;
    })();
    if (remarksCol) merge(ws, firstData, remarksCol, cursor - 1, remarksCol);

    // footer and gap rows
    for (const extra of [b.data + 1, b.data + 2]) {
      copyRow(wTpl, extra, ws, cursor, wMaxCol, header);
      for (const m of wMerges)
        if (m.top === extra && m.bottom === extra) merge(ws, cursor, m.left, cursor, m.right);
      cursor++;
    }
  });

  // the weekly reports first, then the daily sheet, as in the office's workbook
  return (await out.xlsx.writeBuffer()) as ArrayBuffer;
}

// ---------------------------------------------------------------- shared formatting

/** "8:00:00" to "800M", "13:30" to "130A", "17:30" to "530E": the office's time style. */
export function officeTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const minutes = h * 60 + m;
  const suffix = minutes < 12 * 60 ? "M" : minutes < 17 * 60 + 30 ? "A" : "E";
  return `${((h + 11) % 12) + 1}${String(m).padStart(2, "0")}${suffix}`;
}
