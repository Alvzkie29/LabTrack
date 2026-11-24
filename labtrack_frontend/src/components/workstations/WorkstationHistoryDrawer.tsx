import { useId, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, Clock3, Info, Monitor, RefreshCw, UserRound } from "lucide-react";
import { ApiError } from "@/api/client";
import { getWorkstationLogins } from "@/api/attendance";
import type { LaboratorySummary, WorkstationEntry } from "@/api/laboratories";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

const PAGE_SIZE = 12;
const dateFormat = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });
const timeFormat = new Intl.DateTimeFormat("en-PH", { timeStyle: "short", timeZone: "Asia/Manila" });

/** This endpoint already adds UTC+8. Preserve its wall-clock value, even if a suffix is present. */
function recordedTime(value: string) {
  const wallClock = value.replace(/(?:Z|[+-]\d{2}:?\d{2})$/i, "");
  const date = new Date(`${wallClock}+08:00`);
  if (Number.isNaN(date.getTime())) return { date: "Date unavailable", time: "", iso: undefined };
  return { date: dateFormat.format(date), time: timeFormat.format(date), iso: date.toISOString() };
}

function historyError(error: Error | null) {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return "You do not have access to this workstation's history.";
    if (error.status === 404) return "This workstation is no longer registered. Close the drawer and refresh the workstation list.";
  }
  return "We couldn't load this workstation's history. Please try again.";
}

export interface WorkstationHistoryDrawerProps {
  workstation: WorkstationEntry | null;
  laboratory: LaboratorySummary | undefined;
  onClose: () => void;
  returnFocusElement?: HTMLElement | null;
}

