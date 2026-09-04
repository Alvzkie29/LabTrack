import { useEffect, useRef, useState } from "react";
import { ensureConnected } from "@/api/signalr";

const HEARTBEAT_INTERVAL_MS = 15_000; // matches the "every 15-30s" cadence assumed by the backend scoring service

export type PresenceUpdate = {
  workstationId: number;
  seatLabel: string;
  status: string;
  lastHeartbeat: string;
  compositeScore: number;
  presenceStatus: string;
};

/**
 * While mounted with a valid attendanceId, listens for real keystroke/mouse activity in
 * this browser tab and sends a heartbeat to PresenceHub every HEARTBEAT_INTERVAL_MS with
 * counts since the last tick — this is the actual telemetry source for the composite
 * activity score / idle detection on the backend. Counting resets after every send.
 */
export function useHeartbeat(attendanceId: number | null) {
  const [latestUpdate, setLatestUpdate] = useState<PresenceUpdate | null>(null);
  const keystrokeCount = useRef(0);
  const mouseEventCount = useRef(0);
  const lastInputAt = useRef(Date.now());

  useEffect(() => {
    if (!attendanceId) return;

    const onKeydown = () => {
      keystrokeCount.current += 1;
      lastInputAt.current = Date.now();
    };
    const onMouseActivity = () => {
      mouseEventCount.current += 1;
      lastInputAt.current = Date.now();
    };

    window.addEventListener("keydown", onKeydown);
    window.addEventListener("mousemove", onMouseActivity);
    window.addEventListener("mousedown", onMouseActivity);

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    ensureConnected().then((connection) => {
      if (cancelled) return;

      connection.on("WorkstationStatusChanged", (update: PresenceUpdate) => {
        setLatestUpdate(update);
      });

      intervalId = setInterval(() => {
        const idleSeconds = Math.floor((Date.now() - lastInputAt.current) / 1000);

        connection.invoke("SendHeartbeat", {
          attendanceId,
          keystrokeCount: keystrokeCount.current,
          mouseEventCount: mouseEventCount.current,
          idleSeconds,
        }).catch((err) => console.error("Heartbeat failed:", err));

        // Reset counts — the backend accumulates running totals server-side.
        keystrokeCount.current = 0;
        mouseEventCount.current = 0;
      }, HEARTBEAT_INTERVAL_MS);
    });

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("mousemove", onMouseActivity);
      window.removeEventListener("mousedown", onMouseActivity);
      if (intervalId) clearInterval(intervalId);
    };
  }, [attendanceId]);

  return { latestUpdate };
}