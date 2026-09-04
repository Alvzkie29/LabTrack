import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchMe, login as apiLogin, logout as apiLogout, type AuthResponse, type LoginPayload, type Role } from "../api/auth";
import { getToken } from "../api/client";

export type { Role };

export const ROLES: Role[] = ["Administrator", "Custodian", "LabAssistant", "Student"];
export const STAFF_ROLES: Role[] = ["Administrator", "Custodian", "LabAssistant"];

// Human-readable labels for display purposes — internal Role values stay backend-exact.
export const ROLE_LABELS: Record<Role, string> = {
  Administrator: "Administrator",
  Custodian: "Laboratory Custodian",
  LabAssistant: "Laboratory Assistant",
  Student: "Student",
};

// Paths a role is allowed to view inside the staff app shell.
// Students are never allowed inside the app shell — they use /student-login.
const PERMISSIONS: Record<Role, string[]> = {
  Administrator: [
    "/dashboard",
    "/workstation",
    "/courses",
    "/at-risk",
    "/schedule",
    "/lab-assignments",
    "/flagged-session",
    "/confirm-session",
    "/attendance-report",
    "/users",
    "/settings",
  ],
  Custodian: [
    "/dashboard",
    "/workstation",
    "/courses",
    "/at-risk",
    "/schedule",
    "/lab-assignments",
    "/flagged-session",
    "/confirm-session",
    "/attendance-report",
    "/settings",
  ],
  LabAssistant: [
    "/dashboard",
    "/workstation",
    "/schedule",
    "/confirm-session",
    "/attendance-report",
    "/settings",
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

type AuthUser = {
  userId: string;
  fullName: string;
  schoolId: string;
  email: string | null;
  role: Role; // primary role — LabTrack users only ever hold one role
};

type Ctx = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True while restoring a session from a stored token on first load. */
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<AuthUser>;
  logout: () => void;
};

const AuthContext = createContext<Ctx | null>(null);

function toAuthUser(res: AuthResponse): AuthUser {
  return {
    userId: res.userId,
    fullName: res.fullName,
    schoolId: res.schoolId,
    email: res.email ?? null,
    role: res.roles[0] ?? "Student",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On first load, if a token is already stored (e.g. page refresh), validate it
  // against the backend and restore the session instead of forcing a re-login.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    fetchMe()
      .then((res) => setUser(toAuthUser(res)))
      .catch(() => setUser(null)) // token expired/invalid — client.ts already cleared it
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (payload: LoginPayload) => {
    const res = await apiLogin(payload);
    const authUser = toAuthUser(res);
    setUser(authUser);
    return authUser;
  };

  const logout = () => {
    apiLogout();
    setUser(null);
  };

  const value = useMemo<Ctx>(
    () => ({ user, isAuthenticated: user !== null, isLoading, login, logout }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}