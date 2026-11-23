import { useRef, useState } from "react";
import {
  AlertTriangle, Check, CheckCircle2, Circle, Eye, EyeOff, IdCard, KeyRound, Laptop, Loader2, Lock, Mail, Moon,
  Palette, RotateCcw, ShieldCheck, Sun, UserRound,
} from "lucide-react";
import { useAuth, ROLE_LABELS } from "@/contexts/AuthContext";
import { changePassword } from "@/api/auth";
import { ApiError } from "@/api/client";
import { ACCENTS, DEFAULT_THEME, useThemePreference, type ThemeAccent, type ThemeMode } from "@/utils/Theme";
import "./settings.css";

function initialsFor(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="st-page">
      <header className="st-heading">
        <p className="st-eyebrow">ACCOUNT / SETTINGS</p>
        <h1>Settings</h1>
        <p>Your account details, password, and how LabTrack looks on this device.</p>
      </header>

      <div className="st-stack">
        {/* Profile */}
        <section className="st-card" aria-labelledby="st-profile">
          <div className="st-card-head">
            <h2 id="st-profile"><UserRound size={15} /> Profile</h2>
            <span className="st-tag"><Lock size={11} /> Read-only</span>
          </div>
          <div className="st-profile">
            <span className="st-avatar" aria-hidden="true">{user ? initialsFor(user.fullName) : "?"}</span>
            <div>
              <strong>{user?.fullName ?? "—"}</strong>
              {user && <span className="st-role">{ROLE_LABELS[user.role]}</span>}
            </div>
          </div>
          <dl className="st-details">
            <div><dt><IdCard size={13} /> School ID</dt><dd className="st-mono">{user?.schoolId ?? "—"}</dd></div>
            <div><dt><Mail size={13} /> Email</dt><dd>{user?.email ?? "—"}</dd></div>
            <div><dt><ShieldCheck size={13} /> Role</dt><dd>{user ? ROLE_LABELS[user.role] : "—"}</dd></div>
          </dl>
          <p className="st-note">These details come from your account. Ask an administrator if something needs to change.</p>
        </section>

        <ChangePasswordCard />
        <AppearanceCard />
      </div>
    </div>
  );
}

/* ── Password ── */
function strengthOf(pw: string) {
  if (!pw) return null;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length < 6) return { label: "Too short", level: 0 };
  return score <= 1 ? { label: "Weak", level: 1 } : score <= 3 ? { label: "Fair", level: 2 } : { label: "Strong", level: 3 };
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);

  const longEnough = newPassword.length >= 6;
  const matches = confirmPassword !== "" && newPassword === confirmPassword;
  const strength = strengthOf(newPassword);

  // Same rules and order as before: match first, then at least 6 characters; the server has the final say.
  const submit = async () => {
    if (submitting.current) return;
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmPassword) { setError("New passwords don't match."); return; }
    if (newPassword.length < 6) { setError("New password must be at least 6 characters."); return; }
    submitting.current = true;
    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change password.");
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  const type = show ? "text" : "password";

  return (
    <section className="st-card" aria-labelledby="st-password">
      <div className="st-card-head">
        <h2 id="st-password"><KeyRound size={15} /> Change password</h2>
        <button type="button" className="st-link" onClick={() => setShow((v) => !v)} aria-pressed={show}>
          {show ? <EyeOff size={13} /> : <Eye size={13} />} {show ? "Hide" : "Show"} passwords
        </button>
      </div>

      <form className="st-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label className="st-field st-span-2">
          <span>Current password</span>
          <input type={type} value={currentPassword} onChange={(e) => { setCurrentPassword(e.target.value); setSuccess(false); }} autoComplete="current-password" />
        </label>
        <label className="st-field">
          <span>New password</span>
          <input type={type} value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setSuccess(false); }} autoComplete="new-password" />
          {strength && (
            <span className={`st-strength level-${strength.level}`} aria-live="polite">
              <i><b /><b /><b /></i> {strength.label}
            </span>
          )}
        </label>
        <label className="st-field">
          <span>Confirm new password</span>
          <input type={type} value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setSuccess(false); }} autoComplete="new-password"
            className={confirmPassword && !matches ? "is-invalid" : ""} aria-invalid={!!confirmPassword && !matches} />
        </label>

        <ul className="st-checks st-span-2" aria-label="Password requirements">
          <li className={longEnough ? "is-ok" : ""}>{longEnough ? <CheckCircle2 size={13} /> : <Circle size={13} />} At least 6 characters</li>
          <li className={matches ? "is-ok" : ""}>{matches ? <CheckCircle2 size={13} /> : <Circle size={13} />} Both new passwords match</li>
        </ul>

        {error && <p className="st-alert is-error st-span-2" role="alert"><AlertTriangle size={14} /> {error}</p>}
        {success && <p className="st-alert is-ok st-span-2" role="status"><CheckCircle2 size={14} /> Password changed successfully.</p>}

        <div className="st-actions st-span-2">
          <button type="submit" className="st-btn is-primary" disabled={isSubmitting || !currentPassword || !newPassword}>
            {isSubmitting ? <Loader2 size={14} className="st-spin" /> : <KeyRound size={14} />} {isSubmitting ? "Updating…" : "Update password"}
          </button>
        </div>
      </form>
    </section>
  );
}

