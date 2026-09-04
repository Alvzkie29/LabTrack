import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  Monitor, Wifi, WifiOff, LogIn, ArrowLeft, AlertTriangle, Lock, Hash,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/api/client";
import { getCourseSections, type CourseSectionSummary } from "@/api/courseSections";
import { loginAttendance } from "@/api/attendance";
import { resolveWorkstationId } from "@/utils/workstation";

const MAROON = "#800000";
const GOLD = "#F4C430";

export function StudentLoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const workstationId = useMemo(() => resolveWorkstationId(), []);

  const [sections, setSections] = useState<CourseSectionSummary[]>([]);
  const [sectionId, setSectionId] = useState<number | "">("");
  const [schoolId, setSchoolId] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Course sections are only readable once authenticated, so this loads best-effort
  // and simply leaves the dropdown empty until the student has logged in; the form
  // below re-checks for sections right after a successful account login.
  useEffect(() => {
    getCourseSections().then(setSections).catch(() => {
      // Not logged in yet — expected on first render. Sections are (re)loaded after login below.
    });
  }, []);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!workstationId) e.workstation = "This kiosk isn't configured with a workstation ID.";
    if (!sectionId) e.section = "Select your course.";
    if (!schoolId.trim()) e.schoolId = "Student ID is required.";
    if (!password) e.password = "Password is required.";
    return e;
  }, [workstationId, sectionId, schoolId, password]);

  const canSubmit = Object.keys(errors).length === 0;

  const start = async () => {
    setTouched(true);
    setError(null);
    if (!workstationId) return; // hard stop — nothing works without a configured kiosk

    try {
      setIsSubmitting(true);

      // Step 1: authenticate the student account.
      const user = await login({ identifier: schoolId, password });
      if (user.role !== "Student") {
        setError("This account is not a Student account.");
        return;
      }

      // Step 2: now authenticated, load sections if the earlier best-effort fetch was empty.
      let availableSections = sections;
      if (availableSections.length === 0) {
        availableSections = await getCourseSections();
        setSections(availableSections);
      }
      if (!sectionId) {
        setError("Select your course, then submit again.");
        return;
      }

      // Step 3: record the workstation-level attendance session.
      const attendance = await loginAttendance(workstationId, Number(sectionId));
      const chosenSection = availableSections.find((s) => s.sectionId === Number(sectionId));

      sessionStorage.setItem("labtrack_attendance_id", String(attendance.attendanceId));
      sessionStorage.setItem("labtrack_login_time", attendance.loginTime);
      sessionStorage.setItem("labtrack_workstation_id", String(workstationId));
      sessionStorage.setItem("labtrack_section_code", chosenSection?.sectionCode ?? "");
      sessionStorage.setItem("labtrack_section_title", chosenSection?.subject.title ?? "");

      navigate("/my-attendance");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center" style={{ background: "#f6f8fa" }}>
      <div className="w-full max-w-md mx-4">
        <div className="rounded-lg p-8" style={{ background: "#ffffff", border: "1px solid #d1d9e0" }}>
          {/* Logo and title */}
          <div className="flex items-center gap-3">
            <div
              className="flex size-12 items-center justify-center rounded-md"
              style={{ background: MAROON, color: GOLD, fontWeight: 800, fontSize: 16, letterSpacing: -0.5 }}
            >
              LT
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#0d1117" }}>LabTrack</div>
              <div className="font-mono" style={{ fontSize: 11, color: "#57606a", letterSpacing: "0.03em" }}>
                UM · CCE · Student
              </div>
            </div>
          </div>

          {/* Workstation info card */}
          <div className="mt-6 rounded-md p-3" style={{ background: "#f6f8fa", border: "1px solid #e1e4e8" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="size-4" style={{ color: "#57606a" }} />
                <span className="font-mono text-[12px] font-semibold" style={{ color: "#0d1117" }}>
                  {workstationId ? `Workstation #${workstationId}` : "Unconfigured kiosk"}
                </span>
              </div>
              {workstationId ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono"
                  style={{ fontSize: 10, background: "#fff4f4", color: MAROON, border: "1px solid #f1d7d7" }}
                >
                  <span className="inline-block size-1.5 rounded-full" style={{ background: MAROON }} />
                  <Wifi className="size-2.5" /> ready
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono"
                  style={{ fontSize: 10, background: "#f6f8fa", color: "#57606a", border: "1px solid #d1d9e0" }}
                >
                  <WifiOff className="size-2.5" /> not set
                </span>
              )}
            </div>
          </div>

          <h1 className="mt-6" style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, color: "#0d1117" }}>
            Student check-in
          </h1>
          <p className="mt-1.5" style={{ fontSize: 13, color: "#57606a", lineHeight: 1.5 }}>
            Log in with your Student ID to start a verified attendance session on this workstation.
          </p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => { e.preventDefault(); start(); }}
          >
            <div>
              <label className="mb-1.5 block font-semibold" style={{ fontSize: 13, color: "#0d1117" }}>
                Select a course
              </label>
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
                className="w-full outline-none"
                style={{
                  background: "#ffffff",
                  border: `1px solid ${touched && errors.section ? MAROON : "#d1d9e0"}`,
                  borderRadius: 6,
                  padding: "11px 12px",
                  fontSize: 13,
                  color: "#0d1117",
                }}
              >
                <option value="">
                  {sections.length === 0 ? "Log in to load your courses" : "Select..."}
                </option>
                {sections.map((cs) => (
                  <option key={cs.sectionId} value={cs.sectionId} style={{ background: "#ffffff" }}>
                    {cs.sectionCode} — {cs.subject.title}
                  </option>
                ))}
              </select>
              {touched && errors.section && (
                <div className="mt-1.5 flex items-center gap-1.5" style={{ fontSize: 11.5, color: MAROON }}>
                  <AlertTriangle className="size-3" /> {errors.section}
                </div>
              )}
              <p className="mt-1 font-mono text-[10.5px]" style={{ color: "#8c959f" }}>
                Course list loads after you enter your Student ID and password below and submit.
              </p>
            </div>

            <BigField
              label="Student ID"
              value={schoolId}
              onChange={setSchoolId}
              placeholder="2023-00123"
              mono
              icon={Hash}
              error={touched ? errors.schoolId : undefined}
            />

            <BigField
              label="Password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              type="password"
              icon={Lock}
              error={touched ? errors.password : undefined}
            />

            {error && (
              <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: MAROON }}>
                <AlertTriangle className="size-3.5" /> {error}
              </div>
            )}

            {touched && errors.workstation && (
              <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: MAROON }}>
                <AlertTriangle className="size-3.5" /> {errors.workstation}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md transition-opacity"
              style={{
                background: MAROON, color: GOLD, fontWeight: 600, fontSize: 14,
                padding: "11px 16px",
                opacity: (!canSubmit && touched) || isSubmitting ? 0.6 : 1,
              }}
            >
              <LogIn className="size-4" /> {isSubmitting ? "Logging in..." : "Log in"}
            </button>
          </form>

          <div className="mt-8 text-center">
            <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: MAROON }}>
              <ArrowLeft className="size-3.5" /> Lab staff sign in
            </Link>
            <p className="mt-1 font-mono text-[11px]" style={{ color: "#8c959f" }}>
              Kiosk shown on the lab workstation itself.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BigField({
  label, value, onChange, placeholder, type = "text", mono, error, icon: Icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
  error?: string;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}) {
  const MAROON = "#800000";
  return (
    <div>
      <label className="mb-1.5 block font-semibold" style={{ fontSize: 13, color: "#0d1117" }}>
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
            style={{ color: "#57606a" }}
          />
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full outline-none"
          style={{
            background: "#ffffff",
            border: `1px solid ${error ? MAROON : "#d1d9e0"}`,
            borderRadius: 6,
            padding: Icon ? "11px 12px 11px 36px" : "11px 12px",
            fontSize: 13,
            color: "#0d1117",
            fontFamily: mono ? "var(--font-mono)" : undefined,
          }}
        />
      </div>
      {error && (
        <div className="mt-1.5 flex items-center gap-1.5" style={{ fontSize: 11.5, color: MAROON }}>
          <AlertTriangle className="size-3" /> {error}
        </div>
      )}
    </div>
  );
}