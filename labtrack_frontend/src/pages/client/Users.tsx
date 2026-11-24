import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle, CircleAlert, Eye, EyeOff, Loader2, Lock, Plus, Power, RefreshCw, Search, ShieldCheck,
  UserPlus, UserRoundX, Users, X,
} from "lucide-react";
import { useRole, ROLES, type Role } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { getUsers, updateUserStatus, adminCreateUser, type UserListItem } from "@/api/users";
import { ApiError } from "@/api/client";
import { snackbar } from "@/utils/snackbar";
import "./users.css";

type StatusFilter = "all" | "active" | "disabled";

const ROLE_LABEL: Record<string, string> = {
  Administrator: "Administrator",
  Custodian: "Laboratory Custodian",
  LabAssistant: "Laboratory Assistant",
  Faculty: "Faculty",
  Student: "Student",
};
const roleLabel = (r: string) => ROLE_LABEL[r] ?? r;

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
const exactTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "No sign-in recorded";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UsersPage() {
  const { role } = useRole();
  const { user: me } = useAuth();
  const allowed = role === "Administrator";

  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [roleFilter, setRoleFilter] = useState<Role | "All">("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [confirm, setConfirm] = useState<UserListItem | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const loadUsers = () =>
    getUsers()
      .then((u) => { setUsers(u); setLoadState("ready"); })
      .catch(() => setLoadState((s) => (s === "ready" ? "ready" : "error")));

  useEffect(() => {
    if (allowed) loadUsers();
  }, [allowed]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: users.length };
    for (const r of ROLES) c[r] = 0;
    for (const u of users) c[u.role] = (c[u.role] ?? 0) + 1;
    return c;
  }, [users]);
  const activeCount = useMemo(() => users.filter((u) => u.isActive).length, [users]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) =>
      (roleFilter === "All" || u.role === roleFilter) &&
      (statusFilter === "all" || (statusFilter === "active" ? u.isActive : !u.isActive)) &&
      (!q || u.fullName.toLowerCase().includes(q) || u.schoolId.toLowerCase().includes(q)));
  }, [users, roleFilter, statusFilter, search]);

  if (!allowed) {
    return (
      <div className="ua-restricted">
        <div>Restricted</div>
        <p>User account management is only available to the Administrator role.</p>
      </div>
    );
  }

  const isSelf = (u: UserListItem) => !!me && String((me as { userId?: unknown }).userId ?? "") === String(u.id);

  /** Same call as before; success is shown only after the server confirms. */
  async function setActive(user: UserListItem, active: boolean, fromDialog: boolean) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(user.id); setDialogError(null);
    try {
      await updateUserStatus(user.id, active);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: active } : u)));
      snackbar.success(active ? `${user.fullName} can sign in again.` : `${user.fullName} is disabled. Their records are kept.`);
      setConfirm(null);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to update account status.";
      if (fromDialog) setDialogError(msg);
      else snackbar.error(msg);
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }

  const clearFilters = () => { setSearch(""); setRoleFilter("All"); setStatusFilter("all"); };
  const hasFilters = search.trim() !== "" || roleFilter !== "All" || statusFilter !== "all";

  return (
    <div className="ua-page">
      <header className="ua-heading">
        <div>
          <p className="ua-eyebrow">ADMINISTRATION / USER ACCOUNTS</p>
          <div className="ua-heading-title">
            <h1>User Accounts</h1>
            {loadState === "ready" && <span className="ua-count">{users.length} {users.length === 1 ? "account" : "accounts"} · {activeCount} active</span>}
          </div>
          <p>Create, disable, or view any account. Disabling keeps historical attendance and confirmation records intact.</p>
        </div>
        <button type="button" className="ua-btn is-primary is-lg" onClick={() => setShowCreateForm(true)}>
          <Plus size={15} className="ua-gold" /> New account
        </button>
      </header>


      <section className="ua-card" aria-label="Accounts">
        <div className="ua-toolbar">
          <label className="ua-search">
            <Search size={15} />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or school ID…" aria-label="Search accounts" />
            {search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")}><X size={13} /></button>}
          </label>
          <div className="ua-seg" role="group" aria-label="Status">
            {([["all", "All"], ["active", "Active"], ["disabled", "Disabled"]] as [StatusFilter, string][]).map(([v, l]) => (
              <button key={v} type="button" aria-pressed={statusFilter === v} className={statusFilter === v ? "is-on" : ""} onClick={() => setStatusFilter(v)}>
                {l} <span>{v === "all" ? users.length : v === "active" ? activeCount : users.length - activeCount}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="ua-roles" role="tablist" aria-label="Role">
          {(["All", ...ROLES] as const).map((r) => (
            <button key={r} type="button" role="tab" aria-selected={roleFilter === r} className={roleFilter === r ? "is-on" : ""} onClick={() => setRoleFilter(r)}>
              {r === "All" ? "All roles" : roleLabel(r)} <span>{counts[r] ?? 0}</span>
            </button>
          ))}
        </div>

        {loadState === "loading" ? (
          <div className="ua-skeleton" role="status">
            <span className="sr-only">Loading accounts</span>
            {Array.from({ length: 6 }, (_, i) => <div key={i} aria-hidden="true"><span /><span /><span /><span /></div>)}
          </div>
        ) : loadState === "error" ? (
          <div className="ua-state" role="alert">
            <CircleAlert size={26} />
            <h3>Accounts could not be loaded</h3>
            <p>This is a connection or server problem, not an empty list.</p>
            <button type="button" className="ua-btn" onClick={() => { setLoadState("loading"); loadUsers(); }}><RefreshCw size={14} /> Try again</button>
          </div>
        ) : users.length === 0 ? (
          <div className="ua-state">
            <span className="ua-state-icon"><Users size={24} /></span>
            <h3>No accounts yet</h3>
            <p>Create the first staff account to get started.</p>
            <button type="button" className="ua-btn is-primary" onClick={() => setShowCreateForm(true)}><Plus size={14} className="ua-gold" /> New account</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="ua-state">
            <Search size={24} />
            <h3>No matching accounts</h3>
            <p>Try another name, school ID, role, or status.</p>
            {hasFilters && <button type="button" className="ua-btn" onClick={clearFilters}>Clear filters</button>}
          </div>
        ) : (
          <div className="ua-table-scroll">
            <table className="ua-table">
              <caption className="sr-only">User accounts</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Role</th>
                  <th scope="col">Last active</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => {
                  const self = isSelf(u);
                  const busy = busyId === u.id;
                  return (
                    <tr key={u.id} className={u.isActive ? "" : "is-disabled"}>
                      <td data-label="Name">
                        <div className="ua-person">
                          <span className={`ua-avatar role-${u.role}`} aria-hidden="true">{initials(u.fullName)}</span>
                          <div>
                            <strong>{u.fullName}{self && <em>You</em>}</strong>
                            <small>{u.schoolId}</small>
                          </div>
                        </div>
                      </td>
                      <td data-label="Role"><span className={`ua-role role-${u.role}`}>{roleLabel(u.role)}</span></td>
                      <td data-label="Last active"><span className="ua-time" title={exactTime(u.lastActive)}>{timeAgo(u.lastActive)}</span></td>
                      <td data-label="Status">
                        <span className={`ua-status ${u.isActive ? "is-active" : "is-disabled"}`}>
                          <i /> {u.isActive ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td className="ua-actions">
                        {self ? (
                          <span className="ua-self-note" title="You can't disable the account you're signed in with"><Lock size={12} /> Signed in</span>
                        ) : u.isActive ? (
                          <button type="button" className="ua-btn is-sm is-quiet" disabled={!!busyId} onClick={() => { setDialogError(null); setConfirm(u); }}>
                            <UserRoundX size={13} /> Disable
                          </button>
                        ) : (
                          <button type="button" className="ua-btn is-sm" disabled={!!busyId} onClick={() => setActive(u, true, false)}>
                            {busy ? <Loader2 size={13} className="ua-spin" /> : <Power size={13} />} Re-enable
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {loadState === "ready" && users.length > 0 && (
          <footer className="ua-card-foot">
            <ShieldCheck size={12} /> Showing {visible.length} of {users.length}. Disabled accounts can't sign in; their attendance, confirmations and audit history stay on record.
          </footer>
        )}
      </section>

      {confirm && (
        <Dialog
          title="Disable this account?"
          icon={<UserRoundX size={18} />}
          confirmLabel="Disable account"
          busy={busyId === confirm.id}
          error={dialogError}
          onConfirm={() => setActive(confirm, false, true)}
          onCancel={() => !busyRef.current && setConfirm(null)}
        >
          <p><b>{confirm.fullName}</b> ({roleLabel(confirm.role)}, {confirm.schoolId}) won't be able to sign in until the account is re-enabled.</p>
          <p>Nothing is deleted: their attendance, session confirmations and audit history stay on record.</p>
        </Dialog>
      )}

      {showCreateForm && (
        <CreateAccountDrawer
          onClose={() => setShowCreateForm(false)}
          onCreated={(name) => {
            setShowCreateForm(false);
            snackbar.success(`Account created for ${name}.`);
            loadUsers();
          }}
        />
      )}
    </div>
  );
}

/* ── Shared modal behaviour: focus in, Escape out, Tab kept inside, focus returned ── */
function useModal(onClose: () => void, initialSelector: string) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement;
    panel.current?.querySelector<HTMLElement>(initialSelector)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab" && panel.current) {
        const items = panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])");
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return panel;
}

function Dialog({ title, icon, confirmLabel, busy, error, onConfirm, onCancel, children }: {
  title: string; icon: ReactNode; confirmLabel: string; busy: boolean; error: string | null;
  onConfirm: () => void; onCancel: () => void; children: ReactNode;
}) {
  const panel = useModal(onCancel, "[data-cancel]");
  return (
    <div className="ua-modal-root">
      <div className="ua-backdrop" onClick={onCancel} aria-hidden="true" />
      <div ref={panel} className="ua-modal" role="alertdialog" aria-modal="true" aria-labelledby="ua-modal-title">
        <span className="ua-modal-icon">{icon}</span>
        <h2 id="ua-modal-title">{title}</h2>
        <div className="ua-modal-body">{children}</div>
        {error && <p className="ua-alert is-error ua-inline" role="alert"><CircleAlert size={14} /> <span>{error}</span></p>}
        <div className="ua-modal-actions">
          <button type="button" data-cancel className="ua-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="ua-btn is-danger" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 size={14} className="ua-spin" />} {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── New account ── */
function CreateAccountDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string) => void }) {
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>("Student");
  const [pin, setPin] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const panel = useModal(() => { if (!submittingRef.current) onClose(); }, "input");

  // Client-side checks only guide the form; the server's own validation still decides.
  const problems = {
    firstName: !firstName.trim() ? "Required." : null,
    lastName: !lastName.trim() ? "Required." : null,
    schoolId: !schoolId.trim() ? "Required." : null,
    email: !email.trim() ? "Required." : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "Enter a valid email address." : null,
    password: !password ? "Required." : null,
    pin: role === "Faculty" && !/^\d{4,6}$/.test(pin) ? "Enter 4 to 6 digits." : null,
  };
  const valid = Object.values(problems).every((p) => !p);
  const show = (k: keyof typeof problems, value: string) => (touched || value !== "" ? problems[k] : null);

  const submit = async () => {
    setTouched(true);
    if (!valid || submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setIsSubmitting(true);
    try {
      await adminCreateUser({ firstName, middleName: middleName || undefined, lastName, schoolId, email, password, role, pin: role === "Faculty" ? pin : undefined });
      onCreated([firstName, lastName].filter(Boolean).join(" "));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create account.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ua-drawer-root">
      <div className="ua-backdrop" onClick={() => !submittingRef.current && onClose()} aria-hidden="true" />
      <div ref={panel} className="ua-drawer" role="dialog" aria-modal="true" aria-labelledby="ua-drawer-title">
        <header className="ua-drawer-head">
          <div>
            <p className="ua-eyebrow">New account</p>
            <h2 id="ua-drawer-title">{[firstName, lastName].filter(Boolean).join(" ") || "Create an account"}</h2>
          </div>
          <button type="button" className="ua-icon-btn" aria-label="Close" onClick={onClose} disabled={isSubmitting}><X size={17} /></button>
        </header>

        <form className="ua-drawer-body" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
          <fieldset className="ua-fieldset">
            <legend>Person</legend>
            <div className="ua-grid-2">
              <Field label="First name" value={firstName} onChange={setFirstName} error={show("firstName", firstName)} autoComplete="given-name" />
              <Field label="Last name" value={lastName} onChange={setLastName} error={show("lastName", lastName)} autoComplete="family-name" />
            </div>
            <Field label="Middle name" optional value={middleName} onChange={setMiddleName} autoComplete="additional-name" />
          </fieldset>

          <fieldset className="ua-fieldset">
            <legend>Sign-in</legend>
            <Field label="School ID" value={schoolId} onChange={setSchoolId} error={show("schoolId", schoolId)} mono />
            <Field label="Email" type="email" value={email} onChange={setEmail} error={show("email", email)} autoComplete="off" />
            <div className="ua-field">
              <span>Temporary password</span>
              <div className={`ua-pass ${show("password", password) ? "is-invalid" : ""}`}>
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-invalid={!!show("password", password)} />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {show("password", password) ? <small className="is-error">{show("password", password)}</small> : <small>Share it with the person; they can change it after signing in.</small>}
            </div>
          </fieldset>

          <fieldset className="ua-fieldset">
            <legend>Role</legend>
            <div className="ua-role-pick" role="radiogroup" aria-label="Role">
              {ROLES.map((r) => (
                <button key={r} type="button" role="radio" aria-checked={role === r} className={role === r ? "is-on" : ""} onClick={() => setRole(r)}>
                  <span className={`ua-dot role-${r}`} /> {roleLabel(r)}
                </button>
              ))}
            </div>
            {role === "Faculty" && (
              <Field label="Confirmation PIN" type="password" value={pin} onChange={(v) => setPin(v.replace(/\D/g, "").slice(0, 6))} error={show("pin", pin)} mono
                hint="4 to 6 digits. Faculty enter it on the master PC to confirm sessions." inputMode="numeric" />
            )}
          </fieldset>

          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>

        <footer className="ua-drawer-foot">
          {error && <p className="ua-alert is-error ua-inline" role="alert"><AlertTriangle size={14} /> <span>{error}</span></p>}
          <div className="ua-drawer-actions">
            <span className="ua-ready">{isSubmitting ? "Creating on the server…" : touched && !valid ? "Fix the highlighted fields." : `New ${roleLabel(role)} account`}</span>
            <button type="button" className="ua-btn" onClick={onClose} disabled={isSubmitting}>Cancel</button>
            <button type="button" className="ua-btn is-primary" onClick={() => void submit()} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 size={14} className="ua-spin" /> : <UserPlus size={14} />} {isSubmitting ? "Creating…" : "Create account"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", mono, optional, error, hint, autoComplete, inputMode }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; mono?: boolean; optional?: boolean;
  error?: string | null; hint?: string; autoComplete?: string; inputMode?: "numeric" | "text";
}) {
  return (
    <label className="ua-field">
      <span>{label}{optional && <em>optional</em>}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={`${mono ? "is-mono" : ""} ${error ? "is-invalid" : ""}`}
        aria-invalid={!!error} autoComplete={autoComplete} inputMode={inputMode} />
      {error ? <small className="is-error">{error}</small> : hint ? <small>{hint}</small> : null}
    </label>
  );
}