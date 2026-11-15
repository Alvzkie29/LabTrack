import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, AlertTriangle, Users } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { getCourseSections, getCourseSection, type CourseSectionSummary, type CourseSectionDetail } from "@/api/courseSections";
import { getSectionAttendance, type SectionAttendance } from "@/api/attendance";
import { getLaboratories, type LaboratorySummary } from "@/api/laboratories";
import {
  getFacultyOptions, getConfirmationsBySection, facultyConfirm, finalConfirm, createVirtualSession,
  type FacultyOption, type ConfirmationRow,
} from "@/api/sessionConfirmations";
import { ApiError } from "@/api/client";

const MAROON = "#800000";
const GOLD = "#F4C430";
const MUTED = "#57606a";
const BORDER = "#d1d9e0";

// Local date as yyyy-mm-dd (toISOString would give the UTC date, which is "yesterday" in the early morning in Manila).
function todayLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const timeLabel = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

export function ConfirmSessionsPage() {
  const { role } = useRole();
  const allowed = role === "Custodian" || role === "Administrator" || role === "LabAssistant";

  const [sections, setSections] = useState<CourseSectionSummary[]>([]);
  const [labs, setLabs] = useState<LaboratorySummary[]>([]);
  const [labId, setLabId] = useState<number | "">("");
  const [sectionId, setSectionId] = useState<number | "">("");
  const [sessionDate, setSessionDate] = useState(todayLocal());
  const [mode, setMode] = useState<"physical" | "virtual">("physical");

  const [detail, setDetail] = useState<CourseSectionDetail | null>(null);
  const [attendance, setAttendance] = useState<SectionAttendance | null>(null);
  const [faculty, setFaculty] = useState<FacultyOption[]>([]);
  const [pending, setPending] = useState<ConfirmationRow | null>(null);

  const [facultyId, setFacultyId] = useState("");
  const [pin, setPin] = useState("");
  const [notes, setNotes] = useState("");
  const [virtualHours, setVirtualHours] = useState("2");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    getCourseSections().then(setSections).catch(() => setSections([]));
    getLaboratories().then(setLabs).catch(() => setLabs([]));
  }, [allowed]);

  // Narrow the class list to the lab the staff member is working in.
  const shown = labId === "" ? sections : sections.filter((s) => s.meetings.some((m) => m.laboratory.labId === labId));

  // Clear the chosen class if it is not held in the chosen lab.
  useEffect(() => {
    if (sectionId !== "" && !shown.some((s) => s.sectionId === sectionId)) setSectionId("");
  }, [labId, shown, sectionId]);

  const refresh = useCallback(async () => {
    if (!sectionId) return;
    const id = Number(sectionId);
    const [d, att, confs] = await Promise.all([
      getCourseSection(id),
      getSectionAttendance(id, sessionDate),
      getConfirmationsBySection(id),
    ]);
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
  }, [sectionId, sessionDate]);

  useEffect(() => {
    setError(null);
    setSuccess(null);
    setDetail(null);
    setAttendance(null);
    setPending(null);
    setPin("");
    if (!sectionId) return;
    refresh().catch((e) => setError(e instanceof ApiError ? e.message : "Could not load this class."));
    getFacultyOptions(Number(sectionId)).then((opts) => {
      setFaculty(opts);
      setFacultyId(opts[0]?.id ?? "");
    });
  }, [sectionId, sessionDate, refresh]);

  if (!allowed) return <Restricted />;

  const run = async (action: () => Promise<string>) => {
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      setSuccess(await action());
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
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

  return (
    <div className="space-y-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>Session Confirmation</div>
        <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Confirm a Session</h1>
        <p className="mt-0.5 max-w-2xl text-[13px]" style={{ color: MUTED }}>
          Check the attendance list, have the Faculty member confirm with their PIN, then give the final
          confirmation. Only the final confirmation credits CHED hours.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 6, padding: 18 }}>
          <div className="space-y-3.5">
            <Field label="Laboratory">
              <select
                value={labId}
                onChange={(e) => setLabId(e.target.value ? Number(e.target.value) : "")}
                className="w-full rounded-md px-3 py-2 text-[13px] outline-none"
                style={{ border: `1px solid ${BORDER}` }}
              >
                <option value="">All laboratories</option>
                {labs.map((l) => <option key={l.labId} value={l.labId}>{l.roomCode} — {l.name}</option>)}
              </select>
            </Field>

            <Field label="Class">
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
                className="w-full rounded-md px-3 py-2 text-[13px] outline-none"
                style={{ border: `1px solid ${BORDER}` }}
              >
                <option value="">Select a class...</option>
                {shown.map((cs) => (
                  <option key={cs.sectionId} value={cs.sectionId}>
                    {cs.sectionCode} — {cs.subject.code} {cs.subject.title}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Session date">
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="w-full rounded-md px-3 py-2 text-[13px] outline-none"
                style={{ border: `1px solid ${BORDER}` }}
              />
            </Field>

            <div className="flex gap-1.5">
              {(["physical", "virtual"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(null); setSuccess(null); }}
                  className="flex-1 rounded-md px-3 py-1.5 text-[12.5px] font-medium"
                  style={{
                    background: mode === m ? MAROON : "#fff",
                    color: mode === m ? GOLD : MUTED,
                    border: `1px solid ${mode === m ? MAROON : BORDER}`,
                  }}
                >
                  {m === "physical" ? "Physical class" : "Virtual class"}
                </button>
              ))}
            </div>

            {mode === "physical" && !pending && (
              <>
                <div className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                  Step 1 · Faculty confirmation
                </div>
                <Field label="Faculty">
                  <select
                    value={facultyId}
                    onChange={(e) => setFacultyId(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-[13px] outline-none"
                    style={{ border: `1px solid ${BORDER}` }}
                  >
                    {faculty.length === 0 && <option value="">No Faculty with a PIN</option>}
                    {faculty.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.fullName}{f.isAssigned ? " (assigned)" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Faculty PIN">
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    className="w-full rounded-md px-3 py-2 font-mono text-[13px] outline-none"
                    style={{ border: `1px solid ${BORDER}` }}
                  />
                </Field>
                <PrimaryButton onClick={doFacultyConfirm} disabled={!sectionId || !facultyId || pin.length < 4 || busy}>
                  {busy ? "Confirming..." : "Faculty confirm"}
                </PrimaryButton>
              </>
            )}

            {mode === "physical" && pending && (
              <>
                <div className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                  Step 2 · Final confirmation
                </div>
                <div className="rounded-md px-3 py-2 text-[12.5px]" style={{ background: "#f6f8fa", border: `1px solid ${BORDER}` }}>
                  Confirmed by <b>{pending.facultyConfirmedBy}</b> · {pending.hoursCredited}h will be credited.
                </div>
                <Field label="Notes (optional)">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="e.g. Class started 20 minutes late"
                    className="w-full resize-none rounded-md px-3 py-2 text-[13px] outline-none"
                    style={{ border: `1px solid ${BORDER}` }}
                  />
                </Field>
                <PrimaryButton onClick={doFinalConfirm} disabled={busy}>
                  {busy ? "Confirming..." : "Final confirm and credit hours"}
                </PrimaryButton>
              </>
            )}

            {mode === "virtual" && (
              <>
                <div className="text-[12px]" style={{ color: MUTED }}>
                  Virtual classes need no Faculty signature. The hours are credited right away.
                </div>
                <Field label="Hours credited">
                  <input
                    type="number" min="0.5" step="0.5"
                    value={virtualHours}
                    onChange={(e) => setVirtualHours(e.target.value)}
                    className="w-full rounded-md px-3 py-2 font-mono text-[13px] outline-none"
                    style={{ border: `1px solid ${BORDER}` }}
                  />
                </Field>
                <Field label="Notes (optional)">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="e.g. Held on Google Meet"
                    className="w-full resize-none rounded-md px-3 py-2 text-[13px] outline-none"
                    style={{ border: `1px solid ${BORDER}` }}
                  />
                </Field>
                <PrimaryButton onClick={doVirtual} disabled={!sectionId || Number(virtualHours) <= 0 || busy}>
                  {busy ? "Saving..." : "Record virtual session"}
                </PrimaryButton>
              </>
            )}

            {error && (
              <div className="flex items-start gap-1.5 text-[12.5px]" style={{ color: "#b42318" }}>
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {error}
              </div>
            )}
            {success && (
              <div className="flex items-start gap-1.5 text-[12.5px]" style={{ color: "#1a7f37" }}>
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /> {success}
              </div>
            )}
          </div>
        </div>

        <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
          <div className="px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider" style={{ background: "#f6f8fa", color: MUTED, borderBottom: "1px solid #e1e4e8" }}>
            Class overview
          </div>
          {!detail || !attendance ? (
            <div className="px-4 py-10 text-center text-[13px]" style={{ color: MUTED }}>
              Select a class to see its attendance and compliance.
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <div>
                <div className="font-mono text-[13px] font-semibold" style={{ color: MAROON }}>{detail.sectionCode}</div>
                <div className="mt-0.5 text-[13px]">{detail.subject.code} — {detail.subject.title}</div>
                <div className="mt-0.5 text-[12px]" style={{ color: MUTED }}>
                  {detail.meetings
                    .map((m) => `${m.dayOfWeek.slice(0, 3)} ${timeLabel(m.startTime)}–${timeLabel(m.endTime)} · ${m.laboratory.roomCode}`)
                    .join("  |  ")}
                </div>
                {detail.compliance && (
                  <div className="mt-2">
                    <div style={{ height: 6, background: "#e1e4e8", borderRadius: 999 }}>
                      <div style={{
                        width: `${Math.min(100, Math.round((detail.compliance.confirmedHoursTotal / detail.compliance.requiredHours) * 100))}%`,
                        height: "100%", background: MAROON, borderRadius: 999,
                      }} />
                    </div>
                    <div className="mt-1 font-mono text-[11.5px]" style={{ color: MUTED }}>
                      {detail.compliance.confirmedHoursTotal}/{detail.compliance.requiredHours}h · {detail.compliance.status}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3" style={{ borderTop: "1px solid #e1e4e8" }}>
                <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider" style={{ color: MUTED }}>
                  <Users className="size-3" /> Attendance · {attendance.presentCount} present / {attendance.absentCount} absent
                  {attendance.notOnRoster.length > 0 && ` / ${attendance.notOnRoster.length} not on roster`}
                </div>
                {attendance.rosterCount === 0 && attendance.notOnRoster.length === 0 ? (
                  <div className="mt-2 text-[12px]" style={{ color: MUTED }}>
                    No class list yet. Import one for this class.
                  </div>
                ) : (
                  <div className="mt-2 space-y-3">
                    <NameList title="Present" tone="#1a7f37"
                      rows={attendance.present.map((r) => ({ key: r.attendanceId, left: r.name, right: `${r.workstation} · ${new Date(r.loginTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` }))} />
                    <NameList title="Absent" tone="#b42318"
                      rows={attendance.absent.map((r) => ({ key: r.studentId, left: r.name, right: r.schoolId }))} />
                    <NameList title="Logged in, not on roster" tone="#9a6700"
                      rows={attendance.notOnRoster.map((r) => ({ key: r.attendanceId, left: r.name, right: r.workstation }))} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NameList({ title, tone, rows }: { title: string; tone: string; rows: { key: string | number; left: string; right: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="text-[11.5px] font-semibold" style={{ color: tone }}>{title} ({rows.length})</div>
      <div className="mt-1 space-y-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between text-[12px]">
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
    <div>
      <label className="mb-1 block text-[12.5px] font-medium" style={{ color: "#0d1117" }}>{label}</label>
      {children}
    </div>
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
