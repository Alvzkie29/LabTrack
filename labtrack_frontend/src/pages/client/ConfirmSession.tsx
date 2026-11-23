import { useSearchParams } from "react-router-dom";
import { confirmationSessionPath, readConfirmationSessionLink } from "@/utils/sessionConfirmationLink";
import { PendingConfirmations } from "@/components/confirm-session/PendingConfirmations";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { CheckCircle2, AlertTriangle, Users, Building2, CalendarDays, ClipboardCheck, Search, Monitor, Video, ShieldCheck, ArrowRight, RefreshCw } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { getCourseSections, getCourseSection, type CourseSectionSummary, type CourseSectionDetail } from "@/api/courseSections";
import { getSectionAttendance, recordManualAttendance, type SectionAttendance, type AbsentRow } from "@/api/attendance";
import { getLaboratories, getLabWorkstations, type LaboratorySummary, type WorkstationEntry } from "@/api/laboratories";
import {
  getFacultyOptions, getConfirmationsBySection, facultyConfirm, finalConfirm, createVirtualSession,
  type FacultyOption, type ConfirmationRow,
} from "@/api/sessionConfirmations";
import { ApiError } from "@/api/client";

import { SearchableSelect } from "@/components/ui/searchable-select";
import "./confirm-session.css";

const MAROON = "#800000";
const GOLD = "#F4C430";
const MUTED = "#57606a";
const BORDER = "#d1d9e0";

// Local date as yyyy-mm-dd (toISOString would give the UTC date, which is "yesterday" in the early morning in Manila).
function todayLocal() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
// The by-section endpoint already returns Philippine wall-clock times.
function loginTimeLabel(value: string) {
  const time = value.split("T")[1];
  return time ? timeLabel(time) : "Time unavailable";
}

const timeLabel = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

