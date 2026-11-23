// The template's colours.




const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

// ---------- dates (all local, no time zone shifts) ----------

const pad = (n: number) => String(n).padStart(2, "0");
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

/** "NOVEMBER 09 - 14, 2026", or across a month or year boundary, the fuller forms. */
export function dateCovered(mondayIso: string, saturdayIso: string) {
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
export const longDate = (iso: string) =>
  fromIso(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

/** 2 rather than 2.00; 1.5 stays 1.5. */
export const hours = (n: number) => String(Number(n.toFixed(2)));

/** The template writes the lab part of a subject: "CS 26/L". The schedule import stores "CS 26". */
export const withLabSuffix = (code: string) => (/\/L$/i.test(code) ? code : `${code}/L`);

