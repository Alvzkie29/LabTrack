import { useEffect, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { getFlaggedSessions, reviewSession, type FlaggedSessionRow } from "@/api/attendance";
import { ApiError } from "@/api/client";

const MAROON = "#800000";
const MUTED = "#57606a";
const BORDER = "#d1d9e0";

export function FlaggedSessionsPage() {
  const { role } = useRole();
  const allowed = role === "Custodian" || role === "Administrator";

  const [rows, setRows] = useState<FlaggedSessionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    getFlaggedSessions()
      .then(setRows)
      .finally(() => setIsLoading(false));
  }, [allowed]);

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center" style={{ color: MUTED }}>
        <div className="mb-3 text-[13px] font-mono uppercase tracking-wider">Restricted</div>
        <p className="max-w-sm text-[13px]">This page is only available to the Laboratory Custodian and Administrator roles.</p>
      </div>
    );
  }

  async function handleReview(attendanceId: number, outcome: 0 | 1) {
    setBusyId(attendanceId);
    setError(null);
    try {
      await reviewSession(attendanceId, outcome);
      // Reviewed sessions drop out of the "flagged" list server-side — remove locally too.
      setRows((prev) => prev.filter((r) => r.attendanceId !== attendanceId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record review.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>
          Monitoring · {rows.length} unresolved
        </div>
        <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Flagged Sessions</h1>
        <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
          Sessions the composite activity score classified as likely proxy logins or abandoned sessions. A
          logged-in PC alone never credits attendance — a human review resolves each one.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "#b42318" }}>
          <AlertTriangle className="size-3.5" /> {error}
        </div>
      )}

      <div style={{ background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <div
          className="grid px-4 py-2 font-mono text-[10.5px] uppercase tracking-wider"
          style={{ gridTemplateColumns: "110px 1fr 130px 140px", background: "#f6f8fa", color: MUTED }}
        >
          <span>Workstation</span>
          <span>Student / Section</span>
          <span>Activity score</span>
          <span>Action</span>
        </div>
        <div className="divide-y" style={{ borderColor: "#e1e4e8" }}>
          {rows.map((r) => (
            <div
              key={r.attendanceId}
              className="grid items-center px-4 py-3"
              style={{ gridTemplateColumns: "110px 1fr 130px 140px", borderTop: "1px solid #e1e4e8" }}
            >
              <span className="font-mono text-[12px]" style={{ color: "#0d1117", fontWeight: 600 }}>{r.workstation}</span>
              <div className="pr-3 text-[13px]" style={{ color: "#0d1117" }}>
                {r.student}
                <div className="font-mono text-[10.5px]" style={{ color: MUTED }}>
                  {r.section} · {r.studentSchoolId}
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: MUTED }}>
                  {new Date(r.loginTime).toLocaleString()}
                  {r.logoutTime ? ` – ${new Date(r.logoutTime).toLocaleTimeString()}` : " (still active)"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div style={{ width: 60, height: 5, background: "#e1e4e8", borderRadius: 999 }}>
                  <div style={{ width: `${r.compositeScore}%`, height: "100%", background: MAROON, borderRadius: 999 }} />
                </div>
                <span className="font-mono text-[11px]" style={{ color: MUTED }}>{r.compositeScore.toFixed(0)}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleReview(r.attendanceId, 0)}
                  disabled={busyId === r.attendanceId}
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] font-semibold"
                  style={{ background: MAROON, color: "#F4C430", opacity: busyId === r.attendanceId ? 0.6 : 1 }}
                >
                  <Check className="size-3" /> Accept
                </button>
                <button
                  onClick={() => handleReview(r.attendanceId, 1)}
                  disabled={busyId === r.attendanceId}
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] font-semibold"
                  style={{ background: "#ffffff", color: "#0d1117", border: "1px solid #d1d9e0", opacity: busyId === r.attendanceId ? 0.6 : 1 }}
                >
                  <X className="size-3" /> Reject
                </button>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="px-4 py-8 text-center text-[13px]" style={{ color: MUTED }}>
              {isLoading ? "Loading..." : "No sessions are currently flagged for review."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}