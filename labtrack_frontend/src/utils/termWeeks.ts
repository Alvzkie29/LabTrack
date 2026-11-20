import type { AcademicYear } from "@/api/academicYears";

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

export interface TermWeek {
  iso: string;       // Monday, yyyy-mm-dd
  number: number;    // counted from the start of its term, as on the office's sheets
  term: "1st Term" | "2nd Term" | "Summer";
  label: string;     // "2nd Term · Week 5 · Nov 09 – Nov 14"
}

/**
 * Every week of a semester, numbered per term: week 1 is the week the semester starts in, and
 * week 1 again from the week the 2nd term starts in. lastDay is 4 for Monday to Friday, 5 for
 * Monday to Saturday.
 */
export function termWeeks(ay: AcademicYear, lastDay: 4 | 5): TermWeek[] {
  const first = mondayOf(fromIso(ay.startDate));
  const last = mondayOf(fromIso(ay.endDate));
  const second = ay.secondTermStart ? toIso(mondayOf(fromIso(ay.secondTermStart))) : null;
  const short = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });

  const list: TermWeek[] = [];
  let n = 0;
  for (let d = first; d <= last; d = addDays(d, 7)) {
    const iso = toIso(d);
    if (iso === second) n = 0;
    n++;
    const term: TermWeek["term"] = ay.termType === "Summer" ? "Summer" : second && iso >= second ? "2nd Term" : "1st Term";
    list.push({ iso, number: n, term, label: `${term} · Week ${n} · ${short(d)} – ${short(addDays(d, lastDay))}` });
  }
  return list;
}
