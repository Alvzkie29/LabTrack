// Compatibility layer over AuthContext. Existing pages call useRole() expecting
// { role, setRole, assignedLabs, setAssignedLabs } — rather than touching all 17
// consumers at once, this derives `role` from the real authenticated user in
// AuthContext, so pages keep working unchanged while the underlying source of
// truth is now a real login instead of manually-picked state.
//
// setRole/setAssignedLabs are intentionally no-ops now (role comes from your
// account, not a picker) except where noted — see Settings.tsx's role dropdown,
// which should eventually be removed now that role-switching isn't a real thing.
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import type { Role } from "../api/auth";

export type { Role };

export const ROLES: Role[] = ["Administrator", "Custodian", "LabAssistant", "Student"];
export const STAFF_ROLES: Role[] = ["Administrator", "Custodian", "LabAssistant"];

const PERMISSIONS: Record<Role, string[]> = {
  Administrator: [
    "/dashboard", "/workstation", "/courses", "/at-risk", "/schedule",
    "/lab-assignments", "/flagged-session", "/confirm-session",
    "/attendance-report", "/users", "/settings",
  ],
  Custodian: [
    "/dashboard", "/workstation", "/courses", "/at-risk", "/schedule",
    "/lab-assignments", "/flagged-session", "/confirm-session",
    "/attendance-report", "/settings",
  ],
  LabAssistant: [
    "/dashboard", "/workstation", "/schedule", "/confirm-session",
    "/attendance-report", "/settings",
  ],
  Student: [],
};

export function canAccess(role: Role, path: string): boolean {
  const allowed = PERMISSIONS[role];
  return allowed.some((p) => path === p || path.startsWith(p + "/"));
}

export function rolesFor(path: string): Role[] {
  return (Object.keys(PERMISSIONS) as Role[]).filter((r) => canAccess(r, path));
}

type Ctx = {
  role: Role;
  /** @deprecated Role now comes from the authenticated account. Kept only so old call sites compile; does nothing. */
  setRole: (r: Role) => void;
  assignedLabs: string[];
  setAssignedLabs: (labs: string[]) => void;
};

const RoleContext = createContext<Ctx | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [assignedLabs, setAssignedLabs] = useState<string[]>(["CL2"]);

  const value = useMemo<Ctx>(
    () => ({
      role: user?.role ?? "Student",
      setRole: () => {
        console.warn("setRole is a no-op — role now comes from the authenticated account.");
      },
      assignedLabs,
      setAssignedLabs,
    }),
    [user, assignedLabs],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}