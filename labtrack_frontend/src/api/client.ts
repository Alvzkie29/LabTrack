// Base URL for the LabTrack ASP.NET Core API. Override via a .env.local file:
//   VITE_API_URL=https://localhost:7173
// (adjust the port to whatever your backend's launchSettings.json/console shows).
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "https://localhost:7173";

const TOKEN_STORAGE_KEY = "labtrack_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Skip attaching the Authorization header (only needed for login/register). */
  skipAuth?: boolean;
};

/**
 * Core request helper. Throws ApiError on any non-2xx response, so callers can
 * try/catch or let react-query surface the error.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, skipAuth = false } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!skipAuth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    // Token missing/expired/invalid — clear it so the app falls back to the login screen.
    setToken(null);
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const errorBody = await response.json();
      message = typeof errorBody === "string" ? errorBody : errorBody.title ?? errorBody.message ?? JSON.stringify(errorBody);
    } catch {
      // response had no JSON body — keep the default message
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T; // No Content

  return (await response.json()) as T;
}

export { API_BASE_URL };