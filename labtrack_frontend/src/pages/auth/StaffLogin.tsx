import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/api/client";
import { ArrowRight } from "lucide-react";

const MAROON = "#800000";

export function StaffLoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState(""); // School ID or email
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const user = await login({ identifier, password });
      if (user.role === "Student") {
        // Students shouldn't land in the staff shell even if they use this form.
        setError("This account is a Student account. Please use Student check-in instead.");
        return;
      }
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full" style={{ background: "#f6f8fa" }}>
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-4 py-10">
        <div
          className="w-full"
          style={{ background: "#ffffff", border: "1px solid #d1d9e0", borderRadius: 8, padding: 28 }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex size-8 items-center justify-center rounded-md"
              style={{ background: MAROON, color: "#F4C430", fontWeight: 800, fontSize: 13 }}
            >
              LT
            </div>
            <div className="leading-tight">
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3, color: "#0d1117" }}>LabTrack</div>
              <div style={{ fontSize: 10.5, color: "#57606a", fontFamily: "var(--font-mono)" }}>
                UM · CCE · Staff
              </div>
            </div>
          </div>

          <h1 className="mt-6" style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.3 }}>
            Staff sign in
          </h1>
          <p className="mt-1" style={{ fontSize: 12.5, color: "#57606a" }}>
            For Administrators, Laboratory Custodians, and Laboratory Assistants.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="identifier" className="text-xs">School ID or Email</Label>
              <Input
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="admin@labtrack.local"
                className="h-9 text-[13px]"
                autoComplete="username"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-9 text-[13px]"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-[12px]" style={{ color: "#cf222e" }}>
                {error}
              </p>
            )}

            <Button type="submit" disabled={isSubmitting} className="w-full h-9" style={{ background: MAROON, color: "white" }}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <div className="mt-6 pt-4" style={{ borderTop: "1px solid #e1e4e8" }}>
            <Link
              to="/student-login"
              className="inline-flex items-center gap-1.5 text-[12.5px]"
              style={{ color: MAROON, fontWeight: 500 }}
            >
              Student check-in <ArrowRight className="size-3.5" />
            </Link>
            <p className="mt-1 font-mono text-[10.5px]" style={{ color: "#57606a" }}>
              Kiosk shown on the lab workstation itself.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}