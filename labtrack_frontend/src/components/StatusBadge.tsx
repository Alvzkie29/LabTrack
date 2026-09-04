import type { ComplianceStatus, PCStatus } from "@/utils/mock-data";
import { cn } from "@/utils/utils";

// Compliance badge — grayscale border + accent intensity, no red/amber.
export function StatusBadge({ status, className }: { status: ComplianceStatus; className?: string }) {
  const map: Record<ComplianceStatus, { label: string; dot: string; text: string; border: string }> = {
    "Compliant":     { label: "Compliant",     dot: "bg-[var(--accent)]",           text: "text-[var(--accent)]",       border: "border-[var(--accent)]/40" },
    "At Risk":       { label: "At Risk",       dot: "bg-[var(--accent)]/50",        text: "text-[var(--foreground)]",   border: "border-[var(--border)]" },
    "Non-Compliant": { label: "Non-Compliant", dot: "border border-[var(--foreground)] bg-transparent", text: "text-[var(--foreground)]", border: "border-[var(--foreground)]/40" },
  };
  const s = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-white px-2 py-0.5 text-[11px] font-medium",
        s.text,
        s.border,
        className,
      )}
    >
      <span className={cn("inline-block size-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

// PC seat status dot — same three-state rule.
export function PCStatusDot({ status, size = 8 }: { status: PCStatus; size?: number }) {
  const style: React.CSSProperties = { width: size, height: size, borderRadius: 999 };
  if (status === "Active")  return <span style={{ ...style, background: "var(--accent)" }} />;
  if (status === "Idle")    return <span style={{ ...style, background: "color-mix(in oklab, var(--accent) 50%, transparent)" }} />;
  return <span style={{ ...style, background: "transparent", border: "1.5px solid var(--foreground)" }} />;
}
