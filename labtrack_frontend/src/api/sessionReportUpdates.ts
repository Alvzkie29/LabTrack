import { queryClient } from "./queryClient";

const SESSION_REPORT_CHANGE_KEY = "labtrack.sessionReportsChanged";
const REPORT_FAMILIES = new Set(["weekly-report-workspace", "class-status-calendar", "dashboard-operations"]);

function invalidateSessionReports() {
  // Also invalidate each dashboard section cache before its aggregate is read again.
  void queryClient.invalidateQueries({
    predicate: query => REPORT_FAMILIES.has(String(query.queryKey[0])),
  }).catch(() => { /* The report page exposes any read failure and its retry action. */ });
}

/** Call only after the API has successfully saved a confirmation. */
export function notifySessionReportsChanged() {
  invalidateSessionReports();
  try { localStorage.setItem(SESSION_REPORT_CHANGE_KEY, `${Date.now()}/${Math.random()}`); }
  catch { /* Cache invalidation still works when browser storage is unavailable. */ }
}

/** Refresh an open report when another tab confirms a session. */
export function listenForSessionReportChanges() {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_REPORT_CHANGE_KEY && event.newValue) invalidateSessionReports();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
