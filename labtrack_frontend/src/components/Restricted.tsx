import { Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { rolesFor } from "@/contexts/RoleContext";

export function Restricted({ path, title = "Restricted" }: { path: string; title?: string }) {
  const allowed = rolesFor(path);
  return (
    <div className="mx-auto max-w-lg">
      <div
        className="flex flex-col items-center text-center"
        style={{
          background: "#ffffff",
          border: "1px solid #d1d9e0",
          borderRadius: 6,
          padding: "40px 24px",
        }}
      >
        <span
          className="flex size-11 items-center justify-center rounded-full"
          style={{ background: "#f6f8fa", border: "1px solid #d1d9e0", color: "#800000" }}
        >
          <Lock className="size-5" strokeWidth={1.75} />
        </span>
        <h1 className="mt-4" style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>
          {title}
        </h1>
        <p className="mt-1.5 text-[13px]" style={{ color: "#57606a", lineHeight: 1.55 }}>
          Your role doesn't have access to this page. This area is available to:
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {allowed.length === 0 ? (
            <span
              className="font-mono text-[11px]"
              style={{ color: "#57606a", padding: "3px 8px", background: "#f6f8fa", borderRadius: 999 }}
            >
              no roles
            </span>
          ) : (
            allowed.map((r) => (
              <span
                key={r}
                className="font-mono text-[11px]"
                style={{
                  color: "#800000",
                  padding: "3px 8px",
                  background: "#fff4f4",
                  border: "1px solid #f1d7d7",
                  borderRadius: 999,
                }}
              >
                {r}
              </span>
            ))
          )}
        </div>
        <Link
          to="/dashboard"
          className="mt-6 inline-flex items-center rounded-md px-3.5 py-1.5 text-[12.5px] font-medium"
          style={{ background: "#0d1117", color: "#ffffff" }}
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