export function WorkstationHistoryDrawer({ workstation, laboratory, onClose, returnFocusElement }: WorkstationHistoryDrawerProps) {
  return <Sheet open={workstation !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent side="right"
      className="ws-history-drawer flex h-full w-full max-w-full flex-col gap-0 border-l border-[#e7ded7] bg-[#f8f6f3] p-0 text-[#302a2c] sm:w-[560px] sm:max-w-[560px] [&>button]:right-5 [&>button]:top-6 [&>button]:text-[#847778]"
      onCloseAutoFocus={(event) => {
        if (returnFocusElement?.isConnected) {
          event.preventDefault();
          returnFocusElement.focus({ preventScroll: true });
        }
      }}>
      <div className="ws-history-heading shrink-0 border-b border-[#e7ded7] px-5 pb-5 pt-6 sm:px-6">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#927f83]">Workstation records</p>
        <SheetTitle className="pr-8 text-[23px] font-semibold tracking-[-0.6px] text-[#302a2c]">Login history</SheetTitle>
        <SheetDescription className="mt-1.5 pr-5 text-[13px] leading-relaxed text-[#827277]">Student logins recorded on this computer. Times are shown in Philippine time.</SheetDescription>
      </div>
      {workstation && <HistoryContent key={workstation.workstationId} workstation={workstation} laboratory={laboratory} />}
    </SheetContent>
  </Sheet>;
}

function HistoryContent({ workstation, laboratory }: { workstation: WorkstationEntry; laboratory: LaboratorySummary | undefined }) {
  const { user } = useAuth();
  const filterId = useId();
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [filters, setFilters] = useState({ from: "", to: "" });
  const [filterError, setFilterError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const allowed = !!user && ["Administrator", "Custodian", "LabAssistant"].includes(user.role);
  const history = useQuery({
    queryKey: ["workstation-login-history", user?.userId, user?.role, workstation.workstationId, filters.from, filters.to],
    queryFn: () => getWorkstationLogins(workstation.workstationId, { from: filters.from || undefined, to: filters.to || undefined }),
    enabled: allowed,
    staleTime: 60_000,
    retry: false,
    // No placeholderData: switching PCs or dates must never display another result's rows.
  });
  const data = history.isError ? undefined : history.data;
  const logins = data?.logins ?? [];
  const pages = Math.max(1, Math.ceil(logins.length / PAGE_SIZE));
  const shownPage = Math.min(page, pages);
  const visible = logins.slice((shownPage - 1) * PAGE_SIZE, shownPage * PAGE_SIZE);
  const hasRange = !!filters.from || !!filters.to;
  const latest = logins[0] ? recordedTime(logins[0].loginTime) : null;
  const isActive = data?.workstation.isActive ?? workstation.isActive;
  const buttonClass = "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-[12px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#800000] disabled:cursor-not-allowed disabled:opacity-40";

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftFrom && draftTo && draftFrom > draftTo) {
      setFilterError("Choose an end date on or after the start date.");
      return;
    }
    setFilterError(null);
    setPage(1);
    setFilters({ from: draftFrom, to: draftTo });
  }
  function resetFilters() {
    setDraftFrom("");
    setDraftTo("");
    setFilterError(null);
    setPage(1);
    setFilters({ from: "", to: "" });
  }

  return <div className="ws-history-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
    <section className="ws-history-summary rounded-2xl border border-[#e8dfd7] bg-white p-4" aria-label="Selected workstation">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#f5e9e4] text-[#800000]"><Monitor size={23} strokeWidth={1.5} /></span>
        <div className="min-w-0 flex-1"><h3 className="break-words text-[18px] font-semibold tracking-[-0.3px]">{workstation.seatLabel}</h3><p className="mt-0.5 break-all font-mono text-[11px] text-[#8b777e]">{workstation.pcIdentifier}</p></div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${isActive ? "bg-[#f8f0da] text-[#92701b]" : "bg-[#eeeae6] text-[#86776f]"}`}>{isActive ? "Active" : "Inactive"}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[#eee6df] pt-3 text-[12px]">
        <div className="min-w-0"><dt className="text-[#99838b]">Laboratory</dt><dd className="mt-1 break-words font-medium">{laboratory?.name ?? data?.workstation.lab ?? "Not provided"}</dd></div>
        <div><dt className="text-[#99838b]">Registration</dt><dd className="mt-1 font-medium">{isActive ? "Active registration" : "Inactive registration"}</dd></div>
        <div><dt className="text-[#99838b]">{hasRange ? "Logins in date range" : "Recorded logins"}</dt><dd className="mt-1 text-[20px] font-semibold text-[#800000]">{data ? data.total : "—"}</dd></div>
        <div className="min-w-0"><dt className="text-[#99838b]">{hasRange ? "Latest login in range" : "Latest recorded login"}</dt><dd className="mt-1 text-[12px] font-medium">{latest ? <time dateTime={latest.iso}>{latest.date}<span className="mt-0.5 block text-[#99838b]">{latest.time} PHT</span></time> : data ? "None recorded" : "—"}</dd></div>
      </dl>
    </section>

    <form className="ws-history-filters mt-5" onSubmit={applyFilters}>
      <div className="mb-3 flex items-center gap-2"><CalendarDays size={15} className="text-[#800000]" /><h3 className="text-[13px] font-semibold">Filter by date</h3></div>
      <div className="grid min-w-0 grid-cols-2 gap-3">
        <div className="min-w-0"><label htmlFor={`${filterId}-from`} className="mb-1.5 block text-[11px] font-medium text-[#8e777f]">From</label>
          <input id={`${filterId}-from`} type="date" value={draftFrom} onChange={(event) => { setDraftFrom(event.target.value); setFilterError(null); }}
            aria-describedby={filterError ? `${filterId}-error` : undefined} aria-invalid={!!filterError}
            className="block h-10 w-full min-w-0 rounded-lg border border-[#e4d8ce] bg-white px-2 text-[12px] text-[#58444c] outline-none focus:border-[#800000] focus:ring-1 focus:ring-[#800000]" /></div>
        <div className="min-w-0"><label htmlFor={`${filterId}-to`} className="mb-1.5 block text-[11px] font-medium text-[#8e777f]">To</label>
          <input id={`${filterId}-to`} type="date" value={draftTo} onChange={(event) => { setDraftTo(event.target.value); setFilterError(null); }}
            aria-describedby={filterError ? `${filterId}-error` : undefined} aria-invalid={!!filterError}
            className="block h-10 w-full min-w-0 rounded-lg border border-[#e4d8ce] bg-white px-2 text-[12px] text-[#58444c] outline-none focus:border-[#800000] focus:ring-1 focus:ring-[#800000]" /></div>
      </div>
      {filterError && <p id={`${filterId}-error`} role="alert" className="mt-2 text-[12px] text-[#a34335]">{filterError}</p>}
      <div className="mt-3 flex items-center justify-between gap-3"><span className="text-[10px] text-[#9b868c]">Both dates are inclusive · PHT</span><div className="flex gap-2">
        <button type="button" onClick={resetFilters} className={`${buttonClass} bg-[#eae4de] text-[#857078]`}>Reset</button>
        <button type="submit" className={`${buttonClass} bg-[#800000] text-white hover:bg-[#690000]`}>Apply</button>
      </div></div>
    </form>

    <section className="ws-history-timeline mt-6" aria-labelledby={`${filterId}-timeline-title`} aria-busy={history.isFetching}>
      <div className="mb-3 flex items-center justify-between gap-2"><h3 id={`${filterId}-timeline-title`} className="text-[13px] font-semibold">Student login timeline</h3>
        {history.isFetching && data && <span role="status" className="inline-flex items-center gap-1.5 text-[11px] text-[#967c86]"><RefreshCw size={12} className="animate-spin motion-reduce:animate-none" />Updating</span>}
      </div>
      {!allowed ? <p role="status" className="rounded-xl border border-[#ead9d0] bg-white p-4 text-[13px] leading-relaxed text-[#9a4a3d]">You do not have access to workstation attendance records.</p>
        : history.isPending ? <div role="status"><span className="sr-only">Loading workstation history</span><div className="space-y-3" aria-hidden="true">{[0, 1, 2].map((index) => <div key={index} className="animate-pulse rounded-xl border border-[#eae2da] bg-white p-4 motion-reduce:animate-none"><div className="mb-3 h-3 w-2/5 rounded bg-[#e6ded7]" /><div className="mb-2 h-2.5 w-4/5 rounded bg-[#eee8e2]" /><div className="h-2.5 w-3/5 rounded bg-[#eee8e2]" /></div>)}</div></div>
        : history.isError ? <div role="alert" className="rounded-xl border border-[#e7c6b9] bg-[#fff6ed] p-4"><p className="text-[13px] leading-relaxed text-[#974637]">{historyError(history.error)}</p><button type="button" onClick={() => void history.refetch()} disabled={history.isFetching} className={`${buttonClass} mt-3 bg-white text-[#800000]`}><RefreshCw size={13} />Try again</button></div>
        : logins.length === 0 ? <div className="rounded-2xl border border-dashed border-[#e1d5ca] bg-white/70 px-5 py-8 text-center"><Clock3 size={24} strokeWidth={1.5} className="mx-auto text-[#b29999]" /><h4 className="mt-3 text-[14px] font-medium">{hasRange ? "No logins in this date range" : "No logins recorded yet"}</h4><p className="mx-auto mt-2 max-w-[300px] text-[12px] leading-relaxed text-[#9b838c]">{hasRange ? "Try another date range or reset the filters to view this computer's recent records." : "Student login records will appear here after attendance is recorded on this workstation."}</p></div>
        : <>
          <ol className="space-y-3">{visible.map((login) => {
            const timestamp = recordedTime(login.loginTime);
            return <li key={login.attendanceId} className="ws-history-record min-w-0 rounded-xl border border-[#e8dfd7] bg-white p-4">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="flex min-w-0 flex-1 items-start gap-2.5"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#f7eee6] text-[#997630]"><UserRound size={14} strokeWidth={1.7} /></span><div className="min-w-0"><h4 className="break-words text-[13px] font-semibold leading-relaxed">{login.student || "Name not provided"}</h4><p className="mt-0.5 break-all font-mono text-[10px] text-[#9b828c]">{login.schoolId || "School ID not provided"}</p></div></div>
                <time dateTime={timestamp.iso} className="shrink-0 text-right text-[10px] leading-relaxed text-[#9b828c]">{timestamp.date}<span className="block font-medium text-[#78616d]">{timestamp.time}{timestamp.time ? " PHT" : ""}</span></time>
              </div>
              <div className="mt-3 flex items-start gap-2 border-t border-[#f0e9e2] pt-2.5"><BookOpen size={13} className="mt-0.5 shrink-0 text-[#a38a76]" /><p className="min-w-0 break-words text-[11px] leading-relaxed text-[#856d77]"><span className="font-medium text-[#684d5b]">{login.subjectCode || "Subject not provided"}</span><span className="mx-1.5 text-[#c1aca8]">·</span>Section {login.section || "not provided"}</p></div>
              {login.notes && <div className="mt-2.5 rounded-lg bg-[#f8f4ef] px-3 py-2 text-[11px] leading-relaxed text-[#9b7d7b]"><span className="mb-0.5 block text-[9px] font-semibold uppercase tracking-wider text-[#b09a90]">Recorded note</span><p className="whitespace-pre-wrap break-words">{login.notes}</p></div>}
            </li>;
          })}</ol>
          <div className="ws-history-pagination mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] text-[#99818b]">{(shownPage - 1) * PAGE_SIZE + 1}–{Math.min(shownPage * PAGE_SIZE, logins.length)} of {logins.length} loaded</p><div className="flex items-center gap-1.5">
            <button type="button" aria-label="Previous history page" disabled={shownPage === 1} onClick={() => setPage(shownPage - 1)} className={`${buttonClass} bg-white px-2 text-[#800000]`}><ChevronLeft size={15} /></button>
            <span aria-live="polite" className="min-w-[62px] text-center text-[11px] text-[#947b86]">{shownPage} / {pages}</span>
            <button type="button" aria-label="Next history page" disabled={shownPage === pages} onClick={() => setPage(shownPage + 1)} className={`${buttonClass} bg-white px-2 text-[#800000]`}><ChevronRight size={15} /></button>
          </div></div>
          {data && logins.length < data.total && <p className="mt-3 rounded-lg border border-[#eadfca] bg-[#fff9ed] px-3 py-2.5 text-[11px] leading-relaxed text-[#9c7a3d]">The API returned the latest {logins.length} of {data.total} matching logins. Narrow the date range to find older records.</p>}
        </>}
    </section>
    <p className="mt-5 flex items-start gap-2 border-t border-[#e8ded5] pt-4 text-[10px] leading-relaxed text-[#a18a91]"><Info size={13} className="mt-0.5 shrink-0" /><span>These are recorded student logins. Registration status does not indicate whether a computer is currently connected or in use.</span></p>
  </div>;
}

export default WorkstationHistoryDrawer;
