import { getCourseSections } from "./courseSections";
import { getFlaggedSessions } from "./attendance";
import type { Role } from "./auth";

export interface QuickAlert {
  id: string;
  message: string;
  tone: "warning" | "info";
  href: string;
}

/**
 * Real, derived "quick info" alerts rather than a stored notifications system — computed
 * live from data that already exists (compliance status, flagged sessions, unassigned
 * instructors). No new backend table or persisted read/unread state; this is a summary
 * view, refetched whenever Settings is opened.
 */
export async function getQuickAlerts(role: Role): Promise<QuickAlert[]> {
  const alerts: QuickAlert[] = [];

  if (role === "Custodian" || role === "Administrator" || role === "LabAssistant") {
    const flagged = await getFlaggedSessions().catch(() => []);
    if (flagged.length > 0) {
      alerts.push({
        id: "flagged",
        message: `${flagged.length} session${flagged.length === 1 ? "" : "s"} flagged for review`,
        tone: "warning",
        href: "/flagged-session",
      });
    }
  }

  if (role === "Custodian" || role === "Administrator") {
    const sections = await getCourseSections().catch(() => []);

    const atRisk = sections.filter((s) => s.compliance && s.compliance.status !== "Compliant");
    if (atRisk.length > 0) {
      alerts.push({
        id: "at-risk",
        message: `${atRisk.length} course section${atRisk.length === 1 ? "" : "s"} behind on CHED hours`,
        tone: "warning",
        href: "/at-risk",
      });
    }

    const unassigned = sections.filter((s) => !s.hasInstructorAssigned);
    if (unassigned.length > 0) {
      alerts.push({
        id: "unassigned",
        message: `${unassigned.length} section${unassigned.length === 1 ? "" : "s"} without an assigned instructor`,
        tone: "info",
        href: "/courses",
      });
    }
  }

  return alerts;
}