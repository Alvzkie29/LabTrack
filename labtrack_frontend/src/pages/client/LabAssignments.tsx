import { useState } from "react";
import { UserRound } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { ROOMS, pcsForRoom } from "@/utils/mock-data";
import { LAB_ASSIGNMENTS, assistants, userById, type LabAssignment } from "@/utils/mock-data-extended";

export function LabAssignmentsPage() {
  const { role } = useRole();
  const [assignments, setAssignments] = useState<LabAssignment[]>(LAB_ASSIGNMENTS);
  const allowed = role === "Administrator" || role === "Laboratory Custodian";

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center" style={{ color: "#57606a" }}>
        <div className="mb-3 text-[13px] font-mono uppercase tracking-wider">Restricted</div>
        <p className="max-w-sm text-[13px]">This page is only available to the Administrator role.</p>
      </div>
    );
  }

  function assign(roomId: string, assistantId: string) {
    setAssignments((prev) =>
      prev.map((a) => (a.roomId === roomId ? { ...a, assistantId: assistantId || undefined } : a)),
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "#57606a" }}>
          Laboratories · {ROOMS.length}
        </div>
        <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Lab Assignments</h1>
        <p className="mt-0.5 text-[13px]" style={{ color: "#57606a" }}>
          Assign one Laboratory Assistant per computer laboratory. An assistant's Dashboard and monitoring pages are
          automatically scoped to only the room(s) assigned to them here.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {ROOMS.map((room) => {
          const current = assignments.find((a) => a.roomId === room.id);
          const currentUser = userById(current?.assistantId);
          const pcCount = pcsForRoom(room.id).length;
          return (
            <div key={room.id} style={{ background: "#ffffff", border: "1px solid #d1d9e0", borderRadius: 6, padding: 16 }}>
              <div className="flex items-center justify-between">
                <div className="font-mono text-[13px]" style={{ color: "#0d1117", fontWeight: 700 }}>{room.name}</div>
                <span className="font-mono text-[10.5px]" style={{ color: "#57606a" }}>{pcCount} PCs</span>
              </div>

              <div className="mt-3 flex items-center gap-2.5 rounded-md p-2.5" style={{ background: "#f6f8fa", border: "1px solid #e1e4e8" }}>
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full"
                  style={{ background: currentUser ? "#800000" : "#e1e4e8", color: currentUser ? "#F4C430" : "#57606a" }}
                >
                  <UserRound className="size-4" />
                </span>
                <div className="min-w-0">
                  {currentUser ? (
                    <>
                      <div className="truncate text-[12.5px]" style={{ color: "#0d1117", fontWeight: 600 }}>{currentUser.name}</div>
                      <div className="truncate font-mono text-[10.5px]" style={{ color: "#57606a" }}>{currentUser.email}</div>
                    </>
                  ) : (
                    <div className="text-[12.5px]" style={{ color: "#57606a" }}>Unassigned — needs a Lab Assistant</div>
                  )}
                </div>
              </div>

              <label className="mt-3 block">
                <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: "#57606a" }}>Assign assistant</span>
                <select
                  className="mt-1 w-full rounded-md px-2.5 py-1.5 text-[12.5px] outline-none"
                  style={{ border: "1px solid #d1d9e0", background: "#ffffff", color: "#0d1117" }}
                  value={current?.assistantId ?? ""}
                  onChange={(e) => assign(room.id, e.target.value)}
                >
                  <option value="">— Unassigned —</option>
                  {assistants().map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}