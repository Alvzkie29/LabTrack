import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import type { CourseSectionSummary } from "@/api/courseSections";
import { getAcademicYears } from "@/api/academicYears";
import { getMakeUpClasses, type MakeUpClass } from "@/api/makeUpClasses";
import { getConfirmationsBySection, type ConfirmationRow } from "@/api/sessionConfirmations";
import "./pending-confirmations.css";

interface Props {
  sections: CourseSectionSummary[];
  labId: number | "";
  ayId?: number;
  sectionId: number | "";
  sessionDate: string;
  busy: boolean;
  retryKey: number;
  onSelect: (sectionId: number, date: string) => void;
  autoSelect: boolean;
  secondTermStart?: string | null;
}

interface PendingRow {
  sectionId: number;
  confirmation: ConfirmationRow;
}
interface QueueResult {
  key: string;
  rows: PendingRow[];
  failed: number;
}
interface MakeUpResult {
  key: string;
  rows: MakeUpClass[];
  failed: boolean;
  secondTermStart: string | null;
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })
    .format(new Date(`${value.slice(0, 10)}T12:00:00+08:00`));
}

/** Read-only queue: choosing a record opens the existing final-confirmation form. */
export function PendingConfirmations({ sections, labId, ayId, sectionId, sessionDate, busy, retryKey, onSelect, autoSelect, secondTermStart }: Props) {
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<QueueResult | null>(null);
  const [makeUps, setMakeUps] = useState<MakeUpResult | null>(null);
  const autoSelection = useRef<string | null>(null);
  const idsKey = sections.map(section => section.sectionId).join(",");
  const resourceKey = `${ayId ?? "active"}/${idsKey}/${retryKey}/${retry}`;
  const needsMakeUps = labId !== "";
  const needsTermMetadata = needsMakeUps && secondTermStart === undefined && sections.some(section => section.termPart !== null);
  const makeUpKey = `${ayId ?? "active"}/${retryKey}/${retry}/${needsTermMetadata}`;

  useEffect(() => {
    let cancelled = false;
    const ids = idsKey ? idsKey.split(",").map(Number) : [];
    const rows: PendingRow[] = [];
    let cursor = 0;
    let failed = 0;
    async function readQueue() {
      await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
        while (!cancelled && cursor < ids.length) {
          const id = ids[cursor++];
          try {
            const confirmations = await getConfirmationsBySection(id);
            if (cancelled) return;
            for (const confirmation of confirmations) {
              if (confirmation.sessionType === "Physical" && confirmation.facultyConfirmedAt && !confirmation.finalConfirmedAt) {
                rows.push({ sectionId: id, confirmation });
              }
            }
          } catch {
            if (!cancelled) failed++;
          }
        }
      }));
      if (!cancelled) setResult({ key: resourceKey, rows, failed });
    }
    void readQueue();
    return () => { cancelled = true; };
  }, [idsKey, resourceKey]);

  useEffect(() => {
    if (!needsMakeUps) return;
    let cancelled = false;
    Promise.all([getMakeUpClasses(ayId), needsTermMetadata ? getAcademicYears() : Promise.resolve(null)])
      .then(([rows, years]) => {
        const period = years?.find(year => ayId === undefined ? year.isActive : year.ayId === ayId);
        if (needsTermMetadata && !period) throw new Error("Academic period unavailable");
        if (!cancelled) setMakeUps({ key: makeUpKey, rows, secondTermStart: period?.secondTermStart ?? null, failed: false });
      })
      .catch(() => { if (!cancelled) setMakeUps({ key: makeUpKey, rows: [], secondTermStart: null, failed: true }); });
    return () => { cancelled = true; };
  }, [needsMakeUps, needsTermMetadata, ayId, makeUpKey]);

  const current = result?.key === resourceKey ? result : null;
  const scopedMakeUps = makeUps?.key === makeUpKey ? makeUps : null;
  const loading = !current || needsMakeUps && !scopedMakeUps;
  const scopeError = needsMakeUps && !!scopedMakeUps?.failed;
  const sectionMap = useMemo(() => new Map(sections.map(section => [section.sectionId, section])), [sections]);
  const rows = useMemo(() => {
    if (!current || scopeError || needsMakeUps && !scopedMakeUps) return [];
    return current.rows.filter(row => {
      if (labId === "") return true;
      const date = row.confirmation.sessionDate.slice(0, 10);
      const section = sectionMap.get(row.sectionId);
      const dateMakeUps = scopedMakeUps!.rows.filter(makeUp => makeUp.sectionId === row.sectionId && makeUp.date.slice(0, 10) === date);
      // A make-up meeting uses its approved lab instead of the regular schedule.
      if (dateMakeUps.length) return dateMakeUps.some(makeUp => makeUp.labId === labId);
      if (!section) return false;
      const termBoundary = secondTermStart === undefined ? scopedMakeUps?.secondTermStart : secondTermStart;
      if (termBoundary && section.termPart !== null) {
        const secondTerm = date >= termBoundary.slice(0, 10);
        if (section.termPart === 1 && secondTerm || section.termPart === 2 && !secondTerm) return false;
      }
      const weekday = new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Manila" });
      return section.meetings.some(meeting => meeting.laboratory.labId === labId && meeting.dayOfWeek === weekday);
    }).sort((left, right) => left.confirmation.sessionDate.localeCompare(right.confirmation.sessionDate)
      || left.sectionId - right.sectionId || left.confirmation.confirmationId - right.confirmation.confirmationId);
  }, [current, labId, needsMakeUps, scopedMakeUps, scopeError, sectionMap, secondTermStart]);

  const first = rows[0];
  useEffect(() => {
    if (!autoSelect || sectionId !== "") { autoSelection.current = null; return; }
    if (autoSelect && !busy && !loading && sectionId === "" && first) {
      const choice = `${resourceKey}/${labId}/${first.confirmation.confirmationId}`;
      if (autoSelection.current === choice) return;
      autoSelection.current = choice;
      onSelect(first.sectionId, first.confirmation.sessionDate.slice(0, 10));
    }
  }, [autoSelect, busy, loading, sectionId, first, onSelect, resourceKey, labId]);

  const failed = current?.failed ?? 0;
  return <section className="confirm-pending-queue" aria-labelledby="confirm-pending-heading" aria-busy={loading}>
    <header>
      <div><h2 id="confirm-pending-heading"><CheckCircle2 size={17} />Awaiting final confirmation</h2>
        <p>Faculty-verified sessions ready for your review. Select a session to open its final confirmation.</p></div>
      {!loading && !scopeError && <span className="confirm-pending-count">{rows.length}{failed ? " available" : " pending"}</span>}
    </header>
    {loading ? <p className="confirm-pending-state" role="status"><Loader2 size={16} className="confirm-pending-spin" />Loading pending sessions…</p> : <>
      {(failed > 0 || scopeError) && <div className="confirm-pending-warning" role="alert"><AlertTriangle size={16} />
        <span>{scopeError ? "Laboratory or academic-period coverage could not be loaded. Retry to show this laboratory’s pending sessions."
          : `Confirmation records could not be loaded for ${failed} ${failed === 1 ? "class" : "classes"}. The list may be incomplete.`}</span>
        <button type="button" disabled={busy} onClick={() => setRetry(value => value + 1)}><RefreshCw size={13} />Retry</button>
      </div>}
      {rows.length > 0 ? <ul>{rows.map(({ sectionId: rowSectionId, confirmation }) => {
        const section = sectionMap.get(rowSectionId)!;
        const date = confirmation.sessionDate.slice(0, 10);
        const selected = sectionId === rowSectionId && sessionDate === date;
        return <li key={confirmation.confirmationId}><button type="button" disabled={busy} aria-pressed={selected} className={selected ? "is-selected" : ""} onClick={() => onSelect(rowSectionId, date)}>
          <span className="confirm-pending-identity"><strong>{section.subject.code}<small>{section.sectionCode}</small></strong><span>{section.subject.title}</span></span>
          <span className="confirm-pending-meta"><span><CalendarDays size={12} />{displayDate(date)}</span><span>{confirmation.facultyConfirmedBy || "Faculty verified"} · {confirmation.hoursCredited}h to credit</span></span>
          <ArrowRight size={15} aria-hidden="true" />
        </button></li>;
      })}</ul> : !failed && !scopeError ? <p className="confirm-pending-state" role="status">No sessions are awaiting final confirmation{labId === "" ? " in this academic period" : " in this laboratory"}. Select a class and date above to review another session.</p> : null}
    </>}
  </section>;
}
