import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Download, FileSpreadsheet, Loader2, RotateCcw, Upload } from "lucide-react";
import { getWeeklyTemplate, resetWeeklyTemplate, uploadWeeklyTemplate } from "@/api/reportTemplates";

export function WeeklyTemplateSettings({ disabled, onBusyChange }: { disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [uploaded, setUploaded] = useState<boolean | null>(null); const [loading, setLoading] = useState(true); const [stateError, setStateError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"download" | "upload" | "reset" | null>(null); const lock = useRef(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const fileInput = useRef<HTMLInputElement>(null);
  async function refresh() { setLoading(true); setStateError(null); try { const t = await getWeeklyTemplate(); setUploaded(t.uploaded); } catch (e) { setUploaded(null); setStateError(e instanceof Error ? e.message : "Could not load template status."); } finally { setLoading(false); } }
  useEffect(() => { let cancelled = false; getWeeklyTemplate().then(t => { if (!cancelled) setUploaded(t.uploaded); }).catch(e => { if (!cancelled) setStateError(e instanceof Error ? e.message : "Could not load template status."); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, []);
  function start(kind: "download" | "upload" | "reset") { if (disabled || lock.current) return false; lock.current = true; setBusy(kind); onBusyChange(true); setMsg(null); return true; }
  function finish() { lock.current = false; setBusy(null); onBusyChange(false); }
  async function download() {
    if (!start("download")) return;
    try { const t = await getWeeklyTemplate(); const url = URL.createObjectURL(new Blob([t.data])); const a = document.createElement("a"); a.href = url; a.download = t.uploaded ? "weekly-report-template.xlsx" : "labmo-weekly-template.xlsx"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not download the template." }); } finally { finish(); }
  }
  async function upload(file: File) {
    if (!start("upload")) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("The file is larger than 5 MB.");
      const [{ default: ExcelJS }, { checkTemplate }] = await Promise.all([import("exceljs"), import("@/utils/weeklyWorkbook")]);
      const problems = await checkTemplate(ExcelJS, await file.arrayBuffer());
      if (problems.length > 0) throw new Error(`This template can't be used: ${problems.join(" ")}`);
      await uploadWeeklyTemplate(file); setMsg({ ok: true, text: "Template saved. Downloads now use it." }); await refresh();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not upload the template." }); }
    finally { finish(); if (fileInput.current) fileInput.current.value = ""; }
  }
  async function reset() { if (!start("reset")) return; try { await resetWeeklyTemplate(); setMsg({ ok: true, text: "Back to the default template." }); await refresh(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not reset the template." }); } finally { finish(); } }
  return <details className="wr-template-settings no-print">
    <summary>
      <span>
        <FileSpreadsheet size={16} />
        <strong>Excel Template Settings</strong>
      </span>
      <span className="wr-template-source">{busy === "upload" ? "Checking template…" : busy === "reset" ? "Restoring default…" : loading ? "Loading template…" : uploaded === null ? "Template status unavailable" : uploaded ? "Office-uploaded template" : "Default template"}<ChevronDown size={14} />
      </span>
    </summary>
    <div className="wr-template-body">
      <div>
        <p>Workbook downloads use the current Excel template. The official on-screen and printed report format stays the same.</p>
        <span>.xlsx workbook · up to 5 MB · existing sheet and placeholder checks apply</span>
      </div>
      <div className="wr-template-actions">
        <button type="button" className="wr-secondary" disabled={disabled || !!busy} onClick={() => void download()}>{busy === "download" ? <Loader2 size={14} className="wr-spin" /> : <Download size={14} />}Download Template</button>
        <button type="button" className="wr-secondary" disabled={disabled || !!busy} onClick={() => fileInput.current?.click()}>{busy === "upload" ? <Loader2 size={14} className="wr-spin" /> : <Upload size={14} />}Upload Template</button>{uploaded && <button type="button" className="wr-template-reset" disabled={disabled || !!busy} onClick={() => void reset()}>
          <RotateCcw size={13} />Use the default</button>}<input ref={fileInput} type="file" accept=".xlsx" aria-label="Upload weekly Excel template" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); }} />
      </div>{stateError && <div className="wr-notice is-warning" role="alert">
        <AlertTriangle size={14} />
        <span>{stateError}</span>
        <button disabled={disabled || !!busy} onClick={() => void refresh()}>Retry template status</button>
      </div>}{msg && <div className={`wr-notice ${msg.ok ? "is-success" : "is-error"}`} role={msg.ok ? "status" : "alert"}>{msg.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}<span>{msg.text}</span>
      </div>}</div>
  </details>;
}
