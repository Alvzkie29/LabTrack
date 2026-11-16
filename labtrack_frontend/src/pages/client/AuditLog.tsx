import { useEffect, useState } from "react";
import { useRole } from "@/contexts/RoleContext";
import { getAuditLog, AUDIT_ROLES, type AuditLogPage } from "@/api/auditLog";
import { ApiError } from "@/api/client";

const MUTED = "#57606a";
const BORDER = "#d1d9e0";
const PAGE_SIZE = 50;

// The actions the backend writes, with a plain label for each.
const ACTIONS: { value: string; label: string }[] = [
  { value: "SessionFacultyConfirmed", label: "Faculty confirmed a session" },
  { value: "SessionFinalConfirmed", label: "Final confirmation (hours credited)" },
  { value: "UserLoggedIn", label: "Login" },
  { value: "PasswordChanged", label: "Password changed" },
  { value: "UserCreated", label: "Account created" },
  { value: "WorkstationStaffUnlocked", label: "Staff unlocked a PC" },
];
const labelFor = (action: string) => ACTIONS.find((a) => a.value === action)?.label ?? action;

export function AuditLogPage() {
  const { role } = useRole();
  const allowed = role === "Administrator" || role === "Custodian";

  const [action, setAction] = useState("");
  const [role_, setRoleFilter] = useState("");
  const [withStudentLogins, setWithStudentLogins] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<AuditLogPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    setIsLoading(true);
    setError(null);
    getAuditLog({ action: action || undefined, role: role_ || undefined, includeStudentLogins: withStudentLogins, from: from || undefined, to: to || undefined, page, pageSize: PAGE_SIZE })
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the audit log."))
      .finally(() => setIsLoading(false));
  }, [allowed, action, role_, withStudentLogins, from, to, page]);

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center" style={{ color: MUTED }}>
        <div className="mb-3 font-mono text-[13px] uppercase tracking-wider">Restricted</div>
        <p className="max-w-sm text-[13px]">This page is only available to the Custodian and Administrator roles.</p>
      </div>
    );
  }

  // Choosing the Student role shows their logins whatever the checkbox says.
  const studentLoginsShown = withStudentLogins || role_ === "Student";
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Changing a filter goes back to the first page.
  const filter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <div className="space-y-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>Read-only</div>
        <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Audit Log</h1>
        <p className="mt-0.5 max-w-2xl text-[13px]" style={{ color: MUTED }}>
          Who did what, and when. Entries are written by the system and cannot be edited or deleted here.
          Student logins are left out by default, since there is one for every class on every PC.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Filter label="Action">
          <select value={action} onChange={(e) => filter(setAction)(e.target.value)}
            className="rounded-md px-3 py-1.5 text-[12.5px] outline-none" style={{ border: `1px solid ${BORDER}`, background: "#fff" }}>
            <option value="">All actions</option>
            {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </Filter>
        <Filter label="Role">
          <select value={role_} onChange={(e) => filter(setRoleFilter)(e.target.value)}
            className="rounded-md px-3 py-1.5 text-[12.5px] outline-none" style={{ border: `1px solid ${BORDER}`, background: "#fff" }}>
            <option value="">All roles</option>
            {AUDIT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Filter>
        <Filter label="From">
          <input type="date" value={from} onChange={(e) => filter(setFrom)(e.target.value)}
            className="rounded-md px-3 py-1.5 text-[12.5px] outline-none" style={{ border: `1px solid ${BORDER}` }} />
        </Filter>
        <Filter label="To">
          <input type="date" value={to} onChange={(e) => filter(setTo)(e.target.value)}
            className="rounded-md px-3 py-1.5 text-[12.5px] outline-none" style={{ border: `1px solid ${BORDER}` }} />
        </Filter>
        <label className="flex cursor-pointer items-center gap-1.5 pb-1.5 text-[12.5px]" style={{ color: MUTED }}>
          <input
            type="checkbox"
            checked={studentLoginsShown}
            disabled={role_ === "Student"}
            onChange={(e) => filter(setWithStudentLogins)(e.target.checked)}
          />
          Include student logins
        </label>

        <span className="pb-1.5 font-mono text-[11.5px]" style={{ color: MUTED }}>
          {isLoading ? "Loading..." : `${total} entr${total === 1 ? "y" : "ies"}`}
        </span>
      </div>

      {error && <div className="text-[12.5px]" style={{ color: "#b42318" }}>{error}</div>}

      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr style={{ background: "#f6f8fa", color: MUTED }}>
              {["When", "Who", "Action", "Details", "From"].map((h, i) => (
                <th key={h} className={`py-2.5 text-left font-mono text-[10.5px] uppercase tracking-wider ${i === 0 ? "pl-4" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.items.map((e) => (
              <tr key={e.auditId} style={{ borderTop: "1px solid #e1e4e8" }}>
                <td className="whitespace-nowrap py-2 pl-4 pr-3 align-top font-mono text-[11.5px]" style={{ color: MUTED }}>
                  {new Date(e.timestamp).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                </td>
                <td className="py-2 pr-3 align-top">
                  <div>{e.user}</div>
                  {(e.userRole || e.userSchoolId) && (
                    <div className="font-mono text-[10.5px]" style={{ color: MUTED }}>
                      {[e.userRole, e.userSchoolId].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-3 align-top">{labelFor(e.action)}</td>
                <td className="py-2 pr-3 align-top font-mono text-[11px]" style={{ color: MUTED }}>{e.details ?? "—"}</td>
                <td className="whitespace-nowrap py-2 pr-4 align-top font-mono text-[11px]" style={{ color: MUTED }}>{e.ipAddress ?? "—"}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[13px]" style={{ color: MUTED }}>No entries match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 text-[12.5px]">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
          className="rounded-md px-3 py-1.5" style={{ border: `1px solid ${BORDER}`, background: "#fff", opacity: page <= 1 ? 0.5 : 1 }}>
          Previous
        </button>
        <span className="font-mono" style={{ color: MUTED }}>Page {page} of {lastPage}</span>
        <button onClick={() => setPage((p) => Math.min(lastPage, p + 1))} disabled={page >= lastPage}
          className="rounded-md px-3 py-1.5" style={{ border: `1px solid ${BORDER}`, background: "#fff", opacity: page >= lastPage ? 0.5 : 1 }}>
          Next
        </button>
      </div>
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>{label}</span>
      {children}
    </label>
  );
}
