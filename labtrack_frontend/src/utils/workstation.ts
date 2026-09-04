/**
 * Each lab PC's kiosk shortcut should launch the browser with a URL like:
 *   https://labtrack.yourdomain/student-login?workstationId=12
 * so the frontend always knows which physical workstation it's running on, without
 * needing a separate desktop agent. This reads that param, and persists it to
 * localStorage so subsequent navigations on the same PC (e.g. after logout) don't
 * need the query param repeated.
 */
const WORKSTATION_STORAGE_KEY = "labtrack_workstation_id";

export function resolveWorkstationId(): number | null {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("workstationId");
  if (fromUrl) {
    const parsed = Number(fromUrl);
    if (!Number.isNaN(parsed)) {
      localStorage.setItem(WORKSTATION_STORAGE_KEY, String(parsed));
      return parsed;
    }
  }

  const stored = localStorage.getItem(WORKSTATION_STORAGE_KEY);
  return stored ? Number(stored) : null;
}