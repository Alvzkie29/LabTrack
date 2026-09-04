import { useEffect, useState } from "react";
import { Plus, X, AlertTriangle } from "lucide-react";
import { useRole, ROLES, type Role } from "@/contexts/RoleContext";
import { getUsers, updateUserStatus, adminCreateUser, type UserListItem } from "@/api/users";
import { ApiError } from "@/api/client";

const MAROON = "#800000";
const MUTED = "#57606a";
const BORDER = "#d1d9e0";

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function UsersPage() {
  const { role } = useRole();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [roleFilter, setRoleFilter] = useState<Role | "All">("All");
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const loadUsers = () => {
    setIsLoading(true);
    getUsers().then(setUsers).finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (role === "Administrator") loadUsers();
  }, [role]);

  if (role !== "Administrator") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center" style={{ color: MUTED }}>
        <div className="mb-3 text-[13px] font-mono uppercase tracking-wider">Restricted</div>
        <p className="max-w-sm text-[13px]">
          User account management is only available to the Administrator role.
        </p>
      </div>
    );
  }

  async function toggleActive(user: UserListItem) {
    setBusyId(user.id);
    try {
      await updateUserStatus(user.id, !user.isActive);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: !u.isActive } : u)));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to update account status.");
    } finally {
      setBusyId(null);
    }
  }

  const visible = roleFilter === "All" ? users : users.filter((u) => u.role === roleFilter);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>
            Accounts · {users.length}
          </div>
          <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>User Accounts</h1>
          <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
            Create, disable, or view any account. Disabling keeps historical attendance and confirmation records intact.
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold"
          style={{ background: MAROON, color: "#F4C430" }}
        >
          <Plus className="size-3.5" /> New account
        </button>
      </div>

      <div className="flex gap-1 rounded-lg p-1 w-fit" style={{ background: "#f6f8fa", border: "1px solid #e1e4e8" }}>
        {(["All", ...ROLES] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRoleFilter(r)}
            className="rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider"
            style={{
              background: roleFilter === r ? "#ffffff" : "transparent",
              color: roleFilter === r ? "#0d1117" : MUTED,
              boxShadow: roleFilter === r ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
            }}
          >
            {r}
          </button>
        ))}
      </div>

      <div style={{ background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr style={{ background: "#f6f8fa", color: MUTED }}>
              <th className="py-2.5 pl-4 text-left font-mono text-[10.5px] uppercase tracking-wider">Name</th>
              <th className="py-2.5 text-left font-mono text-[10.5px] uppercase tracking-wider">School ID</th>
              <th className="py-2.5 text-left font-mono text-[10.5px] uppercase tracking-wider">Role</th>
              <th className="py-2.5 text-left font-mono text-[10.5px] uppercase tracking-wider">Last active</th>
              <th className="py-2.5 text-left font-mono text-[10.5px] uppercase tracking-wider">Status</th>
              <th className="py-2.5 pr-4 text-left font-mono text-[10.5px] uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid #e1e4e8" }}>
                <td className="py-2.5 pl-4" style={{ color: "#0d1117", fontWeight: 600 }}>{u.fullName}</td>
                <td className="py-2.5 pr-3 font-mono text-[11.5px]" style={{ color: MUTED }}>{u.schoolId}</td>
                <td className="py-2.5 pr-3 text-[12px]" style={{ color: "#0d1117" }}>{u.role}</td>
                <td className="py-2.5 pr-3 font-mono text-[11px]" style={{ color: MUTED }}>{timeAgo(u.lastActive)}</td>
                <td className="py-2.5 pr-3">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border bg-white px-2 py-0.5 text-[11px] font-medium"
                    style={{ color: "#0d1117", borderColor: BORDER }}
                  >
                    <span className="inline-block size-1.5 rounded-full" style={{ background: u.isActive ? MAROON : "transparent", border: u.isActive ? "none" : "1.5px solid #0d1117" }} />
                    {u.isActive ? "Active" : "Disabled"}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  <button
                    onClick={() => toggleActive(u)}
                    disabled={busyId === u.id}
                    className="text-[11.5px] font-semibold"
                    style={{ color: MAROON, opacity: busyId === u.id ? 0.5 : 1 }}
                  >
                    {u.isActive ? "Disable" : "Re-enable"}
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-[12.5px]" style={{ color: MUTED }}>
                  {isLoading ? "Loading..." : "No accounts found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreateForm && (
        <CreateAccountModal
          onClose={() => setShowCreateForm(false)}
          onCreated={() => {
            setShowCreateForm(false);
            loadUsers();
          }}
        />
      )}
    </div>
  );
}

function CreateAccountModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("Student");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await adminCreateUser({ firstName, middleName: middleName || undefined, lastName, schoolId, email, password, role });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create account.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(13,17,23,0.4)" }}>
      <div className="w-full max-w-md rounded-lg p-6" style={{ background: "#ffffff" }}>
        <div className="flex items-center justify-between">
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>New account</h2>
          <button onClick={onClose}><X className="size-4" style={{ color: MUTED }} /></button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Input label="First name" value={firstName} onChange={setFirstName} />
          <Input label="Last name" value={lastName} onChange={setLastName} />
        </div>
        <div className="mt-3">
          <Input label="Middle name (optional)" value={middleName} onChange={setMiddleName} />
        </div>
        <div className="mt-3">
          <Input label="School ID" value={schoolId} onChange={setSchoolId} mono />
        </div>
        <div className="mt-3">
          <Input label="Email" value={email} onChange={setEmail} type="email" />
        </div>
        <div className="mt-3">
          <Input label="Temporary password" value={password} onChange={setPassword} type="password" />
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-[12.5px] font-medium">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full rounded-md px-3 py-2 text-[13px] outline-none"
            style={{ border: `1px solid ${BORDER}` }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-1.5 text-[12.5px]" style={{ color: "#b42318" }}>
            <AlertTriangle className="size-3.5" /> {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={isSubmitting}
          className="mt-5 w-full rounded-md py-2 text-[13px] font-semibold"
          style={{ background: MAROON, color: "#F4C430", opacity: isSubmitting ? 0.6 : 1 }}
        >
          {isSubmitting ? "Creating..." : "Create account"}
        </button>
      </div>
    </div>
  );
}

function Input({
  label, value, onChange, type = "text", mono,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; mono?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-[12.5px] font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md px-3 py-2 text-[13px] outline-none"
        style={{ border: `1px solid ${BORDER}`, fontFamily: mono ? "var(--font-mono)" : undefined }}
      />
    </div>
  );
}