/* ── Appearance ── */
const MODE_OPTIONS: { value: ThemeMode; label: string; hint: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", hint: "Warm neutral (default)", icon: Sun },
  { value: "dark", label: "Dark", hint: "Low-light rooms", icon: Moon },
  { value: "system", label: "System", hint: "Follow this device", icon: Laptop },
];

function AppearanceCard() {
  const { preference, resolvedMode, persisted, update, reset } = useThemePreference();
  const isDefault = preference.mode === DEFAULT_THEME.mode && preference.accent === DEFAULT_THEME.accent;

  return (
    <section className="st-card" aria-labelledby="st-appearance">
      <div className="st-card-head">
        <h2 id="st-appearance"><Palette size={15} /> Appearance</h2>
        <button type="button" className="st-link" onClick={reset} disabled={isDefault}><RotateCcw size={13} /> Reset to default</button>
      </div>

      <div className="st-group">
        <p className="st-group-label" id="st-mode-label">Theme</p>
        <div className="st-modes" role="radiogroup" aria-labelledby="st-mode-label">
          {MODE_OPTIONS.map(({ value, label, hint, icon: Icon }) => (
            <button key={value} type="button" role="radio" aria-checked={preference.mode === value}
              className={`st-mode ${preference.mode === value ? "is-on" : ""}`} onClick={() => update({ mode: value })}>
              <span className={`st-mini is-${value}`} aria-hidden="true">
                <span className="st-mini-side" /><span className="st-mini-main"><i /><i /><b /></span>
              </span>
              <span className="st-mode-text">
                <strong><Icon size={13} /> {label}</strong>
                <small>{value === "system" ? `${hint} (now ${resolvedMode})` : hint}</small>
              </span>
              {preference.mode === value && <span className="st-check"><Check size={12} /></span>}
            </button>
          ))}
        </div>
      </div>

      <div className="st-group">
        <p className="st-group-label" id="st-accent-label">Accent colour</p>
        <div className="st-accents" role="radiogroup" aria-labelledby="st-accent-label">
          {(Object.keys(ACCENTS) as ThemeAccent[]).map((key) => {
            const a = ACCENTS[key];
            const on = preference.accent === key;
            return (
              <button key={key} type="button" role="radio" aria-checked={on} className={`st-accent ${on ? "is-on" : ""}`}
                onClick={() => update({ accent: key })} title={a.label}>
                <span className="st-swatch" style={{ background: a.accent, color: a.contrast }}>{on && <Check size={13} />}</span>
                <span>{a.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="st-preview" aria-label="Preview">
        <span className="st-preview-chip">Preview</span>
        <button type="button" className="st-btn is-primary" tabIndex={-1}>Primary action</button>
        <span className="st-preview-tag">Selected</span>
        <span className="st-preview-link">Text link</span>
      </div>

      <p className="st-note">
        Saved on this device{persisted ? "" : " for this visit only (this browser blocks saving)"}. This page already uses your choice;
        other pages switch over to it as they're updated, so some still show the standard LabTrack colours for now.
      </p>
    </section>
  );
}