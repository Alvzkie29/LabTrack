import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, LogOut, Clock, Monitor, Wifi, CheckCircle2, Activity } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useHeartbeat } from "@/utils/hooks/useHeartbeat";
import { getMyAttendance, logoutAttendance, type MyAttendanceRow } from "@/api/attendance";

const MAROON = "#800000";
const GOLD = "#F4C430";

function readActiveSession() {
  const attendanceId = sessionStorage.getItem("labtrack_attendance_id");
  if (!attendanceId) return null;
  return {
    attendanceId: Number(attendanceId),
    loginTime: sessionStorage.getItem("labtrack_login_time") ?? new Date().toISOString(),
    workstationId: sessionStorage.getItem("labtrack_workstation_id") ?? "—",
    sectionCode: sessionStorage.getItem("labtrack_section_code") ?? "—",
    sectionTitle: sessionStorage.getItem("labtrack_section_title") ?? "",
  };
}

function clearActiveSession() {
  sessionStorage.removeItem("labtrack_attendance_id");
  sessionStorage.removeItem("labtrack_login_time");
  sessionStorage.removeItem("labtrack_workstation_id");
  sessionStorage.removeItem("labtrack_section_code");
  sessionStorage.removeItem("labtrack_section_title");
}

export function MyAttendancePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [session, setSession] = useState(readActiveSession());
  const [elapsed, setElapsed] = useState(0);
  const [history, setHistory] = useState<MyAttendanceRow[]>([]);
  const [isEndingSession, setIsEndingSession] = useState(false);

  // Real heartbeat: captures actual keystroke/mouse activity in this tab and streams it
  // to PresenceHub every 15s. latestUpdate reflects the live composite score once the
  // backend has processed at least one heartbeat for this session.
  const { latestUpdate } = useHeartbeat(session?.attendanceId ?? null);

  useEffect(() => {
    if (!session) return;
    const startedAt = new Date(session.loginTime).getTime();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [session]);

  useEffect(() => {
    getMyAttendance().then(setHistory).catch(() => setHistory([]));
  }, [session]); // refetch history right after ending a session too

  const totalHours = history.reduce((sum, row) => {
    if (!row.logoutTime) return sum;
    const hrs = (new Date(row.logoutTime).getTime() - new Date(row.loginTime).getTime()) / 3_600_000;
    return sum + hrs;
  }, 0);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  const endSession = async () => {
    if (!session) return;
    setIsEndingSession(true);
    try {
      await logoutAttendance(session.attendanceId);
    } catch (err) {
      console.error("Failed to log out attendance session:", err);
    } finally {
      clearActiveSession();
      setSession(null);
      setElapsed(0);
      setIsEndingSession(false);
    }
  };

  return (
    <div className="min-h-screen w-full" style={{ background: "#f6f8fa", color: "#0d1117" }}>
      {/* Top bar - matching staff design */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid #d1d9e0", background: "#ffffff" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex size-9 items-center justify-center rounded-md"
            style={{ background: MAROON, color: GOLD, fontWeight: 800, fontSize: 13 }}
          >
            LT
          </div>
          <div className="leading-tight">
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0d1117" }}>LabTrack · Student Portal</div>
            <div className="font-mono" style={{ fontSize: 10.5, color: "#57606a" }}>
              {user?.fullName ?? "View-only attendance history"}
            </div>
          </div>
        </div>

        {session && (
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1.5 font-mono" style={{ fontSize: 11.5, color: "#0d1117" }}>
              <Monitor className="size-3.5" style={{ color: "#57606a" }} />
              <span style={{ fontWeight: 600 }}>Workstation #{session.workstationId}</span>
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono"
              style={{ fontSize: 10.5, background: "#fff4f4", color: MAROON, border: "1px solid #f1d7d7" }}
            >
              <span className="inline-block size-1.5 rounded-full" style={{ background: MAROON }} />
              <Wifi className="size-3" /> connected
            </span>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <Link
          to="/student-login"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium"
          style={{ color: MAROON }}
        >
          <ArrowLeft className="size-3.5" /> Back to check-in
        </Link>

        {/* Active Session Card */}
        {session && (
          <div className="mt-5" style={{ background: "#ffffff", border: "1px solid #d1d9e0", borderRadius: 6 }}>
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ borderBottom: "1px solid #e1e4e8", background: "#fff4f4" }}
            >
              <CheckCircle2 className="size-4" style={{ color: MAROON }} />
              <span className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MAROON, fontWeight: 600 }}>
                Session Active
              </span>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="text-[13px]" style={{ color: "#57606a" }}>
                    Attendance is being verified for
                  </div>
                  <div className="mt-1 font-mono text-[14px] font-semibold" style={{ color: MAROON }}>
                    {session.sectionCode}
                  </div>
                  <div className="mt-0.5 text-[13px]" style={{ color: "#0d1117" }}>
                    {session.sectionTitle}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="size-4" style={{ color: MAROON }} />
                  <span className="font-mono text-[20px] font-bold" style={{ color: MAROON }}>
                    {mm}:{ss}
                  </span>
                </div>
              </div>

              <div className="pt-3" style={{ borderTop: "1px solid #e1e4e8" }}>
                <div className="grid grid-cols-2 gap-3 text-[12.5px]">
                  <Row label="Workstation" value={`#${session.workstationId}`} />
                  <Row label="Signed in as" value={user?.schoolId ?? "—"} />
                  <Row
                    label="Live activity score"
                    value={latestUpdate ? `${latestUpdate.compositeScore.toFixed(0)} / 100` : "Awaiting first heartbeat..."}
                  />
                  <Row label="Presence" value={latestUpdate?.presenceStatus ?? "Active"} />
                </div>
              </div>

              {latestUpdate && (
                <div className="flex items-center gap-1.5 pt-1" style={{ fontSize: 11, color: "#57606a" }}>
                  <Activity className="size-3" /> Last heartbeat received — score updates every ~15s while this tab is open.
                </div>
              )}

              <button
                type="button"
                onClick={endSession}
                disabled={isEndingSession}
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-md"
                style={{
                  background: "transparent",
                  border: "1px solid #d1d9e0",
                  color: "#0d1117",
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  opacity: isEndingSession ? 0.6 : 1,
                }}
              >
                <LogOut className="size-3.5" /> {isEndingSession ? "Ending..." : "End session"}
              </button>
            </div>
          </div>
        )}

        {!session && (
          <div className="mt-5 rounded-md p-4 text-[13px]" style={{ background: "#fff8e6", border: "1px solid #f2dfa0", color: "#57606a" }}>
            No active session on this device.{" "}
            <button onClick={() => navigate("/student-login")} className="font-medium" style={{ color: MAROON }}>
              Start a check-in
            </button>
            .
          </div>
        )}

        {/* Header */}
        <div className="mt-8">
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, color: "#0d1117" }}>
            My Attendance
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: "#57606a" }}>
            View-only history of your verified lab sessions.
          </p>
        </div>

        {/* Stats */}
        <div className="mt-5 flex flex-wrap gap-3">
          <Stat label="Sessions" value={history.length.toString()} />
          <Stat label="Total logged hours" value={`${totalHours.toFixed(1)}h`} />
        </div>

        {/* Attendance Table */}
        <div className="mt-5" style={{ background: "#ffffff", border: "1px solid #d1d9e0", borderRadius: 6 }}>
          <div
            className="px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider"
            style={{ background: "#f6f8fa", color: "#57606a", borderBottom: "1px solid #e1e4e8" }}
          >
            Attendance History
          </div>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr style={{ background: "#f6f8fa", color: "#57606a" }}>
                <th className="py-2 pl-4 text-left font-mono text-[10.5px] uppercase tracking-wider">Login</th>
                <th className="py-2 text-left font-mono text-[10.5px] uppercase tracking-wider">Section</th>
                <th className="py-2 text-left font-mono text-[10.5px] uppercase tracking-wider">Workstation</th>
                <th className="py-2 pr-4 text-right font-mono text-[10.5px] uppercase tracking-wider">Activity Score</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center" style={{ color: "#8c959f" }}>
                    No attendance history yet.
                  </td>
                </tr>
              )}
              {history.map((row) => (
                <tr key={row.attendanceId} style={{ borderTop: "1px solid #e1e4e8" }}>
                  <td className="py-2.5 pl-4 font-mono text-[11.5px]" style={{ color: "#0d1117" }}>
                    {new Date(row.loginTime).toLocaleString()}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[11.5px]" style={{ color: MAROON, fontWeight: 600 }}>
                    {row.section}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[11.5px]" style={{ color: "#57606a" }}>
                    {row.workstation}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono font-semibold" style={{ color: "#0d1117" }}>
                    {row.activityScore !== null ? row.activityScore.toFixed(0) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#ffffff", border: "1px solid #d1d9e0", borderRadius: 6, padding: "12px 16px" }}>
      <div className="font-mono text-[10.5px] uppercase tracking-wider" style={{ color: "#57606a" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#0d1117", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: "#57606a" }}>
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[12px]" style={{ color: "#0d1117" }}>
        {value}
      </div>
    </div>
  );
}