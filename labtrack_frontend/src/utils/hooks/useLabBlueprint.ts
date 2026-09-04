import { useEffect, useState } from "react";
import { ensureConnected, joinLabGroup, leaveLabGroup } from "@/api/signalr";
import { getLabBlueprint, type WorkstationBlueprintEntry } from "@/api/laboratories";

type LiveStatusUpdate = {
  workstationId: number;
  seatLabel: string;
  status: "Offline" | "Active" | "Idle";
  lastHeartbeat: string;
  compositeScore: number;
  presenceStatus: string;
};

/**
 * Loads a lab's current blueprint (initial state) then joins its SignalR group so
 * subsequent PresenceHub.SendHeartbeat broadcasts update the same workstation list
 * live, without polling. Re-runs whenever labId changes.
 */
export function useLabBlueprint(labId: number | null) {
  const [workstations, setWorkstations] = useState<WorkstationBlueprintEntry[]>([]);
  const [labName, setLabName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!labId) return;
    let cancelled = false;

    setIsLoading(true);
    getLabBlueprint(labId).then((bp) => {
      if (cancelled) return;
      setLabName(bp.name);
      setWorkstations(bp.workstations);
      setIsLoading(false);
    });

    const handler = (update: LiveStatusUpdate) => {
      setWorkstations((prev) =>
        prev.map((w) =>
          w.workstationId === update.workstationId
            ? { ...w, status: update.status, lastHeartbeat: update.lastHeartbeat }
            : w,
        ),
      );
    };

    ensureConnected().then((connection) => {
      if (cancelled) return;
      connection.on("WorkstationStatusChanged", handler);
      joinLabGroup(labId);
    });

    return () => {
      cancelled = true;
      ensureConnected().then((connection) => connection.off("WorkstationStatusChanged", handler));
      leaveLabGroup(labId);
    };
  }, [labId]);

  return { workstations, labName, isLoading };
}