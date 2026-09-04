import { apiRequest, setToken } from "./client";

export type Role = "Administrator" | "Custodian" | "LabAssistant" | "Student";

export interface AuthResponse {
  token: string;
  expiresAt: string;
  userId: string;
  fullName: string;
  schoolId: string;
  email?: string | null;
  roles: Role[];
}

export interface LoginPayload {
  /** SchoolId or Email — the backend accepts either. */
  identifier: string;
  password: string;
}

export interface RegisterPayload {
  firstName: string;
  middleName?: string;
  lastName: string;
  schoolId: string;
  email: string;
  password: string;
  role: Role;
  supervisingCustodianId?: string;
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const result = await apiRequest<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: payload,
    skipAuth: true,
  });
  setToken(result.token);
  return result;
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  const result = await apiRequest<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: payload,
    skipAuth: true,
  });
  setToken(result.token);
  return result;
}

export async function fetchMe(): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/api/auth/me");
}

export function logout() {
  setToken(null);
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiRequest<{ message: string }>("/api/auth/change-password", {
    method: "POST",
    body: { currentPassword, newPassword },
  });
}