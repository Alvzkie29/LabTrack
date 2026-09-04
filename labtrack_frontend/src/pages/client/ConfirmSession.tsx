import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { getCourseSections, getCourseSection, type CourseSectionSummary, type CourseSectionDetail } from "@/api/courseSections";
import { confirmSession } from "@/api/sessionConfirmations";
import { ApiError } from "@/api/client";

const MAROON = "#800000";
const GOLD = "#F4C430";
const MUTED = "#57606a";
const BORDER = "#d1d9e0";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function ConfirmSessionsPage() {
  const { role } = useRole();
  const allowed = role === "Custodian" || role === "Administrator" || role === "LabAssistant";

  const [sections, setSections] = useState<CourseSectionSummary[]>([]);
  const [sectionId, setSectionId] = useState<number | "">("");
  const [detail, setDetail] = useState<CourseSectionDetail | null>(null);

  const [sessionDate, setSessionDate] = useState(todayIso());
  const [hoursCredited, setHoursCredited] = useState("2");
  const [notes, setNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (allowed) getCourseSections().then(setSections);
  }, [allowed]);

  useEffect(() => {
    setDetail(null);
    setSuccessMessage(null);
    if (!sectionId) return;
    getCourseSection(Number(sectionId)).then(setDetail);
  }, [sectionId]);

  if (!allowed) return <Restricted />;

  const submit = async () => {
    if (!sectionId) return;
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    try {
      const result = await confirmSession({
        sectionId: Number(sectionId),
        sessionDate,
        hoursCredited: Number(hoursCredited),
        notes: notes.trim() || undefined,
      });
      setSuccessMessage(
        `Session confirmed — ${result.hoursCredited}h credited. Section now at ${result.compliance.confirmedHoursTotal}/${result.compliance.requiredHours}h (${result.compliance.status}).`,
      );
      setNotes("");
      // Refresh the section detail so compliance + history reflect the new confirmation.
      const refreshed = await getCourseSection(Number(sectionId));
      setDetail(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to confirm session.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>
          Session Confirmation
        </div>
        <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>
          Confirm a Session
        </h1>
        <p className="mt-0.5 max-w-2xl text-[13px]" style={{ color: MUTED }}>
          Confirming a session is what credits CHED-compliance hours — an individual student login does not, on
          its own, credit the class.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Confirmation form */}
        <div style={{ background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 6, padding: 18 }}>
          <div className="space-y-3.5">
            <Field label="Course section">
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
                className="w-full rounded-md px-3 py-2 text-[13px] outline-none"
                style={{ border: `1px solid ${BORDER}` }}
              >
                <option value="">Select a section...</option>
                {sections.map((cs) => (
                  <option key={cs.sectionId} value={cs.sectionId}>
                    {cs.sectionCode} — {cs.subject.title}
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

            <Field label="Hours credited">
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={hoursCredited}
                onChange={(e) => setHoursCredited(e.target.value)}
                className="w-full rounded-md px-3 py-2 font-mono text-[13px] outline-none"
                style={{ border: `1px solid ${BORDER}` }}
              />
            </Field>

            <Field label="Notes (optional)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Makeup session for the cancelled Tuesday meeting"
                className="w-full resize-none rounded-md px-3 py-2 text-[13px] outline-none"
                style={{ border: `1px solid ${BORDER}` }}
              />
            </Field>

            {error && (
              <div className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "#b42318" }}>
                <AlertTriangle className="size-3.5" /> {error}
              </div>
            )}
            {successMessage && (
              <div className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "#1a7f37" }}>
                <CheckCircle2 className="size-3.5" /> {successMessage}
              </div>
            )}

            <button
              onClick={submit}
              disabled={!sectionId || isSubmitting}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-semibold"
              style={{ background: MAROON, color: GOLD, opacity: !sectionId || isSubmitting ? 0.6 : 1 }}
            >
              <CheckCircle2 className="size-4" /> {isSubmitting ? "Confirming..." : "Confirm session"}
            </button>
          </div>
        </div>

        {/* Selected section overview */}
        <div style={{ background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
          <div className="px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider" style={{ background: "#f6f8fa", color: MUTED, borderBottom: "1px solid #e1e4e8" }}>
            Section overview
          </div>
          {!detail ? (
            <div className="px-4 py-10 text-center text-[13px]" style={{ color: MUTED }}>
              Select a section to see its current compliance and recent confirmations.
            </div>
          ) : (
            <div className="p-4">
              <div className="font-mono text-[13px] font-semibold" style={{ color: MAROON }}>{detail.sectionCode}</div>
              <div className="mt-0.5 text-[13px]" style={{ color: "#0d1117" }}>{detail.subject.title}</div>

              {detail.compliance && (
                <div className="mt-3">
                  <div style={{ height: 6, background: "#e1e4e8", borderRadius: 999 }}>
                    <div
                      style={{
                        width: `${Math.min(100, Math.round((detail.compliance.confirmedHoursTotal / detail.compliance.requiredHours) * 100))}%`,
                        height: "100%", background: MAROON, borderRadius: 999,
                      }}
                    />
                  </div>
                  <div className="mt-1.5 font-mono text-[11.5px]" style={{ color: MUTED }}>
                    {detail.compliance.confirmedHoursTotal}/{detail.compliance.requiredHours}h · {detail.compliance.status}
                  </div>
                </div>
              )}

              <div className="mt-4 pt-3" style={{ borderTop: "1px solid #e1e4e8" }}>
                <div className="font-mono text-[10.5px] uppercase tracking-wider" style={{ color: MUTED }}>
                  Recent confirmations
                </div>
                <div className="mt-2 space-y-2">
                  {detail.sessionConfirmations.slice(0, 5).map((sc) => (
                    <div key={sc.confirmationId} className="flex items-center justify-between text-[12px]">
                      <span className="font-mono" style={{ color: "#0d1117" }}>
                        {new Date(sc.sessionDate).toLocaleDateString()}
                      </span>
                      <span style={{ color: MUTED }}>{sc.confirmedBy}</span>
                      <span className="font-mono" style={{ color: MAROON, fontWeight: 600 }}>{sc.hoursCredited}h</span>
                    </div>
                  ))}
                  {detail.sessionConfirmations.length === 0 && (
                    <div className="text-[12px]" style={{ color: MUTED }}>No sessions confirmed yet.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
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