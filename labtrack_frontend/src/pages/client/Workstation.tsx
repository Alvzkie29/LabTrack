import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { PCStatusDot } from "@/components/StatusBadge";
import { useRole } from "@/contexts/RoleContext";
import { getLaboratories, type LaboratorySummary } from "@/api/laboratories";
import { useLabBlueprint } from "@/utils/hooks/useLabBlueprint";
import { Send, Monitor, MonitorOff, Activity } from "lucide-react";

type PCStatus = "Active" | "Idle" | "Offline";

const INK = "#0d1117";
const MUTED = "#57606a";
const BORDER = "#d1d9e0";
const MAROON = "#800000";

const TILE_TONE: Record<PCStatus, { bg: string; icon: string; ring: string; label: string }> = {
  Active: { bg: "#fbeeee", icon: MAROON, ring: "rgba(128,0,0,0.18)", label: "active" },
  Idle: { bg: "#fdf8ea", icon: "#8a6d1a", ring: "rgba(138,109,26,0.18)", label: "idle" },
  Offline: { bg: "#f6f8fa", icon: "#8c959f", ring: "transparent", label: "offline" },
};

export function WorkstationsPage() {
  const { role } = useRole();
  const [searchParams] = useSearchParams();
  const labFromSearch = searchParams.get("lab");

  const [labs, setLabs] = useState<LaboratorySummary[]>([]);
  const [activeLabId, setActiveLabId] = useState<number | null>(labFromSearch ? Number(labFromSearch) : null);

  useEffect(() => {
    getLaboratories().then((res) => {
      setLabs(res);
      if (!activeLabId && res.length > 0) setActiveLabId(res[0].labId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (labFromSearch) setActiveLabId(Number(labFromSearch));
  }, [labFromSearch]);

  const { workstations, labName, isLoading } = useLabBlueprint(activeLabId);
  const activeLab = labs.find((l) => l.labId === activeLabId);

  const counts = useMemo(
    () =>
      workstations.reduce(
        (acc, w) => {
          acc[w.status] = (acc[w.status] ?? 0) + 1;
          return acc;
        },
        { Active: 0, Idle: 0, Offline: 0 } as Record<PCStatus, number>,
      ),
    [workstations],
  );

  const sortedWorkstations = useMemo(
    () => [...workstations].sort((a, b) => a.seatLabel.localeCompare(b.seatLabel, undefined, { numeric: true })),
    [workstations],
  );

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>
            {isLoading ? "Loading..." : "Live"}
          </div>
          <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>
            Workstations
          </h1>
          <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
            Real-time seat-level view of every laboratory workstation, updated live via network heartbeat.
          </p>
        </div>

        {role === "LabAssistant" && (
          <button
            type="button"
            onClick={() => alert("Issue flagged and logged for Custodian review (prototype).")}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium"
            style={{ background: MAROON, color: "#F4C430" }}
          >
            <Send className="size-3.5" /> Flag issue
          </button>
        )}
      </div>

      <div className="flex items-center gap-4 text-[12px]">
        <Legend label="Active" n={counts.Active} kind="Active" />
        <Legend label="Idle" n={counts.Idle} kind="Idle" />
        <Legend label="Offline" n={counts.Offline} kind="Offline" />
      </div>

      {/* Lab tabs */}
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

      {/* Seating grid */}
      <div style={{ background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid #e1e4e8" }}>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px]" style={{ color: INK }}>{labName || activeLab?.name}</span>
            <span className="text-[12px]" style={{ color: MUTED }}>
              · {workstations.length} workstations
            </span>
          </div>
          <span className="font-mono text-[10.5px]" style={{ color: MUTED }}>
            heartbeat ~15s
          </span>
        </div>

        <div className="p-6">
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}
          >
            {sortedWorkstations.map((w) => (
              <PCTile
                key={w.workstationId}
                seatLabel={w.seatLabel}
                status={w.status}
                lastHeartbeat={w.lastHeartbeat}
              />
            ))}
          </div>
          {sortedWorkstations.length === 0 && !isLoading && (
            <div className="py-10 text-center text-[13px]" style={{ color: MUTED }}>
              No workstations set up in this lab yet.
            </div>
          )}
        </div>
      </div>

      <p className="text-[11.5px]" style={{ color: MUTED }}>
        Note: which course sections are scheduled in a given lab isn't tracked yet — course
        sections aren't currently linked to a specific laboratory. This view shows live seat
        status only.
      </p>
    </div>
  );
}

function PCTile({
  seatLabel,
  status,
  lastHeartbeat,
}: {
  seatLabel: string;
  status: PCStatus;
  lastHeartbeat: string | null;
}) {
  const tone = TILE_TONE[status];
  const BodyIcon = status === "Offline" ? MonitorOff : Monitor;

  const secondsAgo = lastHeartbeat ? Math.floor((Date.now() - new Date(lastHeartbeat).getTime()) / 1000) : null;

  return (
    <div className="overflow-hidden transition-colors" style={{ background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 8 }}>
      <div className="flex items-center justify-between px-2.5 py-1.5" style={{ background: "#f6f8fa", borderBottom: "1px solid #e1e4e8" }}>
        <span className="font-mono text-[10.5px] font-semibold" style={{ color: INK }}>{seatLabel}</span>
        <PCStatusDot status={status} />
      </div>

      <div className="flex flex-col items-center justify-center gap-1.5" style={{ background: tone.bg, aspectRatio: "4 / 3" }}>
        <div className="flex size-9 items-center justify-center rounded-full" style={{ boxShadow: `0 0 0 6px ${tone.ring}`, background: "#ffffff" }}>
          <BodyIcon className="size-4" style={{ color: tone.icon }} />
        </div>
        {status === "Active" && (
          <span className="flex items-center gap-1 font-mono text-[9px]" style={{ color: tone.icon }}>
            <Activity className="size-2.5" /> heartbeat
          </span>
        )}
      </div>

      <div className="flex items-center justify-between px-2.5 py-1.5" style={{ borderTop: "1px solid #e1e4e8" }}>
        <span className="font-mono text-[9.5px]" style={{ color: MUTED }}>
          {status === "Offline" ? "offline" : `${tone.label}`}
        </span>
        <span className="font-mono text-[9px]" style={{ color: "#8c959f" }}>
          {secondsAgo !== null ? `${secondsAgo}s ago` : "—"}
        </span>
      </div>
    </div>
  );
}

function Legend({ label, n, kind }: { label: string; n: number; kind: PCStatus }) {
  return (
    <div className="flex items-center gap-1.5">
      <PCStatusDot status={kind} />
      <span style={{ color: "#57606a" }}>{label}</span>
      <span className="font-mono" style={{ color: "#0d1117" }}>{n}</span>
    </div>
  );
}