import type { Compliance } from "@/api/courseSections";

export type CourseStatus = Compliance["status"] | "Unassessed";
export const courseStatusLabels: Record<CourseStatus, string> = { Compliant: "Compliant", AtRisk: "At Risk", NonCompliant: "Non-Compliant", Unassessed: "Not assessed" };
export function courseProgress(compliance: Compliance | null | undefined, knownRequired?: number) {
  const confirmed = compliance && Number.isFinite(compliance.confirmedHoursTotal) ? compliance.confirmedHoursTotal : null;
  const required = compliance && Number.isFinite(compliance.requiredHours) ? compliance.requiredHours : knownRequired !== undefined && Number.isFinite(knownRequired) ? knownRequired : null;
  const percent = confirmed !== null && required !== null && required > 0 ? Math.round(Math.max(0, confirmed / required * 100) * 10) / 10 : null;
  return { confirmed, required, percent, barPercent: percent === null ? 0 : Math.min(100, percent), remaining: confirmed !== null && required !== null ? Math.max(0, required - confirmed) : null };
}
export const hoursLabel = (value: number | null) => value === null ? "—" : String(Math.round(value * 10) / 10);
export function CourseStatusBadge({ status }: { status?: Compliance["status"] | null }) {
  const key = status ?? "Unassessed";
  return <span className={`course-status course-status-${key}`}><span aria-hidden="true" />{courseStatusLabels[key]}</span>;
}
export function CourseProgress({ compliance, knownRequired, showHours = false }: { compliance?: Compliance | null; knownRequired?: number; showHours?: boolean }) {
  const value = courseProgress(compliance, knownRequired);
  const description = value.confirmed === null ? "No compliance record" : value.required === 0 ? "No required hours" : value.percent === null ? "Progress unavailable" : `${value.percent}% complete`;
  return <div className={`course-progress ${compliance ? "" : "is-unassessed"}`}>
    {showHours && <p className="course-progress-hours"><strong>{hoursLabel(value.confirmed)}</strong><span>/ {hoursLabel(value.required)} verified hours</span></p>}
    <div className="course-progress-track" role="meter" aria-label="Confirmed laboratory hours progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value.percent === null ? undefined : value.barPercent}
      aria-valuetext={value.confirmed !== null && value.required !== null ? `${value.confirmed} of ${value.required} confirmed laboratory hours; ${description}` : description}>
      <span style={{ width: `${value.barPercent}%` }} /></div><span className="course-progress-caption">{description}</span>
  </div>;
}
