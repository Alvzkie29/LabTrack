import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Info, Loader2, RefreshCw, Wand2 } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { getLaboratories } from "@/api/laboratories";
import { getAcademicYears, semesterName } from "@/api/academicYears";
import { getCourseSections } from "@/api/courseSections";
import { getMakeUpClasses } from "@/api/makeUpClasses";
import { getStatusWeek, markStatus, type StatusWeek } from "@/api/sessionStatus";
import { termWeeks } from "@/utils/termWeeks";
import { ApiError } from "@/api/client";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ClassStatusCalendar } from "@/components/class-status/ClassStatusCalendar";
import { MeetingInspector } from "@/components/class-status/MeetingInspector";
import { addDays, calendarMeetings, fromIso, manilaToday, mondayOf, toIso, type CalendarMeeting } from "@/components/class-status/calendar-data";
import "./class-status.css";

const failure = (error: unknown, fallback: string) => error instanceof ApiError ? error.message : fallback;
export function ClassStatusPage() {
  const { role } = useRole(); const { user } = useAuth(); const allowed = role === "Custodian" || role === "Administrator" || role === "LabAssistant";
  const client = useQueryClient(); const prefix = ["class-status-calendar", user?.userId, role];
  const [selectedLab, setSelectedLab] = useState<number | null>(null); const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [weekStart, setWeekStart] = useState(""); const [view, setView] = useState<"week" | "day">("week"); const [day, setDay] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null); const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState<"manual" | "suggestions" | null>(null); const lock = useRef(false);
  const [messageTone, setMessageTone] = useState<"success" | "warning">("success");
  const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null);
  const labsQuery = useQuery({ queryKey: [...prefix, "laboratories"], queryFn: getLaboratories, enabled: allowed, staleTime: 60_000, retry: false });
  const yearsQuery = useQuery({ queryKey: [...prefix, "academic-periods"], queryFn: getAcademicYears, enabled: allowed, staleTime: 60_000, retry: false });
  const labs = labsQuery.data ?? []; const years = yearsQuery.data ?? [];
  const labId = selectedLab ?? labs[0]?.labId; const lab = labs.find(l => l.labId === labId);
  const ayId = selectedPeriod ?? (years.find(y => y.isActive) ?? years[0])?.ayId; const ay = years.find(y => y.ayId === ayId);
  const weeks = useMemo(() => ay ? termWeeks(ay, 4) : [], [ay]);
  const today = manilaToday(); const currentIso = toIso(mondayOf(fromIso(today)));
  useEffect(() => { if (!weeks.length) { setWeekStart(""); return; } setWeekStart(current => weeks.some(w => w.iso === current) ? current : weeks.some(w => w.iso === currentIso) ? currentIso : currentIso < weeks[0].iso ? weeks[0].iso : weeks[weeks.length - 1].iso); }, [weeks, currentIso]);
  const weekIndex = weeks.findIndex(w => w.iso === weekStart); const chosenWeek = weeks[weekIndex]; const ready = allowed && !!lab && !!ay && weekIndex >= 0;
  const weekKey = [...prefix, "week", labId, ayId, weekStart];
  const weekQuery = useQuery({ queryKey: weekKey, queryFn: () => getStatusWeek(labId!, ayId!, weekStart), enabled: ready, staleTime: 30_000, retry: false });
  const schedulesQuery = useQuery({ queryKey: [...prefix, "schedule-times", labId, ayId], queryFn: () => getCourseSections({ labId, ayId }), enabled: allowed && !!lab && !!ay, staleTime: 60_000, retry: false });
  const makeUpsQuery = useQuery({ queryKey: [...prefix, "make-up-times", ayId], queryFn: () => getMakeUpClasses(ayId), enabled: allowed && !!ay, staleTime: 60_000, retry: false });
  const week = ready ? weekQuery.data ?? null : null;
  const meetings = useMemo(() => calendarMeetings(week, schedulesQuery.isError ? undefined : schedulesQuery.data, makeUpsQuery.isError ? undefined : makeUpsQuery.data), [week, schedulesQuery.data, schedulesQuery.isError, makeUpsQuery.data, makeUpsQuery.isError]);
  const selectedMeeting = selectedId ? meetings.find(m => m.id === selectedId) ?? null : null;
  useEffect(() => { setSelectedId(null); setError(null); setMessage(null); }, [labId, ayId, weekStart]);
  useEffect(() => { if (week) setDay(current => week.days.includes(current) ? current : week.days.includes(today) ? today : week.days[0] ?? ""); }, [week?.weekStart, today]);
  const suggestionsLeft = week ? week.rows.reduce((n, row) => n + row.cells.filter(c => c.meets && !c.status && c.suggestion && c.source !== "confirmation").length, 0) : 0;
  const pastMeetings = week?.rows.reduce((n, row) => n + row.cells.filter(c => c.meets && c.date < today).length, 0) ?? 0;
  const pendingFinal = week?.rows.reduce((n, row) => n + row.cells.filter(c => c.meets && c.source === "confirmation" && c.awaitingFinal).length, 0) ?? 0;
  function openMeeting(meeting: CalendarMeeting, element: HTMLElement) { setSelectedId(meeting.id); setReturnFocus(element); setError(null); setMessage(null); }

  async function save(meeting: CalendarMeeting, status: string, note?: string) {
    if (lock.current || !week || meeting.cell.source === "confirmation") return false;
    lock.current = true; setBusy("manual"); setError(null); setMessage(null);
    try {
      const result = await markStatus({ sectionId: meeting.row.sectionId, sessionDate: meeting.cell.date, status, note });
      // Update only the existing section/date record; all same-day meeting cards share it.
      client.setQueryData<StatusWeek>(weekKey, current => current ? { ...current, rows: current.rows.map(row => row.sectionId !== meeting.row.sectionId ? row : { ...row, cells: row.cells.map(cell => cell.date !== meeting.cell.date ? cell : { ...cell, status: result.status, note: result.note ?? null, source: result.status ? "marked" : null }) }) } : current);
      const refreshed = await weekQuery.refetch();
      setMessageTone("success");
      setMessage(status ? "Class status saved. The existing Weekly Report uses this record." : "Manual status cleared.");
      if (refreshed.isError) setError("The status was saved, but the week could not be refreshed. Reload to verify the latest weekly completion count.");
      return true;
    } catch (e) { setError(failure(e, "Could not save that status.")); return false; }
    finally { lock.current = false; setBusy(null); }
  }
  async function fillSuggestions() {
    if (!week || lock.current) return;
    const todo = week.rows.flatMap(row => row.cells.filter(cell => cell.meets && !cell.status && cell.suggestion && cell.source !== "confirmation").map(cell => ({ row, cell })));
    if (!todo.length) return;
    lock.current = true; setBusy("suggestions"); setError(null); setMessage(null); let saved = 0;
    try {
      for (const { row, cell } of todo) { try { await markStatus({ sectionId: row.sectionId, sessionDate: cell.date, status: cell.suggestion! }); saved++; } catch {/* Preserve independent attempts; the refreshed backend count shows what remains. */ } }
      const refreshed = await weekQuery.refetch();
      setMessageTone(saved === todo.length ? "success" : "warning");
      setMessage(`${saved} of ${todo.length} suggestion${todo.length === 1 ? "" : "s"} saved. Change any that are wrong, for example to Fieldwork or On Leave.`);
      if (refreshed.isError) setError("Suggestion attempts finished, but the week could not be refreshed. Reload to verify the saved records.");
    } finally { lock.current = false; setBusy(null); }
  }
  if (!allowed) return <div className="cs-restricted">
    <CalendarDays size={27} />
    <h1>Class Status is restricted</h1>
    <p>This page is only available to laboratory staff.</p>
  </div>;
  const setupLoading = labsQuery.isPending || yearsQuery.isPending;
  const timeLoading = ready && (schedulesQuery.isPending || makeUpsQuery.isPending);
  const loading = setupLoading || ready && weekQuery.isPending || timeLoading;
  const dateRange = weekStart ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).formatRange(fromIso(weekStart), addDays(fromIso(weekStart), 4)) : "Select an academic week";
  return <div className="cs-page">
    <header className="cs-heading">
      <div>
        <p className="cs-eyebrow">LABORATORY MONITORING / WEEKLY CALENDAR</p>
        <h1>Class Status</h1>
        <p>Monitor scheduled laboratory meetings and complete weekly class status records.</p>
      </div>
      <button className="cs-refresh" aria-label="Refresh class status" disabled={!!busy || setupLoading || weekQuery.isFetching} onClick={() => void client.invalidateQueries({ queryKey: prefix })}>
        <RefreshCw size={15} className={weekQuery.isFetching ? "cs-spin" : ""} />
        <span>Refresh</span>
      </button>
    </header>
    <section className="cs-workspace" aria-label="Weekly laboratory calendar">
      <div className="cs-toolbar">
        <SearchableSelect ariaLabel="Class status laboratory" value={labId ? String(labId) : ""} onValueChange={value => setSelectedLab(Number(value))} disabled={!!busy || labsQuery.isPending || labsQuery.isError} placeholder={labsQuery.isPending ? "Loading laboratories…" : "Choose laboratory"} leadingIcon={<Building2 size={15} />} options={labs.map(l => ({ value: String(l.labId), label: l.name, description: l.roomCode }))} />
        <SearchableSelect ariaLabel="Class status academic period" value={ayId ? String(ayId) : ""} onValueChange={value => { setSelectedPeriod(Number(value)); setWeekStart(""); }} disabled={!!busy || yearsQuery.isPending || yearsQuery.isError} placeholder={yearsQuery.isPending ? "Loading academic periods…" : "Choose academic period"} options={years.map(y => ({ value: String(y.ayId), label: semesterName(y), description: y.isActive ? "Active academic period" : "Registered academic period" }))} />
        <SearchableSelect ariaLabel="Class status week" value={weekStart} onValueChange={setWeekStart} disabled={!!busy || !weeks.length} placeholder="Choose week" searchPlaceholder="Search term, week or dates…" options={weeks.map(w => ({ value: w.iso, label: `${w.term} · Week ${w.number}`, description: w.label }))} />
        <button className="cs-primary cs-suggestions" onClick={() => void fillSuggestions()} disabled={!!busy || !week || weekQuery.isFetching || suggestionsLeft === 0}>{busy === "suggestions" ? <Loader2 size={15} className="cs-spin" /> : <Wand2 size={15} />}Use Suggestions{week && <span>{suggestionsLeft}</span>}</button>
      </div>
      <div className="cs-week-toolbar">
        <div className="cs-week-title">
          <h2>{dateRange}</h2>
          <p>{lab?.name ?? "No laboratory selected"}{chosenWeek ? ` · ${chosenWeek.term} · Week ${chosenWeek.number}` : ""}</p>
        </div>
        <div className="cs-week-actions">
          <div className="cs-week-arrows">
            <button aria-label="Previous academic week" disabled={!!busy || weekIndex <= 0} onClick={() => setWeekStart(weeks[weekIndex - 1].iso)}>
              <ChevronLeft size={16} />
            </button>
            <button aria-label="Next academic week" disabled={!!busy || weekIndex < 0 || weekIndex >= weeks.length - 1} onClick={() => setWeekStart(weeks[weekIndex + 1].iso)}>
              <ChevronRight size={16} />
            </button>
          </div>
          <button className="cs-current-week" disabled={!!busy || !weeks.some(w => w.iso === currentIso) || weekStart === currentIso} onClick={() => setWeekStart(currentIso)} title={weeks.some(w => w.iso === currentIso) ? "Show current week" : "The current week is outside this academic period"}>Current Week</button>
          <div className="cs-view-switch" aria-label="Calendar view">
            <button className={view === "week" ? "is-active" : ""} aria-pressed={view === "week"} onClick={() => setView("week")}>Week</button>
            <button className={view === "day" ? "is-active" : ""} aria-pressed={view === "day"} onClick={() => setView("day")}>Day</button>
          </div>
        </div>
      </div>
      <div className="cs-completion-row">{week && !weekQuery.isFetching && !weekQuery.isError ? <>
        <span className={`cs-week-completion ${week.unmarked > 0 ? "is-incomplete" : pastMeetings > 0 ? "is-complete" : ""}`}>{week.unmarked > 0 ? <Info size={14} /> : pastMeetings > 0 ? <CheckCircle2 size={14} /> : <CalendarDays size={14} />} {!meetings.length ? "No scheduled meetings this week" : week.unmarked > 0 ? `${week.unmarked} past meeting${week.unmarked === 1 ? " still requires" : "s still require"} a status` : pastMeetings > 0 ? "All eligible past meetings have a status" : "No past meetings to review"}</span>{pendingFinal > 0 && <span className="cs-pending-count">{pendingFinal} awaiting final confirmation</span>}</> : <span className="cs-week-completion">{loading || weekQuery.isFetching ? "Loading weekly status…" : "Weekly completion unavailable"}</span>}<span className="cs-local-time">Philippine time · Monday–Friday</span>
      </div>
      {(labsQuery.isError || yearsQuery.isError) && <div className="cs-notice is-error" role="alert">
        <AlertTriangle size={15} />
        <span>{labsQuery.isError ? "Laboratories could not be loaded." : "Academic periods could not be loaded."}</span>
        <button onClick={() => { void labsQuery.refetch(); void yearsQuery.refetch(); }}>Try again</button>
      </div>}
      {weekQuery.isError && ready && <div className="cs-notice is-error" role="alert">
        <AlertTriangle size={15} />
        <span>{failure(weekQuery.error, "Could not load the week.")}</span>
        <button disabled={!!busy} onClick={() => void weekQuery.refetch()}>Reload week</button>
      </div>}
      {(schedulesQuery.isError || makeUpsQuery.isError) && ready && <div className="cs-notice is-warning" role="alert">
        <Info size={15} />
        <span>Some meeting times could not be loaded. Status records are preserved and meetings with unknown times are listed separately.</span>
        <button disabled={!!busy} onClick={() => { void schedulesQuery.refetch(); void makeUpsQuery.refetch(); }}>Reload meeting times</button>
      </div>}
      {error && <div className="cs-notice is-error" role="alert">
        <AlertTriangle size={15} />
        <span>{error}</span>
      </div>}{message && <div className={`cs-notice is-${messageTone}`} role="status">
        <CheckCircle2 size={15} />
        <span>{message}</span>
      </div>}
      {loading ? <div className="cs-calendar-loading" role="status">
        <div className="cs-calendar-skeleton">{Array.from({ length: 5 }, (_, i) =>
          <div key={i} />)}</div>
        <span>
          <Loader2 size={15} className="cs-spin" />Loading scheduled meetings…</span>
      </div> : !lab ? <div className="cs-page-state">
        <Building2 size={29} />
        <h3>{labs.length ? "Select a laboratory" : "No laboratories available"}</h3>
        <p>Select a registered laboratory to review its class meetings.</p>
      </div> : !ay || !weeks.length ? <div className="cs-page-state">
        <CalendarDays size={29} />
        <h3>No applicable academic period</h3>
        <p>A registered academic period with valid dates is needed to display its weeks.</p>
      </div> : !week ? <div className="cs-page-state">
        <CalendarDays size={29} />
        <h3>Weekly records unavailable</h3>
        <p>Choose a week or reload the status records to continue.</p>
      </div> : !week.days.length ? <div className="cs-page-state">
        <CalendarDays size={29} />
        <h3>Calendar dates unavailable</h3>
        <p>The weekly response did not include calendar dates.</p>
      </div> : !meetings.length ? <div className="cs-page-state">
        <CalendarDays size={30} />
        <h3>No scheduled laboratory meetings</h3>
        <p>No Monday-to-Friday meetings were returned for this laboratory and academic week.</p>
      </div> : <ClassStatusCalendar week={week} meetings={meetings} selectedId={selectedId} onSelect={openMeeting} day={day} onDayChange={setDay} view={view} today={today} />}
      <footer className="cs-calendar-footer">
        <div className="cs-status-legend" aria-label="Status color guide">
          <span className="is-onsite">On-site</span>
          <span className="is-virtual">Virtual</span>
          <span className="is-pending">Awaiting final</span>
          <span className="is-marked">Manual reason</span>
          <span className="is-unmarked">Unmarked</span>
        </div>
        <span>On-site and Virtual come from session confirmations.</span>
      </footer>
    </section>
    <MeetingInspector meeting={selectedMeeting} week={week} academicYearId={ayId} busy={!!busy} error={error} message={message} today={today} onClose={() => setSelectedId(null)} returnFocus={returnFocus} onSave={save} />
  </div>;
}