export function ConfirmSessionsPage() {
  const { role } = useRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigationKey = searchParams.toString();
  const linkedSession = useMemo(() => readConfirmationSessionLink(searchParams), [searchParams]);
  const [appliedNavigation, setAppliedNavigation] = useState(navigationKey);
  const [linkedSelection, setLinkedSelection] = useState(!!linkedSession.sectionId);
  const [autoSelectPending, setAutoSelectPending] = useState(linkedSession.pendingView && !linkedSession.invalid && !linkedSession.sectionId);
  const allowed = role === "Custodian" || role === "Administrator" || role === "LabAssistant";

  const [sections, setSections] = useState<CourseSectionSummary[]>([]);
  const [labs, setLabs] = useState<LaboratorySummary[]>([]);
  const [labId, setLabId] = useState<number | "">(linkedSession.labId ?? "");
  const [sectionId, setSectionId] = useState<number | "">(linkedSession.sectionId ?? "");
  const [sessionDate, setSessionDate] = useState(linkedSession.date ?? todayLocal());
  const [mode, setMode] = useState<"physical" | "virtual">("physical");

  const [detail, setDetail] = useState<CourseSectionDetail | null>(null);
  const [attendance, setAttendance] = useState<SectionAttendance | null>(null);
  const [faculty, setFaculty] = useState<FacultyOption[]>([]);
  const [pending, setPending] = useState<ConfirmationRow | null>(null);

  const [facultyId, setFacultyId] = useState("");
  const [pin, setPin] = useState("");
  const [notes, setNotes] = useState("");
  const [virtualHours, setVirtualHours] = useState("2");

  // Manual attendance: the PCs of the lab this class meets in on the chosen date.
  const [labPcs, setLabPcs] = useState<WorkstationEntry[]>([]);

  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pcMessage, setPcMessage] = useState("");
  const [completed, setCompleted] = useState<ConfirmationRow | null>(null);
  const [retry, setRetry] = useState(0);
  const [queueRevision, setQueueRevision] = useState(0);
  const [attendanceTab, setAttendanceTab] = useState<"present" | "absent" | "other">("present");
  const [search, setSearch] = useState("");
  const generation = useRef(0);
  const actionLock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (busy || appliedNavigation === navigationKey) return;
    setLabId(linkedSession.labId ?? "");
    setSectionId(linkedSession.sectionId ?? "");
    setSessionDate(linkedSession.date ?? todayLocal());
    setMode("physical");
    setLinkedSelection(!!linkedSession.sectionId);
    setAutoSelectPending(linkedSession.pendingView && !linkedSession.invalid && !linkedSession.sectionId);
    setAppliedNavigation(navigationKey);
  }, [navigationKey, appliedNavigation, linkedSession, busy]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setInitialLoading(true);
    setInitialError(null);
    Promise.all([getCourseSections(linkedSession.ayId ? { ayId: linkedSession.ayId } : undefined), getLaboratories()])
      .then(([classes, laboratories]) => { if (!cancelled) { setSections(classes); setLabs(laboratories); } })
      .catch((e) => { if (!cancelled) setInitialError(e instanceof ApiError ? e.message : "Could not load laboratories and classes."); })
      .finally(() => { if (!cancelled) setInitialLoading(false); });
    return () => { cancelled = true; };
  }, [allowed, retry, linkedSession.ayId]);

  // Narrow the class list to the lab the staff member is working in.
  const shown = useMemo(() => labId === "" ? sections : sections.filter((s) =>
    s.meetings.some((m) => m.laboratory.labId === labId)
    || detail?.sectionId === s.sectionId && detail.makeUps?.some((m) => m.labId === labId && m.date.slice(0, 10) === sessionDate)),
    [sections, labId, detail, sessionDate]);
  const sectionKnown = sections.some((s) => s.sectionId === sectionId);
  const linkedMissing = linkedSelection && !initialLoading && !initialError && !sectionKnown;
  const selectionScope = `${sectionId}/${sessionDate}/${linkedSession.ayId ?? "active"}`;
  const activeSelection = useRef(selectionScope);
  activeSelection.current = selectionScope;

  // Preserve a linked class while its period and make-up meeting details are loading.
  useEffect(() => {
    if (initialLoading || initialError || sectionId === "" || shown.some((s) => s.sectionId === sectionId)) return;
    if (linkedSelection) {
      if (detail && sectionKnown) setLabId("");
    } else setSectionId("");
  }, [initialLoading, initialError, shown, sectionId, linkedSelection, detail, sectionKnown]);

  const refresh = useCallback(async () => {
    if (!sectionId || !sessionDate || activeSelection.current !== selectionScope) return;
    const version = generation.current;
    const id = Number(sectionId);
    const [d, att, confs, opts] = await Promise.all([
      getCourseSection(id),
      getSectionAttendance(id, sessionDate),
      getConfirmationsBySection(id),
      getFacultyOptions(id),
    ]);
    if (generation.current !== version || activeSelection.current !== selectionScope) return;
    setFaculty(opts);
    setFacultyId((current) => opts.some((f) => f.id === current) ? current : opts[0]?.id ?? "");
    setCompleted(confs.find((c) => c.sessionType === "Physical" && c.sessionDate.slice(0, 10) === sessionDate && c.finalConfirmedAt) ?? null);
    setDetail(d);
    setAttendance(att);
    setPending(
      confs.find(
        (c) =>
          c.sessionType === "Physical" &&
          c.sessionDate.slice(0, 10) === sessionDate &&
          c.facultyConfirmedAt &&
          !c.finalConfirmedAt,
      ) ?? null,
    );
  }, [sectionId, sessionDate, selectionScope]);

  useEffect(() => {
    const version = ++generation.current;
    setError(null); setSuccess(null); setDetail(null); setAttendance(null);
    setPending(null); setCompleted(null); setFaculty([]); setFacultyId("");
    setPin(""); setNotes(""); setSearch(""); setAttendanceTab("present");
    const canLoad = !initialLoading && !initialError && sectionKnown && appliedNavigation === navigationKey && !!sectionId && !!sessionDate;
    setLoading(canLoad);
    if (canLoad) {
      refresh().catch((e) => {
        if (generation.current === version) setError(e instanceof ApiError ? e.message : "Could not load this class.");
      }).finally(() => { if (generation.current === version) setLoading(false); });
    }
    return () => { generation.current++; };
  }, [sectionId, sessionDate, refresh, retry, initialLoading, initialError, sectionKnown, appliedNavigation, navigationKey]);

  useEffect(() => {
    let cancelled = false;
    setLabPcs([]); setPcMessage("");
    if (!detail || !sessionDate) return;
    const weekday = new Date(sessionDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" });
    const labIds = [...new Set([
      ...detail.meetings.filter((m) => m.dayOfWeek === weekday).map((m) => m.laboratory.labId),
      ...(detail.makeUps ?? []).filter((m) => m.date.slice(0, 10) === sessionDate).map((m) => m.labId), // a make-up class that day
    ])];
    if (labIds.length === 0) { setPcMessage("No laboratory meeting or make-up class on this date."); return; }
    setPcMessage("Loading available workstations…");
    Promise.all(labIds.map((id) => getLabWorkstations(id)))
      .then((lists) => { if (!cancelled) { const pcs = lists.flat().filter((w) => w.isActive); setLabPcs(pcs); setPcMessage(pcs.length ? "" : "No active workstations are available for this session."); } })
      .catch(() => { if (!cancelled) setPcMessage("Could not load workstations. Reload the session to try again."); });
    return () => { cancelled = true; };
  }, [detail, sessionDate]);

  const selectPending = useCallback((id: number, date: string) => {
    const path = confirmationSessionPath({ sectionId: id, date, labId: labId === "" ? undefined : labId,
      ayId: linkedSession.ayId, pendingView: true });
    setSearchParams(path.slice(path.indexOf("?") + 1), { replace: true });
  }, [labId, linkedSession.ayId, setSearchParams]);

  if (!allowed) return <Restricted />;

  const run = async (action: () => Promise<string>) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      setSuccess(await action());
      setQueueRevision((n) => n + 1);
      try { await refresh(); } catch { setError("Saved, but the refreshed session could not be loaded. Reload the session before continuing."); setDetail(null); setAttendance(null); }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  const doFacultyConfirm = () =>
    run(async () => {
      const r = await facultyConfirm({ sectionId: Number(sectionId), sessionDate, facultyId, pin });
      setPin("");
      return `Faculty confirmed (${r.hoursCredited}h). Now give the final confirmation.`;
    });

  const doFinalConfirm = () =>
    run(async () => {
      const r = await finalConfirm(pending!.confirmationId, notes.trim() || undefined);
      setNotes("");
      return `Session confirmed — ${r.hoursCredited}h credited. Class now at ${r.compliance.confirmedHoursTotal}/${r.compliance.requiredHours}h (${r.compliance.status}).`;
    });

  const doVirtual = () =>
    run(async () => {
      const r = await createVirtualSession({
        sectionId: Number(sectionId),
        sessionDate,
        hoursCredited: Number(virtualHours),
        notes: notes.trim() || undefined,
      });
      setNotes("");
      return `Virtual session recorded — ${r.hoursCredited}h credited. Class now at ${r.compliance.confirmedHoursTotal}/${r.compliance.requiredHours}h (${r.compliance.status}).`;
    });

  const ready = !!detail && !!attendance && !loading && !initialLoading && !initialError && sectionKnown && appliedNavigation === navigationKey && !!sessionDate;
  const query = search.trim().toLowerCase();
  const matches = (r: { name: string; schoolId: string }) => `${r.name} ${r.schoolId}`.toLowerCase().includes(query);
  const visibleCount = attendance ? (attendanceTab === "present" ? attendance.present : attendanceTab === "absent" ? attendance.absent : attendance.notOnRoster).filter(matches).length : 0;

  const physicalVerified = mode === "physical" && !!(pending || completed);
  const classOptions = shown.map((s) => ({
    value: String(s.sectionId),
    label: `${s.subject.code} \u00b7 ${s.sectionCode}`,
    description: s.subject.title,
  }));
  const labOptions = [{ value: "all", label: "All laboratories" }, ...labs.map((lab) => ({
    value: String(lab.labId), label: lab.name, description: lab.roomCode,
  }))];
  const facultyOptions = faculty.map((f) => ({
    value: f.id, label: f.fullName,
    description: `${f.schoolId}${f.isAssigned ? " \u00b7 Assigned faculty" : ""}`,
  }));

  return (
    <div className="confirm-page">
      <header className="confirm-heading">
        <div>
          <p className="confirm-eyebrow">Laboratory management / Session confirmation</p>
          <h1>Confirm a Session</h1>
          <p>Review attendance, verify the faculty member, and confirm laboratory hours.</p>
        </div>
        <button className="confirm-reload" disabled={busy || loading || initialLoading} onClick={() => setRetry((n) => n + 1)}>
          <RefreshCw size={14} /> Refresh</button>
      </header>

      <ol className="confirm-steps" aria-label="Session confirmation workflow">
        <li className={ready ? "is-done" : "is-current"}>
          <span>{ready ? <CheckCircle2 size={16} /> : "01"}</span>
          <div>
            <strong>Select a session</strong>
            <small>Choose a class and date</small>
          </div>
        </li>
        <li className={physicalVerified ? "is-done" : ready ? "is-current" : ""}>
          <span>{physicalVerified ? <CheckCircle2 size={16} /> : "02"}</span>
          <div>
            <strong>{mode === "physical" ? "Faculty verification" : "Review virtual session"}</strong>
            <small>{mode === "physical" ? "Confirm with a faculty PIN" : "Enter the credited hours"}</small>
          </div>
        </li>
        <li className={completed && mode === "physical" ? "is-done" : pending && mode === "physical" ? "is-current" : ""}>
          <span>{completed && mode === "physical" ? <CheckCircle2 size={16} /> : "03"}</span>
          <div>
            <strong>Credit session hours</strong>
            <small>{mode === "physical" ? "Complete the final confirmation" : "Save to credit hours immediately"}</small>
          </div>
        </li>
      </ol>

      <section className="confirm-selection" aria-label="Select session">
        <div>
          <label htmlFor="confirm-lab">Laboratory</label>
          <SearchableSelect id="confirm-lab" ariaLabel="Select laboratory" value={labId === "" ? "all" : String(labId)} onValueChange={(v) => { setAutoSelectPending(false); setLinkedSelection(false); setLabId(v === "all" ? "" : Number(v)); }} disabled={busy || initialLoading || !!initialError} leadingIcon={<Building2 size={16} />} options={labOptions} />
        </div>
        <div>
          <label htmlFor="confirm-class">Course section</label>
          <SearchableSelect id="confirm-class" ariaLabel="Select course section" placeholder={initialLoading ? "Loading classes…" : "Choose a class"} searchPlaceholder="Search code, subject or section…" emptyMessage="No classes found in this laboratory." value={String(sectionId)} onValueChange={(v) => { setAutoSelectPending(false); setLinkedSelection(false); setSectionId(Number(v)); }} disabled={busy || initialLoading || !!initialError} leadingIcon={<ClipboardCheck size={16} />} options={classOptions} />
        </div>
        <div>
          <label htmlFor="confirm-date">Session date · Philippine time</label>
          <input id="confirm-date" type="date" value={sessionDate} disabled={busy} onChange={(e) => { setAutoSelectPending(false); setLinkedSelection(false); setSessionDate(e.target.value); }} />
        </div>
      </section>
      {(linkedSession.invalid && sectionId === "" || linkedMissing) && <div className="confirm-notice is-error" role="alert">
        <AlertTriangle size={17} /><span>{linkedMissing ? "The linked course section is unavailable in this academic period. Choose another class or return to Class Status." : "This session link is incomplete or invalid. Choose a class and date to continue."}</span>
      </div>}
      {initialError && <div className="confirm-notice is-error" role="alert">
        <AlertTriangle size={17} />
        <span>{initialError}</span>
        <button onClick={() => setRetry((n) => n + 1)}>Try again</button>
      </div>}
      {error && <div className="confirm-notice is-error" role="alert">
        <AlertTriangle size={17} />
        <span>{error}</span>
      </div>}
      {success && <div className="confirm-notice is-success" role="status">
        <CheckCircle2 size={17} />
        <span>{success}</span>
      </div>}

      {linkedSession.pendingView && !linkedSession.invalid && !initialLoading && !initialError && <PendingConfirmations
        sections={sections} labId={labId} ayId={linkedSession.ayId} sectionId={sectionId} sessionDate={sessionDate}
        busy={busy} retryKey={retry + queueRevision} autoSelect={autoSelectPending} onSelect={selectPending} />}

      <div className="confirm-workspace" aria-busy={loading}>
        <section className="confirm-review">
          <div className="confirm-panel-title">
            <div>
              <Users size={17} />
              <h2>Attendance review</h2>
            </div>
            <span>{sessionDate || "Choose a date"}</span>
          </div>
          {!ready ? <div className="confirm-placeholder" role="status">
            <ClipboardCheck size={31} />
            <h3>{linkedMissing ? "Linked session unavailable" : loading ? "Loading session…" : sectionId && error ? "Session unavailable" : "Start with a course section"}</h3>
            <p>{linkedMissing ? "The linked class could not be found in the selected academic period." : loading ? "Retrieving attendance and confirmation records." : sectionId && error ? "Refresh to try loading this session again." : "Select a class and date to review attendance and confirm its hours."}</p>
          </div> : <>
            <div className="confirm-class-summary">
              <span className="confirm-section-code">{detail.sectionCode} <span>{detail.subject.code}</span>
              </span>
              <h3>{detail.subject.title}</h3>
              <p>
                <CalendarDays size={13} /> {detail.meetings.map((m) => `${m.dayOfWeek.slice(0, 3)} ${timeLabel(m.startTime)}–${timeLabel(m.endTime)} · ${m.laboratory.roomCode}`).join(" / ") || "No regular laboratory schedule"}{detail.termPart ? ` · ${detail.term} only` : ""}</p>
              {(detail.makeUps ?? []).filter((m) => m.date.slice(0, 10) === sessionDate).map((m) => <p key={m.makeUpId} className="confirm-makeup">Make-up class: {timeLabel(m.startTime)}–{timeLabel(m.endTime)} · {m.roomCode}</p>)}
              <div className="confirm-hours">
                <span>Confirmed laboratory hours</span>
                <strong>{detail.compliance ? `${detail.compliance.confirmedHoursTotal} / ${detail.compliance.requiredHours} hrs` : "Not assessed"}</strong>
              </div>
              <div className="confirm-progress" aria-hidden="true">
                <span style={{ width: `${detail.compliance && detail.compliance.requiredHours > 0 ? Math.max(0, Math.min(100, detail.compliance.confirmedHoursTotal / detail.compliance.requiredHours * 100)) : 0}%` }} />
              </div>
            </div>
            <div className="confirm-attendance-tools">
              <nav aria-label="Attendance view">{([['present', 'Present', attendance.presentCount], ['absent', 'Absent', attendance.absentCount], ['other', 'Not on roster', attendance.notOnRoster.length]] as const).map(([value, label, count]) => <button key={value} aria-pressed={attendanceTab === value} className={attendanceTab === value ? "is-active" : ""} onClick={() => setAttendanceTab(value)}>{label}<span>{count}</span>
              </button>)}</nav>
              <label className="confirm-search">
                <Search size={15} />
                <input aria-label="Search students" type="search" placeholder="Search student or school ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
            </div>
            <div className="confirm-attendance-body">
              {attendance.rosterCount === 0 && <p className="confirm-roster-note">No class list has been imported for this section. Import a roster to check who is absent.</p>}
              {query && visibleCount === 0 ? <p className="confirm-empty-list">No students match “{search}”.</p> : attendanceTab === "absent" ? <AbsentList key={`${sectionId}-${sessionDate}`} rows={attendance.absent.filter(matches)} pcs={labPcs} pcMessage={pcMessage} busy={busy} onMarkPresent={(studentId, workstationId, note) => run(async () => { await recordManualAttendance({ sectionId: Number(sectionId), studentId, date: sessionDate, workstationId, note }); return "Marked present. The entry is labelled as recorded manually."; })} /> : <NameList title={attendanceTab === "present" ? "Present students" : "Logged in, not on roster"} tone={attendanceTab === "present" ? "#536e59" : "#9a6700"} rows={(attendanceTab === "present" ? attendance.present : attendance.notOnRoster).filter(matches).map((r) => ({ key: r.attendanceId, left: `${r.name} · ${r.schoolId}`, right: `${r.workstation} · ${loginTimeLabel(r.loginTime)}${r.notes?.startsWith('Manual entry:') ? ' · Manual entry' : ''}` }))} />}
            </div>
            <footer className="confirm-review-footer">
              <ShieldCheck size={13} /> Attendance entries alone do not credit laboratory hours.</footer>
          </>}
        </section>

        <aside className="confirm-action-panel" aria-label="Session confirmation">
          <div className="confirm-panel-title">
            <div>
              <ShieldCheck size={17} />
              <h2>Session confirmation</h2>
            </div>
          </div>
          <div className="confirm-action-body">
            <div className="confirm-mode" aria-label="Session type">{(["physical", "virtual"] as const).map((m) => <button key={m} aria-pressed={mode === m} disabled={busy} className={mode === m ? "is-active" : ""} onClick={() => { setMode(m); setPin(""); setNotes(""); setError(null); setSuccess(null); }}>{m === "physical" ? <Monitor size={14} /> : <Video size={14} />}{m === "physical" ? "Physical class" : "Virtual class"}</button>)}</div>
            <fieldset disabled={!ready || busy} className="confirm-action-fields">
              {mode === "physical" && completed ? <div className="confirm-completed">
                <CheckCircle2 size={29} />
                <h3>Session confirmed</h3>
                <p>{completed.hoursCredited} laboratory hours credited for this date.</p>
                <small>Final confirmation by {completed.finalConfirmedBy || "staff"}.</small>
              </div> : mode === "physical" && !pending ? <>
                <div className="confirm-action-caption">
                  <span>01 / Faculty verification</span>
                  <h3>Verify the faculty member</h3>
                  <p>Have the faculty member enter their PIN after you review the attendance.</p>
                </div>
                <div className="confirm-field">
                  <label htmlFor="confirm-faculty">Faculty member</label>
                  <SearchableSelect id="confirm-faculty" ariaLabel="Select faculty member" value={facultyId} onValueChange={setFacultyId} disabled={!ready || busy} placeholder={ready ? "No faculty with a PIN" : "Select a class first"} options={facultyOptions} />
                </div>
                <Field label="Faculty PIN">
                  <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="Enter 4–6 digit PIN" />
                </Field>
                <p className="confirm-security-note">
                  <ShieldCheck size={13} /> PIN verification is required before final confirmation.</p>
                <PrimaryButton onClick={doFacultyConfirm} disabled={!ready || !facultyId || pin.length < 4 || busy}>{busy ? "Verifying…" : "Verify faculty PIN"}</PrimaryButton>
                <div className="confirm-next-step">
                  <ArrowRight size={15} />
                  <p>
                    <strong>Next: final confirmation</strong>
                    <span>Faculty verification alone does not credit hours.</span>
                  </p>
                </div>
              </> : mode === "physical" && pending ? <>
                <div className="confirm-action-caption">
                  <span>02 / Final confirmation</span>
                  <h3>Awaiting final confirmation</h3>
                  <p>Review the verified session and provide the final confirmation.</p>
                </div>
                <div className="confirm-verified">
                  <CheckCircle2 size={19} />
                  <div>
                    <strong>{pending.facultyConfirmedBy || "Faculty verified"}</strong>
                    <span>{pending.hoursCredited} hours will be credited</span>
                  </div>
                </div>
                <Field label="Notes (optional)">
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Add any session notes…" />
                </Field>
                <PrimaryButton onClick={doFinalConfirm} disabled={!ready || busy}>{busy ? "Confirming…" : "Final confirm and credit hours"}</PrimaryButton>
              </> : <>
                <div className="confirm-action-caption">
                  <span>Virtual session</span>
                  <h3>Record virtual class hours</h3>
                  <p>No faculty PIN is required. Saving this session credits the hours immediately.</p>
                </div>
                <Field label="Hours to credit">
                  <input type="number" min="0.5" step="0.5" value={virtualHours} onChange={(e) => setVirtualHours(e.target.value)} />
                </Field>
                <Field label="Notes (optional)">
                  <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Held on Google Meet" />
                </Field>
                <PrimaryButton onClick={doVirtual} disabled={!ready || !Number.isFinite(Number(virtualHours)) || Number(virtualHours) < .5 || Number(virtualHours) % .5 !== 0 || busy}>{busy ? "Saving…" : "Record virtual session"}</PrimaryButton>
              </>}
            </fieldset>
          </div>
        </aside>
      </div>
      <div className="confirm-paper-wrap">
        {attendance && attendance.absent.length > 1 && (
          <BulkManual
            key={`${sectionId}-${sessionDate}`}
            rows={attendance.absent}
            pcs={labPcs}
            busy={busy}
            pcMessage={pcMessage}
            onSubmit={(entries, note) =>
              run(async () => {
                let saved = 0;
                const failed: string[] = [];
                // One request per student, in order, so one bad row does not stop the rest.
                for (const e of entries) {
                  try {
                    await recordManualAttendance({
                      sectionId: Number(sectionId), studentId: e.studentId, date: sessionDate,
                      workstationId: e.workstationId, note,
                    });
                    saved++;
                  } catch (err) {
                    failed.push(`${e.name}: ${err instanceof ApiError ? err.message : "failed"}`);
                  }
                }
                if (saved === 0) throw new ApiError(400, failed.join(" | "));
                return `${saved} student${saved === 1 ? "" : "s"} marked present.` +
                  (failed.length ? ` Not saved: ${failed.join(" | ")}` : "");
              })
            }
          />
        )}
      </div>
    </div>
  );
}

