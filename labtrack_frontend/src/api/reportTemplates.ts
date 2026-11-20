import { API_BASE_URL, ApiError, apiRequest, getToken } from "./client";

/** The default template, shipped with the dashboard in public/templates. */
export const DEFAULT_TEMPLATE_URL = "/templates/labmo-weekly-template.xlsx";

/**
 * The weekly report template the Custodian uploaded, or the default when none is uploaded.
 * `uploaded` says which one came back.
 */
export async function getWeeklyTemplate(): Promise<{ data: ArrayBuffer; uploaded: boolean }> {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/api/reporttemplates/weekly`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.ok) return { data: await res.arrayBuffer(), uploaded: true };
  if (res.status !== 404) throw new ApiError(res.status, "Could not load the report template.");

  const fallback = await fetch(DEFAULT_TEMPLATE_URL);
  if (!fallback.ok) throw new ApiError(fallback.status, "The default report template is missing from the dashboard.");
  return { data: await fallback.arrayBuffer(), uploaded: false };
}

export function uploadWeeklyTemplate(file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<{ message: string }>("/api/reporttemplates/weekly", { method: "PUT", body: form, keepSessionOn401: true });
}

export function resetWeeklyTemplate() {
  return apiRequest<void>("/api/reporttemplates/weekly", { method: "DELETE" });
}
