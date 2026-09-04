import { apiRequest } from "./client";
import type { Role } from "./auth";

export interface UserListItem {
  id: string;
  fullName: string;
  schoolId: string;
  email: string | null;
  role: Role;
  isActive: boolean;
  lastActive: string | null;
}

export function getUsers(role?: Role) {
  const qs = role ? `?role=${role}` : "";
  return apiRequest<UserListItem[]>(`/api/users${qs}`);
}

export function updateUserStatus(id: string, isActive: boolean) {
  return apiRequest<{ id: string; isActive: boolean }>(`/api/users/${id}/status`, {
    method: "PATCH",
    body: { isActive },
  });
}

export interface CreateUserPayload {
  firstName: string;
  middleName?: string;
  lastName: string;
  schoolId: string;
  email: string;
  password: string;
  role: Role;
}

/**
 * Creates a new account as an Administrator action. Deliberately does NOT use the
 * register() helper in api/auth.ts — that helper calls setToken() on success (correct
 * for a person registering themselves), which here would silently overwrite the acting
 * Administrator's own session with the new user's token, logging the admin out.
 */
export function adminCreateUser(payload: CreateUserPayload) {
  return apiRequest<{ userId: string; fullName: string; schoolId: string }>("/api/auth/register", {
    method: "POST",
    body: payload,
  });
}