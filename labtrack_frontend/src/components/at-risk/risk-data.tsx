import type { Compliance } from "@/api/courseSections";

export const riskStatusLabels = { Compliant: "Compliant", AtRisk: "At Risk", NonCompliant: "Non-Compliant" };
export function availableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
export const displayNumber = (value: unknown) => {
  const number = availableNumber(value);
  return number === null ? "\u2014" : new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(number);
};
export function verifiedProgress(compliance: Compliance | null | undefined) {
  const confirmed = availableNumber(compliance?.confirmedHoursTotal);
  const required = availableNumber(compliance?.requiredHours);
  const rawPercent = confirmed !== null && required !== null && required > 0 ? confirmed / required * 100 : null;
  const percent = rawPercent !== null && Number.isFinite(rawPercent) ? rawPercent : null;
  return { confirmed, required, percent, remaining: confirmed !== null && required !== null ? Math.max(0, required - confirmed) : null };
}
export function latestRecommendation<T extends { generatedAt: string; recommendationId: number }>(rows: readonly T[]) {
  return rows.reduce<T | undefined>((latest, row) => {
    if (!latest) return row;
    const left = Date.parse(latest.generatedAt), right = Date.parse(row.generatedAt);
    if (Number.isFinite(right) && (!Number.isFinite(left) || right > left)) return row;
    if (right === left && row.recommendationId > latest.recommendationId) return row;
    return latest;
  }, undefined);
}
export function recommendationDate(value: string | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Date unavailable";
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`));
}
export function RiskStatus({ status }: { status: Compliance["status"] | undefined }) {
  return <span className={`risk-status risk-status-${status ?? "unknown"}`}>
    <span aria-hidden="true" />{status ? riskStatusLabels[status] ?? "Status unavailable" : "Not assessed"}</span>;
}
export function RiskProgress({ compliance }: { compliance: Compliance | null }) {
  const value = verifiedProgress(compliance);
  const label = value.required === 0 ? "No required hours" : value.percent === null ? "Progress unavailable" : `${Number(value.percent.toFixed(1))}% complete`;
  return <div className="risk-progress">
    <div className="risk-progress-track" role="meter" aria-label="Verified laboratory-hour progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value.percent === null ? undefined : Math.min(100, value.percent)} aria-valuetext={label}>
      <span style={{ width: `${value.percent === null ? 0 : Math.min(100, value.percent)}%` }} />
    </div>
    <span>{label}</span>
  </div>;
}