/**
 * For an outage, when the whole class was recorded on paper: tick the students who were
 * present, pick each one's PC, give one reason, and save them together.
 */
function BulkManual({ rows, pcs, busy, pcMessage, onSubmit }: {
  rows: AbsentRow[];
  pcs: WorkstationEntry[];
  busy: boolean;
  pcMessage: string;
  onSubmit: (entries: { studentId: string; name: string; workstationId: number }[], note: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Record<string, number | "">>({}); // studentId -> PC ("" = ticked, no PC yet)
  const [note, setNote] = useState("");

  const ticked = Object.keys(picked);
  const ready = ticked.filter((id) => picked[id] !== "");
  const usedPcs = new Set(Object.values(picked).filter((v) => v !== ""));
  const canSave = ready.length > 0 && ready.length === ticked.length && note.trim().length >= 5 && !busy;

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = { ...p };
      if (id in next) delete next[id];
      else next[id] = "";
      return next;
    });

  return (
    <section className="confirm-paper">
      <button type="button" aria-expanded={open} disabled={busy} onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left">
        <span>
          <span className="text-[13px] font-semibold">Record attendance from a paper sheet</span>
          <span className="ml-2 text-[12px]" style={{ color: MUTED }}>
            For a session when the server and Master PC were down
          </span>
        </span>
        <span className="font-mono text-[11px]" style={{ color: MAROON }}>{open ? "Hide" : "Open"}</span>
      </button>

      {open && (
        <fieldset disabled={busy} className="confirm-manual-fields">
          <div className="space-y-3 px-4 pb-4" style={{ borderTop: "1px solid #e1e4e8" }}>
            {pcs.length === 0 ? (
              <div className="pt-3 text-[12.5px]" style={{ color: MUTED }}>
                {pcMessage || "No active workstations are available for this session."}
              </div>
            ) : (
              <>
                <div className="max-h-80 overflow-auto pt-2">
                  <table className="w-full text-[12.5px]">
                    <tbody>
                      {rows.map((r) => {
                        const on = r.studentId in picked;
                        return (
                          <tr key={r.studentId} style={{ borderBottom: "1px solid #f0f2f4" }}>
                            <td className="w-8 py-1.5">
                              <input type="checkbox" checked={on} onChange={() => toggle(r.studentId)} aria-label={`Present: ${r.name}`} />
                            </td>
                            <td className="py-1.5 pr-3">{r.name}</td>
                            <td className="py-1.5 pr-3 font-mono text-[11.5px]" style={{ color: MUTED }}>{r.schoolId}</td>
                            <td className="w-56 py-1.5">
                              {on && (
                                <select
                                  aria-label={`Workstation for ${r.name}`} value={picked[r.studentId]}
                                  onChange={(e) => setPicked((p) => ({ ...p, [r.studentId]: e.target.value ? Number(e.target.value) : "" }))}
                                  className="w-full rounded px-2 py-1 text-[12px] outline-none"
                                  style={{ border: `1px solid ${picked[r.studentId] === "" ? MAROON : BORDER}`, background: "#fff" }}
                                >
                                  <option value="">PC used...</option>
                                  {pcs.map((w) => (
                                    <option key={w.workstationId} value={w.workstationId}
                                      disabled={usedPcs.has(w.workstationId) && picked[r.studentId] !== w.workstationId}>
                                      {w.seatLabel} ({w.pcIdentifier})
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <input aria-label="Reason for paper attendance" value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Reason for all of these, e.g. Server and Master PC were down; from the paper sheet"
                  className="w-full rounded-md px-3 py-2 text-[12.5px] outline-none" style={{ border: `1px solid ${BORDER}` }} />

                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px]" style={{ color: MUTED }}>
                    {ticked.length} ticked{ticked.length !== ready.length ? ` · ${ticked.length - ready.length} still need a PC` : ""}
                  </span>
                  <button type="button" disabled={!canSave}
                    onClick={() => {
                      onSubmit(ready.map((id) => ({
                        studentId: id,
                        name: rows.find((r) => r.studentId === id)?.name ?? id,
                        workstationId: Number(picked[id]),
                      })), note.trim());
                      setPicked({});
                    }}
                    className="rounded-md px-4 py-2 text-[12.5px] font-semibold"
                    style={{ background: MAROON, color: GOLD, opacity: canSave ? 1 : 0.6 }}>
                    {busy ? "Saving..." : `Record ${ready.length || ""} as present`}
                  </button>
                </div>
              </>
            )}
          </div>
        </fieldset>
      )}
    </section>
  );
}

/** Absent students, each with a "Mark present" action for sessions the PC Agent could not record. */
function AbsentList({ rows, pcs, busy, pcMessage, onMarkPresent }: {
  rows: AbsentRow[];
  pcs: WorkstationEntry[];
  busy: boolean;
  pcMessage: string;
  onMarkPresent: (studentId: string, workstationId: number, note: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [pcId, setPcId] = useState<number | "">("");
  const [note, setNote] = useState("");

  if (rows.length === 0) return <p className="confirm-empty-list">No students in this view.</p>;

  const open = (studentId: string) => { setOpenId(studentId); setPcId(""); setNote(""); };

  return (
    <div>
      <div className="text-[11.5px] font-semibold" style={{ color: "#b42318" }}>Absent ({rows.length})</div>
      <div className="confirm-student-list">
        {rows.map((r) => (
          <div key={r.studentId}>
            <div className="confirm-student-row">
              <span>{r.name}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono" style={{ color: MUTED }}>{r.schoolId}</span>
                <button type="button" disabled={busy} aria-expanded={openId === r.studentId} onClick={() => (openId === r.studentId ? setOpenId(null) : open(r.studentId))}
                  className="rounded px-1.5 py-0.5 text-[11px]" style={{ border: `1px solid ${BORDER}`, color: MAROON }}>
                  {openId === r.studentId ? "Cancel" : "Mark present"}
                </button>
              </span>
            </div>
            {openId === r.studentId && (
              <fieldset disabled={busy} className="mt-1.5 space-y-1.5 rounded-md p-2" style={{ background: "#f6f8fa", border: `1px solid ${BORDER}` }}>
                {pcs.length === 0 ? (
                  <div className="text-[11.5px]" style={{ color: MUTED }}>
                    {pcMessage || "No active workstations are available for this session."}
                  </div>
                ) : (
                  <>
                    <select aria-label={`Workstation for ${r.name}`} value={pcId} onChange={(e) => setPcId(e.target.value ? Number(e.target.value) : "")}
                      className="w-full rounded px-2 py-1 text-[12px] outline-none" style={{ border: `1px solid ${BORDER}`, background: "#fff" }}>
                      <option value="">PC the student used...</option>
                      {pcs.map((w) => <option key={w.workstationId} value={w.workstationId}>{w.seatLabel} ({w.pcIdentifier})</option>)}
                    </select>
                    <input aria-label={`Reason for ${r.name}`} value={note} onChange={(e) => setNote(e.target.value)}
                      placeholder="Reason, e.g. Server and Master PC were down; from the paper sheet"
                      className="w-full rounded px-2 py-1 text-[12px] outline-none" style={{ border: `1px solid ${BORDER}` }} />
                    <button type="button" disabled={!pcId || note.trim().length < 5}
                      onClick={() => { onMarkPresent(r.studentId, Number(pcId), note.trim()); setOpenId(null); }}
                      className="w-full rounded px-2 py-1 text-[12px] font-semibold"
                      style={{ background: MAROON, color: GOLD, opacity: !pcId || note.trim().length < 5 ? 0.6 : 1 }}>
                      Record as present
                    </button>
                  </>
                )}
              </fieldset>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function NameList({ title, tone, rows }: { title: string; tone: string; rows: { key: string | number; left: string; right: string }[] }) {
  if (rows.length === 0) return <p className="confirm-empty-list">No students in this view.</p>;
  return (
    <div>
      <div className="text-[11.5px] font-semibold" style={{ color: tone }}>{title} ({rows.length})</div>
      <div className="confirm-student-list">
        {rows.map((r) => (
          <div key={r.key} className="confirm-student-row">
            <span>{r.left}</span>
            <span className="font-mono" style={{ color: MUTED }}>{r.right}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-semibold"
      style={{ background: MAROON, color: GOLD, opacity: disabled ? 0.6 : 1 }}
    >
      <CheckCircle2 className="size-4" /> {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="confirm-field">
      <span>{label}</span>{children}</label>
  );
}

function Restricted() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center" style={{ color: MUTED }}>
      <div className="mb-3 text-[13px] font-mono uppercase tracking-wider">Restricted</div>
      <p className="max-w-sm text-[13px]">
        This page is only available to the Laboratory Assistant, Laboratory Custodian, and Administrator roles.
      </p>
    </div>
  );
}
