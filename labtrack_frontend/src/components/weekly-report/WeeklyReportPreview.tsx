import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, FileText, Loader2, Maximize2, Minus, Plus, RefreshCw, RotateCcw } from "lucide-react";
const PAPER_WIDTH = 1100;
export function WeeklyReportPreview({ children, ready, loading, error, empty, onRefresh, refreshing }: { children: ReactNode; ready: boolean; loading: boolean; error: boolean; empty: boolean; onRefresh: () => void; refreshing: boolean }) {
  const viewport = useRef<HTMLDivElement>(null); const paper = useRef<HTMLDivElement>(null); const [viewportWidth, setViewportWidth] = useState(0); const [paperHeight, setPaperHeight] = useState(0); const [zoom, setZoom] = useState<"fit" | number>("fit");
  useLayoutEffect(() => { const node = viewport.current; if (!node) return; const observer = new ResizeObserver(() => { setViewportWidth(node.clientWidth); if (paper.current) setPaperHeight(paper.current.offsetHeight); }); observer.observe(node); if (paper.current) observer.observe(paper.current); setViewportWidth(node.clientWidth); if (paper.current) setPaperHeight(paper.current.offsetHeight); return () => observer.disconnect(); }, [ready]);
  const fit = Math.max(.1, Math.min(1, (viewportWidth - 40) / PAPER_WIDTH)); const scale = zoom === "fit" ? fit : zoom;
  function changeZoom(amount: number) { setZoom(Math.max(.25, Math.min(2, Math.round((scale + amount) * 100) / 100))); }
  return <section className="wr-viewer" aria-label="Official weekly report preview">
    <div className="wr-preview-toolbar no-print">
      <div className={`wr-document-status ${ready && !empty ? "is-ready" : ""}`} role="status">{loading ? <Loader2 size={14} className="wr-spin" /> : error ? <AlertTriangle size={14} /> : ready && !empty ? <CheckCircle2 size={14} /> : <FileText size={14} />}<span>{loading ? "Loading report data…" : error ? "Report unavailable" : ready ? empty ? "No records found for the selected week" : "Report ready" : "Awaiting report selection"}</span>
      </div>
      <div className="wr-zoom-controls">
        <button type="button" aria-label="Zoom out report preview" disabled={!ready || scale <= .25} onClick={() => changeZoom(-.1)}>
          <Minus size={14} />
        </button>
        <output aria-label="Report preview zoom">{Math.round(scale * 100)}%</output>
        <button type="button" aria-label="Zoom in report preview" disabled={!ready || scale >= 2} onClick={() => changeZoom(.1)}>
          <Plus size={14} />
        </button>
        <span className="wr-zoom-divider" />
        <button type="button" className={zoom === "fit" ? "is-active" : ""} aria-label="Fit report to preview width" disabled={!ready} onClick={() => setZoom("fit")}>
          <Maximize2 size={14} />
          <span>Fit</span>
        </button>
        <button type="button" aria-label="Reset report preview zoom to 100 percent" disabled={!ready} onClick={() => setZoom(1)}>
          <RotateCcw size={14} />
        </button>
        <button type="button" aria-label="Refresh report preview" disabled={refreshing} onClick={onRefresh}>
          <RefreshCw size={14} className={refreshing ? "wr-spin" : ""} />
        </button>
      </div>
    </div>
    <div ref={viewport} className={`wr-preview-scroll ${!ready ? "is-empty" : ""}`} tabIndex={ready ? 0 : undefined} role="region" aria-label="Scrollable report document">
      {ready ? <div className="wr-scaled-frame" style={{ width: PAPER_WIDTH * scale, height: paperHeight * scale }}>
        <div ref={paper} className="wr-preview-paper" style={{ width: PAPER_WIDTH, transform: `scale(${scale})` }}>{children}</div>
      </div> : <div className="wr-preview-placeholder no-print">{children}</div>}
    </div>
    <div className="wr-viewer-footer no-print">
      <span>A4 · Landscape · Official laboratory report</span>
      <span>Zoom changes the preview only.</span>
    </div>
  </section>;
}

/** Mounted only on this report route, so the page dimensions do not affect other modules. */
export function WeeklyReportPrintStyles() {
return <style>{`
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  body:has(.wr-page),html:has(.wr-page),body:has(.wr-page) #root { background:#fff !important; }
  body:has(.wr-page) #root,body:has(.wr-page) #root > div,body:has(.wr-page) #root > div > div,body:has(.wr-page) main {display:block !important;height:auto !important;max-height:none !important;min-height:0 !important;overflow:visible !important;width:100% !important;margin:0 !important;padding:0 !important;position:static !important;}
  body:has(.wr-page) [data-sonner-toaster] {display:none !important;}
  .wr-page,.wr-viewer,.wr-preview-scroll,.wr-scaled-frame,.wr-preview-paper {display:block !important;width:100% !important;max-width:none !important;height:auto !important;max-height:none !important;min-height:0 !important;margin:0 !important;padding:0 !important;overflow:visible !important;border:0 !important;border-radius:0 !important;box-shadow:none !important;background:#fff !important;position:static !important;transform:none !important;}
  .wr-page .weekly-sheet {width:100% !important;max-width:none !important;margin:0 !important;padding:0 !important;box-shadow:none !important;border:0 !important;border-radius:0 !important;}
  .wr-page .weekly-sheet thead {display:table-header-group !important;}
  .wr-page .weekly-sheet table {break-inside:auto;page-break-inside:auto;}
  .wr-page .weekly-sheet tr,.wr-page .weekly-sheet > div {break-inside:avoid;page-break-inside:avoid;}
}
.wr-page .weekly-sheet,.wr-page .weekly-sheet * {-webkit-print-color-adjust:exact;print-color-adjust:exact;}
`}</style>;
}
