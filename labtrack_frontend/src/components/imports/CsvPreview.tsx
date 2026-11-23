import { useEffect, useState } from "react";
import { ChevronDown, Eye, Loader2 } from "lucide-react";

const SAMPLE_BYTES = 64 * 1024;
interface Preview { headers: string[]; rows: string[][]; notice: string | null }

/** A bounded, display-only sample. The original file is always uploaded unchanged. */
function readSample(text: string, truncated: boolean): Preview {
  const records: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const pushRow = () => {
    row.push(cell); cell = "";
    if (row.some((value) => value.trim())) records.push(row);
    row = [];
  };
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0;i < input.length && records.length < 4;i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      pushRow();
      if (char === "\r" && input[i + 1] === "\n") i++;
    } else cell += char;
  }
  if (records.length < 4 && !quoted && !truncated && (cell || row.length)) pushRow();
  const [headers = [], ...rows] = records;
  const notice = quoted && records.length < 4
    ? truncated ? "A quoted value continues beyond this sample." : "An unclosed quote was detected in the sample. Review the original CSV."
    : rows.some((record) => record.length !== headers.length)
      ? "Some sampled rows have a different number of columns. Review the original CSV."
      : !headers.length ? "No complete header row could be read in this sample."
        : !rows.length ? "No complete data rows were found in this sample." : null;
  return { headers, rows, notice };
}

export function CsvPreview({ file }: { file: File }) {
  const [sample, setSample] = useState<{ file: File; preview?: Preview; error?: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    file.slice(0, SAMPLE_BYTES).text().then((text) => {
      if (!cancelled) setSample({ file, preview: readSample(text, file.size > SAMPLE_BYTES) });
    }).catch(() => { if (!cancelled) setSample({ file, error: "The file could not be previewed. You can still submit it for server validation." }); });
    return () => { cancelled = true; };
  }, [file]);
  const current = sample?.file === file ? sample : null;
  const preview = current?.preview;
  const count = preview ? Math.min(12, Math.max(preview.headers.length, ...preview.rows.map((row) => row.length))) : 0;
  return <details className="imports-preview" open>
    <summary>
      <span>
        <Eye size={15} /> File preview</span>
      <span>{preview ? `${preview.rows.length} sample ${preview.rows.length === 1 ? "row" : "rows"}` : "Reading file"}<ChevronDown size={14} />
      </span>
    </summary>
    <div className="imports-preview-content">
      {!current && <p role="status">
        <Loader2 size={13} className="imports-spin" /> Reading a small sample…</p>}
      {current?.error && <p>{current.error}</p>}
      {preview && <>
        {preview.notice && <p className="imports-preview-warning">{preview.notice}</p>}
        {preview.headers.length > 0 && <div className="imports-preview-scroll" tabIndex={0} role="region" aria-label={`CSV preview of ${file.name}`}>
          <table>
            <caption className="sr-only">Detected headers and first {preview.rows.length} data rows from {file.name}</caption>
            <thead>
              <tr>{Array.from({ length: count }, (_, i) => <th key={i} scope="col">{preview.headers[i] || `Column ${i + 1}`}</th>)}</tr>
            </thead>
            <tbody>{preview.rows.map((row, index) => <tr key={index}>{Array.from({ length: count }, (_, i) => <td key={i}>{(row[i] ?? "").length > 250 ? `${row[i].slice(0, 250)}…` : row[i] ?? ""}</td>)}</tr>)}</tbody>
          </table>
        </div>}
      </>}
      <p className="imports-preview-disclaimer">Preview only: up to 3 data rows and 12 columns from the first 64 KB. The server validates the full file when you import.</p>
    </div>
  </details>;
}
