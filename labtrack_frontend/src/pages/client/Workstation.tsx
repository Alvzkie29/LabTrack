import { useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Monitor, MonitorOff, X } from "lucide-react";
import { getLaboratories, getLabWorkstations, type LaboratorySummary, type WorkstationEntry } from "@/api/laboratories";
import { getWorkstationLogins, type WorkstationLoginHistory } from "@/api/attendance";
import { ApiError } from "@/api/client";

const INK = "#0d1117";
const MUTED = "#57606a";
const BORDER = "#d1d9e0";
const MAROON = "#800000";

export function WorkstationsPage() {
  const [searchParams] = useSearchParams();
  const labFromSearch = searchParams.get("lab");

  const [labs, setLabs] = useState<LaboratorySummary[]>([]);
  const [activeLabId, setActiveLabId] = useState<number | null>(labFromSearch ? Number(labFromSearch) : null);
  const [workstations, setWorkstations] = useState<WorkstationEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    getLaboratories().then((res) => {
      setLabs(res);
      setActiveLabId((current) => current ?? res[0]?.labId ?? null);
      if (res.length === 0) setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!activeLabId) return;
    setIsLoading(true);
    setSelectedId(null); // the selected PC belongs to the lab we are leaving
    getLabWorkstations(activeLabId)
      .then(setWorkstations)
      .catch(() => setWorkstations([]))
      .finally(() => setIsLoading(false));
  }, [activeLabId]);

  const activeLab = labs.find((l) => l.labId === activeLabId);
  const sorted = useMemo(
    () => [...workstations].sort((a, b) => a.seatLabel.localeCompare(b.seatLabel, undefined, { numeric: true })),
    [workstations],
  );

  return (
    <div className="space-y-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>
          {isLoading ? "Loading..." : "Registered PCs"}
        </div>
        <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Workstations</h1>
        <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
          The PCs registered in each laboratory. Select a PC to see every student login recorded on it.
        </p>
      </div>

      <div
        className="flex flex-wrap gap-1 rounded-md p-1"
        style={{ background: "#ffffff", border: `1px solid ${BORDER}`, width: "fit-content" }}
      >
        {labs.map((l) => {
          const on = l.labId === activeLabId;
          return (
            <button
              key={l.labId}
              type="button"
              onClick={() => setActiveLabId(l.labId)}
              className="rounded-[4px] px-3 py-1 font-mono text-[12px] transition-colors"
              style={{ background: on ? "#0d1117" : "transparent", color: on ? "#ffffff" : MUTED }}
            >
              {l.name}
            </button>
          );
        })}
        {labs.length === 0 && (
          <span className="px-3 py-1 text-[12px]" style={{ color: MUTED }}>No laboratories yet.</span>
        )}
      </div>

      <div style={{ background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid #e1e4e8" }}>
          <span className="font-mono text-[12px]" style={{ color: INK }}>{activeLab?.name}</span>
          <span className="text-[12px]" style={{ color: MUTED }}>· {workstations.length} workstations</span>
        </div>

        <div className="p-6">
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
            {sorted.map((w) => {
              const Icon = w.isActive ? Monitor : MonitorOff;
              const selected = w.workstationId === selectedId;
              return (
                <button
                  key={w.workstationId}
                  type="button"
                  onClick={() => setSelectedId(selected ? null : w.workstationId)}
                  className="overflow-hidden text-left transition-shadow"
                  style={{
                    background: "#ffffff",
                    border: `1px solid ${selected ? MAROON : BORDER}`,
                    boxShadow: selected ? `0 0 0 2px #80000022` : "none",
                    borderRadius: 8,
                  }}
                >
                  <div className="px-2.5 py-1.5" style={{ background: selected ? MAROON : "#f6f8fa", borderBottom: "1px solid #e1e4e8" }}>
                    <span className="font-mono text-[10.5px] font-semibold" style={{ color: selected ? "#F4C430" : INK }}>
                      {w.seatLabel}
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-1.5 py-4" style={{ background: w.isActive ? "#fbeeee" : "#f6f8fa" }}>
                    <Icon className="size-5" style={{ color: w.isActive ? MAROON : "#8c959f" }} />
                  </div>
                  <div className="px-2.5 py-1.5 font-mono text-[9.5px]" style={{ borderTop: "1px solid #e1e4e8", color: MUTED }}>
                    {w.pcIdentifier}{w.isActive ? "" : " · inactive"}
                  </div>
                </button>
              );
            })}
          </div>
          {sorted.length === 0 && !isLoading && (
            <div className="py-10 text-center text-[13px]" style={{ color: MUTED }}>
              No workstations set up in this lab yet.
            </div>
          )}
        </div>
      </div>

      {selectedId !== null && <LoginHistory workstationId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function LoginHistory({ workstationId, onClose }: { workstationId: number; onClose: () => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<WorkstationLoginHistory | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    getWorkstationLogins(workstationId, { from: from || undefined, to: to || undefined })
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load this PC's logins."))
      .finally(() => setIsLoading(false));
  }, [workstationId, from, to]);

  const shown = data?.logins.length ?? 0;
  const total = data?.total ?? 0;

  return (
    <div style={{ background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5" style={{ borderBottom: "1px solid #e1e4e8" }}>
        <div>
          <span className="font-mono text-[12.5px] font-semibold" style={{ color: MAROON }}>
            {data?.workstation.pcIdentifier ?? "Loading..."}
          </span>
          {data && (
            <span className="ml-2 text-[12px]" style={{ color: MUTED }}>
              {data.workstation.seatLabel} · {data.workstation.lab} · {total} login{total === 1 ? "" : "s"} recorded
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From"
            className="rounded-md px-2 py-1 text-[12px] outline-none" style={{ border: `1px solid ${BORDER}` }} />
          <span className="text-[12px]" style={{ color: MUTED }}>to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To"
            className="rounded-md px-2 py-1 text-[12px] outline-none" style={{ border: `1px solid ${BORDER}` }} />
          <button type="button" onClick={onClose} aria-label="Close"
            className="rounded-md p-1.5" style={{ border: `1px solid ${BORDER}`, color: MUTED }}>
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {error && <div className="px-4 py-3 text-[12.5px]" style={{ color: "#b42318" }}>{error}</div>}

      <table className="w-full text-[12.5px]">
        <thead>
          <tr style={{ background: "#f6f8fa", color: MUTED }}>
            {["When", "Student", "School ID", "Class", "Notes"].map((h, i) => (
              <th key={h} className={`py-2 text-left font-mono text-[10.5px] uppercase tracking-wider ${i === 0 ? "pl-4" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data?.logins.map((l) => (
            <tr key={l.attendanceId} style={{ borderTop: "1px solid #e1e4e8" }}>
              <td className="whitespace-nowrap py-2 pl-4 pr-3 font-mono text-[11.5px]" style={{ color: MUTED }}>
                {new Date(l.loginTime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              </td>
              <td className="py-2 pr-3">{l.student}</td>
              <td className="py-2 pr-3 font-mono text-[11.5px]">{l.schoolId}</td>
              <td className="py-2 pr-3 font-mono text-[11.5px]">{l.section} · {l.subjectCode}</td>
              <td className="py-2 pr-4 text-[11.5px]" style={{ color: MUTED }}>{l.notes ?? "—"}</td>
            </tr>
          ))}
          {data && shown === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-[13px]" style={{ color: MUTED }}>
                No student has logged in on this PC{from || to ? " in this date range" : " yet"}.
              </td>
            </tr>
          )}
          {!data && isLoading && (
            <tr><td colSpan={5} className="py-8 text-center text-[13px]" style={{ color: MUTED }}>Loading...</td></tr>
          )}
        </tbody>
      </table>

      {shown > 0 && shown < total && (
        <div className="px-4 py-2 text-[11.5px]" style={{ borderTop: "1px solid #e1e4e8", color: MUTED }}>
          Showing the {shown} most recent of {total}. Narrow the dates to see older logins.
        </div>
      )}
    </div>
  );
}
