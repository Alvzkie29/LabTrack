import { useEffect, useState } from "react";
import { CheckCircle2, Mail, MailWarning, Send } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { getReminders, sendRemindersNow, sendTestReminder, setAutoSend, type RemindersPreview } from "@/api/reminders";
import { ApiError } from "@/api/client";

const MAROON = "#800000";
const GOLD = "#F4C430";
const MUTED = "#57606a";
const BORDER = "#d1d9e0";

const h = (n: number) => String(Number(n.toFixed(2)));
const day = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const hourLabel = (hr: number) => `${((hr + 11) % 12) + 1}:00 ${hr >= 12 ? "PM" : "AM"}`;

export function EmailRemindersPage() {
  const { role } = useRole();
  const allowed = role === "Custodian" || role === "Administrator";

  const [data, setData] = useState<RemindersPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    getReminders().then(setData).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the reminders.")).finally(() => setLoading(false));
  useEffect(() => { if (allowed) load(); }, [allowed]);

  if (!allowed) {
    return <div className="py-24 text-center text-[13px]" style={{ color: MUTED }}>This page is only available to the Custodian and Administrator roles.</div>;
  }

  const run = async (work: () => Promise<string>) => {
    setBusy(true); setMessage(null); setError(null);
    try {
      setMessage(await work());
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const test = () => run(async () => (await sendTestReminder()).message);
  const sendNow = () => {
    if (!window.confirm("Send this week's reminders now to the faculty listed who haven't had one yet?")) return;
    run(async () => {
      const r = await sendRemindersNow();
      return [
        `${r.sent} sent`,
        r.failed ? `${r.failed} failed (tried again on the next run)` : "",
        r.noEmail ? `${r.noEmail} skipped: no faculty email` : "",
        r.alreadySent ? `${r.alreadySent} already sent this week` : "",
      ].filter(Boolean).join(" · ");
    });
  };

  const toggleAuto = () => {
    const on = !data?.setup.autoSend;
    if (!on && !window.confirm("Stop the automatic weekly emails? Faculty won't get reminders until they're turned back on.")) return;
    run(async () => {
      await setAutoSend(on);
      return on ? "Automatic weekly emails are on." : "Automatic weekly emails are off. Send now still works.";
    });
  };

  const setup = data?.setup;
  const classes = data?.classes ?? [];
  const pending = classes.filter((c) => !c.sentAt && c.email).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>Reporting</div>
          <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Email Reminders</h1>
          <p className="mt-0.5 max-w-2xl text-[13px]" style={{ color: MUTED }}>
            Once a week, faculty whose classes have missed lab meetings get an email with the dates, the hours to make up and
            the suggested make-up classes. Every reason counts as missed (including Fieldwork, Research Subject/OJT and On Leave);
            make-up classes that were held count against it. Virtual lab hours are recorded at the end of the term, so the email says they are not included yet.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={test} disabled={busy || !setup?.configured}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium"
            style={{ border: `1px solid ${BORDER}`, background: "#fff", opacity: busy || !setup?.configured ? 0.6 : 1 }}>
            <Mail className="size-3.5" /> Send me a test
          </button>
          <button type="button" onClick={sendNow} disabled={busy || !setup?.configured || pending === 0}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium"
            style={{ background: MAROON, color: GOLD, opacity: busy || !setup?.configured || pending === 0 ? 0.6 : 1 }}>
            <Send className="size-3.5" /> {busy ? "Sending..." : `Send now (${pending})`}
          </button>
        </div>
      </div>

      {setup && (
        <div className="rounded-md px-4 py-3 text-[12.5px]" style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
          {!setup.configured ? (
            <span style={{ color: "#b42318" }}>
              The sending Gmail account isn't set up yet. Add it under "Email" in the API's appsettings.json, then restart the API.
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" role="switch" aria-checked={setup.autoSend} onClick={toggleAuto} disabled={busy}
                className="inline-flex items-center gap-2 font-medium">
                <span className="relative inline-block h-5 w-9 rounded-full transition-colors"
                  style={{ background: setup.autoSend ? MAROON : "#d0d7de" }}>
                  <span className="absolute top-0.5 size-4 rounded-full bg-white shadow transition-all"
                    style={{ left: setup.autoSend ? 18 : 2 }} />
                </span>
                Automatic weekly emails: <span style={{ color: setup.autoSend ? "#1a7f37" : "#9a6700" }}>{setup.autoSend ? "On" : "Off"}</span>
              </button>
              <span style={{ color: MUTED }}>
                {setup.autoSend
                  ? <>Sent every <b>{setup.sendDay}</b> from <b>{hourLabel(setup.sendHour)}</b></>
                  : <>Nothing is sent by itself; Send now still works</>}
                {" "}from <b>{setup.from}</b>
                {setup.countMissedFrom && <> · missed meetings counted from <b>{day(setup.countMissedFrom)}</b></>}
              </span>
            </div>
          )}
        </div>
      )}

      {message && <div className="text-[12.5px]" style={{ color: "#1a7f37" }}>{message}</div>}
      {error && <div className="text-[12.5px]" style={{ color: "#b42318" }}>{error}</div>}

      <div className="overflow-x-auto" style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <div className="px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider" style={{ background: "#f6f8fa", color: MUTED, borderBottom: "1px solid #e1e4e8" }}>
          This week{data ? ` (from ${day(data.weekStart)})` : ""} · {classes.length} class{classes.length === 1 ? "" : "es"} with hours to make up
        </div>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr style={{ color: MUTED }}>
              {["Class", "Faculty", "Confirmed", "Missed meetings", "To make up", "Suggested", "This week"].map((t, i) => (
                <th key={t} className={`py-2 pr-3 text-left font-mono text-[10.5px] uppercase tracking-wider ${i === 0 ? "pl-4" : ""}`}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.sectionId} style={{ borderTop: "1px solid #e1e4e8" }}>
                <td className="py-2.5 pl-4 pr-3 align-top">
                  <span className="font-mono font-semibold" style={{ color: MAROON }}>{c.sectionCode}</span>
                  <div><span className="font-mono text-[11.5px]">{c.subjectCode}</span> {c.subjectTitle}</div>
                </td>
                <td className="py-2.5 pr-3 align-top">
                  {c.faculty ?? <span style={{ color: MUTED }}>No faculty</span>}
                  <div className="text-[11.5px]" style={{ color: c.email ? MUTED : "#b42318" }}>{c.email ?? "No email on record"}</div>
                </td>
                <td className="whitespace-nowrap py-2.5 pr-3 align-top font-mono">{h(c.confirmedHours)}/{h(c.requiredHours)}h</td>
                <td className="py-2.5 pr-3 align-top">
                  {c.missed.map((m) => (
                    <div key={m.date} className="text-[12px]">{day(m.date)} <span style={{ color: MUTED }}>({m.reason})</span></div>
                  ))}
                </td>
                <td className="whitespace-nowrap py-2.5 pr-3 align-top font-mono">
                  {h(c.outstandingHours)}h
                  {c.madeUpHours > 0 && <div className="text-[11px]" style={{ color: MUTED }}>{h(c.madeUpHours)}h made up</div>}
                </td>
                <td className="whitespace-nowrap py-2.5 pr-3 align-top">{c.suggestedMakeUps} × {h(c.sessionHours)}h</td>
                <td className="whitespace-nowrap py-2.5 pr-4 align-top">
                  {c.sentAt ? (
                    <span className="inline-flex items-center gap-1 text-[12px]" style={{ color: "#1a7f37" }}>
                      <CheckCircle2 className="size-3.5" /> Sent {new Date(c.sentAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  ) : c.error ? (
                    <span className="inline-flex items-center gap-1 text-[12px]" style={{ color: "#b42318" }} title={c.error}>
                      <MailWarning className="size-3.5" /> Failed
                    </span>
                  ) : (
                    <span className="text-[12px]" style={{ color: MUTED }}>{c.email ? "Not sent yet" : "Can't send"}</span>
                  )}
                </td>
              </tr>
            ))}
            {classes.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-[13px]" style={{ color: MUTED }}>
                  {loading ? "Loading..." : "No class has missed lab meetings to make up."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
